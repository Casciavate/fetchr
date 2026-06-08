import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, Plane, DollarSign, Clock, Shield,
  MessageCircle, ChevronRight, Zap, CheckCircle
} from 'lucide-react';

const STAGE_INFO = {
  accepted: { label: 'Deal Accepted', icon: '🤝', desc: 'Chat to agree terms.', color: 'amber', progress: 20 },
  terms_agreed: { label: 'Terms Agreed', icon: '✅', desc: 'Shipper needs to pay escrow.', color: 'violet', progress: 40 },
  in_escrow: { label: 'Escrow Active', icon: '🔒', desc: 'Payment secured. Traveler to upload proof.', color: 'blue', progress: 60 },
  proof_uploaded: { label: 'Proof Uploaded', icon: '📸', desc: 'Both parties confirm delivery.', color: 'indigo', progress: 80 },
  matched: { label: 'Matched', icon: '🤝', desc: 'Chat to agree terms.', color: 'amber', progress: 20 },
};

const ActiveDeals = ({ session, onNavigate }) => {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDeals = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        flight:flights(*),
        request:shipment_requests(*),
        traveler:profiles!matches_traveler_id_fkey(*),
        shipper:profiles!matches_shipper_id_fkey(*)
      `)
      .or(`traveler_id.eq.${session.user.id},shipper_id.eq.${session.user.id}`)
      .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
      .order('created_at', { ascending: false });
    if (data) setDeals(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchDeals();
    // Real-time updates
    const sub = supabase.channel('active-deals-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' },
        () => fetchDeals())
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  const isTraveler = (deal) => deal.traveler_id === session.user.id;
  const getOtherParty = (deal) => isTraveler(deal) ? deal.shipper : deal.traveler;
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStage = (deal) => {
    const s = deal.deal_stage || deal.status || 'accepted';
    return STAGE_INFO[s] || STAGE_INFO['accepted'];
  };

  const getDealValue = (deal) =>
    (deal.agreed_price_per_kg || deal.flight?.price_per_kg || 0) *
    (deal.agreed_weight_kg || deal.request?.weight_kg || 0);

  const myActionNeeded = (deal) => {
    const isTrav = isTraveler(deal);
    const status = deal.deal_stage || deal.status;
    if (status === 'accepted') {
      const myTerms = isTrav ? deal.terms_agreed_traveler : deal.terms_agreed_shipper;
      return !myTerms;
    }
    if (status === 'terms_agreed') return !isTrav; // shipper needs to pay
    if (status === 'in_escrow') return isTrav; // traveler needs to upload proof
    if (status === 'proof_uploaded') {
      const myDone = isTrav ? deal.traveler_completed : deal.shipper_completed;
      return !myDone;
    }
    return false;
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Active Deals</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {deals.length} deal{deals.length !== 1 ? 's' : ''} in progress
          </p>
        </div>
        {deals.length > 0 && (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full text-xs font-semibold border border-emerald-100">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Live
          </div>
        )}
      </div>

      {deals.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl shadow-card border border-gray-100/80">
          <div className="w-20 h-20 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Zap size={32} className="text-violet-300" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">No active deals</h2>
          <p className="text-gray-400 text-sm mb-6">Accept a match to start a deal</p>
          <button onClick={() => onNavigate('matches')} className="btn-primary">
            Browse Matches
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {deals.map(deal => {
            const other = getOtherParty(deal);
            const stage = getStage(deal);
            const dealValue = getDealValue(deal);
            const needsAction = myActionNeeded(deal);
            const myRole = isTraveler(deal) ? 'Traveler' : 'Shipper';

            const stageBg = stage.color === 'blue' ? 'bg-blue-50 border-blue-100' :
              stage.color === 'violet' ? 'bg-violet-50 border-violet-100' :
              stage.color === 'indigo' ? 'bg-indigo-50 border-indigo-100' :
              'bg-amber-50 border-amber-100';

            const stageText = stage.color === 'blue' ? 'text-blue-700' :
              stage.color === 'violet' ? 'text-violet-700' :
              stage.color === 'indigo' ? 'text-indigo-700' :
              'text-amber-700';

            return (
              <div key={deal.id}
                className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden hover:shadow-card-hover transition-all">

                {/* Stage banner */}
                <div className={`px-4 py-2.5 flex items-center justify-between border-b ${stageBg}`}>
                  <div className="flex items-center gap-2">
                    <span>{stage.icon}</span>
                    <span className={`text-xs font-bold ${stageText}`}>{stage.label}</span>
                    {needsAction && (
                      <span className="badge badge-red text-xs animate-pulse">Action needed</span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    myRole === 'Traveler'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {myRole === 'Traveler' ? '✈️' : '📦'} {myRole}
                  </span>
                </div>

                <div className="p-4">
                  {/* Route */}
                  <div className="flex items-center gap-2 mb-3">
                    <Plane size={14} className="text-violet-600 flex-shrink-0" />
                    <p className="text-sm font-bold text-gray-800">
                      {deal.flight?.from_city || deal.flight?.from_code} → {deal.flight?.to_city || deal.flight?.to_code}
                    </p>
                    <p className="text-xs text-gray-400 ml-auto">
                      {deal.flight?.flight_date
                        ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short'
                          })
                        : ''}
                    </p>
                  </div>

                  {/* Item + Value */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Package size={10} /> Item
                      </p>
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {deal.request?.item_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {deal.agreed_weight_kg || deal.request?.weight_kg}kg
                      </p>
                    </div>
                    <div className="bg-violet-50 rounded-xl p-3 border border-violet-100">
                      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <DollarSign size={10} /> Deal Value
                      </p>
                      <p className="text-sm font-bold text-violet-700">
                        ${dealValue.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">
                        ${deal.agreed_price_per_kg || deal.flight?.price_per_kg}/kg
                      </p>
                    </div>
                  </div>

                  {/* Other party */}
                  <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-600 flex-shrink-0">
                      {getInitials(other?.full_name)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">
                        {other?.full_name || 'User'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {isTraveler(deal) ? 'Shipper' : 'Traveler'}
                      </p>
                    </div>
                    {deal.status === 'in_escrow' && (
                      <div className="flex items-center gap-1 bg-blue-50 text-blue-600 text-xs font-semibold px-2 py-1 rounded-full">
                        <Shield size={10} /> Escrow secured
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
                          stage.color === 'blue' ? 'bg-blue-500' :
                          stage.color === 'violet' ? 'bg-violet-500' :
                          stage.color === 'indigo' ? 'bg-indigo-500' :
                          'bg-amber-400'
                        }`}
                        style={{ width: `${stage.progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-300 mt-1">
                      <span>Matched</span>
                      <span>Terms</span>
                      <span>Escrow</span>
                      <span>Proof</span>
                      <span>Done</span>
                    </div>
                  </div>

                  {/* Next action hint */}
                  <div className={`text-xs p-2.5 rounded-xl mb-3 border ${stageBg} ${stageText} font-medium`}>
                    {stage.desc}
                  </div>

                  {/* Completion status */}
                  {(deal.status === 'proof_uploaded' || deal.traveler_completed || deal.shipper_completed) && (
                    <div className="flex items-center gap-4 text-xs mb-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <span className={`flex items-center gap-1 font-semibold ${
                        deal.traveler_completed ? 'text-emerald-600' : 'text-gray-300'
                      }`}>
                        {deal.traveler_completed ? <CheckCircle size={12} /> : <Clock size={12} />}
                        Traveler confirmed
                      </span>
                      <span className={`flex items-center gap-1 font-semibold ${
                        deal.shipper_completed ? 'text-emerald-600' : 'text-gray-300'
                      }`}>
                        {deal.shipper_completed ? <CheckCircle size={12} /> : <Clock size={12} />}
                        Shipper confirmed
                      </span>
                    </div>
                  )}

                  <button
                    onClick={() => onNavigate('messages')}
                    className="w-full flex items-center justify-center gap-2 btn-primary py-3">
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