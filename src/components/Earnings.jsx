import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  DollarSign, TrendingUp, Plane, Package,
  ChevronDown, ChevronUp, Award, ArrowUpRight
} from 'lucide-react';

const Earnings = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [completedDeals, setCompletedDeals] = useState([]);
  const [stats, setStats] = useState({ totalEarned: 0, totalFees: 0, netEarnings: 0, totalDeals: 0, avgPerDeal: 0, thisMonth: 0, lastMonth: 0 });
  const [expandedId, setExpandedId] = useState(null);
  const [period, setPeriod] = useState('all');

  const fetchEarnings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .select(`*, flight:flights(*), request:shipment_requests(*), shipper:profiles!matches_shipper_id_fkey(*)`)
      .eq('traveler_id', session.user.id).eq('status', 'completed')
      .order('created_at', { ascending: false });
    if (!error && data) { setCompletedDeals(data); calculateStats(data); }
    setLoading(false);
  };

  const calculateStats = (deals) => {
    const now = new Date();
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    let totalEarned = 0, totalFees = 0, thisMonth = 0, lastMonth = 0;
    deals.forEach(deal => {
      const val = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
      const fee = val * 0.10;
      totalEarned += val; totalFees += fee;
      const d = new Date(deal.created_at);
      if (d >= thisStart) thisMonth += val - fee;
      if (d >= lastStart && d <= lastEnd) lastMonth += val - fee;
    });
    const net = totalEarned - totalFees;
    setStats({ totalEarned, totalFees, netEarnings: net, totalDeals: deals.length, avgPerDeal: deals.length > 0 ? net / deals.length : 0, thisMonth, lastMonth });
  };

  useEffect(() => { fetchEarnings(); }, []);

  const filtered = completedDeals.filter(d => {
    const now = new Date();
    if (period === 'month') return new Date(d.created_at) >= new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === 'year') return new Date(d.created_at) >= new Date(now.getFullYear(), 0, 1);
    return true;
  });

  const monthlyData = () => {
    const months = {};
    completedDeals.forEach(deal => {
      const date = new Date(deal.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      const net = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0) * 0.9;
      if (!months[key]) months[key] = { label, amount: 0, deals: 0 };
      months[key].amount += net; months[key].deals += 1;
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([, v]) => v);
  };

  const chartData = monthlyData();
  const maxAmount = Math.max(...chartData.map(d => d.amount), 1);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Earnings</h1>
        <p className="text-gray-500 text-sm mt-0.5">Your revenue as a Fetchr traveler</p>
      </div>

      {/* Hero stat */}
      <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-6 mb-4 text-white shadow-float">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-violet-200 text-sm font-medium">Total Net Earnings</p>
            <p className="text-4xl font-bold mt-1 tracking-tight">${stats.netEarnings.toFixed(2)}</p>
            <p className="text-violet-200 text-sm mt-2">{stats.totalDeals} completed deal{stats.totalDeals !== 1 ? 's' : ''}</p>
          </div>
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
            <TrendingUp size={28} className="text-white" />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'This Month', value: `$${stats.thisMonth.toFixed(0)}`, sub: stats.lastMonth > 0 ? `${((stats.thisMonth - stats.lastMonth) / Math.max(stats.lastMonth, 1) * 100).toFixed(0)}% vs last` : 'First month', color: 'bg-violet-50 text-violet-700' },
          { label: 'Avg Per Deal', value: `$${stats.avgPerDeal.toFixed(0)}`, sub: 'After Fetchr 10%', color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Total Deals', value: stats.totalDeals, sub: 'Completed', color: 'bg-blue-50 text-blue-700' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-4">
            <p className={`text-xs font-semibold mb-1 ${s.color.split(' ')[1]}`}>{s.label}</p>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Breakdown */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5 mb-4">
        <h3 className="font-bold text-gray-900 mb-4">Revenue Breakdown</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Gross Earnings', value: `$${stats.totalEarned.toFixed(2)}`, color: 'bg-gray-50 text-gray-700 border-gray-100' },
            { label: 'Fetchr Fees (10%)', value: `-$${stats.totalFees.toFixed(2)}`, color: 'bg-red-50 text-red-600 border-red-100' },
            { label: 'Net Earnings', value: `$${stats.netEarnings.toFixed(2)}`, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
          ].map((item, i) => (
            <div key={i} className={`${item.color} border rounded-xl p-3.5 text-center`}>
              <p className="text-xs font-medium opacity-70 mb-1">{item.label}</p>
              <p className="text-lg font-bold">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5 mb-4">
          <h3 className="font-bold text-gray-900 mb-5">Monthly Earnings</h3>
          <div className="flex items-end gap-2 h-36">
            {chartData.map((month, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <p className="text-xs text-gray-500 font-semibold">${month.amount.toFixed(0)}</p>
                <div className="w-full bg-gray-100 rounded-lg relative" style={{ height: '80px' }}>
                  <div className="w-full bg-gradient-to-t from-violet-600 to-violet-400 rounded-lg absolute bottom-0 transition-all"
                    style={{ height: `${Math.max((month.amount / maxAmount) * 100, 4)}%` }} />
                </div>
                <p className="text-xs text-gray-400">{month.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deal history */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Deal History</h3>
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {[{ v: 'all', l: 'All' }, { v: 'month', l: 'Month' }, { v: 'year', l: 'Year' }].map(p => (
              <button key={p.v} onClick={() => setPeriod(p.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${period === p.v ? 'bg-white text-violet-600 shadow-sm' : 'text-gray-500'}`}>
                {p.l}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <Award size={24} className="text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No earnings for this period</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(deal => {
              const val = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
              const fee = val * 0.10; const net = val - fee;
              const isExp = expandedId === deal.id;
              return (
                <div key={deal.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition"
                    onClick={() => setExpandedId(isExp ? null : deal.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center">
                        <Plane size={15} className="text-violet-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          {deal.flight?.from_city} → {deal.flight?.to_city}
                        </p>
                        <p className="text-xs text-gray-400">
                          {deal.request?.item_name} · {new Date(deal.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-600">+${net.toFixed(2)}</p>
                        <p className="text-xs text-gray-400">net</p>
                      </div>
                      {isExp ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                    </div>
                  </div>
                  {isExp && (
                    <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-violet-50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-violet-600 mb-1">✈️ Flight</p>
                          <p className="text-sm font-bold text-gray-900">{deal.flight?.from_code} → {deal.flight?.to_code}</p>
                          <p className="text-xs text-gray-500">{deal.flight?.airline} · {deal.flight?.flight_number}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-gray-600 mb-1">📦 Item</p>
                          <p className="text-sm font-bold text-gray-900">{deal.request?.item_name}</p>
                          <p className="text-xs text-gray-500">{deal.request?.weight_kg}kg · {deal.request?.category}</p>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs">
                        <div className="flex justify-between text-gray-500">
                          <span>{deal.request?.weight_kg}kg × ${deal.flight?.price_per_kg}/kg</span>
                          <span>${val.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-red-500">
                          <span>Fetchr fee (10%)</span>
                          <span>-${fee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-emerald-600 border-t border-gray-200 pt-1.5">
                          <span>You received</span>
                          <span>+${net.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Earnings;