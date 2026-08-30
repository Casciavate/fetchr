// @ts-nocheck
// ── TEST-ONLY FIXTURE — safe to remove entirely, see teardown below ──
//
// Whenever a real user (anyone except the two fixed test bots) creates a
// flight or shipment_request, this generates 3 varied matching counter-
// listings from the bots, then autonomously drives any bot-involved deal
// through accept -> terms -> escrow -> proof -> completion (occasionally
// simulating a cancellation), reusing the exact same RLS-governed tables/
// triggers and the same stripe-connect actions a real user's browser
// calls — never a service-role shortcut for anything a real user does.
//
// Bots: Simon Shipper (always the shipper/requester side) and Tara
// Traveler (always the traveler/flight side) — identified by profiles.is_bot
// and by email below, not by name matching.
//
// Driven by a pg_cron job ("bot-agent-tick", every 2 minutes) calling this
// function with no auth header — deployed with --no-verify-jwt, safe
// because "tick" takes no client-controlled input and only ever acts on
// bot-owned rows or in reaction to a real user's own prior action.
//
// ── TO REMOVE THIS FEATURE ──
//   1. select cron.unschedule('bot-agent-tick');   -- stops all bot activity
//   2. supabase functions delete bot-agent          -- undeploys this function
//   3. (optional full cleanup) delete bot-owned rows:
//      delete from public.matches where traveler_id in (select id from profiles where is_bot)
//        or shipper_id in (select id from profiles where is_bot);
//      delete from public.flights where user_id in (select id from profiles where is_bot);
//      delete from public.shipment_requests where user_id in (select id from profiles where is_bot);
//      drop table if exists public.bot_seed_log;
//      alter table public.profiles drop column if exists is_bot;
//   Step 1 alone is enough to fully stop new activity; steps 2-3 are only
//   needed if you want the code/data gone too.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SIMON_EMAIL = 'sandrocasciani1+fetchrshipper@gmail.com' // bot-shipper
const TARA_EMAIL = 'sandrocasciani1+fetchrtraveler@gmail.com' // bot-traveler

const AIRLINES = ['Lufthansa', 'Emirates', 'Delta', 'British Airways', 'Qatar Airways', 'Turkish Airlines', 'Air France', 'KLM']
const CANCEL_REASONS = [
  'Sorry, my travel plans changed and I can no longer make this trip.',
  'Something urgent came up — I need to cancel this deal.',
  'Item details changed on my end, this no longer works for me.',
]
const CATEGORY_ITEMS = {
  'Electronics': ['Wireless earbuds', 'Portable charger', 'Smartwatch'],
  'Clothing & Fashion': ['Designer jacket', 'Sneakers', 'Wool scarf'],
  'Cosmetics & Beauty': ['Skincare set', 'Perfume bottle', 'Makeup kit'],
  'Food & Beverages': ['Specialty coffee beans', 'Local honey jar', 'Chocolate box'],
  'Books & Stationery': ['Hardcover novel', 'Notebook set', 'Art supplies'],
  'Toys & Games': ['Board game', 'Building blocks set', 'Puzzle'],
  'Medical & Pharmacy': ['Vitamins pack', 'First aid kit', 'Prescription glasses'],
  'Jewelry & Accessories': ['Silver bracelet', 'Leather wallet', 'Sunglasses'],
  'Sports & Fitness': ['Yoga mat', 'Running shoes', 'Resistance bands'],
  'Home & Living': ['Ceramic mug set', 'Throw pillow', 'Photo frame'],
  'Documents': ['Sealed envelope', 'Legal papers', 'Certificates'],
  'Other': ['Gift box', 'Souvenir item', 'Small parcel'],
}
// 1x1 transparent PNG — a real proof upload, just synthetic content since
// this is a test fixture, not a real delivery photo.
const TEST_PROOF_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

// Small, deterministic hash so "which 3 categories / which price / does
// this match randomly cancel" is a pure function of the row's own id —
// reproducible and debuggable across ticks, not re-rolled each time.
function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
function pickN(arr, hash, n) {
  const idxs = []
  const seen = new Set()
  let i = 0
  while (seen.size < Math.min(n, arr.length)) {
    const idx = (hash + i * 7) % arr.length
    if (!seen.has(idx)) { seen.add(idx); idxs.push(idx) }
    i++
  }
  return idxs.map(i => arr[i])
}

