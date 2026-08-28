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
    if (userError || !user) throw new Error('Invalid or expired token')

    // Every action below requires admin — checked server-side against
    // profiles.is_admin, never trusted from client input.
    const { data: callerProfile } = await adminClient
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!callerProfile?.is_admin) throw new Error('Forbidden: admin access only')

    const body = await req.json()
    const { action, data } = body

    // ── Platform overview: revenue, wallet liability, escrow-in-flight, Stripe balance ──
    if (action === 'overview') {
      const [
        { data: feeRows },
        { data: escrowRows },
        { data: walletRows },
        { count: userCount },
        { count: activeDealsCount },
        { count: completedDealsCount },
      ] = await Promise.all([
        adminClient.from('transactions').select('amount').eq('type', 'fetchr_fee').eq('status', 'completed'),
        adminClient.from('transactions').select('amount').eq('type', 'escrow_hold').eq('status', 'pending'),
        adminClient.from('profiles').select('wallet_balance'),
        adminClient.from('profiles').select('id', { count: 'exact', head: true }),
        adminClient.from('matches').select('id', { count: 'exact', head: true })
          .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded']),
        adminClient.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      ])

      const totalRevenue = (feeRows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
      const escrowInFlight = (escrowRows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
      const walletLiability = (walletRows || []).reduce((s, r) => s + (Number(r.wallet_balance) || 0), 0)

      let stripeBalance = null
      try {
        const bal = await stripe.balance.retrieve()
        stripeBalance = { available: bal.available, pending: bal.pending }
      } catch (e) {
        stripeBalance = { error: e.message }
      }

      return new Response(JSON.stringify({
        revenue: { totalRevenue, escrowInFlight, walletLiability },
        counts: { userCount, activeDealsCount, completedDealsCount },
        stripeBalance,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Users list ──
    if (action === 'users') {
      const { limit = 200 } = data || {}
      const { data: users, error } = await adminClient
        .from('profiles')
        .select('id, full_name, email, role, verified, rating, total_reviews, wallet_balance, completed_deals, is_admin, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Transactions ledger, across all users ──
    if (action === 'transactions') {
      const { limit = 300, type, status } = data || {}
      let query = adminClient
        .from('transactions')
        .select('id, user_id, type, amount, currency, description, match_id, status, metadata, created_at, profiles:profiles!transactions_user_id_fkey(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (type) query = query.eq('type', type)
      if (status) query = query.eq('status', status)
      const { data: transactions, error } = await query
      if (error) throw error
      return new Response(JSON.stringify({ transactions }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Recent Stripe activity (PaymentIntents) ──
    if (action === 'stripe_activity') {
      const paymentIntents = await stripe.paymentIntents.list({ limit: 25 })
      return new Response(JSON.stringify({
        paymentIntents: paymentIntents.data.map(pi => ({
          id: pi.id, amount: pi.amount, currency: pi.currency, status: pi.status,
          capture_method: pi.capture_method, description: pi.description,
          metadata: pi.metadata, created: pi.created,
        })),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Toggle a user's verified badge ──
    if (action === 'toggle_verified') {
      const { userId, verified } = data
      if (!userId) throw new Error('userId required')
      const { error } = await adminClient.from('profiles').update({ verified }).eq('id', userId)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error(`Unknown action: ${action}`)

  } catch (error) {
    console.error('Admin dashboard function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message?.startsWith('Forbidden') ? 403 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
