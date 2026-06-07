import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Search, Plane, Package, Star, CheckCircle, XCircle,
  ChevronRight, Shield, X, Award, Globe, Clock, Zap, ShoppingBag
} from 'lucide-react';

const Matches = ({ session }) => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState({});
  const [viewingProfile, setViewingProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchMatches = async () => {
    setLoading(true);
    await supabase.rpc('find_matches');
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
      .in('status', ['pending', 'awaiting_other'])
      .order('match_score', { ascending: false });
    if (!error) setMatches(data || []);
    setLoading(false);
  };

  const fetchProfile = async (userId) => {
    setProfileLoading(true);
    const { data } = await supabase
      .from('profiles').select('*').eq('id', userId).single();
    const { count: flightsCount } = await supabase
      .from('flights').select('id', { count: 'exact' }).eq('user_id', userId);
    const { count: dealsCount } = await supabase
      .from('matches').select('id', { count: 'exact' })
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
      .eq('status', 'completed');
    setViewingProfile({
      ...data,
      totalFlights: flightsCount || 0,
      totalDeals: dealsCount || 0
    });
    setProfileLoading(false);
  };

  useEffect(() => {
    fetchMatches();
    const interval = setInterval(fetchMatches, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAccept = async (matchId) => {
    setActing(prev => ({ ...prev, [matchId]: 'accepting' }));
    const match = matches.find(m => m.id === matchId);
    const isTrav = match.traveler_id === session.user.id;
    const myField = isTrav ? 'traveler_accepted' : 'shipper_accepted';
    const otherAccepted = isTrav ? match.shipper_accepted : match.traveler_accepted;

    if (otherAccepted) {
      // Both accepted — move to accepted, open chat
      await supabase.from('matches').update({
        [myField]: true,
        status: 'accepted',
        deal_stage: 'matched',
      }).eq('id', matchId);

      await supabase.from('messages').insert([{
        match_id: matchId,
        sender_id: session.user.id,
        content: `🎉 MATCH ACCEPTED! Both parties have agreed. You can now chat and arrange the delivery.`,
        is_read: false,
      }]);
    } else {
      // First to accept — stay visible with awaiting_other status
      await supabase.from('matches').update({
        [myField]: true,
        status: 'awaiting_other',
      }).eq('id', matchId);
    }

    // Refresh but do NOT remove from list
    await fetchMatches();
    setActing(prev => ({ ...prev, [matchId]: null }));
  };

  const handleDecline = async (matchId) => {
    setActing(prev => ({ ...prev, [matchId]: 'declining' }));
    await supabase.from('matches').update({ status: 'rejected' }).eq('id', matchId);
    setMatches(prev => prev.filter(m => m.id !== matchId));
    setActing(prev => ({ ...prev, [matchId]: null }));
  };

  const isTraveler = (match) => match.traveler_id === session.user.id;
  const getOtherParty = (match) => isTraveler(match) ? match.shipper : match.traveler;

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarUrl = (profile) => {
    if (!profile?.avatar_url) return null;
    const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
    return data?.publicUrl;
  };

  // Fetchr takes a cut FROM the traveler's share
  // Shipper always pays exactly the agreed price — no additions
  const getFeePreview = (match) => {
    const agreedPrice = (match.flight?.price_per_kg || 0) *
      (match.request?.weight_kg || 0);
    let fetchrPct = 0.10;
    if (agreedPrice >= 500) fetchrPct = 0.07;
    else if (agreedPrice >= 200) fetchrPct = 0.085;
    else if (agreedPrice < 20 && agreedPrice > 0) fetchrPct = 0.12;
    const fetchrFee = agreedPrice * fetchrPct;
    const travelerReceives = agreedPrice - fetchrFee;
    return { agreedPrice, fetchrFee, fetchrPct, travelerReceives };
  };

  const getScoreBadge = (score) => {
    if (score >= 90) return 'badge-green';
    if (score >= 75) return 'badge-blue';
    return 'badge-yellow';
  };

  if (loading && matches.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-14 h-14 bg-violet-100 rounded-2xl flex items-center justify-center mb-4 animate-pulse">
        <Search size={24} className="text-violet-500" />
      </div>
      <p className="text-gray-500 font-medium">Finding your matches...</p>
      <p className="text-gray-400 text-sm mt-1">This updates every 5 seconds</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Matches</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {matches.length} pending match{matches.length !== 1 ? 'es' : ''} · Auto-refreshes every 5s
          </p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full text-xs font-semibold border border-emerald-100">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          Live
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl shadow-card border border-gray-100/80">
          <div className="w-20 h-20 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Search size={32} className="text-violet-300" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">No matches yet</h2>
          <p className="text-gray-400 text-sm max-w-xs mx-auto">
            Add a flight or shipment request and we'll find your perfect match automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map(match => {
            const other = getOtherParty(match);
            const avatarUrl = getAvatarUrl(other);
            const myAccepted = isTraveler(match)
              ? match.traveler_accepted
              : match.shipper_accepted;
            const otherAccepted = isTraveler(match)
              ? match.shipper_accepted
              : match.traveler_accepted;
            const fees = getFeePreview(match);

            return (
              <div key={match.id}
                className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden hover:shadow-card-hover transition-all duration-300">

                {/* Match score bar */}
                <div className={`h-1 ${
                  match.match_score >= 90
                    ? 'bg-gradient-to-r from-emerald-400 to-green-500'
                    : match.match_score >= 75
                      ? 'bg-gradient-to-r from-blue-400 to-indigo-500'
                      : 'bg-gradient-to-r from-amber-400 to-orange-500'
                }`} style={{ width: `${match.match_score}%` }} />

                <div className="p-5">

                  {/* Header badges */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge ${getScoreBadge(match.match_score)}`}>
                        <Zap size={10} /> {match.match_score}% Match
                      </span>
                      {match.status === 'awaiting_other' && (
                        <span className="badge badge-yellow">
                          <Clock size={10} /> Awaiting other party
                        </span>
                      )}
                      {myAccepted && (
                        <span className="badge badge-green">
                          <CheckCircle size={10} /> You accepted
                        </span>
                      )}
                      {otherAccepted && !myAccepted && (
                        <span className="badge badge-blue">
                          <Clock size={10} /> Other party accepted
                        </span>
                      )}
                    </div>
                    <span className={`badge ${isTraveler(match) ? 'badge-blue' : 'badge-purple'}`}>
                      {isTraveler(match) ? '✈️ Traveler' : '📦 Shipper'}
                    </span>
                  </div>

                  {/* Route cards */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                        <Plane size={10} /> Flight
                      </p>
                      <p className="text-base font-bold text-gray-900">
                        {match.flight?.from_code} → {match.flight?.to_code}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {match.flight?.from_city} → {match.flight?.to_city}
                      </p>
                      <p className="text-xs font-semibold text-violet-600 mt-2">
                        {match.flight?.flight_date
                          ? new Date(match.flight.flight_date).toLocaleDateString('en-GB', {
                              day: '2-digit', month: '2-digit', year: 'numeric'
                            })
                          : ''}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                        <Package size={10} /> Shipment
                      </p>
                      <p className="text-base font-bold text-gray-900 truncate">
                        {match.request?.item_name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{match.request?.category}</p>
                      <p className="text-xs font-semibold text-violet-600 mt-2">
                        {match.request?.weight_kg}kg
                      </p>
                    </div>
                  </div>

                  {/* Shop & Ship badge */}
                  {match.flight?.delivery_type === 'both' && (
                    <div className="flex items-center gap-2 bg-blue-50 text-blue-700 rounded-xl px-3 py-2 mb-4 border border-blue-100">
                      <ShoppingBag size={14} />
                      <p className="text-xs font-semibold">
                        Shop & Ship available — traveler can purchase items at destination
                      </p>
                    </div>
                  )}

                  {/* Fee preview — CORRECT logic */}
                  <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-4 mb-4 border border-violet-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Deal Preview
                    </p>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Shipper pays</p>
                        <p className="text-base font-bold text-gray-900">
                          ${fees.agreedPrice.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400">agreed price</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Fetchr fee</p>
                        <p className="text-base font-bold text-red-400">
                          −${fees.fetchrFee.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {Math.round(fees.fetchrPct * 100)}% of deal
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Traveler gets</p>
                        <p className="text-base font-bold text-emerald-600">
                          ${fees.travelerReceives.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400">net earnings</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 text-center mt-3 italic">
                      Shipper pays the agreed price only. Fetchr's fee comes from the traveler's share.
                    </p>
                  </div>

                  {/* Other party profile */}
                  <button
                    onClick={() => fetchProfile(other?.id)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-gray-50 transition-all border border-gray-100 mb-4 group">
                    <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-600 flex-shrink-0 overflow-hidden">
                      {avatarUrl
                        ? <img src={avatarUrl} alt={other?.full_name} className="w-full h-full object-cover" />
                        : getInitials(other?.full_name)
                      }
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold text-gray-900">{other?.full_name || 'User'}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {other?.rating > 0 ? (
                          <div className="flex items-center gap-1">
                            {[1,2,3,4,5].map(s => (
                              <Star key={s} size={11}
                                className={s <= Math.round(other.rating)
                                  ? 'text-amber-400 fill-amber-400'
                                  : 'text-gray-200'} />
                            ))}
                            <span className="text-xs text-gray-500 ml-0.5">
                              {other.rating.toFixed(1)} ({other.total_reviews})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">New member</span>
                        )}
                        {other?.verified && (
                          <span className="badge badge-blue"><Shield size={9} /> Verified</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-violet-500 font-semibold group-hover:gap-2 transition-all flex-shrink-0">
                      View profile <ChevronRight size={14} />
                    </div>
                  </button>

                  {/* Item photo */}
                  {match.request?.item_photo_url && (
                    <div className="mb-4 rounded-xl overflow-hidden border border-gray-100">
                      <img
                        src={match.request.item_photo_url}
                        alt={match.request.item_name}
                        className="w-full h-36 object-contain bg-gray-50"
                      />
                    </div>
                  )}

                  {/* Actions */}
                  {!myAccepted ? (
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleDecline(match.id)}
                        disabled={!!acting[match.id]}
                        className="flex-1 flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-500 rounded-xl py-3 text-sm font-semibold hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50">
                        <XCircle size={16} />
                        {acting[match.id] === 'declining' ? 'Declining...' : 'Decline'}
                      </button>
                      <button
                        onClick={() => handleAccept(match.id)}
                        disabled={!!acting[match.id]}
                        className="flex-[2] flex items-center justify-center gap-2 btn-primary py-3 rounded-xl text-sm disabled:opacity-50">
                        <CheckCircle size={16} />
                        {acting[match.id] === 'accepting' ? 'Accepting...' : 'Accept Match'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-3.5 border border-emerald-100">
                      <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                      <p className="text-sm text-emerald-700 font-semibold">
                        You accepted — waiting for {isTraveler(match) ? 'shipper' : 'traveler'} to confirm
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Profile Modal */}
      {viewingProfile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl animate-slide-up">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
              <h3 className="font-bold text-gray-900">User Profile</h3>
              <button onClick={() => setViewingProfile(null)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {profileLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="p-5">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center text-xl font-bold text-violet-600 overflow-hidden flex-shrink-0">
                    {viewingProfile?.avatar_url ? (
                      <img
                        src={supabase.storage.from('avatars').getPublicUrl(viewingProfile.avatar_url).data?.publicUrl}
                        alt={viewingProfile.full_name}
                        className="w-full h-full object-cover"
                      />
                    ) : getInitials(viewingProfile?.full_name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-gray-900">
                        {viewingProfile?.full_name || 'User'}
                      </h2>
                      {viewingProfile?.verified && (
                        <span className="badge badge-blue"><Shield size={10} /> Verified</span>
                      )}
                    </div>
                    {viewingProfile?.rating > 0 ? (
                      <div className="flex items-center gap-1 mt-1">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} size={14}
                            className={s <= Math.round(viewingProfile.rating)
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-gray-200'} />
                        ))}
                        <span className="text-sm font-bold text-gray-700 ml-1">
                          {viewingProfile.rating.toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({viewingProfile.total_reviews} reviews)
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">No reviews yet</p>
                    )}
                  </div>
                </div>

                {viewingProfile?.bio && (
                  <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                    <p className="text-sm text-gray-600 italic leading-relaxed">
                      "{viewingProfile.bio}"
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Deals Done', value: viewingProfile?.totalDeals || 0, color: 'bg-violet-50 text-violet-700' },
                    { label: 'Flights', value: viewingProfile?.totalFlights || 0, color: 'bg-blue-50 text-blue-700' },
                    { label: 'Response', value: `${viewingProfile?.response_rate || 100}%`, color: 'bg-emerald-50 text-emerald-700' },
                  ].map((stat, i) => (
                    <div key={i} className={`${stat.color} rounded-xl p-3 text-center`}>
                      <p className="text-xl font-bold">{stat.value}</p>
                      <p className="text-xs font-medium mt-0.5 opacity-70">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2.5 mb-5">
                  {viewingProfile?.nationality && (
                    <div className="flex items-center gap-2.5 text-sm text-gray-600">
                      <Globe size={15} className="text-violet-400 flex-shrink-0" />
                      <span>{viewingProfile.nationality}</span>
                    </div>
                  )}
                  {viewingProfile?.languages?.length > 0 && (
                    <div className="flex items-center gap-2.5 text-sm text-gray-600">
                      <Award size={15} className="text-violet-400 flex-shrink-0" />
                      <span>{viewingProfile.languages.join(', ')}</span>
                    </div>
                  )}
                </div>

                <button onClick={() => setViewingProfile(null)}
                  className="w-full btn-primary py-3 rounded-xl">
                  Close Profile
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Matches;