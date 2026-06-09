import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Send, Package, Plane, DollarSign, CheckCircle, Shield,
  XCircle, AlertTriangle, Clock, ChevronDown, MessageCircle,
  Camera, Lock
} from 'lucide-react';
import EscrowPayment from './EscrowPayment';

const STAGES = [
  { id: 'matched', label: 'Matched', icon: '🤝' },
  { id: 'terms_agreed', label: 'Terms Agreed', icon: '✅' },
  { id: 'in_escrow', label: 'Escrow Paid', icon: '🔒' },
  { id: 'proof_uploaded', label: 'Proof Uploaded', icon: '📸' },
  { id: 'completed', label: 'Completed', icon: '🎉' },
];

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
  const [uploadingProof, setUploadingProof] = useState(false);
  const messagesEndRef = useRef(null);
  const proofInputRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

const fetchMatches = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('matches')
      .select(`*, flight:flights(*), request:shipment_requests(*),
        traveler:profiles!matches_traveler_id_fkey(*),
        shipper:profiles!matches_shipper_id_fkey(*)`)
      .or(`traveler_id.eq.${session.user.id},shipper_id.eq.${session.user.id}`)
      .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
      .order('created_at', { ascending: false });

    if (data) {
      setAcceptedMatches(data);
      // Always set active match to most recent if none selected
      // or if current active match is no longer in the list
      setActiveMatch(prev => {
        if (!prev) return data[0] || null;
        const stillExists = data.find(m => m.id === prev.id);
        return stillExists ? { ...prev, ...stillExists } : (data[0] || null);
      });
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
    const { data } = await supabase
      .from('messages')
      .select(`*, sender:profiles!messages_sender_id_fkey(*)`)
      .eq('match_id', matchId).order('created_at', { ascending: true });
    if (data) setMessages(data);
    setTimeout(scrollToBottom, 100);
    try {
      await supabase.rpc('mark_messages_read', {
        p_match_id: matchId,
        p_user_id: session.user.id
      });
    } catch (e) {}
    setUnreadCounts(prev => ({ ...prev, [matchId]: 0 }));
  };

