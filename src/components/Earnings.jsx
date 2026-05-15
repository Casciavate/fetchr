import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  DollarSign, TrendingUp, Plane, Package,
  Calendar, ChevronDown, ChevronUp, Award
} from 'lucide-react';

const Earnings = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [completedDeals, setCompletedDeals] = useState([]);
  const [stats, setStats] = useState({
    totalEarned: 0,
    totalFees: 0,
    netEarnings: 0,
    totalDeals: 0,
    avgPerDeal: 0,
    thisMonth: 0,
    lastMonth: 0,
  });
  const [expandedId, setExpandedId] = useState(null);
  const [period, setPeriod] = useState('all');

  const fetchEarnings = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('matches')
      .select(`
        *,
        flight:flights(*),
        request:shipment_requests(*),
        shipper:profiles!matches_shipper_id_fkey(*)
      `)
      .eq('traveler_id', session.user.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setCompletedDeals(data);
      calculateStats(data);
    }
    setLoading(false);
  };

  const calculateStats = (deals) => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    let totalEarned = 0;
    let totalFees = 0;
    let thisMonth = 0;
    let lastMonth = 0;

    deals.forEach(deal => {
      const dealValue = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
      const fee = dealValue * 0.10;
      const net = dealValue - fee;

      totalEarned += dealValue;
      totalFees += fee;

      const dealDate = new Date(deal.created_at);
      if (dealDate >= thisMonthStart) thisMonth += net;
      if (dealDate >= lastMonthStart && dealDate <= lastMonthEnd) lastMonth += net;
    });

    const netEarnings = totalEarned - totalFees;

    setStats({
      totalEarned,
      totalFees,
      netEarnings,
      totalDeals: deals.length,
      avgPerDeal: deals.length > 0 ? netEarnings / deals.length : 0,
      thisMonth,
      lastMonth,
    });
  };

  useEffect(() => { fetchEarnings(); }, []);

  const getFilteredDeals = () => {
    const now = new Date();
    switch (period) {
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return completedDeals.filter(d => new Date(d.created_at) >= monthStart);
      case 'year':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return completedDeals.filter(d => new Date(d.created_at) >= yearStart);
      default:
        return completedDeals;
    }
  };

  const filteredDeals = getFilteredDeals();

  const monthlyData = () => {
    const months = {};
    completedDeals.forEach(deal => {
      const date = new Date(deal.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      const dealValue = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
      const net = dealValue * 0.90;

      if (!months[key]) months[key] = { label, amount: 0, deals: 0 };
      months[key].amount += net;
      months[key].deals += 1;
    });

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([, v]) => v);
  };

  const chartData = monthlyData();
  const maxAmount = Math.max(...chartData.map(d => d.amount), 1);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-gray-400 text-sm">Loading earnings...</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Earnings</h1>
        <p className="text-gray-400 text-sm mt-1">Your revenue as a Fetchr traveler</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-purple-600 rounded-2xl p-5 text-white">
          <p className="text-purple-200 text-sm mb-1">Total Net Earnings</p>
          <p className="text-3xl font-bold">${stats.netEarnings.toFixed(2)}</p>
          <p className="text-purple-200 text-xs mt-2">
            From {stats.totalDeals} completed deal{stats.totalDeals !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="grid grid-rows-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">This Month</p>
            <p className="text-xl font-bold text-gray-800">${stats.thisMonth.toFixed(2)}</p>
            {stats.lastMonth > 0 && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${
                stats.thisMonth >= stats.lastMonth ? 'text-green-500' : 'text-red-400'
              }`}>
                <TrendingUp size={11} />
                {stats.lastMonth > 0
                  ? `${((stats.thisMonth - stats.lastMonth) / stats.lastMonth * 100).toFixed(0)}% vs last month`
                  : 'First month!'}
              </p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">Avg Per Deal</p>
            <p className="text-xl font-bold text-gray-800">${stats.avgPerDeal.toFixed(2)}</p>
            <p className="text-xs text-gray-400 mt-1">After Fetchr 10% fee</p>
          </div>
        </div>
      </div>

      {/* Fee Breakdown */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <h3 className="font-bold text-gray-800 mb-4">Revenue Breakdown</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400 mb-1">Gross Earnings</p>
            <p className="text-lg font-bold text-gray-800">${stats.totalEarned.toFixed(2)}</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-xl">
            <p className="text-xs text-gray-400 mb-1">Fetchr Fees (10%)</p>
            <p className="text-lg font-bold text-red-500">-${stats.totalFees.toFixed(2)}</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-xl">
            <p className="text-xs text-gray-400 mb-1">Net Earnings</p>
            <p className="text-lg font-bold text-green-600">${stats.netEarnings.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Monthly Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
          <h3 className="font-bold text-gray-800 mb-4">Monthly Earnings (Last 6 Months)</h3>
          <div className="flex items-end gap-3 h-32">
            {chartData.map((month, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <p className="text-xs text-gray-500 font-semibold">${month.amount.toFixed(0)}</p>
                <div className="w-full bg-gray-100 rounded-t-lg relative" style={{ height: '80px' }}>
                  <div
                    className="w-full bg-purple-600 rounded-t-lg absolute bottom-0 transition-all"
                    style={{ height: `${(month.amount / maxAmount) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400">{month.label}</p>
                <p className="text-xs text-gray-300">{month.deals} deal{month.deals !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deal History */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">Deal History</h3>
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {[
              { value: 'all', label: 'All' },
              { value: 'month', label: 'Month' },
              { value: 'year', label: 'Year' },
            ].map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  period === p.value
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {filteredDeals.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-14 h-14 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Award size={24} className="text-purple-400" />
            </div>
            <p className="text-gray-400 text-sm">No earnings yet for this period</p>
            <p className="text-gray-300 text-xs mt-1">Complete deals as a traveler to see earnings here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDeals.map(deal => {
              const dealValue = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
              const fee = dealValue * 0.10;
              const net = dealValue - fee;
              const isExpanded = expandedId === deal.id;

              return (
                <div key={deal.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition"
                    onClick={() => setExpandedId(isExpanded ? null : deal.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
                        <Plane size={16} className="text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {deal.flight?.from_city} → {deal.flight?.to_city}
                        </p>
                        <p className="text-xs text-gray-400">
                          {deal.request?.item_name} •{' '}
                          {new Date(deal.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">+${net.toFixed(2)}</p>
                        <p className="text-xs text-gray-400">net earned</p>
                      </div>
                      {isExpanded
                        ? <ChevronUp size={16} className="text-gray-400" />
                        : <ChevronDown size={16} className="text-gray-400" />
                      }
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-purple-50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-purple-600 mb-1">✈️ Flight</p>
                          <p className="text-sm font-bold text-gray-800">
                            {deal.flight?.from_code} → {deal.flight?.to_code}
                          </p>
                          <p className="text-xs text-gray-500">{deal.flight?.airline} • {deal.flight?.flight_number}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {deal.flight?.flight_date ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            }) : ''}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-gray-600 mb-1">📦 Shipment</p>
                          <p className="text-sm font-bold text-gray-800">{deal.request?.item_name}</p>
                          <p className="text-xs text-gray-500">{deal.request?.category}</p>
                          <p className="text-xs text-gray-400 mt-1">{deal.request?.weight_kg}kg</p>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">{deal.request?.weight_kg}kg × ${deal.flight?.price_per_kg}/kg</span>
                          <span className="font-semibold">${dealValue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-red-500">
                          <span>Fetchr fee (10%)</span>
                          <span>-${fee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-green-600 border-t border-gray-200 pt-1.5">
                          <span>You received</span>
                          <span>+${net.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-600">
                          {deal.shipper?.full_name?.[0] || '?'}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-700">{deal.shipper?.full_name || 'Shipper'}</p>
                          <p className="text-xs text-gray-400">Shipper</p>
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