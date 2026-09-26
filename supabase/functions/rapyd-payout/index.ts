// @ts-nocheck
// Global wallet-withdrawal payouts via Rapyd — same purpose as the dormant
// nium-payout function (whichever provider actually gets working sandbox
// credentials first is what Wallet.jsx gets wired to). Stripe Connect
// cross-border transfers are hard-restricted to the US/UK/EEA/CA/CH
// corridor (confirmed live: "Connected accounts in CH cannot be created by
// platforms in AE"), so a UAE-registered platform can never pay a
// traveler outside the UAE through Connect. Rapyd Disburse reaches 190+
// countries via bank transfer and push-to-card (Visa Direct/Mastercard
// Send) and explicitly lists UAE in its EMEA coverage.
//
// Escrow collection from shippers is untouched — this function only ever
// handles the traveler-payout leg (`withdraw_to_bank` in stripe-connect).
// fetchr's own wallet ledger (profiles.wallet_balance, built from atomic
// adjust_wallet_balance calls) is the source of truth for what a user is
// owed, independent of which processor moves the cash.
//
// Auth: Rapyd signs every request — HMAC-SHA256 over
// method+path+salt+timestamp+access_key+secret_key+body, then the hex
// digest itself (as an ASCII string) is base64-encoded. That double
// encoding is a real, well-documented quirk of Rapyd's scheme, not a bug
// in this file — see RAPYD_SIGNATURE_VERIFY below before assuming
// otherwise if requests start failing auth.
//
// Rather than hardcode which fields each of Rapyd's 190+ country/method
// combinations needs, `payout_methods` and `required_fields` ask Rapyd
// directly at request time — same "ask the provider, don't guess" pattern
// stripe-connect already used for `payout_countries`. The frontend renders
// whatever fields come back, so onboarding a beneficiary is one native
// in-app form, not a hosted redirect, and never goes stale as Rapyd adds
// countries or changes requirements.
//
// Required secrets (via `npx supabase secrets set`, never the dashboard or
// MCP tools — see CLAUDE.md's Deploying section):
//   RAPYD_ACCESS_KEY  — from the Rapyd Client Portal, Developers > API access control
//   RAPYD_SECRET_KEY  — same page
//   RAPYD_EWALLET_ID  — fetchr's own Rapyd wallet that payouts draw from
//                       (create one in the Client Portal once the account
//                       is approved; not needed until the `withdraw`
//                       action is actually exercised)
//   RAPYD_BASE_URL    — optional, defaults to the sandbox host below;
//                       override to https://api.rapyd.net for production
//
// Any action below returns `{ unavailable: true, reason: 'not_configured' }`
// instead of throwing if RAPYD_ACCESS_KEY/RAPYD_SECRET_KEY aren't set yet
// (same graceful pattern as flight-search), so deploying this ahead of
// having real credentials can't break anything for existing users.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RAPYD_ACCESS_KEY = Deno.env.get('RAPYD_ACCESS_KEY')
const RAPYD_SECRET_KEY = Deno.env.get('RAPYD_SECRET_KEY')
const RAPYD_EWALLET_ID = Deno.env.get('RAPYD_EWALLET_ID')
const RAPYD_BASE_URL = Deno.env.get('RAPYD_BASE_URL') || 'https://sandboxapi.rapyd.net'
const WITHDRAWAL_FEE_PCT = 0.025

const configured = () => !!(RAPYD_ACCESS_KEY && RAPYD_SECRET_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function randomSalt(len = 12) {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, len)
}

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// RAPYD_SIGNATURE_VERIFY: Rapyd's documented scheme signs
// `method + path + salt + timestamp + access_key + secret_key + body`
// with HMAC-SHA256 keyed on the secret key, then base64-encodes the
// resulting digest's HEX STRING representation — not the raw signature
// bytes. This has not been exercised against a live Rapyd sandbox call
// from this codebase yet; if every request comes back with an auth/
// signature error, check that quirk first before anything else.
async function rapydSignature(method, path, salt, timestamp, bodyStr) {
  const toSign = `${method.toLowerCase()}${path}${salt}${timestamp}${RAPYD_ACCESS_KEY}${RAPYD_SECRET_KEY}${bodyStr}`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(RAPYD_SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign))
  return btoa(toHex(sigBuf))
}

