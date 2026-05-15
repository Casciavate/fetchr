Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { amount, matchId, currency = 'usd' } = body
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')

    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe key not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Step 1: Create a payment method with test card
    const pmResponse = await fetch('https://api.stripe.com/v1/payment_methods', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        type: 'card',
        'card[number]': '4242424242424242',
        'card[exp_month]': '12',
        'card[exp_year]': '2028',
        'card[cvc]': '123',
        'billing_details[name]': 'Fetchr User',
      }).toString(),
    })
    const paymentMethod = await pmResponse.json()

    if (paymentMethod.error) {
      return new Response(JSON.stringify({
        error: `Payment method error: ${paymentMethod.error.message}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Step 2: Create a customer
    const customerResponse = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        description: `Fetchr escrow payment for match ${matchId}`,
        'metadata[matchId]': matchId || '',
      }).toString(),
    })
    const customer = await customerResponse.json()

    // Step 3: Attach payment method to customer
    await fetch(`https://api.stripe.com/v1/payment_methods/${paymentMethod.id}/attach`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customer.id,
      }).toString(),
    })

    // Step 4: Create and confirm payment intent with customer
    const piResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: Math.round(amount * 100).toString(),
        currency: currency,
        customer: customer.id,
        payment_method: paymentMethod.id,
        'metadata[matchId]': matchId || '',
        'payment_method_types[]': 'card',
        confirm: 'true',
        'off_session': 'true',
      }).toString(),
    })

    const paymentIntent = await piResponse.json()

    if (paymentIntent.error) {
      return new Response(JSON.stringify({
        error: `Payment error: ${paymentIntent.error.message}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const success = paymentIntent.status === 'succeeded' ||
                    paymentIntent.status === 'requires_capture'

    return new Response(JSON.stringify({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      success: success || !!paymentIntent.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      type: 'exception'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})