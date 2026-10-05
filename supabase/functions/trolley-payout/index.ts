// @ts-nocheck
// Global wallet-withdrawal payouts via Trolley (formerly Payment Rails) —
// third payout-provider candidate, alongside the dormant nium-payout and
// rapyd-payout functions (whichever one actually gets exercised against a
// live sandbox successfully is what Wallet.jsx gets wired to). Stripe
// Connect cross-border transfers are hard-restricted to the US/UK/EEA/
// CA/CH corridor (confirmed live: "Connected accounts in CH cannot be
// created by platforms in AE"), so a UAE-registered platform can never pay
// a traveler outside the UAE through Connect. Trolley is purpose-built for
// exactly this shape of business — marketplace/platform paying out many
// individual recipients — reaching 210+ countries via bank transfer,
// PayPal, Venmo, debit card, and check.
//
// Escrow collection from shippers is untouched — this function only ever
// handles the traveler-payout leg (`withdraw_to_bank` in stripe-connect).
// fetchr's own wallet ledger (profiles.wallet_balance, built from atomic
// adjust_wallet_balance calls) is the source of truth for what a user is
// owed, independent of which processor moves the cash.
//
// Auth — confirmed working live against the real sandbox on 2026-10-05
// (GET /v1/recipients/ returned a genuine 200 with an empty recipients
// list, not an auth error):
//   Authorization: prsign <ACCESS_KEY>:<SIGNATURE>
//   X-PR-Timestamp: <unix timestamp>
//   SIGNATURE = hex(hmac_sha256(SECRET_KEY,
//     `${timestamp}\n${METHOD_UPPERCASE}\n${path}\n${bodyStringOrEmpty}\n`))
// Verified against Trolley's own python-sdk source (client.py,
// generate_authorization) — the signature is a raw hex digest
// (hashlib's .hexdigest()), not base64. An earlier version of this file
// base64-encoded the signature and got "Invalid token: bad hash" on every
// request; the message format itself (the \n-joined string above,
// including the trailing \n) was correct from the start.
//
// Required secrets (via `npx supabase secrets set`, never the dashboard or
// MCP tools — see CLAUDE.md's Deploying section):
//   TROLLEY_KEY         — access key, from Dashboard > Settings > API Keys
//   TROLLEY_SECRET_KEY  — secret key, same page
//
// Any action below returns `{ unavailable: true, reason: 'not_configured' }`
// instead of throwing if these aren't set (same graceful pattern as
// flight-search and the other two payout functions), so deploying this
// ahead of confirming the signature works can't break anything for
// existing users.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TROLLEY_KEY = Deno.env.get('TROLLEY_KEY')
const TROLLEY_SECRET_KEY = Deno.env.get('TROLLEY_SECRET_KEY')
const TROLLEY_BASE_URL = 'https://api.trolley.com' // same host for sandbox and production — the access key itself determines the mode
const WITHDRAWAL_FEE_PCT = 0.025

