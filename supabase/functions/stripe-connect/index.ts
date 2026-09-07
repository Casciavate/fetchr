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

// Mirrors src/lib/fees.js's resolvedIsPurchase — matches.shop_ship_included
// (set only via the explicit Shop & Ship mismatch resolution flow) wins
// when present, else falls back to the request's original ask.
const resolvedIsPurchase = (match) => {
  return match.shop_ship_included != null
    ? !!match.shop_ship_included
    : !!(match.request?.requires_purchase)
}

const calcFees = (match) => {
  const pricePerKg = parseFloat(match.agreed_price_per_kg ?? resolveOptionPrice(match.flight, match.luggage_type) ?? 0) || 0
  const weightKg = parseFloat(match.agreed_weight_kg ?? match.request?.weight_kg ?? 0) || 0
  const transportFee = pricePerKg * weightKg

  const isPurchase = resolvedIsPurchase(match)
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

// ── Dispute auto-resolution ──
// The AI only ever auto-executes a release/refund when BOTH it's
// confident (per the AI's own self-reported confidence) AND the deal is
// small — a wrong call on a $20 carry is a bad experience, a wrong call
// on a $400 Shop & Ship purchase is a real financial loss with no human
// having looked at it first. Anything outside these bounds is escalated
// to the admin console instead, with the AI's analysis attached so a
// human starts from a verdict rather than a cold read.
const AUTO_RESOLVE_MAX_VALUE = 150.00
const AUTO_RESOLVE_MIN_CONFIDENCE = 0.85
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

// Deno's btoa() chokes on very large single calls via the spread-operator
// pattern (stack overflow) — chunk it.
const arrayBufferToBase64 = (buf: ArrayBuffer) => {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)))
  }
  return btoa(binary)
}

const fetchImageAsBase64 = async (url?: string | null) => {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]
    if (!contentType.startsWith('image/')) return null
    const buf = await res.arrayBuffer()
    return { media_type: contentType, data: arrayBufferToBase64(buf) }
  } catch (e) {
    console.error('Failed to fetch image for AI dispute review:', url, e.message)
    return null
  }
}

