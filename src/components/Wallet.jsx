import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  WalletCards, DollarSign, ArrowDownCircle, ArrowUpCircle,
  CreditCard, CheckCircle, Clock, Shield, AlertTriangle
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
  const [cardDetails, setCardDetails] = useState({
    number: '', expiry: '', cvc: '', name: ''
  });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const WITHDRAWAL_FEE_PERCENT = 2.5;

  const fetchWalletData = async () => {
    setLoading(true);

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (profileData) setProfile(profileData);

    const { data: dealsData } = await supabase
      .from('matches')
      .select(`*, flight:flights(*), request:shipment_requests(*)`)
      .or(`traveler_id.eq.${session.user.id},shipper_id.eq.${session.user.id}`)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (dealsData) {
      const txns = dealsData.map(deal => {
        const isTraveler = deal.traveler_id === session.user.id;
        const dealValue = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
        const fee = dealValue * 0.10;
        return {
          id: deal.id,
          type: isTraveler ? 'credit' : 'debit',
          label: isTraveler
            ? `Delivery earnings — ${deal.flight?.from_city} → ${deal.flight?.to_city}`
            : `Shipment payment — ${deal.request?.item_name}`,
          amount: isTraveler ? dealValue - fee : dealValue + fee,
          fee: fee,
          date: deal.created_at,
          status: 'completed',
          icon: isTraveler ? '✈️' : '📦'
        };
      });
      setTransactions(txns);
    }

    setLoading(false);
  };

  useEffect(() => { fetchWalletData(); }, []);

  const formatCard = (val) => val.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim().slice(0, 19);
  const formatExpiry = (val) => val.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5);

  const handleTopUp = async () => {
    if (!topUpAmount || parseFloat(topUpAmount) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    if (!cardDetails.number || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name) {
      setError('Please fill in all card details.');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const amount = parseFloat(topUpAmount);
      const { data: { session: authSession } } = await supabase.auth.getSession();

      const response = await fetch(
        'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/create-payment',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authSession.access_token}`
          },
          body: JSON.stringify({
            amount: amount,
            matchId: `topup-${session.user.id}`,
            currency: 'usd'
          })
        }
      );

      const result = await response.json();

      if (result.error) {
        setError(result.error);
        setProcessing(false);
        return;
      }

      const newBalance = (profile?.wallet_balance || 0) + amount;
      await supabase.from('profiles')
        .update({ wallet_balance: newBalance })
        .eq('id', session.user.id);

      const newTxn = {
        id: Date.now().toString(),
        type: 'credit',
        label: 'Wallet top up via card',
        amount: amount,
        fee: 0,
        date: new Date().toISOString(),
        status: 'completed',
        icon: '💳'
      };

      setTransactions(prev => [newTxn, ...prev]);
      setProfile(prev => ({ ...prev, wallet_balance: newBalance }));
      setTopUpAmount('');
      setCardDetails({ number: '', expiry: '', cvc: '', name: '' });
      setShowTopUp(false);
      setSuccess(`$${amount.toFixed(2)} added to your wallet!`);
      setTimeout(() => setSuccess(''), 4000);

    } catch (err) {
      setError(err.message);
    }
    setProcessing(false);
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    const balance = profile?.wallet_balance || 0;
    const fee = amount * (WITHDRAWAL_FEE_PERCENT / 100);
    const net = amount - fee;

    if (!amount || amount <= 0) { setError('Please enter a valid amount.'); return; }
    if (amount > balance) { setError(`Insufficient balance. Your balance is $${balance.toFixed(2)}.`); return; }
    if (amount < 10) { setError('Minimum withdrawal amount is $10.00.'); return; }
    if (!withdrawAccount) { setError('Please enter your account/card details.'); return; }

    setProcessing(true);
    setError('');

    try {
      const newBalance = balance - amount;
      await supabase.from('profiles')
        .update({ wallet_balance: newBalance })
        .eq('id', session.user.id);

      const newTxn = {
        id: Date.now().toString(),
        type: 'debit',
        label: `Withdrawal to ${withdrawAccount.slice(0, 4)}****`,
        amount: amount,
        fee: fee,
        date: new Date().toISOString(),
        status: 'processing',
        icon: '🏦'
      };

      setTransactions(prev => [newTxn, ...prev]);
      setProfile(prev => ({ ...prev, wallet_balance: newBalance }));
      setWithdrawAmount('');
      setWithdrawAccount('');
      setShowWithdraw(false);
      setSuccess(`Withdrawal of $${net.toFixed(2)} initiated! (${WITHDRAWAL_FEE_PERCENT}% fee: $${fee.toFixed(2)}). Arrives in 3-5 business days.`);
      setTimeout(() => setSuccess(''), 6000);

    } catch (err) {
      setError(err.message);
    }
    setProcessing(false);
  };

  const totalCredits = transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
  const totalDebits = transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-gray-400 text-sm">Loading wallet...</p>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Wallet</h1>
        <p className="text-gray-400 text-sm mt-1">Manage your Fetchr balance</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-100 text-green-700 text-sm px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
          <CheckCircle size={16} /> {success}
        </div>
      )}

      {/* Balance Card */}
      <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl p-6 mb-4 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-purple-200 text-sm">Available Balance</p>
            <p className="text-4xl font-bold mt-1">
              ${(profile?.wallet_balance || 0).toFixed(2)}
            </p>
          </div>
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">
            <WalletCards size={28} className="text-white" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-purple-200">
          <Shield size={12} />
          Protected by Fetchr Secure Wallet
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
            <ArrowDownCircle size={20} className="text-green-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Received</p>
            <p className="text-lg font-bold text-gray-800">${totalCredits.toFixed(2)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
            <ArrowUpCircle size={20} className="text-red-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Spent</p>
            <p className="text-lg font-bold text-gray-800">${totalDebits.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => { setShowTopUp(!showTopUp); setShowWithdraw(false); setError(''); }}
          className="bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition flex items-center justify-center gap-2"
        >
          <ArrowDownCircle size={16} /> Top Up Wallet
        </button>
        <button
          onClick={() => { setShowWithdraw(!showWithdraw); setShowTopUp(false); setError(''); }}
          className="bg-white border border-gray-200 text-gray-700 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-2"
        >
          <ArrowUpCircle size={16} /> Withdraw
        </button>
      </div>

      {/* Top Up Form */}
      {showTopUp && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <ArrowDownCircle size={18} className="text-purple-600" /> Top Up Wallet
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Amount ($)</label>
              <div className="relative">
                <DollarSign size={15} className="absolute left-3 top-3.5 text-gray-400" />
                <input type="number" placeholder="Enter amount (e.g. 100.00)"
                  value={topUpAmount} onChange={e => setTopUpAmount(e.target.value)}
                  className="w-full pl-8 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
              </div>
              <div className="flex gap-2 mt-2">
                {[25, 50, 100, 250].map(amt => (
                  <button key={amt} onClick={() => setTopUpAmount(amt.toString())}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      topUpAmount === amt.toString()
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-purple-300'
                    }`}>
                    ${amt}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Cardholder Name</label>
              <input type="text" placeholder="John Smith" value={cardDetails.name}
                onChange={e => setCardDetails({ ...cardDetails, name: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Card Number</label>
              <input type="text" placeholder="4242 4242 4242 4242" value={cardDetails.number}
                onChange={e => setCardDetails({ ...cardDetails, number: formatCard(e.target.value) })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Expiry</label>
                <input type="text" placeholder="MM/YY" value={cardDetails.expiry}
                  onChange={e => setCardDetails({ ...cardDetails, expiry: formatExpiry(e.target.value) })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">CVC</label>
                <input type="text" placeholder="123" maxLength={3} value={cardDetails.cvc}
                  onChange={e => setCardDetails({ ...cardDetails, cvc: e.target.value.replace(/\D/g, '') })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mt-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-600 text-xs">{error}</p>
            </div>
          )}

          <div className="mt-4 bg-yellow-50 rounded-xl p-3 mb-4">
            <p className="text-xs text-yellow-700 font-semibold">🧪 Test Mode</p>
            <p className="text-xs text-yellow-600 mt-0.5">
              Use card: <strong>4242 4242 4242 4242</strong> • Any future expiry • Any CVC
            </p>
          </div>

          <button onClick={handleTopUp} disabled={processing}
            className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
            <CreditCard size={15} />
            {processing ? 'Processing...' : `Add $${topUpAmount || '0.00'} to Wallet`}
          </button>
        </div>
      )}

      {/* Withdraw Form */}
      {showWithdraw && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
          <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
            <ArrowUpCircle size={18} className="text-gray-600" /> Withdraw Funds
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            {WITHDRAWAL_FEE_PERCENT}% withdrawal fee applies. Minimum $10.00. Arrives in 3-5 business days.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
                Amount ($) — Balance: ${(profile?.wallet_balance || 0).toFixed(2)}
              </label>
              <div className="relative">
                <DollarSign size={15} className="absolute left-3 top-3.5 text-gray-400" />
                <input type="number" placeholder="Enter amount (min $10.00)"
                  value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}
                  className="w-full pl-8 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
              </div>
              {withdrawAmount && parseFloat(withdrawAmount) >= 10 && (
                <div className="mt-2 bg-gray-50 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between text-gray-500">
                    <span>Withdrawal amount</span>
                    <span>${parseFloat(withdrawAmount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-red-500">
                    <span>Fetchr fee ({WITHDRAWAL_FEE_PERCENT}%)</span>
                    <span>-${(parseFloat(withdrawAmount) * WITHDRAWAL_FEE_PERCENT / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-1">
                    <span>You receive</span>
                    <span>${(parseFloat(withdrawAmount) * (1 - WITHDRAWAL_FEE_PERCENT / 100)).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
                Card / Account Number
              </label>
              <div className="relative">
                <CreditCard size={15} className="absolute left-3 top-3.5 text-gray-400" />
                <input type="text" placeholder="Card ending in (e.g. 4242)"
                  value={withdrawAccount} onChange={e => setWithdrawAccount(e.target.value)}
                  className="w-full pl-8 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
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
            className="w-full mt-4 bg-gray-800 text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-900 transition disabled:opacity-50 flex items-center justify-center gap-2">
            <ArrowUpCircle size={15} />
            {processing ? 'Processing...' : `Withdraw $${withdrawAmount || '0.00'}`}
          </button>
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-800 mb-4">Transaction History</h3>
        {transactions.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-14 h-14 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <WalletCards size={24} className="text-purple-400" />
            </div>
            <p className="text-gray-400 text-sm">No transactions yet</p>
            <p className="text-gray-300 text-xs mt-1">Your transaction history will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((txn, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                    txn.type === 'credit' ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    {txn.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{txn.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-400">
                        {new Date(txn.date).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                      {txn.status === 'processing' && (
                        <span className="text-xs bg-yellow-50 text-yellow-600 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Clock size={10} /> Processing
                        </span>
                      )}
                      {txn.status === 'completed' && (
                        <span className="text-xs bg-green-50 text-green-600 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle size={10} /> Completed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <p className={`text-sm font-bold ${
                  txn.type === 'credit' ? 'text-green-600' : 'text-red-500'
                }`}>
                  {txn.type === 'credit' ? '+' : '-'}${txn.amount.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletScreen;