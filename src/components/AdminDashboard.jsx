import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  DollarSign, Users, Receipt, CreditCard, ShieldCheck,
  TrendingUp, Lock, Wallet, RefreshCw, CheckCircle, XCircle,
  Ban, KeyRound, Trash2, Search, ArrowUpDown,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import StatusPill from './shared/StatusPill';
import Toast from './shared/Toast';

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
  const [success, setSuccess] = useState('');

  // Users tab — search, status filter, sort
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [actingOn, setActingOn] = useState(null);

  // Overview tab — KPI period
  const [kpiPeriod, setKpiPeriod] = useState('30d');
  const [kpiSeries, setKpiSeries] = useState([]);

  const periodRange = (period) => {
    const end = new Date();
    const start = new Date();
    if (period === '7d') start.setDate(end.getDate() - 6);
    else if (period === '30d') start.setDate(end.getDate() - 29);
    else if (period === '90d') start.setDate(end.getDate() - 89);
    else if (period === 'ytd') { start.setMonth(0, 1); }
    else if (period === '1y') start.setFullYear(end.getFullYear() - 1);
    const fmt = (d) => d.toISOString().split('T')[0];
    return { startDate: fmt(start), endDate: fmt(end) };
  };

  const load = useCallback(async (t = tab) => {
    setLoading(true); setError('');
    try {
      if (t === 'overview') {
        setOverview((await callAdmin('overview')));
        const { startDate, endDate } = periodRange(kpiPeriod);
        setKpiSeries((await callAdmin('kpi_timeseries', { startDate, endDate })).series || []);
      }
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
  }, [tab, txFilter, kpiPeriod]);

  useEffect(() => { load(tab); }, [tab, load]);

  const toggleVerified = async (userId, verified) => {
    try {
      await callAdmin('toggle_verified', { userId, verified: !verified });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, verified: !verified } : u));
    } catch (e) {
      setError(e.message);
    }
  };

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 5000); };

  const blockUser = async (u) => {
    setActingOn(u.id);
    try {
      await callAdmin(u.blocked ? 'unblock_user' : 'block_user', { userId: u.id });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, blocked: !u.blocked } : x));
      flash(u.blocked ? `${u.full_name || u.email} unblocked.` : `${u.full_name || u.email} blocked — they can no longer sign in.`);
    } catch (e) { setError(e.message); }
    setActingOn(null);
  };

  const resetPassword = async (u) => {
    if (!window.confirm(`Set a new temporary password for ${u.full_name || u.email}?`)) return;
    setActingOn(u.id);
    try {
      const res = await callAdmin('reset_password', { userId: u.id });
      window.prompt(`Temporary password for ${u.email} (share this with them securely):`, res.tempPassword);
    } catch (e) { setError(e.message); }
    setActingOn(null);
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`Permanently delete ${u.full_name || u.email}? This cannot be undone.`)) return;
    setActingOn(u.id);
    try {
      await callAdmin('delete_user', { userId: u.id });
      setUsers(prev => prev.filter(x => x.id !== u.id));
      flash(`${u.full_name || u.email} deleted.`);
    } catch (e) { setError(e.message); }
    setActingOn(null);
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const visibleUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    let rows = users.filter(u => {
      if (q && !`${u.full_name || ''} ${u.email || ''}`.toLowerCase().includes(q)) return false;
      if (userStatusFilter === 'verified' && !u.verified) return false;
      if (userStatusFilter === 'unverified' && u.verified) return false;
      if (userStatusFilter === 'blocked' && !u.blocked) return false;
      if (userStatusFilter === 'admin' && !u.is_admin) return false;
      return true;
    });
    const val = (u, key) => {
      switch (key) {
        case 'name': return (u.full_name || u.email || '').toLowerCase();
        case 'wallet_balance': return u.wallet_balance || 0;
        case 'completed_deals': return (u.stats?.completed_deals_traveler || 0) + (u.stats?.completed_deals_shipper || 0);
        case 'completed_flights': return u.stats?.completed_flights || 0;
        case 'total_earned': return u.stats?.total_earned || 0;
        case 'total_spent': return u.stats?.total_spent || 0;
        case 'fetchr_revenue': return u.stats?.fetchr_revenue || 0;
        case 'rating': return u.rating || 0;
        case 'created_at': return u.created_at || '';
        default: return '';
      }
    };
    rows = [...rows].sort((a, b) => {
      const av = val(a, sortKey), bv = val(b, sortKey);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [users, userSearch, userStatusFilter, sortKey, sortDir]);

  const SortHeader = ({ label, sortAs }) => (
    <th className="px-4 py-3 font-semibold cursor-pointer select-none hover:text-content" onClick={() => toggleSort(sortAs)}>
      <span className="flex items-center gap-1">{label}<ArrowUpDown size={11} className={sortKey === sortAs ? 'text-ink-900' : 'text-ink-300'} /></span>
    </th>
  );

  return (
    <div className="animate-fade-in space-y-6">
      <Toast message={success} tone="success" />
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
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-semibold text-title-s text-content">KPIs over time</h2>
                <div className="flex gap-1">
                  {[['7d', '7D'], ['30d', '30D'], ['90d', '90D'], ['ytd', 'YTD'], ['1y', '1Y']].map(([id, label]) => (
                    <button key={id} onClick={() => setKpiPeriod(id)}
                      className={`px-2.5 py-1 rounded-md text-label font-semibold transition-all ${
                        kpiPeriod === id ? 'bg-ink-900 text-white' : 'text-content-muted hover:bg-surface-sunken'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {kpiSeries.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-content-subtle text-body-s">
                  {loading ? 'Loading…' : 'No data for this period.'}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={kpiSeries.map(r => ({
                    ...r,
                    label: new Date(r.day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                  }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="revenue" name="Revenue ($)" stroke="#DC5518" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="completed_deals" name="Completed deals" stroke="#14181F" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="new_users" name="New users" stroke="#5B8DEF" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
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
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                placeholder="Search name or email…" className="input-field pl-8 py-2 text-body-s" />
            </div>
            <select value={userStatusFilter} onChange={e => setUserStatusFilter(e.target.value)}
              className="input-field w-auto py-2 text-body-s">
              <option value="all">All users</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
              <option value="blocked">Blocked</option>
              <option value="admin">Admins</option>
            </select>
            <span className="text-label text-content-subtle">{visibleUsers.length} of {users.length}</span>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-body-s whitespace-nowrap">
                <thead>
                  <tr className="border-b border-line text-left text-overline uppercase text-content-subtle font-mono">
                    <SortHeader label="Name" sortAs="name" />
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <SortHeader label="Wallet" sortAs="wallet_balance" />
                    <SortHeader label="Deals" sortAs="completed_deals" />
                    <SortHeader label="Flights" sortAs="completed_flights" />
                    <SortHeader label="Earned" sortAs="total_earned" />
                    <SortHeader label="Spent" sortAs="total_spent" />
                    <SortHeader label="fetchr rev." sortAs="fetchr_revenue" />
                    <SortHeader label="Rating" sortAs="rating" />
                    <th className="px-4 py-3 font-semibold">Verified</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <SortHeader label="Joined" sortAs="created_at" />
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && users.length === 0 ? (
                    <tr><td colSpan={13} className="px-4 py-8 text-center text-content-subtle">Loading users…</td></tr>
                  ) : visibleUsers.length === 0 ? (
                    <tr><td colSpan={13} className="px-4 py-8 text-center text-content-subtle">No users found.</td></tr>
                  ) : visibleUsers.map(u => (
                    <tr key={u.id} className="border-b border-line hover:bg-surface-sunken">
                      <td className="px-4 py-3 font-semibold text-content flex items-center gap-1.5">
                        {u.full_name || '—'}
                        {u.is_admin && <ShieldCheck size={13} className="text-ink-600" title="Admin" />}
                      </td>
                      <td className="px-4 py-3 text-content-muted">{u.email || '—'}</td>
                      <td className="px-4 py-3 font-mono text-content font-medium">{money(u.wallet_balance)}</td>
                      <td className="px-4 py-3 font-mono text-content-muted">
                        {(u.stats?.completed_deals_traveler || 0) + (u.stats?.completed_deals_shipper || 0)}
                      </td>
                      <td className="px-4 py-3 font-mono text-content-muted">{u.stats?.completed_flights || 0}</td>
                      <td className="px-4 py-3 font-mono text-success font-medium">{money(u.stats?.total_earned)}</td>
                      <td className="px-4 py-3 font-mono text-content-muted">{money(u.stats?.total_spent)}</td>
                      <td className="px-4 py-3 font-mono text-content-muted">{money(u.stats?.fetchr_revenue)}</td>
                      <td className="px-4 py-3 font-mono text-content-muted">{u.rating ? `${u.rating.toFixed(1)} (${u.total_reviews})` : '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleVerified(u.id, u.verified)}>
                          <StatusPill tone={u.verified ? 'success' : 'neutral'}>
                            {u.verified ? <CheckCircle size={12} /> : <XCircle size={12} />}
                            {u.verified ? 'Verified' : 'Unverified'}
                          </StatusPill>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone={u.blocked ? 'danger' : 'success'}>
                          {u.blocked ? 'Blocked' : 'Active'}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3 font-mono text-content-subtle text-micro">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button title={u.blocked ? 'Unblock' : 'Block'} disabled={actingOn === u.id || u.is_admin}
                            onClick={() => blockUser(u)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-surface-sunken disabled:opacity-30 text-content-muted">
                            <Ban size={14} />
                          </button>
                          <button title="Reset password" disabled={actingOn === u.id}
                            onClick={() => resetPassword(u)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-surface-sunken disabled:opacity-30 text-content-muted">
                            <KeyRound size={14} />
                          </button>
                          <button title="Delete" disabled={actingOn === u.id || u.is_admin}
                            onClick={() => deleteUser(u)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-danger-tint disabled:opacity-30 text-danger">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                          tx.status === 'pending' ? 'signal' : 'danger'
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
