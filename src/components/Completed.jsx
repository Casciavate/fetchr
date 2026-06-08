import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  CheckCircle, Star, Package, Plane, ChevronDown,
  ChevronUp, Award, TrendingUp, Shield, DollarSign
} from 'lucide-react';

const Completed = ({ session }) => {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [ratings, setRatings] = useState({});
  const [submittingRating, setSubmittingRating] = useState({});
  const [ratedDeals, setRatedDeals] = useState({});

  const fetchCompleted = async () => {
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
      .eq('status', 'completed')
      .order('created_at', { ascending: false });
    if (data) setDeals(data);
    setLoading(false);
  };

  useEffect(() => { fetchCompleted(); }, []);

  const isTraveler = (deal) => deal.traveler_id === session.user.id;
  const getOtherParty = (deal) => isTraveler(deal) ? deal.shipper : deal.traveler;

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getDealValue = (deal) => {
    return (deal.agreed_price_per_kg || deal.flight?.price_per_kg || 0) *
      (deal.agreed_weight_kg || deal.request?.weight_kg || 0);
  };

  const getFetchrPct = (value) => {
    if (value >= 500) return 0.07;
    if (value >= 200) return 0.085;
    if (value < 20 && value > 0) return 0.12;
    return 0.10;
  };

  const submitRating = async (dealId, otherPartyId, rating) => {
    setSubmittingRating(prev => ({ ...prev, [dealId]: true }));
    const { data: profile } = await supabase
      .from('profiles').select('rating, total_reviews')
      .eq('id', otherPartyId).single();
    if (profile) {
      const newTotal = (profile.total_reviews || 0) + 1;
      const newRating = ((profile.rating || 0) * (profile.total_reviews || 0) + rating) / newTotal;
      await supabase.from('profiles').update({
        rating: Math.round(newRating * 10) / 10,
        total_reviews: newTotal,
      }).eq('id', otherPartyId);
    }
    setRatedDeals(prev => ({ ...prev, [dealId]: rating }));
    setSubmittingRating(prev => ({ ...prev, [dealId]: false }));
  };

  const totalEarned = deals
    .filter(d => isTraveler(d))
    .reduce((sum, d) => {
      const v = getDealValue(d);
      return sum + v * (1 - getFetchrPct(v));
    }, 0);

  const totalSpent = deals
    .filter(d => !isTraveler(d))
    .reduce((sum, d) => sum + getDealValue(d), 0);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Completed Deals</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} completed
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total Deals', value: deals.length, icon: Award, color: 'bg-violet-50 text-violet-600' },
          { label: 'Total Earned', value: `$${totalEarned.toFixed(0)}`, icon: TrendingUp, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Total Spent', value: `$${totalSpent.toFixed(0)}`, icon: Package, color: 'bg-blue-50 text-blue-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-4 text-center">
            <div className={`w-10 h-10 ${s.color} rounded-xl flex items-center justify-center mx-auto mb-2`}>
              <s.icon size={18} />
            </div>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {deals.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl shadow-card border border-gray-100/80">
          <div className="w-20 h-20 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-violet-300" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">No completed deals yet</h2>
          <p className="text-gray-400 text-sm">Your completed deliveries will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map(deal => {
            const other = getOtherParty(deal);
            const dealValue = getDealValue(deal);
            const fetchrPct = getFetchrPct(dealValue);
            const fetchrFee = dealValue * fetchrPct;
            const travelerReceives = dealValue - fetchrFee;
            const isExpanded = expandedId === deal.id;
            const currentRating = ratings[deal.id] || 0;
            const hasRated = !!ratedDeals[deal.id];

            return (
              <div key={deal.id}
                className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden">

                {/* Header row */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => setExpandedId(isExpanded ? null : deal.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <CheckCircle size={20} className="text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800">
                          {deal.flight?.from_city || deal.flight?.from_code} → {deal.flight?.to_city || deal.flight?.to_code}
                        </p>
                        <p className="text-xs text-gray-400">
                          {deal.request?.item_name} ·{' '}
                          {new Date(deal.created_at).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-sm font-bold ${isTraveler(deal) ? 'text-emerald-600' : 'text-gray-700'}`}>
                          {isTraveler(deal) ? '+' : ''}${isTraveler(deal)
                            ? travelerReceives.toFixed(2)
                            : dealValue.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {isTraveler(deal) ? 'earned' : 'paid'}
                        </p>
                      </div>
                      {isExpanded
                        ? <ChevronUp size={16} className="text-gray-400" />
                        : <ChevronDown size={16} className="text-gray-400" />
                      }
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50/50">

                    {/* Flight + Item */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl p-3 border border-gray-100">
                        <p className="text-xs font-semibold text-violet-600 mb-2 flex items-center gap-1">
                          <Plane size={11} /> Flight
                        </p>
                        <p className="text-sm font-bold text-gray-900">
                          {deal.flight?.from_code} → {deal.flight?.to_code}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{deal.flight?.airline}</p>
                        {deal.flight?.flight_number && (
                          <p className="text-xs text-gray-400">{deal.flight.flight_number}</p>
                        )}
                        <p className="text-xs text-violet-600 font-semibold mt-1">
                          {deal.flight?.flight_date
                            ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', {
                                day: '2-digit', month: '2-digit', year: 'numeric'
                              })
                            : ''}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-gray-100">
                        <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                          <Package size={11} /> Item
                        </p>
                        <p className="text-sm font-bold text-gray-900">{deal.request?.item_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{deal.request?.category}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {deal.agreed_weight_kg || deal.request?.weight_kg}kg
                        </p>
                      </div>
                    </div>

                    {/* Fee breakdown */}
                    <div className="bg-white rounded-xl p-3 border border-gray-100 space-y-1.5 text-xs">
                      <p className="font-bold text-gray-700 mb-2">Deal Breakdown</p>
                      <div className="flex justify-between text-gray-500">
                        <span>
                          {deal.agreed_weight_kg || deal.request?.weight_kg}kg ×
                          ${deal.agreed_price_per_kg || deal.flight?.price_per_kg}/kg
                        </span>
                        <span>${dealValue.toFixed(2)}</span>
                      </div>
                      {isTraveler(deal) ? (
                        <>
                          <div className="flex justify-between text-red-400">
                            <span>Fetchr fee ({Math.round(fetchrPct * 100)}%)</span>
                            <span>-${fetchrFee.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-emerald-600 border-t border-gray-100 pt-1.5">
                            <span>You received</span>
                            <span>+${travelerReceives.toFixed(2)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between font-bold text-gray-700 border-t border-gray-100 pt-1.5">
                          <span>You paid</span>
                          <span>${dealValue.toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    {/* Proof photo */}
                    {deal.proof_photo_url && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">Delivery Proof</p>
                        <a href={deal.proof_photo_url} target="_blank" rel="noreferrer">
                          <img src={deal.proof_photo_url} alt="Proof"
                            className="w-full h-36 object-cover rounded-xl border border-gray-200 hover:opacity-90 transition" />
                        </a>
                      </div>
                    )}

                    {/* Other party */}
                    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100">
                      <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-600 flex-shrink-0">
                        {getInitials(other?.full_name)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">{other?.full_name || 'User'}</p>
                        <p className="text-xs text-gray-400">
                          {isTraveler(deal) ? 'Shipper' : 'Traveler'}
                        </p>
                        {other?.rating > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {[1,2,3,4,5].map(s => (
                              <Star key={s} size={11}
                                className={s <= Math.round(other.rating)
                                  ? 'text-amber-400 fill-amber-400'
                                  : 'text-gray-200'} />
                            ))}
                            <span className="text-xs text-gray-500">{other.rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                      <span className="badge badge-green text-xs">
                        <CheckCircle size={9} /> Completed
                      </span>
                    </div>

                    {/* Rating */}
                    {!hasRated ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-2">
                          Rate your experience with {other?.full_name?.split(' ')[0] || 'this user'}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            {[1,2,3,4,5].map(star => (
                              <button key={star}
                                onClick={() => setRatings(prev => ({ ...prev, [deal.id]: star }))}
                                className="transition-transform hover:scale-110">
                                <Star size={28}
                                  className={star <= currentRating
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-gray-200'} />
                              </button>
                            ))}
                          </div>
                          {currentRating > 0 && (
                            <button
                              onClick={() => submitRating(deal.id, other?.id, currentRating)}
                              disabled={submittingRating[deal.id]}
                              className="ml-2 btn-primary px-4 py-1.5 text-xs disabled:opacity-50">
                              {submittingRating[deal.id] ? 'Submitting...' : 'Submit'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                        <CheckCircle size={16} className="text-emerald-500" />
                        <p className="text-sm text-emerald-700 font-semibold">
                          You rated {other?.full_name?.split(' ')[0]} {ratedDeals[deal.id]} star{ratedDeals[deal.id] !== 1 ? 's' : ''}
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-gray-400 text-center">
                      Completed on {new Date(deal.created_at).toLocaleDateString('en-GB', {
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
  );
};

export default Completed;