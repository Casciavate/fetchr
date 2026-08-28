import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  DollarSign, Users, Receipt, CreditCard, ShieldCheck,
  TrendingUp, Lock, Wallet, RefreshCw, CheckCircle, XCircle,
} from 'lucide-react';

const ADMIN_FN_URL = 'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/admin-dashboard';

const callAdmin = async (action, data) => {
  const { data: { session: auth } } = await supabase.auth.getSession();
  const res = await fetch(ADMIN_FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.access_token}` },
    body: JSON.stringify({ action, data }),
  });
  const result = await res.json();
  if (!res.ok || result.error) throw new Error(result.error || 'Admin request failed');
  return result;
};

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const TABS = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'stripe', label: 'Stripe', icon: CreditCard },
];

const AdminDashboard = () => {
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [txFilter, setTxFilter] = useState({ type: '', status: '' });
  const [paymentIntents, setPaymentIntents] = useState([]);

  const load = useCallback(async (t = tab) => {
    setLoading(true); setError('');
    try {
      if (t === 'overview') setOverview((await callAdmin('overview')));
      if (t === 'users') setUsers((await callAdmin('users')).users || []);
      if (t === 'transactions') {
        const filters = {};
        if (txFilter.type) filters.type = txFilter.type;
        if (txFilter.status) filters.status = txFilter.status;
        setTransactions((await callAdmin('transactions', filters)).transactions || []);
      }
      if (t === 'stripe') setPaymentIntents((await callAdmin('stripe_activity')).paymentIntents || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [tab, txFilter]);

  useEffect(() => { load(tab); }, [tab, load]);

  const toggleVerified = async (userId, verified) => {
    try {
      await callAdmin('toggle_verified', { userId, verified: !verified });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, verified: !verified } : u));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Lock size={20} className="text-violet-600" /> Admin Dashboard
          </h1>
          <p className="text-gray-500 text-sm mt-1">Platform revenue, users, transactions & Stripe overview.</p>
        </div>
        <button onClick={() => load(tab)}
          className="flex items-center gap-2 text-sm font-semibold text-violet-600 hover:text-violet-700 bg-violet-50 px-3 py-2 rounded-xl">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 border-b border-gray-100">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
              tab === t.id ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl p-3">
          {error}
        </div>
      )}

      {tab === 'overview' && (
        loading && !overview ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : overview && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center mb-3">
                  <DollarSign size={17} className="text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{money(overview.revenue.totalRevenue)}</p>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">Realized Fetchr Revenue</p>
              </div>
              <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5">
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
                  <Lock size={17} className="text-blue-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{money(overview.revenue.escrowInFlight)}</p>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">Escrow In-Flight (held, not yet released)</p>
              </div>
              <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5">
                <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center mb-3">
                  <Wallet size={17} className="text-amber-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{money(overview.revenue.walletLiability)}</p>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">Wallet Liability (owed to users)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5 text-center">
                <p className="text-xl font-bold text-gray-900">{overview.counts.userCount ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total Users</p>
              </div>
              <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5 text-center">
                <p className="text-xl font-bold text-gray-900">{overview.counts.activeDealsCount ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">Active Deals</p>
              </div>
              <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5 text-center">
                <p className="text-xl font-bold text-gray-900">{overview.counts.completedDealsCount ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">Completed Deals</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Stripe Account Balance (test mode)</h2>
              {overview.stripeBalance?.error ? (
                <p className="text-sm text-red-500">{overview.stripeBalance.error}</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Available</p>
                    {(overview.stripeBalance?.available || []).map(b => (
                      <p key={b.currency} className="text-sm font-semibold text-gray-800">
                        {(b.amount / 100).toFixed(2)} {b.currency.toUpperCase()}
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Pending</p>
                    {(overview.stripeBalance?.pending || []).map(b => (
                      <p key={b.currency} className="text-sm font-semibold text-gray-800">
                        {(b.amount / 100).toFixed(2)} {b.currency.toUpperCase()}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3">
                Real fund segregation (separate Stripe sub-accounts per bucket) requires Stripe Connect
                and would force users through onboarding/KYC. Since that's off the table for now, this
                reconciliation view derives segregation in software from the <code className="bg-gray-50 px-1 rounded">transactions</code> ledger
                instead — every dollar in the single Stripe account is accounted for as revenue, escrow, or wallet liability above.
              </p>
            </div>
          </div>
        )
      )}

      {tab === 'users' && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Wallet</th>
                  <th className="px-4 py-3 font-semibold">Deals</th>
                  <th className="px-4 py-3 font-semibold">Rating</th>
                  <th className="px-4 py-3 font-semibold">Verified</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {loading && users.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading users…</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No users found.</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-semibold text-gray-800 flex items-center gap-1.5">
                      {u.full_name || '—'}
                      {u.is_admin && <ShieldCheck size={13} className="text-violet-600" title="Admin" />}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{u.role || '—'}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{money(u.wallet_balance)}</td>
                    <td className="px-4 py-3 text-gray-500">{u.completed_deals ?? 0}</td>
                    <td className="px-4 py-3 text-gray-500">{u.rating ? `${u.rating.toFixed(1)} (${u.total_reviews})` : '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleVerified(u.id, u.verified)}
                        className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${
                          u.verified ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
                        }`}>
                        {u.verified ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {u.verified ? 'Verified' : 'Unverified'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'transactions' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select value={txFilter.type} onChange={e => setTxFilter(f => ({ ...f, type: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white">
              <option value="">All types</option>
              <option value="fetchr_fee">Fetchr fee</option>
              <option value="escrow_hold">Escrow hold</option>
              <option value="wallet_topup">Wallet top-up</option>
              <option value="payout">Payout</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
            <select value={txFilter.status} onChange={e => setTxFilter(f => ({ ...f, status: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Description</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && transactions.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading transactions…</td></tr>
                  ) : transactions.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No transactions found.</td></tr>
                  ) : transactions.map(tx => (
                    <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-4 py-3 text-gray-700">{tx.profiles?.full_name || tx.profiles?.email || tx.user_id?.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-gray-500">{tx.type}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{money(tx.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                          tx.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                          tx.status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 truncate max-w-[220px]">{tx.description || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {tx.created_at ? new Date(tx.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'stripe' && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3 font-semibold">Payment Intent</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Capture</th>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading && paymentIntents.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading Stripe activity…</td></tr>
                ) : paymentIntents.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No payment intents found.</td></tr>
                ) : paymentIntents.map(pi => (
                  <tr key={pi.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{pi.id}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{money(pi.amount / 100)} {pi.currency?.toUpperCase()}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                        pi.status === 'succeeded' ? 'bg-emerald-50 text-emerald-600' :
                        pi.status === 'requires_capture' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {pi.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{pi.capture_method}</td>
                    <td className="px-4 py-3 text-gray-400 truncate max-w-[220px]">{pi.description || pi.metadata?.fund_category || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {pi.created ? new Date(pi.created * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
