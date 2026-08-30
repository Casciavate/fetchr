// Retired: this function pre-dated the escrow/Stripe Connect flow and was
// never removed after stripe-connect's authenticated create_payment_intent
// action superseded it. It took a client-supplied amount/matchId with no
// auth check and no escrow (auto-capture), so it stayed live and callable
// by anyone with a valid Supabase session even though nothing in src/ ever
// called it. Kept only as an inert stub — ask an operator to fully delete
// the function (`supabase functions delete create-payment`) once confirmed
// safe to remove.
Deno.serve(() => new Response(JSON.stringify({ error: 'Gone. Use stripe-connect instead.' }), {
  status: 410,
  headers: { 'Content-Type': 'application/json' },
}))
