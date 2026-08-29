// @ts-nocheck
// Receives a forwarded booking-confirmation email from SendGrid's Inbound
// Parse webhook (multipart/form-data with `from`, `subject`, `text`/`html`
// fields — see SendGrid's Inbound Parse docs). Matches the sender to a
// fetchr account by email, extracts candidate flight number + date pairs,
// and queues them in pending_flight_imports for the user to review and
// select in-app (ImportFlights.jsx) — nothing is ever auto-added as a live
// flight listing from here.
//
// Setup required (not doable from code — needs domain/DNS access):
// 1. Add an MX record for a subdomain (e.g. parse.fetchr-zeta.app or
//    similar) pointing at SendGrid's inbound parse host, per SendGrid's
//    Inbound Parse setup guide.
// 2. In SendGrid → Settings → Inbound Parse, add that hostname and set the
//    "POST the raw, full MIME message" option OFF, with Destination URL:
//    https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/email-import
// 3. Tell users to forward confirmations to flights@<that-subdomain>.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Same 2-char IATA airline code set as src/components/shared/airlines.js
// (values only — this webhook doesn't need the display names).
const KNOWN_AIRLINE_PREFIXES = new Set(["0B","0D","0G","0M","0P","0X","0Y","1B","1C","1E","1F","1I","1K","1R","1T","1X","1Y","2A","2B","2D","2F","2I","2J","2K","2L","2M","2N","2O","2P","2Q","2R","2S","2T","2U","2W","2X","3B","3E","3F","3G","3I","3K","3L","3M","3O","3P","3Q","3R","3S","3T","3U","3W","4A","4B","4C","4D","4G","4H","4K","4L","4M","4N","4O","4P","4Q","4R","4S","4T","4U","4X","4Z","5B","5C","5D","5E","5G","5H","5J","5K","5L","5M","5N","5P","5Q","5T","5W","5Y","5Z","6A","6B","6C","6D","6E","6F","6G","6H","6I","6J","6K","6P","6R","6T","6U","6V","6W","6Y","7B","7C","7E","7F","7G","7H","7I","7J","7K","7L","7M","7O","7P","7Q","7R","7T","7W","7Y","7Z","8A","8B","8D","8E","8F","8H","8I","8J","8K","8L","8M","8N","8O","8P","8Q","8R","8T","8U","8V","8Z","9A","9C","9E","9H","9I","9J","9K","9L","9N","9Q","9R","9S","9T","9U","9V","9X","9Y","A1","A2","A3","A4","A5","A6","A7","A9","AA","AB","AC","AD","AE","AF","AG","AH","AI","AJ","AK","AL","AM","AN","AO","AP","AQ","AR","AS","AT","AU","AV","AW","AX","AY","AZ","B0","B1","B2","B3","B4","B5","B6","B7","B8","B9","BA","BB","BC","BD","BE","BF","BG","BH","BI","BJ","BK","BL","BM","BN","BP","BQ","BR","BS","BT","BU","BV","BW","BX","BY","BZ","C0","C1","C2","C3","C4","C5","C7","C9","CA","CB","CC","CD","CE","CF","CG","CH","CI","CJ","CL","CM","CN","CO","CP","CQ","CS","CT","CU","CV","CW","CX","CY","CZ","D1","D2","D3","D6","D7","D8","D9","DA","DB","DC","DD","DE","DF","DG","DH","DI","DK","DL","DM","DN","DO","DP","DQ","DR","DS","DT","DU","DV","DX","DY","DZ","E1","E2","E3","E4","E5","E8","E9","EA","EC","ED","EE","EF","EG","EI","EJ","EK","EL","EM","EN","EO","EP","EQ","ER","ES","ET","EU","EV","EW","EX","EY","EZ","F1","F3","F5","F7","F8","F9","FA","FB","FC","FD","FF","FG","FH","FI","FJ","FK","FL","FM","FN","FO","FP","FR","FS","FT","FU","FV","FW","FX","FY","FZ","G0","G1","G4","G5","G6","G7","G8","G9","GA","GB","GE","GF","GG","GH","GI","GJ","GK","GL","GM","GN","GO","GP","GR","GS","GT","GV","GW","GX","GY","GZ","H1","H2","H3","H5","H6","H7","H8","H9","HA","HC","HD","HE","HF","HG","HH","HI","HK","HM","HN","HO","HP","HR","HT","HU","HV","HW","HX","HY","HZ","I2","I3","I4","I5","I6","I7","I8","I9","IA","IB","IC","ID","IE","IF","IG","II","IJ","IK","IN","IO","IP","IQ","IR","IS","IT","IV","IW","IX","IY","IZ","J1","J2","J3","J4","J5","J7","J8","J9","JA","JB","JC","JD","JE","JF","JG","JH","JI","JJ","JK","JL","JM","JN","JO","JP","JQ","JR","JS","JT","JU","JV","JW","JX","JY","JZ","K1","K2","K5","K6","K7","K8","KA","KB","KC","KD","KE","KF","KG","KH","KI","KJ","KK","KL","KM","KN","KO","KP","KQ","KR","KS","KT","KU","KV","KW","KX","KY","KZ","L1","L3","L4","L5","L6","L7","L8","L9","LA","LB","LC","LE","LF","LG","LH","LI","LJ","LK","LM","LN","LO","LP","LQ","LR","LS","LT","LU","LV","LW","LX","LY","LZ","M1","M2","M3","M4","M5","M7","M8","M9","MA","MB","MD","ME","MF","MH","MI","MJ","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MW","MX","MY","MZ","N0","N1","N4","N5","N7","N8","N9","NA","NB","NC","NE","NF","NG","NH","NI","NJ","NK","NL","NM","NN","NP","NQ","NR","NS","NT","NU","NW","NX","NY","NZ","O1","O2","O6","O7","O8","OA","OB","OC","OD","OF","OG","OI","OJ","OK","OL","OM","ON","OO","OP","OQ","OR","OS","OT","OU","OV","OX","OY","OZ","P0","P4","P5","P7","P8","P9","PA","PC","PD","PE","PF","PG","PH","PI","PJ","PK","PL","PM","PN","PO","PP","PQ","PR","PS","PT","PU","PV","PW","PX","PY","PZ","Q2","Q3","Q4","Q5","Q6","Q7","Q8","Q9","QA","QB","QC","QD","QF","QG","QH","QI","QJ","QK","QL","QM","QO","QP","QQ","QR","QS","QT","QU","QV","QW","QX","QY","QZ","R2","R3","R4","R5","R6","R7","R8","RA","RB","RC","RD","RE","RF","RG","RH","RI","RJ","RK","RL","RM","RN","RO","RP","RQ","RR","RS","RT","RU","RV","RW","RX","RY","RZ","S0","S1","S2","S3","S4","S5","S6","S7","S8","S9","SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SP","SQ","SR","SS","ST","SU","SV","SW","SX","SY","SZ","T0","T2","T3","T4","T5","T6","T7","TA","TB","TC","TD","TE","TF","TG","TH","TI","TJ","TK","TL","TM","TN","TO","TP","TQ","TR","TS","TT","TU","TV","TW","TX","TY","TZ","U1","U2","U3","U4","U5","U6","U7","U8","U9","UA","UB","UD","UE","UF","UG","UH","UI","UJ","UK","UL","UM","UN","UO","UP","UQ","UR","US","UT","UU","UW","UX","UZ","V0","V1","V2","V3","V5","V6","V7","V8","V9","VA","VC","VD","VE","VF","VG","VH","VI","VJ","VK","VL","VN","VO","VP","VQ","VR","VS","VT","VU","VV","VW","VX","VY","VZ","W1","W2","W3","W4","W5","W6","W7","W9","WA","WB","WC","WD","WE","WF","WG","WH","WJ","WK","WM","WN","WO","WP","WQ","WR","WS","WU","WV","WW","WX","WY","WZ","X3","X5","XA","XB","XE","XF","XG","XJ","XK","XL","XM","XN","XO","XP","XQ","XR","XT","XV","XW","XX","XY","XZ","Y1","Y4","Y5","Y7","Y8","Y9","YC","YD","YE","YH","YK","YL","YM","YO","YQ","YR","YS","YT","YV","YW","YY","YZ","Z0","Z2","Z3","Z4","Z5","Z6","Z7","Z8","Z9","ZA","ZB","ZC","ZE","ZF","ZG","ZH","ZI","ZJ","ZK","ZL","ZM","ZN","ZP","ZQ","ZS","ZT","ZV","ZW","ZX","ZY","ZZ"])

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
// Kept in sync with src/components/ImportFlights.jsx's extractCandidates —
// same heuristic, ported to Deno so the webhook can parse without calling
// back into the frontend bundle.
function extractCandidates(text, knownCodes) {
  if (!text) return []
  const dateMatches = []
  let m
  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g
  while ((m = isoRe.exec(text))) dateMatches.push({ index: m.index, iso: `${m[1]}-${m[2]}-${m[3]}` })
  const monthNameRe = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi
  while ((m = monthNameRe.exec(text))) {
    const mi = MONTHS.indexOf(m[2].toLowerCase())
    dateMatches.push({ index: m.index, iso: `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` })
  }
  const monthFirstRe = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi
  while ((m = monthFirstRe.exec(text))) {
    const mi = MONTHS.indexOf(m[1].toLowerCase())
    dateMatches.push({ index: m.index, iso: `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` })
  }
  const nearestDate = (pos) => {
    let best = null, bestDist = Infinity
    for (const d of dateMatches) {
      const dist = Math.abs(d.index - pos)
      if (dist < bestDist && dist < 400) { best = d.iso; bestDist = dist }
    }
    return best
  }
  const seen = new Set()
  const found = []
  const flightRe = /\b([A-Za-z][A-Za-z0-9]|[0-9][A-Za-z])\s?(\d{1,4})\b/g
  while ((m = flightRe.exec(text))) {
    const prefix = m[1].toUpperCase()
    if (!knownCodes.has(prefix)) continue
    const flightNumber = `${prefix}${m[2]}`
    const date = nearestDate(m.index)
    if (!date) continue
    const key = `${flightNumber}_${date}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ flightNumber, date })
  }
  return found
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const form = await req.formData()
    const fromRaw = (form.get('from') || '').toString()
    const subject = (form.get('subject') || '').toString()
    const text = (form.get('text') || '').toString() || (form.get('html') || '').toString()

    const emailMatch = fromRaw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
    const senderEmail = emailMatch ? emailMatch[0].toLowerCase() : null
    if (!senderEmail) return new Response('ok', { headers: corsHeaders }) // nothing to match, ack anyway

    const { data: profile } = await adminClient
      .from('profiles').select('id').ilike('email', senderEmail).maybeSingle()
    if (!profile) return new Response('ok', { headers: corsHeaders }) // unrecognised sender — silently drop

    const candidates = extractCandidates(`${subject}\n${text}`, KNOWN_AIRLINE_PREFIXES)

    if (candidates.length > 0) {
      await adminClient.from('pending_flight_imports').insert(
        candidates.map(c => ({
          user_id: profile.id,
          flight_number: c.flightNumber,
          flight_date: c.date,
          raw_subject: subject.slice(0, 200),
          raw_snippet: text.slice(0, 500),
          status: 'pending',
        }))
      )
    }

    return new Response('ok', { headers: corsHeaders })
  } catch (error) {
    console.error('email-import error:', error)
    // Always 200 back to SendGrid regardless of internal errors, so it
    // doesn't retry-storm a malformed or unexpected message.
    return new Response('ok', { headers: corsHeaders })
  }
})