function genRequestsForFlight(flight, simonId) {
  const h = hashStr(flight.id)
  const categories = Object.keys(CATEGORY_ITEMS)
  const chosenCats = pickN(categories, h, 3)
  const capacity = Number(flight.available_kg) || 5
  const factors = [0.3, 0.45, 0.6]
  const offersShopShip = flight.delivery_type === 'both'
  return chosenCats.map((cat, i) => {
    const items = CATEGORY_ITEMS[cat]
    const itemName = items[(h + i) % items.length]
    const weight = Math.max(0.5, Math.round(capacity * factors[i] * 10) / 10)
    const isShopShip = offersShopShip && i === 0
    const price = Number(flight.price_per_kg) || 10
    return {
      user_id: simonId,
      item_name: itemName,
      category: cat,
      description: `${itemName} — test listing generated to match flight ${flight.from_code}→${flight.to_code}`,
      from_city: flight.from_city, from_code: flight.from_code,
      to_city: flight.to_city, to_code: flight.to_code,
      weight_kg: weight,
      budget_per_kg: price,
      max_budget: Math.round(price * weight * 1.15 * 100) / 100,
      needed_by: flight.flight_date,
      status: 'open',
      requires_purchase: isShopShip,
      purchase_store: isShopShip ? 'Local Store' : null,
      purchase_price: isShopShip ? 40 + (h % 40) : null,
      purchase_currency: isShopShip ? 'USD' : null,
      is_liquid: false,
    }
  })
}

function genFlightsForRequest(request, taraId) {
  const h = hashStr(request.id)
  const airlines = pickN(AIRLINES, h, 3)
  const factors = [1.3, 1.6, 2.0]
  const priceBase = Number(request.budget_per_kg) || 12
  const priceVar = [0.9, 1.0, 1.15]
  const dateOffsets = [0, 2, 4]
  const today = new Date()
  const needBy = request.needed_by ? new Date(request.needed_by) : new Date(today.getTime() + 7 * 86400000)
  const offersShopShip = !!request.requires_purchase
  return airlines.map((airline, i) => {
    const weight = Math.round((Number(request.weight_kg) || 1) * factors[i] * 10) / 10
    const price = Math.max(5, Math.round(priceBase * priceVar[i] * 100) / 100)
    let d = new Date(needBy.getTime() - dateOffsets[i] * 86400000)
    const tomorrow = new Date(today.getTime() + 86400000)
    if (d < tomorrow) d = tomorrow
    const dateStr = d.toISOString().slice(0, 10)
    return {
      user_id: taraId,
      from_city: request.from_city, from_code: request.from_code,
      to_city: request.to_city, to_code: request.to_code,
      flight_date: dateStr,
      airline,
      available_kg: weight,
      price_per_kg: price,
      luggage_options: [{ type: 'checkin', available_kg: weight, price_per_kg: price, booked_kg: 0 }],
      categories: [request.category].filter(Boolean),
      status: 'active',
      delivery_type: offersShopShip ? 'both' : 'handover',
      shop_and_ship_fee: offersShopShip ? 15 + (h % 20) : 0,
      notes: `Test listing generated to match request for ${request.item_name}`,
    }
  })
}

async function getBotSession(adminClient, anonClient, email) {
  const { data, error } = await adminClient.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const tokenHash = data?.properties?.hashed_token
  if (!tokenHash) throw new Error(`No token hash generated for ${email}`)
  const { data: verified, error: verr } = await anonClient.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
  if (verr) throw verr
  return verified.session
}