// Calls Claude (with vision) to weigh a dispute: does the delivery proof
// actually match what the shipper originally asked for? Always returns a
// usable result — including on a missing API key, a failed fetch, or an
// unparseable response — falling back to 'inconclusive' rather than
// throwing, since a broken AI call must escalate to a human, never crash
// the dispute filing itself or silently do nothing with the held escrow.
const callDisputeAI = async ({ requestInfo, proofPhotoUrl, disputeReason, evidencePhotoUrls }: {
  requestInfo: any, proofPhotoUrl?: string | null, disputeReason: string, evidencePhotoUrls: string[],
}) => {
  const fallback = (reasoning: string) => ({ verdict: 'inconclusive', confidence: 0, reasoning })
  if (!ANTHROPIC_API_KEY) return fallback('AI review unavailable (no API key configured) — escalated for human review.')

  const imageBlocks: any[] = []
  const originalPhoto = await fetchImageAsBase64(requestInfo?.item_photo_url)
  if (originalPhoto) {
    imageBlocks.push({ type: 'text', text: 'Original item requested (reference photo):' })
    imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: originalPhoto.media_type, data: originalPhoto.data } })
  }
  const proofPhoto = await fetchImageAsBase64(proofPhotoUrl)
  if (proofPhoto) {
    imageBlocks.push({ type: 'text', text: "Delivery proof photo uploaded by the traveller:" })
    imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: proofPhoto.media_type, data: proofPhoto.data } })
  }
  for (const evidenceUrl of (evidencePhotoUrls || []).slice(0, 3)) {
    const img = await fetchImageAsBase64(evidenceUrl)
    if (img) {
      imageBlocks.push({ type: 'text', text: 'Evidence photo submitted with the dispute:' })
      imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } })
    }
  }

  const prompt = `A fetchr peer-to-peer delivery deal is disputed. Decide whether the escrowed payment should release to the traveller (delivery was legitimate and matches what was requested) or refund to the shipper (delivery didn't match, was missing, or the proof looks fraudulent/insufficient).

Item requested: "${requestInfo?.item_name || 'unknown'}" — ${requestInfo?.description || 'no description'} (category: ${requestInfo?.category || 'unspecified'})
${requestInfo?.requires_purchase ? `This was a Shop & Ship purchase: item cost $${requestInfo?.purchase_price}, to be bought at ${requestInfo?.purchase_store || 'the specified store'}.` : ''}

Dispute reason (from the party who filed it): "${disputeReason}"

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"verdict": "release_to_traveler" | "refund_to_shipper" | "inconclusive", "confidence": 0.0-1.0, "reasoning": "one or two sentences, plain language, suitable to show both parties"}

Use "inconclusive" whenever photos are missing, unclear, or the case genuinely could go either way — do not guess. Only give confidence above 0.85 when the evidence is clear-cut.`

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...imageBlocks] }],
      }),
    })
  } catch (e) {
    console.error('Anthropic API request failed:', e.message)
    return fallback('AI review failed to reach the model — escalated for human review.')
  }
  if (!res.ok) {
    console.error('Anthropic API error:', res.status, await res.text())
    return fallback('AI review failed — escalated for human review.')
  }
  const result = await res.json()
  const text = result.content?.find((b: any) => b.type === 'text')?.text || ''
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text)
    const verdict = ['release_to_traveler', 'refund_to_shipper', 'inconclusive'].includes(parsed.verdict) ? parsed.verdict : 'inconclusive'
    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : 'AI response could not be parsed — escalated for human review.'
    return { verdict, confidence, reasoning }
  } catch (e) {
    console.error('Failed to parse AI dispute verdict:', text)
    return fallback('AI response could not be parsed — escalated for human review.')
  }
}

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
        // The card charge already succeeded on Stripe's side by this point —
        // if the credit itself fails, surface the error rather than telling
        // the client it succeeded while the wallet was never actually
        // credited (this can't be silently retried from here, since a
        // second call would double-credit if the first one had partially
        // succeeded; it needs manual reconciliation against this PI).
        const { data: newBalance, error: creditError } = await adminClient
          .rpc('adjust_wallet_balance', { p_user_id: user.id, p_delta: amount })
        if (creditError) throw new Error(`Payment succeeded but crediting the wallet failed — contact support with payment ${paymentIntent.id}`)
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
      const { data: newBalance, error: creditError } = await adminClient
        .rpc('adjust_wallet_balance', { p_user_id: user.id, p_delta: amount })
      if (creditError) throw new Error(`Payment succeeded but crediting the wallet failed — contact support with payment ${paymentIntentId}`)
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
        // The safeBalance check above reads a snapshot that can go stale
        // under a race (a concurrent debit landing between the read and
        // this decrement) — the atomic RPC is what actually enforces it,
        // so its error can't be ignored without silently charging the card
        // a discounted amount for a wallet contribution that never happened.
        const { error: debitError } = await adminClient
          .rpc('adjust_wallet_balance', { p_user_id: user.id, p_delta: -walletContribution })
        if (debitError) throw new Error('Insufficient wallet balance')
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
      const { data: profile } = await adminClient.from('profiles').select('full_name').eq('id', user.id).single()
      // Atomic check-and-decrement (same as withdraw_to_bank) instead of a
      // read-then-write — two concurrent escrow payments from the same
      // wallet could otherwise both pass the safeBalance check above and
      // both clobber the balance with the same stale snapshot. The RPC's
      // own error is what actually catches that race (the safeBalance
      // check above can't), so it must not be ignored — otherwise a failed
      // decrement still falls through to record escrow as paid and held
      // against a wallet that was never actually debited.
      const { data: newBalance, error: debitError } = await adminClient
        .rpc('adjust_wallet_balance', { p_user_id: user.id, p_delta: -fees.shipperPays })
      if (debitError) throw new Error(`Insufficient wallet balance. Available: $${safeBalance.toFixed(2)}`)

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

    // Shared release mechanics — used by capture_payment's normal
    // delivery-confirmation flow below AND by dispute resolution (AI or
    // admin) releasing to the traveller despite a dispute having been
    // raised. Both need the exact same math: released amount comes from
    // whatever was actually recorded as held at escrow-creation time (the
    // escrow_hold transaction's frozen metadata), never a fresh
    // calcFees(match) — match.agreed_price_per_kg etc. are editable by
    // either party via the client SDK, so recomputing here would let a
    // shipper quietly lower the price after the real charge went through
    // and have the difference simply vanish (or a traveler inflate it).
    const releaseEscrowToTraveler = async (match, paymentIntentId) => {
      const isWalletEscrow = paymentIntentId?.startsWith('wallet_escrow_')
      const { data: escrowTx } = await adminClient.from('transactions')
        .select('metadata').eq('match_id', match.id).eq('type', 'escrow_hold').eq('status', 'pending').maybeSingle()
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

      const { data: travelerProfile } = await adminClient
        .from('profiles').select('full_name').eq('id', match.traveler_id).single()
      const { data: shipperProfile } = await adminClient
        .from('profiles').select('full_name').eq('id', match.shipper_id).single()

      // Atomic increment, not read-then-write (a traveler completing two
      // deals at nearly the same moment could otherwise have one credit
      // silently clobber the other). The caller has already flipped the
      // match's status (guarded so it can't be replayed) before calling
      // this, so a failed credit here can't be silently swallowed and
      // still let the caller record the release as if it succeeded.
      const { error: creditError } = await adminClient
        .rpc('adjust_wallet_balance', { p_user_id: match.traveler_id, p_delta: fees.travelerReceives })
      if (creditError) throw new Error(`Crediting the traveler's wallet failed — contact support for match ${match.id}`)

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

      return {
        travelerReceives: fees.travelerReceives,
        fetchrRevenue: fees.fetchrRevenue,
        breakdown: {
          transportFee: fees.transportFee, shopFee: fees.shopFee,
          purchasePrice: fees.purchasePrice,
          travelerPlatformFee: fees.travelerPlatformFee,
          travelerReceives: fees.travelerReceives,
        },
      }
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
      // Mirrors Messages.jsx's flightHasDeparted — that was previously the
      // ONLY place this was enforced, purely client-side (a disabled
      // button), so a direct call to this action could release escrow
      // before the flight the deal is even conditioned on has happened.
      const today = new Date().toISOString().split('T')[0]
      if (match.flight?.flight_date && match.flight.flight_date > today) {
        throw new Error(`Delivery cannot be confirmed until the flight on ${match.flight.flight_date} has taken place`)
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

      const result = await releaseEscrowToTraveler(match, paymentIntentId)

      return new Response(JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Shared refund mechanics for both cancel paths below — same Stripe/
    // wallet logic, only the authorization check before calling this
    // differs. `match` needs at least id, shipper_id and request (for the
    // description text).
    const refundEscrow = async (match, paymentIntentId) => {
      const isWalletEscrow = paymentIntentId?.startsWith('wallet_escrow_')
      if (!isWalletEscrow) {
        await stripe.paymentIntents.cancel(paymentIntentId)
      } else {
        const { data: escrowTx } = await adminClient.from('transactions')
          .select('amount').eq('match_id', match.id).eq('type', 'escrow_hold').eq('status', 'pending').maybeSingle()
        if (escrowTx) {
          // Don't record a completed refund transaction if the credit
          // itself didn't actually land — the ledger would otherwise say
          // the shipper got their money back while wallet_balance was
          // never incremented, with nothing left to catch the mismatch.
          const { error: creditError } = await adminClient
            .rpc('adjust_wallet_balance', { p_user_id: match.shipper_id, p_delta: escrowTx.amount })
          if (creditError) throw new Error(`Failed to refund wallet for match ${match.id} — contact support`)
          await adminClient.from('transactions').insert({
            user_id: match.shipper_id, type: 'credit', amount: escrowTx.amount,
            description: `Escrow refund: ${match.request?.item_name}`, match_id: match.id, status: 'completed',
            metadata: { refund_type: 'wallet_escrow_cancellation' },
          })
        }
      }
      await adminClient.from('transactions').update({ status: 'refunded' })
        .eq('match_id', match.id).eq('type', 'escrow_hold')
    }

    // ── Cancel escrow (mutual agreement) ──
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
      const { data: match } = await adminClient.from('matches').select('*, request:shipment_requests(*)').eq('id', matchId).maybeSingle()
      if (match) await refundEscrow(match, paymentIntentId)

      return new Response(JSON.stringify({ success: true, refunded: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Cancel escrow because the traveller's own flight was cancelled ──
    // Unlike cancel_payment above (gated on the OTHER party having agreed
    // via cancellation_requests), this lets the traveller trigger the
    // refund unilaterally — but the gate is an objective, already-committed
    // fact (their flight's own `status` really is 'cancelled' in the DB),
    // never just the caller's say-so. Refunding the shipper can't harm
    // them, so no counterpart agreement is required, unlike a mutual
    // cancellation of an otherwise-live deal.
    if (action === 'cancel_payment_for_flight_cancellation') {
      const { matchId } = data
      if (!matchId) throw new Error('matchId required')
      const { data: match } = await adminClient.from('matches')
        .select('*, request:shipment_requests(*), flight:flights(*)').eq('id', matchId).maybeSingle()
      if (!match) throw new Error('Match not found')
      if (user.id !== match.traveler_id) throw new Error('Forbidden: only the traveller can trigger this')
      if (!match.flight || match.flight.status !== 'cancelled' || match.flight.user_id !== user.id) {
        throw new Error('Forbidden: this flight has not been cancelled')
      }
      // 'disputed' included deliberately: a flight cancellation is an
      // objective, unappealable fact — there's no delivery to review
      // anymore regardless of what the dispute was about — so it refunds
      // the shipper even mid-dispute rather than leaving that escrow
      // orphaned (matched but never in_escrow/proof_uploaded again, so
      // nothing else would ever refund it).
      if (!['in_escrow', 'proof_uploaded', 'disputed'].includes(match.status)) {
        throw new Error('No escrow to refund for this deal')
      }
      const refunded = !!match.payment_intent_id
      if (refunded) await refundEscrow(match, match.payment_intent_id)

      await adminClient.from('matches').update({
        status: 'rejected', deal_stage: 'cancelled', cancel_reason: 'flight_cancelled',
      }).eq('id', matchId)

      // Close out any dispute this match still had open/escalated — the
      // match itself just moved to 'rejected' and got refunded, so an
      // admin revisiting the queue later shouldn't find a dispute that
      // still claims to be waiting on a decision that's already moot.
      await adminClient.from('disputes').update({
        status: 'resolved', resolution: 'refund_to_shipper', resolved_at: new Date().toISOString(),
      }).eq('match_id', matchId).in('status', ['open', 'escalated'])

      return new Response(JSON.stringify({ success: true, refunded }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Raise a dispute ──
    // Filing a dispute never moves money by itself — escrow stays exactly
    // where it was. It pauses the normal proof-upload/confirm-delivery
    // flow (match.status = 'disputed') and asks Claude to weigh the
    // original request against the delivery proof and the dispute's own
    // evidence. Only meaningful while there's actual escrow at stake:
    // in_escrow (before proof) through proof_uploaded (after) — once a
    // deal is 'completed' the money has already moved, and there's no
    // "hold" left for either an AI or a human to redirect.
    if (action === 'raise_dispute') {
      const { matchId, reason, evidencePhotoUrls = [] } = data
      if (!matchId) throw new Error('matchId required')
      if (!reason || !reason.trim()) throw new Error('A reason is required')
      if (!Array.isArray(evidencePhotoUrls) || evidencePhotoUrls.length > 5) throw new Error('Too many evidence photos (max 5)')

      const { data: match } = await adminClient
        .from('matches').select('*, flight:flights(*), request:shipment_requests(*)')
        .eq('id', matchId).maybeSingle()
      if (!match) throw new Error('Match not found')
      const isTrav = user.id === match.traveler_id
      const isShip = user.id === match.shipper_id
      if (!isTrav && !isShip) throw new Error('Forbidden: not a party to this match')
      if (!['in_escrow', 'proof_uploaded'].includes(match.status)) {
        throw new Error('A dispute can only be raised while escrow is held (after payment, before delivery is confirmed)')
      }

      const { data: dispute, error: disputeError } = await adminClient.from('disputes').insert({
        match_id: matchId, raised_by: user.id, reason: reason.trim(),
        evidence_photo_urls: evidencePhotoUrls,
      }).select().single()
      // The partial unique index (one open/escalated dispute per match) is
      // what actually enforces this — a second filing attempt hits it and
      // surfaces here as a constraint violation.
      if (disputeError) {
        if (disputeError.code === '23505') throw new Error('This deal already has an open dispute')
        throw disputeError
      }

      // Atomically guarded, not a blind update: the unique partial index on
      // disputes already blocks a second concurrent filing while the first
      // is still open/escalated, but if the first dispute auto-resolved
      // (ai_resolved isn't covered by that index) in the gap between two
      // near-simultaneous filings, this stops the second one from yanking
      // an already-completed/refunded match back to 'disputed'.
      const { data: matchTransitioned } = await adminClient.from('matches')
        .update({ status: 'disputed' })
        .eq('id', matchId).in('status', ['in_escrow', 'proof_uploaded'])
        .select().maybeSingle()
      if (!matchTransitioned) {
        await adminClient.from('disputes').delete().eq('id', dispute.id)
        throw new Error('This deal is no longer eligible for a dispute — its status just changed')
      }

      const raiserRole = isTrav ? 'traveller' : 'sender'
      await adminClient.from('messages').insert({
        match_id: matchId, sender_id: user.id,
        content: `⚠️ Dispute raised by the ${raiserRole}: ${reason.trim()}. Escrow stays held while this is reviewed.`,
        is_read: false,
      })

      // AI review runs synchronously — disputes aren't a hot path, and the
      // filer is already waiting on this request to learn what happens next.
      const aiResult = await callDisputeAI({
        requestInfo: match.request || {},
        proofPhotoUrl: match.proof_photo_url,
        disputeReason: reason.trim(),
        evidencePhotoUrls,
      })

      const fees = calcFees(match)
      const canAutoResolve = aiResult.verdict !== 'inconclusive'
        && aiResult.confidence >= AUTO_RESOLVE_MIN_CONFIDENCE
        && fees.shipperPays <= AUTO_RESOLVE_MAX_VALUE

      if (canAutoResolve) {
        try {
          if (aiResult.verdict === 'release_to_traveler') {
            const { data: transitioned } = await adminClient.from('matches')
              .update({ status: 'completed', deal_stage: 'completed', traveler_completed: true, shipper_completed: true })
              .eq('id', matchId).eq('status', 'disputed').select().maybeSingle()
            if (transitioned) await releaseEscrowToTraveler(match, match.payment_intent_id)
          } else {
            const { data: transitioned } = await adminClient.from('matches')
              .update({ status: 'rejected', deal_stage: 'cancelled', cancel_reason: 'dispute_ai_resolved' })
              .eq('id', matchId).eq('status', 'disputed').select().maybeSingle()
            if (transitioned) await refundEscrow(match, match.payment_intent_id)
          }
          await adminClient.from('disputes').update({
            status: 'ai_resolved', ai_verdict: aiResult.verdict, ai_confidence: aiResult.confidence,
            ai_reasoning: aiResult.reasoning, resolution: aiResult.verdict, resolved_at: new Date().toISOString(),
          }).eq('id', dispute.id)
          await adminClient.from('messages').insert({
            match_id: matchId, sender_id: user.id,
            content: `Dispute resolved: ${aiResult.verdict === 'release_to_traveler' ? 'escrow released to the traveller' : 'escrow refunded to the sender'} — 🤖 AI review. ${aiResult.reasoning}`,
            is_read: false,
          })
          return new Response(JSON.stringify({
            success: true, disputeId: dispute.id, status: 'ai_resolved',
            verdict: aiResult.verdict, reasoning: aiResult.reasoning,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        } catch (resolveError) {
          // The AI decided, but actually executing the release/refund
          // failed (a wallet credit error, Stripe hiccup, etc.) — fall
          // through to escalation rather than leaving the dispute row
          // silently stuck with the held escrow in an ambiguous state.
          console.error('Dispute auto-resolve execution failed, escalating instead:', resolveError)
        }
      }

      await adminClient.from('disputes').update({
        status: 'escalated', ai_verdict: aiResult.verdict, ai_confidence: aiResult.confidence, ai_reasoning: aiResult.reasoning,
      }).eq('id', dispute.id)
      await adminClient.from('messages').insert({
        match_id: matchId, sender_id: user.id,
        content: `Dispute escalated: this needs a closer look from fetchr's team. You'll see an update here once it's resolved.`,
        is_read: false,
      })
      return new Response(JSON.stringify({ success: true, disputeId: dispute.id, status: 'escalated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Admin: manually resolve an escalated dispute ──
    // Everything that actually moves money funnels through this function
    // (not admin-dashboard, which has no Stripe/wallet release logic of
    // its own to avoid a second, driftable copy of it) — so the admin
    // console's "Release"/"Refund" buttons call this action directly.
    if (action === 'admin_resolve_dispute') {
      const { data: callerProfile } = await adminClient.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!callerProfile?.is_admin) throw new Error('Forbidden: admin access only')

      const { disputeId, resolution } = data
      if (!disputeId) throw new Error('disputeId required')
      if (!['release_to_traveler', 'refund_to_shipper'].includes(resolution)) throw new Error('resolution must be release_to_traveler or refund_to_shipper')

      const { data: dispute } = await adminClient.from('disputes').select('*').eq('id', disputeId).maybeSingle()
      if (!dispute) throw new Error('Dispute not found')
      if (dispute.status !== 'escalated') throw new Error(`This dispute is already ${dispute.status}`)

      const { data: match } = await adminClient
        .from('matches').select('*, flight:flights(*), request:shipment_requests(*)')
        .eq('id', dispute.match_id).maybeSingle()
      if (!match) throw new Error('Match not found for this dispute')
      if (match.status !== 'disputed') throw new Error(`This match is no longer disputed (status: ${match.status})`)

      if (resolution === 'release_to_traveler') {
        const { data: transitioned } = await adminClient.from('matches')
          .update({ status: 'completed', deal_stage: 'completed', traveler_completed: true, shipper_completed: true })
          .eq('id', match.id).eq('status', 'disputed').select().maybeSingle()
        if (!transitioned) throw new Error('This match is no longer disputed')
        await releaseEscrowToTraveler(match, match.payment_intent_id)
      } else {
        const { data: transitioned } = await adminClient.from('matches')
          .update({ status: 'rejected', deal_stage: 'cancelled', cancel_reason: 'dispute_admin_resolved' })
          .eq('id', match.id).eq('status', 'disputed').select().maybeSingle()
        if (!transitioned) throw new Error('This match is no longer disputed')
        await refundEscrow(match, match.payment_intent_id)
      }

      await adminClient.from('disputes').update({
        status: 'resolved', resolution, resolved_by: user.id, resolved_at: new Date().toISOString(),
      }).eq('id', disputeId)

      // A recognized 'Dispute resolved:' prefix (see Messages.jsx's
      // SYSTEM_MSG_PREFIXES) renders this as a neutral system card rather
      // than a normal chat bubble — sender_id doesn't affect how it's
      // displayed once recognized as a system message, but still needs to
      // be a valid party on this match for the FK.
      await adminClient.from('messages').insert({
        match_id: match.id, sender_id: match.shipper_id,
        content: `Dispute resolved: ${resolution === 'release_to_traveler' ? 'escrow released to the traveller' : 'escrow refunded to the sender'} — reviewed by fetchr's team.`,
        is_read: false,
      })

      return new Response(JSON.stringify({ success: true }),
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