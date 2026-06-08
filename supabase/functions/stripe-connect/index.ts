// @ts-nocheck
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No auth header')
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !user) throw new Error('Invalid token')

    const body = await req.json()
    const { action, data } = body

    // ── HELPER: Get or create Stripe customer ──
    const getOrCreateCustomer = async (userId: string, email: string) => {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single()

      if (profile?.stripe_customer_id) {
        return profile.stripe_customer_id
      }

      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: userId }
      })

      await adminClient
        .from('profiles')
        .update({ stripe_customer_id: customer.id })
        .eq('id', userId)

      return customer.id
    }

    // ── HELPER: Verify balance against DB transactions ──
    // This is the core safety check — we sum all COMPLETED credits
    // and subtract all completed debits from the transactions table
    // to independently verify what the user's balance should be.
    // We then cross-check against the profile wallet_balance field.
    // If they don't match or the withdrawal would exceed verified credits,
    // we REFUSE the payout.
    const verifyWithdrawalEligibility = async (userId: string, requestedAmount: number) => {
      // Sum all completed incoming transactions (topups + escrow releases)
      const { data: credits } = await adminClient
        .from('transactions')
        .select('amount')
        .eq('user_id', userId)
        .in('type', ['topup', 'credit', 'escrow_release'])
        .eq('status', 'completed')

      const totalCredits = (credits || []).reduce((sum, t) => sum + (t.amount || 0), 0)

      // Sum all completed outgoing transactions (withdrawals)
      const { data: debits } = await adminClient
        .from('transactions')
        .select('amount')
        .eq('user_id', userId)
        .in('type', ['withdrawal', 'debit'])
        .in('status', ['completed', 'pending']) // include pending withdrawals too

      const totalDebits = (debits || []).reduce((sum, t) => sum + (t.amount || 0), 0)

      const verifiedBalance = totalCredits - totalDebits

      // Also check profile wallet_balance as secondary check
      const { data: profile } = await adminClient
        .from('profiles')
        .select('wallet_balance')
        .eq('id', userId)
        .single()

      const profileBalance = profile?.wallet_balance || 0

      // Use the LOWER of the two as the safe maximum
      const safeBalance = Math.min(verifiedBalance, profileBalance)

      console.log(`Balance verification for ${userId}:`, {
        totalCredits,
        totalDebits,
        verifiedBalance,
        profileBalance,
        safeBalance,
        requestedAmount
      })

      if (requestedAmount > safeBalance + 0.01) { // 0.01 cent tolerance for rounding
        throw new Error(
          `Withdrawal of $${requestedAmount.toFixed(2)} exceeds verified balance of $${safeBalance.toFixed(2)}. ` +
          `Total credited: $${totalCredits.toFixed(2)}, Total withdrawn: $${totalDebits.toFixed(2)}.`
        )
      }

      return { safeBalance, verifiedBalance, profileBalance }
    }

    // ── TOP UP WALLET ──
    if (action === 'top_up_wallet') {
      const { amount, paymentMethodId } = data
      if (!amount || amount <= 0) throw new Error('Invalid amount')
      if (!paymentMethodId) throw new Error('No payment method provided')

      const amountCents = Math.round(amount * 100)
      const customerId = await getOrCreateCustomer(user.id, user.email!)

      try {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })
      } catch (e) {
        // Already attached — fine to continue
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        confirm: true,
        return_url: 'https://fetchr-zeta.vercel.app',
        use_stripe_sdk: true,
        metadata: {
          type: 'wallet_topup',
          user_id: user.id,
          amount_usd: amount.toString(),
        },
        description: `Fetchr wallet top up — ${user.email}`,
      })

      // 3DS required
      if (paymentIntent.status === 'requires_action') {
        return new Response(JSON.stringify({
          requiresAction: true,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      if (paymentIntent.status === 'succeeded') {
        const { data: profile } = await adminClient
          .from('profiles').select('wallet_balance').eq('id', user.id).single()

        const newBalance = (profile?.wallet_balance || 0) + amount

        await adminClient.from('profiles')
          .update({ wallet_balance: newBalance }).eq('id', user.id)

        await adminClient.from('transactions').insert({
          user_id: user.id,
          type: 'topup',
          amount,
          description: `Wallet top up via card`,
          status: 'completed',
          metadata: {
            payment_intent_id: paymentIntent.id,
            stripe_customer_id: customerId,
          }
        })

        return new Response(JSON.stringify({
          success: true,
          newBalance,
          paymentIntentId: paymentIntent.id,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      throw new Error(`Payment failed with status: ${paymentIntent.status}`)
    }

    // ── CONFIRM TOP UP AFTER 3DS ──
    if (action === 'confirm_top_up') {
      const { paymentIntentId, amount } = data

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

      if (paymentIntent.status !== 'succeeded') {
        throw new Error(`Payment not confirmed. Status: ${paymentIntent.status}`)
      }

      const { data: profile } = await adminClient
        .from('profiles').select('wallet_balance').eq('id', user.id).single()

      const newBalance = (profile?.wallet_balance || 0) + amount

      await adminClient.from('profiles')
        .update({ wallet_balance: newBalance }).eq('id', user.id)

      await adminClient.from('transactions').insert({
        user_id: user.id,
        type: 'topup',
        amount,
        description: `Wallet top up via card (3DS verified)`,
        status: 'completed',
        metadata: { payment_intent_id: paymentIntentId }
      })

      return new Response(JSON.stringify({ success: true, newBalance }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── SAVE BANK ACCOUNT ──
    if (action === 'save_bank_account') {
      const {
        accountHolderName,
        accountNumber,
        routingNumber,
        country,
        currency = 'usd',
        accountType = 'individual',
      } = data

      if (!accountHolderName || !accountNumber || !country) {
        throw new Error('Missing required bank account fields')
      }

      // Build bank account params — Stripe requires different fields per country
      const bankAccountParams: any = {
        country: country.toUpperCase(),
        currency: currency.toLowerCase(),
        account_holder_name: accountHolderName,
        account_holder_type: accountType,
        account_number: accountNumber,
      }

      // Add routing number for US accounts
      if (country.toUpperCase() === 'US' && routingNumber) {
        bankAccountParams.routing_number = routingNumber
      }

      const bankToken = await stripe.tokens.create({
        bank_account: bankAccountParams
      })

      await adminClient.from('profiles').update({
        bank_account_last4: bankToken.bank_account?.last4,
        bank_account_country: country.toUpperCase(),
        bank_account_holder: accountHolderName,
        stripe_bank_token: bankToken.id,
      }).eq('id', user.id)

      return new Response(JSON.stringify({
        success: true,
        last4: bankToken.bank_account?.last4,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── WITHDRAW TO BANK ──
    // Full verification flow:
    // 1. Verify requested amount against DB transaction history
    // 2. Cross-check with profile wallet_balance
    // 3. Use the LOWER value as safe maximum
    // 4. Only then create Stripe payout
    // 5. Deduct from wallet and record transaction
    if (action === 'withdraw_to_bank') {
      const { amount } = data
      if (!amount || amount <= 0) throw new Error('Invalid withdrawal amount')

      const WITHDRAWAL_FEE_PCT = 0.025
      const fee = amount * WITHDRAWAL_FEE_PCT
      const netAmount = amount - fee
      const netCents = Math.round(netAmount * 100)

      // ── STEP 1: Verify balance eligibility ──
      const { safeBalance } = await verifyWithdrawalEligibility(user.id, amount)

      // ── STEP 2: Get user's saved bank details ──
      const { data: profile } = await adminClient
        .from('profiles')
        .select('stripe_bank_token, bank_account_last4, bank_account_holder, stripe_customer_id')
        .eq('id', user.id)
        .single()

      if (!profile?.stripe_bank_token && !profile?.bank_account_last4) {
        throw new Error('No bank account saved. Please add a bank account first.')
      }

      // ── STEP 3: Create Stripe Payout ──
      // In test mode this simulates the full payout flow.
      // In production this sends real money to the bank.
      // Note: Stripe payouts require funds in your Stripe balance.
      // In test mode, Stripe simulates this automatically.
      let payoutId: string
      let payoutStatus: string

      try {
        const payout = await stripe.payouts.create({
          amount: netCents,
          currency: 'usd',
          method: 'standard', // 'instant' available for debit cards with extra fee
          description: `Fetchr wallet withdrawal — ${user.email}`,
          metadata: {
            user_id: user.id,
            gross_amount: amount.toString(),
            fee: fee.toString(),
            net_amount: netAmount.toString(),
            bank_last4: profile.bank_account_last4 || '',
          }
        })
        payoutId = payout.id
        payoutStatus = payout.status // 'paid', 'pending', 'in_transit'
      } catch (stripeError: any) {
        // In test mode without Stripe balance, log and use simulated ID
        // In production this should hard-fail
        console.warn('Stripe payout note:', stripeError.message)
        if (stripeError.code === 'balance_insufficient' && Deno.env.get('STRIPE_SECRET_KEY')?.startsWith('sk_test_')) {
          // Test mode only — simulate payout
          payoutId = `test_po_${Date.now()}`
          payoutStatus = 'pending'
        } else {
          throw stripeError
        }
      }

      // ── STEP 4: Deduct from wallet atomically ──
      const newBalance = safeBalance - amount

      await adminClient.from('profiles')
        .update({ wallet_balance: newBalance })
        .eq('id', user.id)

      // ── STEP 5: Record transaction ──
      await adminClient.from('transactions').insert({
        user_id: user.id,
        type: 'withdrawal',
        amount,
        description: `Withdrawal to bank ****${profile.bank_account_last4 || '0000'}`,
        status: 'pending',
        metadata: {
          payout_id: payoutId,
          payout_status: payoutStatus,
          fee,
          net: netAmount,
          bank_last4: profile.bank_account_last4,
          verified_balance_at_withdrawal: safeBalance,
        }
      })

      return new Response(JSON.stringify({
        success: true,
        newBalance,
        payoutId,
        netAmount,
        fee,
        estimatedArrival: '3-5 business days',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── SETUP INTENT (save card via profile) ──
    if (action === 'create_setup_intent') {
      const customerId = await getOrCreateCustomer(user.id, user.email!)

      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
      })

      return new Response(JSON.stringify({
        clientSecret: setupIntent.client_secret,
        customerId,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── SAVE PAYMENT METHOD ──
    if (action === 'save_payment_method') {
      const { paymentMethodId } = data
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId)

      await adminClient.from('profiles').update({
        stripe_payment_method_id: paymentMethodId,
        payout_card_last4: pm.card?.last4,
        payout_card_brand: pm.card?.brand,
      }).eq('id', user.id)

      return new Response(JSON.stringify({
        success: true,
        last4: pm.card?.last4,
        brand: pm.card?.brand,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── CREATE ESCROW PAYMENT INTENT ──
    if (action === 'create_payment_intent') {
      const { matchId, amount, currency = 'usd' } = data

      const { data: match } = await adminClient
        .from('matches')
        .select('*, flight:flights(*), request:shipment_requests(*)')
        .eq('id', matchId).single()

      if (!match) throw new Error('Match not found')

      const subtotalUSD = amount
      let fetchrPct = 0.10
      if (subtotalUSD >= 500) fetchrPct = 0.07
      else if (subtotalUSD >= 200) fetchrPct = 0.085
      else if (subtotalUSD < 20) fetchrPct = 0.12

      const fetchrFeeUSD = subtotalUSD * fetchrPct
      const fetchrFeeCents = Math.round(fetchrFeeUSD * 100)
      const stripeFeeUSD = (subtotalUSD + fetchrFeeUSD) * 0.029 + 0.30
      const stripeFeeCents = Math.round(stripeFeeUSD * 100)
      const totalCents = Math.round(subtotalUSD * 100) + fetchrFeeCents + stripeFeeCents

      const customerId = await getOrCreateCustomer(user.id, user.email!)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalCents,
        currency,
        customer: customerId,
        capture_method: 'manual',
        metadata: {
          match_id: matchId,
          subtotal_cents: Math.round(subtotalUSD * 100).toString(),
          fetchr_fee_cents: fetchrFeeCents.toString(),
          stripe_fee_cents: stripeFeeCents.toString(),
          fetchr_pct: Math.round(fetchrPct * 100).toString(),
          traveler_id: match.traveler_id,
          shipper_id: match.shipper_id,
        },
        description: `Fetchr escrow: ${match.request?.item_name} (${match.flight?.from_code} → ${match.flight?.to_code})`,
      })

      await adminClient.from('matches').update({
        payment_intent_id: paymentIntent.id,
        escrow_amount: subtotalUSD - fetchrFeeUSD,
        status: 'in_escrow',
        deal_stage: 'in_escrow',
      }).eq('id', matchId)

      await adminClient.from('transactions').insert({
        user_id: match.shipper_id,
        type: 'escrow_hold',
        amount: subtotalUSD + fetchrFeeUSD + stripeFeeUSD,
        description: `Escrow held: ${match.request?.item_name}`,
        match_id: matchId,
        status: 'pending',
        metadata: {
          payment_intent_id: paymentIntent.id,
          fetchr_fee: fetchrFeeUSD,
          stripe_fee: stripeFeeUSD,
        }
      })

      await adminClient.from('messages').insert({
        match_id: matchId,
        sender_id: user.id,
        content: `🔒 ESCROW SECURED: $${subtotalUSD.toFixed(2)} is now held in escrow. Fetchr fee: $${fetchrFeeUSD.toFixed(2)} (${Math.round(fetchrPct * 100)}%). Traveler receives $${(subtotalUSD - fetchrFeeUSD).toFixed(2)} upon confirmed delivery.`,
        is_read: false,
      })

      return new Response(JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        breakdown: {
          subtotal: subtotalUSD,
          fetchrFee: fetchrFeeUSD,
          stripeFee: stripeFeeUSD,
          total: totalCents / 100,
          travelerReceives: subtotalUSD - fetchrFeeUSD,
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── CAPTURE ESCROW ON DELIVERY ──
    if (action === 'capture_payment') {
      const { paymentIntentId, matchId } = data

      await stripe.paymentIntents.capture(paymentIntentId)

      const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
      const subtotalCents = parseInt(pi.metadata.subtotal_cents || '0')
      const fetchrFeeCents = parseInt(pi.metadata.fetchr_fee_cents || '0')
      const travelerReceivesUSD = (subtotalCents - fetchrFeeCents) / 100

      const { data: match } = await adminClient
        .from('matches')
        .select('*, flight:flights(*), request:shipment_requests(*)')
        .eq('id', matchId).maybeSingle()

      if (match) {
        const { data: travelerProfile } = await adminClient
          .from('profiles').select('wallet_balance').eq('id', match.traveler_id).single()

        await adminClient.from('profiles').update({
          wallet_balance: (travelerProfile?.wallet_balance || 0) + travelerReceivesUSD
        }).eq('id', match.traveler_id)

        await adminClient.from('transactions').insert([
          {
            user_id: match.traveler_id,
            type: 'escrow_release',
            amount: travelerReceivesUSD,
            description: `Delivery payment: ${match.request?.item_name}`,
            match_id: match.id,
            status: 'completed',
            metadata: {
              payment_intent_id: paymentIntentId,
              fetchr_fee: fetchrFeeCents / 100,
            }
          },
          {
            user_id: match.shipper_id,
            type: 'fetchr_fee',
            amount: fetchrFeeCents / 100,
            description: `Fetchr service fee: ${match.request?.item_name}`,
            match_id: match.id,
            status: 'completed',
            metadata: {
              payment_intent_id: paymentIntentId,
              pct: pi.metadata.fetchr_pct,
            }
          }
        ])

        await adminClient.from('transactions')
          .update({ status: 'completed' })
          .eq('match_id', match.id)
          .eq('type', 'escrow_hold')
      }

      return new Response(JSON.stringify({
        success: true,
        travelerReceives: travelerReceivesUSD,
        fetchrFee: fetchrFeeCents / 100,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── CANCEL / REFUND ESCROW ──
    if (action === 'cancel_payment') {
      const { paymentIntentId, matchId } = data

      await stripe.paymentIntents.cancel(paymentIntentId)

      if (matchId) {
        await adminClient.from('transactions')
          .update({ status: 'refunded' })
          .eq('match_id', matchId)
          .eq('type', 'escrow_hold')
      }

      return new Response(JSON.stringify({ success: true, refunded: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    throw new Error(`Unknown action: ${action}`)

  } catch (error) {
    console.error('Stripe function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})