const fetchCancelRequest = async (matchId) => {
    const { data } = await supabase.from('cancellation_requests')
      .select('*')
      .eq('match_id', matchId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCancelRequest(data || null);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeMatch) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');
    const { data } = await supabase.from('messages')
      .insert([{ match_id: activeMatch.id, sender_id: session.user.id, content, is_read: false }])
      .select();
    if (data) { setMessages(prev => [...prev, data[0]]); setTimeout(scrollToBottom, 100); }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Both parties agree to terms before escrow unlocks
  const agreeToTerms = async () => {
    const iAmTraveler = activeMatch.traveler_id === session.user.id;
    const myField = iAmTraveler ? 'terms_agreed_traveler' : 'terms_agreed_shipper';
    const otherAgreed = iAmTraveler
      ? activeMatch.terms_agreed_shipper
      : activeMatch.terms_agreed_traveler;

    await supabase.from('matches').update({
      [myField]: true,
      ...(otherAgreed ? { status: 'terms_agreed', deal_stage: 'terms_agreed' } : {})
    }).eq('id', activeMatch.id);

    const role = iAmTraveler ? 'TRAVELER' : 'SHIPPER';
    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id,
      sender_id: session.user.id,
      content: otherAgreed
        ? `✅ TERMS AGREED BY BOTH PARTIES: The deal is locked in. Shipper can now proceed with escrow payment.`
        : `✅ ${role} AGREED TO TERMS: Waiting for the ${iAmTraveler ? 'shipper' : 'traveler'} to also agree.`,
      is_read: false,
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);
    setActiveMatch(prev => ({
      ...prev,
      [myField]: true,
      ...(otherAgreed ? { status: 'terms_agreed', deal_stage: 'terms_agreed' } : {})
    }));
    setTimeout(scrollToBottom, 100);
  };

  // Traveler uploads proof photo after receiving item
  const uploadProof = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadingProof(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `proofs/${activeMatch.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('avatars').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const proofUrl = urlData.publicUrl;

      await supabase.from('matches').update({
        proof_photo_url: proofUrl,
        proof_uploaded_at: new Date().toISOString(),
        status: 'proof_uploaded',
        deal_stage: 'proof_uploaded',
      }).eq('id', activeMatch.id);

      const { data: msg } = await supabase.from('messages').insert([{
        match_id: activeMatch.id,
        sender_id: session.user.id,
        content: `📸 PROOF UPLOADED: ${proofUrl}`,
        is_read: false,
      }]).select();
      if (msg) setMessages(prev => [...prev, msg[0]]);
      setActiveMatch(prev => ({
        ...prev,
        proof_photo_url: proofUrl,
        status: 'proof_uploaded',
        deal_stage: 'proof_uploaded'
      }));
    } catch (e) {
      console.error('Proof upload error:', e);
    }
    setUploadingProof(false);
    setTimeout(scrollToBottom, 100);
  };

  const handleCompleteDeal = async () => {
    if (!activeMatch) return;
    const iAmTraveler = activeMatch.traveler_id === session.user.id;
    const myField = iAmTraveler ? 'traveler_completed' : 'shipper_completed';
    const otherDone = iAmTraveler
      ? activeMatch.shipper_completed
      : activeMatch.traveler_completed;

    if (!window.confirm(
      otherDone
        ? 'Confirm delivery and release escrow funds to the traveler?'
        : 'Confirm delivery on your side?'
    )) return;

    setSubmittingComplete(true);

    if (otherDone) {
      // Both confirmed — capture payment and release
      if (activeMatch.payment_intent_id) {
        const { data: { session: auth } } = await supabase.auth.getSession();
        await fetch(
          'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${auth.access_token}`,
            },
            body: JSON.stringify({
              action: 'capture_payment',
              data: {
                paymentIntentId: activeMatch.payment_intent_id,
                matchId: activeMatch.id,
              }
            })
          }
        );
      }

      await supabase.from('matches').update({
        status: 'completed',
        traveler_completed: true,
        shipper_completed: true,
        deal_stage: 'completed',
      }).eq('id', activeMatch.id);

      const dealValue = (activeMatch.flight?.price_per_kg || 0) *
        (activeMatch.request?.weight_kg || 0);
      let fetchrPct = 0.10;
      if (dealValue >= 500) fetchrPct = 0.07;
      else if (dealValue >= 200) fetchrPct = 0.085;
      else if (dealValue < 20) fetchrPct = 0.12;
      const travelerReceives = dealValue * (1 - fetchrPct);

      const { data: msg } = await supabase.from('messages').insert([{
        match_id: activeMatch.id,
        sender_id: session.user.id,
        content: `🎉 DEAL COMPLETED! Both parties confirmed delivery. $${travelerReceives.toFixed(2)} has been released to the traveler's wallet. Thank you for using Fetchr!`,
        is_read: false,
      }]).select();
      if (msg) setMessages(prev => [...prev, msg[0]]);

      setTimeout(() => {
        setAcceptedMatches(prev => prev.filter(m => m.id !== activeMatch.id));
        setActiveMatch(null);
        setMessages([]);
      }, 3000);

    } else {
      await supabase.from('matches').update({ [myField]: true }).eq('id', activeMatch.id);
      const role = iAmTraveler ? 'TRAVELER' : 'SHIPPER';
      const { data: msg } = await supabase.from('messages').insert([{
        match_id: activeMatch.id,
        sender_id: session.user.id,
        content: `⏳ DELIVERY CONFIRMED BY ${role}: Waiting for the ${iAmTraveler ? 'Shipper' : 'Traveler'} to also confirm.`,
        is_read: false,
      }]).select();
      if (msg) setMessages(prev => [...prev, msg[0]]);
      setActiveMatch(prev => ({ ...prev, [myField]: true }));
    }

    setSubmittingComplete(false);
  };