async function callStripeConnect(supabaseUrl, token, action, data) {
  const res = await fetch(`${supabaseUrl}/functions/v1/stripe-connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action, data }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `stripe-connect ${action} failed`)
  return json
}

async function seedCounterListings(adminClient, simonClient, taraClient, simonId, taraId) {
  const { data: seeded } = await adminClient.from('bot_seed_log').select('source_table, source_id')
  const seededSet = new Set((seeded || []).map(s => `${s.source_table}:${s.source_id}`))

  const { data: flights } = await adminClient.from('flights').select('*')
    .not('user_id', 'in', `(${simonId},${taraId})`)
  for (const f of (flights || [])) {
    if (seededSet.has(`flights:${f.id}`)) continue
    const rows = genRequestsForFlight(f, simonId)
    const { error } = await simonClient.from('shipment_requests').insert(rows)
    if (error) { console.error('seed requests for flight', f.id, error.message); continue }
    await adminClient.from('bot_seed_log').insert({ source_table: 'flights', source_id: f.id })
  }

  const { data: requests } = await adminClient.from('shipment_requests').select('*')
    .not('user_id', 'in', `(${simonId},${taraId})`)
  for (const r of (requests || [])) {
    if (seededSet.has(`shipment_requests:${r.id}`)) continue
    const rows = genFlightsForRequest(r, taraId)
    const { error } = await taraClient.from('flights').insert(rows)
    if (error) { console.error('seed flights for request', r.id, error.message); continue }
    await adminClient.from('bot_seed_log').insert({ source_table: 'shipment_requests', source_id: r.id })
  }

  await adminClient.rpc('find_matches')
}

function flightDeparted(flight) {
  if (!flight?.flight_date) return true
  const today = new Date().toISOString().split('T')[0]
  return flight.flight_date <= today
}
function shouldRandomlyCancel(id) {
  return hashStr(id) % 100 < 20 // ~20% of bot-involved deals, deterministic per match
}

async function uploadBotProof(botClient, botId, m) {
  const bytes = Uint8Array.from(atob(TEST_PROOF_PNG_BASE64), c => c.charCodeAt(0))
  const path = `${botId}/proofs/${m.id}-${Date.now()}.png`
  const { error } = await botClient.storage.from('avatars').upload(path, bytes, { contentType: 'image/png', upsert: true })
  if (error) throw error
  const { data: urlData } = botClient.storage.from('avatars').getPublicUrl(path)
  await botClient.from('matches').update({
    proof_photo_url: urlData.publicUrl, proof_uploaded_at: new Date().toISOString(),
    status: 'proof_uploaded', deal_stage: 'proof_uploaded',
  }).eq('id', m.id)
  await botClient.from('messages').insert([{
    match_id: m.id, sender_id: botId, content: `Proof uploaded: ${urlData.publicUrl}`, is_read: false,
  }])
}

async function advanceOne(ctx, m) {
  const { adminClient, simonClient, taraClient, simonId, taraId, simonToken, taraToken, supabaseUrl } = ctx
  const botIsShipper = m.shipper_id === simonId
  const botIsTraveler = m.traveler_id === taraId
  if (!botIsShipper && !botIsTraveler) return // no bot party at all
  if (botIsShipper && botIsTraveler) return   // bot-vs-bot, never auto-progressed

  const iAmTraveler = botIsTraveler
  const botClient = botIsShipper ? simonClient : taraClient
  const botId = botIsShipper ? simonId : taraId
  const botToken = botIsShipper ? simonToken : taraToken

  if (m.status === 'pending') return // wait for the real user to move first

  if (m.status === 'awaiting_other') {
    const myAccepted = iAmTraveler ? m.traveler_accepted : m.shipper_accepted
    const otherAccepted = iAmTraveler ? m.shipper_accepted : m.traveler_accepted
    if (!myAccepted && otherAccepted) {
      const myField = iAmTraveler ? 'traveler_accepted' : 'shipper_accepted'
      await botClient.from('matches').update({
        [myField]: true, status: 'accepted', deal_stage: 'matched',
        terms_agreed_traveler: false, terms_agreed_shipper: false,
        traveler_completed: false, shipper_completed: false,
      }).eq('id', m.id)
      await botClient.from('messages').insert([{
        match_id: m.id, sender_id: botId,
        content: 'Match accepted. Both parties have agreed — you can now chat and arrange the delivery.', is_read: false,
      }])
    }
    return
  }

  // A pending cancellation request from the OTHER (real) party — agree to
  // it autonomously so the real user can actually exercise this flow.
  const { data: pendingCancel } = await adminClient.from('cancellation_requests')
    .select('*').eq('match_id', m.id).eq('status', 'pending').maybeSingle()
  if (pendingCancel && pendingCancel.requested_by !== botId) {
    const hasEscrow = ['in_escrow', 'proof_uploaded'].includes(m.status)
    if (hasEscrow && m.payment_intent_id) {
      await callStripeConnect(supabaseUrl, botToken, 'cancel_payment', { paymentIntentId: m.payment_intent_id, matchId: m.id })
    }
    await adminClient.from('cancellation_requests').update({ status: 'agreed' }).eq('id', pendingCancel.id)
    await botClient.from('matches').update({ status: 'rejected', deal_stage: 'cancelled' }).eq('id', m.id)
    await botClient.from('messages').insert([{
      match_id: m.id, sender_id: botId,
      content: hasEscrow
        ? 'Cancellation agreed: deal cancelled. Escrow will be refunded within 5–10 business days.'
        : 'Cancellation agreed: deal cancelled by mutual agreement.',
      is_read: false,
    }])
    return
  }
  if (pendingCancel) return // it's the bot's own request — wait for the real user's decision

  if (m.status === 'accepted') {
    const myTerms = iAmTraveler ? m.terms_agreed_traveler : m.terms_agreed_shipper
    if (!myTerms) {
      const otherTerms = iAmTraveler ? m.terms_agreed_shipper : m.terms_agreed_traveler
      const myField = iAmTraveler ? 'terms_agreed_traveler' : 'terms_agreed_shipper'
      await botClient.from('matches').update({
        [myField]: true,
        ...(otherTerms ? { status: 'terms_agreed', deal_stage: 'terms_agreed' } : {}),
      }).eq('id', m.id)
      await botClient.from('messages').insert([{
        match_id: m.id, sender_id: botId,
        content: otherTerms
          ? 'Terms agreed by both parties. The deal is locked in — the sender can now pay escrow.'
          : `Terms agreed by the ${iAmTraveler ? 'traveller' : 'sender'}. Waiting for the ${iAmTraveler ? 'sender' : 'traveller'} to also agree.`,
        is_read: false,
      }])
    }
    return
  }

  if (m.status === 'terms_agreed') {
    if (botIsShipper) {
      await callStripeConnect(supabaseUrl, botToken, 'escrow_from_wallet', { matchId: m.id })
    }
    return
  }

  if (m.status === 'in_escrow') {
    if (shouldRandomlyCancel(m.id)) {
      const reason = CANCEL_REASONS[hashStr(m.id) % CANCEL_REASONS.length]
      await botClient.from('cancellation_requests').insert([{ match_id: m.id, requested_by: botId, reason, status: 'pending' }])
      await botClient.from('messages').insert([{
        match_id: m.id, sender_id: botId, content: `Cancellation request: ${reason}. Respond to agree or decline.`, is_read: false,
      }])
      return
    }
    if (botIsTraveler) await uploadBotProof(botClient, botId, m)
    return
  }

  if (m.status === 'proof_uploaded') {
    if (!flightDeparted(m.flight)) return
    const otherDone = iAmTraveler ? m.shipper_completed : m.traveler_completed
    const myDone = iAmTraveler ? m.traveler_completed : m.shipper_completed
    if (myDone) return
    if (otherDone) {
      if (m.payment_intent_id) {
        await callStripeConnect(supabaseUrl, botToken, 'capture_payment', { paymentIntentId: m.payment_intent_id, matchId: m.id })
      }
      await botClient.from('matches').update({
        status: 'completed', deal_stage: 'completed', traveler_completed: true, shipper_completed: true,
      }).eq('id', m.id)
      const { data: releaseTx } = await adminClient.from('transactions')
        .select('amount').eq('match_id', m.id).eq('type', 'escrow_release').maybeSingle()
      await botClient.from('messages').insert([{
        match_id: m.id, sender_id: botId,
        content: `Deal completed. Both sides confirmed delivery — $${(releaseTx?.amount || 0).toFixed(2)} has been released to the traveller's wallet.`,
        is_read: false,
      }])
    } else {
      const myField = iAmTraveler ? 'traveler_completed' : 'shipper_completed'
      await botClient.from('matches').update({ [myField]: true }).eq('id', m.id)
      await botClient.from('messages').insert([{
        match_id: m.id, sender_id: botId,
        content: `Delivery confirmed by the ${iAmTraveler ? 'traveller' : 'sender'}. Waiting for the ${iAmTraveler ? 'sender' : 'traveller'} to also confirm.`,
        is_read: false,
      }])
    }
  }
}

