import React, { useState, useEffect, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { supabase } from '../supabaseClient';
import {
  WalletCards, DollarSign, ArrowDownCircle, ArrowUpCircle,
  CreditCard, CheckCircle, Clock, Shield, AlertTriangle,
  X, ChevronRight, Building, Lock
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

// ── TOP UP FORM (uses Stripe Elements) ──
const TopUpForm = ({ session, profile, onSuccess, onClose }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [amount, setAmount] = useState('');
  const [useNewCard, setUseNewCard] = useState(!profile?.stripe_payment_method_id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('form'); // 'form' | 'processing' | 'success'

  const hasSavedCard = !!(profile?.stripe_payment_method_id);
  const savedCardLabel = hasSavedCard
    ? `${profile.payout_card_brand ? profile.payout_card_brand.charAt(0).toUpperCase() + profile.payout_card_brand.slice(1) : 'Card'} ****${profile.payout_card_last4}`
    : null;

  const callStripeFunction = async (action, data) => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const res = await fetch(
      'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({ action, data }),
      }
    );
    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'Request failed');
    return result;
  };

  const handleTopUp = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount greater than zero.'); return; }
    if (!stripe || !elements) { setError('Stripe not loaded.'); return; }
    setLoading(true); setError(''); setStep('processing');

    try {
      let paymentMethodId = profile?.stripe_payment_method_id;

      if (useNewCard || !hasSavedCard) {
        // Tokenize card via Stripe.js (card never touches your server)
        const cardElement = elements.getElement(CardElement);
        const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
        });
        if (pmError) throw new Error(pmError.message);
        paymentMethodId = paymentMethod.id;
      }

      // Call edge function to charge card
      const result = await callStripeFunction('top_up_wallet', {
        amount: amt,
        paymentMethodId,
      });

      // Handle 3DS if required
      if (result.requiresAction) {
        const { error: actionError, paymentIntent } = await stripe.handleNextAction({
          clientSecret: result.clientSecret,
        });
        if (actionError) throw new Error(actionError.message);

        if (paymentIntent?.status === 'succeeded') {
          await callStripeFunction('confirm_top_up', {
            paymentIntentId: result.paymentIntentId,
            amount: amt,
          });
        } else {
          throw new Error('Payment authentication failed.');
        }
      }

      setStep('success');
      setTimeout(() => onSuccess(amt), 1500);

    } catch (e) {
      setError(e.message);
      setStep('form');
    }
    setLoading(false);
  };

  if (step === 'processing') return (
    <div className="p-8 text-center">
      <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="font-bold text-gray-900 mb-1">Processing Payment</p>
      <p className="text-sm text-gray-500">Charging your card securely via Stripe...</p>
    </div>
  );

  if (step === 'success') return (
    <div className="p-8 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={32} className="text-emerald-500" />
      </div>
      <p className="font-bold text-gray-900 mb-1">Top Up Successful!</p>
      <p className="text-sm text-gray-500">${parseFloat(amount).toFixed(2)} added to your wallet.</p>
    </div>
  );

  return (
    <div className="p-5 space-y-4">
      <h3 className="font-bold text-gray-900 flex items-center gap-2">
        <ArrowDownCircle size={18} className="text-violet-600" /> Top Up Wallet
      </h3>

      {/* Amount */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
          Amount (USD)
        </label>
        <div className="relative">
          <DollarSign size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
          <input
            type="number" placeholder="0.00" min="0.01" step="0.01"
            value={amount}
            onChange={e => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setAmount(v); }}
            className="input-field pl-9"
          />
        </div>
        <div className="flex gap-2 mt-2">
          {[25, 50, 100, 250].map(amt => (
            <button key={amt} type="button" onClick={() => setAmount(amt.toString())}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                amount === amt.toString()
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-violet-300'
              }`}>
              ${amt}
            </button>
          ))}
        </div>
      </div>

      {/* Card selector */}
      {hasSavedCard && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Payment Method
          </label>
          {[
            { id: false, label: savedCardLabel, sub: 'Saved card', icon: '💳' },
            { id: true, label: 'Use a different card', sub: 'Enter new card details', icon: '➕' },
          ].map(opt => (
            <button key={String(opt.id)} type="button"
              onClick={() => setUseNewCard(opt.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                useNewCard === opt.id
                  ? 'border-violet-400 bg-violet-50'
                  : 'border-gray-200 hover:border-violet-200'
              }`}>
              <span className="text-xl">{opt.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-400">{opt.sub}</p>
              </div>
              {useNewCard === opt.id && <CheckCircle size={16} className="text-violet-600 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}

      {/* Stripe Card Element — shown for new card */}
      {(!hasSavedCard || useNewCard) && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
            Card Details
          </label>
          <div className="border-2 border-gray-200 rounded-xl px-4 py-3.5 focus-within:border-violet-400 transition-all bg-white">
            <CardElement options={CARD_ELEMENT_OPTIONS} />
          </div>
          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
            <Lock size={10} /> Card details encrypted by Stripe — never stored on Fetchr servers
          </p>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mt-2">
            <p className="text-xs text-amber-700 font-bold">🧪 Test Mode</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Use card <strong>4000 0027 6000 3184</strong> to trigger 3DS authentication · Or <strong>4242 4242 4242 4242</strong> for instant approval
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-600 text-xs">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 btn-secondary py-3">Cancel</button>
        <button onClick={handleTopUp} disabled={loading || !stripe}
          className="flex-[2] btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50">
          <Shield size={15} />
          {loading ? 'Processing...' : `Pay $${parseFloat(amount) > 0 ? parseFloat(amount).toFixed(2) : '0.00'}`}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
        <Lock size={10} /> Secured by Stripe · PCI DSS compliant
      </p>
    </div>
  );
};

// ── SAVE CARD FORM ──
const SaveCardForm = ({ session, onSuccess, onClose }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!stripe || !elements) return;
    setLoading(true); setError('');

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();

      // Get setup intent
      const res = await fetch(
        'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify({ action: 'create_setup_intent', data: {} }),
        }
      );
      const { clientSecret, error: siError } = await res.json();
      if (siError) throw new Error(siError);

      // Confirm setup with card details
      const cardElement = elements.getElement(CardElement);
      const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      });
      if (confirmError) throw new Error(confirmError.message);

      // Save payment method to profile
      const saveRes = await fetch(
        'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify({
            action: 'save_payment_method',
            data: { paymentMethodId: setupIntent.payment_method },
          }),
        }
      );
      const saveResult = await saveRes.json();
      if (saveResult.error) throw new Error(saveResult.error);

      onSuccess(saveResult);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="p-5 space-y-4">
      <h3 className="font-bold text-gray-900 flex items-center gap-2">
        <CreditCard size={18} className="text-violet-600" /> Save Card
      </h3>
      <p className="text-xs text-gray-500">
        Your card is saved securely by Stripe. It can be used for top ups and escrow payments.
      </p>

      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
          Card Details
        </label>
        <div className="border-2 border-gray-200 rounded-xl px-4 py-3.5 focus-within:border-violet-400 transition-all bg-white">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
        <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
          <Lock size={10} /> Encrypted by Stripe · Never stored on Fetchr servers
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
        <p className="text-xs text-amber-700 font-bold">🧪 Test Mode</p>
        <p className="text-xs text-amber-600 mt-0.5">
          Use <strong>4242 4242 4242 4242</strong> · Any future date · Any 3-digit CVC
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-600 text-xs">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 btn-secondary py-3">Cancel</button>
        <button onClick={handleSave} disabled={loading || !stripe}
          className="flex-[2] btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? 'Saving...' : <><CreditCard size={15} /> Save Card</>}
        </button>
      </div>
    </div>
  );
};

