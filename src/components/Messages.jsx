import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../supabaseClient';
import {
  Shield, CheckCircle, AlertTriangle, Lock,
  DollarSign, Package, Plane, ShoppingBag
} from 'lucide-react';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '14px',
      fontFamily: 'Inter, sans-serif',
      color: '#1f2937',
      '::placeholder': { color: '#9ca3af' },
      iconColor: '#7c3aed',
    },
    invalid: { color: '#ef4444', iconColor: '#ef4444' },
  },
  hidePostalCode: true,
};

// ── Fee calculator ──
// Shipper pays: deal value (price_per_kg × weight_kg)
// If shop & ship: shipper also pays purchase price + traveler service fee
// Fetchr takes its % cut from the deal value
// Traveler receives: deal value minus Fetchr fee
// Escrow holds: deal value (what shipper pays for transport)
const calcFees = (match) => {
  const pricePerKg = match.agreed_price_per_kg || match.flight?.price_per_kg || 0;
  const weightKg = match.agreed_weight_kg || match.request?.weight_kg || 0;
  const dealValue = pricePerKg * weightKg; // transport fee

  let fetchrPct = 0.10;
  if (dealValue >= 500) fetchrPct = 0.07;
  else if (dealValue >= 200) fetchrPct = 0.085;
  else if (dealValue < 20 && dealValue > 0) fetchrPct = 0.12;

  const fetchrFee = dealValue * fetchrPct;
  const travelerReceives = dealValue - fetchrFee;

  // Shop & Ship: purchase price + traveler shop fee (separate from transport deal)
  const isPurchase = match.request?.requires_purchase;
  const purchasePrice = isPurchase ? (parseFloat(match.request?.purchase_price) || 0) : 0;
  const shopFee = isPurchase ? (parseFloat(match.flight?.shop_and_ship_fee) || 0) : 0;

  // Total shipper pays = transport deal + purchase price + shop fee
  const totalShipperPays = dealValue + purchasePrice + shopFee;

  return {
    dealValue,         // transport fee (what goes into escrow)
    fetchrFee,         // Fetchr's cut from transport fee
    fetchrPct,
    travelerReceives,  // traveler gets this after delivery
    isPurchase,
    purchasePrice,
    shopFee,
    totalShipperPays,
  };
};

