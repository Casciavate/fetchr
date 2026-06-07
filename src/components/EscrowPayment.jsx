import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Shield, CreditCard, DollarSign, CheckCircle, AlertTriangle, Lock } from 'lucide-react';

const EscrowPayment = ({ match, session, onPaymentComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cardDetails, setCardDetails] = useState({ number: '', expiry: '', cvc: '', name: '' });
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'card' or 'wallet'

  const subtotal = (match.flight?.price_per_kg || 0) * (match.request?.weight_kg || 0);
  let fetchrPct = 0.10;
  if (subtotal >= 500) fetchrPct = 0.07;
  else if (subtotal >= 200) fetchrPct = 0.085;
  else if (subtotal < 20) fetchrPct = 0.12;
  const fetchrFee = subtotal * fetchrPct;
  const stripeFee = (subtotal + fetchrFee) * 0.029 + 0.30;
  const totalCharged = subtotal + fetchrFee + stripeFee;
  const travelerReceives = subtotal - fetchrFee;

  const walletBalance = 0; // Would come from profile in real implementation
  const canUseWallet = walletBalance >= totalCharged;

  const formatCard = (v) => v.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim().slice(0, 19);
  const formatExp = (v) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5);

  const handlePay = async () => {
    if (paymentMethod === 'card') {
      if (!cardDetails.number || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name) {
        setError('Please fill all card details.'); return;
      }
    }
    setLoading(true); setError('');

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();

      const res = await fetch(
        'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify({
            action: 'create_payment_intent',
            data: {
              matchId: match.id,
              amount: Math.round(subtotal * 100), // in cents
              currency: 'usd',
            }
          })
        }
      );

      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Payment failed');

      setSuccess(true);
      setTimeout(() => onPaymentComplete?.(), 2000);
    } catch (e) {
      setError(e.message || 'Payment failed. Please try again.');
    }
    setLoading(false);
  };

  if (success) return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <CheckCircle size={32} className="text-emerald-500" />
      </div>
      <p className="text-lg font-bold text-gray-900 mb-1">Escrow Secured!</p>
      <p className="text-sm text-gray-500">
        ${totalCharged.toFixed(2)} is now held securely.
        The traveler will receive ${travelerReceives.toFixed(2)} upon confirmed delivery.
      </p>
    </div>
  );

  if (match.status === 'in_escrow') return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <Lock size={28} className="text-blue-600" />
      </div>
      <p className="text-base font-bold text-gray-900 mb-1">Escrow Active</p>
      <p className="text-sm text-gray-500 mb-3">
        ${totalCharged.toFixed(2)} is secured. Awaiting delivery confirmation.
      </p>
      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 border border-blue-100">
        <p className="font-bold mb-1">What happens next:</p>
        <p>Once both parties confirm delivery, ${travelerReceives.toFixed(2)} will be released to the traveler's wallet automatically.</p>
      </div>
    </div>
  );

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield size={18} className="text-violet-600" />
        <h3 className="font-bold text-gray-900">Secure Escrow Payment</h3>
      </div>

      <div className="text-xs text-gray-500 leading-relaxed bg-violet-50 rounded-xl p-3 border border-violet-100">
        Your payment is held securely by Fetchr. Funds are only released to the traveler after you both confirm delivery. If anything goes wrong, we refund you.
      </div>

      {/* Fee breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="flex justify-between p-3 text-sm">
          <span className="text-gray-500">Shipping ({match.request?.weight_kg}kg × ${match.flight?.price_per_kg}/kg)</span>
          <span className="font-semibold">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between p-3 text-sm">
          <span className="text-gray-500">Fetchr service fee ({Math.round(fetchrPct * 100)}%)</span>
          <span className="font-semibold">${fetchrFee.toFixed(2)}</span>
        </div>
        <div className="flex justify-between p-3 text-sm">
          <span className="text-gray-500">Processing fee</span>
          <span className="font-semibold">${stripeFee.toFixed(2)}</span>
        </div>
        <div className="flex justify-between p-3 text-sm font-bold">
          <span className="text-gray-900">Total charged to you</span>
          <span className="text-violet-700">${totalCharged.toFixed(2)}</span>
        </div>
        <div className="flex justify-between p-3 text-sm">
          <span className="text-emerald-600 font-medium">Traveler receives (on delivery)</span>
          <span className="text-emerald-600 font-bold">${travelerReceives.toFixed(2)}</span>
        </div>
      </div>

      {/* Payment method */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { id: 'card', label: '💳 Card', available: true },
          { id: 'wallet', label: `💰 Wallet ($${walletBalance.toFixed(0)})`, available: canUseWallet },
        ].map(opt => (
          <button key={opt.id}
            onClick={() => opt.available && setPaymentMethod(opt.id)}
            disabled={!opt.available}
            className={`p-3 rounded-xl border-2 text-sm font-bold transition-all ${
              paymentMethod === opt.id
                ? 'border-violet-400 bg-violet-50 text-violet-700'
                : opt.available
                  ? 'border-gray-200 text-gray-600 hover:border-violet-200'
                  : 'border-gray-100 text-gray-300 cursor-not-allowed'
            }`}>
            {opt.label}
            {!opt.available && opt.id === 'wallet' && (
              <p className="text-xs font-normal mt-0.5">Insufficient balance</p>
            )}
          </button>
        ))}
      </div>

      {/* Card details */}
      {paymentMethod === 'card' && (
        <div className="space-y-2.5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Name on Card</label>
            <input type="text" placeholder="John Smith" value={cardDetails.name}
              onChange={e => setCardDetails({ ...cardDetails, name: e.target.value })}
              className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Card Number</label>
            <div className="relative">
              <CreditCard size={14} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
              <input type="text" placeholder="4242 4242 4242 4242"
                value={cardDetails.number}
                onChange={e => setCardDetails({ ...cardDetails, number: formatCard(e.target.value) })}
                className="input-field pl-9" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Expiry</label>
              <input type="text" placeholder="MM/YY" value={cardDetails.expiry}
                onChange={e => setCardDetails({ ...cardDetails, expiry: formatExp(e.target.value) })}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">CVC</label>
              <input type="text" placeholder="123" maxLength={4}
                value={cardDetails.cvc}
                onChange={e => setCardDetails({ ...cardDetails, cvc: e.target.value.replace(/\D/g, '') })}
                className="input-field" />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
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

      <button onClick={handlePay} disabled={loading}
        className="w-full btn-primary py-3.5 disabled:opacity-50">
        {loading
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
          : <><Lock size={15} /> Pay ${totalCharged.toFixed(2)} into Escrow</>
        }
      </button>

      <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
        <Shield size={11} /> Protected by Fetchr Secure Escrow · Powered by Stripe
      </p>
    </div>
  );
};

export default EscrowPayment;