import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, Plane, DollarSign, Shield, CheckCircle,
  MessageCircle, Clock, Lock, Image
} from 'lucide-react';

const ActiveDeals = ({ session, onNavigate }) => {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDeals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .select(`
        *,
        flight:flights(*),
        request:shipment_requests(*),
        traveler:profiles!matches_traveler_id_fkey(*),
        shipper:profiles!matches_shipper_id_fkey(*)
      `)
      .or(`traveler_id.eq.${session.user.id},shipper_id.eq.${session.user.id}`)
      .in('status', ['accepted', 'in_escrow'])
      .order('created_at', { ascending: false });

    if (!error) setDeals(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchDeals(); }, []);

  // Real-time updates
  useEffect(() => {
    const sub = supabase
      .channel('active-deals-changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matches'
      }, () => fetchDeals())
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  const isTraveler = (deal) => deal.traveler_id === session.user.id;

  const getOtherParty = (deal) => {
    return isTraveler(deal) ? deal.shipper : deal.traveler;
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'accepted':
        return { label: 'Awaiting Payment', color: 'bg-yellow-50 text-yellow-600', icon: Clock };
      case 'in_escrow':
        return { label: 'In Escrow', color: 'bg-blue-50 text-blue-600', icon: Lock };
      default:
        return { label: status, color: 'bg-gray-50 text-gray-600', icon: Clock };
    }
  };

  const completeDeal = async (dealId) => {
    if (window.confirm('Confirm delivery complete? This will release escrow funds to the traveler.')) {
      await supabase.from('matches')
        .update({ status: 'completed' })
        .eq('id', dealId);
      setDeals(deals.filter(d => d.id !== dealId));
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-gray-400 text-sm">Loading active deals...</p>
    </div>
  );

  if (deals.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4">
        <Package size={28} className="text-purple-400" />
      </div>
      <h2 className="text-lg font-bold text-gray-800 mb-1">No active deals</h2>
      <p className="text-gray-400 text-sm mb-4">Accept a match to start a deal</p>
      <button
        onClick={() => onNavigate('matches')}
        className="bg-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700"
      >
        View Matches
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Active Deals</h1>
        <p className="text-gray-400 text-sm mt-1">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} in progress
        </p>
      </div>

      <div className="space-y-4">
        {deals.map(deal => {
          const statusInfo = getStatusInfo(deal.status);
          const otherParty = getOtherParty(deal);
          const dealValue = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
          const fetchrFee = dealValue * 0.10;
          const total = dealValue + fetchrFee;
          const StatusIcon = statusInfo.icon;

          return (
            <div key={deal.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Item Photo Banner */}
              {deal.request?.item_photo_url && (
                <div className="relative h-36 bg-gray-100">
                  <img
                    src={deal.request.item_photo_url}
                    alt={deal.request.item_name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute bottom-3 left-4">
                    <p className="text-white font-bold text-sm">{deal.request.item_name}</p>
                    <p className="text-white/80 text-xs">{deal.request.category} • {deal.request.weight_kg}kg</p>
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="p-5 border-b border-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${statusInfo.color}`}>
                      <StatusIcon size={11} />
                      {statusInfo.label}
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                      {isTraveler(deal) ? '✈️ You are Traveler' : '📦 You are Shipper'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(deal.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </span>
                </div>

                {/* Route */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Plane size={18} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">
                      {deal.flight?.from_city} → {deal.flight?.to_city}
                    </p>
                    <p className="text-xs text-gray-400">
                      {deal.flight?.airline} • {deal.flight?.flight_number} •{' '}
                      {deal.flight?.flight_date ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      }) : ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Deal Details */}
              <div className="p-5">

                {/* Item (if no photo) */}
                {!deal.request?.item_photo_url && (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">Item</p>
                      <p className="text-sm font-semibold text-gray-800 truncate">{deal.request?.item_name}</p>
                      <p className="text-xs text-gray-400">{deal.request?.weight_kg}kg • {deal.request?.category}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">Other Party</p>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-600">
                          {getInitials(otherParty?.full_name)}
                        </div>
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {otherParty?.full_name || otherParty?.email || 'User'}
                        </p>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">Match Score</p>
                      <p className="text-sm font-semibold text-purple-600">{deal.match_score}%</p>
                      <p className="text-xs text-gray-400">compatibility</p>
                    </div>
                  </div>
                )}

                {/* Other party row if photo shown */}
                {deal.request?.item_photo_url && (
                  <div className="flex items-center gap-3 mb-4 bg-gray-50 rounded-xl p-3">
                    <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0">
                      {getInitials(otherParty?.full_name)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">
                        {otherParty?.full_name || otherParty?.email || 'User'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {isTraveler(deal) ? 'Shipper' : 'Traveler'} • {deal.match_score}% match
                      </p>
                    </div>
                  </div>
                )}

                {/* Payment Breakdown */}
                <div className="bg-purple-50 rounded-xl p-4 mb-4">
                  <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1">
                    <DollarSign size={12} /> Payment Breakdown
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">
                        {deal.request?.weight_kg}kg × ${deal.flight?.price_per_kg}/kg
                      </span>
                      <span className="font-semibold text-gray-700">${dealValue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Fetchr fee (10%)</span>
                      <span className="font-semibold text-gray-700">${fetchrFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-purple-700 pt-1.5 border-t border-purple-100">
                      <span>Total</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                    {deal.status === 'in_escrow' && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-green-600 font-semibold">
                        <Shield size={11} /> Funds secured in escrow
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                    <span>Deal Progress</span>
                    <span>{deal.status === 'in_escrow' ? '66%' : '33%'}</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all"
                      style={{ width: deal.status === 'in_escrow' ? '66%' : '33%' }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-1.5">
                    <span className="text-purple-500 font-semibold">✓ Matched</span>
                    <span className={deal.status === 'in_escrow'
                      ? 'text-purple-500 font-semibold' : 'text-gray-300'}>
                      {deal.status === 'in_escrow' ? '✓' : '○'} Escrow Paid
                    </span>
                    <span className="text-gray-300">○ Delivered</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => onNavigate('messages')}
                    className="flex-1 flex items-center justify-center gap-2 border border-purple-200 text-purple-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-purple-50 transition"
                  >
                    <MessageCircle size={15} /> Open Chat
                  </button>
                  {deal.status === 'in_escrow' && (
                    <button
                      onClick={() => completeDeal(deal.id)}
                      className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-green-600 transition"
                    >
                      <CheckCircle size={15} /> Confirm Delivery
                    </button>
                  )}
                  {deal.status === 'accepted' && !isTraveler(deal) && (
                    <button
                      onClick={() => onNavigate('messages')}
                      className="flex-1 flex items-center justify-center gap-2 bg-purple-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-purple-700 transition"
                    >
                      <Shield size={15} /> Pay Escrow
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActiveDeals;