import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  CheckCircle, Plane, Package, DollarSign,
  Star, Award, ChevronDown, ChevronUp
} from 'lucide-react';

const Completed = ({ session }) => {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [ratings, setRatings] = useState({});
  const [submittingRating, setSubmittingRating] = useState(null);
  const [ratedDeals, setRatedDeals] = useState([]);

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
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (!error) setDeals(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchDeals(); }, []);

  const isTraveler = (deal) => deal.traveler_id === session.user.id;

  const getOtherParty = (deal) => {
    return isTraveler(deal) ? deal.shipper : deal.traveler;
  };

  const getDealValue = (deal) => {
    return (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
  };

  const submitRating = async (dealId, otherPartyId) => {
    const rating = ratings[dealId];
    if (!rating) return;

    setSubmittingRating(dealId);

    // Get current profile rating
    const { data: profile } = await supabase
      .from('profiles')
      .select('rating, total_reviews')
      .eq('id', otherPartyId)
      .single();

    if (profile) {
      const newTotal = profile.total_reviews + 1;
      const newRating = ((profile.rating * profile.total_reviews) + rating) / newTotal;

      await supabase.from('profiles').update({
        rating: Math.round(newRating * 10) / 10,
        total_reviews: newTotal
      }).eq('id', otherPartyId);
    }

    setRatedDeals(prev => [...prev, dealId]);
    setSubmittingRating(null);
  };

  const totalEarned = deals
    .filter(d => isTraveler(d))
    .reduce((sum, d) => sum + getDealValue(d), 0);

  const totalSpent = deals
    .filter(d => !isTraveler(d))
    .reduce((sum, d) => sum + getDealValue(d), 0);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-gray-400 text-sm">Loading completed deals...</p>
    </div>
  );

  if (deals.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4">
        <CheckCircle size={28} className="text-purple-400" />
      </div>
      <h2 className="text-lg font-bold text-gray-800 mb-1">No completed deals yet</h2>
      <p className="text-gray-400 text-sm">Your delivery history will appear here</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Completed Deals</h1>
        <p className="text-gray-400 text-sm mt-1">{deals.length} completed delivery{deals.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center mb-2">
            <Award size={16} className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">{deals.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total Deliveries</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center mb-2">
            <DollarSign size={16} className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">${totalEarned.toFixed(0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total Earned</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center mb-2">
            <Package size={16} className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">${totalSpent.toFixed(0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total Spent</p>
        </div>
      </div>

      {/* Deals List */}
      <div className="space-y-3">
        {deals.map(deal => {
          const dealValue = getDealValue(deal);
          const fetchrFee = dealValue * 0.10;
          const otherParty = getOtherParty(deal);
          const isExpanded = expandedId === deal.id;
          const hasRated = ratedDeals.includes(deal.id);

          return (
            <div key={deal.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Main Row */}
              <div
                className="p-5 cursor-pointer hover:bg-gray-50 transition"
                onClick={() => setExpandedId(isExpanded ? null : deal.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={18} className="text-green-500" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-800">{deal.request?.item_name}</p>
                      <p className="text-xs text-gray-400">
                        {deal.flight?.from_city} → {deal.flight?.to_city} •{' '}
                        {new Date(deal.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`text-sm font-bold ${isTraveler(deal) ? 'text-green-600' : 'text-gray-800'}`}>
                        {isTraveler(deal) ? '+' : '-'}${dealValue.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {isTraveler(deal) ? 'Earned' : 'Spent'}
                      </p>
                    </div>
                    {isExpanded
                      ? <ChevronUp size={16} className="text-gray-400" />
                      : <ChevronDown size={16} className="text-gray-400" />
                    }
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-gray-50 pt-4 space-y-4">

                  {/* Flight & Item Details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-purple-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-purple-600 mb-1.5 flex items-center gap-1">
                        <Plane size={11} /> Flight
                      </p>
                      <p className="text-sm font-bold text-gray-800">
                        {deal.flight?.from_code} → {deal.flight?.to_code}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {deal.flight?.airline} • {deal.flight?.flight_number}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {deal.flight?.flight_date ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        }) : ''}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
                        <Package size={11} /> Shipment
                      </p>
                      <p className="text-sm font-bold text-gray-800">{deal.request?.item_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{deal.request?.category}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{deal.request?.weight_kg}kg</p>
                    </div>
                  </div>

                  {/* Payment Summary */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2">💰 Payment Summary</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">{deal.request?.weight_kg}kg × ${deal.flight?.price_per_kg}/kg</span>
                        <span className="font-semibold">${dealValue.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Fetchr fee (10%)</span>
                        <span className="font-semibold">${fetchrFee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold text-gray-800 pt-1.5 border-t border-gray-200">
                        <span>Total</span>
                        <span>${(dealValue + fetchrFee).toFixed(2)}</span>
                      </div>
                      {isTraveler(deal) && (
                        <div className="flex justify-between text-xs font-bold text-green-600 pt-1">
                          <span>You received</span>
                          <span>${(dealValue - fetchrFee).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Other Party */}
                  <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-lg">
                      {isTraveler(deal) ? '📦' : '✈️'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {otherParty?.full_name || otherParty?.email || 'User'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {isTraveler(deal) ? 'Shipper' : 'Traveler'}
                      </p>
                    </div>
                  </div>

                  {/* Rating Section */}
                  {!hasRated ? (
                    <div className="border border-yellow-100 bg-yellow-50 rounded-xl p-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">
                        ⭐ Rate your experience with {otherParty?.full_name?.split(' ')[0] || 'this user'}
                      </p>
                      <div className="flex gap-2 mb-3">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            onClick={() => setRatings(prev => ({ ...prev, [deal.id]: star }))}
                            className="transition"
                          >
                            <Star
                              size={28}
                              className={`transition ${
                                (ratings[deal.id] || 0) >= star
                                  ? 'text-yellow-400 fill-yellow-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      {ratings[deal.id] && (
                        <button
                          onClick={() => submitRating(deal.id, otherParty?.id)}
                          disabled={submittingRating === deal.id}
                          className="w-full bg-yellow-400 text-white rounded-xl py-2 text-sm font-semibold hover:bg-yellow-500 transition disabled:opacity-50"
                        >
                          {submittingRating === deal.id ? 'Submitting...' : 'Submit Rating'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="bg-green-50 rounded-xl p-3 flex items-center gap-2">
                      <CheckCircle size={16} className="text-green-500" />
                      <p className="text-sm text-green-700 font-medium">Rating submitted — thank you!</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Completed;