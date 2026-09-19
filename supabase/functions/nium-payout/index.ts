// @ts-nocheck
// Global wallet-withdrawal payouts via Nium — replaces Stripe Connect for
// this leg of the money flow. Stripe Connect cross-border transfers only
// work between a platform and connected accounts in the same
// US/UK/EEA/CA/CH corridor (confirmed live: "Connected accounts in CH
// cannot be created by platforms in AE"), so a UAE-registered platform can
// never pay a traveler outside the UAE through Connect, no matter how the
// account is configured. Nium reaches 190+ countries via bank transfer and
// push-to-card (Visa Direct / Mastercard Send) from a single UAE-based
// Nium client — no second legal entity, no second platform account.
//
// Escrow collection from shippers is untouched — this function only ever
// handles the traveler-payout leg (`withdraw_to_bank` in stripe-connect).
// fetchr's own wallet ledger (profiles.wallet_balance, built from atomic
// adjust_wallet_balance calls) is the source of truth for what a user is
// owed; it's independent of which processor actually moves the cash, so
// switching payout rails here requires no change to how that ledger works.
//
// Auth: simple `x-api-key` header + clientHashId as a URL path segment —
// no request signing (confirmed against Nium's own docs).
//
// Required secrets (set via `npx supabase secrets set`, never the
// dashboard or MCP tools — see CLAUDE.md's Deploying section):
//   NIUM_API_KEY          — sandbox or production key from the Nium portal
//   NIUM_CLIENT_HASH_ID   — fetchr's own client id
//   NIUM_CUSTOMER_HASH_ID — fetchr's own customer record (the wallet holder;
//                           travelers are beneficiaries OF this customer,
//                           not separate Nium customers themselves)
//   NIUM_WALLET_HASH_ID   — the funded wallet remittances draw from
//   NIUM_API_BASE_URL     — optional, defaults to https://gateway.nium.com;
//                           confirm the actual sandbox host from the Nium
//                           portal once signed up — Nium's docs did not
//                           make the sandbox-vs-production host split
//                           unambiguous from outside a logged-in session.
//
// Any action below returns `{ unavailable: true, reason: 'not_configured' }`
// instead of throwing if these secrets aren't set yet, same pattern as
// flight-search's graceful fallback — so deploying this ahead of having
// real Nium credentials can't break anything for existing users.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const NIUM_API_KEY = Deno.env.get('NIUM_API_KEY')
const NIUM_CLIENT_HASH_ID = Deno.env.get('NIUM_CLIENT_HASH_ID')
const NIUM_CUSTOMER_HASH_ID = Deno.env.get('NIUM_CUSTOMER_HASH_ID')
const NIUM_WALLET_HASH_ID = Deno.env.get('NIUM_WALLET_HASH_ID')
const NIUM_API_BASE_URL = Deno.env.get('NIUM_API_BASE_URL') || 'https://gateway.nium.com'
const WITHDRAWAL_FEE_PCT = 0.025

