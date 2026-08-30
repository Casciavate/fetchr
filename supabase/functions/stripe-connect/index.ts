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

// ── fetchr two-sided pricing model ──
// KEEP IN SYNC WITH src/lib/fees.js's calcFees. This edge function can't
// import from src/, so this is a hand-kept, structurally identical mirror
// of that file. If you change the formula there, change it here too —
// same constants, same order of operations, same field names on the
// returned object.
const MINIMUM_DEAL_SIZE = 15.00
const REVENUE_FLOOR = 8.00
const SHIPPER_SERVICE_FEE_PCT = 0.15
const TRAVELER_PLATFORM_FEE_PCT = 0.05
const SOURCING_FEE_PCT = 0.06

// Mirrors src/lib/fees.js's resolveOptionPrice — resolves the price/kg for
// the specific luggage tranche (hand vs. check-in) the match was made
// against, falling back to the flight's flat price_per_kg for legacy
// single-tranche flights (match.luggage_type is null).
const resolveOptionPrice = (flight, luggageType) => {
  if (luggageType && Array.isArray(flight?.luggage_options)) {
    const opt = flight.luggage_options.find((o) => o.type === luggageType)
    if (opt && opt.price_per_kg != null) return opt.price_per_kg
  }
  return flight?.price_per_kg
}

const calcFees = (match) => {
  const pricePerKg = parseFloat(match.agreed_price_per_kg ?? resolveOptionPrice(match.flight, match.luggage_type) ?? 0) || 0
  const weightKg = parseFloat(match.agreed_weight_kg ?? match.request?.weight_kg ?? 0) || 0
  const transportFee = pricePerKg * weightKg

  const isPurchase = !!(match.request?.requires_purchase)
  const shopFee = isPurchase
    ? (parseFloat(match.agreed_shop_fee ?? match.flight?.shop_and_ship_fee ?? 0) || 0)
    : 0
  const purchasePrice = isPurchase ? (parseFloat(match.request?.purchase_price) || 0) : 0

  // Purchase price is never commissionable.
  const commissionBase = transportFee + shopFee

  let shipperServiceFee = commissionBase * SHIPPER_SERVICE_FEE_PCT
  const travelerPlatformFee = commissionBase * TRAVELER_PLATFORM_FEE_PCT
  const sourcingFee = purchasePrice * SOURCING_FEE_PCT

  // Revenue floor: shortfall loaded onto the shipper's service fee only.
  const baseRevenue = shipperServiceFee + travelerPlatformFee + sourcingFee
  let floorApplied = false
  if (baseRevenue > 0 && baseRevenue < REVENUE_FLOOR) {
    shipperServiceFee += (REVENUE_FLOOR - baseRevenue)
    floorApplied = true
  }

  const shipperPays = transportFee + shopFee + purchasePrice + shipperServiceFee + sourcingFee
  const travelerReceives = transportFee + shopFee + purchasePrice - travelerPlatformFee
  const fetchrRevenue = shipperServiceFee + travelerPlatformFee + sourcingFee

  // The invariant this shared formula exists to guarantee — see
  // src/lib/fees.js for the full explanation. Always logged (never
  // thrown) here: an edge function crashing mid-request is worse than a
  // logged inconsistency, and Deno doesn't have a NODE_ENV dev/prod split
  // the way CRA does.
  const invariantDiff = shipperPays - travelerReceives - fetchrRevenue
  if (Math.abs(invariantDiff) > 0.01) {
    console.error(`calcFees invariant violated: shipperPays(${shipperPays.toFixed(2)}) - travelerReceives(${travelerReceives.toFixed(2)}) !== fetchrRevenue(${fetchrRevenue.toFixed(2)}), diff=${invariantDiff.toFixed(4)}`)
  }

  return {
    transportFee, shopFee, purchasePrice, isPurchase,
    commissionBase,
    shipperServiceFee, travelerPlatformFee, sourcingFee,
    floorApplied,
    shipperPays, travelerReceives, fetchrRevenue,
    belowMinimum: commissionBase < MINIMUM_DEAL_SIZE,
  }
}

