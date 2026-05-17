import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Send, Package, Plane, DollarSign, CheckCircle, Shield, XCircle, AlertTriangle, Clock } from 'lucide-react';
import EscrowPayment from './EscrowPayment';

const Messages = ({ session }) => {
  const [acceptedMatches, setAcceptedMatches] = useState([]);
  const [activeMatch, setActiveMatch] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCancelRequest, setShowCancelRequest] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRequest, setCancelRequest] = useState(null);
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [submittingComplete, setSubmittingComplete] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMatches = async () => {
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

    if (!error && data) {
      setAcceptedMatches(data);
      if (data.length > 0 && !activeMatch) setActiveMatch(data[0]);
      await fetchUnreadCounts(data);
    }
    setLoading(false);
  };

  const fetchUnreadCounts = async (matches) => {
    const counts = {};
    for (const match of matches) {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact' })
        .eq('match_id', match.id)
        .eq('is_read', false)
        .neq('sender_id', session.user.id);
      counts[match.id] = count || 0;
    }
    setUnreadCounts(counts);
  };

  const fetchMessages = async (matchId) => {
    const { data, error } = await supabase
      .from('messages')
      .select(`*, sender:profiles!messages_sender_id_fkey(*)`)
      .eq('match_id', matchId)
      .order('created_at', { ascending: true });

    if (!error) setMessages(data || []);
    setTimeout(scrollToBottom, 100);

    await supabase.rpc('mark_messages_read', {
      p_match_id: matchId,
      p_user_id: session.user.id
    });
    setUnreadCounts(prev => ({ ...prev, [matchId]: 0 }));
  };

  const fetchCancelRequest = async (matchId) => {
    const { data } = await supabase
      .from('cancellation_requests')
      .select('*')
      .eq('match_id', matchId)
      .eq('status', 'pending')
      .maybeSingle();
    setCancelRequest(data || null);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeMatch) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    const { data, error } = await supabase.from('messages').insert([{
      match_id: activeMatch.id,
      sender_id: session.user.id,
      content: content,
      is_read: false
    }]).select();

    if (!error && data) {
      setMessages(prev => [...prev, data[0]]);
      setTimeout(scrollToBottom, 100);
    }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCompleteDeal = async () => {
    if (!activeMatch) return;

    // Check if flight date has passed
    const flightDate = activeMatch.flight?.flight_date;
    if (flightDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const flight = new Date(flightDate);
      flight.setHours(0, 0, 0, 0);
      if (flight > today) {
        alert(`❌ This deal cannot be completed yet. The flight is scheduled for ${new Date(flightDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. You can only confirm delivery after the flight has taken place.`);
        return;
      }
    }

    const iAmTraveler = activeMatch.traveler_id === session.user.id;
    const myCompletedField = iAmTraveler ? 'traveler_completed' : 'shipper_completed';
    const otherCompleted = iAmTraveler
      ? activeMatch.shipper_completed
      : activeMatch.traveler_completed;

    if (!window.confirm(
      otherCompleted
        ? 'The other party has confirmed delivery. Click OK to complete the deal and release escrow funds to the traveler.'
        : 'Confirm that the delivery is complete on your side? The deal will only close once the other party also confirms.'
    )) return;

    setSubmittingComplete(true);

    if (otherCompleted) {
      // Release funds to traveler wallet
      const dealValue = (activeMatch.flight?.price_per_kg || 0) * (activeMatch.request?.weight_kg || 0);
      const fetchrFee = dealValue * 0.10;
      const travelerReceives = dealValue - fetchrFee;

      const { data: travelerProfile } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', activeMatch.traveler_id)
        .single();

      if (travelerProfile) {
        const newBalance = (travelerProfile.wallet_balance || 0) + travelerReceives;
        await supabase.from('profiles')
          .update({ wallet_balance: newBalance })
          .eq('id', activeMatch.traveler_id);
      }

      // Release Stripe escrow if payment was made by card
      if (activeMatch.payment_intent_id) {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        await fetch(
          'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authSession.access_token}`
            },
            body: JSON.stringify({
              action: 'capture_payment',
              data: { paymentIntentId: activeMatch.payment_intent_id }
            })
          }
        );
      }

      // Complete the match
      await supabase.from('matches').update({
        status: 'completed',
        traveler_completed: true,
        shipper_completed: true,
      }).eq('id', activeMatch.id);

      // Expire flight and request
      await supabase.rpc('expire_old_flights');

      const { data: msgData } = await supabase.from('messages').insert([{
        match_id: activeMatch.id,
        sender_id: session.user.id,
        content: `✅ DEAL COMPLETED: Both parties have confirmed delivery. $${travelerReceives.toFixed(2)} has been credited to the traveler's wallet. Thank you for using Fetchr!`,
        is_read: false
      }]).select();

      if (msgData) setMessages(prev => [...prev, msgData[0]]);

      setTimeout(() => {
        setAcceptedMatches(prev => prev.filter(m => m.id !== activeMatch.id));
        setActiveMatch(null);
        setMessages([]);
      }, 2000);

    } else {
      await supabase.from('matches').update({
        [myCompletedField]: true,
      }).eq('id', activeMatch.id);

      const role = iAmTraveler ? 'Traveler' : 'Shipper';
      const { data: msgData } = await supabase.from('messages').insert([{
        match_id: activeMatch.id,
        sender_id: session.user.id,
        content: `⏳ DELIVERY CONFIRMED BY ${role.toUpperCase()}: Waiting for the ${iAmTraveler ? 'Shipper' : 'Traveler'} to also confirm delivery before the deal closes and escrow is released.`,
        is_read: false
      }]).select();

      if (msgData) setMessages(prev => [...prev, msgData[0]]);
      setActiveMatch(prev => ({ ...prev, [myCompletedField]: true }));
    }

    setSubmittingComplete(false);
    await fetchMatches();
  };

  const requestCancellation = async () => {
    if (!cancelReason.trim()) return;
    setSubmittingCancel(true);

    await supabase.from('cancellation_requests').insert([{
      match_id: activeMatch.id,
      requested_by: session.user.id,
      reason: cancelReason,
      status: 'pending'
    }]);

    const { data: msgData } = await supabase.from('messages').insert([{
      match_id: activeMatch.id,
      sender_id: session.user.id,
      content: `⚠️ CANCELLATION REQUEST: I would like to cancel this deal. Reason: ${cancelReason}. Please respond to agree or decline.`,
      is_read: false
    }]).select();

    if (msgData) setMessages(prev => [...prev, msgData[0]]);
    await fetchCancelRequest(activeMatch.id);
    setShowCancelRequest(false);
    setCancelReason('');
    setSubmittingCancel(false);
    setTimeout(scrollToBottom, 100);
  };

  const agreeCancellation = async () => {
    if (!cancelRequest) return;
    setSubmittingCancel(true);

    const hasEscrow = activeMatch.status === 'in_escrow';

    // Refund wallet if escrow was paid via wallet
    if (hasEscrow && activeMatch.escrow_amount) {
      const { data: shipperProfile } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', activeMatch.shipper_id)
        .single();

      if (shipperProfile) {
        const refundAmount = activeMatch.escrow_amount;
        const newBalance = (shipperProfile.wallet_balance || 0) + refundAmount;
        await supabase.from('profiles')
          .update({ wallet_balance: newBalance })
          .eq('id', activeMatch.shipper_id);
      }
    }

    await supabase.from('cancellation_requests')
      .update({ status: 'agreed' })
      .eq('id', cancelRequest.id);

    await supabase.from('matches')
      .update({
        status: 'pending',
        traveler_accepted: false,
        shipper_accepted: false,
        traveler_completed: false,
        shipper_completed: false,
        cancel_requested_by: null,
        cancel_agreed: false,
        refund_status: hasEscrow ? 'refunded' : null
      })
      .eq('id', activeMatch.id);

    const { data: msgData } = await supabase.from('messages').insert([{
      match_id: activeMatch.id,
      sender_id: session.user.id,
      content: hasEscrow
        ? '✅ CANCELLATION AGREED: This deal has been cancelled. The escrow payment has been refunded to your wallet.'
        : '✅ CANCELLATION AGREED: This deal has been cancelled by mutual agreement.',
      is_read: false
    }]).select();

    if (msgData) setMessages(prev => [...prev, msgData[0]]);
    setAcceptedMatches(acceptedMatches.filter(m => m.id !== activeMatch.id));
    setActiveMatch(null);
    setMessages([]);
    setCancelRequest(null);
    setSubmittingCancel(false);
  };

  const rejectCancellation = async () => {
    if (!cancelRequest) return;

    await supabase.from('cancellation_requests')
      .update({ status: 'rejected' })
      .eq('id', cancelRequest.id);

    const { data: msgData } = await supabase.from('messages').insert([{
      match_id: activeMatch.id,
      sender_id: session.user.id,
      content: '❌ CANCELLATION DECLINED: The cancellation request has been declined. The deal continues as agreed.',
      is_read: false
    }]).select();

    if (msgData) setMessages(prev => [...prev, msgData[0]]);
    setCancelRequest(null);
  };

  useEffect(() => { fetchMatches(); }, []);

  useEffect(() => {
    if (activeMatch) {
      fetchMessages(activeMatch.id);
      fetchCancelRequest(activeMatch.id);
    }
  }, [activeMatch]);

  useEffect(() => {
    if (!activeMatch) return;

    const subscription = supabase
      .channel(`messages:${activeMatch.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `match_id=eq.${activeMatch.id}`
      }, async (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        setTimeout(scrollToBottom, 100);
        if (payload.new.sender_id !== session.user.id) {
          await supabase.rpc('mark_messages_read', {
            p_match_id: activeMatch.id,
            p_user_id: session.user.id
          });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
        filter: `id=eq.${activeMatch.id}`
      }, (payload) => {
        setActiveMatch(prev => ({ ...prev, ...payload.new }));
        setAcceptedMatches(prev =>
          prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m)
        );
      })
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, [activeMatch]);

  useEffect(() => {
    const sub = supabase
      .channel('messages-unread')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, async (payload) => {
        if (payload.new.sender_id !== session.user.id) {
          const matchId = payload.new.match_id;
          const isActive = activeMatch?.id === matchId;
          if (!isActive) {
            setUnreadCounts(prev => ({
              ...prev,
              [matchId]: (prev[matchId] || 0) + 1
            }));
          }
        }
      })
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [activeMatch]);

  const isTraveler = (match) => match?.traveler_id === session.user.id;
  const isShipper = (match) => match?.shipper_id === session.user.id;
  const getOtherParty = (match) => isTraveler(match) ? match.shipper : match.traveler;

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getCompletionStatus = (match) => {
    if (!match) return null;
    const iAmTraveler = isTraveler(match);
    const myCompleted = iAmTraveler ? match.traveler_completed : match.shipper_completed;
    const otherCompleted = iAmTraveler ? match.shipper_completed : match.traveler_completed;
    if (myCompleted && otherCompleted) return { label: 'Both confirmed!', color: 'text-green-600', icon: '✅' };
    if (myCompleted) return { label: 'You confirmed — waiting for other party', color: 'text-yellow-600', icon: '⏳' };
    if (otherCompleted) return { label: 'Other party confirmed — your turn!', color: 'text-purple-600', icon: '🔔' };
    return null;
  };

  const totalUnread = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);

  if (loading) return (
    <div className="flex items-center justify-center h-full py-20">
      <p className="text-gray-400 text-sm">Loading messages...</p>
    </div>
  );

  if (acceptedMatches.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4">
        <Send size={28} className="text-purple-400" />
      </div>
      <h2 className="text-lg font-bold text-gray-800 mb-1">No active chats</h2>
      <p className="text-gray-400 text-sm">Accept a match to start chatting</p>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mx-0 md:mx-6 my-0 md:my-6">

      {/* Left: Match List */}
      <div className="w-64 md:w-72 border-r border-gray-100 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">Active Deals</h2>
            <p className="text-xs text-gray-400 mt-0.5">{acceptedMatches.length} conversation{acceptedMatches.length !== 1 ? 's' : ''}</p>
          </div>
          {totalUnread > 0 && (
            <span className="bg-purple-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {totalUnread}
            </span>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {acceptedMatches.map(match => {
            const other = getOtherParty(match);
            const unread = unreadCounts[match.id] || 0;
            const iAmTraveler = match.traveler_id === session.user.id;
            const myCompleted = iAmTraveler ? match.traveler_completed : match.shipper_completed;
            return (
              <button
                key={match.id}
                onClick={() => {
                  setActiveMatch(match);
                  setShowPayment(false);
                  setShowCancelRequest(false);
                }}
                className={`w-full text-left p-4 border-b border-gray-50 hover:bg-gray-50 transition ${activeMatch?.id === match.id ? 'bg-purple-50' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0">
                      {getInitials(other?.full_name)}
                    </div>
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>
                        {other?.full_name || other?.email || 'User'}
                      </p>
                      <div className="flex items-center gap-1">
                        {match.status === 'in_escrow' && <span className="text-xs text-blue-500">💰</span>}
                        {myCompleted && <span className="text-xs text-green-500">✓</span>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {match.flight?.from_city} → {match.flight?.to_city}
                    </p>
                    <p className={`text-xs truncate ${unread > 0 ? 'text-purple-600 font-medium' : 'text-gray-400'}`}>
                      {match.request?.item_name}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Chat Window */}
      {activeMatch ? (
        <div className="flex-1 flex flex-col min-w-0">

          {/* Chat Header */}
          <div className="p-3 md:p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0">
                {getInitials(getOtherParty(activeMatch)?.full_name)}
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">
                  {getOtherParty(activeMatch)?.full_name || 'User'}
                </p>
                <p className="text-xs text-gray-400 truncate max-w-xs">
                  {activeMatch.flight?.from_city} → {activeMatch.flight?.to_city} • {activeMatch.request?.item_name}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="text-right">
                <p className="text-xs text-gray-400">Deal</p>
                <p className="text-sm font-bold text-purple-600">
                  ${((activeMatch.flight?.price_per_kg || 0) * (activeMatch.request?.weight_kg || 0)).toFixed(2)}
                </p>
              </div>

              {isShipper(activeMatch) && (
                <button
                  onClick={() => { setShowPayment(!showPayment); setShowCancelRequest(false); }}
                  className="flex items-center gap-1.5 bg-purple-600 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-purple-700 transition"
                >
                  <Shield size={13} /> Pay Escrow
                </button>
              )}

              {(() => {
                const iAmTraveler = isTraveler(activeMatch);
                const myCompleted = iAmTraveler ? activeMatch.traveler_completed : activeMatch.shipper_completed;
                const otherCompleted = iAmTraveler ? activeMatch.shipper_completed : activeMatch.traveler_completed;
                const flightDate = activeMatch.flight?.flight_date;
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const flight = flightDate ? new Date(flightDate) : null;
                if (flight) flight.setHours(0, 0, 0, 0);
                const flightHasPassed = flight ? flight <= today : true;

                if (!flightHasPassed) return (
                  <div className="flex items-center gap-1.5 bg-gray-100 text-gray-400 px-3 py-2 rounded-xl text-xs font-semibold cursor-not-allowed">
                    <Clock size={13} /> After {new Date(flightDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                );

                return (
                  <button
                    onClick={handleCompleteDeal}
                    disabled={submittingComplete || myCompleted}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      myCompleted
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : otherCompleted
                        ? 'bg-green-500 text-white hover:bg-green-600 animate-pulse'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    {myCompleted ? <><Clock size={13} /> Waiting...</> :
                     otherCompleted ? <><CheckCircle size={13} /> Confirm & Release</> :
                     <><CheckCircle size={13} /> Complete</>}
                  </button>
                );
              })()}

              <button
                onClick={() => { setShowCancelRequest(!showCancelRequest); setShowPayment(false); }}
                className="flex items-center gap-1.5 bg-red-50 text-red-500 border border-red-200 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-red-100 transition"
              >
                <XCircle size={13} /> Cancel
              </button>
            </div>
          </div>

          {/* Deal Summary Bar */}
          <div className="bg-purple-50 px-4 py-2 flex items-center gap-3 md:gap-6 text-xs flex-wrap">
            <span className="flex items-center gap-1 text-purple-700">
              <Plane size={12} />
              {activeMatch.flight?.from_code} → {activeMatch.flight?.to_code}
            </span>
            <span className="flex items-center gap-1 text-purple-700">
              <Package size={12} />
              {activeMatch.request?.weight_kg}kg
            </span>
            <span className="flex items-center gap-1 text-purple-700">
              <DollarSign size={12} />
              ${activeMatch.flight?.price_per_kg}/kg
            </span>
            <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
              isTraveler(activeMatch) ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
            }`}>
              {isTraveler(activeMatch) ? '✈️ Traveler' : '📦 Shipper'}
            </span>
          </div>

          {/* Completion Status Banner */}
          {getCompletionStatus(activeMatch) && (
            <div className={`px-4 py-2.5 flex items-center gap-2 text-sm font-medium border-b border-gray-100 ${
              getCompletionStatus(activeMatch)?.label.includes('Both') ? 'bg-green-50' :
              getCompletionStatus(activeMatch)?.label.includes('your turn') ? 'bg-purple-50' : 'bg-yellow-50'
            }`}>
              <span>{getCompletionStatus(activeMatch)?.icon}</span>
              <span className={getCompletionStatus(activeMatch)?.color}>
                {getCompletionStatus(activeMatch)?.label}
              </span>
              <div className="ml-auto flex items-center gap-3 text-xs">
                <span className={`flex items-center gap-1 ${activeMatch.traveler_completed ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                  {activeMatch.traveler_completed ? '✓' : '○'} Traveler
                </span>
                <span className={`flex items-center gap-1 ${activeMatch.shipper_completed ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                  {activeMatch.shipper_completed ? '✓' : '○'} Shipper
                </span>
              </div>
            </div>
          )}

          {/* Escrow Payment Panel */}
          {showPayment && isShipper(activeMatch) && (
            <div className="border-b border-gray-100 bg-white overflow-y-auto max-h-96">
              <EscrowPayment
                match={activeMatch}
                session={session}
                onPaymentComplete={async () => {
                  setShowPayment(false);
                  await fetchMatches();
                  if (activeMatch) await fetchMessages(activeMatch.id);
                }}
              />
            </div>
          )}

          {/* Cancel Request Form */}
          {showCancelRequest && !cancelRequest && (
            <div className="border-b border-gray-100 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700 mb-1 flex items-center gap-1">
                <AlertTriangle size={14} /> Request Deal Cancellation
              </p>
              <p className="text-xs text-red-600 mb-3">
                {activeMatch.status === 'in_escrow'
                  ? '⚠️ Escrow funds will be refunded to your wallet if both parties agree.'
                  : 'Both parties must agree to cancel this deal.'}
              </p>
              <textarea
                placeholder="Please explain your reason for cancellation..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                rows={2}
                className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none mb-2 bg-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowCancelRequest(false); setCancelReason(''); }}
                  className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-2 text-xs font-semibold hover:bg-gray-50 bg-white"
                >
                  Never mind
                </button>
                <button
                  onClick={requestCancellation}
                  disabled={submittingCancel || !cancelReason.trim()}
                  className="flex-1 bg-red-500 text-white rounded-xl py-2 text-xs font-semibold hover:bg-red-600 disabled:opacity-50"
                >
                  {submittingCancel ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          )}

          {/* Pending Cancellation — other party */}
          {cancelRequest && cancelRequest.requested_by !== session.user.id && (
            <div className="border-b border-gray-100 bg-yellow-50 p-4">
              <p className="text-sm font-semibold text-yellow-700 mb-1 flex items-center gap-1">
                <AlertTriangle size={14} /> Cancellation Requested
              </p>
              <p className="text-xs text-yellow-600 mb-3">
                Reason: "{cancelRequest.reason}"
                {activeMatch.status === 'in_escrow' && ' — Escrow will be refunded to shipper wallet if agreed.'}
              </p>
              <div className="flex gap-2">
                <button onClick={rejectCancellation} disabled={submittingCancel}
                  className="flex-1 border border-red-200 text-red-500 rounded-xl py-2 text-xs font-semibold hover:bg-red-50 bg-white">
                  Decline
                </button>
                <button onClick={agreeCancellation} disabled={submittingCancel}
                  className="flex-1 bg-green-500 text-white rounded-xl py-2 text-xs font-semibold hover:bg-green-600 disabled:opacity-50">
                  {submittingCancel ? 'Processing...' : 'Agree & Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* Your pending cancellation */}
          {cancelRequest && cancelRequest.requested_by === session.user.id && (
            <div className="border-b border-gray-100 bg-yellow-50 p-4">
              <p className="text-sm font-semibold text-yellow-700 flex items-center gap-1">
                <AlertTriangle size={14} /> Cancellation Request Sent
              </p>
              <p className="text-xs text-yellow-600 mt-1">Waiting for the other party to respond.</p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full">
                <p className="text-gray-400 text-sm">No messages yet — say hello! 👋</p>
              </div>
            )}
            {messages.map((msg, i) => {
              const isMe = msg.sender_id === session.user.id;
              const isSystem = msg.content.startsWith('⚠️') ||
                msg.content.startsWith('✅') ||
                msg.content.startsWith('❌') ||
                msg.content.startsWith('🎉') ||
                msg.content.startsWith('⏳') ||
                msg.content.startsWith('💰');

              if (isSystem) return (
                <div key={i} className="flex justify-center">
                  <div className="max-w-xs md:max-w-sm bg-gray-100 text-gray-600 text-xs px-4 py-2.5 rounded-xl text-center leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              );

              return (
                <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs md:max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                    isMe ? 'bg-purple-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}>
                    <p>{msg.content}</p>
                    <p className={`text-xs mt-1 ${isMe ? 'text-purple-200' : 'text-gray-400'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {isMe && <span className="ml-1">{msg.is_read ? '✓✓' : '✓'}</span>}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div className="p-3 md:p-4 border-t border-gray-100">
            <div className="flex items-center gap-2 md:gap-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
              />
              <button
                onClick={sendMessage}
                disabled={sending || !newMessage.trim()}
                className="w-11 h-11 bg-purple-600 rounded-xl flex items-center justify-center hover:bg-purple-700 transition disabled:opacity-50 flex-shrink-0"
              >
                <Send size={16} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">Select a conversation to start chatting</p>
        </div>
      )}
    </div>
  );
};

export default Messages;