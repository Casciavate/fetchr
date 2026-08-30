import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  TrendingUp, Plane, Package, ChevronDown, ChevronUp,
  Award, X, Shield, CheckCircle, DollarSign
} from 'lucide-react';
import RatingDisplay from './shared/RatingDisplay';
import StatusPill from './shared/StatusPill';
import { RowSkeleton } from './shared/Skeleton';
import { calcFees, TRAVELER_PLATFORM_FEE_PCT } from '../lib/fees';

const Earnings = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [completedDeals, setCompletedDeals] = useState([]);
  const [stats, setStats] = useState({
    totalEarned: 0, totalFees: 0, netEarnings: 0,
    totalDeals: 0, avgPerDeal: 0, thisMonth: 0, lastMonth: 0
  });
  const [expandedId, setExpandedId] = useState(null);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [period, setPeriod] = useState('all');

  const fetchEarnings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .select(`
        *,
        flight:flights(*),
        request:shipment_requests(*),
        shipper:profiles!matches_shipper_id_fkey(
          id, full_name, avatar_url, rating, total_reviews
        )
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
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    let totalEarned = 0, totalFees = 0, thisMonth = 0, lastMonth = 0;

    deals.forEach(deal => {
      const fees = calcFees(deal);
      const subtotal = fees.transportFee + fees.shopFee + fees.purchasePrice;
      totalEarned += subtotal;
      totalFees += fees.travelerPlatformFee;
      const d = new Date(deal.created_at);
      if (d >= thisStart) thisMonth += fees.travelerReceives;
      if (d >= lastStart && d <= lastEnd) lastMonth += fees.travelerReceives;
    });

    const net = totalEarned - totalFees;
    setStats({
      totalEarned, totalFees, netEarnings: net,
      totalDeals: deals.length,
      avgPerDeal: deals.length > 0 ? net / deals.length : 0,
      thisMonth, lastMonth
    });
  };

  useEffect(() => { fetchEarnings(); }, []);

  // Traveler-only screen — always the traveler's own numbers: gross
  // (transport + shop fee + purchase reimbursement), the 5% platform fee
  // deducted from their payout, and what they actually received net.
  const getDealFees = (deal) => {
    const fees = calcFees(deal);
    return {
      subtotal: fees.transportFee + fees.shopFee + fees.purchasePrice,
      fee: fees.travelerPlatformFee,
      net: fees.travelerReceives,
      pct: Math.round(TRAVELER_PLATFORM_FEE_PCT * 100),
      isPurchase: fees.isPurchase, shopFee: fees.shopFee, purchasePrice: fees.purchasePrice,
    };
  };

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
      const { net } = getDealFees(deal);
      if (!months[key]) months[key] = { label, amount: 0, deals: 0 };
      months[key].amount += net;
      months[key].deals += 1;
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6).map(([, v]) => v);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const money = (n) => `$${(n || 0).toFixed(2)}`;
  const kg = (n) => `${(parseFloat(n) || 0).toFixed(1)} kg`;

  const chartData = monthlyData();
  const maxAmount = Math.max(...chartData.map(d => d.amount), 1);

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-3">
      {[1, 2, 3].map(i => <RowSkeleton key={i} />)}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display font-bold text-title-l text-ink-900">Earnings</h1>
        <p className="text-body-s text-content-muted mt-0.5">Your revenue as a fetchr traveller</p>
      </div>

      {/* Hero stat */}
      <div className="card p-6 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-body-s text-content-muted font-medium">Total net earnings</p>
            <p className="font-mono font-bold text-display-l text-ink-900 mt-1">{money(stats.netEarnings)}</p>
            <p className="text-body-s text-content-muted mt-2">
              {stats.totalDeals} completed deal{stats.totalDeals !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="w-14 h-14 bg-ink-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <TrendingUp size={26} className="text-ink-900" />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          {
            label: 'This month',
            value: `$${stats.thisMonth.toFixed(0)}`,
            sub: stats.lastMonth > 0
              ? `${((stats.thisMonth - stats.lastMonth) / Math.max(stats.lastMonth, 1) * 100).toFixed(0)}% vs last`
              : 'First month',
          },
          {
            label: 'Avg per deal',
            value: `$${stats.avgPerDeal.toFixed(0)}`,
            sub: 'After fetchr fee',
          },
          {
            label: 'Total deals',
            value: stats.totalDeals,
            sub: 'Completed',
          },
        ].map((s, i) => (
          <div key={i} className="card p-4">
            <p className="text-label text-content-muted mb-1">{s.label}</p>
            <p className="font-mono font-bold text-title-m text-ink-900">{s.value}</p>
            <p className="text-micro text-content-subtle mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Breakdown */}
      <div className="card p-5 mb-4">
        <h3 className="font-display font-bold text-title-s text-ink-900 mb-4">Revenue breakdown</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Gross earnings', value: money(stats.totalEarned), bg: 'bg-surface-sunken', text: 'text-ink-900' },
            { label: 'fetchr fee', value: `−${money(stats.totalFees)}`, bg: 'bg-danger-tint', text: 'text-danger' },
            { label: 'Net earnings', value: money(stats.netEarnings), bg: 'bg-success-tint', text: 'text-success' },
          ].map((item, i) => (
            <div key={i} className={`${item.bg} border border-line rounded-md p-3.5 text-center`}>
              <p className="text-micro text-content-muted mb-1">{item.label}</p>
              <p className={`font-mono font-bold text-title-s ${item.text}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly chart */}
      {chartData.length > 0 && (
        <div className="card p-5 mb-4">
          <h3 className="font-display font-bold text-title-s text-ink-900 mb-5">Monthly earnings</h3>
          <div className="flex items-end gap-2 h-36">
            {chartData.map((month, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <p className="font-mono text-micro text-content-muted font-semibold">${month.amount.toFixed(0)}</p>
                <div className="w-full bg-ink-100 rounded-sm relative" style={{ height: '80px' }}>
                  <div
                    className="w-full bg-ink-900 rounded-sm absolute bottom-0 transition-all"
                    style={{ height: `${Math.max((month.amount / maxAmount) * 100, 4)}%` }}
                  />
                </div>
                <p className="text-micro text-content-muted">{month.label}</p>
                <p className="font-mono text-micro text-content-subtle">{month.deals}d</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deal history */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-title-s text-ink-900">Deal history</h3>
          <div className="flex bg-surface-sunken rounded-md p-1 gap-1">
            {[{ v: 'all', l: 'All' }, { v: 'month', l: 'Month' }, { v: 'year', l: 'Year' }].map(p => (
              <button key={p.v} onClick={() => setPeriod(p.v)}
                className={`px-3 py-1.5 rounded-sm text-label font-semibold transition-all ${
                  period === p.v ? 'bg-surface text-ink-900 border border-line' : 'text-content-muted'
                }`}>
                {p.l}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-surface-sunken rounded-md">
            <Award size={24} className="text-ink-300 mx-auto mb-2" />
            <p className="text-body-s text-content-subtle">No earnings for this period</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(deal => {
              const { subtotal, fee, net, isPurchase, shopFee, purchasePrice } = getDealFees(deal);
              const isExp = expandedId === deal.id;
              const shipper = deal.shipper;

              return (
                <div key={deal.id} className="border border-line rounded-md overflow-hidden">
                  {/* Row */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-sunken transition"
                    onClick={() => setExpandedId(isExp ? null : deal.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-ink-100 rounded-md flex items-center justify-center flex-shrink-0">
                        <Plane size={15} className="text-ink-600" />
                      </div>
                      <div>
                        <p className="text-body-m font-semibold text-ink-900">
                          {deal.flight?.from_city || deal.flight?.from_code} → {deal.flight?.to_city || deal.flight?.to_code}
                        </p>
                        <p className="text-body-s text-content-subtle">
                          {deal.request?.item_name} · {new Date(deal.created_at).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-mono text-body-m font-bold text-success">+{money(net)}</p>
                        <p className="text-micro text-content-subtle">net earned</p>
                      </div>
                      {isExp
                        ? <ChevronUp size={15} className="text-ink-400" />
                        : <ChevronDown size={15} className="text-ink-400" />
                      }
                    </div>
                  </div>

                  {/* Expanded deal detail */}
                  {isExp && (
                    <div className="border-t border-line p-4 space-y-4 bg-surface-sunken">

                      {/* Flight + Item */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-surface rounded-md p-3 border border-line">
                          <p className="text-label text-ink-600 mb-2 flex items-center gap-1">
                            <Plane size={11} /> Flight details
                          </p>
                          <p className="font-mono font-semibold text-body-m text-ink-900">
                            {deal.flight?.from_code} → {deal.flight?.to_code}
                          </p>
                          <p className="text-body-s text-content-muted mt-0.5">{deal.flight?.airline}</p>
                          {deal.flight?.flight_number && (
                            <p className="font-mono text-body-s text-content-subtle">{deal.flight.flight_number}</p>
                          )}
                          <p className="text-body-s text-content-muted font-semibold mt-1">
                            {deal.flight?.flight_date
                              ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', {
                                  day: '2-digit', month: '2-digit', year: 'numeric'
                                })
                              : ''}
                          </p>
                        </div>
                        <div className="bg-surface rounded-md p-3 border border-line">
                          <p className="text-label text-content-muted mb-2 flex items-center gap-1">
                            <Package size={11} /> Item delivered
                          </p>
                          <p className="text-body-m font-semibold text-ink-900">{deal.request?.item_name}</p>
                          <p className="text-body-s text-content-muted mt-0.5">{deal.request?.category}</p>
                          <p className="font-mono text-body-s text-content-subtle mt-1">
                            {kg(deal.agreed_weight_kg || deal.request?.weight_kg)}
                          </p>
                          {deal.request?.description && (
                            <p className="text-body-s text-content-subtle mt-1 italic truncate">
                              "{deal.request.description}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Agreed terms */}
                      {(deal.agreed_price_per_kg || deal.agreed_notes) && (
                        <div className="bg-surface rounded-md p-3 border border-line">
                          <p className="text-label text-content-muted mb-2">Agreed terms</p>
                          <div className="grid grid-cols-2 gap-2 text-body-s font-mono">
                            {deal.agreed_price_per_kg && (
                              <div>
                                <p className="text-content-subtle">Price/kg</p>
                                <p className="font-bold text-ink-900">${deal.agreed_price_per_kg}</p>
                              </div>
                            )}
                            {deal.agreed_weight_kg && (
                              <div>
                                <p className="text-content-subtle">Weight</p>
                                <p className="font-bold text-ink-900">{kg(deal.agreed_weight_kg)}</p>
                              </div>
                            )}
                          </div>
                          {deal.agreed_notes && (
                            <p className="text-body-s text-content-muted italic mt-2">"{deal.agreed_notes}"</p>
                          )}
                        </div>
                      )}

                      {/* Sender */}
                      {shipper && (
                        <div className="flex items-center gap-3 p-3 bg-surface rounded-md border border-line">
                          <div className="w-10 h-10 rounded-avatar bg-ink-900 flex items-center justify-center text-body-s font-mono font-semibold text-paper-100 flex-shrink-0">
                            {getInitials(shipper.full_name)}
                          </div>
                          <div className="flex-1">
                            <p className="text-body-m font-semibold text-ink-900">{shipper.full_name}</p>
                            <p className="text-micro text-content-subtle">Sender</p>
                            <div className="mt-0.5">
                              <RatingDisplay rating={shipper.rating} totalReviews={shipper.total_reviews} size={11} />
                            </div>
                          </div>
                          <StatusPill tone="success" icon={CheckCircle}>Completed</StatusPill>
                        </div>
                      )}

                      {/* Fee breakdown */}
                      <div className="bg-surface rounded-md p-3 border border-line space-y-1.5 text-body-s font-mono">
                        <p className="font-display font-bold text-ink-900 mb-2 text-label">Earnings breakdown</p>
                        <div className="flex justify-between text-content-muted">
                          <span>
                            {kg(deal.agreed_weight_kg || deal.request?.weight_kg)} ×
                            ${deal.agreed_price_per_kg || deal.flight?.price_per_kg}/kg
                          </span>
                          <span>{money(subtotal - shopFee - purchasePrice)}</span>
                        </div>
                        {isPurchase && (
                          <div className="flex justify-between text-content-muted">
                            <span>Shop &amp; ship service fee</span>
                            <span>{money(shopFee)}</span>
                          </div>
                        )}
                        {isPurchase && purchasePrice > 0 && (
                          <div className="flex justify-between text-content-muted">
                            <span>Item purchase reimbursement</span>
                            <span>{money(purchasePrice)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-danger">
                          <span>Platform fee ({Math.round(TRAVELER_PLATFORM_FEE_PCT * 100)}%)</span>
                          <span>−{money(fee)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-success border-t border-line pt-1.5">
                          <span>You received</span>
                          <span>+{money(net)}</span>
                        </div>
                      </div>

                      {/* Proof photo */}
                      {deal.proof_photo_url && (
                        <div>
                          <p className="text-label text-content-muted mb-2">Delivery proof</p>
                          <a href={deal.proof_photo_url} target="_blank" rel="noreferrer">
                            <img src={deal.proof_photo_url} alt="Delivery proof"
                              className="w-full h-36 object-cover rounded-md border border-line hover:opacity-90 transition" />
                          </a>
                        </div>
                      )}

                      <p className="text-body-s text-content-subtle text-center">
                        Deal completed on {new Date(deal.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'long', year: 'numeric'
                        })}
                      </p>
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
