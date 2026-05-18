import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Package, Plane, DollarSign, Clock, Shield, MessageCircle, ChevronRight, Zap } from 'lucide-react';

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

  const isTraveler = (deal) => deal.traveler_id === session.user.id;

  const getOtherParty = (deal) => isTraveler(deal) ? deal.shipper : deal.traveler;

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStageInfo = (deal) => {
    if (deal.status === 'in_escrow') {
      return {
        label: 'Escrow Active',
        desc: 'Payment secured. Awaiting delivery.',
        color: 'blue',
        icon: '🔒',
        progress: 66,
      };
    }
    return {
      label: 'Deal Accepted',
      desc: 'Chat with your partner to arrange delivery.',
      color: 'yellow',
      icon: '🤝',
      progress: 33,
    };
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-gray-400 text-sm">Loading active deals...</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 md:px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Active Deals</h1>
          <p className="text-gray-400 text-sm mt-1">
            {deals.length} active deal{deals.length !== 1 ? 's' : ''}
          </p>
        </div>
        {deals.length > 0 && (
          <div className="flex items-center gap-2 bg-green-50 text-green-600 px-3 py-1.5 rounded-full text-xs font-semibold">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </div>
        )}
      </div>

      {deals.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Zap size={36} className="text-purple-300" />
          </div>
          <h2 className="text-lg font-bold text-gray-700 mb-2">No active deals</h2>
          <p className="text-gray-400 text-sm mb-6">Accept a match to start a deal</p>
          <button onClick={() => onNavigate('matches')}
            className="bg-purple-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-purple-700 transition">
            Browse Matches
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {deals.map(deal => {
            const other = getOtherParty(deal);
            const stage = getStageInfo(deal);
            const dealValue = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
            const myRole = isTraveler(deal) ? 'Traveler' : 'Shipper';

            return (
              <div key={deal.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">

                {/* Stage banner */}
                <div className={`px-4 py-2.5 flex items-center justify-between ${
                  stage.color === 'blue' ? 'bg-blue-50' : 'bg-yellow-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <span>{stage.icon}</span>
                    <span className={`text-xs font-bold ${
                      stage.color === 'blue' ? 'text-blue-700' : 'text-yellow-700'
                    }`}>{stage.label}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    myRole === 'Traveler' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                  }`}>
                    {myRole === 'Traveler' ? '✈️' : '📦'} You are {myRole}
                  </span>
                </div>

                <div className="p-4">
                  {/* Route */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Plane size={14} className="text-purple-600" />
                        <p className="text-sm font-bold text-gray-800">
                          {deal.flight?.from_city} → {deal.flight?.to_city}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 ml-5">
                        {deal.flight?.airline} • {deal.flight?.flight_number} •{' '}
                        {deal.flight?.flight_date ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        }) : ''}
                      </p>
                    </div>
                  </div>

                  {/* Item + Value */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Package size={11} /> Item
                      </p>
                      <p className="text-sm font-bold text-gray-800 truncate">{deal.request?.item_name}</p>
                      <p className="text-xs text-gray-500">{deal.request?.weight_kg}kg</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <DollarSign size={11} /> Deal Value
                      </p>
                      <p className="text-sm font-bold text-purple-700">${dealValue.toFixed(2)}</p>
                      <p className="text-xs text-gray-500">${deal.flight?.price_per_kg}/kg</p>
                    </div>
                  </div>

                  {/* Other party */}
                  <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
                    <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0">
                      {getInitials(other?.full_name)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">{other?.full_name || 'User'}</p>
                      <p className="text-xs text-gray-400">{isTraveler(deal) ? 'Shipper' : 'Traveler'}</p>
                    </div>
                    {deal.status === 'in_escrow' && (
                      <div className="flex items-center gap-1 bg-blue-50 text-blue-600 text-xs font-semibold px-2 py-1 rounded-full">
                        <Shield size={10} /> Secured
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                      <span>Deal Progress</span>
                      <span>{stage.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          stage.color === 'blue' ? 'bg-blue-500' : 'bg-yellow-400'
                        }`}
                        style={{ width: `${stage.progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-300 mt-1">
                      <span>Matched</span>
                      <span>Escrow</span>
                      <span>Delivered</span>
                    </div>
                  </div>

                  {/* Action */}
                  <button
                    onClick={() => onNavigate('messages')}
                    className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition"
                  >
                    <MessageCircle size={15} />
                    Open Chat
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ActiveDeals;