import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { CheckCircle, Star, Package, Plane, ChevronDown, ChevronUp, Award, TrendingUp } from 'lucide-react';

const Completed = ({ session }) => {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [ratings, setRatings] = useState({});
  const [submittingRating, setSubmittingRating] = useState({});
  const [ratedDeals, setRatedDeals] = useState({});

  const fetchCompleted = async () => {
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
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (!error) setDeals(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCompleted(); }, []);

  const isTraveler = (deal) => deal.traveler_id === session.user.id;

  const getOtherParty = (deal) => isTraveler(deal) ? deal.shipper : deal.traveler;

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const submitRating = async (dealId, otherPartyId, rating) => {
    setSubmittingRating(prev => ({ ...prev, [dealId]: true }));
    const { data: profile } = await supabase
      .from('profiles').select('rating, total_reviews').eq('id', otherPartyId).single();

    if (profile) {
      const newTotal = (profile.total_reviews || 0) + 1;
      const newRating = ((profile.rating || 0) * (profile.total_reviews || 0) + rating) / newTotal;
      await supabase.from('profiles').update({
        rating: Math.round(newRating * 10) / 10,
        total_reviews: newTotal
      }).eq('id', otherPartyId);
    }
    setRatedDeals(prev => ({ ...prev, [dealId]: rating }));
    setSubmittingRating(prev => ({ ...prev, [dealId]: false }));
  };

  const totalEarned = deals
    .filter(d => isTraveler(d))
    .reduce((sum, d) => sum + ((d.flight?.price_per_kg || 0) * (d.request?.weight_kg || 0) * 0.9), 0);

  const totalSpent = deals
    .filter(d => !isTraveler(d))
    .reduce((sum, d) => sum + ((d.flight?.price_per_kg || 0) * (d.request?.weight_kg || 0) * 1.1), 0);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-gray-400 text-sm">Loading completed deals...</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 md:px-6">

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Completed Deals</h1>
        <p className="text-gray-400 text-sm mt-1">{deals.length} deal{deals.length !== 1 ? 's' : ''} completed</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center mx-auto mb-2">
            <Award size={20} className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">{deals.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total Deals</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center mx-auto mb-2">
            <TrendingUp size={20} className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">${totalEarned.toFixed(0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Earned</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-2">
            <Package size={20} className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-600">${totalSpent.toFixed(0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Spent</p>
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={36} className="text-purple-300" />
          </div>
          <h2 className="text-lg font-bold text-gray-700 mb-2">No completed deals yet</h2>
          <p className="text-gray-400 text-sm">Your completed deliveries will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map(deal => {
            const other = getOtherParty(deal);
            const dealValue = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
            const isExpanded = expandedId === deal.id;
            const currentRating = ratings[deal.id] || 0;
            const hasRated = !!ratedDeals[deal.id];

            return (
              <div key={deal.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => setExpandedId(isExpanded ? null : deal.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <CheckCircle size={20} className="text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800">
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
                        <p className={`text-sm font-bold ${isTraveler(deal) ? 'text-green-600' : 'text-gray-700'}`}>
                          {isTraveler(deal) ? '+' : '-'}${(isTraveler(deal) ? dealValue * 0.9 : dealValue * 1.1).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {isTraveler(deal) ? 'earned' : 'spent'}
                        </p>
                      </div>
                      {isExpanded
                        ? <ChevronUp size={16} className="text-gray-400" />
                        : <ChevronDown size={16} className="text-gray-400" />
                      }
                    </div>
                  </div>
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div className="border-t border-gray-50 p-4 space-y-4">

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-purple-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-purple-600 mb-1 flex items-center gap-1">
                          <Plane size={11} /> Flight
                        </p>
                        <p className="text-sm font-bold text-gray-800">
                          {deal.flight?.from_code} → {deal.flight?.to_code}
                        </p>
                        <p className="text-xs text-gray-500">{deal.flight?.airline}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {deal.flight?.flight_date ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                          <Package size={11} /> Item
                        </p>
                        <p className="text-sm font-bold text-gray-800">{deal.request?.item_name}</p>
                        <p className="text-xs text-gray-500">{deal.request?.category}</p>
                        <p className="text-xs text-gray-400 mt-1">{deal.request?.weight_kg}kg</p>
                      </div>
                    </div>

                    {/* Fee breakdown */}
                    <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between text-gray-500">
                        <span>{deal.request?.weight_kg}kg × ${deal.flight?.price_per_kg}/kg</span>
                        <span>${dealValue.toFixed(2)}</span>
                      </div>
                      {isTraveler(deal) ? (
                        <>
                          <div className="flex justify-between text-red-400">
                            <span>Fetchr fee (10%)</span>
                            <span>-${(dealValue * 0.1).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-green-600 border-t border-gray-200 pt-1.5">
                            <span>You received</span>
                            <span>+${(dealValue * 0.9).toFixed(2)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between text-gray-500">
                            <span>Fetchr + processing fees</span>
                            <span>+${(dealValue * 0.1).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-gray-700 border-t border-gray-200 pt-1.5">
                            <span>Total paid</span>
                            <span>${(dealValue * 1.1).toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Other party */}
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0">
                        {getInitials(other?.full_name)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">{other?.full_name || 'User'}</p>
                        <p className="text-xs text-gray-400">{isTraveler(deal) ? 'Shipper' : 'Traveler'}</p>
                        {other?.rating > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Star size={11} className="text-yellow-400 fill-yellow-400" />
                            <span className="text-xs text-gray-600">{other.rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rating */}
                    {!hasRated ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-2">
                          Rate your experience with {other?.full_name?.split(' ')[0] || 'this user'}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                              <button
                                key={star}
                                onClick={() => setRatings(prev => ({ ...prev, [deal.id]: star }))}
                                className="transition-transform hover:scale-110"
                              >
                                <Star
                                  size={28}
                                  className={star <= currentRating
                                    ? 'text-yellow-400 fill-yellow-400'
                                    : 'text-gray-200'
                                  }
                                />
                              </button>
                            ))}
                          </div>
                          {currentRating > 0 && (
                            <button
                              onClick={() => submitRating(deal.id, other?.id, currentRating)}
                              disabled={submittingRating[deal.id]}
                              className="ml-2 bg-purple-600 text-white px-4 py-1.5 rounded-xl text-xs font-semibold hover:bg-purple-700 transition disabled:opacity-50"
                            >
                              {submittingRating[deal.id] ? 'Submitting...' : 'Submit'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-green-50 rounded-xl p-3">
                        <CheckCircle size={16} className="text-green-500" />
                        <p className="text-sm text-green-700 font-semibold">
                          You rated {other?.full_name?.split(' ')[0]} {ratedDeals[deal.id]} star{ratedDeals[deal.id] !== 1 ? 's' : ''}
                        </p>
                      </div>
                    )}
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