const requestCancellation = async () => {
    if (!cancelReason.trim()) return;
    setSubmittingCancel(true);

    // First close any old cancellation requests for this match
    await supabase.from('cancellation_requests')
      .update({ status: 'superseded' })
      .eq('match_id', activeMatch.id)
      .in('status', ['pending', 'rejected']);

    await supabase.from('cancellation_requests').insert([{
      match_id: activeMatch.id,
      requested_by: session.user.id,
      reason: cancelReason,
      status: 'pending',
    }]);

    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id,
      sender_id: session.user.id,
      content: `⚠️ CANCELLATION REQUEST: ${cancelReason}. Please respond to agree or decline.`,
      is_read: false,
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);
    await fetchCancelRequest(activeMatch.id);
    setShowCancelRequest(false);
    setCancelReason('');
    setSubmittingCancel(false);
    setTimeout(scrollToBottom, 100);
  };

  const agreeCancellation = async () => {
    if (!cancelRequest) return;
    setSubmittingCancel(true);
    const hasEscrow = ['in_escrow', 'proof_uploaded'].includes(activeMatch.status);

    if (hasEscrow && activeMatch.payment_intent_id) {
      const { data: { session: auth } } = await supabase.auth.getSession();
      await fetch(
        'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.access_token}`,
          },
          body: JSON.stringify({
            action: 'cancel_payment',
            data: {
              paymentIntentId: activeMatch.payment_intent_id,
              matchId: activeMatch.id,
            }
          })
        }
      );
    }

    await supabase.from('cancellation_requests')
      .update({ status: 'agreed' }).eq('id', cancelRequest.id);
    await supabase.from('matches').update({
      status: 'rejected',
      deal_stage: 'cancelled',
    }).eq('id', activeMatch.id);

    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id,
      sender_id: session.user.id,
      content: hasEscrow
        ? '✅ CANCELLATION AGREED: Deal cancelled. Escrow refunded automatically within 5-10 business days.'
        : '✅ CANCELLATION AGREED: Deal cancelled by mutual agreement.',
      is_read: false,
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);

    setTimeout(() => {
      setAcceptedMatches(prev => prev.filter(m => m.id !== activeMatch.id));
      setActiveMatch(null);
      setMessages([]);
      setCancelRequest(null);
    }, 2000);
    setSubmittingCancel(false);
  };

  const rejectCancellation = async () => {
    if (!cancelRequest) return;
    await supabase.from('cancellation_requests')
      .update({ status: 'rejected' }).eq('id', cancelRequest.id);
    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id,
      sender_id: session.user.id,
      content: '❌ CANCELLATION DECLINED: The deal continues as agreed.',
      is_read: false,
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);
    setCancelRequest(null);
  };

  // Initial load + real-time subscription for new accepted matches