const EscrowInner = ({ match, session, onPaymentComplete }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardReady, setCardReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [profile, setProfile] = useState(null);
  const [useNewCard, setUseNewCard] = useState(false);

  const fees = calcFees(match);

  useEffect(() => {
    supabase.from('profiles').select('*')
      .eq('id', session.user.id).single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [session.user.id]);

  const hasSavedCard = !!(profile?.stripe_payment_method_id);
  const showCardForm = !hasSavedCard || useNewCard;

  const callStripe = async (action, data) => {
    const { data: { session: auth } } = await supabase.auth.getSession();
    const res = await fetch(
      'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({ action, data }),
      }
    );
    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'Payment failed');
    return result;
  };

  const handlePay = async () => {
    if (!stripe || !elements) return;
    if (showCardForm && !cardReady) { setError('Card form not ready.'); return; }

    setLoading(true); setError('');

    try {
      // Amount sent in DOLLARS — edge function converts to cents
      const amountInDollars = fees.totalShipperPays;

      if (showCardForm) {
        const cardElement = elements.getElement(CardElement);
        const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card', card: cardElement,
        });
        if (pmError) throw new Error(pmError.message);

        const result = await callStripe('create_payment_intent', {
          matchId: match.id,
          amount: amountInDollars,   // dollars, NOT cents
          currency: 'usd',
          paymentMethodId: paymentMethod.id,
          captureMethod: 'manual',   // hold in escrow until delivery confirmed
        });

        if (result.requiresAction) {
          const { error: actionError } = await stripe.handleNextAction({
            clientSecret: result.clientSecret,
          });
          if (actionError) throw new Error(actionError.message);
        }

      } else {
        // Saved card
        const result = await callStripe('create_payment_intent', {
          matchId: match.id,
          amount: amountInDollars,
          currency: 'usd',
          paymentMethodId: profile.stripe_payment_method_id,
          captureMethod: 'manual',
        });

        const { error: confirmError } = await stripe.confirmCardPayment(
          result.clientSecret,
          { payment_method: profile.stripe_payment_method_id }
        );
        if (confirmError) throw new Error(confirmError.message);
      }

      // Update match to in_escrow
      await supabase.from('matches').update({
        status: 'in_escrow',
        deal_stage: 'in_escrow',
      }).eq('id', match.id);

      // Post system message
      await supabase.from('messages').insert([{
        match_id: match.id,
        sender_id: session.user.id,
        content: `🔒 ESCROW SECURED: $${fees.totalShipperPays.toFixed(2)} is now held securely. The traveler will receive $${fees.travelerReceives.toFixed(2)} upon confirmed delivery.`,
        is_read: false,
      }]);

      setSuccess(true);
      setTimeout(() => onPaymentComplete?.(), 1500);

    } catch (e) {
      setError(e.message || 'Payment failed. Please try again.');
    }
    setLoading(false);
  };

  if (match.status === 'in_escrow') return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <Lock size={28} className="text-blue-600" />
      </div>
      <p className="text-base font-bold text-gray-900 mb-1">Escrow Active</p>
      <p className="text-sm text-gray-500 mb-3">
        ${fees.totalShipperPays.toFixed(2)} is secured. Awaiting delivery confirmation.
      </p>
      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 border border-blue-100">
        Once both parties confirm delivery, ${fees.travelerReceives.toFixed(2)} will be released to the traveler automatically.
      </div>
    </div>
  );

  if (success) return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <CheckCircle size={32} className="text-emerald-500" />
      </div>
      <p className="text-lg font-bold text-gray-900 mb-1">Escrow Secured!</p>
      <p className="text-sm text-gray-500">
        ${fees.totalShipperPays.toFixed(2)} is now held securely. The traveler will receive ${fees.travelerReceives.toFixed(2)} upon delivery.
      </p>
    </div>
  );

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield size={18} className="text-violet-600" />
        <h3 className="font-bold text-gray-900">Secure Escrow Payment</h3>
      </div>

      <div className="text-xs text-gray-500 leading-relaxed bg-violet-50 rounded-xl p-3 border border-violet-100">
        Your payment is held securely by Fetchr. Funds are only released to the traveler after both parties confirm delivery. If anything goes wrong, we refund you.
      </div>

      {/* Full fee breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Payment Breakdown</p>
        </div>

        {/* Transport fee */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <Plane size={13} className="text-violet-500" />
            <p className="text-xs font-bold text-gray-700">Transport Service</p>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>{(match.agreed_weight_kg || match.request?.weight_kg)}kg × ${(match.agreed_price_per_kg || match.flight?.price_per_kg)}/kg</span>
              <span className="font-semibold">${fees.dealValue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-400 text-xs">
              <span>Fetchr service fee ({Math.round(fees.fetchrPct * 100)}%) — deducted from traveler</span>
              <span>−${fees.fetchrFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-emerald-600 text-xs font-semibold">
              <span>Traveler receives on delivery</span>
              <span>${fees.travelerReceives.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Shop & Ship section */}
        {fees.isPurchase && (
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag size={13} className="text-blue-500" />
              <p className="text-xs font-bold text-gray-700">Shop & Ship</p>
            </div>
            <div className="space-y-1.5 text-sm">
              {fees.purchasePrice > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Item purchase price</span>
                  <span className="font-semibold">${fees.purchasePrice.toFixed(2)}</span>
                </div>
              )}
              {fees.shopFee > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Traveler shop & ship fee</span>
                  <span className="font-semibold">${fees.shopFee.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Total */}
        <div className="px-4 py-3 bg-violet-50">
          <div className="flex justify-between text-base font-bold text-violet-700">
            <span>Total you pay today</span>
            <span>${fees.totalShipperPays.toFixed(2)}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            This amount is held in escrow and released to the traveler upon confirmed delivery.
          </p>
        </div>
      </div>

      {/* Saved card selector */}
      {hasSavedCard && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment Method</label>
          {[
            { val: false, label: `${profile?.payout_card_brand ? profile.payout_card_brand.charAt(0).toUpperCase() + profile.payout_card_brand.slice(1) : 'Card'} ****${profile?.payout_card_last4}`, sub: 'Saved card', icon: '💳' },
            { val: true, label: 'Use a different card', sub: 'Enter new card details', icon: '➕' },
          ].map(opt => (
            <button key={String(opt.val)} type="button"
              onClick={() => { setUseNewCard(opt.val); setError(''); }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                useNewCard === opt.val ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-200'
              }`}>
              <span className="text-xl">{opt.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-400">{opt.sub}</p>
              </div>
              {useNewCard === opt.val && <CheckCircle size={16} className="text-violet-600 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}

      {/* Card input */}
      {showCardForm && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Card Details</label>
          <div className="border-2 border-gray-200 rounded-xl px-4 py-3.5 focus-within:border-violet-400 transition-all bg-white">
            <CardElement
              options={{ ...CARD_ELEMENT_OPTIONS, wallets: { link: 'never' } }}
              onReady={() => setCardReady(true)}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
            <Lock size={10} /> Card details encrypted by Stripe
          </p>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mt-2">
            <p className="text-xs text-amber-700 font-bold">🧪 Test Mode</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Card: <strong>4242 4242 4242 4242</strong> · Any future date · Any CVC
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      <button onClick={handlePay}
        disabled={loading || !stripe || (showCardForm && !cardReady)}
        className="w-full btn-primary py-3.5 disabled:opacity-50 flex items-center justify-center gap-2">
        {loading
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
          : <><Lock size={15} /> Pay ${fees.totalShipperPays.toFixed(2)} into Escrow</>
        }
      </button>

      <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
        <Shield size={11} /> Protected by Fetchr Secure Escrow · Powered by Stripe
      </p>
    </div>
  );
};

const EscrowPayment = ({ match, session, onPaymentComplete }) => (
  <Elements stripe={stripePromise}>
    <EscrowInner match={match} session={session} onPaymentComplete={onPaymentComplete} />
  </Elements>
);

export default EscrowPayment;