// High-value deals require both parties to have completed Stripe Identity
// verification first — trust matters more once real money is involved,
// but making this mandatory for every deal (or every user) would be a
// disproportionate privacy burden for a peer-to-peer marketplace. $500
// matches the fee-tier breakpoint already used elsewhere in the app.
const HIGH_VALUE_THRESHOLD = 500

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── Stripe webhook: Connect account status changes. Called by Stripe
  //    itself (authenticated via signature, not a Supabase session), so
  //    this function is deployed with --no-verify-jwt — same reasoning as
  //    stripe-identity's webhook path. ──
  if (url.pathname.endsWith('/webhook')) {
    const signature = req.headers.get('stripe-signature')
    const webhookSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')
    const body = await req.text()
    let event
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
    } catch (err) {
      console.error('Connect webhook signature verification failed:', err.message)
      return new Response(`Webhook Error: ${err.message}`, { status: 400 })
    }

    if (event.type === 'account.updated') {
      const account = event.data.object
      const userId = account.metadata?.supabase_user_id
      if (userId) {
        await adminClient.from('profiles').update({
          stripe_connect_payouts_enabled: !!account.payouts_enabled,
        }).eq('id', userId)
      }
    }

    return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
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

    // The ledger (transactions), not profiles.wallet_balance, is the source
    // of truth: wallet_balance is just a cache. This is what stands between
    // an attacker and free money — without it, anything that trusted
    // profiles.wallet_balance directly would be exploitable the moment that
    // column stops being fully protected (belt-and-braces alongside the DB
    // trigger that now blocks clients from writing it directly).
    const getVerifiedBalance = async (userId) => {
      const [{ data: credits }, { data: debits }, { data: profile }] = await Promise.all([
        adminClient.from('transactions').select('amount').eq('user_id', userId).in('type', ['topup', 'credit', 'escrow_release']).eq('status', 'completed'),
        adminClient.from('transactions').select('amount').eq('user_id', userId).in('type', ['withdrawal', 'debit']).in('status', ['completed', 'pending']),
        adminClient.from('profiles').select('wallet_balance').eq('id', userId).single(),
      ])
      const totalCredits = (credits || []).reduce((sum, t) => sum + (t.amount || 0), 0)
      const totalDebits = (debits || []).reduce((sum, t) => sum + (t.amount || 0), 0)
      const verifiedBalance = Math.max(0, totalCredits - totalDebits)
      const profileBalance = Math.max(0, profile?.wallet_balance || 0)
      return Math.min(verifiedBalance, profileBalance)
    }

    const requireVerifiedForHighValue = async (match, totalDollars) => {
      if (totalDollars < HIGH_VALUE_THRESHOLD) return
      const { data: parties } = await adminClient.from('profiles')
        .select('id, verified, full_name').in('id', [match.traveler_id, match.shipper_id])
      const unverified = (parties || []).filter(p => !p.verified)
      if (unverified.length > 0) {
        const names = unverified.map(p => p.full_name || 'A party').join(' and ')
        throw new Error(
          `This deal is $${totalDollars.toFixed(2)}, above the $${HIGH_VALUE_THRESHOLD} threshold that requires ID verification. ` +
          `${names} still need${unverified.length === 1 ? 's' : ''} to complete identity verification (Profile → Get verified) before escrow can be paid.`
        )
      }
    }

    const verifyWithdrawalEligibility = async (userId, requestedAmount) => {
      const safeBalance = await getVerifiedBalance(userId)
      if (requestedAmount > safeBalance + 0.01) {
        throw new Error(`Withdrawal of $${requestedAmount.toFixed(2)} exceeds verified balance of $${safeBalance.toFixed(2)}.`)
      }
      return safeBalance
    }

    // ── Setup Intent ──
    // ── Stripe Connect: create (idempotently) the Express account a
    //    traveler's earnings get transferred into, so they can eventually
    //    be paid out to a real bank account. Creating the account doesn't
    //    grant payout ability by itself — onboarding does that. ──
    if (action === 'create_connect_account') {
      const { data: profile } = await adminClient.from('profiles')
        .select('stripe_connect_account_id').eq('id', user.id).single()
      if (profile?.stripe_connect_account_id) {
        return new Response(JSON.stringify({ accountId: profile.stripe_connect_account_id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: { transfers: { requested: true } },
        metadata: { supabase_user_id: user.id },
      })
      await adminClient.from('profiles').update({ stripe_connect_account_id: account.id }).eq('id', user.id)
      return new Response(JSON.stringify({ accountId: account.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Stripe-hosted onboarding link (ID + bank account). Short-lived —
    //    generate a fresh one each time rather than caching the URL. ──
    if (action === 'create_connect_onboarding_link') {
      const { data: profile } = await adminClient.from('profiles')
        .select('stripe_connect_account_id').eq('id', user.id).single()
      if (!profile?.stripe_connect_account_id) throw new Error('No Connect account yet — call create_connect_account first')
      const { returnUrl, refreshUrl } = data || {}
      const accountLink = await stripe.accountLinks.create({
        account: profile.stripe_connect_account_id,
        refresh_url: refreshUrl || returnUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      })
      return new Response(JSON.stringify({ url: accountLink.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Re-check status directly with Stripe — the webhook is what keeps
    //    profiles.stripe_connect_payouts_enabled current in normal use, but
    //    the user shouldn't have to wait on webhook latency right after
    //    finishing onboarding and landing back on return_url. ──
    if (action === 'connect_account_status') {
      const { data: profile } = await adminClient.from('profiles')
        .select('stripe_connect_account_id, stripe_connect_payouts_enabled').eq('id', user.id).single()
      if (!profile?.stripe_connect_account_id) {
        return new Response(JSON.stringify({ connected: false, payoutsEnabled: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const account = await stripe.accounts.retrieve(profile.stripe_connect_account_id)
      if (!!account.payouts_enabled !== profile.stripe_connect_payouts_enabled) {
        await adminClient.from('profiles').update({ stripe_connect_payouts_enabled: !!account.payouts_enabled }).eq('id', user.id)
      }
      return new Response(JSON.stringify({ connected: true, payoutsEnabled: !!account.payouts_enabled }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

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
      const { paymentIntentId } = data
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (paymentIntent.status !== 'succeeded') throw new Error(`Payment not completed. Status: ${paymentIntent.status}`)

      // Credit exactly what Stripe actually collected, never a client-
      // supplied `amount` — otherwise anyone could top up $0.50 for real and
      // claim any amount here. Also verify this PI belongs to this user's
      // Stripe customer, and that it hasn't already been credited (calling
      // this twice for the same successful PI would otherwise double it).
      const customerId = await getOrCreateCustomer(user.id, user.email)
      if (paymentIntent.customer !== customerId) throw new Error('Forbidden: payment does not belong to this account')
      const { data: existing } = await adminClient.from('transactions')
        .select('id').eq('type', 'topup').contains('metadata', { payment_intent_id: paymentIntentId }).maybeSingle()
      if (existing) throw new Error('This payment has already been credited')

      const amount = paymentIntent.amount / 100
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

    // ── Withdraw to bank ──
    if (action === 'withdraw_to_bank') {
      const { amount } = data
      if (!amount || amount <= 0) throw new Error('Invalid withdrawal amount')
      const WITHDRAWAL_FEE_PCT = 0.025
      const fee = amount * WITHDRAWAL_FEE_PCT
      const netAmount = amount - fee
      const safeBalance = await verifyWithdrawalEligibility(user.id, amount)

      const { data: profile } = await adminClient.from('profiles')
        .select('stripe_connect_account_id, stripe_connect_payouts_enabled').eq('id', user.id).single()
      if (!profile?.stripe_connect_account_id) throw new Error('Connect your bank via Stripe before withdrawing.')

      // Re-check live with Stripe rather than trusting the cached flag —
      // this is the moment real money actually moves, worth the extra call.
      const account = await stripe.accounts.retrieve(profile.stripe_connect_account_id)
      if (!account.payouts_enabled) throw new Error('Your connected bank account is not ready to receive payouts yet — finish onboarding in Stripe first.')

      // Atomic, race-safe debit BEFORE the transfer: a plain read-then-write
      // of wallet_balance let two concurrent withdrawals both pass the
      // safeBalance check above and both transfer real money out, since the
      // second write just clobbered the first with the same stale snapshot.
      // adjust_wallet_balance does the check-and-decrement in one UPDATE, so
      // Postgres's row lock serializes concurrent calls — the loser gets
      // 'Insufficient wallet balance' here, before any Stripe transfer
      // happens, rather than after.
      const { data: newBalance, error: debitError } = await adminClient
        .rpc('adjust_wallet_balance', { p_user_id: user.id, p_delta: -amount })
      if (debitError) throw new Error(`Withdrawal of $${amount.toFixed(2)} exceeds your available balance.`)

      let transfer
      try {
        transfer = await stripe.transfers.create({
          amount: Math.round(netAmount * 100),
          currency: 'usd',
          destination: profile.stripe_connect_account_id,
          description: `fetchr wallet withdrawal for ${user.email}`,
          metadata: { supabase_user_id: user.id, gross_amount_usd: amount.toString(), fee_usd: fee.toString() },
        })
      } catch (transferError) {
        // The debit already landed but the real transfer didn't — credit
        // it back rather than silently vanishing the user's balance.
        await adminClient.rpc('adjust_wallet_balance', { p_user_id: user.id, p_delta: amount })
        throw transferError
      }

      await adminClient.from('transactions').insert({
        user_id: user.id, type: 'withdrawal', amount,
        description: 'Withdrawal to connected bank account',
        status: 'completed',
        metadata: {
          transfer_id: transfer.id, fee, net: netAmount,
          connect_account_id: profile.stripe_connect_account_id,
          verified_balance_at_withdrawal: safeBalance,
        },
      })
      return new Response(JSON.stringify({
        success: true, newBalance, transferId: transfer.id, netAmount, fee, estimatedArrival: '2-5 business days',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Create escrow payment intent ──
    // Shipper pays: transport + shop fee + item purchase (in dollars)
    // Stripe holds full amount as uncaptured — this is correct escrow behavior
    // Fetchr fee deducted from traveler payout at capture time
    if (action === 'create_payment_intent') {
      const { matchId, currency = 'usd', paymentMethodId, walletContribution = 0 } = data
      if (!matchId) throw new Error('matchId required')

      const { data: match } = await adminClient
        .from('matches').select('*, flight:flights(*), request:shipment_requests(*)')
        .eq('id', matchId).single()
      if (!match) throw new Error('Match not found')

      // Only the shipper pays escrow (CLAUDE.md) — without this check, any
      // authenticated user could pay into (and thereby advance) a deal that
      // isn't theirs. The client no longer gets a say in the amount either:
      // it used to send its own `amount` for the card charge, which meant a
      // malicious client could authorize a token amount while the app still
      // recorded and later released the full deal value from escrow.
      if (user.id !== match.shipper_id) throw new Error('Forbidden: only the sender can pay escrow for this deal')
      if (match.status !== 'terms_agreed') throw new Error('This deal is not ready for escrow payment')

      const fees = calcFees(match)
      if (fees.belowMinimum) {
        throw new Error(`This deal's transport + shop fee total is below fetchr's $${MINIMUM_DEAL_SIZE.toFixed(2)} minimum deal size — escrow can't be paid.`)
      }
      const totalDollars = fees.shipperPays
      const totalCents = Math.round(totalDollars * 100)
      await requireVerifiedForHighValue(match, totalDollars)

      // Deduct wallet contribution if any — checked against the ledger, not
      // the (now-protected, but still worth double-checking) cached balance.
      if (walletContribution > 0) {
        const safeBalance = await getVerifiedBalance(user.id)
        if (walletContribution > safeBalance + 0.01) throw new Error('Insufficient wallet balance')
        const { data: profile } = await adminClient.from('profiles').select('wallet_balance').eq('id', user.id).single()
        await adminClient.from('profiles').update({ wallet_balance: (profile?.wallet_balance || 0) - walletContribution }).eq('id', user.id)
        await adminClient.from('transactions').insert({
          user_id: user.id, type: 'debit', amount: walletContribution,
          description: `Wallet contribution to escrow: ${match.request?.item_name}`,
          match_id: matchId, status: 'completed',
          metadata: { type: 'escrow_wallet_contribution' },
        })
      }

      // Card is charged exactly the remainder — derived server-side, never
      // trusting a client-supplied amount for the actual charge.
      const cardAmountDollars = Math.round((totalDollars - walletContribution) * 100) / 100
      const cardCents = Math.round(cardAmountDollars * 100)
      if (cardCents < 0) throw new Error('Wallet contribution exceeds the deal total')
      if (cardCents > 0 && cardCents < 50) throw new Error('Remaining card amount is below the $0.50 minimum — pay the rest from your wallet instead')

      const customerId = await getOrCreateCustomer(user.id, user.email)
      const piParams: any = {
        amount: cardCents,
        currency,
        customer: customerId,
        capture_method: 'manual', // ESCROW: held until delivery confirmed
        // Full fee-component breakdown, written once at creation time —
        // capture_payment reads this back (via the mirrored escrow_hold
        // transaction below, since a wallet-only escrow has no PaymentIntent
        // at all) instead of ever recomputing, so an amendment made after
        // payment can't desync what was actually charged from what gets
        // released.
        metadata: {
          match_id: matchId,
          shipper_pays: totalDollars.toString(),
          card_amount_usd: cardAmountDollars.toString(),
          wallet_contribution_usd: walletContribution.toString(),
          transport_fee: fees.transportFee.toString(),
          shop_fee: fees.shopFee.toString(),
          purchase_price: fees.purchasePrice.toString(),
          shipper_service_fee: fees.shipperServiceFee.toString(),
          traveler_platform_fee: fees.travelerPlatformFee.toString(),
          sourcing_fee: fees.sourcingFee.toString(),
          fetchr_revenue: fees.fetchrRevenue.toString(),
          traveler_receives: fees.travelerReceives.toString(),
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
          shipper_service_fee: fees.shipperServiceFee,
          traveler_platform_fee: fees.travelerPlatformFee,
          sourcing_fee: fees.sourcingFee,
          fetchr_revenue: fees.fetchrRevenue,
          traveler_receives: fees.travelerReceives,
          traveler_name: travelerProfile?.full_name,
          shipper_name: shipperProfile?.full_name,
          wallet_contribution: walletContribution,
        },
      })

      // Neutral shared-chat message only — no fee breakdown here, since
      // both parties read this thread and each side's own cut is never
      // shown to the other (see the UI-side deal-details views instead).
      await adminClient.from('messages').insert({
        match_id: matchId, sender_id: user.id,
        content: `🔒 ESCROW SECURED: $${totalDollars.toFixed(2)} is now held securely. Both parties can view their own breakdown in the deal details.`,
        is_read: false,
      })

      return new Response(JSON.stringify({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        breakdown: {
          transportFee: fees.transportFee, shopFee: fees.shopFee,
          purchasePrice: fees.purchasePrice,
          shipperServiceFee: fees.shipperServiceFee,
          sourcingFee: fees.sourcingFee,
          shipperPays: totalDollars,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Escrow from wallet only (no card) ──
    if (action === 'escrow_from_wallet') {
      const { matchId } = data
      if (!matchId) throw new Error('matchId required')
      const { data: match } = await adminClient
        .from('matches').select('*, flight:flights(*), request:shipment_requests(*)')
        .eq('id', matchId).single()
      if (!match) throw new Error('Match not found')

      if (user.id !== match.shipper_id) throw new Error('Forbidden: only the sender can pay escrow for this deal')
      if (match.status !== 'terms_agreed') throw new Error('This deal is not ready for escrow payment')

      const fees = calcFees(match)
      if (fees.belowMinimum) {
        throw new Error(`This deal's transport + shop fee total is below fetchr's $${MINIMUM_DEAL_SIZE.toFixed(2)} minimum deal size — escrow can't be paid.`)
      }
      await requireVerifiedForHighValue(match, fees.shipperPays)
      const safeBalance = await getVerifiedBalance(user.id)
      if (safeBalance < fees.shipperPays - 0.01) {
        throw new Error(`Insufficient wallet balance. Available: $${safeBalance.toFixed(2)}`)
      }
      const { data: profile } = await adminClient.from('profiles').select('wallet_balance, full_name').eq('id', user.id).single()

      const newBalance = (profile?.wallet_balance || 0) - fees.shipperPays
      await adminClient.from('profiles').update({ wallet_balance: newBalance }).eq('id', user.id)

      const walletEscrowId = `wallet_escrow_${Date.now()}_${matchId.slice(0, 8)}`
      await adminClient.from('matches').update({
        status: 'in_escrow', deal_stage: 'in_escrow',
        payment_intent_id: walletEscrowId,
        escrow_amount: fees.shipperPays,
      }).eq('id', matchId)

      // Identical breakdown shape to the card path (create_payment_intent)
      // — capture_payment reads both the same way, so a wallet-paid and a
      // card-paid escrow must always produce identical numbers.
      const { data: travelerProfile } = await adminClient.from('profiles').select('full_name').eq('id', match.traveler_id).single()
      await adminClient.from('transactions').insert({
        user_id: match.shipper_id, type: 'escrow_hold', amount: fees.shipperPays,
        description: `Escrow held (wallet): ${match.request?.item_name}`,
        match_id: matchId, status: 'pending',
        metadata: {
          payment_method: 'wallet', wallet_escrow_id: walletEscrowId,
          transport_fee: fees.transportFee, shop_fee: fees.shopFee,
          purchase_price: fees.purchasePrice,
          shipper_service_fee: fees.shipperServiceFee,
          traveler_platform_fee: fees.travelerPlatformFee,
          sourcing_fee: fees.sourcingFee,
          fetchr_revenue: fees.fetchrRevenue,
          traveler_receives: fees.travelerReceives,
          traveler_name: travelerProfile?.full_name, shipper_name: profile?.full_name,
        },
      })

      await adminClient.from('messages').insert({
        match_id: matchId, sender_id: user.id,
        content: `🔒 ESCROW SECURED (Wallet): $${fees.shipperPays.toFixed(2)} is now held securely. Both parties can view their own breakdown in the deal details.`,
        is_read: false,
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
      if (!match) throw new Error('Match not found for capture')

      // Only a party to the deal can trigger release, and only once both
      // sides have actually confirmed — this used to be enforced purely by
      // the client waiting to call this action at the "right" time, which
      // meant anyone with a valid token could call it directly (e.g. via
      // curl) the moment escrow was created and release funds before any
      // proof of delivery existed.
      const isTrav = user.id === match.traveler_id
      const isShip = user.id === match.shipper_id
      if (!isTrav && !isShip) throw new Error('Forbidden: not a party to this match')
      const otherAlreadyConfirmed = isTrav ? match.shipper_completed : match.traveler_completed
      if (match.status !== 'proof_uploaded' || !otherAlreadyConfirmed) {
        throw new Error('Delivery cannot be released yet — both parties must confirm delivery first')
      }

      // Atomically flip status, guarded on the expected prior state, so a
      // repeated/replayed call (or a second confirmer racing the first)
      // can't release the same escrow twice — the second call finds no row
      // still in 'proof_uploaded' and aborts before touching Stripe or any
      // wallet balance.
      const { data: transitioned } = await adminClient
        .from('matches')
        .update({ status: 'completed', deal_stage: 'completed', traveler_completed: true, shipper_completed: true })
        .eq('id', matchId).eq('status', 'proof_uploaded')
        .select().maybeSingle()
      if (!transitioned) throw new Error('This deal has already been completed')

      // Check if this is a wallet-only escrow (no Stripe PI)
      const isWalletEscrow = paymentIntentId?.startsWith('wallet_escrow_')

      // The amount released is whatever was actually recorded as held at
      // escrow-creation time (the escrow_hold transaction), never a fresh
      // calcFees(match) — match.agreed_price_per_kg etc. are editable by
      // either party via the client SDK, so recomputing here would let a
      // shipper quietly lower the price after the real charge went through
      // and have the difference simply vanish (or a traveler inflate it).
      const { data: escrowTx } = await adminClient.from('transactions')
        .select('metadata').eq('match_id', matchId).eq('type', 'escrow_hold').eq('status', 'pending').maybeSingle()
      if (!escrowTx?.metadata) throw new Error('No pending escrow found for this match')
      const fees = {
        transportFee: Number(escrowTx.metadata.transport_fee) || 0,
        shopFee: Number(escrowTx.metadata.shop_fee) || 0,
        purchasePrice: Number(escrowTx.metadata.purchase_price) || 0,
        shipperServiceFee: Number(escrowTx.metadata.shipper_service_fee) || 0,
        travelerPlatformFee: Number(escrowTx.metadata.traveler_platform_fee) || 0,
        sourcingFee: Number(escrowTx.metadata.sourcing_fee) || 0,
        fetchrRevenue: Number(escrowTx.metadata.fetchr_revenue) || 0,
        travelerReceives: Number(escrowTx.metadata.traveler_receives) || 0,
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

      // Two rows: the traveler's payout, and fetchr's FULL revenue in one
      // row (shipper service fee + traveler platform fee + sourcing fee
      // combined) — not just one side's fee, per the two-sided model.
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
            traveler_platform_fee_deducted: fees.travelerPlatformFee,
            shipper_name: shipperProfile?.full_name,
            shipper_id: match.shipper_id,
            traveler_name: travelerProfile?.full_name,
            breakdown: `Transport $${fees.transportFee.toFixed(2)} + Shop fee $${fees.shopFee.toFixed(2)} + Purchase $${fees.purchasePrice.toFixed(2)} - Platform fee $${fees.travelerPlatformFee.toFixed(2)}`,
          },
        },
        {
          user_id: match.shipper_id, type: 'fetchr_revenue',
          amount: fees.fetchrRevenue,
          description: `Fetchr revenue: ${match.request?.item_name}`,
          match_id: match.id, status: 'completed',
          metadata: {
            payment_intent_id: paymentIntentId,
            shipper_service_fee: fees.shipperServiceFee,
            traveler_platform_fee: fees.travelerPlatformFee,
            sourcing_fee: fees.sourcingFee,
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
        fetchrRevenue: fees.fetchrRevenue,
        breakdown: {
          transportFee: fees.transportFee, shopFee: fees.shopFee,
          purchasePrice: fees.purchasePrice,
          travelerPlatformFee: fees.travelerPlatformFee,
          travelerReceives: fees.travelerReceives,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Cancel escrow ──
    if (action === 'cancel_payment') {
      const { paymentIntentId, matchId } = data
      if (!matchId) throw new Error('matchId required')
      const { data: callerMatch } = await adminClient.from('matches').select('traveler_id, shipper_id').eq('id', matchId).maybeSingle()
      if (!callerMatch || (user.id !== callerMatch.traveler_id && user.id !== callerMatch.shipper_id)) {
        throw new Error('Forbidden: not a party to this match')
      }
      // Being a party to the match isn't consent — without this check either
      // side could cancel/refund escrow unilaterally at any time by calling
      // this action directly, bypassing the cancellation_requests flow the
      // UI implies entirely. A pending request not authored by the caller
      // means the caller is the counterpart actually agreeing to someone
      // else's request, which is the only legitimate way to reach this.
      const { data: pendingCancelReq } = await adminClient.from('cancellation_requests')
        .select('id, requested_by').eq('match_id', matchId).eq('status', 'pending').maybeSingle()
      if (!pendingCancelReq || pendingCancelReq.requested_by === user.id) {
        throw new Error('Forbidden: cancellation must be agreed to by the other party first')
      }
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