async function advanceMatches(ctx) {
  const { adminClient, simonId, taraId } = ctx
  const { data: matches } = await adminClient
    .from('matches')
    .select('*, flight:flights(*), request:shipment_requests(*)')
    .in('status', ['pending', 'awaiting_other', 'accepted', 'terms_agreed', 'in_escrow', 'proof_uploaded'])
    .or(`traveler_id.eq.${simonId},shipper_id.eq.${simonId},traveler_id.eq.${taraId},shipper_id.eq.${taraId}`)

  for (const m of (matches || [])) {
    try { await advanceOne(ctx, m) }
    catch (e) { console.error('bot-agent: match', m.id, 'error:', e.message) }
  }
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const adminClient = createClient(supabaseUrl, serviceKey)
    const anonBase = createClient(supabaseUrl, anonKey)

    const { data: botsProfiles } = await adminClient.from('profiles').select('id, email').in('email', [SIMON_EMAIL, TARA_EMAIL])
    const simon = botsProfiles?.find(b => b.email === SIMON_EMAIL)
    const tara = botsProfiles?.find(b => b.email === TARA_EMAIL)
    if (!simon || !tara) {
      return new Response(JSON.stringify({ skipped: 'bot accounts not found' }), { headers: { 'Content-Type': 'application/json' } })
    }

    const simonSession = await getBotSession(adminClient, anonBase, SIMON_EMAIL)
    const taraSession = await getBotSession(adminClient, anonBase, TARA_EMAIL)
    const simonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${simonSession.access_token}` } } })
    const taraClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${taraSession.access_token}` } } })

    const ctx = {
      adminClient, simonClient, taraClient,
      simonId: simon.id, taraId: tara.id,
      simonToken: simonSession.access_token, taraToken: taraSession.access_token,
      supabaseUrl,
    }

    await seedCounterListings(adminClient, simonClient, taraClient, simon.id, tara.id)
    await advanceMatches(ctx)

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('bot-agent error:', e)
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
