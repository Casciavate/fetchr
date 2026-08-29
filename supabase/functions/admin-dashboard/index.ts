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

    // ── Users list, with per-user deal/earnings stats and ban status ──
    if (action === 'users') {
      const { limit = 200 } = data || {}
      const [{ data: users, error }, { data: statsRows }, { data: authList }] = await Promise.all([
        adminClient
          .from('profiles')
          .select('id, full_name, email, role, verified, rating, total_reviews, wallet_balance, completed_deals, is_admin, created_at')
          .order('created_at', { ascending: false })
          .limit(limit),
        adminClient.rpc('admin_user_stats'),
        adminClient.auth.admin.listUsers({ perPage: 1000 }),
      ])
      if (error) throw error
      const statsById = Object.fromEntries((statsRows || []).map(s => [s.user_id, s]))
      const bannedById = Object.fromEntries(
        (authList?.users || []).map(u => [u.id, !!u.banned_until && new Date(u.banned_until) > new Date()])
      )
      const enriched = (users || []).map(u => ({
        ...u,
        stats: statsById[u.id] || null,
        blocked: !!bannedById[u.id],
      }))
      return new Response(JSON.stringify({ users: enriched }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── KPI time series for the overview chart ──
    if (action === 'kpi_timeseries') {
      const { startDate, endDate } = data || {}
      if (!startDate || !endDate) throw new Error('startDate and endDate required')
      const { data: rows, error } = await adminClient.rpc('admin_kpi_timeseries', { start_date: startDate, end_date: endDate })
      if (error) throw error
      return new Response(JSON.stringify({ series: rows }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Block / unblock a user (native GoTrue ban — actually prevents
    //    sign-in, not just an app-level flag) ──
    if (action === 'block_user') {
      const { userId } = data
      if (!userId) throw new Error('userId required')
      if (userId === user.id) throw new Error('Cannot block your own account')
      const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: '87600h' })
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (action === 'unblock_user') {
      const { userId } = data
      if (!userId) throw new Error('userId required')
      const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' })
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Force-set a temporary password (email delivery isn't reliable
    //    yet — the admin relays this to the user directly rather than a
    //    reset-link email) ──
    if (action === 'reset_password') {
      const { userId } = data
      if (!userId) throw new Error('userId required')
      const tempPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password: tempPassword })
      if (error) throw error
      return new Response(JSON.stringify({ success: true, tempPassword }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Delete a user (admin-triggered). Same safety blockers as
    //    self-service deletion — an admin forcing through a delete while
    //    real escrow money is in flight would orphan it. ──
    if (action === 'delete_user') {
      const { userId } = data
      if (!userId) throw new Error('userId required')
      if (userId === user.id) throw new Error('Cannot delete your own account from here')

      const { data: activeDeals } = await adminClient
        .from('matches').select('id')
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
      if (activeDeals && activeDeals.length > 0) {
        throw new Error(`This user has ${activeDeals.length} active deal(s) — resolve or cancel them first.`)
      }
      const { data: profile } = await adminClient.from('profiles').select('wallet_balance').eq('id', userId).single()
      if (profile && profile.wallet_balance > 0) {
        throw new Error(`This user has $${parseFloat(profile.wallet_balance).toFixed(2)} in their wallet — must be withdrawn/zeroed first.`)
      }

      const { data: allMatches } = await adminClient
        .from('matches').select('id')
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
      if (allMatches && allMatches.length > 0) {
        const matchIds = allMatches.map(m => m.id)
        await adminClient.from('messages').delete().in('match_id', matchIds)
        await adminClient.from('cancellation_requests').delete().in('match_id', matchIds)
        await adminClient.from('matches').delete().in('id', matchIds)
      }
      await adminClient.from('flights').delete().eq('user_id', userId)
      await adminClient.from('shipment_requests').delete().eq('user_id', userId)
      await adminClient.from('profiles').delete().eq('id', userId)
      const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)
      if (deleteAuthError) console.error('Auth user deletion error:', deleteAuthError)

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
