import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Send, Package, Plane, DollarSign, CheckCircle, Shield,
  XCircle, AlertTriangle, Clock, ChevronDown, MessageCircle
} from 'lucide-react';
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
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchMatches = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .select(`*, flight:flights(*), request:shipment_requests(*),
        traveler:profiles!matches_traveler_id_fkey(*),
        shipper:profiles!matches_shipper_id_fkey(*)`)
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
      const { count } = await supabase.from('messages')
        .select('id', { count: 'exact' })
        .eq('match_id', match.id).eq('is_read', false)
        .neq('sender_id', session.user.id);
      counts[match.id] = count || 0;
    }
    setUnreadCounts(counts);
  };

  const fetchMessages = async (matchId) => {
    const { data, error } = await supabase
      .from('messages')
      .select(`*, sender:profiles!messages_sender_id_fkey(*)`)
      .eq('match_id', matchId).order('created_at', { ascending: true });
    if (!error) setMessages(data || []);
    setTimeout(scrollToBottom, 100);
    await supabase.rpc('mark_messages_read', { p_match_id: matchId, p_user_id: session.user.id });
    setUnreadCounts(prev => ({ ...prev, [matchId]: 0 }));
  };

  const fetchCancelRequest = async (matchId) => {
    const { data } = await supabase.from('cancellation_requests')
      .select('*').eq('match_id', matchId).eq('status', 'pending').maybeSingle();
    setCancelRequest(data || null);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeMatch) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');
    const { data, error } = await supabase.from('messages')
      .insert([{ match_id: activeMatch.id, sender_id: session.user.id, content, is_read: false }]).select();
    if (!error && data) { setMessages(prev => [...prev, data[0]]); setTimeout(scrollToBottom, 100); }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleCompleteDeal = async () => {
    if (!activeMatch) return;
    const flightDate = activeMatch.flight?.flight_date;
    if (flightDate) {
      const today = new Date(); today.setHours(0,0,0,0);
      const flight = new Date(flightDate); flight.setHours(0,0,0,0);
      if (flight > today) {
        alert(`This deal cannot be completed yet. The flight is on ${new Date(flightDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`);
        return;
      }
    }
    const iAmTraveler = activeMatch.traveler_id === session.user.id;
    const myField = iAmTraveler ? 'traveler_completed' : 'shipper_completed';
    const otherCompleted = iAmTraveler ? activeMatch.shipper_completed : activeMatch.traveler_completed;
    if (!window.confirm(otherCompleted ? 'Confirm delivery and release escrow funds?' : 'Confirm delivery on your side?')) return;
    setSubmittingComplete(true);

    if (otherCompleted) {
      const dealValue = (activeMatch.flight?.price_per_kg || 0) * (activeMatch.request?.weight_kg || 0);
      const travelerReceives = dealValue * 0.9;
      const { data: tp } = await supabase.from('profiles').select('wallet_balance').eq('id', activeMatch.traveler_id).single();
      if (tp) await supabase.from('profiles').update({ wallet_balance: (tp.wallet_balance || 0) + travelerReceives }).eq('id', activeMatch.traveler_id);
      if (activeMatch.payment_intent_id) {
        const { data: { session: auth } } = await supabase.auth.getSession();
        await fetch('https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.access_token}` },
          body: JSON.stringify({ action: 'capture_payment', data: { paymentIntentId: activeMatch.payment_intent_id } })
        });
      }
      await supabase.from('matches').update({ status: 'completed', traveler_completed: true, shipper_completed: true }).eq('id', activeMatch.id);
      await supabase.rpc('expire_old_flights');
      const { data: msg } = await supabase.from('messages').insert([{
        match_id: activeMatch.id, sender_id: session.user.id,
        content: `✅ DEAL COMPLETED: Both parties confirmed. $${travelerReceives.toFixed(2)} credited to traveler's wallet. Thank you for using Fetchr!`,
        is_read: false
      }]).select();
      if (msg) setMessages(prev => [...prev, msg[0]]);
      setTimeout(() => { setAcceptedMatches(prev => prev.filter(m => m.id !== activeMatch.id)); setActiveMatch(null); setMessages([]); }, 2000);
    } else {
      await supabase.from('matches').update({ [myField]: true }).eq('id', activeMatch.id);
      const role = iAmTraveler ? 'TRAVELER' : 'SHIPPER';
      const { data: msg } = await supabase.from('messages').insert([{
        match_id: activeMatch.id, sender_id: session.user.id,
        content: `⏳ DELIVERY CONFIRMED BY ${role}: Waiting for the ${iAmTraveler ? 'Shipper' : 'Traveler'} to also confirm.`,
        is_read: false
      }]).select();
      if (msg) setMessages(prev => [...prev, msg[0]]);
      setActiveMatch(prev => ({ ...prev, [myField]: true }));
    }
    setSubmittingComplete(false);
    await fetchMatches();
  };

  const requestCancellation = async () => {
    if (!cancelReason.trim()) return;
    setSubmittingCancel(true);
    await supabase.from('cancellation_requests').insert([{ match_id: activeMatch.id, requested_by: session.user.id, reason: cancelReason, status: 'pending' }]);
    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: `⚠️ CANCELLATION REQUEST: Reason: ${cancelReason}. Please respond to agree or decline.`, is_read: false
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);
    await fetchCancelRequest(activeMatch.id);
    setShowCancelRequest(false); setCancelReason(''); setSubmittingCancel(false);
    setTimeout(scrollToBottom, 100);
  };

  const agreeCancellation = async () => {
    if (!cancelRequest) return;
    setSubmittingCancel(true);
    const hasEscrow = activeMatch.status === 'in_escrow';
    if (hasEscrow && activeMatch.escrow_amount) {
      const { data: sp } = await supabase.from('profiles').select('wallet_balance').eq('id', activeMatch.shipper_id).single();
      if (sp) await supabase.from('profiles').update({ wallet_balance: (sp.wallet_balance || 0) + activeMatch.escrow_amount }).eq('id', activeMatch.shipper_id);
    }
    await supabase.from('cancellation_requests').update({ status: 'agreed' }).eq('id', cancelRequest.id);
    await supabase.from('matches').update({ status: 'pending', traveler_accepted: false, shipper_accepted: false, traveler_completed: false, shipper_completed: false, cancel_requested_by: null, cancel_agreed: false, refund_status: hasEscrow ? 'refunded' : null }).eq('id', activeMatch.id);
    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: hasEscrow ? '✅ CANCELLATION AGREED: Deal cancelled. Escrow refunded to your wallet.' : '✅ CANCELLATION AGREED: Deal cancelled by mutual agreement.',
      is_read: false
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);
    setAcceptedMatches(prev => prev.filter(m => m.id !== activeMatch.id));
    setActiveMatch(null); setMessages([]); setCancelRequest(null); setSubmittingCancel(false);
  };

  const rejectCancellation = async () => {
    if (!cancelRequest) return;
    await supabase.from('cancellation_requests').update({ status: 'rejected' }).eq('id', cancelRequest.id);
    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: '❌ CANCELLATION DECLINED: The deal continues as agreed.', is_read: false
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);
    setCancelRequest(null);
  };

  useEffect(() => { fetchMatches(); }, []);
  useEffect(() => { if (activeMatch) { fetchMessages(activeMatch.id); fetchCancelRequest(activeMatch.id); } }, [activeMatch]);

  useEffect(() => {
    if (!activeMatch) return;
    const sub = supabase.channel(`messages:${activeMatch.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${activeMatch.id}` }, async (payload) => {
        setMessages(prev => prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        setTimeout(scrollToBottom, 100);
        if (payload.new.sender_id !== session.user.id) {
          await supabase.rpc('mark_messages_read', { p_match_id: activeMatch.id, p_user_id: session.user.id });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${activeMatch.id}` }, (payload) => {
        setActiveMatch(prev => ({ ...prev, ...payload.new }));
        setAcceptedMatches(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
      })
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [activeMatch]);

  useEffect(() => {
    const sub = supabase.channel('messages-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        if (payload.new.sender_id !== session.user.id) {
          const matchId = payload.new.match_id;
          if (activeMatch?.id !== matchId) {
            setUnreadCounts(prev => ({ ...prev, [matchId]: (prev[matchId] || 0) + 1 }));
          }
        }
      }).subscribe();
    return () => supabase.removeChannel(sub);
  }, [activeMatch]);

  const isTraveler = (match) => match?.traveler_id === session.user.id;
  const isShipper = (match) => match?.shipper_id === session.user.id;
  const getOtherParty = (match) => isTraveler(match) ? match.shipper : match.traveler;
  const getInitials = (name) => { if (!name) return '?'; return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); };
  const totalUnread = Object.values(unreadCounts).reduce((s, c) => s + c, 0);

  const getCompletionStatus = (match) => {
    if (!match) return null;
    const myDone = isTraveler(match) ? match.traveler_completed : match.shipper_completed;
    const otherDone = isTraveler(match) ? match.shipper_completed : match.traveler_completed;
    if (myDone && otherDone) return { label: 'Both confirmed!', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', icon: '✅' };
    if (myDone) return { label: 'You confirmed — waiting for other party', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', icon: '⏳' };
    if (otherDone) return { label: 'Other party confirmed — your turn!', color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100', icon: '🔔' };
    return null;
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (acceptedMatches.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-20 h-20 bg-violet-50 rounded-2xl flex items-center justify-center mb-4">
        <MessageCircle size={32} className="text-violet-300" />
      </div>
      <h2 className="text-lg font-bold text-gray-800 mb-1">No active conversations</h2>
      <p className="text-gray-400 text-sm">Accept a match to start chatting</p>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-80px)] bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden animate-fade-in">

      {/* Sidebar */}
      <div className={`${showSidebar ? 'w-72' : 'w-0'} border-r border-gray-100 flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden`}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Messages</h2>
            <p className="text-xs text-gray-400 mt-0.5">{acceptedMatches.length} active deal{acceptedMatches.length !== 1 ? 's' : ''}</p>
          </div>
          {totalUnread > 0 && (
            <span className="bg-violet-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {totalUnread}
            </span>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {acceptedMatches.map(match => {
            const other = getOtherParty(match);
            const unread = unreadCounts[match.id] || 0;
            const isActive = activeMatch?.id === match.id;
            const iAmTrav = match.traveler_id === session.user.id;
            const myDone = iAmTrav ? match.traveler_completed : match.shipper_completed;

            return (
              <button key={match.id}
                onClick={() => { setActiveMatch(match); setShowPayment(false); setShowCancelRequest(false); }}
                className={`w-full text-left p-4 border-b border-gray-50 transition-all ${isActive ? 'bg-violet-50' : 'hover:bg-gray-50'}`}>
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${isActive ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-600'}`}>
                      {getInitials(other?.full_name)}
                    </div>
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 bg-violet-600 text-white text-xs font-bold rounded-full w-4.5 h-4.5 w-5 h-5 flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                        {other?.full_name || 'User'}
                      </p>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                        {match.status === 'in_escrow' && <span className="text-xs">🔒</span>}
                        {myDone && <span className="text-xs text-emerald-500">✓</span>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {match.flight?.from_code} → {match.flight?.to_code} · {match.request?.item_name}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      {activeMatch ? (
        <div className="flex-1 flex flex-col min-w-0">

          {/* Chat header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-shrink-0 bg-white">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setShowSidebar(!showSidebar)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition text-gray-400 flex-shrink-0">
                <ChevronDown size={16} className={`transition-transform ${showSidebar ? 'rotate-90' : '-rotate-90'}`} />
              </button>
              <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-600 flex-shrink-0">
                {getInitials(getOtherParty(activeMatch)?.full_name)}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">
                  {getOtherParty(activeMatch)?.full_name || 'User'}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {activeMatch.flight?.from_code} → {activeMatch.flight?.to_code} · {activeMatch.request?.item_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="hidden sm:block text-right mr-1">
                <p className="text-xs text-gray-400">Deal value</p>
                <p className="text-sm font-bold text-violet-600">
                  ${((activeMatch.flight?.price_per_kg || 0) * (activeMatch.request?.weight_kg || 0)).toFixed(2)}
                </p>
              </div>

              {isShipper(activeMatch) && (
                <button onClick={() => { setShowPayment(!showPayment); setShowCancelRequest(false); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${showPayment ? 'bg-violet-100 text-violet-700' : 'btn-primary'}`}>
                  <Shield size={12} /> Escrow
                </button>
              )}

              {(() => {
                const myDone = isTraveler(activeMatch) ? activeMatch.traveler_completed : activeMatch.shipper_completed;
                const otherDone = isTraveler(activeMatch) ? activeMatch.shipper_completed : activeMatch.traveler_completed;
                const flightDate = activeMatch.flight?.flight_date;
                const today = new Date(); today.setHours(0,0,0,0);
                const flight = flightDate ? new Date(flightDate) : null;
                if (flight) flight.setHours(0,0,0,0);
                const passed = flight ? flight <= today : true;

                if (!passed) return (
                  <div className="flex items-center gap-1 bg-gray-100 text-gray-400 px-3 py-2 rounded-xl text-xs font-semibold cursor-not-allowed">
                    <Clock size={12} /> {new Date(flightDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                );

                return (
                  <button onClick={handleCompleteDeal} disabled={submittingComplete || myDone}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      myDone ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                      otherDone ? 'bg-emerald-500 text-white shadow-button animate-pulse' :
                      'bg-emerald-500 text-white shadow-button hover:bg-emerald-600'
                    }`}>
                    {myDone ? <><Clock size={12} /> Waiting</> :
                     otherDone ? <><CheckCircle size={12} /> Confirm & Release</> :
                     <><CheckCircle size={12} /> Complete</>}
                  </button>
                );
              })()}

              <button onClick={() => { setShowCancelRequest(!showCancelRequest); setShowPayment(false); }}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500 transition-all">
                <XCircle size={12} /> Cancel
              </button>
            </div>
          </div>

          {/* Deal info strip */}
          <div className="bg-violet-50/50 px-4 py-2 flex items-center gap-4 text-xs border-b border-violet-100/50 flex-shrink-0 flex-wrap">
            <span className="flex items-center gap-1.5 text-violet-700 font-medium">
              <Plane size={11} /> {activeMatch.flight?.from_code} → {activeMatch.flight?.to_code}
            </span>
            <span className="flex items-center gap-1.5 text-violet-700 font-medium">
              <Package size={11} /> {activeMatch.request?.weight_kg}kg · {activeMatch.request?.item_name}
            </span>
            <span className="flex items-center gap-1.5 text-violet-700 font-medium">
              <DollarSign size={11} /> ${activeMatch.flight?.price_per_kg}/kg
            </span>
            <span className={`ml-auto badge ${isTraveler(activeMatch) ? 'badge-blue' : 'badge-green'}`}>
              {isTraveler(activeMatch) ? '✈️ You are Traveler' : '📦 You are Shipper'}
            </span>
          </div>

          {/* Completion status */}
          {getCompletionStatus(activeMatch) && (
            <div className={`px-4 py-2.5 flex items-center gap-2 border-b ${getCompletionStatus(activeMatch).bg} flex-shrink-0`}>
              <span>{getCompletionStatus(activeMatch).icon}</span>
              <span className={`text-xs font-semibold ${getCompletionStatus(activeMatch).color}`}>
                {getCompletionStatus(activeMatch).label}
              </span>
              <div className="ml-auto flex items-center gap-3 text-xs">
                <span className={`flex items-center gap-1 ${activeMatch.traveler_completed ? 'text-emerald-600 font-bold' : 'text-gray-300'}`}>
                  {activeMatch.traveler_completed ? '✓' : '○'} Traveler
                </span>
                <span className={`flex items-center gap-1 ${activeMatch.shipper_completed ? 'text-emerald-600 font-bold' : 'text-gray-300'}`}>
                  {activeMatch.shipper_completed ? '✓' : '○'} Shipper
                </span>
              </div>
            </div>
          )}

          {/* Escrow panel */}
          {showPayment && isShipper(activeMatch) && (
            <div className="border-b border-gray-100 bg-gray-50/50 overflow-y-auto max-h-96 flex-shrink-0">
              <EscrowPayment match={activeMatch} session={session}
                onPaymentComplete={async () => {
                  setShowPayment(false);
                  await fetchMatches();
                  if (activeMatch) await fetchMessages(activeMatch.id);
                }} />
            </div>
          )}

          {/* Cancel form */}
          {showCancelRequest && !cancelRequest && (
            <div className="border-b border-red-100 bg-red-50/50 p-4 flex-shrink-0">
              <p className="text-sm font-bold text-red-700 mb-1 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Request Cancellation
              </p>
              <p className="text-xs text-red-500 mb-3">
                {activeMatch.status === 'in_escrow' ? '⚠️ Escrow will be refunded to shipper wallet if both agree.' : 'Both parties must agree to cancel.'}
              </p>
              <textarea placeholder="Explain your reason..." value={cancelReason}
                onChange={e => setCancelReason(e.target.value)} rows={2}
                className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none mb-2 bg-white" />
              <div className="flex gap-2">
                <button onClick={() => { setShowCancelRequest(false); setCancelReason(''); }}
                  className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-2 text-xs font-semibold hover:bg-gray-50 bg-white transition">
                  Never mind
                </button>
                <button onClick={requestCancellation} disabled={submittingCancel || !cancelReason.trim()}
                  className="flex-1 bg-red-500 text-white rounded-xl py-2 text-xs font-bold hover:bg-red-600 disabled:opacity-50 transition">
                  {submittingCancel ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          )}

          {/* Pending cancel — other party */}
          {cancelRequest && cancelRequest.requested_by !== session.user.id && (
            <div className="border-b border-amber-100 bg-amber-50/50 p-4 flex-shrink-0">
              <p className="text-sm font-bold text-amber-700 mb-1 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Cancellation Requested
              </p>
              <p className="text-xs text-amber-600 mb-3">
                "{cancelRequest.reason}"
                {activeMatch.status === 'in_escrow' && ' — Escrow refunded to shipper wallet if agreed.'}
              </p>
              <div className="flex gap-2">
                <button onClick={rejectCancellation} disabled={submittingCancel}
                  className="flex-1 border border-red-200 text-red-500 rounded-xl py-2 text-xs font-semibold hover:bg-red-50 bg-white transition">
                  Decline
                </button>
                <button onClick={agreeCancellation} disabled={submittingCancel}
                  className="flex-1 bg-emerald-500 text-white rounded-xl py-2 text-xs font-bold hover:bg-emerald-600 disabled:opacity-50 transition">
                  {submittingCancel ? 'Processing...' : 'Agree & Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* Your pending cancel */}
          {cancelRequest && cancelRequest.requested_by === session.user.id && (
            <div className="border-b border-amber-100 bg-amber-50/50 p-3 flex-shrink-0">
              <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                <Clock size={13} /> Cancellation request sent — waiting for response
              </p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center mb-3">
                  <MessageCircle size={20} className="text-violet-300" />
                </div>
                <p className="text-gray-400 text-sm font-medium">No messages yet</p>
                <p className="text-gray-300 text-xs mt-1">Say hello to get started! 👋</p>
              </div>
            )}
            {messages.map((msg, i) => {
              const isMe = msg.sender_id === session.user.id;
              const isSystem = msg.content.startsWith('⚠️') || msg.content.startsWith('✅') ||
                msg.content.startsWith('❌') || msg.content.startsWith('🎉') ||
                msg.content.startsWith('⏳') || msg.content.startsWith('💰');

              if (isSystem) return (
                <div key={i} className="flex justify-center">
                  <div className="max-w-sm bg-gray-100 text-gray-600 text-xs px-4 py-2.5 rounded-2xl text-center leading-relaxed border border-gray-200/50">
                    {msg.content}
                  </div>
                </div>
              );

              return (
                <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                    isMe
                      ? 'bg-violet-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md border border-gray-200/50'
                  }`}>
                    <p className="leading-relaxed">{msg.content}</p>
                    <p className={`text-xs mt-1 ${isMe ? 'text-violet-200' : 'text-gray-400'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {isMe && <span className="ml-1">{msg.is_read ? '✓✓' : '✓'}</span>}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100 flex-shrink-0 bg-white">
            <div className="flex items-center gap-2">
              <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 focus:bg-white transition-all" />
              <button onClick={sendMessage} disabled={sending || !newMessage.trim()}
                className="w-11 h-11 bg-violet-600 rounded-xl flex items-center justify-center hover:bg-violet-700 transition-all shadow-button disabled:opacity-50 disabled:shadow-none flex-shrink-0">
                <Send size={16} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50/50">
          <div className="text-center">
            <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <MessageCircle size={24} className="text-violet-300" />
            </div>
            <p className="text-gray-500 font-medium text-sm">Select a conversation</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;