const configured = () => !!(NIUM_API_KEY && NIUM_CLIENT_HASH_ID && NIUM_CUSTOMER_HASH_ID && NIUM_WALLET_HASH_ID)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function niumRequest(path, options = {}) {
  const res = await fetch(`${NIUM_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'x-api-key': NIUM_API_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(json?.message || json?.error?.message || `Nium API error (${res.status})`)
    err.niumResponse = json
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
    // verifyWithdrawalEligibility/getVerifiedBalance — duplicated rather
    // than shared (edge functions don't share a module graph across
    // directories here), kept intentionally small so the two copies are
    // easy to eyeball against each other if one changes.
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

    // ── Where things stand for this user: do they have a beneficiary and
    //    a payment account on file yet? Mirrors connect_account_status. ──
    if (action === 'beneficiary_status') {
      const { data: profile } = await adminClient.from('profiles')
        .select('nium_beneficiary_id, nium_payment_account_id, nium_payout_method, nium_payout_country')
        .eq('id', user.id).single()
      return new Response(JSON.stringify({
        unavailable: false,
        hasBeneficiary: !!profile?.nium_beneficiary_id,
        hasPaymentAccount: !!profile?.nium_payment_account_id,
        payoutMethod: profile?.nium_payout_method || null,
        payoutCountry: profile?.nium_payout_country || null,
        readyForPayout: !!profile?.nium_beneficiary_id && !!profile?.nium_payment_account_id,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Create (or recreate, if the payout country changed) the
    //    beneficiary record — this is fetchr's own native form, not a
    //    hosted redirect: the traveler never leaves the app. ──
    if (action === 'create_beneficiary') {
      const {
        fullName, countryCode, currency, payoutMethod, // 'CARD' | 'LOCAL' | 'SWIFT'
        address, city, state, postcode,
        email, contactCountryCode, contactNumber, dob,
      } = data
      if (!fullName || !countryCode || !currency || !payoutMethod) {
        throw new Error('fullName, countryCode, currency and payoutMethod are required')
      }
      if (!['CARD', 'LOCAL', 'SWIFT'].includes(payoutMethod)) throw new Error('Invalid payoutMethod')

      const body = {
        beneficiaryName: fullName,
        beneficiaryAccountType: 'Individual',
        beneficiaryCountryCode: countryCode,
        destinationCurrency: currency,
        payoutMethod,
        beneficiaryAddress: address,
        beneficiaryCity: city,
        beneficiaryState: state,
        beneficiaryPostcode: postcode,
        beneficiaryEmail: email || user.email,
        beneficiaryContactCountryCode: contactCountryCode,
        beneficiaryContactNumber: contactNumber,
        beneficiaryDob: dob,
      }
      const result = await niumRequest(
        `/api/v2/clients/${NIUM_CLIENT_HASH_ID}/customers/${NIUM_CUSTOMER_HASH_ID}/beneficiaries`,
        { method: 'POST', body: JSON.stringify(body) }
      )
      const beneficiaryHashId = result.beneficiaryHashId || result.id
      if (!beneficiaryHashId) throw new Error('Nium did not return a beneficiaryHashId')

      await adminClient.from('profiles').update({
        nium_beneficiary_id: beneficiaryHashId,
        nium_payment_account_id: null, // a new beneficiary needs a new payment account too
        nium_payout_method: payoutMethod,
        nium_payout_country: countryCode,
      }).eq('id', user.id)

      return new Response(JSON.stringify({ success: true, beneficiaryHashId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Attach the actual card or bank details to the beneficiary above.
    //    cardDetails/bankDetails shape depends on payoutMethod — passed
    //    through close to as-is, since Nium's required fields vary by
    //    destination country (see payout_methods_bank_account_spec) and
    //    re-validating them here would just duplicate Nium's own checks. ──
    if (action === 'add_payment_account') {
      const { cardDetails, bankDetails } = data
      const { data: profile } = await adminClient.from('profiles')
        .select('nium_beneficiary_id, nium_payout_method').eq('id', user.id).single()
      if (!profile?.nium_beneficiary_id) throw new Error('Create a beneficiary first')

      const body = profile.nium_payout_method === 'CARD'
        ? { payoutMethod: 'CARD', ...cardDetails }
        : { payoutMethod: profile.nium_payout_method, ...bankDetails }

      const result = await niumRequest(
        `/api/v3/clients/${NIUM_CLIENT_HASH_ID}/customers/${NIUM_CUSTOMER_HASH_ID}/beneficiaries/${profile.nium_beneficiary_id}/payment-accounts`,
        { method: 'POST', body: JSON.stringify(body) }
      )
      const paymentAccountHashId = result.paymentAccountHashId || result.id
      if (!paymentAccountHashId) throw new Error('Nium did not return a payment account id')

      await adminClient.from('profiles').update({ nium_payment_account_id: paymentAccountHashId }).eq('id', user.id)

      return new Response(JSON.stringify({ success: true, paymentAccountHashId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Withdraw: same safety shape as stripe-connect's withdraw_to_bank —
    //    verify against the ledger, atomically debit BEFORE calling out
    //    (Postgres's row lock is what actually makes concurrent
    //    withdrawals safe), and refund the debit if the external call
    //    fails so a Nium error can never just vanish the user's balance. ──
    if (action === 'withdraw') {
      const { amount } = data
      if (!amount || amount <= 0) throw new Error('Invalid withdrawal amount')

      const { data: profile } = await adminClient.from('profiles')
        .select('nium_beneficiary_id, nium_payment_account_id').eq('id', user.id).single()
      if (!profile?.nium_beneficiary_id || !profile?.nium_payment_account_id) {
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

      let remittance
      try {
        remittance = await niumRequest(
          `/api/v1/client/${NIUM_CLIENT_HASH_ID}/customer/${NIUM_CUSTOMER_HASH_ID}/wallet/${NIUM_WALLET_HASH_ID}/remittance`,
          {
            method: 'POST',
            body: JSON.stringify({
              beneficiary: { id: profile.nium_beneficiary_id },
              payout: { destinationAmount: netAmount.toFixed(2) },
              purposeCode: 'IR005', // "Payment for goods/services rendered" — confirm exact code against Nium's purposeCode list once sandbox access exists
            }),
          }
        )
      } catch (remittanceError) {
        // The debit already landed but the real payout didn't — credit it
        // back rather than silently vanishing the user's balance, exactly
        // like stripe-connect's withdraw_to_bank does on a transfer failure.
        await adminClient.rpc('adjust_wallet_balance', { p_user_id: user.id, p_delta: amount })
        throw remittanceError
      }

      await adminClient.from('transactions').insert({
        user_id: user.id, type: 'withdrawal', amount,
        description: 'Withdrawal via Nium global payout',
        status: 'completed',
        metadata: {
          provider: 'nium',
          remittance_id: remittance.systemReferenceNumber || remittance.id || null,
          fee, net: netAmount,
          beneficiary_id: profile.nium_beneficiary_id,
          verified_balance_at_withdrawal: safeBalance,
        },
      })

      return new Response(JSON.stringify({
        success: true, newBalance, netAmount, fee,
        remittanceId: remittance.systemReferenceNumber || remittance.id || null,
        estimatedArrival: 'usually within minutes to a few hours, depending on destination country and method',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error(`Unknown action: ${action}`)

  } catch (error) {
    console.error('nium-payout function error:', error, error?.niumResponse)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
