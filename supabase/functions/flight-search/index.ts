// @ts-nocheck
// Live flight-schedule lookup, proxied server-side so the RapidAPI key
// never reaches the browser. Backed by AeroDataBox's free-tier plan,
// which is metered — every response is cached in Postgres for a few
// hours so repeat searches (same flight number/date, same popular
// route) don't burn quota. If the key isn't configured yet, or the
// provider errors/hits its quota, this returns `unavailable: true`
// instead of throwing — the frontend falls back to manual entry.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours — schedules don't change minute to minute

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const unavailable = (reason, message) => ({ flights: [], unavailable: true, reason, message })

const normalizeAirport = (a) => a && {
  iata: a.iata,
  name: a.shortName || a.name,
  city: a.municipalityName || a.shortName || a.name,
}

const normalizeFlight = (f) => ({
  flightNumber: (f.number || '').replace(/\s/g, ''),
  airline: f.airline?.name || null,
  airlineIata: f.airline?.iata || null,
  aircraft: f.aircraft?.model || null,
  status: f.status || null,
  from: normalizeAirport(f.departure?.airport),
  to: normalizeAirport(f.arrival?.airport),
  departureLocal: f.departure?.scheduledTime?.local || null,
  departureUtc: f.departure?.scheduledTime?.utc || null,
  arrivalLocal: f.arrival?.scheduledTime?.local || null,
  arrivalUtc: f.arrival?.scheduledTime?.utc || null,
})

async function getCached(supabase, key) {
  const { data } = await supabase.from('flight_schedule_cache').select('data, created_at').eq('cache_key', key).maybeSingle()
  if (!data) return null
  if (Date.now() - new Date(data.created_at).getTime() > CACHE_TTL_MS) return null
  return data.data
}

async function setCached(supabase, key, data) {
  await supabase.from('flight_schedule_cache').upsert({ cache_key: key, data, created_at: new Date().toISOString() })
}

async function callAeroDataBox(path, apiKey) {
  const res = await fetch(`https://${RAPIDAPI_HOST}${path}`, {
    headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': RAPIDAPI_HOST },
    signal: AbortSignal.timeout(10000),
  })
  if (res.status === 429 || res.status === 403) {
    const err = new Error('quota_exceeded')
    err.code = 'quota_exceeded'
    throw err
  }
  if (!res.ok) {
    const err = new Error(`provider_error_${res.status}`)
    err.code = 'provider_error'
    throw err
  }
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const apiKey = Deno.env.get('AERODATABOX_RAPIDAPI_KEY')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No auth header')
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) throw new Error('Invalid or expired token')

    const { action, data } = await req.json()

    if (!apiKey) {
      return new Response(JSON.stringify(unavailable('not_configured', 'Live flight search is not set up yet.')), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Flight number + date → the scheduled flight(s) for that number ──
    if (action === 'by_number') {
      const { flightNumber, date } = data
      if (!flightNumber || !date) throw new Error('flightNumber and date required')
      const clean = flightNumber.replace(/\s/g, '').toUpperCase()
      if (!/^[A-Z0-9]{2,8}$/.test(clean)) throw new Error('Invalid flight number format')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date format')
      const cacheKey = `num:${clean}:${date}`

      let flights = await getCached(supabase, cacheKey)
      if (!flights) {
        try {
          const raw = await callAeroDataBox(`/flights/number/${clean}/${date}`, apiKey)
          const seenByNumber = new Set()
          flights = (Array.isArray(raw) ? raw : []).map(normalizeFlight).filter(f => {
            const key = `${f.departureUtc}_${f.arrivalUtc}`
            if (seenByNumber.has(key)) return false
            seenByNumber.add(key)
            return true
          })
          await setCached(supabase, cacheKey, flights)
        } catch (e) {
          return new Response(JSON.stringify(unavailable(e.code || 'provider_error', e.message)), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
      return new Response(JSON.stringify({ flights, unavailable: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Route + date → every scheduled flight on that route that day ──
    if (action === 'by_route') {
      const { fromIata, toIata, date } = data
      if (!fromIata || !toIata || !date) throw new Error('fromIata, toIata and date required')
      if (!/^[A-Z]{3}$/.test(fromIata) || !/^[A-Z]{3}$/.test(toIata)) throw new Error('Invalid IATA code format')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date format')
      const cacheKey = `route:${fromIata}:${toIata}:${date}`

      let flights = await getCached(supabase, cacheKey)
      if (!flights) {
        try {
          const windows = [`${date}T00:00/${date}T11:59`, `${date}T12:00/${date}T23:59`]
          const results = await Promise.all(windows.map(w => {
            const [from, to] = w.split('/')
            return callAeroDataBox(
              `/flights/airports/iata/${fromIata}/${from}/${to}?direction=Departure&withLeg=true&withCancelled=false&withCodeshared=true&withCargo=false&withPrivate=false&withLocation=false`,
              apiKey
            )
          }))
          const all = results.flatMap(r => r.departures || [])
          const seen = new Set()
          flights = all
            .filter(f => f.arrival?.airport?.iata?.toUpperCase() === toIata.toUpperCase())
            .map(normalizeFlight)
            .filter(f => {
              // withCodeshared=true means the same physical flight can show
              // up under multiple marketing flight numbers (e.g. a
              // Lufthansa-operated flight also listed as a United
              // codeshare) — deduping on flightNumber alone let those
              // through as "different" flights. Same departure + arrival
              // timestamp means it's the same physical flight regardless
              // of which airline's number it's filed under.
              const key = `${f.departureUtc}_${f.arrivalUtc}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
          await setCached(supabase, cacheKey, flights)
        } catch (e) {
          return new Response(JSON.stringify(unavailable(e.code || 'provider_error', e.message)), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
      return new Response(JSON.stringify({ flights, unavailable: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Unknown action: ${action}`)

  } catch (error) {
    console.error('Flight search function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
