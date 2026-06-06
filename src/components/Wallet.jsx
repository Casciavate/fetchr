import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  WalletCards, DollarSign, ArrowDownCircle, ArrowUpCircle,
  CreditCard, CheckCircle, Clock, Shield, AlertTriangle,
  X, Plane, Package, ChevronRight, TrendingUp
} from 'lucide-react';

const WalletScreen = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAccount, setWithdrawAccount] = useState('');
  const [cardDetails, setCardDetails] = useState({ number: '', expiry: '', cvc: '', name: '' });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [topUpHistory, setTopUpHistory] = useState([]);
  const WITHDRAWAL_FEE = 2.5;

  const fetchData = async () => {
    setLoading(true);
    const { data: p } = await supabase
      .from('profiles').select('*').eq('id', session.user.id).single();
    if (p) setProfile(p);

    // Fetch completed deals (credits for traveler, debits for shipper)
    const { data: deals } = await supabase
      .from('matches')
      .select(`*, flight:flights(*), request:shipment_requests(*)`)
      .or(`traveler_id.eq.${session.user.id},shipper_id.eq.${session.user.id}`)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    const dealTxns = (deals || []).map(d => {
      const isTrav = d.traveler_id === session.user.id;
      const subtotal = (d.agreed_price_per_kg || d.flight?.price_per_kg || 0) *
                       (d.agreed_weight_kg || d.request?.weight_kg || 0);
      let fetchrPct = 0.10;
      if (subtotal >= 500) fetchrPct = 0.07;
      else if (subtotal >= 200) fetchrPct = 0.085;
      else if (subtotal < 20) fetchrPct = 0.12;
      const fee = subtotal * fetchrPct;
      const net = isTrav ? subtotal - fee : subtotal * 1.1;

      return {
        id: d.id,
        type: isTrav ? 'credit' : 'debit',
        category: 'deal',
        label: isTrav
          ? `Delivery · ${d.flight?.from_city || d.flight?.from_code} → ${d.flight?.to_city || d.flight?.to_code}`
          : `Shipment · ${d.request?.item_name}`,
        amount: net,
        date: d.created_at,
        status: 'completed',
        icon: isTrav ? '✈️' : '📦',
        deal: d,
      };
    });

    // Fetch top-up / withdrawal history from a local store
    // We use a simple localStorage approach since we don't have a transactions table
    let storedTxns = [];
    try {
      const raw = localStorage.getItem(`fetchr_txns_${session.user.id}`);
      storedTxns = raw ? JSON.parse(raw) : [];
    } catch (e) {}

    // Merge and sort
    const allTxns = [...dealTxns, ...storedTxns]
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    setTransactions(allTxns);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const saveLocalTxn = (txn) => {
    try {
      const key = `fetchr_txns_${session.user.id}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift(txn);
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
    } catch (e) {}
  };

  const formatCard = (v) => v.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim().slice(0, 19);
  const formatExp = (v) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5);

  const handleTopUp = async () => {
    if (!topUpAmount || parseFloat(topUpAmount) <= 0) { setError('Enter a valid amount.'); return; }
    if (!cardDetails.number || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name) {
      setError('Please fill all card details.'); return;
    }
    setProcessing(true); setError('');
    try {
      const amount = parseFloat(topUpAmount);
      const { data: { session: auth } } = await supabase.auth.getSession();
      const res = await fetch('https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.access_token}` },
        body: JSON.stringify({ amount, matchId: `topup-${session.user.id}`, currency: 'usd' })
      });
      const result = await res.json();
      if (result.error) { setError(result.error); setProcessing(false); return; }

      const newBalance = (profile?.wallet_balance || 0) + amount;
      await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', session.user.id);

      const txn = {
        id: `topup-${Date.now()}`,
        type: 'credit',
        category: 'topup',
        label: 'Wallet top up',
        amount,
        date: new Date().toISOString(),
        status: 'completed',
        icon: '💳',
        card: cardDetails.number.slice(-4),
      };
      saveLocalTxn(txn);

      setProfile(prev => ({ ...prev, wallet_balance: newBalance }));
      setTransactions(prev => [txn, ...prev]);
      setTopUpAmount('');
      setCardDetails({ number: '', expiry: '', cvc: '', name: '' });
      setShowTopUp(false);
      setSuccess(`$${amount.toFixed(2)} added to wallet!`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) { setError(e.message); }
    setProcessing(false);
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    const balance = profile?.wallet_balance || 0;
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return; }
    if (amount > balance) { setError(`Insufficient balance ($${balance.toFixed(2)}).`); return; }
    if (amount < 10) { setError('Minimum withdrawal is $10.'); return; }
    if (!withdrawAccount) { setError('Enter your card or account details.'); return; }
    setProcessing(true); setError('');
    try {
      const fee = amount * WITHDRAWAL_FEE / 100;
      const net = amount - fee;
      const newBalance = balance - amount;
      await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', session.user.id);

      const txn = {
        id: `withdrawal-${Date.now()}`,
        type: 'debit',
        category: 'withdrawal',
        label: `Withdrawal to card ****${withdrawAccount.slice(-4)}`,
        amount,
        net,
        fee,
        date: new Date().toISOString(),
        status: 'processing',
        icon: '🏦',
      };
      saveLocalTxn(txn);

      setProfile(prev => ({ ...prev, wallet_balance: newBalance }));
      setTransactions(prev => [txn, ...prev]);
      setWithdrawAmount(''); setWithdrawAccount(''); setShowWithdraw(false);
      setSuccess(`Withdrawal of $${net.toFixed(2)} initiated (${WITHDRAWAL_FEE}% fee). 3-5 business days.`);
      setTimeout(() => setSuccess(''), 6000);
    } catch (e) { setError(e.message); }
    setProcessing(false);
  };

  const credits = transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const debits = transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);

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
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <WalletCards size={26} className="text-white" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-violet-200">
            <Shield size={12} /> Protected by Fetchr Secure Wallet
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: 'Total Received', value: `$${credits.toFixed(2)}`, icon: ArrowDownCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Total Spent', value: `$${debits.toFixed(2)}`, icon: ArrowUpCircle, color: 'text-red-400', bg: 'bg-red-50' },
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

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => { setShowTopUp(!showTopUp); setShowWithdraw(false); setError(''); }}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
            showTopUp ? 'bg-violet-100 text-violet-700' : 'btn-primary'
          }`}>
          <ArrowDownCircle size={16} /> Top Up
        </button>
        <button
          onClick={() => { setShowWithdraw(!showWithdraw); setShowTopUp(false); setError(''); }}
          className="btn-secondary flex items-center justify-center gap-2 py-3">
          <ArrowUpCircle size={16} /> Withdraw
        </button>
      </div>

      {/* Top up form */}
      {showTopUp && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5 mb-4">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <ArrowDownCircle size={18} className="text-violet-600" /> Top Up Wallet
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Amount ($)</label>
              <div className="relative">
                <DollarSign size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
                <input type="number" placeholder="Enter amount" value={topUpAmount}
                  onChange={e => setTopUpAmount(e.target.value)} className="input-field pl-9" />
              </div>
              <div className="flex gap-2 mt-2">
                {[25, 50, 100, 250].map(amt => (
                  <button key={amt} onClick={() => setTopUpAmount(amt.toString())}
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
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mt-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-600 text-xs">{error}</p>
            </div>
          )}
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-xs text-amber-700 font-bold">🧪 Test Mode</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Card: <strong>4242 4242 4242 4242</strong> · Any future date · Any CVC
            </p>
          </div>
          <button onClick={handleTopUp} disabled={processing}
            className="w-full btn-primary py-3 mt-3 flex items-center justify-center gap-2 disabled:opacity-50">
            <CreditCard size={15} /> {processing ? 'Processing...' : `Add $${topUpAmount || '0.00'}`}
          </button>
        </div>
      )}

      {/* Withdraw form */}
      {showWithdraw && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5 mb-4">
          <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
            <ArrowUpCircle size={18} className="text-gray-600" /> Withdraw Funds
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            {WITHDRAWAL_FEE}% fee · Min $10 · 3-5 business days
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Amount · Balance: ${(profile?.wallet_balance || 0).toFixed(2)}
              </label>
              <div className="relative">
                <DollarSign size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
                <input type="number" placeholder="Min $10.00" value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)} className="input-field pl-9" />
              </div>
              {withdrawAmount && parseFloat(withdrawAmount) >= 10 && (
                <div className="mt-2 bg-gray-50 rounded-xl p-3 text-xs space-y-1 border border-gray-100">
                  <div className="flex justify-between text-gray-500">
                    <span>Withdrawal</span>
                    <span>${parseFloat(withdrawAmount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-red-500">
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
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Card / Account</label>
              <div className="relative">
                <CreditCard size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
                <input type="text" placeholder="Card ending in (e.g. 4242)" value={withdrawAccount}
                  onChange={e => setWithdrawAccount(e.target.value)} className="input-field pl-9" />
              </div>
            </div>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mt-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-600 text-xs">{error}</p>
            </div>
          )}
          <button onClick={handleWithdraw} disabled={processing}
            className="w-full mt-4 bg-gray-900 text-white rounded-xl py-3 text-sm font-bold hover:bg-gray-800 transition flex items-center justify-center gap-2 disabled:opacity-50">
            <ArrowUpCircle size={15} /> {processing ? 'Processing...' : `Withdraw $${withdrawAmount || '0.00'}`}
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
              <button
                key={i}
                onClick={() => setSelectedTxn(txn)}
                className="w-full flex items-center justify-between py-3 px-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-xl transition text-left group">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                    txn.type === 'credit' ? 'bg-emerald-50' : 'bg-red-50'
                  }`}>
                    {txn.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{txn.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-400">
                        {new Date(txn.date).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                      </p>
                      <span className={`badge text-xs ${
                        txn.status === 'processing' ? 'badge-yellow' : 'badge-green'
                      }`}>
                        {txn.status === 'processing'
                          ? <><Clock size={9} /> Processing</>
                          : <><CheckCircle size={9} /> Done</>
                        }
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-bold ${
                    txn.type === 'credit' ? 'text-emerald-600' : 'text-red-500'
                  }`}>
                    {txn.type === 'credit' ? '+' : '-'}${txn.amount.toFixed(2)}
                  </p>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Transaction detail popup */}
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
              {/* Amount hero */}
              <div className="text-center py-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3 ${
                  selectedTxn.type === 'credit' ? 'bg-emerald-50' : 'bg-red-50'
                }`}>
                  {selectedTxn.icon}
                </div>
                <p className={`text-3xl font-bold ${
                  selectedTxn.type === 'credit' ? 'text-emerald-600' : 'text-red-500'
                }`}>
                  {selectedTxn.type === 'credit' ? '+' : '-'}${selectedTxn.amount.toFixed(2)}
                </p>
                <p className="text-gray-500 text-sm mt-1">{selectedTxn.label}</p>
              </div>

              {/* Details */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2.5 text-sm border border-gray-100">
                <div className="flex justify-between">
                  <span className="text-gray-400">Date</span>
                  <span className="font-semibold text-gray-800">
                    {new Date(selectedTxn.date).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'long', year: 'numeric'
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Time</span>
                  <span className="font-semibold text-gray-800">
                    {new Date(selectedTxn.date).toLocaleTimeString([], {
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Type</span>
                  <span className="font-semibold text-gray-800 capitalize">
                    {selectedTxn.category === 'deal' ? 'Deal Payment' :
                     selectedTxn.category === 'topup' ? 'Wallet Top Up' :
                     selectedTxn.category === 'withdrawal' ? 'Withdrawal' : selectedTxn.category}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Status</span>
                  <span className={`font-semibold ${
                    selectedTxn.status === 'processing' ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {selectedTxn.status === 'processing' ? '⏳ Processing' : '✅ Completed'}
                  </span>
                </div>

                {/* Withdrawal fee breakdown */}
                {selectedTxn.category === 'withdrawal' && selectedTxn.fee && (
                  <>
                    <div className="border-t border-gray-200 pt-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Gross withdrawal</span>
                        <span className="font-semibold">${selectedTxn.amount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-gray-400">Fee ({WITHDRAWAL_FEE}%)</span>
                        <span className="font-semibold text-red-500">-${selectedTxn.fee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between mt-1 font-bold text-gray-800">
                        <span>You received</span>
                        <span>${selectedTxn.net.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Deal details if it's a deal transaction */}
              {selectedTxn.category === 'deal' && selectedTxn.deal && (
                <div className="bg-violet-50 rounded-xl p-4 border border-violet-100 space-y-2.5 text-sm">
                  <p className="text-xs font-bold text-violet-700 mb-2">Deal Details</p>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Route</span>
                    <span className="font-semibold text-gray-800">
                      {selectedTxn.deal.flight?.from_code} → {selectedTxn.deal.flight?.to_code}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Item</span>
                    <span className="font-semibold text-gray-800">{selectedTxn.deal.request?.item_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Airline</span>
                    <span className="font-semibold text-gray-800">{selectedTxn.deal.flight?.airline}</span>
                  </div>
                  {selectedTxn.deal.flight?.flight_date && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Flight date</span>
                      <span className="font-semibold text-gray-800">
                        {new Date(selectedTxn.deal.flight.flight_date).toLocaleDateString('en-GB', {
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