// ── WITHDRAW FORM ──
const WithdrawForm = ({ session, profile, forceWithdrawAll, onSuccess, onClose }) => {
  const [amount, setAmount] = useState(
    forceWithdrawAll ? (profile?.wallet_balance || 0).toFixed(2) : ''
  );
  const [bankDetails, setBankDetails] = useState({
    accountHolderName: profile?.bank_account_holder || '',
    accountNumber: '',
    country: 'US',
  });
  const [useSavedBank, setUseSavedBank] = useState(!!(profile?.bank_account_last4));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('form');
  const WITHDRAWAL_FEE = 2.5;
  const MIN_WITHDRAWAL = forceWithdrawAll ? 0 : 10;

  const hasSavedBank = !!(profile?.bank_account_last4);

  const callStripeFunction = async (action, data) => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const res = await fetch(
      'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({ action, data }),
      }
    );
    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'Request failed');
    return result;
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(amount);
    const balance = profile?.wallet_balance || 0;

    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return; }
    if (amt > balance) { setError(`Insufficient balance. Available: $${balance.toFixed(2)}`); return; }
    if (!forceWithdrawAll && amt < MIN_WITHDRAWAL) {
      setError(`Minimum withdrawal is $${MIN_WITHDRAWAL}.`); return;
    }

    // Save bank account if using new one
    if (!useSavedBank || !hasSavedBank) {
      if (!bankDetails.accountHolderName || !bankDetails.accountNumber) {
        setError('Please fill in all bank account details.'); return;
      }
    }

    setLoading(true); setError(''); setStep('processing');

    try {
      // Save bank account if new
      if (!useSavedBank || !hasSavedBank) {
        await callStripeFunction('save_bank_account', {
          accountHolderName: bankDetails.accountHolderName,
          iban: bankDetails.accountNumber,
          country: bankDetails.country,
          currency: 'usd',
        });
      }

      // Initiate withdrawal
      const result = await callStripeFunction('withdraw_to_bank', { amount: amt });

      setStep('success');
      setTimeout(() => onSuccess(result), 1500);
    } catch (e) {
      setError(e.message);
      setStep('form');
    }
    setLoading(false);
  };

  const fee = parseFloat(amount) > 0 ? parseFloat(amount) * WITHDRAWAL_FEE / 100 : 0;
  const net = parseFloat(amount) > 0 ? parseFloat(amount) - fee : 0;

  if (step === 'processing') return (
    <div className="p-8 text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="font-bold text-gray-900 mb-1">Initiating Withdrawal</p>
      <p className="text-sm text-gray-500">Submitting payout request to Stripe...</p>
    </div>
  );

  if (step === 'success') return (
    <div className="p-8 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={32} className="text-emerald-500" />
      </div>
      <p className="font-bold text-gray-900 mb-1">Withdrawal Initiated!</p>
      <p className="text-sm text-gray-500">
        ${net.toFixed(2)} will arrive in your bank account within 3-5 business days.
      </p>
    </div>
  );

  return (
    <div className="p-5 space-y-4">
      <h3 className="font-bold text-gray-900 flex items-center gap-2">
        <ArrowUpCircle size={18} className="text-gray-700" /> Withdraw to Bank Account
      </h3>
      <p className="text-xs text-gray-400">
        {WITHDRAWAL_FEE}% fee · {forceWithdrawAll ? 'No minimum' : 'Min $10'} · 3-5 business days
      </p>

      {/* Amount */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
          Amount · Balance: ${(profile?.wallet_balance || 0).toFixed(2)}
        </label>
        <div className="relative">
          <DollarSign size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
          <input type="number" placeholder="0.00" min="0.01"
            max={profile?.wallet_balance || 0} step="0.01"
            value={amount}
            onChange={e => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setAmount(v); }}
            className="input-field pl-9"
          />
        </div>
        {(profile?.wallet_balance || 0) > 0 && (
          <button type="button"
            onClick={() => setAmount((profile.wallet_balance || 0).toFixed(2))}
            className="mt-1.5 text-xs text-violet-600 font-semibold hover:text-violet-700">
            Withdraw full balance (${(profile?.wallet_balance || 0).toFixed(2)})
          </button>
        )}
        {parseFloat(amount) > 0 && (
          <div className="mt-2 bg-gray-50 rounded-xl p-3 text-xs space-y-1 border border-gray-100">
            <div className="flex justify-between text-gray-500">
              <span>Withdrawal amount</span><span>${parseFloat(amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-red-400">
              <span>Fee ({WITHDRAWAL_FEE}%)</span><span>-${fee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-1">
              <span>You receive</span><span>${net.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Bank account selector */}
      {hasSavedBank && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Bank Account
          </label>
          {[
            { id: true, label: `Bank account ****${profile.bank_account_last4}`, sub: `${profile.bank_account_holder || 'Saved account'}`, icon: '🏦' },
            { id: false, label: 'Use a different account', sub: 'Enter new bank details', icon: '➕' },
          ].map(opt => (
            <button key={String(opt.id)} type="button"
              onClick={() => setUseSavedBank(opt.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                useSavedBank === opt.id
                  ? 'border-violet-400 bg-violet-50'
                  : 'border-gray-200 hover:border-violet-200'
              }`}>
              <span className="text-xl">{opt.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-400">{opt.sub}</p>
              </div>
              {useSavedBank === opt.id && <CheckCircle size={16} className="text-violet-600 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}

      {/* New bank account fields */}
      {(!hasSavedBank || !useSavedBank) && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Country
            </label>
            <select value={bankDetails.country}
              onChange={e => setBankDetails({ ...bankDetails, country: e.target.value })}
              className="input-field">
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="AE">United Arab Emirates</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
              <option value="AU">Australia</option>
              <option value="CA">Canada</option>
              <option value="SG">Singapore</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Account Holder Name
            </label>
            <input type="text" placeholder="Full name as on bank account"
              value={bankDetails.accountHolderName}
              onChange={e => setBankDetails({ ...bankDetails, accountHolderName: e.target.value })}
              className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              {bankDetails.country === 'US' ? 'Account Number' : 'IBAN'}
            </label>
            <input type="text"
              placeholder={bankDetails.country === 'US' ? '000123456789' : 'GB29NWBK60161331926819'}
              value={bankDetails.accountNumber}
              onChange={e => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
              className="input-field" />
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-xs text-amber-700 font-bold">🧪 Test Mode Bank Details</p>
            <p className="text-xs text-amber-600 mt-0.5">
              US: Account <strong>000123456789</strong> · Routing <strong>110000000</strong><br />
              UK IBAN: <strong>GB29NWBK60161331926819</strong>
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-600 text-xs">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 btn-secondary py-3">Cancel</button>
        <button onClick={handleWithdraw} disabled={loading}
          className="flex-[2] bg-gray-900 text-white rounded-xl py-3 text-sm font-bold hover:bg-gray-800 transition flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? 'Processing...' : <><ArrowUpCircle size={15} /> Withdraw ${net > 0 ? net.toFixed(2) : '0.00'}</>}
        </button>
      </div>
    </div>
  );
};

// ── MAIN WALLET SCREEN ──
const WalletScreen = ({ session, forceWithdrawAll = false }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [activePanel, setActivePanel] = useState(forceWithdrawAll ? 'withdraw' : null);
  const [success, setSuccess] = useState('');
  const [selectedTxn, setSelectedTxn] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const userId = session.user.id;
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (p) setProfile(p);

    const { data: txns } = await supabase
      .from('transactions')
      .select(`*, match:matches(
        flight:flights(from_city, from_code, to_city, to_code, airline, flight_date),
        request:shipment_requests(item_name)
      )`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (txns) setTransactions(txns);
    setLoading(false);
  }, [session.user.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getTxnIcon = (txn) => {
    if (txn.type === 'topup') return '💳';
    if (txn.type === 'withdrawal') return '🏦';
    if (txn.type === 'escrow_release') return '✈️';
    if (txn.type === 'escrow_hold') return '🔒';
    if (txn.type === 'fetchr_fee') return '💼';
    return '💸';
  };

  const isCredit = (txn) => ['topup', 'credit', 'escrow_release'].includes(txn.type);
  const totalCredits = transactions.filter(t => isCredit(t)).reduce((s, t) => s + (t.amount || 0), 0);
  const totalDebits = transactions.filter(t => !isCredit(t) && t.type !== 'fetchr_fee').reduce((s, t) => s + (t.amount || 0), 0);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <Elements stripe={stripePromise}>
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Wallet</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage your Fetchr balance</p>
        </div>

        {success && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
            <CheckCircle size={16} /> {success}
          </div>
        )}

        {/* Balance card */}
        <div className="relative bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-700 rounded-2xl p-6 mb-4 text-white overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-20 translate-x-20" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-16 -translate-x-16" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-violet-200 text-sm">Available Balance</p>
                <p className="text-4xl font-bold mt-1 tracking-tight">
                  ${(profile?.wallet_balance || 0).toFixed(2)}
                </p>
              </div>
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">
                <WalletCards size={26} className="text-white" />
              </div>
            </div>

            {/* Saved card / bank display */}
            <div className="flex items-center gap-3 flex-wrap">
              {profile?.payout_card_last4 && (
                <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-1.5">
                  <CreditCard size={13} className="text-violet-200" />
                  <p className="text-xs text-violet-100 font-semibold">
                    {profile.payout_card_brand
                      ? profile.payout_card_brand.charAt(0).toUpperCase() + profile.payout_card_brand.slice(1)
                      : 'Card'} ****{profile.payout_card_last4}
                  </p>
                </div>
              )}
              {profile?.bank_account_last4 && (
                <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-1.5">
                  <Building size={13} className="text-violet-200" />
                  <p className="text-xs text-violet-100 font-semibold">
                    Bank ****{profile.bank_account_last4}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-violet-300 mt-3">
              <Shield size={11} /> Protected by Stripe · Funds held in segregated account
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: 'Total Received', value: `$${totalCredits.toFixed(2)}`, icon: ArrowDownCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: 'Total Withdrawn', value: `$${totalDebits.toFixed(2)}`, icon: ArrowUpCircle, color: 'text-red-400', bg: 'bg-red-50' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center`}>
                <s.icon size={18} className={s.color} />
              </div>
              <div>
                <p className="text-xs text-gray-400">{s.label}</p>
                <p className="text-lg font-bold text-gray-900">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { id: 'topup', label: 'Top Up', icon: ArrowDownCircle, primary: true },
            { id: 'withdraw', label: 'Withdraw', icon: ArrowUpCircle, primary: false },
            { id: 'save-card', label: 'Save Card', icon: CreditCard, primary: false },
          ].map(btn => (
            <button key={btn.id}
              onClick={() => setActivePanel(activePanel === btn.id ? null : btn.id)}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                activePanel === btn.id
                  ? 'bg-violet-100 text-violet-700'
                  : btn.primary ? 'btn-primary' : 'btn-secondary'
              }`}>
              <btn.icon size={15} /> {btn.label}
            </button>
          ))}
        </div>

        {/* Panels — rendered inside Elements context */}
        {activePanel === 'topup' && (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 mb-4 overflow-hidden">
            <TopUpForm
              session={session}
              profile={profile}
              onSuccess={(amt) => {
                setActivePanel(null);
                setSuccess(`$${amt.toFixed(2)} successfully added to your wallet!`);
                setTimeout(() => setSuccess(''), 5000);
                fetchData();
              }}
              onClose={() => setActivePanel(null)}
            />
          </div>
        )}

        {activePanel === 'withdraw' && (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 mb-4 overflow-hidden">
            <WithdrawForm
              session={session}
              profile={profile}
              forceWithdrawAll={forceWithdrawAll}
              onSuccess={(result) => {
                setActivePanel(null);
                setSuccess(`Withdrawal of $${result.netAmount?.toFixed(2)} initiated. Arrives in ${result.estimatedArrival}.`);
                setTimeout(() => setSuccess(''), 6000);
                fetchData();
              }}
              onClose={() => setActivePanel(null)}
            />
          </div>
        )}

        {activePanel === 'save-card' && (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 mb-4 overflow-hidden">
            <SaveCardForm
              session={session}
              onSuccess={(result) => {
                setActivePanel(null);
                setSuccess(`Card ****${result.last4} saved successfully!`);
                setTimeout(() => setSuccess(''), 4000);
                fetchData();
              }}
              onClose={() => setActivePanel(null)}
            />
          </div>
        )}

        {/* Transaction history */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5">
          <h3 className="font-bold text-gray-900 mb-4">Transaction History</h3>
          {transactions.length === 0 ? (
            <div className="text-center py-10 bg-gray-50 rounded-xl">
              <WalletCards size={24} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No transactions yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {transactions.map((txn, i) => (
                <button key={i} onClick={() => setSelectedTxn(txn)}
                  className="w-full flex items-center justify-between py-3 px-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-xl transition text-left group">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                      isCredit(txn) ? 'bg-emerald-50' : 'bg-red-50'
                    }`}>
                      {getTxnIcon(txn)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 truncate max-w-[180px]">
                        {txn.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-400">
                          {new Date(txn.created_at).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </p>
                        <span className={`badge text-xs ${txn.status === 'pending' ? 'badge-yellow' : 'badge-green'}`}>
                          {txn.status === 'pending'
                            ? <><Clock size={9} /> Processing</>
                            : <><CheckCircle size={9} /> Done</>}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-bold ${isCredit(txn) ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isCredit(txn) ? '+' : '-'}${(txn.amount || 0).toFixed(2)}
                    </p>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Transaction detail modal */}
        {selectedTxn && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-slide-up">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">Transaction Detail</h3>
                <button onClick={() => setSelectedTxn(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="text-center py-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3 ${
                    isCredit(selectedTxn) ? 'bg-emerald-50' : 'bg-red-50'
                  }`}>
                    {getTxnIcon(selectedTxn)}
                  </div>
                  <p className={`text-3xl font-bold ${isCredit(selectedTxn) ? 'text-emerald-600' : 'text-red-500'}`}>
                    {isCredit(selectedTxn) ? '+' : '-'}${(selectedTxn.amount || 0).toFixed(2)}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">{selectedTxn.description}</p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-2.5 text-sm border border-gray-100">
                  {[
                    { label: 'Date', value: new Date(selectedTxn.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) },
                    { label: 'Time', value: new Date(selectedTxn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                    { label: 'Type', value: selectedTxn.type === 'topup' ? 'Wallet Top Up' : selectedTxn.type === 'withdrawal' ? 'Bank Withdrawal' : selectedTxn.type === 'escrow_release' ? 'Delivery Payment' : selectedTxn.type === 'escrow_hold' ? 'Escrow Payment' : selectedTxn.type === 'fetchr_fee' ? 'Fetchr Service Fee' : selectedTxn.type },
                    { label: 'Status', value: selectedTxn.status === 'pending' ? '⏳ Processing' : '✅ Completed', color: selectedTxn.status === 'pending' ? 'text-amber-600' : 'text-emerald-600' },
                  ].map((row, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-gray-400">{row.label}</span>
                      <span className={`font-semibold ${row.color || 'text-gray-800'}`}>{row.value}</span>
                    </div>
                  ))}

                  {selectedTxn.type === 'withdrawal' && selectedTxn.metadata?.fee != null && (
                    <div className="border-t border-gray-200 pt-2 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Gross amount</span>
                        <span className="font-semibold">${selectedTxn.amount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Fee (2.5%)</span>
                        <span className="font-semibold text-red-400">-${selectedTxn.metadata.fee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-gray-800">
                        <span>You received</span>
                        <span>${selectedTxn.metadata.net.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {selectedTxn.match && (
                  <div className="bg-violet-50 rounded-xl p-4 border border-violet-100 space-y-2 text-sm">
                    <p className="text-xs font-bold text-violet-700 mb-2">Deal Details</p>
                    {[
                      { label: 'Route', value: `${selectedTxn.match.flight?.from_code} → ${selectedTxn.match.flight?.to_code}` },
                      { label: 'Item', value: selectedTxn.match.request?.item_name },
                      selectedTxn.match.flight?.airline && { label: 'Airline', value: selectedTxn.match.flight.airline },
                      selectedTxn.match.flight?.flight_date && { label: 'Flight date', value: new Date(selectedTxn.match.flight.flight_date).toLocaleDateString('en-GB') },
                    ].filter(Boolean).map((row, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-gray-400">{row.label}</span>
                        <span className="font-semibold text-gray-800">{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => setSelectedTxn(null)} className="w-full btn-secondary py-3">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Elements>
  );
};

export default WalletScreen;