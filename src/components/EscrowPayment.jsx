import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Shield, DollarSign, CheckCircle, Lock, AlertTriangle, Info, WalletCards, CreditCard, PlusCircle } from 'lucide-react';

const STRIPE_CONNECT_URL = 'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect';

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

      // Auto-set payment method based on wallet balance
      if (walletBalance >= data.totalCharged) {
        setPaymentMethod('wallet');
        setWalletAmount(data.totalCharged);
        setCardAmount(0);
      } else if (walletBalance > 0) {
        setPaymentMethod('split');
        setWalletAmount(walletBalance);
        setCardAmount(Math.max(0, data.totalCharged - walletBalance));
      } else {
        setPaymentMethod('card');
        setWalletAmount(0);
        setCardAmount(data.totalCharged);
      }
    } catch (err) {
      console.error('Fee calculation error:', err);
    }
    setLoadingFees(false);
  };

  const fetchWalletBalance = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', session.user.id)
      .single();
    if (data) setWalletBalance(data.wallet_balance || 0);
  };

  useEffect(() => {
    fetchWalletBalance();
  }, []);

  useEffect(() => {
    if (!isAdditionalPayment) fetchFees(defaultSubtotal);
  }, [walletBalance]);

  useEffect(() => {
    if (isAdditionalPayment && customAmount) fetchFees(parseFloat(customAmount) || 0);
  }, [customAmount, walletBalance]);

  const handlePaymentMethodChange = (method) => {
    setPaymentMethod(method);
    if (!fees) return;
    if (method === 'wallet') {
      setWalletAmount(fees.totalCharged);
      setCardAmount(0);
    } else if (method === 'card') {
      setWalletAmount(0);
      setCardAmount(fees.totalCharged);
    } else if (method === 'split') {
      setWalletAmount(Math.min(walletBalance, fees.totalCharged));
      setCardAmount(Math.max(0, fees.totalCharged - walletBalance));
    }
  };

  const handlePayment = async () => {
    if (!fees) { setError('Fee calculation failed. Please try again.'); return; }

    if (paymentMethod === 'card' || (paymentMethod === 'split' && cardAmount > 0)) {
      if (!cardDetails.number || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name) {
        setError('Please fill in all card details.');
        return;
      }
    }

    if (paymentMethod === 'wallet' && walletBalance < fees.totalCharged) {
      setError(`Insufficient wallet balance. You have $${walletBalance.toFixed(2)} but need $${fees.totalCharged.toFixed(2)}.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();

      // Step 1: Deduct from wallet if using wallet
      if ((paymentMethod === 'wallet' || paymentMethod === 'split') && walletAmount > 0) {
        const newBalance = walletBalance - walletAmount;
        const { error: walletError } = await supabase
          .from('profiles')
          .update({ wallet_balance: newBalance })
          .eq('id', session.user.id);

        if (walletError) {
          setError('Failed to process wallet payment: ' + walletError.message);
          setLoading(false);
          return;
        }
      }

      // Step 2: Process card payment if needed
      let paymentIntentId = null;
      if ((paymentMethod === 'card' || paymentMethod === 'split') && cardAmount > 0) {
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
              subtotal: cardAmount / 1.10, // Remove fee to get subtotal
              matchId: match.id,
              travelerStripeAccountId: travelerProfile?.stripe_onboarded
                ? travelerProfile.stripe_account_id
                : null,
            }
          })
        });

        const result = await response.json();
        if (result.error) {
          // Refund wallet if card fails
          if ((paymentMethod === 'split') && walletAmount > 0) {
            await supabase.from('profiles')
              .update({ wallet_balance: walletBalance })
              .eq('id', session.user.id);
          }
          setError(`Card payment error: ${result.error}`);
          setLoading(false);
          return;
        }
        paymentIntentId = result.paymentIntentId;
      }

      // Step 3: Update match status
      if (!isAdditionalPayment) {
        await supabase.from('matches').update({
          status: 'in_escrow',
          agreed_price_per_kg: defaultPricePerKg,
          payment_intent_id: paymentIntentId,
          escrow_amount: fees.totalCharged,
        }).eq('id', match.id);
      }

      // Step 4: Build confirmation message
      let paymentDescription = '';
      if (paymentMethod === 'wallet') {
        paymentDescription = `wallet ($${walletAmount.toFixed(2)})`;
      } else if (paymentMethod === 'card') {
        paymentDescription = `card ($${cardAmount.toFixed(2)})`;
      } else {
        paymentDescription = `wallet ($${walletAmount.toFixed(2)}) + card ($${cardAmount.toFixed(2)})`;
      }

      const messageContent = isAdditionalPayment
        ? `💰 ADDITIONAL PAYMENT CONFIRMED: $${fees.totalCharged.toFixed(2)} added to escrow via ${paymentDescription}${amountNote ? ` — Note: ${amountNote}` : ''}. Traveler will receive $${fees.travelerReceives.toFixed(2)} upon delivery.`
        : `💰 ESCROW PAYMENT CONFIRMED: $${fees.totalCharged.toFixed(2)} securely held in escrow via ${paymentDescription} (Fetchr fee: $${fees.totalFetchrFee.toFixed(2)}). Traveler receives $${fees.travelerReceives.toFixed(2)} on delivery.`;

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

  // Release escrow to traveler wallet on completion
  const releaseToTravelerWallet = async () => {
    const { data: travelerProfile } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', match.traveler_id)
      .single();

    if (travelerProfile && fees) {
      const newBalance = (travelerProfile.wallet_balance || 0) + fees.travelerReceives;
      await supabase.from('profiles')
        .update({ wallet_balance: newBalance })
        .eq('id', match.traveler_id);
    }
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
        Funds held safely until both parties confirm delivery.
      </p>
      {fees && (
        <div className="bg-purple-50 rounded-xl p-4 w-full text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">Deal subtotal</span>
            <span className="font-semibold">${fees.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Fetchr + Stripe fees</span>
            <span>${fees.totalFetchrFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-purple-600 border-t border-purple-100 pt-2">
            <span>Total charged</span>
            <span>${fees.totalCharged.toFixed(2)}</span>
          </div>
          {paymentMethod === 'split' && (
            <>
              <div className="flex justify-between text-xs text-gray-400">
                <span>From wallet</span>
                <span>${walletAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>From card</span>
                <span>${cardAmount.toFixed(2)}</span>
              </div>
            </>
          )}
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

      {/* Additional payment amount */}
      {isAdditionalPayment && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Payment Amount ($) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <DollarSign size={15} className="absolute left-3 top-3 text-gray-400" />
              <input type="number" placeholder="Enter amount"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                className="w-full pl-8 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Note (optional)</label>
            <input type="text" placeholder="e.g. Item purchase price..."
              value={amountNote} onChange={e => setAmountNote(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white" />
          </div>
        </div>
      )}

      {/* Fee breakdown */}
      {fees && !loadingFees && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Deal subtotal</span>
            <span className="font-semibold">${fees.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Fetchr platform fee (10%)</span>
            <span>${fees.fetchrFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Payment processing</span>
            <span>${fees.stripeFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-purple-600 border-t border-gray-200 pt-1.5">
            <span>Total to pay</span>
            <span>${fees.totalCharged.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-green-600 text-xs">
            <span>Traveler receives</span>
            <span>${fees.travelerReceives.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Payment Method Selection */}
      {fees && !loadingFees && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">Choose Payment Method</p>

          {/* Wallet Balance Info */}
          <div className={`flex items-center justify-between rounded-xl p-3 mb-2 border ${
            walletBalance >= fees.totalCharged
              ? 'bg-green-50 border-green-100'
              : 'bg-gray-50 border-gray-100'
          }`}>
            <div className="flex items-center gap-2">
              <WalletCards size={16} className={walletBalance >= fees.totalCharged ? 'text-green-600' : 'text-gray-400'} />
              <div>
                <p className="text-xs font-semibold text-gray-700">Wallet Balance</p>
                <p className={`text-xs ${walletBalance >= fees.totalCharged ? 'text-green-600' : 'text-gray-400'}`}>
                  ${walletBalance.toFixed(2)} available
                </p>
              </div>
            </div>
            {walletBalance < fees.totalCharged && (
              <span className="text-xs text-orange-500 font-semibold">
                ${(fees.totalCharged - walletBalance).toFixed(2)} short
              </span>
            )}
          </div>

          {/* Payment Options */}
          <div className="space-y-2">

            {/* Wallet only */}
            {walletBalance >= fees.totalCharged && (
              <button
                onClick={() => handlePaymentMethodChange('wallet')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition ${
                  paymentMethod === 'wallet'
                    ? 'border-purple-400 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-200'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  paymentMethod === 'wallet' ? 'border-purple-600' : 'border-gray-300'
                }`}>
                  {paymentMethod === 'wallet' && <div className="w-2 h-2 bg-purple-600 rounded-full" />}
                </div>
                <WalletCards size={16} className="text-purple-600" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-800">Pay with Wallet</p>
                  <p className="text-xs text-gray-400">Use your ${walletBalance.toFixed(2)} balance</p>
                </div>
                <span className="ml-auto text-xs bg-green-50 text-green-600 font-semibold px-2 py-1 rounded-full">
                  Instant
                </span>
              </button>
            )}

            {/* Split payment */}
            {walletBalance > 0 && walletBalance < fees.totalCharged && (
              <button
                onClick={() => handlePaymentMethodChange('split')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition ${
                  paymentMethod === 'split'
                    ? 'border-purple-400 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-200'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  paymentMethod === 'split' ? 'border-purple-600' : 'border-gray-300'
                }`}>
                  {paymentMethod === 'split' && <div className="w-2 h-2 bg-purple-600 rounded-full" />}
                </div>
                <PlusCircle size={16} className="text-purple-600" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-800">Split Payment</p>
                  <p className="text-xs text-gray-400">
                    Wallet ${walletBalance.toFixed(2)} + Card ${(fees.totalCharged - walletBalance).toFixed(2)}
                  </p>
                </div>
              </button>
            )}

            {/* Card only */}
            <button
              onClick={() => handlePaymentMethodChange('card')}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition ${
                paymentMethod === 'card'
                  ? 'border-purple-400 bg-purple-50'
                  : 'border-gray-200 hover:border-purple-200'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                paymentMethod === 'card' ? 'border-purple-600' : 'border-gray-300'
              }`}>
                {paymentMethod === 'card' && <div className="w-2 h-2 bg-purple-600 rounded-full" />}
              </div>
              <CreditCard size={16} className="text-purple-600" />
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-800">Pay with Card</p>
                <p className="text-xs text-gray-400">Credit or debit card</p>
              </div>
            </button>

          </div>
        </div>
      )}

      {/* Card Form — show if card or split */}
      {(paymentMethod === 'card' || paymentMethod === 'split') && (
        <div className="space-y-3 mb-4">
          <p className="text-xs font-semibold text-gray-600">
            {paymentMethod === 'split'
              ? `Card payment: $${cardAmount.toFixed(2)}`
              : 'Card details'}
          </p>
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
      )}

      {/* Wallet only summary */}
      {paymentMethod === 'wallet' && fees && (
        <div className="bg-purple-50 rounded-xl p-3 mb-4 flex items-center gap-3">
          <WalletCards size={18} className="text-purple-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-purple-700">
              ${fees.totalCharged.toFixed(2)} will be deducted from your wallet
            </p>
            <p className="text-xs text-purple-500">
              Remaining balance: ${(walletBalance - fees.totalCharged).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-600 text-xs">{error}</p>
        </div>
      )}

      <button
        onClick={handlePayment}
        disabled={loading || !fees || loadingFees ||
          (isAdditionalPayment && (!customAmount || parseFloat(customAmount) <= 0))}
        className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Lock size={14} />
        {loading ? 'Processing...' : `Pay $${fees?.totalCharged.toFixed(2) || '0.00'} into Escrow`}
      </button>

      <p className="text-xs text-gray-400 text-center mt-3 flex items-center justify-center gap-1">
        <Shield size={11} /> Secured by Fetchr. Held safely until delivery confirmed.
      </p>

      {(paymentMethod === 'card' || paymentMethod === 'split') && (
        <div className="mt-3 bg-yellow-50 rounded-xl p-3">
          <p className="text-xs text-yellow-700 font-semibold">🧪 Test Mode</p>
          <p className="text-xs text-yellow-600 mt-0.5">
            Use card: <strong>4242 4242 4242 4242</strong> • Any future expiry • Any CVC
          </p>
        </div>
      )}
    </div>
  );
};

export default EscrowPayment;