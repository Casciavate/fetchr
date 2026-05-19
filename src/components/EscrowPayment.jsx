import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Shield, DollarSign, CheckCircle, Lock,
  AlertTriangle, Info, WalletCards, CreditCard, PlusCircle
} from 'lucide-react';

const STRIPE_URL = 'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect';

const EscrowPayment = ({ match, session, onPaymentComplete }) => {
  const [step, setStep] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [loadingFees, setLoadingFees] = useState(true);
  const [error, setError] = useState('');
  const [fees, setFees] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [walletAmount, setWalletAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [cardDetails, setCardDetails] = useState({ number: '', expiry: '', cvc: '', name: '' });
  const [customAmount, setCustomAmount] = useState('');
  const [amountNote, setAmountNote] = useState('');

  const isAdditional = match.status === 'in_escrow';
  const defaultKg = match.request?.weight_kg || 0;
  const defaultPPK = match.flight?.price_per_kg || 0;
  const defaultSubtotal = defaultKg * defaultPPK;

  const fetchFees = async (subtotal) => {
    if (!subtotal || subtotal <= 0) { setFees(null); return; }
    setLoadingFees(true);
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      const res = await fetch(STRIPE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.access_token}` },
        body: JSON.stringify({ action: 'get_fees', data: { subtotal } })
      });
      const data = await res.json();
      setFees(data);
      if (walletBalance >= data.totalCharged) {
        setPaymentMethod('wallet'); setWalletAmount(data.totalCharged); setCardAmount(0);
      } else if (walletBalance > 0) {
        setPaymentMethod('split'); setWalletAmount(walletBalance); setCardAmount(Math.max(0, data.totalCharged - walletBalance));
      } else {
        setPaymentMethod('card'); setWalletAmount(0); setCardAmount(data.totalCharged);
      }
    } catch (e) { console.error(e); }
    setLoadingFees(false);
  };

  const fetchWallet = async () => {
    const { data } = await supabase.from('profiles').select('wallet_balance').eq('id', session.user.id).single();
    if (data) setWalletBalance(data.wallet_balance || 0);
  };

  useEffect(() => { fetchWallet(); }, []);
  useEffect(() => { if (!isAdditional) fetchFees(defaultSubtotal); }, [walletBalance]);
  useEffect(() => { if (isAdditional && customAmount) fetchFees(parseFloat(customAmount) || 0); }, [customAmount, walletBalance]);

  const handleMethodChange = (method) => {
    setPaymentMethod(method);
    if (!fees) return;
    if (method === 'wallet') { setWalletAmount(fees.totalCharged); setCardAmount(0); }
    else if (method === 'card') { setWalletAmount(0); setCardAmount(fees.totalCharged); }
    else { setWalletAmount(Math.min(walletBalance, fees.totalCharged)); setCardAmount(Math.max(0, fees.totalCharged - walletBalance)); }
  };

  const handlePayment = async () => {
    if (!fees) { setError('Fee calculation failed. Try again.'); return; }
    if ((paymentMethod === 'card' || paymentMethod === 'split') && cardAmount > 0) {
      if (!cardDetails.number || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name) {
        setError('Please fill in all card details.'); return;
      }
    }
    if (paymentMethod === 'wallet' && walletBalance < fees.totalCharged) {
      setError(`Insufficient wallet balance ($${walletBalance.toFixed(2)}).`); return;
    }
    setLoading(true); setError('');
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();

      if ((paymentMethod === 'wallet' || paymentMethod === 'split') && walletAmount > 0) {
        const { error: we } = await supabase.from('profiles').update({ wallet_balance: walletBalance - walletAmount }).eq('id', session.user.id);
        if (we) { setError('Wallet payment failed: ' + we.message); setLoading(false); return; }
      }

      let paymentIntentId = null;
      if ((paymentMethod === 'card' || paymentMethod === 'split') && cardAmount > 0) {
        const { data: tp } = await supabase.from('profiles').select('stripe_account_id, stripe_onboarded').eq('id', match.traveler_id).single();
        const res = await fetch(STRIPE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.access_token}` },
          body: JSON.stringify({ action: 'create_escrow_payment', data: { subtotal: cardAmount / 1.10, matchId: match.id, travelerStripeAccountId: tp?.stripe_onboarded ? tp.stripe_account_id : null } })
        });
        const result = await res.json();
        if (result.error) {
          if (paymentMethod === 'split' && walletAmount > 0) await supabase.from('profiles').update({ wallet_balance: walletBalance }).eq('id', session.user.id);
          setError(`Card error: ${result.error}`); setLoading(false); return;
        }
        paymentIntentId = result.paymentIntentId;
      }

      if (!isAdditional) {
        await supabase.from('matches').update({
          status: 'in_escrow', agreed_price_per_kg: defaultPPK,
          payment_intent_id: paymentIntentId, escrow_amount: fees.totalCharged,
        }).eq('id', match.id);
      }

      const payDesc = paymentMethod === 'wallet' ? `wallet ($${walletAmount.toFixed(2)})` :
        paymentMethod === 'card' ? `card ($${cardAmount.toFixed(2)})` :
        `wallet ($${walletAmount.toFixed(2)}) + card ($${cardAmount.toFixed(2)})`;

      const msg = isAdditional
        ? `💰 ADDITIONAL PAYMENT: $${fees.totalCharged.toFixed(2)} via ${payDesc}${amountNote ? ` — ${amountNote}` : ''}. Traveler receives $${fees.travelerReceives.toFixed(2)} on delivery.`
        : `💰 ESCROW CONFIRMED: $${fees.totalCharged.toFixed(2)} secured via ${payDesc} (Fetchr fee: $${fees.totalFetchrFee.toFixed(2)}). Traveler receives $${fees.travelerReceives.toFixed(2)} on delivery.`;

      await supabase.from('messages').insert([{ match_id: match.id, sender_id: session.user.id, content: msg, is_read: false }]);
      setStep('success'); onPaymentComplete();
    } catch (e) { setError(`Error: ${e.message}`); }
    setLoading(false);
  };

  const formatCard = (v) => v.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim().slice(0, 19);
  const formatExp = (v) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5);

  if (step === 'success') return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
        <CheckCircle size={32} className="text-emerald-500" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-1">Payment Secured!</h3>
      <p className="text-sm text-gray-500 mb-5">Funds held safely until both parties confirm delivery.</p>
      {fees && (
        <div className="bg-gray-50 rounded-xl p-4 w-full text-sm border border-gray-100 space-y-2">
          <div className="flex justify-between text-gray-500"><span>Deal subtotal</span><span>${fees.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-gray-500"><span>Fetchr + Stripe fees</span><span>${fees.totalFetchrFee.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-violet-600 border-t border-gray-200 pt-2"><span>Total charged</span><span>${fees.totalCharged.toFixed(2)}</span></div>
          <div className="flex justify-between text-emerald-600 text-xs pt-1"><span>Traveler receives on delivery</span><span>${fees.travelerReceives.toFixed(2)}</span></div>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
          <Shield size={16} className="text-violet-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">
            {isAdditional ? 'Additional Escrow Payment' : 'Secure Escrow Payment'}
          </h3>
          <p className="text-xs text-gray-400">Protected by Stripe</p>
        </div>
      </div>

      {/* Additional amount */}
      {isAdditional && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Payment Amount ($) *
            </label>
            <div className="relative">
              <DollarSign size={14} className="absolute left-3.5 top-3 text-gray-400" />
              <input type="number" placeholder="Enter amount"
                value={customAmount} onChange={e => setCustomAmount(e.target.value)}
                className="input-field pl-8 py-2.5" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Note (optional)</label>
            <input type="text" placeholder="e.g. Item purchase price, amended fee..."
              value={amountNote} onChange={e => setAmountNote(e.target.value)}
              className="input-field py-2.5" />
          </div>
        </div>
      )}

      {/* Fee breakdown */}
      {fees && !loadingFees ? (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100 space-y-2 text-sm">
          <div className="flex justify-between text-gray-500"><span>Deal subtotal</span><span>${fees.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-gray-500">
            <span>Fetchr platform ({fees.fetchrFeePercent}%)</span><span>${fees.fetchrFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-500"><span>Payment processing</span><span>${fees.stripeFee.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-violet-600 border-t border-gray-200 pt-2"><span>Total to pay</span><span>${fees.totalCharged.toFixed(2)}</span></div>
          <div className="flex justify-between text-emerald-600 text-xs"><span>Traveler receives</span><span>${fees.travelerReceives.toFixed(2)}</span></div>
          <div className="flex items-start gap-2 bg-blue-50 rounded-lg p-2.5 mt-1 border border-blue-100">
            <Info size={12} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-600">All fees are included — no hidden charges.</p>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100 text-center">
          <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-400 mt-2">Calculating fees...</p>
        </div>
      )}

      {/* Payment method */}
      {fees && !loadingFees && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Payment Method</p>

          {/* Wallet balance */}
          <div className={`flex items-center justify-between rounded-xl p-3 mb-2 border ${
            walletBalance >= fees.totalCharged ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100'
          }`}>
            <div className="flex items-center gap-2">
              <WalletCards size={15} className={walletBalance >= fees.totalCharged ? 'text-emerald-600' : 'text-gray-400'} />
              <div>
                <p className="text-xs font-semibold text-gray-700">Wallet Balance</p>
                <p className={`text-xs ${walletBalance >= fees.totalCharged ? 'text-emerald-600' : 'text-gray-400'}`}>
                  ${walletBalance.toFixed(2)} available
                </p>
              </div>
            </div>
            {walletBalance < fees.totalCharged && walletBalance > 0 && (
              <span className="badge badge-yellow">${(fees.totalCharged - walletBalance).toFixed(2)} short</span>
            )}
          </div>

          <div className="space-y-2">
            {walletBalance >= fees.totalCharged && (
              <button onClick={() => handleMethodChange('wallet')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${paymentMethod === 'wallet' ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-200 bg-white'}`}>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${paymentMethod === 'wallet' ? 'border-violet-600' : 'border-gray-300'}`}>
                  {paymentMethod === 'wallet' && <div className="w-2 h-2 bg-violet-600 rounded-full" />}
                </div>
                <WalletCards size={15} className="text-violet-600 flex-shrink-0" />
                <div className="text-left flex-1">
                  <p className="text-sm font-bold text-gray-900">Pay with Wallet</p>
                  <p className="text-xs text-gray-400">Use your ${walletBalance.toFixed(2)} balance</p>
                </div>
                <span className="badge badge-green">Instant</span>
              </button>
            )}

            {walletBalance > 0 && walletBalance < fees.totalCharged && (
              <button onClick={() => handleMethodChange('split')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${paymentMethod === 'split' ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-200 bg-white'}`}>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${paymentMethod === 'split' ? 'border-violet-600' : 'border-gray-300'}`}>
                  {paymentMethod === 'split' && <div className="w-2 h-2 bg-violet-600 rounded-full" />}
                </div>
                <PlusCircle size={15} className="text-violet-600 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-bold text-gray-900">Split Payment</p>
                  <p className="text-xs text-gray-400">Wallet ${walletBalance.toFixed(2)} + Card ${(fees.totalCharged - walletBalance).toFixed(2)}</p>
                </div>
              </button>
            )}

            <button onClick={() => handleMethodChange('card')}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${paymentMethod === 'card' ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-200 bg-white'}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${paymentMethod === 'card' ? 'border-violet-600' : 'border-gray-300'}`}>
                {paymentMethod === 'card' && <div className="w-2 h-2 bg-violet-600 rounded-full" />}
              </div>
              <CreditCard size={15} className="text-violet-600 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm font-bold text-gray-900">Pay with Card</p>
                <p className="text-xs text-gray-400">Credit or debit card</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Card form */}
      {(paymentMethod === 'card' || paymentMethod === 'split') && (
        <div className="space-y-3 mb-4">
          {paymentMethod === 'split' && (
            <div className="bg-violet-50 rounded-xl p-3 border border-violet-100">
              <p className="text-xs font-semibold text-violet-700">
                Card charge: ${cardAmount.toFixed(2)} · Wallet: ${walletAmount.toFixed(2)}
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Cardholder Name</label>
            <input type="text" placeholder="John Smith" value={cardDetails.name}
              onChange={e => setCardDetails({ ...cardDetails, name: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Card Number</label>
            <input type="text" placeholder="4242 4242 4242 4242" value={cardDetails.number}
              onChange={e => setCardDetails({ ...cardDetails, number: formatCard(e.target.value) })} className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Expiry</label>
              <input type="text" placeholder="MM/YY" value={cardDetails.expiry}
                onChange={e => setCardDetails({ ...cardDetails, expiry: formatExp(e.target.value) })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">CVC</label>
              <input type="text" placeholder="123" maxLength={3} value={cardDetails.cvc}
                onChange={e => setCardDetails({ ...cardDetails, cvc: e.target.value.replace(/\D/g, '') })} className="input-field" />
            </div>
          </div>
        </div>
      )}

      {/* Wallet summary */}
      {paymentMethod === 'wallet' && fees && (
        <div className="bg-violet-50 rounded-xl p-3 mb-4 border border-violet-100 flex items-center gap-3">
          <WalletCards size={18} className="text-violet-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-violet-700">${fees.totalCharged.toFixed(2)} from wallet</p>
            <p className="text-xs text-violet-500">Remaining: ${(walletBalance - fees.totalCharged).toFixed(2)}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-600 text-xs">{error}</p>
        </div>
      )}

      <button onClick={handlePayment}
        disabled={loading || !fees || loadingFees || (isAdditional && (!customAmount || parseFloat(customAmount) <= 0))}
        className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 disabled:opacity-50">
        <Lock size={14} />
        {loading ? 'Processing...' : `Pay $${fees?.totalCharged.toFixed(2) || '0.00'} into Escrow`}
      </button>

      <p className="text-xs text-gray-400 text-center mt-3 flex items-center justify-center gap-1">
        <Shield size={11} /> Secured by Stripe · Released on confirmed delivery
      </p>

      {(paymentMethod === 'card' || paymentMethod === 'split') && (
        <div className="mt-3 bg-amber-50 rounded-xl p-3 border border-amber-100">
          <p className="text-xs text-amber-700 font-bold">🧪 Test Mode</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Card: <strong>4242 4242 4242 4242</strong> · Any future date · Any CVC
          </p>
        </div>
      )}
    </div>
  );
};

export default EscrowPayment;