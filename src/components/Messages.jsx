import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Send, Package, Plane, DollarSign, CheckCircle, Shield,
  XCircle, AlertTriangle, ChevronDown, MessageCircle,
  Camera, Lock, Info, X, Edit2, ShoppingBag, MapPin, Phone
} from 'lucide-react';
import EscrowPayment from './EscrowPayment';

const STAGES = [
  { id: 'matched', label: 'Matched', icon: '🤝' },
  { id: 'terms_agreed', label: 'Terms Agreed', icon: '✅' },
  { id: 'in_escrow', label: 'Escrow Paid', icon: '🔒' },
  { id: 'proof_uploaded', label: 'Proof Uploaded', icon: '📸' },
  { id: 'completed', label: 'Completed', icon: '🎉' },
];

// ── Deal Details Modal ──
const DealDetailsModal = ({ match, session, onClose, onSaveAmendment }) => {
  const isTrav = match.traveler_id === session.user.id;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    agreed_price_per_kg: match.agreed_price_per_kg || match.flight?.price_per_kg || '',
    agreed_weight_kg: match.agreed_weight_kg || match.request?.weight_kg || '',
    agreed_notes: match.agreed_notes || '',
  });
  const [saving, setSaving] = useState(false);

  const pricePerKg = parseFloat(form.agreed_price_per_kg) || 0;
  const weightKg = parseFloat(form.agreed_weight_kg) || 0;
  const dealValue = pricePerKg * weightKg;
  let fetchrPct = 0.10;
  if (dealValue >= 500) fetchrPct = 0.07;
  else if (dealValue >= 200) fetchrPct = 0.085;
  else if (dealValue < 20 && dealValue > 0) fetchrPct = 0.12;
  const fetchrFee = dealValue * fetchrPct;
  const travelerReceives = dealValue - fetchrFee;
  const isPurchase = match.request?.requires_purchase;
  const purchasePrice = parseFloat(match.request?.purchase_price) || 0;
  const shopFee = parseFloat(match.flight?.shop_and_ship_fee) || 0;
  const totalShipperPays = dealValue + (isPurchase ? purchasePrice + shopFee : 0);

  const handleSave = async () => {
    setSaving(true);
    const updates = {
      agreed_price_per_kg: parseFloat(form.agreed_price_per_kg) || null,
      agreed_weight_kg: parseFloat(form.agreed_weight_kg) || null,
      agreed_notes: form.agreed_notes || null,
      terms_agreed_traveler: false,
      terms_agreed_shipper: false,
      status: 'accepted',
      deal_stage: 'matched',
    };
    await supabase.from('matches').update(updates).eq('id', match.id);
    await supabase.from('messages').insert([{
      match_id: match.id,
      sender_id: session.user.id,
      content: `✏️ DEAL AMENDED by ${isTrav ? 'Traveler' : 'Shipper'}: Price $${form.agreed_price_per_kg}/kg · Weight ${form.agreed_weight_kg}kg${form.agreed_notes ? ` · Notes: ${form.agreed_notes}` : ''}. Both parties need to re-agree to terms.`,
      is_read: false,
    }]);
    onSaveAmendment(updates);
    setEditing(false);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
          <h3 className="font-bold text-gray-900">Deal Details</h3>
          <div className="flex items-center gap-2">
            {!editing && match.status === 'accepted' && (
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-50 text-violet-600 hover:bg-violet-100 transition">
                <Edit2 size={12} /> Amend
              </button>
            )}
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition">
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* Route */}
          <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
            <p className="text-xs font-bold text-violet-700 mb-3 flex items-center gap-1.5">
              <Plane size={13} /> Flight Route
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">From</p>
                <p className="font-bold text-gray-900">{match.flight?.from_city} ({match.flight?.from_code})</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">To</p>
                <p className="font-bold text-gray-900">{match.flight?.to_city} ({match.flight?.to_code})</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Airline</p>
                <p className="font-semibold text-gray-700">{match.flight?.airline}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Date</p>
                <p className="font-semibold text-gray-700">
                  {match.flight?.flight_date
                    ? new Date(match.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Item */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5">
              <Package size={13} /> Shipment Details
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Item</p>
                <p className="font-bold text-gray-900">{match.request?.item_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Category</p>
                <p className="font-semibold text-gray-700">{match.request?.category}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Weight</p>
                <p className="font-bold text-gray-900">{match.agreed_weight_kg || match.request?.weight_kg}kg</p>
              </div>
              {match.request?.item_dimensions && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Dimensions</p>
                  <p className="font-semibold text-gray-700">{match.request.item_dimensions}</p>
                </div>
              )}
            </div>
            {match.request?.description && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-400 mb-1">Description</p>
                <p className="text-sm text-gray-600">{match.request.description}</p>
              </div>
            )}
          </div>

          {/* Shop & Ship */}
          {isPurchase && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-xs font-bold text-blue-700 mb-3 flex items-center gap-1.5">
                <ShoppingBag size={13} /> Shop & Ship Details
              </p>
              <div className="space-y-2 text-sm">
                {match.request?.purchase_store && (
                  <div className="flex items-start gap-2">
                    <MapPin size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-400">Store</p>
                      <p className="font-semibold text-gray-700">{match.request.purchase_store}</p>
                    </div>
                  </div>
                )}
                {match.request?.purchase_price && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Item purchase price</span>
                    <span className="font-bold text-gray-800">${parseFloat(match.request.purchase_price).toFixed(2)}</span>
                  </div>
                )}
                {match.request?.purchase_url && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Product link</p>
                    <a href={match.request.purchase_url} target="_blank" rel="noreferrer"
                      className="text-xs text-violet-600 underline break-all">{match.request.purchase_url}</a>
                  </div>
                )}
                {match.request?.purchase_details && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Specifications</p>
                    <p className="text-xs text-gray-600">{match.request.purchase_details}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Handover details */}
          {(match.flight?.handover_location_departure || match.flight?.handover_location_arrival || match.request?.trusted_person_name) && (
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
              <p className="text-xs font-bold text-indigo-700 mb-3 flex items-center gap-1.5">
                <MapPin size={13} /> Handover Details
              </p>
              <div className="space-y-2 text-sm">
                {match.flight?.handover_location_departure && (
                  <div>
                    <p className="text-xs text-gray-400">Departure handover</p>
                    <p className="font-semibold text-gray-700">{match.flight.handover_location_departure}</p>
                  </div>
                )}
                {match.flight?.handover_location_arrival && (
                  <div>
                    <p className="text-xs text-gray-400">Arrival handover</p>
                    <p className="font-semibold text-gray-700">{match.flight.handover_location_arrival}</p>
                  </div>
                )}
                {match.request?.trusted_person_name && (
                  <div className="pt-2 border-t border-indigo-200 space-y-1">
                    <p className="text-xs font-bold text-indigo-600">Handover contact</p>
                    <p className="text-sm font-semibold text-gray-800">{match.request.trusted_person_name}</p>
                    {match.request.trusted_person_phone && (
                      <p className="text-xs text-gray-600 flex items-center gap-1">
                        <Phone size={11} /> {match.request.trusted_person_phone}
                      </p>
                    )}
                    {match.request.trusted_person_location && (
                      <p className="text-xs text-gray-600 flex items-center gap-1">
                        <MapPin size={11} /> {match.request.trusted_person_location}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Financials / Amend */}
          {editing ? (
            <div className="bg-white rounded-xl border-2 border-violet-200 p-4 space-y-3">
              <p className="text-xs font-bold text-violet-700 mb-1">Amend Deal Terms</p>
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5 border border-amber-100">
                ⚠️ Amending resets both parties' agreement. You will both need to re-agree to terms.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Price/kg ($)</label>
                  <input type="number" min="0" step="0.5"
                    value={form.agreed_price_per_kg}
                    onChange={e => setForm({ ...form, agreed_price_per_kg: e.target.value })}
                    className="input-field py-2.5" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Weight (kg)</label>
                  <input type="number" min="0" step="0.1"
                    value={form.agreed_weight_kg}
                    onChange={e => setForm({ ...form, agreed_weight_kg: e.target.value })}
                    className="input-field py-2.5" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Notes</label>
                <textarea rows={2} placeholder="Any agreed conditions..."
                  value={form.agreed_notes}
                  onChange={e => setForm({ ...form, agreed_notes: e.target.value })}
                  className="input-field resize-none py-2.5 text-sm" />
              </div>
              {form.agreed_price_per_kg && form.agreed_weight_kg && (
                <div className="bg-violet-50 rounded-xl p-3 text-xs border border-violet-100">
                  <div className="flex justify-between font-bold text-violet-700">
                    <span>New deal value</span>
                    <span>${(parseFloat(form.agreed_price_per_kg) * parseFloat(form.agreed_weight_kg)).toFixed(2)}</span>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-[2] btn-primary py-2.5 text-sm disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save & Notify Other Party'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-4 border border-violet-100">
              <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                <DollarSign size={13} /> Financial Summary
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>{match.agreed_weight_kg || match.request?.weight_kg}kg × ${match.agreed_price_per_kg || match.flight?.price_per_kg}/kg</span>
                  <span className="font-semibold">${dealValue.toFixed(2)}</span>
                </div>
                {isPurchase && purchasePrice > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Item purchase price</span>
                    <span className="font-semibold">${purchasePrice.toFixed(2)}</span>
                  </div>
                )}
                {isPurchase && shopFee > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Shop & ship service fee</span>
                    <span className="font-semibold">${shopFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-red-400 text-xs">
                  <span>Fetchr fee ({Math.round(fetchrPct * 100)}%) — from traveler's share</span>
                  <span>−${fetchrFee.toFixed(2)}</span>
                </div>
                <div className="border-t border-violet-200 pt-2 space-y-1">
                  <div className="flex justify-between font-bold text-violet-700">
                    <span>Shipper pays total</span>
                    <span>${totalShipperPays.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-600">
                    <span>Traveler receives</span>
                    <span>${travelerReceives.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              {match.agreed_notes && (
                <div className="mt-3 pt-3 border-t border-violet-200">
                  <p className="text-xs text-gray-400 mb-1">Agreed notes</p>
                  <p className="text-xs text-gray-600 italic">"{match.agreed_notes}"</p>
                </div>
              )}
            </div>
          )}

          <button onClick={onClose} className="w-full btn-secondary py-3">Close</button>
        </div>
      </div>
    </div>
  );
};

// ── Main Messages Component ──
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
  const [showDealDetails, setShowDealDetails] = useState(false);
  const messagesEndRef = useRef(null);
  const proofInputRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchMatches = async () => {
    const { data } = await supabase
      .from('matches')
      .select(`*, flight:flights(*), request:shipment_requests(*),
        traveler:profiles!matches_traveler_id_fkey(*),
        shipper:profiles!matches_shipper_id_fkey(*)`)
      .or(`traveler_id.eq.${session.user.id},shipper_id.eq.${session.user.id}`)
      .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      setAcceptedMatches(data);
      setActiveMatch(prev => {
        if (!prev) return data[0];
        const still = data.find(m => m.id === prev.id);
        return still ? { ...prev, ...still } : data[0];
      });
      await fetchUnreadCounts(data);
    }
    return data || [];
  };

  useEffect(() => {
    let cancelled = false;
    const userId = session.user.id;

    // Retry loop — no fast-exit count check, just retry until data arrives
    // This handles the race condition where navigation happens before DB write commits
    const loadWithRetry = async () => {
      setLoading(true);
      for (let i = 0; i < 15; i++) {
        if (cancelled) return;
        const { data } = await supabase
          .from('matches')
          .select(`*, flight:flights(*), request:shipment_requests(*),
            traveler:profiles!matches_traveler_id_fkey(*),
            shipper:profiles!matches_shipper_id_fkey(*)`)
          .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
          .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
          .order('created_at', { ascending: false });

        if (data && data.length > 0) {
          setAcceptedMatches(data);
          setActiveMatch(data[0]);
          await fetchUnreadCounts(data);
          if (!cancelled) setLoading(false);
          return;
        }
        await new Promise(r => setTimeout(r, 600));
      }
      // Retries exhausted — genuinely no active conversations
      if (!cancelled) setLoading(false);
    };

    loadWithRetry();

    // Poll every 3 seconds to catch status changes
    const pollInterval = setInterval(async () => {
      if (cancelled) return;
      const { data } = await supabase
        .from('matches')
        .select(`*, flight:flights(*), request:shipment_requests(*),
          traveler:profiles!matches_traveler_id_fkey(*),
          shipper:profiles!matches_shipper_id_fkey(*)`)
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
        .order('created_at', { ascending: false });

      if (!data || cancelled) return;
      if (data.length > 0) {
        setAcceptedMatches(data);
        setActiveMatch(prev => {
          if (!prev) return data[0];
          const still = data.find(m => m.id === prev.id);
          return still ? { ...prev, ...still } : data[0];
        });
        await fetchUnreadCounts(data);
      }
    }, 3000);

    // Realtime subscription
    const sub = supabase.channel(`messages-main-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          const u = payload.new;
          if (
            (u.traveler_id === userId || u.shipper_id === userId) &&
            ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'].includes(u.status)
          ) {
            fetchMatches();
          }
        })
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      supabase.removeChannel(sub);
    };
  }, []);

  useEffect(() => {
    if (activeMatch) {
      fetchMessages(activeMatch.id);
      fetchCancelRequest(activeMatch.id);
    }
  }, [activeMatch?.id]);

  useEffect(() => {
    if (!activeMatch) return;
    const sub = supabase.channel(`messages:${activeMatch.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `match_id=eq.${activeMatch.id}`
      }, (payload) => {
        setMessages(prev =>
          prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new]
        );
        setTimeout(scrollToBottom, 100);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
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
      await supabase.rpc('mark_messages_read', { p_match_id: matchId, p_user_id: session.user.id });
    } catch (e) {}
    setUnreadCounts(prev => ({ ...prev, [matchId]: 0 }));
  };

  const fetchCancelRequest = async (matchId) => {
    const { data } = await supabase.from('cancellation_requests')
      .select('*').eq('match_id', matchId).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
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

  const agreeToTerms = async () => {
    const iAmTraveler = activeMatch.traveler_id === session.user.id;
    const myField = iAmTraveler ? 'terms_agreed_traveler' : 'terms_agreed_shipper';
    const otherAgreed = iAmTraveler ? activeMatch.terms_agreed_shipper : activeMatch.terms_agreed_traveler;
    await supabase.from('matches').update({
      [myField]: true,
      ...(otherAgreed ? { status: 'terms_agreed', deal_stage: 'terms_agreed' } : {})
    }).eq('id', activeMatch.id);
    const role = iAmTraveler ? 'TRAVELER' : 'SHIPPER';
    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: otherAgreed
        ? `✅ TERMS AGREED BY BOTH PARTIES: The deal is locked in. Shipper can now proceed with escrow payment.`
        : `✅ ${role} AGREED TO TERMS: Waiting for the ${iAmTraveler ? 'shipper' : 'traveler'} to also agree.`,
      is_read: false,
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);
    setActiveMatch(prev => ({
      ...prev, [myField]: true,
      ...(otherAgreed ? { status: 'terms_agreed', deal_stage: 'terms_agreed' } : {})
    }));
    setTimeout(scrollToBottom, 100);
  };

  const uploadProof = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadingProof(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `proofs/${activeMatch.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const proofUrl = urlData.publicUrl;
      await supabase.from('matches').update({
        proof_photo_url: proofUrl, proof_uploaded_at: new Date().toISOString(),
        status: 'proof_uploaded', deal_stage: 'proof_uploaded',
      }).eq('id', activeMatch.id);
      const { data: msg } = await supabase.from('messages').insert([{
        match_id: activeMatch.id, sender_id: session.user.id,
        content: `📸 PROOF UPLOADED: ${proofUrl}`, is_read: false,
      }]).select();
      if (msg) setMessages(prev => [...prev, msg[0]]);
      setActiveMatch(prev => ({ ...prev, proof_photo_url: proofUrl, status: 'proof_uploaded', deal_stage: 'proof_uploaded' }));
    } catch (e) { console.error('Proof upload error:', e); }
    setUploadingProof(false);
    setTimeout(scrollToBottom, 100);
  };

  const handleCompleteDeal = async () => {
    if (!activeMatch) return;
    const iAmTraveler = activeMatch.traveler_id === session.user.id;
    const myField = iAmTraveler ? 'traveler_completed' : 'shipper_completed';
    const otherDone = iAmTraveler ? activeMatch.shipper_completed : activeMatch.traveler_completed;
    if (!window.confirm(otherDone ? 'Confirm delivery and release escrow funds to the traveler?' : 'Confirm delivery on your side?')) return;
    setSubmittingComplete(true);
    if (otherDone) {
      if (activeMatch.payment_intent_id) {
        const { data: { session: auth } } = await supabase.auth.getSession();
        await fetch('https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.access_token}` },
          body: JSON.stringify({ action: 'capture_payment', data: { paymentIntentId: activeMatch.payment_intent_id, matchId: activeMatch.id } })
        });
      }
      await supabase.from('matches').update({
        status: 'completed', traveler_completed: true, shipper_completed: true, deal_stage: 'completed',
      }).eq('id', activeMatch.id);
      const dealValue = (activeMatch.agreed_price_per_kg || activeMatch.flight?.price_per_kg || 0) *
        (activeMatch.agreed_weight_kg || activeMatch.request?.weight_kg || 0);
      let fetchrPct = 0.10;
      if (dealValue >= 500) fetchrPct = 0.07;
      else if (dealValue >= 200) fetchrPct = 0.085;
      else if (dealValue < 20) fetchrPct = 0.12;
      const travelerReceives = dealValue * (1 - fetchrPct);
      const { data: msg } = await supabase.from('messages').insert([{
        match_id: activeMatch.id, sender_id: session.user.id,
        content: `🎉 DEAL COMPLETED! Both parties confirmed delivery. $${travelerReceives.toFixed(2)} has been released to the traveler's wallet. Thank you for using Fetchr!`,
        is_read: false,
      }]).select();
      if (msg) setMessages(prev => [...prev, msg[0]]);
      setTimeout(() => { setAcceptedMatches(prev => prev.filter(m => m.id !== activeMatch.id)); setActiveMatch(null); setMessages([]); }, 3000);
    } else {
      await supabase.from('matches').update({ [myField]: true }).eq('id', activeMatch.id);
      const role = iAmTraveler ? 'TRAVELER' : 'SHIPPER';
      const { data: msg } = await supabase.from('messages').insert([{
        match_id: activeMatch.id, sender_id: session.user.id,
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
    await supabase.from('cancellation_requests').update({ status: 'superseded' })
      .eq('match_id', activeMatch.id).in('status', ['pending', 'rejected']);
    await supabase.from('cancellation_requests').insert([{
      match_id: activeMatch.id, requested_by: session.user.id, reason: cancelReason, status: 'pending',
    }]);
    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: `⚠️ CANCELLATION REQUEST: ${cancelReason}. Please respond to agree or decline.`, is_read: false,
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);
    await fetchCancelRequest(activeMatch.id);
    setShowCancelRequest(false); setCancelReason(''); setSubmittingCancel(false);
    setTimeout(scrollToBottom, 100);
  };

  const agreeCancellation = async () => {
    if (!cancelRequest) return;
    setSubmittingCancel(true);
    const hasEscrow = ['in_escrow', 'proof_uploaded'].includes(activeMatch.status);
    if (hasEscrow && activeMatch.payment_intent_id) {
      const { data: { session: auth } } = await supabase.auth.getSession();
      await fetch('https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.access_token}` },
        body: JSON.stringify({ action: 'cancel_payment', data: { paymentIntentId: activeMatch.payment_intent_id, matchId: activeMatch.id } })
      });
    }
    await supabase.from('cancellation_requests').update({ status: 'agreed' }).eq('id', cancelRequest.id);
    await supabase.from('matches').update({ status: 'rejected', deal_stage: 'cancelled' }).eq('id', activeMatch.id);
    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: hasEscrow
        ? '✅ CANCELLATION AGREED: Deal cancelled. Escrow refunded automatically within 5-10 business days.'
        : '✅ CANCELLATION AGREED: Deal cancelled by mutual agreement.',
      is_read: false,
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);
    setTimeout(() => { setAcceptedMatches(prev => prev.filter(m => m.id !== activeMatch.id)); setActiveMatch(null); setMessages([]); setCancelRequest(null); }, 2000);
    setSubmittingCancel(false);
  };

  const rejectCancellation = async () => {
    if (!cancelRequest) return;
    await supabase.from('cancellation_requests').update({ status: 'rejected' }).eq('id', cancelRequest.id);
    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: '❌ CANCELLATION DECLINED: The deal continues as agreed.', is_read: false,
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);
    setCancelRequest(null);
  };

  const isTraveler = (match) => match?.traveler_id === session.user.id;
  const isShipper = (match) => match?.shipper_id === session.user.id;
  const getOtherParty = (match) => isTraveler(match) ? match.shipper : match.traveler;
  const getInitials = (name) => { if (!name) return '?'; return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); };
  const totalUnread = Object.values(unreadCounts).reduce((s, c) => s + c, 0);
  const getCurrentStage = (match) => { if (!match) return 'matched'; const s = match.deal_stage || match.status || 'matched'; if (s === 'accepted') return 'matched'; return s; };
  const getStageIndex = (stage) => STAGES.findIndex(st => st.id === stage);
  const myTermsAgreed = activeMatch ? (isTraveler(activeMatch) ? activeMatch.terms_agreed_traveler : activeMatch.terms_agreed_shipper) : false;
  const myCompleted = activeMatch ? (isTraveler(activeMatch) ? activeMatch.traveler_completed : activeMatch.shipper_completed) : false;
  const otherCompleted = activeMatch ? (isTraveler(activeMatch) ? activeMatch.shipper_completed : activeMatch.traveler_completed) : false;

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

      {showDealDetails && activeMatch && (
        <DealDetailsModal match={activeMatch} session={session}
          onClose={() => setShowDealDetails(false)}
          onSaveAmendment={(updates) => { setActiveMatch(prev => ({ ...prev, ...updates })); setShowDealDetails(false); fetchMessages(activeMatch.id); }} />
      )}

      {/* Sidebar */}
      <div className={`${showSidebar ? 'w-64' : 'w-0'} border-r border-gray-100 flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden`}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-sm">Messages</h2>
            <p className="text-xs text-gray-400 mt-0.5">{acceptedMatches.length} active deal{acceptedMatches.length !== 1 ? 's' : ''}</p>
          </div>
          {totalUnread > 0 && (
            <span className="bg-violet-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{totalUnread}</span>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {acceptedMatches.map(match => {
            const other = getOtherParty(match);
            const unread = unreadCounts[match.id] || 0;
            const isActive = activeMatch?.id === match.id;
            const stageInfo = STAGES.find(s => s.id === getCurrentStage(match)) || STAGES[0];
            return (
              <button key={match.id}
                onClick={() => { setActiveMatch(match); setShowPayment(false); setShowCancelRequest(false); }}
                className={`w-full text-left p-3.5 border-b border-gray-50 transition-all ${isActive ? 'bg-violet-50' : 'hover:bg-gray-50'}`}>
                <div className="flex items-center gap-2.5">
                  <div className="relative flex-shrink-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${isActive ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-600'}`}>
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
                      <p className={`text-xs truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{other?.full_name || 'User'}</p>
                      <span className="text-sm flex-shrink-0">{stageInfo.icon}</span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{match.flight?.from_code} → {match.flight?.to_code} · {match.request?.item_name}</p>
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

          {/* Stage bar */}
          <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex-shrink-0">
            <div className="flex items-center justify-between gap-1 max-w-md mx-auto">
              {STAGES.map((stage, i) => {
                const currentIdx = getStageIndex(getCurrentStage(activeMatch));
                const isDone = i < currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <React.Fragment key={stage.id}>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${isDone ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        {isDone ? '✓' : stage.icon}
                      </div>
                      <p className={`hidden sm:block text-center ${isCurrent ? 'text-violet-600 font-bold' : 'text-gray-400'}`} style={{ fontSize: '9px' }}>{stage.label}</p>
                    </div>
                    {i < STAGES.length - 1 && <div className={`flex-1 h-0.5 rounded-full transition-all ${isDone ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
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
                <p className="font-bold text-gray-900 text-sm truncate">{getOtherParty(activeMatch)?.full_name || 'User'}</p>
                <p className="text-xs text-gray-400 truncate">{activeMatch.flight?.from_code} → {activeMatch.flight?.to_code} · {activeMatch.request?.item_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Deal details — always visible */}
              <button onClick={() => setShowDealDetails(true)}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold bg-violet-50 text-violet-600 hover:bg-violet-100 transition">
                <Info size={12} /> Deal
              </button>

              {/* Agree Terms */}
              {activeMatch.status === 'accepted' && !myTermsAgreed && (
                <button onClick={agreeToTerms}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition shadow-button">
                  <CheckCircle size={12} /> Agree Terms
                </button>
              )}

              {/* Pay Escrow — SHIPPER ONLY */}
              {isShipper(activeMatch) && activeMatch.status === 'terms_agreed' && (
                <button onClick={() => { setShowPayment(!showPayment); setShowCancelRequest(false); }}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all ${showPayment ? 'bg-violet-100 text-violet-700' : 'btn-primary'}`}>
                  <Shield size={12} /> Pay Escrow
                </button>
              )}

              {/* Upload Proof — traveler only */}
              {isTraveler(activeMatch) && activeMatch.status === 'in_escrow' && (
                <>
                  <button onClick={() => proofInputRef.current?.click()} disabled={uploadingProof}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50">
                    {uploadingProof ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={12} />}
                    Upload Proof
                  </button>
                  <input ref={proofInputRef} type="file" accept="image/*" onChange={e => uploadProof(e.target.files?.[0])} className="hidden" />
                </>
              )}

              {/* Confirm Delivery */}
              {['proof_uploaded', 'in_escrow'].includes(activeMatch.status) && (
                <button onClick={handleCompleteDeal} disabled={submittingComplete || myCompleted}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    myCompleted ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : otherCompleted ? 'bg-emerald-500 text-white animate-pulse'
                      : 'bg-emerald-500 text-white hover:bg-emerald-600'
                  }`}>
                  <CheckCircle size={12} />
                  {myCompleted ? 'Waiting...' : otherCompleted ? 'Confirm & Release' : 'Confirm Delivery'}
                </button>
              )}

              <button onClick={() => { setShowCancelRequest(!showCancelRequest); setShowPayment(false); }}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500 transition">
                <XCircle size={12} /> Cancel
              </button>
            </div>
          </div>

          {/* Safety notice */}
          {activeMatch.status === 'accepted' && (
            <div className={`px-4 py-2.5 flex items-start gap-2 border-b flex-shrink-0 ${isTraveler(activeMatch) ? 'bg-amber-50/60 border-amber-100' : 'bg-blue-50/60 border-blue-100'}`}>
              <span className="text-sm flex-shrink-0 mt-0.5">{isTraveler(activeMatch) ? '⚠️' : 'ℹ️'}</span>
              <p className={`text-xs leading-relaxed ${isTraveler(activeMatch) ? 'text-amber-700' : 'text-blue-700'}`}>
                {activeMatch.request?.requires_purchase
                  ? isTraveler(activeMatch) ? 'Only purchase the item once escrow is confirmed paid.' : 'Once you agree terms and pay escrow, the traveler will purchase your item at the destination.'
                  : isTraveler(activeMatch) ? 'Only accept the item from the shipper once escrow is confirmed paid.' : 'Hand the item to the traveler before their flight. Your payment is secured in escrow until both parties confirm delivery.'
                }
              </p>
            </div>
          )}

          {/* Terms status */}
          {activeMatch.status === 'accepted' && (
            <div className="bg-amber-50/50 px-4 py-2 flex items-center gap-4 text-xs border-b border-amber-100/50 flex-shrink-0">
              <p className="text-amber-700 font-semibold">Terms:</p>
              <span className={`flex items-center gap-1 font-semibold ${activeMatch.terms_agreed_traveler ? 'text-emerald-600' : 'text-gray-300'}`}>
                {activeMatch.terms_agreed_traveler ? '✓' : '○'} Traveler
              </span>
              <span className={`flex items-center gap-1 font-semibold ${activeMatch.terms_agreed_shipper ? 'text-emerald-600' : 'text-gray-300'}`}>
                {activeMatch.terms_agreed_shipper ? '✓' : '○'} Shipper
              </span>
              <p className="text-amber-600 ml-auto text-right">{!myTermsAgreed ? 'Click "Agree Terms" to proceed' : 'Waiting for other party...'}</p>
            </div>
          )}

          {/* Escrow pending notice */}
          {activeMatch.status === 'terms_agreed' && (
            <div className={`px-4 py-2.5 flex items-start gap-2 border-b flex-shrink-0 ${isShipper(activeMatch) ? 'bg-violet-50/60 border-violet-100' : 'bg-blue-50/60 border-blue-100'}`}>
              <Shield size={14} className={`flex-shrink-0 mt-0.5 ${isShipper(activeMatch) ? 'text-violet-500' : 'text-blue-500'}`} />
              <p className={`text-xs leading-relaxed ${isShipper(activeMatch) ? 'text-violet-700' : 'text-blue-700'}`}>
                {isShipper(activeMatch)
                  ? '💳 Both parties agreed to terms. Please pay escrow to secure the deal.'
                  : '⏳ Terms agreed! Waiting for the shipper to pay escrow. You will be notified once secured.'}
              </p>
            </div>
          )}

          {/* Escrow panel — SHIPPER ONLY */}
          {showPayment && isShipper(activeMatch) && activeMatch.status === 'terms_agreed' && (
            <div className="border-b border-gray-100 bg-gray-50/50 overflow-y-auto max-h-96 flex-shrink-0">
              <EscrowPayment match={activeMatch} session={session}
                onPaymentComplete={async () => { setShowPayment(false); await fetchMatches(); if (activeMatch) await fetchMessages(activeMatch.id); }} />
            </div>
          )}

          {/* Cancel form */}
          {showCancelRequest && !cancelRequest && (
            <div className="border-b border-red-100 bg-red-50/50 p-4 flex-shrink-0">
              <p className="text-sm font-bold text-red-700 mb-2 flex items-center gap-1.5"><AlertTriangle size={14} /> Request Cancellation</p>
              {['in_escrow', 'proof_uploaded'].includes(activeMatch.status) && (
                <p className="text-xs text-red-500 mb-2">⚠️ Escrow will be refunded automatically if both parties agree.</p>
              )}
              <textarea placeholder="Please explain the reason..." value={cancelReason}
                onChange={e => setCancelReason(e.target.value)} rows={2} className="input-field resize-none text-xs mb-2" />
              <div className="flex gap-2">
                <button onClick={() => setShowCancelRequest(false)} className="flex-1 btn-secondary py-2 text-xs">Close</button>
                <button onClick={requestCancellation} disabled={!cancelReason.trim() || submittingCancel}
                  className="flex-1 bg-red-500 text-white rounded-xl py-2 text-xs font-bold hover:bg-red-600 transition disabled:opacity-50">
                  {submittingCancel ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          )}

          {/* Incoming cancel */}
          {cancelRequest && cancelRequest.requested_by !== session.user.id && (
            <div className="border-b border-amber-100 bg-amber-50/50 p-4 flex-shrink-0">
              <p className="text-sm font-bold text-amber-700 mb-1 flex items-center gap-1.5"><AlertTriangle size={14} /> Cancellation Requested</p>
              <p className="text-xs text-amber-600 mb-2">Reason: {cancelRequest.reason}</p>
              <div className="flex gap-2">
                <button onClick={rejectCancellation} className="flex-1 btn-secondary py-2 text-xs">Decline</button>
                <button onClick={agreeCancellation} disabled={submittingCancel}
                  className="flex-1 bg-amber-500 text-white rounded-xl py-2 text-xs font-bold hover:bg-amber-600 transition disabled:opacity-50">
                  {submittingCancel ? 'Processing...' : 'Agree to Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => {
              const isMe = msg.sender_id === session.user.id;
              const isSystem = msg.content?.startsWith('🎉') || msg.content?.startsWith('✅') ||
                msg.content?.startsWith('⏳') || msg.content?.startsWith('⚠️') ||
                msg.content?.startsWith('❌') || msg.content?.startsWith('🔒') ||
                msg.content?.startsWith('📸') || msg.content?.startsWith('✏️');

              if (msg.content?.startsWith('📸 PROOF UPLOADED:')) {
                const url = msg.content.replace('📸 PROOF UPLOADED: ', '');
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 max-w-xs text-center">
                      <p className="text-xs font-bold text-blue-700 mb-2">📸 Delivery Proof</p>
                      <a href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="Proof" className="rounded-xl w-full h-36 object-cover hover:opacity-90 transition" />
                      </a>
                      <p className="text-xs text-blue-500 mt-1">Tap to view full size</p>
                    </div>
                  </div>
                );
              }
              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-2.5 max-w-sm text-center">
                      <p className="text-xs text-gray-500 leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {!isMe && (
                    <div className="w-7 h-7 rounded-xl bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-600 flex-shrink-0 mr-2 mt-1">
                      {getInitials(msg.sender?.full_name)}
                    </div>
                  )}
                  <div className={`max-w-xs lg:max-w-sm flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${isMe ? 'bg-violet-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-800 rounded-bl-md'}`}>
                      {msg.content}
                    </div>
                    <p className={`text-xs text-gray-400 mt-0.5 px-1 ${isMe ? 'text-right' : ''}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3 flex-shrink-0">
            <div className="flex items-end gap-2">
              <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown} placeholder="Type a message... (Enter to send)"
                rows={1} className="flex-1 input-field resize-none py-2.5 text-sm min-h-[42px] max-h-24"
                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'; }} />
              <button onClick={sendMessage} disabled={!newMessage.trim() || sending}
                className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center hover:bg-violet-700 transition shadow-button disabled:opacity-50 flex-shrink-0">
                {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={16} className="text-white" />}
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