import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Get user from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'No auth header' }), { status: 401, headers: corsHeaders })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create admin client
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Get user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: corsHeaders })
    }

    const userId = user.id

    // Check for active deals first
    const { data: activeDeals } = await adminClient
      .from('matches')
      .select('id')
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
      .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
      .limit(1)

    if (activeDeals && activeDeals.length > 0) {
      return new Response(JSON.stringify({
        error: 'You have active deals. Please complete or cancel them before deleting your account.'
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Delete in correct order (foreign key constraints)

    // 1. Delete messages in matches where user is involved
    const { data: userMatches } = await adminClient
      .from('matches')
      .select('id')
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)

    if (userMatches && userMatches.length > 0) {
      const matchIds = userMatches.map(m => m.id)
      await adminClient.from('messages').delete().in('match_id', matchIds)
      await adminClient.from('cancellation_requests').delete().in('match_id', matchIds)
    }

    // 2. Delete matches
    await adminClient.from('matches')
      .delete()
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)

    // 3. Delete flights
    await adminClient.from('flights').delete().eq('user_id', userId)

    // 4. Delete shipment requests
    await adminClient.from('shipment_requests').delete().eq('user_id', userId)

    // 5. Delete storage files (avatar)
    const { data: avatarFiles } = await adminClient.storage
      .from('avatars')
      .list(userId)
    if (avatarFiles && avatarFiles.length > 0) {
      const filePaths = avatarFiles.map(f => `${userId}/${f.name}`)
      await adminClient.storage.from('avatars').remove(filePaths)
    }

    // 6. Delete profile
    await adminClient.from('profiles').delete().eq('id', userId)

    // 7. Delete auth user
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteAuthError) {
      console.error('Error deleting auth user:', deleteAuthError)
    }

    return new Response(JSON.stringify({ success: true, message: 'Account deleted successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})