import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Search, Plane, Package, Star, CheckCircle, XCircle,
  ChevronRight, MapPin, Calendar, Weight, DollarSign,
  Clock, Shield, User, X, Award, Globe, Phone
} from 'lucide-react';

const Matches = ({ session }) => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState({});
  const [selectedMatch, setSelectedMatch] = useState(null);
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
      .eq('status', 'pending')
      .order('match_score', { ascending: false });
    if (!error) setMatches(data || []);
    setLoading(false);
  };

  const fetchProfile = async (userId) => {
    setProfileLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    const { count: flightsCount } = await supabase
      .from('flights').select('id', { count: 'exact' }).eq('user_id', userId);
    const { count: dealsCount } = await supabase
      .from('matches').select('id', { count: 'exact' })
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
      .eq('status', 'completed');

    setViewingProfile({ ...data, totalFlights: flightsCount || 0, totalDeals: dealsCount || 0 });
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
    const isTraveler = match.traveler_id === session.user.id;
    const myField = isTraveler ? 'traveler_accepted' : 'shipper_accepted';
    const otherAccepted = isTraveler ? match.shipper_accepted : match.traveler_accepted;

    if (otherAccepted) {
      await supabase.from('matches').update({
        [myField]: true, status: 'accepted'
      }).eq('id', matchId);
      await supabase.from('messages').insert([{
        match_id: matchId,
        sender_id: session.user.id,
        content: `🎉 MATCH ACCEPTED! Both parties have agreed. You can now chat, discuss the deal details, and proceed with the escrow payment. Let's make this delivery happen!`,
        is_read: false
      }]);
    } else {
      await supabase.from('matches').update({
        [myField]: true, status: 'awaiting_other'
      }).eq('id', matchId);
    }
    setSelectedMatch(null);
    await fetchMatches();
    setActing(prev => ({ ...prev, [matchId]: null }));
  };

  const handleDecline = async (matchId) => {
    setActing(prev => ({ ...prev, [matchId]: 'declining' }));
    await supabase.from('matches').update({ status: 'rejected' }).eq('id', matchId);
    setSelectedMatch(null);
    setMatches(prev => prev.filter(m => m.id !== matchId));
    setActing(prev => ({ ...prev, [matchId]: null }));
  };

  const isTraveler = (match) => match.traveler_id === session.user.id;
  const getOtherParty = (match) => isTraveler(match) ? match.shipper : match.traveler;

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'bg-green-50 text-green-600 border-green-200';
    if (score >= 75) return 'bg-blue-50 text-blue-600 border-blue-200';
    return 'bg-orange-50 text-orange-600 border-orange-200';
  };

  const getAvatarUrl = (profile) => {
    if (!profile?.avatar_url) return null;
    const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
    return data?.publicUrl;
  };

  if (loading && matches.length === 0) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
          <Search size={24} className="text-purple-400" />
        </div>
        <p className="text-gray-400 text-sm">Finding your matches...</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 md:px-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Your Matches</h1>
          <p className="text-gray-400 text-sm mt-1">
            {matches.length} pending match{matches.length !== 1 ? 'es' : ''} • Updates every 5s
          </p>
        </div>
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Live" />
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search size={36} className="text-purple-300" />
          </div>
          <h2 className="text-lg font-bold text-gray-700 mb-2">No matches yet</h2>
          <p className="text-gray-400 text-sm max-w-xs mx-auto">
            We're searching for matches. Add a flight or shipment request to get started.
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

            return (
              <div key={match.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">

                {/* Match Score Banner */}
                <div className={`px-4 py-2 flex items-center justify-between text-xs font-semibold border-b ${getScoreColor(match.match_score)}`}>
                  <span>⚡ {match.match_score}% Match Score</span>
                  {match.status === 'awaiting_other' && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> Waiting for other party
                    </span>
                  )}
                  {myAccepted && match.status === 'awaiting_other' && (
                    <span className="text-green-600">✓ You accepted</span>
                  )}
                </div>

                <div className="p-4">
                  {/* Route */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Plane size={11} /> Flight
                      </p>
                      <p className="text-sm font-bold text-gray-800">
                        {match.flight?.from_code} → {match.flight?.to_code}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {match.flight?.from_city} → {match.flight?.to_city}
                      </p>
                      <p className="text-xs text-purple-600 font-semibold mt-1">
                        {match.flight?.flight_date ? new Date(match.flight.flight_date).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        }) : ''}
                      </p>
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Package size={11} /> Shipment
                      </p>
                      <p className="text-sm font-bold text-gray-800">{match.request?.item_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{match.request?.category}</p>
                      <p className="text-xs text-purple-600 font-semibold mt-1">
                        {match.request?.weight_kg}kg • ${match.request?.budget_per_kg}/kg budget
                      </p>
                    </div>
                  </div>

{/* Deal Value + Fee Preview */}
                  {(() => {
                    const subtotal = (match.flight?.price_per_kg || 0) * (match.request?.weight_kg || 0);
                    let fetchrPct = 10;
                    if (subtotal >= 500) fetchrPct = 7;
                    else if (subtotal >= 200) fetchrPct = 8.5;
                    else if (subtotal < 20) fetchrPct = 12;
                    const fetchrFee = subtotal * fetchrPct / 100;
                    const stripeFee = (subtotal + fetchrFee) * 0.029 + 0.30;
                    const totalFees = fetchrFee + stripeFee;
                    const totalCharged = subtotal + totalFees;
                    const travelerReceives = subtotal - fetchrFee;

                    return (
                      <div className="bg-purple-50 rounded-xl p-3 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-xs text-gray-500">Deal subtotal</p>
                            <p className="text-lg font-bold text-purple-600">${subtotal.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">{match.flight?.available_kg}kg available</p>
                            <p className="text-xs text-gray-500">${match.flight?.price_per_kg}/kg</p>
                          </div>
                        </div>
                        <div className="border-t border-purple-100 pt-2 space-y-1 text-xs">
                          <div className="flex justify-between text-gray-500">
                            <span>Fetchr fee ({fetchrPct}%)</span>
                            <span>${fetchrFee.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-gray-500">
                            <span>Processing fee</span>
                            <span>${stripeFee.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-gray-700 border-t border-purple-100 pt-1">
                            <span>Shipper pays</span>
                            <span>${totalCharged.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-green-600 font-semibold">
                            <span>Traveler receives</span>
                            <span>${travelerReceives.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Other Party */}
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => fetchProfile(other?.id)}
                      className="flex items-center gap-3 hover:bg-gray-50 rounded-xl p-2 -ml-2 transition"
                    >
                      <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0 overflow-hidden">
                        {avatarUrl
                          ? <img src={avatarUrl} alt={other?.full_name} className="w-full h-full object-cover" />
                          : getInitials(other?.full_name)
                        }
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-800">
                          {other?.full_name || 'User'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {other?.rating > 0 ? (
                            <div className="flex items-center gap-1">
                              <Star size={12} className="text-yellow-400 fill-yellow-400" />
                              <span className="text-xs text-gray-600 font-semibold">{other.rating.toFixed(1)}</span>
                              <span className="text-xs text-gray-400">({other.total_reviews})</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">New member</span>
                          )}
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                            {isTraveler(match) ? '📦 Shipper' : '✈️ Traveler'}
                          </span>
                        </div>
                        <p className="text-xs text-purple-500 mt-0.5">Tap to view profile →</p>
                      </div>
                    </button>

                    {other?.verified && (
                      <div className="flex items-center gap-1 bg-blue-50 text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-full">
                        <Shield size={12} /> Verified
                      </div>
                    )}
                  </div>

                  {/* Item photo if available */}
                  {match.request?.item_photo_url && (
                    <div className="mb-4">
                      <img
                        src={match.request.item_photo_url}
                        alt={match.request.item_name}
                        className="w-full h-32 object-cover rounded-xl"
                      />
                    </div>
                  )}

                  {/* Action Buttons */}
                  {!myAccepted ? (
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleDecline(match.id)}
                        disabled={!!acting[match.id]}
                        className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-500 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        <XCircle size={16} />
                        {acting[match.id] === 'declining' ? 'Declining...' : 'Decline'}
                      </button>
                      <button
                        onClick={() => handleAccept(match.id)}
                        disabled={!!acting[match.id]}
                        className="flex-2 flex-[2] flex items-center justify-center gap-2 bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50"
                      >
                        <CheckCircle size={16} />
                        {acting[match.id] === 'accepting' ? 'Accepting...' : 'Accept Match'}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-green-50 rounded-xl p-3 flex items-center gap-2">
                      <CheckCircle size={16} className="text-green-500" />
                      <p className="text-sm text-green-700 font-semibold">
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between rounded-t-2xl">
              <h3 className="font-bold text-gray-800">User Profile</h3>
              <button onClick={() => setViewingProfile(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {profileLoading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-gray-400 text-sm">Loading profile...</p>
              </div>
            ) : (
              <div className="p-5">
                {/* Avatar + Name */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center text-xl font-bold text-purple-600 overflow-hidden flex-shrink-0">
                    {viewingProfile?.avatar_url ? (
                      <img
                        src={supabase.storage.from('avatars').getPublicUrl(viewingProfile.avatar_url).data?.publicUrl}
                        alt={viewingProfile.full_name}
                        className="w-full h-full object-cover"
                      />
                    ) : getInitials(viewingProfile?.full_name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-gray-800">{viewingProfile?.full_name || 'User'}</h2>
                      {viewingProfile?.verified && (
                        <span className="flex items-center gap-1 bg-blue-50 text-blue-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                          <Shield size={10} /> Verified
                        </span>
                      )}
                    </div>
                    {viewingProfile?.rating > 0 ? (
                      <div className="flex items-center gap-1 mt-1">
                        {[1,2,3,4,5].map(star => (
                          <Star key={star} size={14}
                            className={star <= Math.round(viewingProfile.rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} />
                        ))}
                        <span className="text-sm font-semibold text-gray-700 ml-1">{viewingProfile.rating.toFixed(1)}</span>
                        <span className="text-xs text-gray-400">({viewingProfile.total_reviews} reviews)</span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">No reviews yet</p>
                    )}
                  </div>
                </div>

                {/* Bio */}
                {viewingProfile?.bio && (
                  <div className="bg-gray-50 rounded-xl p-3 mb-4">
                    <p className="text-sm text-gray-600 italic">"{viewingProfile.bio}"</p>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-purple-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-purple-600">{viewingProfile?.totalDeals || 0}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Deals Done</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-blue-600">{viewingProfile?.totalFlights || 0}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Flights</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-green-600">
                      {viewingProfile?.response_rate || 100}%
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Response</p>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2">
                  {viewingProfile?.nationality && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Globe size={15} className="text-purple-400" />
                      <span>{viewingProfile.nationality}</span>
                    </div>
                  )}
                  {viewingProfile?.languages?.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Award size={15} className="text-purple-400" />
                      <span>{viewingProfile.languages.join(', ')}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setViewingProfile(null)}
                  className="w-full mt-5 bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition"
                >
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