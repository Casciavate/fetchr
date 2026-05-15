import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Star, Package, DollarSign, Calendar, CheckCircle, XCircle, RefreshCw, Clock } from 'lucide-react';

const Matches = ({ session }) => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [countdown, setCountdown] = useState(5);
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  const runMatching = async () => {
    setRunning(true);
    await supabase.rpc('find_matches');
    await fetchMatches();
    setLastUpdated(new Date());
    setRunning(false);
  };

  const fetchMatches = async () => {
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

  const startAutoRefresh = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    intervalRef.current = setInterval(async () => {
      await runMatching();
      setCountdown(5);
    }, 5000);

    countdownRef.current = setInterval(() => {
      setCountdown(prev => prev <= 1 ? 5 : prev - 1);
    }, 1000);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await runMatching();
    };
    init();
    startAutoRefresh();

    // Real-time subscription
    const sub = supabase
      .channel('matches-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matches'
      }, () => fetchMatches())
      .subscribe();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      supabase.removeChannel(sub);
    };
  }, []);

  const isTraveler = (match) => match.traveler_id === session.user.id;

  const hasCurrentUserAccepted = (match) => {
    return isTraveler(match) ? match.traveler_accepted : match.shipper_accepted;
  };

  const hasOtherUserAccepted = (match) => {
    return isTraveler(match) ? match.shipper_accepted : match.traveler_accepted;
  };

  const handleAccept = async (match) => {
    const updateField = isTraveler(match)
      ? { traveler_accepted: true }
      : { shipper_accepted: true };

    // Check if other side already accepted
    const otherAccepted = hasOtherUserAccepted(match);

    if (otherAccepted) {
      // Both have accepted — open chat
      await supabase.from('matches').update({
        ...updateField,
        status: 'accepted'
      }).eq('id', match.id);

      // Send welcome system message
      await supabase.from('messages').insert([{
        match_id: match.id,
        sender_id: session.user.id,
        content: '🎉 Both parties have accepted this match! You can now discuss the details and agree on the deal. Good luck!'
      }]);
    } else {
      // Only this side accepted so far
      await supabase.from('matches').update({
        ...updateField,
        status: 'awaiting_other'
      }).eq('id', match.id);
    }

    await fetchMatches();
  };

  const handleReject = async (matchId) => {
    await supabase.from('matches')
      .update({ status: 'rejected' })
      .eq('id', matchId);
    setMatches(matches.filter(m => m.id !== matchId));
  };

  const getMatchColor = (score) => {
    if (score >= 90) return 'bg-green-50 text-green-600';
    if (score >= 70) return 'bg-blue-50 text-blue-600';
    return 'bg-orange-50 text-orange-600';
  };

  const getAcceptanceStatus = (match) => {
    const iAmTraveler = isTraveler(match);
    const myAccepted = iAmTraveler ? match.traveler_accepted : match.shipper_accepted;
    const theirAccepted = iAmTraveler ? match.shipper_accepted : match.traveler_accepted;

    if (myAccepted && theirAccepted) return { label: 'Both Accepted', color: 'text-green-600', icon: '✅' };
    if (myAccepted && !theirAccepted) return { label: 'Waiting for other party', color: 'text-yellow-600', icon: '⏳' };
    if (!myAccepted && theirAccepted) return { label: 'Other party accepted — your turn!', color: 'text-purple-600', icon: '🔔' };
    return { label: 'Pending your response', color: 'text-gray-500', icon: '💬' };
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Matches</h1>
          <p className="text-gray-400 text-sm mt-1">Both parties must accept to open chat</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-purple-50 px-4 py-2 rounded-xl">
            <div className={`w-2 h-2 rounded-full ${running ? 'bg-yellow-400 animate-pulse' : 'bg-green-400 animate-pulse'}`} />
            <span className="text-xs font-semibold text-purple-700">
              {running ? 'Searching...' : `Refreshing in ${countdown}s`}
            </span>
          </div>
          <button
            onClick={runMatching}
            disabled={running}
            className="flex items-center gap-1.5 bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
            {running ? 'Searching...' : 'Refresh Now'}
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p className="text-xs text-gray-400 mb-4">
          Last updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      )}

      {/* How it works banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
        <p className="text-sm font-semibold text-blue-700 mb-1">🤝 How Matching Works</p>
        <p className="text-xs text-blue-600">
          When a match is found, both the traveler and shipper must individually click
          <strong> Accept</strong> on their side. Only once both parties have accepted will
          the chat open and the deal can begin.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
          <RefreshCw size={28} className="text-purple-400 animate-spin mb-3" />
          <p className="text-gray-400 text-sm">Finding your matches...</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
          <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4">
            <Star size={28} className="text-purple-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-1">No matches yet</h2>
          <p className="text-gray-400 text-sm mb-1">Make sure you have flights or requests listed</p>
          <p className="text-xs text-gray-300">Checking again in {countdown} seconds...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map(match => {
            const acceptanceStatus = getAcceptanceStatus(match);
            const iHaveAccepted = hasCurrentUserAccepted(match);
            const theyHaveAccepted = hasOtherUserAccepted(match);

            return (
              <div key={match.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">

                {/* Match Score & Role */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${getMatchColor(match.match_score)}`}>
                      {match.match_score}% Match
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                      {isTraveler(match) ? 'You are the Traveler ✈️' : 'You are the Shipper 📦'}
                    </span>
                  </div>
                </div>

                {/* Acceptance Status Banner */}
                <div className={`flex items-center gap-2 rounded-xl p-3 mb-4 ${
                  iHaveAccepted && theyHaveAccepted ? 'bg-green-50' :
                  !iHaveAccepted && theyHaveAccepted ? 'bg-purple-50' :
                  iHaveAccepted ? 'bg-yellow-50' : 'bg-gray-50'
                }`}>
                  <span className="text-lg">{acceptanceStatus.icon}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${acceptanceStatus.color}`}>
                      {acceptanceStatus.label}
                    </p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className={`text-xs flex items-center gap-1 ${
                        isTraveler(match) ? (match.traveler_accepted ? 'text-green-600 font-semibold' : 'text-gray-400') : (match.traveler_accepted ? 'text-green-600 font-semibold' : 'text-gray-400')
                      }`}>
                        {match.traveler_accepted ? '✓' : '○'} Traveler
                      </span>
                      <span className={`text-xs flex items-center gap-1 ${
                        match.shipper_accepted ? 'text-green-600 font-semibold' : 'text-gray-400'
                      }`}>
                        {match.shipper_accepted ? '✓' : '○'} Shipper
                      </span>
                    </div>
                  </div>
                </div>

                {/* Flight & Request Info */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-purple-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-purple-600 mb-2">✈️ Flight</p>
                    <p className="font-bold text-gray-800">
                      {match.flight?.from_city} → {match.flight?.to_city}
                    </p>
<p className="text-xs text-gray-500 mt-1">
                      {match.flight?.airline} • {match.flight?.flight_number}
                    </p>
                    {match.match_score < 90 && (
                      <p className="text-xs text-orange-500 mt-0.5">
                        📍 Nearby airport match (within 50km)
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Calendar size={11} />
                        {match.flight?.flight_date ? new Date(match.flight.flight_date).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short'
                        }) : 'N/A'}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Package size={11} /> {match.flight?.available_kg}kg
                      </span>
                      <span className="text-xs font-semibold text-purple-600 flex items-center gap-1">
                        <DollarSign size={11} /> ${match.flight?.price_per_kg}/kg
                      </span>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2">📦 Request</p>
                    {match.request?.item_photo_url && (
                      <img src={match.request.item_photo_url}
                        alt={match.request.item_name}
                        className="w-full h-16 object-cover rounded-lg mb-2" />
                    )}
                    <p className="font-bold text-gray-800">{match.request?.item_name}</p>
                    <p className="text-xs text-gray-500 mt-1">{match.request?.category}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Package size={11} /> {match.request?.weight_kg}kg
                      </span>
                      {match.request?.budget_per_kg && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <DollarSign size={11} /> Budget: ${match.request.budget_per_kg}/kg
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Deal Value */}
                <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Estimated deal value</span>
                  <span className="text-sm font-bold text-purple-600">
                    ${((match.flight?.price_per_kg || 0) * (match.request?.weight_kg || 0)).toFixed(2)}
                  </span>
                </div>

                {/* Other Party */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600">
                      {isTraveler(match)
                        ? (match.shipper?.full_name?.[0] || '?')
                        : (match.traveler?.full_name?.[0] || '?')}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {isTraveler(match)
                          ? match.shipper?.full_name || 'Shipper'
                          : match.traveler?.full_name || 'Traveler'}
                      </p>
                      <div className="flex items-center gap-1">
                        {(isTraveler(match) ? match.shipper?.rating : match.traveler?.rating) > 0 && (
                          <>
                            <Star size={11} className="text-yellow-400 fill-yellow-400" />
                            <span className="text-xs text-gray-500">
                              {isTraveler(match) ? match.shipper?.rating : match.traveler?.rating}
                            </span>
                          </>
                        )}
                        <span className="text-xs text-gray-400">
                          {isTraveler(match) ? 'Wants delivery' : 'Offering space'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Accept / Reject Buttons */}
                  <div className="flex items-center gap-2">
                    {!iHaveAccepted ? (
                      <>
                        <button
                          onClick={() => handleReject(match.id)}
                          className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-500 rounded-xl text-sm font-medium hover:bg-red-50 transition"
                        >
                          <XCircle size={15} /> Decline
                        </button>
                        <button
                          onClick={() => handleAccept(match)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition"
                        >
                          <CheckCircle size={15} /> Accept Match
                        </button>
                      </>
                    ) : !theyHaveAccepted ? (
                      <div className="flex items-center gap-2 bg-yellow-50 text-yellow-700 px-4 py-2 rounded-xl text-sm font-medium">
                        <Clock size={15} /> Waiting for other party...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-xl text-sm font-medium">
                        <CheckCircle size={15} /> Chat is now open!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Matches;