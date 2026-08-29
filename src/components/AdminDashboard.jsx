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

const StatusPill = ({ tone, children }) => {
  const tones = {
    success: 'bg-success-tint text-success',
    warning: 'bg-warning-tint text-warning',
    danger: 'bg-danger-tint text-danger',
    neutral: 'bg-ink-100 text-content-muted',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-sm text-overline uppercase font-mono ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  );
};

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
          <h1 className="font-display font-bold text-title-l text-content flex items-center gap-2">
            <Lock size={20} className="text-ink-600" /> Admin dashboard
          </h1>
          <p className="text-body-s text-content-muted mt-1">Platform revenue, users, transactions & Stripe overview.</p>
        </div>
        <button onClick={() => load(tab)} className="btn-secondary">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 border-b border-line">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-body-s font-semibold border-b-2 transition-all ${
              tab === t.id ? 'border-ink-900 text-content' : 'border-transparent text-content-muted hover:text-content'
            }`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-danger-tint border border-void-100 text-danger text-body-s rounded-md p-3">
          {error}
        </div>
      )}

      {tab === 'overview' && (
        loading && !overview ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-28 bg-surface-sunken rounded-lg animate-pulse" />)}
          </div>
        ) : overview && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card p-5">
                <div className="w-9 h-9 bg-ink-100 rounded-md flex items-center justify-center mb-3">
                  <DollarSign size={17} className="text-ink-600" />
                </div>
                <p className="font-mono text-title-m font-bold text-content">{money(overview.revenue.totalRevenue)}</p>
                <p className="text-label text-content-muted mt-0.5">Realized fetchr revenue</p>
              </div>
              <div className="card p-5">
                <div className="w-9 h-9 bg-ink-100 rounded-md flex items-center justify-center mb-3">
                  <Lock size={17} className="text-ink-600" />
                </div>
                <p className="font-mono text-title-m font-bold text-content">{money(overview.revenue.escrowInFlight)}</p>
                <p className="text-label text-content-muted mt-0.5">Escrow in-flight (held, not yet released)</p>
              </div>
              <div className="card p-5">
                <div className="w-9 h-9 bg-ink-100 rounded-md flex items-center justify-center mb-3">
                  <Wallet size={17} className="text-ink-600" />
                </div>
                <p className="font-mono text-title-m font-bold text-content">{money(overview.revenue.walletLiability)}</p>
                <p className="text-label text-content-muted mt-0.5">Wallet liability (owed to users)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card p-5 text-center">
                <p className="font-mono text-title-m font-bold text-content">{overview.counts.userCount ?? 0}</p>
                <p className="text-label text-content-muted mt-0.5">Total users</p>
              </div>
              <div className="card p-5 text-center">
                <p className="font-mono text-title-m font-bold text-content">{overview.counts.activeDealsCount ?? 0}</p>
                <p className="text-label text-content-muted mt-0.5">Active deals</p>
              </div>
              <div className="card p-5 text-center">
                <p className="font-mono text-title-m font-bold text-content">{overview.counts.completedDealsCount ?? 0}</p>
                <p className="text-label text-content-muted mt-0.5">Completed deals</p>
              </div>
            </div>

            <div className="card p-5">
              <h2 className="font-display font-semibold text-title-s text-content mb-3">Stripe account balance (test mode)</h2>
              {overview.stripeBalance?.error ? (
                <p className="text-body-s text-danger">{overview.stripeBalance.error}</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-label text-content-subtle mb-1">Available</p>
                    {(overview.stripeBalance?.available || []).map(b => (
                      <p key={b.currency} className="font-mono text-body-m font-semibold text-content">
                        {(b.amount / 100).toFixed(2)} {b.currency.toUpperCase()}
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="text-label text-content-subtle mb-1">Pending</p>
                    {(overview.stripeBalance?.pending || []).map(b => (
                      <p key={b.currency} className="font-mono text-body-m font-semibold text-content">
                        {(b.amount / 100).toFixed(2)} {b.currency.toUpperCase()}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-label text-content-subtle mt-3">
                Real fund segregation (separate Stripe sub-accounts per bucket) requires Stripe Connect
                and would force users through onboarding/KYC. Since that's off the table for now, this
                reconciliation view derives segregation in software from the <code className="font-mono bg-surface-sunken px-1 rounded-sm">transactions</code> ledger
                instead — every dollar in the single Stripe account is accounted for as revenue, escrow, or wallet liability above.
              </p>
            </div>
          </div>
        )
      )}

      {tab === 'users' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body-s">
              <thead>
                <tr className="border-b border-line text-left text-overline uppercase text-content-subtle font-mono">
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
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-content-subtle">Loading users…</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-content-subtle">No users found.</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="border-b border-line hover:bg-surface-sunken">
                    <td className="px-4 py-3 font-semibold text-content flex items-center gap-1.5">
                      {u.full_name || '—'}
                      {u.is_admin && <ShieldCheck size={13} className="text-ink-600" title="Admin" />}
                    </td>
                    <td className="px-4 py-3 text-content-muted">{u.email || '—'}</td>
                    <td className="px-4 py-3 text-content-muted">{u.role || '—'}</td>
                    <td className="px-4 py-3 font-mono text-content font-medium">{money(u.wallet_balance)}</td>
                    <td className="px-4 py-3 font-mono text-content-muted">{u.completed_deals ?? 0}</td>
                    <td className="px-4 py-3 font-mono text-content-muted">{u.rating ? `${u.rating.toFixed(1)} (${u.total_reviews})` : '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleVerified(u.id, u.verified)}>
                        <StatusPill tone={u.verified ? 'success' : 'neutral'}>
                          {u.verified ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {u.verified ? 'Verified' : 'Unverified'}
                        </StatusPill>
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-content-subtle text-micro">
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
              className="input-field w-auto py-2">
              <option value="">All types</option>
              <option value="fetchr_fee">fetchr fee</option>
              <option value="escrow_hold">Escrow hold</option>
              <option value="wallet_topup">Wallet top-up</option>
              <option value="payout">Payout</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
            <select value={txFilter.status} onChange={e => setTxFilter(f => ({ ...f, status: e.target.value }))}
              className="input-field w-auto py-2">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-body-s">
                <thead>
                  <tr className="border-b border-line text-left text-overline uppercase text-content-subtle font-mono">
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
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-content-subtle">Loading transactions…</td></tr>
                  ) : transactions.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-content-subtle">No transactions found.</td></tr>
                  ) : transactions.map(tx => (
                    <tr key={tx.id} className="border-b border-line hover:bg-surface-sunken">
                      <td className="px-4 py-3 text-content">{tx.profiles?.full_name || tx.profiles?.email || tx.user_id?.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-content-muted">{tx.type}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-content">{money(tx.amount)}</td>
                      <td className="px-4 py-3">
                        <StatusPill tone={
                          tx.status === 'completed' ? 'success' :
                          tx.status === 'pending' ? 'warning' : 'danger'
                        }>
                          {tx.status}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3 text-content-subtle truncate max-w-[220px]">{tx.description || '—'}</td>
                      <td className="px-4 py-3 font-mono text-content-subtle text-micro whitespace-nowrap">
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
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body-s">
              <thead>
                <tr className="border-b border-line text-left text-overline uppercase text-content-subtle font-mono">
                  <th className="px-4 py-3 font-semibold">Payment intent</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Capture</th>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading && paymentIntents.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-content-subtle">Loading Stripe activity…</td></tr>
                ) : paymentIntents.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-content-subtle">No payment intents found.</td></tr>
                ) : paymentIntents.map(pi => (
                  <tr key={pi.id} className="border-b border-line hover:bg-surface-sunken">
                    <td className="px-4 py-3 text-content-subtle font-mono text-micro">{pi.id}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-content">{money(pi.amount / 100)} {pi.currency?.toUpperCase()}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone={
                        pi.status === 'succeeded' ? 'success' :
                        pi.status === 'requires_capture' ? 'neutral' : 'neutral'
                      }>
                        {pi.status}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3 font-mono text-content-subtle text-micro">{pi.capture_method}</td>
                    <td className="px-4 py-3 text-content-subtle truncate max-w-[220px]">{pi.description || pi.metadata?.fund_category || '—'}</td>
                    <td className="px-4 py-3 font-mono text-content-subtle text-micro whitespace-nowrap">
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