async function rapydRequest(method, path, body = null) {
  const salt = randomSalt()
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const bodyStr = body ? JSON.stringify(body) : ''
  const signature = await rapydSignature(method, path, salt, timestamp, bodyStr)

  const res = await fetch(`${RAPYD_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      access_key: RAPYD_ACCESS_KEY,
      salt,
      timestamp,
      signature,
    },
    body: bodyStr || undefined,
  })
  const json = await res.json().catch(() => ({}))
  // Rapyd wraps every response in { status: { status, message, ... }, data }
  if (!res.ok || json?.status?.status !== 'SUCCESS') {
    const err = new Error(json?.status?.message || `Rapyd API error (${res.status})`)
    err.rapydResponse = json
    throw err
  }
  return json.data
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

    const { action, data } = await req.json()

    if (!configured()) {
      return new Response(JSON.stringify({ unavailable: true, reason: 'not_configured', message: 'Global payouts are not set up yet.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Confirmed 2026-09-26 against a live sandbox call: this signature
    // scheme (HMAC-SHA256 over method+path+salt+timestamp+access_key+
    // secret_key+body, then base64 of the hex digest) authenticates
    // correctly — GET /v1/data/countries on sandboxapi.rapyd.net returned
    // status.status === 'SUCCESS'. If a specific action below ever comes
    // back UNAUTHORIZED_API_CALL again, it means that Rapyd *product*
    // (e.g. Disburse) isn't enabled for this client yet, not a signature
    // bug — Rapyd gates products individually per account, even in sandbox.

    // Same ledger-verification pattern as stripe-connect's
    // verifyWithdrawalEligibility/getVerifiedBalance and the Nium
    // function's copy of it — duplicated deliberately (edge functions
    // don't share a module graph across directories here) and kept small
    // so the copies are easy to eyeball against each other.
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

    // ── Ask Rapyd which payout method types exist for this beneficiary's
    //    country/currency, instead of hardcoding a list that would go
    //    stale the moment Rapyd adds or changes coverage. ──
    if (action === 'payout_methods') {
      const { country, currency } = data
      if (!country || !currency) throw new Error('country and currency required')
      const methods = await rapydRequest('GET', `/v1/payout_methods/countries/${country}?currency=${currency}`)
      return new Response(JSON.stringify({ methods }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Ask Rapyd exactly which fields a given payout method type needs —
    //    the frontend renders this directly as the "add payout method"
    //    form, so it's always correct for whatever country/method the
    //    traveler picked, with no per-country logic to maintain here. ──
    if (action === 'required_fields') {
      const { payoutMethodType } = data
      if (!payoutMethodType) throw new Error('payoutMethodType required')
      const fields = await rapydRequest('GET', `/v1/payout_methods/${payoutMethodType}/required_fields`)
      return new Response(JSON.stringify({ fields }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Where things stand for this user. Mirrors nium-payout's
    //    beneficiary_status / stripe-connect's connect_account_status. ──
    if (action === 'beneficiary_status') {
      const { data: profile } = await adminClient.from('profiles')
        .select('rapyd_beneficiary_id, rapyd_payout_method_type, rapyd_payout_country')
        .eq('id', user.id).single()
      return new Response(JSON.stringify({
        unavailable: false,
        hasBeneficiary: !!profile?.rapyd_beneficiary_id,
        payoutMethodType: profile?.rapyd_payout_method_type || null,
        payoutCountry: profile?.rapyd_payout_country || null,
        readyForPayout: !!profile?.rapyd_beneficiary_id,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Create the beneficiary — native in-app form built from whatever
    //    required_fields returned, submitted straight to Rapyd. The
    //    traveler never leaves the app. `fields` is passed through close
    //    to as-is since its shape is entirely defined by Rapyd's own
    //    required_fields response for the chosen payoutMethodType. ──
    if (action === 'create_beneficiary') {
      const { payoutMethodType, country, currency, category, fields } = data
      if (!payoutMethodType || !country || !currency || !category) {
        throw new Error('payoutMethodType, country, currency and category are required')
      }
      if (!['bank', 'card'].includes(category)) throw new Error('Invalid category')

      const result = await rapydRequest('POST', '/v1/payouts/beneficiary', {
        category,
        entity_type: 'individual',
        payment_type: payoutMethodType,
        country,
        currency,
        ...fields,
      })
      const beneficiaryId = result?.id
      if (!beneficiaryId) throw new Error('Rapyd did not return a beneficiary id')

      await adminClient.from('profiles').update({
        rapyd_beneficiary_id: beneficiaryId,
        rapyd_payout_method_type: payoutMethodType,
        rapyd_payout_country: country,
      }).eq('id', user.id)

      return new Response(JSON.stringify({ success: true, beneficiaryId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Withdraw: same safety shape as stripe-connect's withdraw_to_bank
    //    and nium-payout's withdraw — verify against the ledger, debit
    //    atomically BEFORE calling out (Postgres's row lock is what
    //    actually makes concurrent withdrawals safe), and refund the debit
    //    if the external call fails so a Rapyd error can never just vanish
    //    the user's balance. ──
    if (action === 'withdraw') {
      const { amount, currency } = data
      if (!amount || amount <= 0) throw new Error('Invalid withdrawal amount')
      if (!RAPYD_EWALLET_ID) throw new Error('Payouts are not fully configured yet (missing source wallet) — try again shortly.')

      const { data: profile } = await adminClient.from('profiles')
        .select('rapyd_beneficiary_id, rapyd_payout_method_type').eq('id', user.id).single()
      if (!profile?.rapyd_beneficiary_id) throw new Error('Add a payout method before withdrawing.')

      const safeBalance = await getVerifiedBalance(user.id)
      if (amount > safeBalance + 0.01) {
        throw new Error(`Withdrawal of $${amount.toFixed(2)} exceeds verified balance of $${safeBalance.toFixed(2)}.`)
      }

      const fee = amount * WITHDRAWAL_FEE_PCT
      const netAmount = amount - fee

      const { data: newBalance, error: debitError } = await adminClient
        .rpc('adjust_wallet_balance', { p_user_id: user.id, p_delta: -amount })
      if (debitError) throw new Error(`Withdrawal of $${amount.toFixed(2)} exceeds your available balance.`)

      let payout
      try {
        // sender_entity_type/sender_country left to Rapyd's own defaults
        // for the ewallet where possible — confirm against a live sandbox
        // call whether an explicit `sender` object is actually required
        // here, since Rapyd's docs describe it as needed for some
        // corridors but didn't specify which from what was verifiable
        // outside a logged-in session.
        payout = await rapydRequest('POST', '/v1/payouts', {
          ewallet: RAPYD_EWALLET_ID,
          beneficiary: profile.rapyd_beneficiary_id,
          payout_amount: netAmount,
          payout_currency: currency || 'USD',
          sender_currency: 'USD',
          payout_method_type: profile.rapyd_payout_method_type,
        })
      } catch (payoutError) {
        // The debit already landed but the real payout didn't — credit it
        // back rather than silently vanishing the user's balance.
        await adminClient.rpc('adjust_wallet_balance', { p_user_id: user.id, p_delta: amount })
        throw payoutError
      }

      await adminClient.from('transactions').insert({
        user_id: user.id, type: 'withdrawal', amount,
        description: 'Withdrawal via Rapyd global payout',
        status: 'completed',
        metadata: {
          provider: 'rapyd',
          payout_id: payout?.id || null,
          fee, net: netAmount,
          beneficiary_id: profile.rapyd_beneficiary_id,
          verified_balance_at_withdrawal: safeBalance,
        },
      })

      return new Response(JSON.stringify({
        success: true, newBalance, netAmount, fee,
        payoutId: payout?.id || null,
        estimatedArrival: 'usually within minutes to a few hours, depending on destination country and method',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error(`Unknown action: ${action}`)

  } catch (error) {
    console.error('rapyd-payout function error:', error, error?.rapydResponse)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
