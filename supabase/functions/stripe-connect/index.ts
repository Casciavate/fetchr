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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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

    // ── CREATE PAYMENT INTENT (Option C) ──
    // Shipper pays full amount
    // Fetchr fee captured immediately
    // Escrow portion held uncaptured
    if (action === 'create_payment_intent') {
      const { matchId, amount, currency = 'usd' } = data

      // Get match details
      const { data: match } = await adminClient
        .from('matches')
        .select('*, flight:flights(*), request:shipment_requests(*)')
        .eq('id', matchId)
        .single()

      if (!match) throw new Error('Match not found')

      const subtotal = amount // in cents
      
      // Calculate tiered Fetchr fee
      const subtotalUSD = subtotal / 100
      let fetchrPct = 0.10
      if (subtotalUSD >= 500) fetchrPct = 0.07
      else if (subtotalUSD >= 200) fetchrPct = 0.085
      else if (subtotalUSD < 20) fetchrPct = 0.12
      
      const fetchrFeeUSD = subtotalUSD * fetchrPct
      const fetchrFeeCents = Math.round(fetchrFeeUSD * 100)
      const stripeFeeUSD = (subtotalUSD + fetchrFeeUSD) * 0.029 + 0.30
      const stripeFeeCents = Math.round(stripeFeeUSD * 100)
      const totalCents = subtotal + fetchrFeeCents + stripeFeeCents

      // Create PaymentIntent — capture_method: manual means funds are HELD not charged
      // We will capture only the escrow portion on delivery
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalCents,
        currency,
        capture_method: 'manual', // KEY: holds funds without capturing
        metadata: {
          match_id: matchId,
          subtotal_cents: subtotal,
          fetchr_fee_cents: fetchrFeeCents,
          stripe_fee_cents: stripeFeeCents,
          fetchr_pct: Math.round(fetchrPct * 100),
          traveler_id: match.traveler_id,
          shipper_id: match.shipper_id,
        },
        description: `Fetchr escrow: ${match.request?.item_name} (${match.flight?.from_code} → ${match.flight?.to_code})`,
      })

      // Update match with escrow details
      await adminClient.from('matches').update({
        payment_intent_id: paymentIntent.id,
        escrow_amount: subtotalUSD - fetchrFeeUSD, // traveler receives this
        status: 'in_escrow',
        deal_stage: 'in_escrow',
      }).eq('id', matchId)

      // Record transaction for shipper (debit)
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

      // Send message in chat
      await adminClient.from('messages').insert({
        match_id: matchId,
        sender_id: user.id,
        content: `🔒 ESCROW SECURED: $${subtotalUSD.toFixed(2)} is now held in escrow. Fetchr fee: $${fetchrFeeUSD.toFixed(2)} (${Math.round(fetchrPct * 100)}%). The traveler will receive $${(subtotalUSD - fetchrFeeUSD).toFixed(2)} upon confirmed delivery.`,
        is_read: false,
      })

      return new Response(JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        breakdown: {
          subtotal: subtotalUSD,
          fetchrFee: fetchrFeeUSD,
          stripeFee: stripeFeeUSD,
          total: (totalCents / 100),
          travelerReceives: subtotalUSD - fetchrFeeUSD,
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── CAPTURE PAYMENT ON DELIVERY ──
    // Called when both parties confirm delivery
    // Captures Fetchr fee immediately to our account
    // Credits traveler wallet with their portion
    if (action === 'capture_payment') {
      const { paymentIntentId, matchId } = data

      const { data: match } = await adminClient
        .from('matches')
        .select('*, flight:flights(*), request:shipment_requests(*)')
        .eq('id', matchId || '')
        .maybeSingle()

      const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
      
      // Capture the full amount (Stripe handles it all in one account)
      await stripe.paymentIntents.capture(paymentIntentId)

      // Calculate what traveler receives
      const totalCents = pi.amount
      const fetchrFeeCents = parseInt(pi.metadata.fetchr_fee_cents || '0')
      const stripeFeeCents = parseInt(pi.metadata.stripe_fee_cents || '0')
      const subtotalCents = parseInt(pi.metadata.subtotal_cents || '0')
      const travelerReceivesCents = subtotalCents - fetchrFeeCents
      const travelerReceivesUSD = travelerReceivesCents / 100

      // Credit traveler wallet
      if (match) {
        const { data: travelerProfile } = await adminClient
          .from('profiles')
          .select('wallet_balance')
          .eq('id', match.traveler_id)
          .single()

        await adminClient.from('profiles').update({
          wallet_balance: (travelerProfile?.wallet_balance || 0) + travelerReceivesUSD
        }).eq('id', match.traveler_id)

        // Record traveler credit transaction
        await adminClient.from('transactions').insert({
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
        })

        // Record fetchr fee transaction (for business records)
        await adminClient.from('transactions').insert({
          user_id: match.shipper_id, // associate with deal
          type: 'fetchr_fee',
          amount: fetchrFeeCents / 100,
          description: `Fetchr service fee: ${match.request?.item_name}`,
          match_id: match.id,
          status: 'completed',
          metadata: {
            payment_intent_id: paymentIntentId,
            pct: pi.metadata.fetchr_pct,
          }
        })

        // Update shipper transaction to completed
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

    // ── VOID / REFUND ON CANCELLATION ──
    if (action === 'cancel_payment') {
      const { paymentIntentId, matchId } = data

      // Cancel the uncaptured payment intent (full refund automatically)
      await stripe.paymentIntents.cancel(paymentIntentId)

      // Get match to update shipper transaction
      if (matchId) {
        const { data: match } = await adminClient
          .from('matches').select('shipper_id, request:shipment_requests(item_name)')
          .eq('id', matchId).maybeSingle()

        if (match) {
          // Update transaction to refunded
          await adminClient.from('transactions')
            .update({ status: 'refunded' })
            .eq('match_id', matchId)
            .eq('type', 'escrow_hold')
        }
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