useEffect(() => {
    fetchMatches();

    const userId = session.user.id;

    // Poll every 3 seconds while in messages — catches new accepted matches
    // for the party who accepted first and is waiting
    const pollInterval = setInterval(() => fetchMatches(), 3000);

    const sub = supabase.channel('messages-matches-listener')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
      }, (payload) => {
        const updated = payload.new;
        if (
          (updated.traveler_id === userId || updated.shipper_id === userId) &&
          ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'].includes(updated.status)
        ) {
          fetchMatches();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
      clearInterval(pollInterval);
    };
  }, []);

  useEffect(() => {
    if (activeMatch) {
      fetchMessages(activeMatch.id);
      fetchCancelRequest(activeMatch.id);
    }
  }, [activeMatch?.id]);

  // Real-time messages + match updates
  useEffect(() => {
    if (!activeMatch) return;
    const sub = supabase.channel(`messages:${activeMatch.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `match_id=eq.${activeMatch.id}`
      }, (payload) => {
        setMessages(prev =>
          prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new]
        );
        setTimeout(scrollToBottom, 100);
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
    return () => supabase.removeChannel(sub);
  }, [activeMatch?.id]);

  // Helpers
  const isTraveler = (match) => match?.traveler_id === session.user.id;
  const isShipper = (match) => match?.shipper_id === session.user.id;
  const getOtherParty = (match) => isTraveler(match) ? match.shipper : match.traveler;
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };
  const totalUnread = Object.values(unreadCounts).reduce((s, c) => s + c, 0);

  const getCurrentStage = (match) => {
    if (!match) return 'matched';
    const s = match.deal_stage || match.status || 'matched';
    if (s === 'accepted') return 'matched';
    return s;
  };

  const getStageIndex = (stage) => STAGES.findIndex(st => st.id === stage);

  const myTermsAgreed = activeMatch
    ? (isTraveler(activeMatch)
        ? activeMatch.terms_agreed_traveler
        : activeMatch.terms_agreed_shipper)
    : false;

  const otherTermsAgreed = activeMatch
    ? (isTraveler(activeMatch)
        ? activeMatch.terms_agreed_shipper
        : activeMatch.terms_agreed_traveler)
    : false;

  const myCompleted = activeMatch
    ? (isTraveler(activeMatch)
        ? activeMatch.traveler_completed
        : activeMatch.shipper_completed)
    : false;

  const otherCompleted = activeMatch
    ? (isTraveler(activeMatch)
        ? activeMatch.shipper_completed
        : activeMatch.traveler_completed)
    : false;

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
    <div className="flex h-[calc(100vh-120px)] bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden animate-fade-in">

      {/* ── Sidebar ── */}
      <div className={`${showSidebar ? 'w-64' : 'w-0'} border-r border-gray-100 flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden`}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-sm">Messages</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {acceptedMatches.length} active deal{acceptedMatches.length !== 1 ? 's' : ''}
            </p>
          </div>
          {totalUnread > 0 && (
            <span className="bg-violet-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {totalUnread}
            </span>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {acceptedMatches.map(match => {
            const other = getOtherParty(match);
            const unread = unreadCounts[match.id] || 0;
            const isActive = activeMatch?.id === match.id;
            const stage = getCurrentStage(match);
            const stageInfo = STAGES.find(s => s.id === stage) || STAGES[0];

            return (
              <button key={match.id}
                onClick={() => {
                  setActiveMatch(match);
                  setShowPayment(false);
                  setShowCancelRequest(false);
                }}
                className={`w-full text-left p-3.5 border-b border-gray-50 transition-all ${
                  isActive ? 'bg-violet-50' : 'hover:bg-gray-50'
                }`}>
                <div className="flex items-center gap-2.5">
                  <div className="relative flex-shrink-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${
                      isActive ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-600'
                    }`}>
                      {getInitials(other?.full_name)}
                    </div>
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 bg-violet-600 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-xs truncate ${
                        unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'
                      }`}>
                        {other?.full_name || 'User'}
                      </p>
                      <span className="text-sm flex-shrink-0">{stageInfo.icon}</span>
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

      {/* ── Chat area ── */}
      {activeMatch ? (
        <div className="flex-1 flex flex-col min-w-0">

          {/* Stage progress bar */}
          <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex-shrink-0">
            <div className="flex items-center justify-between gap-1 max-w-md mx-auto">
              {STAGES.map((stage, i) => {
                const currentIdx = getStageIndex(getCurrentStage(activeMatch));
                const isDone = i < currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <React.Fragment key={stage.id}>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                        isDone ? 'bg-emerald-500 text-white' :
                        isCurrent ? 'bg-violet-600 text-white' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                        {isDone ? '✓' : stage.icon}
                      </div>
                      <p className={`hidden sm:block text-center ${
                        isCurrent ? 'text-violet-600 font-bold' : 'text-gray-400'
                      }`} style={{ fontSize: '9px' }}>
                        {stage.label}
                      </p>
                    </div>
                    {i < STAGES.length - 1 && (
                      <div className={`flex-1 h-0.5 rounded-full transition-all ${
                        isDone ? 'bg-emerald-400' : 'bg-gray-200'
                      }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Chat header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <button onClick={() => setShowSidebar(!showSidebar)}
                className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-100 transition text-gray-400 flex-shrink-0">
                <ChevronDown size={14} className={`transition-transform ${showSidebar ? 'rotate-90' : '-rotate-90'}`} />
              </button>
              <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-600 flex-shrink-0">
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

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 flex-shrink-0">

              {/* Agree Terms — shown when status is accepted and not yet agreed */}
              {activeMatch.status === 'accepted' && !myTermsAgreed && (
                <button onClick={agreeToTerms}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition shadow-button">
                  <CheckCircle size={12} /> Agree Terms
                </button>
              )}

              {/* Pay Escrow — shipper only, after terms agreed */}
              {isShipper(activeMatch) && activeMatch.status === 'terms_agreed' && (
                <button onClick={() => { setShowPayment(!showPayment); setShowCancelRequest(false); }}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    showPayment ? 'bg-violet-100 text-violet-700' : 'btn-primary'
                  }`}>
                  <Shield size={12} /> Pay Escrow
                </button>
              )}

              {/* Upload Proof — traveler only, after escrow paid */}
              {isTraveler(activeMatch) && activeMatch.status === 'in_escrow' && (
                <>
                  <button onClick={() => proofInputRef.current?.click()}
                    disabled={uploadingProof}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50">
                    {uploadingProof
                      ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Camera size={12} />
                    }
                    Upload Proof
                  </button>
                  <input ref={proofInputRef} type="file" accept="image/*"
                    onChange={e => uploadProof(e.target.files?.[0])} className="hidden" />
                </>
              )}

              {/* Confirm Delivery — shown after proof uploaded */}
              {['proof_uploaded', 'in_escrow'].includes(activeMatch.status) && (
                <button onClick={handleCompleteDeal}
                  disabled={submittingComplete || myCompleted}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    myCompleted
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : otherCompleted
                        ? 'bg-emerald-500 text-white animate-pulse'
                        : 'bg-emerald-500 text-white hover:bg-emerald-600'
                  }`}>
                  <CheckCircle size={12} />
                  {myCompleted ? 'Waiting...' : otherCompleted ? 'Confirm & Release' : 'Confirm Delivery'}
                </button>
              )}

              {/* Cancel */}
              <button onClick={() => { setShowCancelRequest(!showCancelRequest); setShowPayment(false); }}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500 transition">
                <XCircle size={12} /> Cancel
              </button>
            </div>
          </div>

          {/* Deal info strip */}
          <div className="bg-violet-50/50 px-4 py-2 flex items-center gap-3 text-xs border-b border-violet-100/50 flex-shrink-0 flex-wrap">
            <span className="flex items-center gap-1 text-violet-700 font-medium">
              <Plane size={10} /> {activeMatch.flight?.from_code} → {activeMatch.flight?.to_code}
            </span>
            <span className="flex items-center gap-1 text-violet-700 font-medium">
              <Package size={10} /> {activeMatch.request?.weight_kg}kg · {activeMatch.request?.item_name}
            </span>
            <span className="flex items-center gap-1 text-violet-700 font-medium">
              <DollarSign size={10} /> ${activeMatch.flight?.price_per_kg}/kg
            </span>
            <span className={`ml-auto badge ${isTraveler(activeMatch) ? 'badge-blue' : 'badge-green'}`}>
              {isTraveler(activeMatch) ? '✈️ Traveler' : '📦 Shipper'}
            </span>
          </div>

          {/* Context-sensitive safety notice */}
          {activeMatch.status === 'accepted' && (
            <div className={`px-4 py-2.5 flex items-start gap-2 border-b flex-shrink-0 ${
              isTraveler(activeMatch)
                ? 'bg-amber-50/60 border-amber-100'
                : 'bg-blue-50/60 border-blue-100'
            }`}>
              <span className="text-sm flex-shrink-0 mt-0.5">
                {isTraveler(activeMatch) ? '⚠️' : 'ℹ️'}
              </span>
              <p className={`text-xs leading-relaxed ${
                isTraveler(activeMatch) ? 'text-amber-700' : 'text-blue-700'
              }`}>
                {activeMatch.request?.requires_purchase
                  ? isTraveler(activeMatch)
                    ? 'Only purchase the item once escrow is confirmed paid. This guarantees you will receive payment for the purchase and your service fee.'
                    : 'Once you agree terms and pay escrow, the traveler will purchase your item at the destination.'
                  : isTraveler(activeMatch)
                    ? 'Only accept the item from the shipper once escrow is confirmed paid. This guarantees you will receive payment for carrying it.'
                    : 'Hand the item to the traveler before their flight. Your payment is secured in escrow and released to the traveler once you both confirm delivery.'
                }
              </p>
            </div>
          )}

          {/* Terms status bar */}
          {activeMatch.status === 'accepted' && (
            <div className="bg-amber-50/50 px-4 py-2 flex items-center gap-4 text-xs border-b border-amber-100/50 flex-shrink-0">
              <p className="text-amber-700 font-semibold">Terms agreement:</p>
              <span className={`flex items-center gap-1 font-semibold ${
                activeMatch.terms_agreed_traveler ? 'text-emerald-600' : 'text-gray-300'
              }`}>
                {activeMatch.terms_agreed_traveler ? '✓' : '○'} Traveler
              </span>
              <span className={`flex items-center gap-1 font-semibold ${
                activeMatch.terms_agreed_shipper ? 'text-emerald-600' : 'text-gray-300'
              }`}>
                {activeMatch.terms_agreed_shipper ? '✓' : '○'} Shipper
              </span>
              <p className="text-amber-600 ml-auto text-right">
                {!myTermsAgreed
                  ? 'Click "Agree Terms" above to proceed'
                  : 'Waiting for other party...'
                }
              </p>
            </div>
          )}

          {/* Escrow payment panel */}
          {showPayment && isShipper(activeMatch) && activeMatch.status === 'terms_agreed' && (
            <div className="border-b border-gray-100 bg-gray-50/50 overflow-y-auto max-h-96 flex-shrink-0">
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

          {/* Cancel request form */}
          {showCancelRequest && !cancelRequest && (
            <div className="border-b border-red-100 bg-red-50/50 p-4 flex-shrink-0">
              <p className="text-sm font-bold text-red-700 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Request Cancellation
              </p>
              {['in_escrow', 'proof_uploaded'].includes(activeMatch.status) && (
                <p className="text-xs text-red-500 mb-2">
                  ⚠️ Escrow will be refunded automatically if both parties agree to cancel.
                </p>
              )}
              <textarea
                placeholder="Please explain the reason for cancellation..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                rows={2}
                className="input-field resize-none text-xs mb-2"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowCancelRequest(false)}
                  className="flex-1 btn-secondary py-2 text-xs">
                  Close
                </button>
                <button onClick={requestCancellation}
                  disabled={!cancelReason.trim() || submittingCancel}
                  className="flex-1 bg-red-500 text-white rounded-xl py-2 text-xs font-bold hover:bg-red-600 transition disabled:opacity-50">
                  {submittingCancel ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          )}

          {/* Incoming cancellation request */}
          {cancelRequest && cancelRequest.requested_by !== session.user.id && (
            <div className="border-b border-amber-100 bg-amber-50/50 p-4 flex-shrink-0">
              <p className="text-sm font-bold text-amber-700 mb-1 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Cancellation Requested
              </p>
              <p className="text-xs text-amber-600 mb-2">
                Reason: {cancelRequest.reason}
              </p>
              <div className="flex gap-2">
                <button onClick={rejectCancellation}
                  className="flex-1 btn-secondary py-2 text-xs">
                  Decline
                </button>
                <button onClick={agreeCancellation}
                  disabled={submittingCancel}
                  className="flex-1 bg-amber-500 text-white rounded-xl py-2 text-xs font-bold hover:bg-amber-600 transition disabled:opacity-50">
                  {submittingCancel ? 'Processing...' : 'Agree to Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => {
              const isMe = msg.sender_id === session.user.id;
              const isSystem =
                msg.content?.startsWith('🎉') ||
                msg.content?.startsWith('✅') ||
                msg.content?.startsWith('⏳') ||
                msg.content?.startsWith('⚠️') ||
                msg.content?.startsWith('❌') ||
                msg.content?.startsWith('🔒') ||
                msg.content?.startsWith('📸');

              // Proof image message
              if (msg.content?.startsWith('📸 PROOF UPLOADED:')) {
                const url = msg.content.replace('📸 PROOF UPLOADED: ', '');
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 max-w-xs text-center">
                      <p className="text-xs font-bold text-blue-700 mb-2">📸 Delivery Proof</p>
                      <a href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="Proof"
                          className="rounded-xl w-full h-36 object-cover hover:opacity-90 transition" />
                      </a>
                      <p className="text-xs text-blue-500 mt-1">Tap to view full size</p>
                    </div>
                  </div>
                );
              }

              // System message
              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-2.5 max-w-sm text-center">
                      <p className="text-xs text-gray-500 leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                );
              }

              // Regular message
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {!isMe && (
                    <div className="w-7 h-7 rounded-xl bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-600 flex-shrink-0 mr-2 mt-1">
                      {getInitials(msg.sender?.full_name)}
                    </div>
                  )}
                  <div className={`max-w-xs lg:max-w-sm flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMe
                        ? 'bg-violet-600 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}>
                      {msg.content}
                    </div>
                    <p className={`text-xs text-gray-400 mt-0.5 px-1 ${isMe ? 'text-right' : ''}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <div className="border-t border-gray-100 p-3 flex-shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Enter to send)"
                rows={1}
                className="flex-1 input-field resize-none py-2.5 text-sm min-h-[42px] max-h-24"
                onInput={e => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
                }}
              />
              <button onClick={sendMessage}
                disabled={!newMessage.trim() || sending}
                className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center hover:bg-violet-700 transition shadow-button disabled:opacity-50 flex-shrink-0">
                {sending
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Send size={16} className="text-white" />
                }
              </button>
            </div>
          </div>

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mb-4">
            <MessageCircle size={28} className="text-violet-300" />
          </div>
          <p className="text-gray-600 font-semibold mb-1">Select a conversation</p>
          <p className="text-gray-400 text-sm">Choose a deal from the sidebar to start chatting</p>
        </div>
      )}
    </div>
  );
};

export default Messages;