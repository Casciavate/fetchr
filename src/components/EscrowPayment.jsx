import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Shield, DollarSign, CheckCircle, Lock, AlertTriangle, Info } from 'lucide-react';

const STRIPE_CONNECT_URL = 'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect';

const EscrowPayment = ({ match, session, onPaymentComplete }) => {
  const [step, setStep] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [loadingFees, setLoadingFees] = useState(true);
  const [error, setError] = useState('');
  const [fees, setFees] = useState(null);
  const [cardDetails, setCardDetails] = useState({
    number: '', expiry: '', cvc: '', name: ''
  });

  const isAdditionalPayment = match.status === 'in_escrow';
  const defaultWeightKg = match.request?.weight_kg || 0;
  const defaultPricePerKg = match.flight?.price_per_kg || 0;
  const defaultSubtotal = defaultWeightKg * defaultPricePerKg;

  const [customAmount, setCustomAmount] = useState('');
  const [amountNote, setAmountNote] = useState('');

  const getSubtotal = () => {
    if (isAdditionalPayment && customAmount) return parseFloat(customAmount) || 0;
    return defaultSubtotal;
  };

  const fetchFees = async (subtotal) => {
    if (!subtotal || subtotal <= 0) { setFees(null); return; }
    setLoadingFees(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const response = await fetch(STRIPE_CONNECT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSession.access_token}`
        },
        body: JSON.stringify({ action: 'get_fees', data: { subtotal } })
      });
      const data = await response.json();
      setFees(data);
    } catch (err) {
      console.error('Fee calculation error:', err);
    }
    setLoadingFees(false);
  };

  useEffect(() => {
    fetchFees(getSubtotal());
  }, [customAmount]);

  useEffect(() => {
    if (!isAdditionalPayment) fetchFees(defaultSubtotal);
  }, []);

  const handlePayment = async () => {
    if (!cardDetails.number || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name) {
      setError('Please fill in all card details.');
      return;
    }
    if (!fees) {
      setError('Fee calculation failed. Please try again.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();

      // Get traveler's Stripe account
      const { data: travelerProfile } = await supabase
        .from('profiles')
        .select('stripe_account_id, stripe_onboarded')
        .eq('id', match.traveler_id)
        .single();

      const response = await fetch(STRIPE_CONNECT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSession.access_token}`
        },
        body: JSON.stringify({
          action: 'create_escrow_payment',
          data: {
            subtotal: fees.subtotal,
            matchId: match.id,
            travelerStripeAccountId: travelerProfile?.stripe_onboarded
              ? travelerProfile.stripe_account_id
              : null,
          }
        })
      });

      const result = await response.json();

      if (result.error) {
        setError(`Payment error: ${result.error}`);
        setLoading(false);
        return;
      }

      if (!result.success) {
        setError('Payment not completed. Please try again.');
        setLoading(false);
        return;
      }

      // Update match in database
      if (!isAdditionalPayment) {
        await supabase.from('matches').update({
          status: 'in_escrow',
          agreed_price_per_kg: defaultPricePerKg,
          payment_intent_id: result.paymentIntentId,
          escrow_amount: fees.totalCharged,
        }).eq('id', match.id);
      }

      // Send confirmation message
      const messageContent = isAdditionalPayment
        ? `💰 ADDITIONAL PAYMENT CONFIRMED: $${fees.totalCharged.toFixed(2)} added to escrow${amountNote ? ` — Note: ${amountNote}` : ''}. Traveler will receive $${fees.travelerReceives.toFixed(2)} upon delivery.`
        : `💰 ESCROW PAYMENT CONFIRMED: $${fees.totalCharged.toFixed(2)} is securely held in escrow (includes Fetchr fee of $${fees.totalFetchrFee.toFixed(2)}). Traveler will receive $${fees.travelerReceives.toFixed(2)} upon successful delivery.`;

      await supabase.from('messages').insert([{
        match_id: match.id,
        sender_id: session.user.id,
        content: messageContent,
        is_read: false
      }]);

      setStep('success');
      onPaymentComplete();

    } catch (err) {
      setError(`Unexpected error: ${err.message}`);
    }
    setLoading(false);
  };

  const formatCard = (val) => val.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim().slice(0, 19);
  const formatExpiry = (val) => val.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5);

  if (step === 'success') return (
    <div className="flex flex-col items-center justify-center py-8 px-6">
      <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-3">
        <CheckCircle size={28} className="text-green-500" />
      </div>
      <h3 className="text-lg font-bold text-gray-800 mb-1">Payment in Escrow!</h3>
      <p className="text-sm text-gray-400 text-center mb-4">
        Funds are securely held until delivery is confirmed by both parties.
      </p>
      {fees && (
        <div className="bg-purple-50 rounded-xl p-4 w-full text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">Deal subtotal</span>
            <span className="font-semibold">${fees.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-red-500">
            <span className="flex items-center gap-1">
              Fetchr fee (incl. Stripe)
              <Info size={11} />
            </span>
            <span>-${fees.totalFetchrFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-purple-600 border-t border-purple-100 pt-2 mt-1">
            <span>Total charged</span>
            <span>${fees.totalCharged.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-green-600 text-xs pt-1">
            <span>Traveler receives on delivery</span>
            <span>${fees.travelerReceives.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={18} className="text-purple-600" />
        <h3 className="font-bold text-gray-800">
          {isAdditionalPayment ? 'Additional Escrow Payment' : 'Secure Escrow Payment'}
        </h3>
      </div>

      {/* Fee Breakdown */}
      <div className="bg-gray-50 rounded-xl p-4 mb-4">
        {isAdditionalPayment ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                Payment Amount ($) <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <DollarSign size={15} className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="number"
                  placeholder="Enter amount"
                  value={customAmount}
                  onChange={e => { setCustomAmount(e.target.value); fetchFees(parseFloat(e.target.value) || 0); }}
                  className="w-full pl-8 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. Item purchase price..."
                value={amountNote}
                onChange={e => setAmountNote(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
              />
            </div>
          </div>
        ) : null}

        {/* Fee breakdown table */}
        {fees && !loadingFees ? (
          <div className={`space-y-1.5 text-sm ${isAdditionalPayment ? 'mt-3 pt-3 border-t border-gray-200' : ''}`}>
            <div className="flex justify-between">
              <span className="text-gray-500">Deal subtotal</span>
              <span className="font-semibold">${fees.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Fetchr platform fee (10%)</span>
              <span>${fees.fetchrFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Payment processing (Stripe)</span>
              <span>${fees.stripeFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-700 border-t border-gray-200 pt-1.5">
              <span>Total Fetchr fees</span>
              <span>${fees.totalFetchrFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-purple-600 border-t border-gray-200 pt-1.5">
              <span>Total you pay</span>
              <span>${fees.totalCharged.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-green-600 text-xs pt-1">
              <span>Traveler receives on delivery</span>
              <span>${fees.travelerReceives.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-3">
            <p className="text-xs text-gray-400">Calculating fees...</p>
          </div>
        )}

        {/* Fee explanation */}
        <div className="mt-3 bg-blue-50 rounded-lg p-2.5 flex items-start gap-2">
          <Info size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-600">
            Fetchr fees include our 10% platform commission plus Stripe's payment processing fee (2.9% + $0.30). This covers all costs so you never pay extra.
          </p>
        </div>
      </div>

      {/* Card Form */}
      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Cardholder Name</label>
          <input type="text" placeholder="John Smith" value={cardDetails.name}
            onChange={e => setCardDetails({ ...cardDetails, name: e.target.value })}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Card Number</label>
          <input type="text" placeholder="4242 4242 4242 4242" value={cardDetails.number}
            onChange={e => setCardDetails({ ...cardDetails, number: formatCard(e.target.value) })}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Expiry</label>
            <input type="text" placeholder="MM/YY" value={cardDetails.expiry}
              onChange={e => setCardDetails({ ...cardDetails, expiry: formatExpiry(e.target.value) })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">CVC</label>
            <input type="text" placeholder="123" maxLength={3} value={cardDetails.cvc}
              onChange={e => setCardDetails({ ...cardDetails, cvc: e.target.value.replace(/\D/g, '') })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-600 text-xs">{error}</p>
        </div>
      )}

      <button
        onClick={handlePayment}
        disabled={loading || !fees || (isAdditionalPayment && (!customAmount || parseFloat(customAmount) <= 0))}
        className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Lock size={14} />
        {loading ? 'Processing...' : `Pay $${fees?.totalCharged.toFixed(2) || '0.00'} into Escrow`}
      </button>

      <p className="text-xs text-gray-400 text-center mt-3 flex items-center justify-center gap-1">
        <Shield size={11} /> Secured by Stripe. Held safely until delivery confirmed.
      </p>

      <div className="mt-3 bg-yellow-50 rounded-xl p-3">
        <p className="text-xs text-yellow-700 font-semibold">🧪 Test Mode</p>
        <p className="text-xs text-yellow-600 mt-0.5">
          Use card: <strong>4242 4242 4242 4242</strong> • Any future expiry • Any CVC
        </p>
      </div>
    </div>
  );
};

export default EscrowPayment;