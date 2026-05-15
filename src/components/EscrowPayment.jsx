import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Shield, DollarSign, CheckCircle, Lock, AlertTriangle, Edit2 } from 'lucide-react';

const FETCHR_FEE_PERCENT = 10;

const EscrowPayment = ({ match, session, onPaymentComplete }) => {
  const [step, setStep] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [cardDetails, setCardDetails] = useState({
    number: '',
    expiry: '',
    cvc: '',
    name: ''
  });

  // Check if this is an additional payment
  const isAdditionalPayment = match.status === 'in_escrow';

  // Default amounts from deal
  const defaultWeightKg = match.request?.weight_kg || 0;
  const defaultPricePerKg = match.flight?.price_per_kg || 0;
  const defaultSubtotal = defaultWeightKg * defaultPricePerKg;

  // Amendable amount for additional payments
  const [customAmount, setCustomAmount] = useState('');
  const [amountNote, setAmountNote] = useState('');
  const [isEditingAmount, setIsEditingAmount] = useState(isAdditionalPayment);

  const getSubtotal = () => {
    if (isAdditionalPayment && customAmount) {
      return parseFloat(customAmount) || 0;
    }
    return defaultSubtotal;
  };

  const subtotal = getSubtotal();
  const fetchrFee = subtotal * (FETCHR_FEE_PERCENT / 100);
  const total = subtotal + fetchrFee;
  const travelerReceives = subtotal - fetchrFee;

  const handlePayment = async () => {
    if (!cardDetails.number || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name) {
      setError('Please fill in all card details.');
      return;
    }
    if (isAdditionalPayment && !customAmount) {
      setError('Please enter the additional payment amount.');
      return;
    }
    if (total <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    setLoading(true);
    setError('');
    setDebugInfo('');

    try {
      setDebugInfo('Getting auth session...');
      const { data: { session: authSession }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !authSession) {
        setError('Authentication error. Please log out and log back in.');
        setLoading(false);
        return;
      }

      setDebugInfo('Processing payment...');
      const response = await fetch(
        `https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/create-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authSession.access_token}`
          },
          body: JSON.stringify({
            amount: total,
            matchId: match.id,
            currency: 'usd',
            isAdditional: isAdditionalPayment,
            note: amountNote
          })
        }
      );

const result = await response.json();
      setDebugInfo(`Response received: ${result.paymentIntentId ? 'Payment created ✓' : 'No payment ID'}`);

      if (result.error) {
        setError(`Payment error: ${result.error}`);
        setLoading(false);
        return;
      }

      // If we have a paymentIntentId, the payment was created successfully
      if (!result.paymentIntentId && !result.clientSecret) {
        setError(`Payment failed. Please try again.`);
        setLoading(false);
        return;
      }

      setDebugInfo('Updating database...');

      // Update match status
      if (!isAdditionalPayment) {
        const { error: dbError } = await supabase
          .from('matches')
          .update({
            status: 'in_escrow',
            agreed_price_per_kg: defaultPricePerKg,
          })
          .eq('id', match.id);

        if (dbError) {
          setError(`Database error: ${dbError.message}`);
          setLoading(false);
          return;
        }
      }

      // Send confirmation message in chat
      const messageContent = isAdditionalPayment
        ? `💰 ADDITIONAL PAYMENT CONFIRMED: $${total.toFixed(2)} has been added to escrow${amountNote ? ` — Note: ${amountNote}` : ''}. Fetchr fee: $${fetchrFee.toFixed(2)}. Traveler will receive an additional $${travelerReceives.toFixed(2)} upon delivery.`
        : `💰 ESCROW PAYMENT CONFIRMED: $${total.toFixed(2)} has been securely held in escrow. The traveler will receive $${travelerReceives.toFixed(2)} upon successful delivery. The deal is now active!`;

      await supabase.from('messages').insert([{
        match_id: match.id,
        sender_id: session.user.id,
        content: messageContent,
        is_read: false
      }]);

setDebugInfo('');
      setStep('success');
      setTimeout(() => onPaymentComplete(), 500);

    } catch (err) {
      setError(`Unexpected error: ${err.message}`);
    }

    setLoading(false);
  };

  const formatCard = (val) => {
    return val.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim().slice(0, 19);
  };

  const formatExpiry = (val) => {
    return val.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5);
  };

  if (step === 'success') return (
    <div className="flex flex-col items-center justify-center py-8 px-6">
      <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-3">
        <CheckCircle size={28} className="text-green-500" />
      </div>
      <h3 className="text-lg font-bold text-gray-800 mb-1">
        {isAdditionalPayment ? 'Additional Payment Confirmed!' : 'Payment in Escrow!'}
      </h3>
      <p className="text-sm text-gray-400 text-center mb-4">
        ${total.toFixed(2)} has been securely processed.
      </p>
      <div className="bg-purple-50 rounded-xl p-4 w-full text-sm">
        <div className="flex justify-between mb-1">
          <span className="text-gray-500">Amount</span>
          <span className="font-semibold">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="text-gray-500">Fetchr fee (10%)</span>
          <span className="font-semibold">${fetchrFee.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold text-purple-600 border-t border-purple-100 pt-2 mt-2">
          <span>Total paid</span>
          <span>${total.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-green-600 text-xs mt-2">
          <span>Traveler receives on delivery</span>
          <span>${travelerReceives.toFixed(2)}</span>
        </div>
      </div>
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

      {/* Additional payment notice */}
      {isAdditionalPayment && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
          <p className="text-xs text-blue-700 font-semibold mb-0.5">💡 Additional Payment</p>
          <p className="text-xs text-blue-600">
            You can add an additional payment to escrow — for example to cover the item purchase price or an amended delivery fee.
          </p>
        </div>
      )}

      {/* Amount Section */}
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
                  placeholder="Enter amount (e.g. 50.00)"
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  className="w-full pl-8 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                Note <span className="text-gray-400 font-normal">(optional — explain the reason)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Item purchase price, amended delivery fee..."
                value={amountNote}
                onChange={e => setAmountNote(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
              />
            </div>
            {customAmount && parseFloat(customAmount) > 0 && (
              <div className="border-t border-gray-200 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-semibold">${parseFloat(customAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Fetchr fee (10%)</span>
                  <span className="font-semibold">${(parseFloat(customAmount) * 0.10).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-purple-600 border-t border-gray-200 pt-1.5">
                  <span>Total to pay</span>
                  <span>${(parseFloat(customAmount) * 1.10).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-green-600 text-xs">
                  <span>Traveler receives</span>
                  <span>${(parseFloat(customAmount) * 0.90).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{defaultWeightKg}kg × ${defaultPricePerKg}/kg</span>
              <span className="font-semibold">${defaultSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fetchr fee (10%)</span>
              <span className="font-semibold">${fetchrFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-purple-600 border-t border-gray-200 pt-2">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-400">
              Traveler receives ${travelerReceives.toFixed(2)} after Fetchr's fee
            </p>
          </div>
        )}
      </div>

      {/* Card Form */}
      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Cardholder Name</label>
          <input
            type="text"
            placeholder="John Smith"
            value={cardDetails.name}
            onChange={e => setCardDetails({ ...cardDetails, name: e.target.value })}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Card Number</label>
          <input
            type="text"
            placeholder="4242 4242 4242 4242"
            value={cardDetails.number}
            onChange={e => setCardDetails({ ...cardDetails, number: formatCard(e.target.value) })}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Expiry</label>
            <input
              type="text"
              placeholder="MM/YY"
              value={cardDetails.expiry}
              onChange={e => setCardDetails({ ...cardDetails, expiry: formatExpiry(e.target.value) })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">CVC</label>
            <input
              type="text"
              placeholder="123"
              maxLength={3}
              value={cardDetails.cvc}
              onChange={e => setCardDetails({ ...cardDetails, cvc: e.target.value.replace(/\D/g, '') })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-600 text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* Debug info */}
      {debugInfo && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3">
          <p className="text-blue-600 text-xs font-mono">{debugInfo}</p>
        </div>
      )}

      <button
        onClick={handlePayment}
        disabled={loading || (isAdditionalPayment && (!customAmount || parseFloat(customAmount) <= 0))}
        className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Lock size={14} />
        {loading ? 'Processing...' : `Pay $${total > 0 ? total.toFixed(2) : '0.00'} into Escrow`}
      </button>

      <p className="text-xs text-gray-400 text-center mt-3 flex items-center justify-center gap-1">
        <Shield size={11} /> Secured by Stripe. Money held safely until delivery confirmed.
      </p>

      <div className="mt-3 bg-yellow-50 rounded-xl p-3">
        <p className="text-xs text-yellow-700 font-semibold">🧪 Test Mode</p>
        <p className="text-xs text-yellow-600 mt-0.5">
          Use card: <strong>4242 4242 4242 4242</strong> • Any future expiry • Any 3-digit CVC
        </p>
      </div>
    </div>
  );
};

export default EscrowPayment;