const configured = () => !!(TROLLEY_KEY && TROLLEY_SECRET_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Confirmed against Trolley's own python-sdk source (client.py,
// generate_authorization): the signature is the raw HEX digest
// (hashlib's .hexdigest()), NOT base64 — an earlier version of this file
// base64-encoded the signature bytes and got "Invalid token: bad hash"
// from every request as a result. Message format (timestamp/method/path/
// body joined by \n, with a trailing \n) was correct and unchanged.
async function trolleySignature(method, path, bodyStr, timestamp) {
  const message = `${timestamp}\n${method.toUpperCase()}\n${path}\n${bodyStr}\n`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(TROLLEY_SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return toHex(sigBuf)
}

async function trolleyRequest(method, path, body = null) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const bodyStr = body ? JSON.stringify(body) : ''
  const signature = await trolleySignature(method, path, bodyStr, timestamp)

  const res = await fetch(`${TROLLEY_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `prsign ${TROLLEY_KEY}:${signature}`,
      'X-PR-Timestamp': timestamp,
    },
    body: bodyStr || undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(json?.message || json?.error || `Trolley API error (${res.status})`)
    err.trolleyResponse = json
    throw err
  }
  return json
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

    // Same ledger-verification pattern as stripe-connect's
    // verifyWithdrawalEligibility/getVerifiedBalance, and the Nium/Rapyd
    // functions' copies of it — duplicated deliberately (edge functions
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

    // ── Cheap, side-effect-free call for confirming the signature scheme
    //    actually authenticates before building anything on top of it.
    //    Safe to leave in place — GET on your own merchant profile has no
    //    write effect, same spirit as flight-search's unavailable() path. ──
    if (action === 'debug_ping') {
      try {
        const result = await trolleyRequest('GET', '/v1/recipients/')
        return new Response(JSON.stringify({ ok: true, recipients: result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message, trolleyResponse: e.trolleyResponse || null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // ── Where things stand for this user. Mirrors the other two
    //    functions' beneficiary_status actions. ──
    if (action === 'recipient_status') {
      const { data: profile } = await adminClient.from('profiles')
        .select('trolley_recipient_id, trolley_account_id, trolley_payout_method')
        .eq('id', user.id).single()
      return new Response(JSON.stringify({
        unavailable: false,
        hasRecipient: !!profile?.trolley_recipient_id,
        hasAccount: !!profile?.trolley_account_id,
        payoutMethod: profile?.trolley_payout_method || null,
        readyForPayout: !!profile?.trolley_recipient_id && !!profile?.trolley_account_id,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Create the recipient — native in-app form, no hosted redirect.
    //    Trolley recipients are lightweight (name/email/country/type);
    //    the actual payout details go on as a separate "account" below. ──
    if (action === 'create_recipient') {
      const { email, firstName, lastName, countryCode, type } = data
      if (!email || !countryCode) throw new Error('email and countryCode are required')

      const result = await trolleyRequest('POST', '/v1/recipients/', {
        email,
        firstName,
        lastName,
        type: type || 'individual',
        address: { country: countryCode },
      })
      // Confirmed 2026-10-05 against a live sandbox call: Trolley wraps a
      // single created resource as { ok, recipient: {...} } — the recipient
      // id ("R-...") lives at result.recipient.id, not result.id.
      const recipientId = result?.recipient?.id
      if (!recipientId) throw new Error('Trolley did not return a recipient id: ' + JSON.stringify(result))

      await adminClient.from('profiles').update({ trolley_recipient_id: recipientId }).eq('id', user.id)

      return new Response(JSON.stringify({ success: true, recipientId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Attach the actual payout method (bank account, debit card, etc.)
    //    to the recipient above. `details` is passed through close to
    //    as-is since its required shape varies by payoutMethod and
    //    country — re-validating here would just duplicate Trolley's own
    //    checks; the frontend should surface whatever error Trolley
    //    returns if a field is missing or malformed. ──
    if (action === 'add_account') {
      const { payoutMethod, details } = data
      if (!payoutMethod) throw new Error('payoutMethod is required')
      if (!['bank-transfer', 'paypal', 'check', 'venmo', 'debit-card'].includes(payoutMethod)) {
        throw new Error('Invalid payoutMethod')
      }
      const { data: profile } = await adminClient.from('profiles')
        .select('trolley_recipient_id').eq('id', user.id).single()
      if (!profile?.trolley_recipient_id) throw new Error('Create a recipient first')

      const result = await trolleyRequest('POST', `/v1/recipients/${profile.trolley_recipient_id}/accounts`, {
        type: payoutMethod,
        ...details,
      })
      // Same { ok, account: {...} } wrapping as create_recipient's
      // { ok, recipient: {...} } — not yet confirmed against a live call
      // (only create_recipient has been verified so far), but consistent
      // with Trolley's response pattern; re-check this field path first if
      // add_account ever throws "did not return an account id".
      const accountId = result?.account?.id || result?.id
      if (!accountId) throw new Error('Trolley did not return an account id: ' + JSON.stringify(result))

      await adminClient.from('profiles').update({
        trolley_account_id: accountId,
        trolley_payout_method: payoutMethod,
      }).eq('id', user.id)

      return new Response(JSON.stringify({ success: true, accountId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Withdraw: same safety shape as stripe-connect's withdraw_to_bank
    //    and the Nium/Rapyd functions' withdraw actions — verify against
    //    the ledger, debit atomically BEFORE calling out (Postgres's row
    //    lock is what actually makes concurrent withdrawals safe), and
    //    refund the debit if the external call fails so a Trolley error
    //    can never just vanish the user's balance.
    //
    //    Trolley's payment flow is two calls: create a batch containing
    //    one payment, then start-processing it. If the batch is created
    //    but start-processing then fails, the money hasn't actually moved
    //    yet (it's a pending/draft batch on Trolley's side) — refunding
    //    the wallet debit in that case is correct, not a double-pay risk,
    //    since no funds left fetchr's Trolley balance. ──
    if (action === 'withdraw') {
      const { amount, currency } = data
      if (!amount || amount <= 0) throw new Error('Invalid withdrawal amount')

      const { data: profile } = await adminClient.from('profiles')
        .select('trolley_recipient_id, trolley_account_id').eq('id', user.id).single()
      if (!profile?.trolley_recipient_id || !profile?.trolley_account_id) {
        throw new Error('Add a payout method before withdrawing.')
      }

      const safeBalance = await getVerifiedBalance(user.id)
      if (amount > safeBalance + 0.01) {
        throw new Error(`Withdrawal of $${amount.toFixed(2)} exceeds verified balance of $${safeBalance.toFixed(2)}.`)
      }

      const fee = amount * WITHDRAWAL_FEE_PCT
      const netAmount = amount - fee

      const { data: newBalance, error: debitError } = await adminClient
        .rpc('adjust_wallet_balance', { p_user_id: user.id, p_delta: -amount })
      if (debitError) throw new Error(`Withdrawal of $${amount.toFixed(2)} exceeds your available balance.`)

      let batchId
      try {
        const batchResult = await trolleyRequest('POST', '/v1/batches', {
          currency: currency || 'USD',
          description: `fetchr wallet withdrawal for ${user.email}`,
          payments: [{
            recipient: { id: profile.trolley_recipient_id },
            amount: netAmount.toFixed(2),
            currency: currency || 'USD',
            memo: 'fetchr wallet withdrawal',
          }],
        })
        // Same { ok, batch: {...} } wrapping as create_recipient's
        // { ok, recipient: {...} } — not yet confirmed against a live call.
        batchId = batchResult?.batch?.id || batchResult?.id
        if (!batchId) throw new Error('Trolley did not return a batch id: ' + JSON.stringify(batchResult))
        await trolleyRequest('POST', `/v1/batches/${batchId}/start-processing`)
      } catch (payoutError) {
        // The debit already landed but the real payout didn't — credit it
        // back rather than silently vanishing the user's balance.
        await adminClient.rpc('adjust_wallet_balance', { p_user_id: user.id, p_delta: amount })
        throw payoutError
      }

      await adminClient.from('transactions').insert({
        user_id: user.id, type: 'withdrawal', amount,
        description: 'Withdrawal via Trolley global payout',
        status: 'completed',
        metadata: {
          provider: 'trolley',
          batch_id: batchId,
          fee, net: netAmount,
          recipient_id: profile.trolley_recipient_id,
          verified_balance_at_withdrawal: safeBalance,
        },
      })

      return new Response(JSON.stringify({
        success: true, newBalance, netAmount, fee,
        batchId,
        estimatedArrival: 'depends on destination country and payout method — typically 1-3 business days for bank transfer, faster for PayPal/debit card',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error(`Unknown action: ${action}`)

  } catch (error) {
    console.error('trolley-payout function error:', error, error?.trolleyResponse)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
