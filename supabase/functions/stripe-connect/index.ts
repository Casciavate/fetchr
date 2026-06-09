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

// ── Correct fee calculation ──
// Fetchr fee = % of (transport + shop fee) ONLY — NOT on item purchase price
// Shipper pays = transport + shop fee + item purchase
// Traveler receives = transport + shop fee - fetchr fee + item purchase
const calcFees = (match, overrideAmount = null) => {
  const pricePerKg = parseFloat(match.agreed_price_per_kg || match.flight?.price_per_kg || 0)
  const weightKg = parseFloat(match.agreed_weight_kg || match.request?.weight_kg || 0)
  const transportFee = overrideAmount !== null ? overrideAmount : pricePerKg * weightKg

  const isPurchase = !!(match.request?.requires_purchase)
  const purchasePrice = isPurchase ? (parseFloat(match.request?.purchase_price) || 0) : 0
  const shopFee = isPurchase
    ? parseFloat(match.agreed_shop_fee || match.flight?.shop_and_ship_fee || 0)
    : 0

  const fetchrBase = transportFee + shopFee
  let fetchrPct = 0.10
  if (fetchrBase >= 500) fetchrPct = 0.07
  else if (fetchrBase >= 200) fetchrPct = 0.085
  else if (fetchrBase < 20 && fetchrBase > 0) fetchrPct = 0.12
  const fetchrFee = fetchrBase * fetchrPct

  const totalShipperPays = transportFee + shopFee + purchasePrice
  const travelerReceives = transportFee + shopFee - fetchrFee + purchasePrice

  return { transportFee, shopFee, purchasePrice, fetchrBase, fetchrFee, fetchrPct, totalShipperPays, travelerReceives, isPurchase }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No auth header')
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !user) throw new Error('Invalid or expired token')

    const body = await req.json()
    const { action, data } = body

    const getOrCreateCustomer = async (userId, email) => {
      const { data: profile } = await adminClient
        .from('profiles').select('stripe_customer_id').eq('id', userId).single()
      if (profile?.stripe_customer_id) return profile.stripe_customer_id
      const customer = await stripe.customers.create({ email, metadata: { supabase_user_id: userId } })
      await adminClient.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', userId)
      return customer.id
    }

    const verifyWithdrawalEligibility = async (userId, requestedAmount) => {
      const [{ data: credits }, { data: debits }, { data: profile }] = await Promise.all([
        adminClient.from('transactions').select('amount').eq('user_id', userId).in('type', ['topup', 'credit', 'escrow_release']).eq('status', 'completed'),
        adminClient.from('transactions').select('amount').eq('user_id', userId).in('type', ['withdrawal', 'debit']).in('status', ['completed', 'pending']),
        adminClient.from('profiles').select('wallet_balance').eq('id', userId).single(),
      ])
      const totalCredits = (credits || []).reduce((sum, t) => sum + (t.amount || 0), 0)
      const totalDebits = (debits || []).reduce((sum, t) => sum + (t.amount || 0), 0)
      const verifiedBalance = Math.max(0, totalCredits - totalDebits)
      const profileBalance = Math.max(0, profile?.wallet_balance || 0)
      const safeBalance = Math.min(verifiedBalance, profileBalance)
      if (requestedAmount > safeBalance + 0.01) {
        throw new Error(`Withdrawal of $${requestedAmount.toFixed(2)} exceeds verified balance of $${safeBalance.toFixed(2)}.`)
      }
      return safeBalance
    }

    // ── Setup Intent ──
    if (action === 'create_setup_intent') {
      const customerId = await getOrCreateCustomer(user.id, user.email)
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId, payment_method_types: ['card'], usage: 'off_session',
      })
      return new Response(JSON.stringify({ clientSecret: setupIntent.client_secret, customerId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Save payment method ──
    if (action === 'save_payment_method') {
      const { paymentMethodId } = data
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
      await adminClient.from('profiles').update({
        stripe_payment_method_id: paymentMethodId,
        payout_card_last4: pm.card?.last4,
        payout_card_brand: pm.card?.brand,
      }).eq('id', user.id)
      return new Response(JSON.stringify({ success: true, last4: pm.card?.last4, brand: pm.card?.brand }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Wallet top up ──
    if (action === 'top_up_wallet') {
      const { amount, paymentMethodId } = data
      if (!amount || amount <= 0) throw new Error('Invalid amount')
      if (!paymentMethodId) throw new Error('No payment method provided')
      const amountCents = Math.round(amount * 100)
      const customerId = await getOrCreateCustomer(user.id, user.email)
      try { await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId }) } catch (e) {}
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents, currency: 'usd', customer: customerId,
        payment_method: paymentMethodId, confirm: true,
        return_url: 'https://fetchr-zeta.vercel.app', use_stripe_sdk: true,
        metadata: { type: 'wallet_topup', user_id: user.id, amount_usd: amount.toString() },
        description: `Fetchr wallet top up — ${user.email}`,
      })
      if (paymentIntent.status === 'requires_action') {
        return new Response(JSON.stringify({ requiresAction: true, clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (paymentIntent.status === 'succeeded') {
        const { data: profile } = await adminClient.from('profiles').select('wallet_balance').eq('id', user.id).single()
        const newBalance = (profile?.wallet_balance || 0) + amount
        await adminClient.from('profiles').update({ wallet_balance: newBalance }).eq('id', user.id)
        await adminClient.from('transactions').insert({
          user_id: user.id, type: 'topup', amount,
          description: 'Wallet top up via card', status: 'completed',
          metadata: { payment_intent_id: paymentIntent.id },
        })
        return new Response(JSON.stringify({ success: true, newBalance, paymentIntentId: paymentIntent.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      throw new Error(`Payment failed: ${paymentIntent.status}`)
    }

    // ── Create topup intent ──
    if (action === 'create_topup_intent') {
      const { amount, paymentMethodId } = data
      if (!amount || amount <= 0) throw new Error('Invalid amount')
      const amountCents = Math.round(amount * 100)
      const customerId = await getOrCreateCustomer(user.id, user.email)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents, currency: 'usd', customer: customerId,
        payment_method: paymentMethodId,
        metadata: { type: 'wallet_topup', user_id: user.id, amount_usd: amount.toString() },
        description: `Fetchr wallet top up (saved card) — ${user.email}`,
      })
      return new Response(JSON.stringify({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Confirm top up ──
    if (action === 'confirm_top_up') {
      const { paymentIntentId, amount } = data
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (paymentIntent.status !== 'succeeded') throw new Error(`Payment not completed. Status: ${paymentIntent.status}`)
      const { data: profile } = await adminClient.from('profiles').select('wallet_balance').eq('id', user.id).single()
      const newBalance = (profile?.wallet_balance || 0) + amount
      await adminClient.from('profiles').update({ wallet_balance: newBalance }).eq('id', user.id)
      await adminClient.from('transactions').insert({
        user_id: user.id, type: 'topup', amount, description: 'Wallet top up via card',
        status: 'completed', metadata: { payment_intent_id: paymentIntentId },
      })
      return new Response(JSON.stringify({ success: true, newBalance }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Save bank account ──
    if (action === 'save_bank_account') {
      const { accountHolderName, accountNumber, routingNumber, country, currency = 'usd' } = data
      if (!accountHolderName || !accountNumber || !country) throw new Error('Missing required bank account fields')
      const bankAccountParams: any = {
        country: country.toUpperCase(), currency: currency.toLowerCase(),
        account_holder_name: accountHolderName, account_holder_type: 'individual', account_number: accountNumber,
      }
      if (country.toUpperCase() === 'US' && routingNumber) bankAccountParams.routing_number = routingNumber
      const bankToken = await stripe.tokens.create({ bank_account: bankAccountParams })
      await adminClient.from('profiles').update({
        bank_account_last4: bankToken.bank_account?.last4,
        bank_account_country: country.toUpperCase(),
        bank_account_holder: accountHolderName,
        stripe_bank_token: bankToken.id,
      }).eq('id', user.id)
      return new Response(JSON.stringify({ success: true, last4: bankToken.bank_account?.last4 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Withdraw to bank ──
    if (action === 'withdraw_to_bank') {
      const { amount } = data
      if (!amount || amount <= 0) throw new Error('Invalid withdrawal amount')
      const WITHDRAWAL_FEE_PCT = 0.025
      const fee = amount * WITHDRAWAL_FEE_PCT
      const netAmount = amount - fee
      const safeBalance = await verifyWithdrawalEligibility(user.id, amount)
      const { data: profile } = await adminClient.from('profiles')
        .select('bank_account_last4, bank_account_holder').eq('id', user.id).single()
      if (!profile?.bank_account_last4) throw new Error('No bank account saved.')
      const payoutId = `withdrawal_${Date.now()}_${user.id.slice(0, 8)}`
      const newBalance = safeBalance - amount
      await adminClient.from('profiles').update({ wallet_balance: newBalance }).eq('id', user.id)
      await adminClient.from('transactions').insert({
        user_id: user.id, type: 'withdrawal', amount,
        description: `Withdrawal to bank ****${profile.bank_account_last4}`,
        status: 'pending',
        metadata: {
          payout_id: payoutId, fee, net: netAmount,
          bank_last4: profile.bank_account_last4,
          verified_balance_at_withdrawal: safeBalance,
          note: 'Payout processed on go-live with verified Stripe account. For test mode, this is simulated.',
        },
      })
      return new Response(JSON.stringify({
        success: true, newBalance, payoutId, netAmount, fee, estimatedArrival: '3-5 business days',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Create escrow payment intent ──
    // Shipper pays: transport + shop fee + item purchase (in dollars)
    // Stripe holds full amount as uncaptured — this is correct escrow behavior
    // Fetchr fee deducted from traveler payout at capture time
    if (action === 'create_payment_intent') {
      const { matchId, amount, currency = 'usd', paymentMethodId, walletContribution = 0 } = data
      if (!matchId) throw new Error('matchId required')
      if (!amount || amount <= 0) throw new Error('Invalid amount')

      const { data: match } = await adminClient
        .from('matches').select('*, flight:flights(*), request:shipment_requests(*)')
        .eq('id', matchId).single()
      if (!match) throw new Error('Match not found')

      const fees = calcFees(match)

      // amount = card portion (may be less than total if wallet contribution)
      const cardAmountDollars = amount
      const totalDollars = fees.totalShipperPays
      const totalCents = Math.round(totalDollars * 100)
      const cardCents = Math.round(cardAmountDollars * 100)

      // Deduct wallet contribution if any
      if (walletContribution > 0) {
        const { data: profile } = await adminClient.from('profiles').select('wallet_balance').eq('id', user.id).single()
        const currentBalance = profile?.wallet_balance || 0
        if (walletContribution > currentBalance + 0.01) throw new Error('Insufficient wallet balance')
        await adminClient.from('profiles').update({ wallet_balance: currentBalance - walletContribution }).eq('id', user.id)
        await adminClient.from('transactions').insert({
          user_id: user.id, type: 'debit', amount: walletContribution,
          description: `Wallet contribution to escrow: ${match.request?.item_name}`,
          match_id: matchId, status: 'completed',
          metadata: { type: 'escrow_wallet_contribution' },
        })
      }

      const customerId = await getOrCreateCustomer(user.id, user.email)
      const piParams: any = {
        amount: cardCents,
        currency,
        customer: customerId,
        capture_method: 'manual', // ESCROW: held until delivery confirmed
        metadata: {
          match_id: matchId,
          total_usd: totalDollars.toString(),
          card_amount_usd: cardAmountDollars.toString(),
          wallet_contribution_usd: walletContribution.toString(),
          transport_fee_usd: fees.transportFee.toString(),
          shop_fee_usd: fees.shopFee.toString(),
          purchase_price_usd: fees.purchasePrice.toString(),
          fetchr_base_usd: fees.fetchrBase.toString(),
          fetchr_fee_usd: fees.fetchrFee.toString(),
          fetchr_pct: Math.round(fees.fetchrPct * 100).toString(),
          traveler_receives_usd: fees.travelerReceives.toString(),
          traveler_id: match.traveler_id,
          shipper_id: match.shipper_id,
        },
        description: `Fetchr escrow: ${match.request?.item_name} (${match.flight?.from_code} → ${match.flight?.to_code})`,
      }
      if (paymentMethodId) {
        try { await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId }) } catch (e) {}
        piParams.payment_method = paymentMethodId
      }

      const paymentIntent = await stripe.paymentIntents.create(piParams)

      // Advance match to in_escrow and save payment_intent_id
      await adminClient.from('matches').update({
        status: 'in_escrow', deal_stage: 'in_escrow',
        payment_intent_id: paymentIntent.id,
        escrow_amount: totalDollars,
      }).eq('id', matchId)

      // Record transaction with full detail
      const { data: travelerProfile } = await adminClient.from('profiles').select('full_name').eq('id', match.traveler_id).single()
      const { data: shipperProfile } = await adminClient.from('profiles').select('full_name').eq('id', match.shipper_id).single()

      await adminClient.from('transactions').insert({
        user_id: match.shipper_id, type: 'escrow_hold', amount: totalDollars,
        description: `Escrow held: ${match.request?.item_name} (${match.flight?.from_code} → ${match.flight?.to_code})`,
        match_id: matchId, status: 'pending',
        metadata: {
          payment_intent_id: paymentIntent.id,
          transport_fee: fees.transportFee,
          shop_fee: fees.shopFee,
          purchase_price: fees.purchasePrice,
          fetchr_fee: fees.fetchrFee,
          traveler_receives: fees.travelerReceives,
          traveler_name: travelerProfile?.full_name,
          shipper_name: shipperProfile?.full_name,
          wallet_contribution: walletContribution,
        },
      })

      // Post correct escrow message to chat
      const escrowMsgLines = [
        `🔒 ESCROW SECURED: $${totalDollars.toFixed(2)} is now held securely.`,
        ``,
        `Transport: $${fees.transportFee.toFixed(2)}`,
        fees.isPurchase && fees.shopFee > 0 ? `Shop & ship fee: $${fees.shopFee.toFixed(2)}` : null,
        fees.isPurchase && fees.purchasePrice > 0 ? `Item purchase: $${fees.purchasePrice.toFixed(2)}` : null,
        `Fetchr fee (${Math.round(fees.fetchrPct * 100)}% on $${fees.fetchrBase.toFixed(2)}): −$${fees.fetchrFee.toFixed(2)}`,
        ``,
        `Traveler receives on delivery: $${fees.travelerReceives.toFixed(2)}`,
      ].filter(l => l !== null).join('\n')

      await adminClient.from('messages').insert({
        match_id: matchId, sender_id: user.id, content: escrowMsgLines, is_read: false,
      })

      return new Response(JSON.stringify({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        breakdown: {
          transportFee: fees.transportFee, shopFee: fees.shopFee,
          purchasePrice: fees.purchasePrice, fetchrFee: fees.fetchrFee,
          travelerReceives: fees.travelerReceives, total: totalDollars,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Escrow from wallet only (no card) ──
    if (action === 'escrow_from_wallet') {
      const { matchId, amount } = data
      if (!matchId) throw new Error('matchId required')
      const { data: match } = await adminClient
        .from('matches').select('*, flight:flights(*), request:shipment_requests(*)')
        .eq('id', matchId).single()
      if (!match) throw new Error('Match not found')

      const fees = calcFees(match)
      const { data: profile } = await adminClient.from('profiles').select('wallet_balance, full_name').eq('id', user.id).single()
      if ((profile?.wallet_balance || 0) < fees.totalShipperPays - 0.01) {
        throw new Error(`Insufficient wallet balance. Available: $${(profile?.wallet_balance || 0).toFixed(2)}`)
      }

      const newBalance = (profile?.wallet_balance || 0) - fees.totalShipperPays
      await adminClient.from('profiles').update({ wallet_balance: newBalance }).eq('id', user.id)

      const walletEscrowId = `wallet_escrow_${Date.now()}_${matchId.slice(0, 8)}`
      await adminClient.from('matches').update({
        status: 'in_escrow', deal_stage: 'in_escrow',
        payment_intent_id: walletEscrowId,
        escrow_amount: fees.totalShipperPays,
      }).eq('id', matchId)

      const { data: travelerProfile } = await adminClient.from('profiles').select('full_name').eq('id', match.traveler_id).single()
      await adminClient.from('transactions').insert({
        user_id: match.shipper_id, type: 'escrow_hold', amount: fees.totalShipperPays,
        description: `Escrow held (wallet): ${match.request?.item_name}`,
        match_id: matchId, status: 'pending',
        metadata: {
          payment_method: 'wallet', wallet_escrow_id: walletEscrowId,
          transport_fee: fees.transportFee, shop_fee: fees.shopFee,
          purchase_price: fees.purchasePrice, fetchr_fee: fees.fetchrFee,
          traveler_receives: fees.travelerReceives,
          traveler_name: travelerProfile?.full_name, shipper_name: profile?.full_name,
        },
      })

      const escrowMsgLines = [
        `🔒 ESCROW SECURED (Wallet): $${fees.totalShipperPays.toFixed(2)} is now held securely.`,
        ``,
        `Transport: $${fees.transportFee.toFixed(2)}`,
        fees.isPurchase && fees.shopFee > 0 ? `Shop & ship fee: $${fees.shopFee.toFixed(2)}` : null,
        fees.isPurchase && fees.purchasePrice > 0 ? `Item purchase: $${fees.purchasePrice.toFixed(2)}` : null,
        `Fetchr fee (${Math.round(fees.fetchrPct * 100)}% on $${fees.fetchrBase.toFixed(2)}): −$${fees.fetchrFee.toFixed(2)}`,
        ``,
        `Traveler receives on delivery: $${fees.travelerReceives.toFixed(2)}`,
      ].filter(l => l !== null).join('\n')

      await adminClient.from('messages').insert({
        match_id: matchId, sender_id: user.id, content: escrowMsgLines, is_read: false,
      })

      return new Response(JSON.stringify({ success: true, newBalance }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Capture escrow on delivery confirmed ──
    if (action === 'capture_payment') {
      const { paymentIntentId, matchId } = data

      const { data: match } = await adminClient
        .from('matches').select('*, flight:flights(*), request:shipment_requests(*)')
        .eq('id', matchId).maybeSingle()

      // Check if this is a wallet-only escrow (no Stripe PI)
      const isWalletEscrow = paymentIntentId?.startsWith('wallet_escrow_')

      let fees
      if (match) {
        fees = calcFees(match)
      } else {
        throw new Error('Match not found for capture')
      }

      if (!isWalletEscrow) {
        await stripe.paymentIntents.capture(paymentIntentId)
      }

      // Credit traveler wallet
      const { data: travelerProfile } = await adminClient
        .from('profiles').select('wallet_balance, full_name').eq('id', match.traveler_id).single()
      const { data: shipperProfile } = await adminClient
        .from('profiles').select('full_name').eq('id', match.shipper_id).single()

      await adminClient.from('profiles').update({
        wallet_balance: (travelerProfile?.wallet_balance || 0) + fees.travelerReceives,
      }).eq('id', match.traveler_id)

      // Full transaction detail for traveler
      await adminClient.from('transactions').insert([
        {
          user_id: match.traveler_id, type: 'escrow_release',
          amount: fees.travelerReceives,
          description: `Delivery payment: ${match.request?.item_name} (${match.flight?.from_code} → ${match.flight?.to_code})`,
          match_id: match.id, status: 'completed',
          metadata: {
            payment_intent_id: paymentIntentId,
            transport_fee: fees.transportFee,
            shop_fee: fees.shopFee,
            purchase_price_reimbursement: fees.purchasePrice,
            fetchr_fee_deducted: fees.fetchrFee,
            fetchr_pct: Math.round(fees.fetchrPct * 100),
            shipper_name: shipperProfile?.full_name,
            shipper_id: match.shipper_id,
            traveler_name: travelerProfile?.full_name,
            breakdown: `Transport $${fees.transportFee.toFixed(2)} + Shop fee $${fees.shopFee.toFixed(2)} + Purchase $${fees.purchasePrice.toFixed(2)} - Fetchr fee $${fees.fetchrFee.toFixed(2)}`,
          },
        },
        {
          user_id: match.shipper_id, type: 'fetchr_fee',
          amount: fees.fetchrFee,
          description: `Fetchr service fee: ${match.request?.item_name}`,
          match_id: match.id, status: 'completed',
          metadata: {
            payment_intent_id: paymentIntentId,
            fetchr_pct: Math.round(fees.fetchrPct * 100),
            fetchr_base: fees.fetchrBase,
            traveler_name: travelerProfile?.full_name,
            shipper_name: shipperProfile?.full_name,
          },
        },
      ])

      await adminClient.from('transactions')
        .update({ status: 'completed' })
        .eq('match_id', match.id).eq('type', 'escrow_hold')

      return new Response(JSON.stringify({
        success: true,
        travelerReceives: fees.travelerReceives,
        fetchrFee: fees.fetchrFee,
        breakdown: {
          transportFee: fees.transportFee, shopFee: fees.shopFee,
          purchasePrice: fees.purchasePrice, fetchrFee: fees.fetchrFee,
          travelerReceives: fees.travelerReceives,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Cancel escrow ──
    if (action === 'cancel_payment') {
      const { paymentIntentId, matchId } = data
      const isWalletEscrow = paymentIntentId?.startsWith('wallet_escrow_')

      if (!isWalletEscrow) {
        await stripe.paymentIntents.cancel(paymentIntentId)
      } else {
        // Refund wallet escrow back to shipper
        const { data: match } = await adminClient.from('matches').select('*, request:shipment_requests(*)').eq('id', matchId).maybeSingle()
        if (match) {
          const { data: shipperProfile } = await adminClient.from('profiles').select('wallet_balance').eq('id', match.shipper_id).single()
          const { data: escrowTx } = await adminClient.from('transactions')
            .select('amount').eq('match_id', matchId).eq('type', 'escrow_hold').eq('status', 'pending').maybeSingle()
          if (escrowTx) {
            await adminClient.from('profiles').update({
              wallet_balance: (shipperProfile?.wallet_balance || 0) + escrowTx.amount,
            }).eq('id', match.shipper_id)
            await adminClient.from('transactions').insert({
              user_id: match.shipper_id, type: 'credit', amount: escrowTx.amount,
              description: `Escrow refund: ${match.request?.item_name}`, match_id: matchId, status: 'completed',
              metadata: { refund_type: 'wallet_escrow_cancellation' },
            })
          }
        }
      }

      if (matchId) {
        await adminClient.from('transactions').update({ status: 'refunded' })
          .eq('match_id', matchId).eq('type', 'escrow_hold')
      }
      return new Response(JSON.stringify({ success: true, refunded: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error(`Unknown action: ${action}`)

  } catch (error) {
    console.error('Stripe function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})