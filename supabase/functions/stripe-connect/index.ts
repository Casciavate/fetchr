Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, data } = await req.json();
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return new Response(JSON.stringify({ error: 'Stripe key not configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

    // Tiered fee calculator
    const calculateFees = (subtotalUSD: number) => {
      const stripeFeePercent = 0.029;
      const stripeFeeFixed = 0.30;
      let fetchrFeePercent = 0.10;
      if (subtotalUSD >= 500) fetchrFeePercent = 0.07;
      else if (subtotalUSD >= 200) fetchrFeePercent = 0.085;
      else if (subtotalUSD < 20) fetchrFeePercent = 0.12;

      const fetchrFee = subtotalUSD * fetchrFeePercent;
      const stripeFee = (subtotalUSD + fetchrFee) * stripeFeePercent + stripeFeeFixed;
      const totalFetchrFee = fetchrFee + stripeFee;
      const totalCharged = subtotalUSD + totalFetchrFee;
      const travelerReceives = subtotalUSD - fetchrFee;

      return {
        subtotal: subtotalUSD,
        fetchrFee: Math.round(fetchrFee * 100) / 100,
        fetchrFeePercent: Math.round(fetchrFeePercent * 100),
        stripeFee: Math.round(stripeFee * 100) / 100,
        totalFetchrFee: Math.round(totalFetchrFee * 100) / 100,
        totalCharged: Math.round(totalCharged * 100) / 100,
        travelerReceives: Math.round(travelerReceives * 100) / 100,
        totalChargedCents: Math.round(totalCharged * 100),
        fetchrFeeCents: Math.round(fetchrFee * 100),
        travelerReceivesCents: Math.round(travelerReceives * 100),
      };
    };

    // Get fee breakdown
    if (action === 'get_fees') {
      const fees = calculateFees(data.subtotal);
      return new Response(JSON.stringify(fees), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create escrow payment
    // Strategy: charge full amount, capture Fetchr fee immediately,
    // hold traveler portion until delivery confirmed
    if (action === 'create_escrow_payment') {
      const { subtotal, matchId } = data;
      const fees = calculateFees(subtotal);

      // Step 1: Create payment method (test card)
      const pmRes = await fetch('https://api.stripe.com/v1/payment_methods', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          type: 'card',
          'card[number]': '4242424242424242',
          'card[exp_month]': '12',
          'card[exp_year]': '2028',
          'card[cvc]': '123',
        }).toString(),
      });
      const pm = await pmRes.json();
      if (pm.error) return new Response(JSON.stringify({ error: pm.error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

      // Step 2: Create customer
      const custRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ description: `Fetchr escrow - match ${matchId}`, 'metadata[matchId]': matchId }).toString(),
      });
      const customer = await custRes.json();

      // Step 3: Attach payment method
      await fetch(`https://api.stripe.com/v1/payment_methods/${pm.id}/attach`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ customer: customer.id }).toString(),
      });

      // Step 4: Create payment intent
      // We charge full amount and hold it.
      // On completion we release traveler portion to wallet.
      // Fetchr fee is tracked in metadata.
      const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          amount: fees.totalChargedCents.toString(),
          currency: 'usd',
          customer: customer.id,
          payment_method: pm.id,
          confirm: 'true',
          off_session: 'true',
          'metadata[matchId]': matchId,
          'metadata[subtotal]': fees.subtotal.toString(),
          'metadata[fetchrFee]': fees.fetchrFee.toString(),
          'metadata[stripeFee]': fees.stripeFee.toString(),
          'metadata[travelerReceives]': fees.travelerReceives.toString(),
          description: `Fetchr escrow for match ${matchId}`,
        }).toString(),
      });
      const pi = await piRes.json();

      if (pi.error) return new Response(JSON.stringify({ error: pi.error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

      return new Response(JSON.stringify({
        paymentIntentId: pi.id,
        clientSecret: pi.client_secret,
        status: pi.status,
        success: true,
        fees,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Retrieve payment intent to check status
    if (action === 'get_payment') {
      const { paymentIntentId } = data;
      const res = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}` },
      });
      const pi = await res.json();
      return new Response(JSON.stringify({ status: pi.status, amount: pi.amount, metadata: pi.metadata }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Refund escrow on cancellation
    if (action === 'refund_payment') {
      const { paymentIntentId } = data;
      const res = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ payment_intent: paymentIntentId }).toString(),
      });
      const refund = await refund.json();
      if (refund.error) return new Response(JSON.stringify({ error: refund.error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      return new Response(JSON.stringify({ success: true, refundId: refund.id, status: refund.status }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, status: 400 });
  }
});