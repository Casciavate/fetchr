// @ts-nocheck
// Optional full ID verification (document + selfie), via Stripe Identity —
// deliberately NOT mandatory for every user. fetchr never sees or stores
// the actual ID/selfie images itself; Stripe hosts the capture flow and
// only ever tells us pass/fail via metadata + a webhook. This keeps
// fetchr from becoming the thing a data breach exposes passport scans
// from, while still giving genuine assurance for higher-value deals.
//
// Deployed with --no-verify-jwt: the /webhook path is called by Stripe
// itself (authenticated via the stripe-signature header, not a Supabase
// session), so Supabase's blanket JWT gate has to be off for this
// function. The action-based paths below do their own bearer-token check.
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── Stripe webhook: the definitive source of truth for verification
  //    result. The client redirect back from Stripe's hosted flow is not
  //    trusted on its own — a user could land back on `return_url` before
  //    Stripe has actually finished reviewing the document. ──
  if (url.pathname.endsWith('/webhook')) {
    const signature = req.headers.get('stripe-signature')
    const webhookSecret = Deno.env.get('STRIPE_IDENTITY_WEBHOOK_SECRET')
    const body = await req.text()
    let event
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
    } catch (err) {
      console.error('Identity webhook signature verification failed:', err.message)
      return new Response(`Webhook Error: ${err.message}`, { status: 400 })
    }

    const session = event.data.object
    const userId = session.metadata?.supabase_user_id

    if (event.type === 'identity.verification_session.verified' && userId) {
      await adminClient.from('profiles').update({ verified: true }).eq('id', userId)
    }
    if (event.type === 'identity.verification_session.requires_input' && userId) {
      console.error('Identity verification failed for user', userId, session.last_error?.reason)
    }

    return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No auth header')
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !user) throw new Error('Invalid or expired token')

    const { action } = await req.json()

    // ── Start a verification session; the client redirects the user to
    //    Stripe's hosted document+selfie capture flow at session.url ──
    if (action === 'create_session') {
      const { data: profile } = await adminClient.from('profiles').select('verified').eq('id', user.id).single()
      if (profile?.verified) {
        return new Response(JSON.stringify({ alreadyVerified: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const session = await stripe.identity.verificationSessions.create({
        type: 'document',
        metadata: { supabase_user_id: user.id },
        options: { document: { require_matching_selfie: true } },
      })
      return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'status') {
      const { data: profile } = await adminClient.from('profiles').select('verified').eq('id', user.id).single()
      return new Response(JSON.stringify({ verified: !!profile?.verified }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Unknown action: ${action}`)
  } catch (error) {
    console.error('Stripe identity function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
