import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  WalletCards, DollarSign, ArrowDownCircle, ArrowUpCircle,
  CreditCard, CheckCircle, Clock, Shield, AlertTriangle,
  X, ChevronRight, TrendingUp, Package, Star
} from 'lucide-react';

const WalletScreen = ({ session, forceWithdrawAll = false }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [cardDetails, setCardDetails] = useState({ number: '', expiry: '', cvc: '', name: '' });
  const [selectedCard, setSelectedCard] = useState('new'); // 'saved' or 'new'
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedTxn, setSelectedTxn] = useState(null);
  const WITHDRAWAL_FEE = 2.5;
  const MIN_WITHDRAWAL = forceWithdrawAll ? 0 : 10;

  const fetchData = async () => {
    setLoading(true);
    const userId = session.user.id;

    const { data: p } = await supabase
      .from('profiles').select('*').eq('id', userId).single();
    if (p) {
      setProfile(p);
      // Auto-select saved card if available
      if (p.payout_card_last4) setSelectedCard('saved');
    }

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
  };

  useEffect(() => {
    fetchData();
    // Auto-open withdraw if coming from delete account flow
    if (forceWithdrawAll) setShowWithdraw(true);
  }, []);

  const formatCard = (v) =>
    v.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim().slice(0, 19);
  const formatExp = (v) =>
    v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5);

  const hasSavedCard = !!(profile?.payout_card_last4);
  const savedCardLabel = hasSavedCard
    ? `${profile.payout_card_brand || 'Card'} ****${profile.payout_card_last4}`
    : null;

  const getCardForTransaction = () => {
    if (selectedCard === 'saved' && hasSavedCard) {
      return { last4: profile.payout_card_last4, brand: profile.payout_card_brand };
    }
    return {
      last4: cardDetails.number.replace(/\s/g, '').slice(-4),
      brand: 'Card',
    };
  };

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!topUpAmount || amount <= 0) {
      setError('Please enter a valid amount greater than zero.'); return;
    }
    if (selectedCard === 'new') {
      if (!cardDetails.number || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name) {
        setError('Please fill all card details.'); return;
      }
    }
    setProcessing(true); setError('');
    try {
      const card = getCardForTransaction();
      const newBalance = (profile?.wallet_balance || 0) + amount;

      await supabase.from('profiles')
        .update({ wallet_balance: newBalance })
        .eq('id', session.user.id);

      await supabase.from('transactions').insert({
        user_id: session.user.id,
        type: 'topup',
        amount,
        description: `Wallet top up via ${card.brand} ****${card.last4}`,
        status: 'completed',
        metadata: { card_last4: card.last4, card_brand: card.brand }
      });

      // Save card to profile if new card and user checks save
      setProfile(prev => ({ ...prev, wallet_balance: newBalance }));
      setTopUpAmount('');
      setCardDetails({ number: '', expiry: '', cvc: '', name: '' });
      setShowTopUp(false);
      setSuccess(`$${amount.toFixed(2)} added to your wallet!`);
      setTimeout(() => setSuccess(''), 4000);
      await fetchData();
    } catch (e) { setError(e.message); }
    setProcessing(false);
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    const balance = profile?.wallet_balance || 0;
    if (!amount || amount <= 0) {
      setError('Please enter a valid amount greater than zero.'); return;
    }
    if (amount > balance) {
      setError(`Insufficient balance. Available: $${balance.toFixed(2)}`); return;
    }
    if (!forceWithdrawAll && amount < MIN_WITHDRAWAL) {
      setError(`Minimum withdrawal is $${MIN_WITHDRAWAL}.`); return;
    }
    if (selectedCard === 'new') {
      if (!cardDetails.number || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name) {
        setError('Please fill all card details.'); return;
      }
    }
    setProcessing(true); setError('');
    try {
      const fee = amount * WITHDRAWAL_FEE / 100;
      const net = amount - fee;
      const newBalance = balance - amount;
      const card = getCardForTransaction();

      await supabase.from('profiles')
        .update({ wallet_balance: newBalance })
        .eq('id', session.user.id);

      await supabase.from('transactions').insert({
        user_id: session.user.id,
        type: 'withdrawal',
        amount,
        description: `Withdrawal to ${card.brand} ****${card.last4}`,
        status: 'pending',
        metadata: { fee, net, card_last4: card.last4, card_brand: card.brand }
      });

      setProfile(prev => ({ ...prev, wallet_balance: newBalance }));
      setWithdrawAmount('');
      setCardDetails({ number: '', expiry: '', cvc: '', name: '' });
      setShowWithdraw(false);
      setSuccess(`Withdrawal of $${net.toFixed(2)} initiated. Arrives in 3-5 business days.`);
      setTimeout(() => setSuccess(''), 6000);
      await fetchData();
    } catch (e) { setError(e.message); }
    setProcessing(false);
  };

  // Card selector — shows saved card option if available
  const CardSelector = ({ mode }) => (
    <div className="space-y-3">
      {hasSavedCard && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Select Card
          </label>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setSelectedCard('saved')}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                selectedCard === 'saved'
                  ? 'border-violet-400 bg-violet-50'
                  : 'border-gray-200 hover:border-violet-200'
              }`}>
              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <CreditCard size={16} className="text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">{savedCardLabel}</p>
                <p className="text-xs text-gray-400">Saved card</p>
              </div>
              {selectedCard === 'saved' && (
                <CheckCircle size={16} className="text-violet-600 ml-auto" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setSelectedCard('new')}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                selectedCard === 'new'
                  ? 'border-violet-400 bg-violet-50'
                  : 'border-gray-200 hover:border-violet-200'
              }`}>
              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <CreditCard size={16} className="text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">Use a different card</p>
                <p className="text-xs text-gray-400">Enter new card details</p>
              </div>
              {selectedCard === 'new' && (
                <CheckCircle size={16} className="text-violet-600 ml-auto" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* New card fields — shown when no saved card or user picks new */}
      {selectedCard === 'new' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Cardholder Name
            </label>
            <input type="text" placeholder="John Smith" value={cardDetails.name}
              onChange={e => setCardDetails({ ...cardDetails, name: e.target.value })}
              className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Card Number
            </label>
            <div className="relative">
              <CreditCard size={14} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
              <input type="text" placeholder="4242 4242 4242 4242"
                value={cardDetails.number}
                onChange={e => setCardDetails({ ...cardDetails, number: formatCard(e.target.value) })}
                className="input-field pl-9" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Expiry
              </label>
              <input type="text" placeholder="MM/YY" value={cardDetails.expiry}
                onChange={e => setCardDetails({ ...cardDetails, expiry: formatExp(e.target.value) })}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                CVC
              </label>
              <input type="text" placeholder="123" maxLength={3}
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
    </div>
  );

  const getTxnIcon = (txn) => {
    if (txn.type === 'topup') return '💳';
    if (txn.type === 'withdrawal') return '🏦';
    if (txn.type === 'escrow_release') return '✈️';
    if (txn.type === 'escrow_hold') return '🔒';
    if (txn.type === 'fetchr_fee') return '💼';
    if (txn.type === 'credit') return '💰';
    if (txn.type === 'debit') return '📦';
    return '💸';
  };

  const isCredit = (txn) =>
    ['topup', 'credit', 'escrow_release'].includes(txn.type);

  const totalCredits = transactions
    .filter(t => isCredit(t))
    .reduce((s, t) => s + (t.amount || 0), 0);
  const totalDebits = transactions
    .filter(t => !isCredit(t) && t.type !== 'fetchr_fee')
    .reduce((s, t) => s + (t.amount || 0), 0);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
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
      <div className="relative bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-700 rounded-2xl p-6 mb-4 text-white shadow-float overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-20 translate-x-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-16 -translate-x-16" />
        <div className="relative">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-violet-200 text-sm font-medium">Available Balance</p>
              <p className="text-4xl font-bold mt-1 tracking-tight">
                ${(profile?.wallet_balance || 0).toFixed(2)}
              </p>
            </div>
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">
              <WalletCards size={26} className="text-white" />
            </div>
          </div>
          {hasSavedCard && (
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 mb-3 w-fit">
              <CreditCard size={14} className="text-violet-200" />
              <p className="text-xs text-violet-100 font-semibold">{savedCardLabel}</p>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-violet-200">
            <Shield size={12} /> Protected by Fetchr Secure Wallet
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
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => { setShowTopUp(!showTopUp); setShowWithdraw(false); setError(''); setSelectedCard(hasSavedCard ? 'saved' : 'new'); }}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
            showTopUp ? 'bg-violet-100 text-violet-700' : 'btn-primary'
          }`}>
          <ArrowDownCircle size={16} /> Top Up
        </button>
        <button
          onClick={() => { setShowWithdraw(!showWithdraw); setShowTopUp(false); setError(''); setSelectedCard(hasSavedCard ? 'saved' : 'new'); }}
          className="btn-secondary flex items-center justify-center gap-2 py-3">
          <ArrowUpCircle size={16} /> Withdraw
        </button>
      </div>

      {/* Top Up form */}
      {showTopUp && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5 mb-4">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <ArrowDownCircle size={18} className="text-violet-600" /> Top Up Wallet
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Amount ($)
              </label>
              <div className="relative">
                <DollarSign size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="number"
                  placeholder="0.00"
                  min="0.01"
                  step="0.01"
                  value={topUpAmount}
                  onChange={e => {
                    // Block negative values
                    const val = e.target.value;
                    if (val === '' || parseFloat(val) >= 0) setTopUpAmount(val);
                  }}
                  className="input-field pl-9"
                />
              </div>
              {/* Quick amount buttons */}
              <div className="flex gap-2 mt-2">
                {[25, 50, 100, 250].map(amt => (
                  <button key={amt}
                    type="button"
                    onClick={() => setTopUpAmount(amt.toString())}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                      topUpAmount === amt.toString()
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-violet-300'
                    }`}>
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            <CardSelector mode="topup" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mt-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-600 text-xs">{error}</p>
            </div>
          )}

          <button onClick={handleTopUp} disabled={processing}
            className="w-full btn-primary py-3 mt-4 flex items-center justify-center gap-2 disabled:opacity-50">
            {processing
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
              : <><CreditCard size={15} /> Add ${parseFloat(topUpAmount) > 0 ? parseFloat(topUpAmount).toFixed(2) : '0.00'}</>
            }
          </button>
        </div>
      )}

      {/* Withdraw form */}
      {showWithdraw && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5 mb-4">
          <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
            <ArrowUpCircle size={18} className="text-gray-600" /> Withdraw to Card
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            {WITHDRAWAL_FEE}% fee · {forceWithdrawAll ? 'No minimum (account deletion)' : 'Min $10'} · 3-5 business days
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Amount · Balance: ${(profile?.wallet_balance || 0).toFixed(2)}
              </label>
              <div className="relative">
                <DollarSign size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="number"
                  placeholder="0.00"
                  min="0.01"
                  max={profile?.wallet_balance || 0}
                  step="0.01"
                  value={withdrawAmount}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || parseFloat(val) >= 0) setWithdrawAmount(val);
                  }}
                  className="input-field pl-9"
                />
              </div>

              {/* Withdraw all button */}
              {(profile?.wallet_balance || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setWithdrawAmount((profile.wallet_balance || 0).toFixed(2))}
                  className="mt-2 text-xs text-violet-600 font-semibold hover:text-violet-700 transition">
                  Withdraw full balance (${(profile?.wallet_balance || 0).toFixed(2)})
                </button>
              )}

              {/* Fee breakdown preview */}
              {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                <div className="mt-2 bg-gray-50 rounded-xl p-3 text-xs space-y-1 border border-gray-100">
                  <div className="flex justify-between text-gray-500">
                    <span>Withdrawal amount</span>
                    <span>${parseFloat(withdrawAmount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-red-400">
                    <span>Fee ({WITHDRAWAL_FEE}%)</span>
                    <span>-${(parseFloat(withdrawAmount) * WITHDRAWAL_FEE / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-1">
                    <span>You receive</span>
                    <span>${(parseFloat(withdrawAmount) * (1 - WITHDRAWAL_FEE / 100)).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <CardSelector mode="withdraw" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mt-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-600 text-xs">{error}</p>
            </div>
          )}

          <button onClick={handleWithdraw} disabled={processing}
            className="w-full mt-4 bg-gray-900 text-white rounded-xl py-3 text-sm font-bold hover:bg-gray-800 transition flex items-center justify-center gap-2 disabled:opacity-50">
            {processing
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
              : <><ArrowUpCircle size={15} /> Withdraw ${parseFloat(withdrawAmount) > 0 ? parseFloat(withdrawAmount).toFixed(2) : '0.00'}</>
            }
          </button>
        </div>
      )}

      {/* Transaction History */}
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
                      <span className={`badge text-xs ${
                        txn.status === 'pending' ? 'badge-yellow' : 'badge-green'
                      }`}>
                        {txn.status === 'pending'
                          ? <><Clock size={9} /> Processing</>
                          : <><CheckCircle size={9} /> Done</>
                        }
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-bold ${
                    isCredit(txn) ? 'text-emerald-600' : 'text-red-500'
                  }`}>
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
                <p className={`text-3xl font-bold ${
                  isCredit(selectedTxn) ? 'text-emerald-600' : 'text-red-500'
                }`}>
                  {isCredit(selectedTxn) ? '+' : '-'}${(selectedTxn.amount || 0).toFixed(2)}
                </p>
                <p className="text-gray-500 text-sm mt-1">{selectedTxn.description}</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-2.5 text-sm border border-gray-100">
                <div className="flex justify-between">
                  <span className="text-gray-400">Date</span>
                  <span className="font-semibold text-gray-800">
                    {new Date(selectedTxn.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'long', year: 'numeric'
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Time</span>
                  <span className="font-semibold text-gray-800">
                    {new Date(selectedTxn.created_at).toLocaleTimeString([], {
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Type</span>
                  <span className="font-semibold text-gray-800 capitalize">
                    {selectedTxn.type === 'topup' ? 'Wallet Top Up'
                      : selectedTxn.type === 'withdrawal' ? 'Withdrawal to Card'
                      : selectedTxn.type === 'escrow_release' ? 'Delivery Payment'
                      : selectedTxn.type === 'escrow_hold' ? 'Escrow Payment'
                      : selectedTxn.type === 'fetchr_fee' ? 'Fetchr Service Fee'
                      : selectedTxn.type}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Status</span>
                  <span className={`font-semibold ${
                    selectedTxn.status === 'pending' ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {selectedTxn.status === 'pending' ? '⏳ Processing' : '✅ Completed'}
                  </span>
                </div>

                {/* Withdrawal fee breakdown */}
                {selectedTxn.type === 'withdrawal' && selectedTxn.metadata?.fee != null && (
                  <div className="border-t border-gray-200 pt-2 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Gross amount</span>
                      <span className="font-semibold">${selectedTxn.amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Fee ({WITHDRAWAL_FEE}%)</span>
                      <span className="font-semibold text-red-400">
                        -${selectedTxn.metadata.fee.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-800">
                      <span>You received</span>
                      <span>${selectedTxn.metadata.net.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Deal details */}
              {selectedTxn.match && (
                <div className="bg-violet-50 rounded-xl p-4 border border-violet-100 space-y-2 text-sm">
                  <p className="text-xs font-bold text-violet-700 mb-2">Deal Details</p>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Route</span>
                    <span className="font-semibold text-gray-800">
                      {selectedTxn.match.flight?.from_code} → {selectedTxn.match.flight?.to_code}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Item</span>
                    <span className="font-semibold text-gray-800">
                      {selectedTxn.match.request?.item_name}
                    </span>
                  </div>
                  {selectedTxn.match.flight?.airline && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Airline</span>
                      <span className="font-semibold text-gray-800">
                        {selectedTxn.match.flight.airline}
                      </span>
                    </div>
                  )}
                  {selectedTxn.match.flight?.flight_date && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Flight date</span>
                      <span className="font-semibold text-gray-800">
                        {new Date(selectedTxn.match.flight.flight_date).toLocaleDateString('en-GB', {
                          day: '2-digit', month: '2-digit', year: 'numeric'
                        })}
                      </span>
                    </div>
                  )}
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
  );
};

export default WalletScreen;