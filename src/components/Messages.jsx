import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Send, Package, Plane, DollarSign, CheckCircle, Shield,
  XCircle, AlertTriangle, Clock, MessageCircle, Edit2,
  Upload, Camera, FileText, ChevronDown
} from 'lucide-react';
import EscrowPayment from './EscrowPayment';

const DEAL_STAGES = {
  matched: { label: 'Terms Negotiation', color: 'bg-amber-50 border-amber-200 text-amber-700', step: 1 },
  terms_agreed: { label: 'Awaiting Escrow', color: 'bg-blue-50 border-blue-200 text-blue-700', step: 2 },
  in_escrow: { label: 'Escrow Active', color: 'bg-violet-50 border-violet-200 text-violet-700', step: 3 },
  proof_uploaded: { label: 'Proof Submitted', color: 'bg-indigo-50 border-indigo-200 text-indigo-700', step: 4 },
  completed: { label: 'Completed', color: 'bg-emerald-50 border-emerald-200 text-emerald-700', step: 5 },
};

const Messages = ({ session }) => {
  const [acceptedMatches, setAcceptedMatches] = useState([]);
  const [activeMatch, setActiveMatch] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCancelRequest, setShowCancelRequest] = useState(false);
  const [showRenegotiate, setShowRenegotiate] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRequest, setCancelRequest] = useState(null);
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [submittingComplete, setSubmittingComplete] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [showSidebar, setShowSidebar] = useState(true);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [renegotiateForm, setRenegotiateForm] = useState({
    price_per_kg: '', weight_kg: '', notes: ''
  });
  const messagesEndRef = useRef(null);
  const proofInputRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchMatches = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .select(`*, flight:flights(*), request:shipment_requests(*),
        traveler:profiles!matches_traveler_id_fkey(*),
        shipper:profiles!matches_shipper_id_fkey(*)`)
      .or(`traveler_id.eq.${session.user.id},shipper_id.eq.${session.user.id}`)
      .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
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
    const { data } = await supabase.from('messages')
      .select(`*, sender:profiles!messages_sender_id_fkey(*)`)
      .eq('match_id', matchId).order('created_at', { ascending: true });
    if (data) setMessages(data);
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
    const { data } = await supabase.from('messages')
      .insert([{ match_id: activeMatch.id, sender_id: session.user.id, content, is_read: false }]).select();
    if (data) { setMessages(prev => [...prev, data[0]]); setTimeout(scrollToBottom, 100); }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Stage 2: Both agree on terms
  const agreeToTerms = async () => {
    const iAmTraveler = activeMatch.traveler_id === session.user.id;
    const myField = iAmTraveler ? 'terms_agreed_traveler' : 'terms_agreed_shipper';
    const otherAgreed = iAmTraveler ? activeMatch.terms_agreed_shipper : activeMatch.terms_agreed_traveler;

    const newStatus = otherAgreed ? 'terms_agreed' : activeMatch.status;
    await supabase.from('matches').update({
      [myField]: true,
      status: newStatus,
      agreed_price_per_kg: activeMatch.agreed_price_per_kg || activeMatch.flight?.price_per_kg,
      agreed_weight_kg: activeMatch.agreed_weight_kg || activeMatch.request?.weight_kg,
    }).eq('id', activeMatch.id);

    const role = iAmTraveler ? 'Traveler' : 'Shipper';
    let msg = '';
    if (otherAgreed) {
      msg = `✅ TERMS AGREED: Both parties have agreed to the deal terms. Shipper can now pay the escrow to activate the deal.\n\n📋 Agreed Terms:\n• Route: ${activeMatch.flight?.from_code} → ${activeMatch.flight?.to_code}\n• Item: ${activeMatch.request?.item_name}\n• Weight: ${activeMatch.agreed_weight_kg || activeMatch.request?.weight_kg}kg\n• Price: $${activeMatch.agreed_price_per_kg || activeMatch.flight?.price_per_kg}/kg\n• Total: $${((activeMatch.agreed_weight_kg || activeMatch.request?.weight_kg) * (activeMatch.agreed_price_per_kg || activeMatch.flight?.price_per_kg)).toFixed(2)}`;
    } else {
      msg = `🤝 ${role} has agreed to the current deal terms. Waiting for ${iAmTraveler ? 'Shipper' : 'Traveler'} to also agree.`;
    }

    const { data: msgData } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id, content: msg, is_read: false
    }]).select();
    if (msgData) setMessages(prev => [...prev, msgData[0]]);
    await fetchMatches();
    setTimeout(scrollToBottom, 100);
  };

  // Renegotiate terms
  const proposeRenegotiation = async () => {
    if (!renegotiateForm.price_per_kg && !renegotiateForm.weight_kg && !renegotiateForm.notes) return;
    const iAmTraveler = activeMatch.traveler_id === session.user.id;

    // Reset agreement flags
    await supabase.from('matches').update({
      terms_agreed_traveler: false,
      terms_agreed_shipper: false,
      status: 'accepted',
      agreed_price_per_kg: renegotiateForm.price_per_kg ? parseFloat(renegotiateForm.price_per_kg) : activeMatch.agreed_price_per_kg,
      agreed_weight_kg: renegotiateForm.weight_kg ? parseFloat(renegotiateForm.weight_kg) : activeMatch.agreed_weight_kg,
      agreed_notes: renegotiateForm.notes || activeMatch.agreed_notes,
    }).eq('id', activeMatch.id);

    const role = iAmTraveler ? 'Traveler' : 'Shipper';
    let changes = [];
    if (renegotiateForm.price_per_kg) changes.push(`Price: $${renegotiateForm.price_per_kg}/kg`);
    if (renegotiateForm.weight_kg) changes.push(`Weight: ${renegotiateForm.weight_kg}kg`);
    if (renegotiateForm.notes) changes.push(`Note: ${renegotiateForm.notes}`);

    const { data: msgData } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: `🔄 AMENDMENT PROPOSED by ${role}:\n${changes.join('\n')}\n\nPlease review and agree to the updated terms.`,
      is_read: false
    }]).select();
    if (msgData) setMessages(prev => [...prev, msgData[0]]);
    setShowRenegotiate(false);
    setRenegotiateForm({ price_per_kg: '', weight_kg: '', notes: '' });
    await fetchMatches();
    setTimeout(scrollToBottom, 100);
  };

  // Stage 4: Traveler uploads proof
  const uploadProof = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.includes('pdf')) {
      alert('Please upload an image or PDF.'); return;
    }
    setUploadingProof(true);
    const ext = file.name.split('.').pop();
    const path = `proof/${activeMatch.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (upErr) { alert('Upload failed: ' + upErr.message); setUploadingProof(false); return; }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);

    await supabase.from('matches').update({
      proof_photo_url: urlData.publicUrl,
      proof_uploaded_at: new Date().toISOString(),
      status: 'proof_uploaded',
      deal_stage: 'proof_uploaded',
    }).eq('id', activeMatch.id);

    const { data: msgData } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: `📸 PROOF UPLOADED: The traveler has uploaded proof of obtaining the item. Please review and confirm the handover when ready.\n\n[View proof in deal details]`,
      is_read: false
    }]).select();
    if (msgData) setMessages(prev => [...prev, msgData[0]]);

    // Also send the image as a message
    const { data: imgMsg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: `PROOF_IMAGE:${urlData.publicUrl}`,
      is_read: false
    }]).select();
    if (imgMsg) setMessages(prev => [...prev, imgMsg[0]]);

    await fetchMatches();
    setUploadingProof(false);
    setTimeout(scrollToBottom, 100);
  };

  // Stage 5: Complete deal
  const handleCompleteDeal = async () => {
    if (!activeMatch) return;
    if (activeMatch.status !== 'proof_uploaded' && activeMatch.status !== 'in_escrow') {
      alert('Please wait for the traveler to upload proof before completing the deal.'); return;
    }
    const iAmTraveler = activeMatch.traveler_id === session.user.id;
    const myField = iAmTraveler ? 'traveler_completed' : 'shipper_completed';
    const otherDone = iAmTraveler ? activeMatch.shipper_completed : activeMatch.traveler_completed;

    if (!window.confirm(otherDone
      ? 'Both parties have confirmed. Release escrow funds to the traveler?'
      : 'Confirm delivery on your side? Deal closes once both confirm.')) return;

    setSubmittingComplete(true);

    if (otherDone) {
      // Release escrow to traveler wallet
      const subtotal = (activeMatch.agreed_price_per_kg || activeMatch.flight?.price_per_kg || 0) *
                       (activeMatch.agreed_weight_kg || activeMatch.request?.weight_kg || 0);
      let fetchrPct = 0.10;
      if (subtotal >= 500) fetchrPct = 0.07;
      else if (subtotal >= 200) fetchrPct = 0.085;
      else if (subtotal < 20) fetchrPct = 0.12;
      const travelerReceives = subtotal * (1 - fetchrPct);

      const { data: tp } = await supabase.from('profiles').select('wallet_balance').eq('id', activeMatch.traveler_id).single();
      if (tp) {
        await supabase.from('profiles').update({ wallet_balance: (tp.wallet_balance || 0) + travelerReceives }).eq('id', activeMatch.traveler_id);
      }

      await supabase.from('matches').update({
        status: 'completed', deal_stage: 'completed',
        traveler_completed: true, shipper_completed: true,
      }).eq('id', activeMatch.id);

      await supabase.rpc('expire_old_flights');

      const { data: msgData } = await supabase.from('messages').insert([{
        match_id: activeMatch.id, sender_id: session.user.id,
        content: `✅ DEAL COMPLETED: Both parties confirmed the handover. $${travelerReceives.toFixed(2)} has been credited to the traveler's Fetchr wallet. Thank you for using Fetchr! 🎉`,
        is_read: false
      }]).select();
      if (msgData) setMessages(prev => [...prev, msgData[0]]);

      setTimeout(() => {
        setAcceptedMatches(prev => prev.filter(m => m.id !== activeMatch.id));
        setActiveMatch(null); setMessages([]);
      }, 2000);
    } else {
      await supabase.from('matches').update({ [myField]: true }).eq('id', activeMatch.id);
      const role = iAmTraveler ? 'TRAVELER' : 'SHIPPER';
      const { data: msgData } = await supabase.from('messages').insert([{
        match_id: activeMatch.id, sender_id: session.user.id,
        content: `⏳ HANDOVER CONFIRMED BY ${role}: Waiting for the ${iAmTraveler ? 'Shipper' : 'Traveler'} to also confirm.`,
        is_read: false
      }]).select();
      if (msgData) setMessages(prev => [...prev, msgData[0]]);
      setActiveMatch(prev => ({ ...prev, [myField]: true }));
    }
    setSubmittingComplete(false);
    await fetchMatches();
  };

  const requestCancellation = async () => {
    if (!cancelReason.trim()) return;
    setSubmittingCancel(true);
    await supabase.from('cancellation_requests').insert([{
      match_id: activeMatch.id, requested_by: session.user.id, reason: cancelReason, status: 'pending'
    }]);
    const { data: msgData } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: `⚠️ CANCELLATION REQUEST: Reason: ${cancelReason}. Please respond to agree or decline.`, is_read: false
    }]).select();
    if (msgData) setMessages(prev => [...prev, msgData[0]]);
    await fetchCancelRequest(activeMatch.id);
    setShowCancelRequest(false); setCancelReason(''); setSubmittingCancel(false);
    setTimeout(scrollToBottom, 100);
  };

  const agreeCancellation = async () => {
    if (!cancelRequest) return;
    setSubmittingCancel(true);
    const hasEscrow = activeMatch.status === 'in_escrow' || activeMatch.status === 'proof_uploaded';

    if (hasEscrow && activeMatch.escrow_amount) {
      // Refund to shipper wallet
      const { data: sp } = await supabase.from('profiles').select('wallet_balance').eq('id', activeMatch.shipper_id).single();
      if (sp) await supabase.from('profiles').update({ wallet_balance: (sp.wallet_balance || 0) + activeMatch.escrow_amount }).eq('id', activeMatch.shipper_id);
    }

    await supabase.from('cancellation_requests').update({ status: 'agreed' }).eq('id', cancelRequest.id);
    await supabase.from('matches').update({
      status: 'pending', deal_stage: 'matched',
      traveler_accepted: false, shipper_accepted: false,
      traveler_completed: false, shipper_completed: false,
      terms_agreed_traveler: false, terms_agreed_shipper: false,
      cancel_requested_by: null, cancel_agreed: false,
      refund_status: hasEscrow ? 'refunded' : null
    }).eq('id', activeMatch.id);

    const { data: msgData } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: hasEscrow
        ? '✅ CANCELLATION AGREED: Deal cancelled. Escrow refunded to shipper wallet.'
        : '✅ CANCELLATION AGREED: Deal cancelled by mutual agreement.',
      is_read: false
    }]).select();
    if (msgData) setMessages(prev => [...prev, msgData[0]]);
    setAcceptedMatches(prev => prev.filter(m => m.id !== activeMatch.id));
    setActiveMatch(null); setMessages([]); setCancelRequest(null); setSubmittingCancel(false);
  };

  const rejectCancellation = async () => {
    if (!cancelRequest) return;
    await supabase.from('cancellation_requests').update({ status: 'rejected' }).eq('id', cancelRequest.id);
    const { data: msgData } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: '❌ CANCELLATION DECLINED: The deal continues as agreed.', is_read: false
    }]).select();
    if (msgData) setMessages(prev => [...prev, msgData[0]]);
    setCancelRequest(null);
  };

  useEffect(() => { fetchMatches(); }, []);
  useEffect(() => {
    if (activeMatch) {
      fetchMessages(activeMatch.id);
      fetchCancelRequest(activeMatch.id);
      setRenegotiateForm({
        price_per_kg: activeMatch.agreed_price_per_kg?.toString() || activeMatch.flight?.price_per_kg?.toString() || '',
        weight_kg: activeMatch.agreed_weight_kg?.toString() || activeMatch.request?.weight_kg?.toString() || '',
        notes: activeMatch.agreed_notes || '',
      });
    }
  }, [activeMatch]);

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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.new.sender_id !== session.user.id && activeMatch?.id !== payload.new.match_id) {
          setUnreadCounts(prev => ({ ...prev, [payload.new.match_id]: (prev[payload.new.match_id] || 0) + 1 }));
        }
      }).subscribe();
    return () => supabase.removeChannel(sub);
  }, [activeMatch]);

  const isTraveler = (match) => match?.traveler_id === session.user.id;
  const isShipper = (match) => match?.shipper_id === session.user.id;
  const getOtherParty = (match) => isTraveler(match) ? match.shipper : match.traveler;
  const getInitials = (name) => { if (!name) return '?'; return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); };
  const totalUnread = Object.values(unreadCounts).reduce((s, c) => s + c, 0);

  const getDealStage = (match) => {
    if (!match) return null;
    if (match.status === 'proof_uploaded') return DEAL_STAGES.proof_uploaded;
    if (match.status === 'in_escrow') return DEAL_STAGES.in_escrow;
    if (match.status === 'terms_agreed') return DEAL_STAGES.terms_agreed;
    return DEAL_STAGES.matched;
  };

  const getMyTermsAgreed = (match) => isTraveler(match) ? match.terms_agreed_traveler : match.terms_agreed_shipper;
  const getOtherTermsAgreed = (match) => isTraveler(match) ? match.terms_agreed_shipper : match.terms_agreed_traveler;

  const getCurrentTerms = (match) => ({
    price: match.agreed_price_per_kg || match.flight?.price_per_kg || 0,
    weight: match.agreed_weight_kg || match.request?.weight_kg || 0,
    total: ((match.agreed_price_per_kg || match.flight?.price_per_kg || 0) * (match.agreed_weight_kg || match.request?.weight_kg || 0)),
  });

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
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
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
            const stage = getDealStage(match);
            const isActive = activeMatch?.id === match.id;
            return (
              <button key={match.id}
                onClick={() => { setActiveMatch(match); setShowPayment(false); setShowCancelRequest(false); setShowRenegotiate(false); }}
                className={`w-full text-left p-4 border-b border-gray-50 transition-all ${isActive ? 'bg-violet-50' : 'hover:bg-gray-50'}`}>
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${isActive ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-600'}`}>
                      {getInitials(other?.full_name)}
                    </div>
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 bg-violet-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                      {other?.full_name || 'User'}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {match.flight?.from_code} → {match.flight?.to_code}
                    </p>
                    {stage && (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md mt-1 ${stage.color}`}>
                        Step {stage.step}/5 · {stage.label}
                      </span>
                    )}
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

          {/* Header */}
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
                <p className="font-bold text-gray-900 text-sm">{getOtherParty(activeMatch)?.full_name || 'User'}</p>
                <p className="text-xs text-gray-400 truncate">
                  {activeMatch.flight?.from_code} → {activeMatch.flight?.to_code} · {activeMatch.request?.item_name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => { setShowCancelRequest(!showCancelRequest); setShowPayment(false); setShowRenegotiate(false); }}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500 transition-all">
                <XCircle size={12} /> Cancel
              </button>
            </div>
          </div>

          {/* Deal Progress Bar */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
            <div className="flex items-center gap-1 mb-2">
              {Object.entries(DEAL_STAGES).map(([key, stage], i) => {
                const currentStep = getDealStage(activeMatch)?.step || 1;
                const isDone = stage.step < currentStep;
                const isActive = stage.step === currentStep;
                return (
                  <React.Fragment key={key}>
                    <div className={`flex items-center gap-1.5 ${i > 0 ? 'flex-1' : ''}`}>
                      {i > 0 && <div className={`flex-1 h-0.5 rounded-full ${isDone ? 'bg-violet-400' : 'bg-gray-200'}`} />}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isDone ? 'bg-emerald-500 text-white' :
                        isActive ? 'bg-violet-600 text-white' :
                        'bg-gray-200 text-gray-400'
                      }`}>
                        {isDone ? '✓' : stage.step}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600">
                Stage {getDealStage(activeMatch)?.step}/5 — {getDealStage(activeMatch)?.label}
              </p>
              <span className={`badge text-xs ${getDealStage(activeMatch)?.color}`}>
                {isTraveler(activeMatch) ? '✈️ Traveler' : '📦 Shipper'}
              </span>
            </div>
          </div>

          {/* Current Terms Panel — shown in negotiation stage */}
          {(activeMatch.status === 'accepted' || activeMatch.status === 'terms_agreed') && (
            <div className="border-b border-gray-100 bg-white flex-shrink-0">
              <div className="p-4">
                {/* Terms display */}
                <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Current Deal Terms</p>
                    {activeMatch.status === 'accepted' && (
                      <button onClick={() => setShowRenegotiate(!showRenegotiate)}
                        className="flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700 transition">
                        <Edit2 size={11} /> Amend
                      </button>
                    )}
                  </div>
                  {(() => {
                    const terms = getCurrentTerms(activeMatch);
                    return (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-white rounded-lg p-2 text-center border border-gray-100">
                          <p className="text-gray-400 mb-0.5">Price/kg</p>
                          <p className="font-bold text-gray-900">${terms.price}</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center border border-gray-100">
                          <p className="text-gray-400 mb-0.5">Weight</p>
                          <p className="font-bold text-gray-900">{terms.weight}kg</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center border border-gray-100">
                          <p className="text-gray-400 mb-0.5">Total</p>
                          <p className="font-bold text-violet-700">${terms.total.toFixed(2)}</p>
                        </div>
                      </div>
                    );
                  })()}
                  {activeMatch.agreed_notes && (
                    <p className="text-xs text-gray-500 italic mt-2">"{activeMatch.agreed_notes}"</p>
                  )}
                </div>

                {/* Renegotiate form */}
                {showRenegotiate && activeMatch.status === 'accepted' && (
                  <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-100 mb-3">
                    <p className="text-xs font-bold text-amber-700 mb-3">Propose Amendment</p>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">New Price/kg ($)</label>
                        <input type="number" placeholder={renegotiateForm.price_per_kg}
                          value={renegotiateForm.price_per_kg}
                          onChange={e => setRenegotiateForm({ ...renegotiateForm, price_per_kg: e.target.value })}
                          className="input-field py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">New Weight (kg)</label>
                        <input type="number" placeholder={renegotiateForm.weight_kg}
                          value={renegotiateForm.weight_kg}
                          onChange={e => setRenegotiateForm({ ...renegotiateForm, weight_kg: e.target.value })}
                          className="input-field py-2 text-sm" />
                      </div>
                    </div>
                    <input type="text" placeholder="Add a note about the amendment..."
                      value={renegotiateForm.notes}
                      onChange={e => setRenegotiateForm({ ...renegotiateForm, notes: e.target.value })}
                      className="input-field py-2 text-sm mb-2" />
                    <div className="flex gap-2">
                      <button onClick={() => setShowRenegotiate(false)}
                        className="flex-1 btn-secondary py-2 text-xs">Cancel</button>
                      <button onClick={proposeRenegotiation}
                        className="flex-1 btn-primary py-2 text-xs">Send Proposal</button>
                    </div>
                  </div>
                )}

                {/* Agreement buttons */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span className={`text-xs font-semibold flex items-center gap-1 ${activeMatch.terms_agreed_traveler ? 'text-emerald-600' : 'text-gray-300'}`}>
                      {activeMatch.terms_agreed_traveler ? '✓' : '○'} Traveler
                    </span>
                    <span className={`text-xs font-semibold flex items-center gap-1 ${activeMatch.terms_agreed_shipper ? 'text-emerald-600' : 'text-gray-300'}`}>
                      {activeMatch.terms_agreed_shipper ? '✓' : '○'} Shipper
                    </span>
                  </div>
                  {!getMyTermsAgreed(activeMatch) ? (
                    <button onClick={agreeToTerms}
                      className="btn-primary px-4 py-2 text-xs flex items-center gap-1.5">
                      <CheckCircle size={13} /> Agree to Terms
                    </button>
                  ) : (
                    <span className="badge badge-green text-xs">
                      <CheckCircle size={10} /> You agreed
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Escrow Payment Panel */}
          {showPayment && isShipper(activeMatch) && activeMatch.status === 'terms_agreed' && (
            <div className="border-b border-gray-100 bg-gray-50/50 overflow-y-auto max-h-96 flex-shrink-0">
              <EscrowPayment match={activeMatch} session={session}
                onPaymentComplete={async () => {
                  setShowPayment(false);
                  await fetchMatches();
                  if (activeMatch) await fetchMessages(activeMatch.id);
                }} />
            </div>
          )}

          {/* Escrow CTA for shipper when terms agreed */}
          {activeMatch.status === 'terms_agreed' && isShipper(activeMatch) && !showPayment && (
            <div className="border-b border-violet-100 bg-violet-50/50 p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-violet-700">✅ Terms agreed — pay escrow to activate deal</p>
                  <p className="text-xs text-violet-500 mt-0.5">Funds held securely until delivery confirmed</p>
                </div>
                <button onClick={() => setShowPayment(true)}
                  className="btn-primary flex items-center gap-1.5 text-xs px-4 py-2.5">
                  <Shield size={13} /> Pay Escrow
                </button>
              </div>
            </div>
          )}

          {/* Terms agreed — waiting for shipper */}
          {activeMatch.status === 'terms_agreed' && isTraveler(activeMatch) && (
            <div className="border-b border-blue-100 bg-blue-50/50 p-3 flex-shrink-0">
              <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <Clock size={13} /> Terms agreed — waiting for shipper to pay escrow
              </p>
            </div>
          )}

          {/* Proof upload CTA — traveler only, escrow active */}
          {(activeMatch.status === 'in_escrow') && isTraveler(activeMatch) && (
            <div className="border-b border-indigo-100 bg-indigo-50/50 p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-indigo-700">Upload proof of item</p>
                  <p className="text-xs text-indigo-500 mt-0.5">Photo of item + receipt if applicable</p>
                </div>
                <button onClick={() => proofInputRef.current?.click()} disabled={uploadingProof}
                  className="btn-primary flex items-center gap-1.5 text-xs px-4 py-2.5 disabled:opacity-50">
                  {uploadingProof
                    ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
                    : <><Upload size={13} /> Upload Proof</>
                  }
                </button>
                <input ref={proofInputRef} type="file" accept="image/*,.pdf" onChange={uploadProof} className="hidden" />
              </div>
            </div>
          )}

          {/* Proof uploaded — shipper sees this */}
          {activeMatch.status === 'proof_uploaded' && isShipper(activeMatch) && activeMatch.proof_photo_url && (
            <div className="border-b border-emerald-100 bg-emerald-50/50 p-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <img src={activeMatch.proof_photo_url} alt="Proof"
                  className="w-16 h-16 rounded-xl object-cover border border-emerald-200 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-emerald-700">Traveler uploaded proof</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    {activeMatch.proof_uploaded_at ? new Date(activeMatch.proof_uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
                <a href={activeMatch.proof_photo_url} target="_blank" rel="noreferrer"
                  className="btn-secondary text-xs py-2 px-3">View</a>
              </div>
            </div>
          )}

          {/* Complete deal — both sides after proof */}
          {(activeMatch.status === 'proof_uploaded' || activeMatch.status === 'in_escrow') && (
            <div className="border-b border-gray-100 bg-white px-4 py-2.5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3 text-xs">
                <span className={`flex items-center gap-1 font-semibold ${activeMatch.traveler_completed ? 'text-emerald-600' : 'text-gray-300'}`}>
                  {activeMatch.traveler_completed ? '✓' : '○'} Traveler confirmed
                </span>
                <span className={`flex items-center gap-1 font-semibold ${activeMatch.shipper_completed ? 'text-emerald-600' : 'text-gray-300'}`}>
                  {activeMatch.shipper_completed ? '✓' : '○'} Shipper confirmed
                </span>
              </div>
              {(() => {
                const myDone = isTraveler(activeMatch) ? activeMatch.traveler_completed : activeMatch.shipper_completed;
                const otherDone = isTraveler(activeMatch) ? activeMatch.shipper_completed : activeMatch.traveler_completed;
                return !myDone ? (
                  <button onClick={handleCompleteDeal} disabled={submittingComplete}
                    className={`btn-primary text-xs px-4 py-2 flex items-center gap-1.5 ${otherDone ? 'animate-pulse' : ''}`}>
                    <CheckCircle size={13} />
                    {otherDone ? 'Confirm & Release Escrow' : 'Confirm Handover'}
                  </button>
                ) : (
                  <span className="badge badge-yellow"><Clock size={10} /> Waiting for other party</span>
                );
              })()}
            </div>
          )}

          {/* Cancel form */}
          {showCancelRequest && !cancelRequest && (
            <div className="border-b border-red-100 bg-red-50/50 p-4 flex-shrink-0">
              <p className="text-sm font-bold text-red-700 mb-1 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Request Cancellation
              </p>
              {(activeMatch.status === 'in_escrow' || activeMatch.status === 'proof_uploaded') && (
                <p className="text-xs text-red-500 mb-2">⚠️ Escrow will be refunded to shipper wallet if both agree.</p>
              )}
              <textarea placeholder="Explain your reason..." value={cancelReason}
                onChange={e => setCancelReason(e.target.value)} rows={2}
                className="input-field mb-2 resize-none" />
              <div className="flex gap-2">
                <button onClick={() => { setShowCancelRequest(false); setCancelReason(''); }}
                  className="flex-1 btn-secondary py-2 text-xs">Never mind</button>
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
              <p className="text-xs text-amber-600 mb-3">"{cancelRequest.reason}"</p>
              <div className="flex gap-2">
                <button onClick={rejectCancellation} disabled={submittingCancel}
                  className="flex-1 btn-secondary py-2 text-xs">Decline</button>
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

              // Proof image message
              if (msg.content?.startsWith('PROOF_IMAGE:')) {
                const url = msg.content.replace('PROOF_IMAGE:', '');
                return (
                  <div key={i} className="flex justify-center">
                    <div className="max-w-xs bg-indigo-50 rounded-2xl p-3 border border-indigo-100 text-center">
                      <p className="text-xs font-semibold text-indigo-600 mb-2 flex items-center justify-center gap-1">
                        <Camera size={12} /> Proof of Item
                      </p>
                      <a href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="Proof" className="w-full rounded-xl object-cover max-h-48 hover:opacity-90 transition" />
                      </a>
                      <p className="text-xs text-indigo-400 mt-1">Tap to view full size</p>
                    </div>
                  </div>
                );
              }

              // System messages
              const isSystem = msg.content?.startsWith('⚠️') || msg.content?.startsWith('✅') ||
                msg.content?.startsWith('❌') || msg.content?.startsWith('🎉') ||
                msg.content?.startsWith('⏳') || msg.content?.startsWith('💰') ||
                msg.content?.startsWith('🤝') || msg.content?.startsWith('🔄') ||
                msg.content?.startsWith('📸') || msg.content?.startsWith('📋');

              if (isSystem) return (
                <div key={i} className="flex justify-center">
                  <div className="max-w-sm bg-gray-100 text-gray-600 text-xs px-4 py-2.5 rounded-2xl text-center leading-relaxed border border-gray-200/50 whitespace-pre-line">
                    {msg.content}
                  </div>
                </div>
              );

              return (
                <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                    isMe ? 'bg-violet-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-800 rounded-bl-md border border-gray-200/50'
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
                onKeyDown={handleKeyDown} placeholder="Type a message..."
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 focus:bg-white transition-all" />
              <button onClick={sendMessage} disabled={sending || !newMessage.trim()}
                className="w-11 h-11 bg-violet-600 rounded-xl flex items-center justify-center hover:bg-violet-700 transition-all shadow-button disabled:opacity-50 flex-shrink-0">
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