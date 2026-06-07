import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Verify user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = user.id

    // ── BLOCKER 1: Active deals ──
    const { data: activeDeals } = await adminClient
      .from('matches')
      .select('id, status')
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
      .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])

    if (activeDeals && activeDeals.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'active_deals',
          message: `You have ${activeDeals.length} active deal${activeDeals.length > 1 ? 's' : ''} in progress. Please complete or cancel all deals before deleting your account.`,
          count: activeDeals.length,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── BLOCKER 2: Wallet balance ──
    const { data: profile } = await adminClient
      .from('profiles')
      .select('wallet_balance, full_name')
      .eq('id', userId)
      .single()

    if (profile && profile.wallet_balance > 0) {
      return new Response(
        JSON.stringify({
          error: 'wallet_balance',
          message: `You have $${parseFloat(profile.wallet_balance).toFixed(2)} remaining in your Fetchr wallet. Please withdraw your balance before deleting your account.`,
          balance: profile.wallet_balance,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── BLOCKER 3: Pending escrow payments (in_escrow matches as shipper) ──
    const { data: escrowDeals } = await adminClient
      .from('matches')
      .select('id, escrow_amount, payment_intent_id')
      .eq('shipper_id', userId)
      .in('status', ['in_escrow', 'proof_uploaded'])

    if (escrowDeals && escrowDeals.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'pending_escrow',
          message: 'You have funds held in escrow for active shipments. These must be resolved (completed or refunded) before your account can be deleted.',
          count: escrowDeals.length,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── BLOCKER 4: Uncaptured Stripe payments ──
    // Check for any payment intents that are authorized but not captured or refunded
    const { data: pendingPayments } = await adminClient
      .from('matches')
      .select('id, payment_intent_id, status')
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
      .not('payment_intent_id', 'is', null)
      .not('status', 'in', '["completed","rejected","cancelled"]')

    if (pendingPayments && pendingPayments.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'pending_payments',
          message: 'You have pending payment transactions. Please wait for all payments to be fully resolved before deleting your account.',
          count: pendingPayments.length,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── ALL CHECKS PASSED — proceed with deletion ──

    // 1. Get all match IDs for this user
    const { data: allMatches } = await adminClient
      .from('matches')
      .select('id')
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)

    if (allMatches && allMatches.length > 0) {
      const matchIds = allMatches.map(m => m.id)

      // 2. Delete messages in those matches
      await adminClient.from('messages').delete().in('match_id', matchIds)

      // 3. Delete cancellation requests
      await adminClient.from('cancellation_requests').delete().in('match_id', matchIds)

      // 4. Delete matches
      await adminClient.from('matches').delete().in('id', matchIds)
    }

    // 5. Delete flights
    await adminClient.from('flights').delete().eq('user_id', userId)

    // 6. Delete shipment requests
    await adminClient.from('shipment_requests').delete().eq('user_id', userId)

    // 7. Delete storage files
    try {
      const { data: avatarFiles } = await adminClient.storage
        .from('avatars')
        .list(userId)
      if (avatarFiles && avatarFiles.length > 0) {
        const filePaths = avatarFiles.map(f => `${userId}/${f.name}`)
        await adminClient.storage.from('avatars').remove(filePaths)
      }
    } catch (e) {
      console.error('Storage cleanup error (non-fatal):', e)
    }

    // 8. Delete profile
    await adminClient.from('profiles').delete().eq('id', userId)

    // 9. Delete auth user (must be last)
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteAuthError) {
      console.error('Auth user deletion error:', deleteAuthError)
      // Don't fail — profile is already deleted
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account and all associated data have been permanently deleted.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Delete account error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})