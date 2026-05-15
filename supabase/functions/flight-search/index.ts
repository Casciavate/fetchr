Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, data } = await req.json()
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')

    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe key not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Calculate fees
    const calculateFees = (subtotalUSD: number) => {
      const stripeFeePercent = 0.029
      const stripeFeeFixed = 0.30
      const fetchrFeePercent = 0.10

      const fetchrFee = subtotalUSD * fetchrFeePercent
      const stripeFee = (subtotalUSD + fetchrFee) * stripeFeePercent + stripeFeeFixed
      const totalFetchrFee = fetchrFee + stripeFee
      const totalCharged = subtotalUSD + totalFetchrFee
      const travelerReceives = subtotalUSD - fetchrFee

      return {
        subtotal: subtotalUSD,
        fetchrFee: Math.round(fetchrFee * 100) / 100,
        stripeFee: Math.round(stripeFee * 100) / 100,
        totalFetchrFee: Math.round(totalFetchrFee * 100) / 100,
        totalCharged: Math.round(totalCharged * 100) / 100,
        travelerReceives: Math.round(travelerReceives * 100) / 100,
        totalChargedCents: Math.round(totalCharged * 100),
      }
    }

    // Get fee breakdown
    if (action === 'get_fees') {
      const { subtotal } = data
      const fees = calculateFees(subtotal)
      return new Response(JSON.stringify(fees), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Create Stripe Connect account for traveler
    if (action === 'create_account') {
      const { email, userId } = data

      const response = await fetch('https://api.stripe.com/v1/accounts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          type: 'express',
          email: email,
          'capabilities[transfers][requested]': 'true',
          'capabilities[card_payments][requested]': 'true',
          'metadata[userId]': userId,
        }).toString(),
      })

      const account = await response.json()
      if (account.error) {
        return new Response(JSON.stringify({ error: account.error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      return new Response(JSON.stringify({ accountId: account.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Create onboarding link
    if (action === 'create_onboarding_link') {
      const { accountId } = data

      const response = await fetch('https://api.stripe.com/v1/account_links', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          account: accountId,
          refresh_url: 'https://fetchr-zeta.vercel.app',
          return_url: 'https://fetchr-zeta.vercel.app',
          type: 'account_onboarding',
        }).toString(),
      })

      const link = await response.json()
      if (link.error) {
        return new Response(JSON.stringify({ error: link.error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      return new Response(JSON.stringify({ url: link.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Create escrow payment
    if (action === 'create_escrow_payment') {
      const { subtotal, matchId, travelerStripeAccountId } = data
      const fees = calculateFees(subtotal)

      // Create payment method
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
        }).toString(),
      })

      const paymentMethod = await pmResponse.json()
      if (paymentMethod.error) {
        return new Response(JSON.stringify({ error: paymentMethod.error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      // Build payment intent params
      const piParams: Record<string, string> = {
        amount: fees.totalChargedCents.toString(),
        currency: 'usd',
        payment_method: paymentMethod.id,
        'metadata[matchId]': matchId,
        'metadata[subtotal]': subtotal.toString(),
        'metadata[fetchrFee]': fees.fetchrFee.toString(),
        'metadata[stripeFee]': fees.stripeFee.toString(),
        'metadata[totalFetchrFee]': fees.totalFetchrFee.toString(),
        'metadata[travelerReceives]': fees.travelerReceives.toString(),
        'payment_method_types[]': 'card',
        capture_method: 'manual',
        confirm: 'true',
      }

      // Add transfer to traveler if they have Stripe Connect
      if (travelerStripeAccountId) {
        piParams['transfer_data[destination]'] = travelerStripeAccountId
        piParams['transfer_data[amount]'] = Math.round(fees.travelerReceives * 100).toString()
      }

      const piResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(piParams).toString(),
      })

      const paymentIntent = await piResponse.json()
      if (paymentIntent.error) {
        return new Response(JSON.stringify({ error: paymentIntent.error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      return new Response(JSON.stringify({
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
        success: true,
        fees,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Capture payment — release escrow
    if (action === 'capture_payment') {
      const { paymentIntentId } = data

      const response = await fetch(
        `https://api.stripe.com/v1/payment_intents/${paymentIntentId}/capture`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )

      const captured = await response.json()
      if (captured.error) {
        return new Response(JSON.stringify({ error: captured.error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      return new Response(JSON.stringify({
        success: true,
        status: captured.status,
        paymentIntentId: captured.id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})