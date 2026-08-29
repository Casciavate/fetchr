import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Send, Package, Plane, DollarSign, CheckCircle, Shield,
  XCircle, AlertTriangle, ChevronDown, ChevronLeft, MessageCircle,
  Camera, Lock, Info, X, Edit2, ShoppingBag, MapPin, Phone,
  Circle, Zap
} from 'lucide-react';
import EscrowPayment, { ProofUploadModal, calcFees } from './EscrowPayment';
import StatusPill from './shared/StatusPill';
import SkeletonList from './shared/Skeleton';
import VerificationBadge from './shared/VerificationBadge';

const STAGES = [
  { id: 'matched', label: 'Matched', icon: Zap },
  { id: 'terms_agreed', label: 'Terms agreed', icon: CheckCircle },
  { id: 'in_escrow', label: 'Escrow paid', icon: Lock },
  { id: 'proof_uploaded', label: 'Proof uploaded', icon: Camera },
  { id: 'completed', label: 'Delivered', icon: CheckCircle },
];

// System messages are inserted by the app itself (never typed by a user).
// Both the legacy emoji-prefixed strings (already in the DB) and the current
// plain-text prefixes are recognised, so old rows keep rendering correctly.
const SYSTEM_MSG_PREFIXES = [
  'Match accepted', 'Terms agreed', 'Deal amended', 'Deal completed', 'Delivery confirmed by',
  'Cancellation request:', 'Cancellation agreed:', 'Cancellation declined:',
  'Proof uploaded:', '🎉', '✅', '⏳', '⚠️', '❌', '🔒', '📸', '✏️',
];
const isSystemMessage = (content) => SYSTEM_MSG_PREFIXES.some(p => content?.startsWith(p));

// Deal-event styling for system messages — a tone + icon per event family,
// mirroring the handoff's DealEvent card instead of a plain grey bubble.
const getSystemEventStyle = (content) => {
  if (content?.startsWith('Deal amended') || content?.startsWith('✏️')) return { icon: Edit2, tone: 'neutral' };
  if (content?.startsWith('Deal completed') || content?.startsWith('Delivery confirmed by') || content?.startsWith('🎉'))
    return { icon: CheckCircle, tone: 'success' };
  if (content?.startsWith('Match accepted') || content?.startsWith('Terms agreed') || content?.startsWith('✅'))
    return { icon: CheckCircle, tone: 'success' };
  if (content?.startsWith('Cancellation request:') || content?.startsWith('⚠️'))
    return { icon: AlertTriangle, tone: 'warning' };
  if (content?.startsWith('Cancellation agreed:') || content?.startsWith('Cancellation declined:') || content?.startsWith('❌'))
    return { icon: XCircle, tone: 'danger' };
  if (content?.startsWith('🔒')) return { icon: Lock, tone: 'success' };
  if (content?.startsWith('⏳')) return { icon: Circle, tone: 'neutral' };
  return { icon: Info, tone: 'neutral' };
};

const EVENT_TONE_CLASSES = {
  neutral: 'bg-ink-100 text-ink-700',
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-danger',
};

// ── Deal Details Modal ──
const DealDetailsModal = ({ match, session, onClose, onSaveAmendment }) => {
  const isTrav = match.traveler_id === session.user.id;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    agreed_price_per_kg: match.agreed_price_per_kg || match.flight?.price_per_kg || '',
    agreed_weight_kg: match.agreed_weight_kg || match.request?.weight_kg || '',
    agreed_notes: match.agreed_notes || '',
    agreed_shop_fee: match.agreed_shop_fee || match.flight?.shop_and_ship_fee || '',
  });
  const [saving, setSaving] = useState(false);

  const pricePerKg = parseFloat(form.agreed_price_per_kg) || 0;
  const weightKg = parseFloat(form.agreed_weight_kg) || 0;
  const dealValue = pricePerKg * weightKg;
  const isPurchase = match.request?.requires_purchase;
  const purchasePrice = parseFloat(match.request?.purchase_price) || 0;
  const shopFee = parseFloat(form.agreed_shop_fee || match.agreed_shop_fee || match.flight?.shop_and_ship_fee) || 0;
  // Fetchr fee on transport + shop fee ONLY, not purchase price
  const fetchrBase = dealValue + (isPurchase ? shopFee : 0);
  let fetchrPct = 0.10;
  if (fetchrBase >= 500) fetchrPct = 0.07;
  else if (fetchrBase >= 200) fetchrPct = 0.085;
  else if (fetchrBase < 20 && fetchrBase > 0) fetchrPct = 0.12;
  const fetchrFee = fetchrBase * fetchrPct;
  const travelerReceives = fetchrBase - fetchrFee + (isPurchase ? purchasePrice : 0);
  const totalShipperPays = dealValue + (isPurchase ? shopFee + purchasePrice : 0);

  const handleSave = async () => {
    setSaving(true);
    const updates = {
      agreed_price_per_kg: parseFloat(form.agreed_price_per_kg) || null,
      agreed_weight_kg: parseFloat(form.agreed_weight_kg) || null,
      agreed_notes: form.agreed_notes || null,
      agreed_shop_fee: isPurchase ? (parseFloat(form.agreed_shop_fee) || null) : null,
      terms_agreed_traveler: false,
      terms_agreed_shipper: false,
      status: 'accepted',
      deal_stage: 'matched',
    };
    await supabase.from('matches').update(updates).eq('id', match.id);
    await supabase.from('messages').insert([{
      match_id: match.id,
      sender_id: session.user.id,
      content: `Deal amended by the ${isTrav ? 'traveller' : 'sender'}: price $${form.agreed_price_per_kg}/kg · weight ${form.agreed_weight_kg}kg${form.agreed_notes ? ` · notes: ${form.agreed_notes}` : ''}. Both parties need to re-agree to terms.`,
      is_read: false,
    }]);
    onSaveAmendment(updates);
    setEditing(false);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-[var(--scrim)] z-modal flex items-end md:items-center justify-center p-4">
      <div className="bg-surface-raised rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-elev-3">
        <div className="sticky top-0 bg-surface-raised border-b border-line px-5 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="font-display font-bold text-title-s text-ink-900">Deal details</h3>
          <div className="flex items-center gap-2">
            {!editing && match.status === 'accepted' && (
              <button onClick={() => setEditing(true)} className="btn-secondary px-3 text-label">
                <Edit2 size={12} /> Amend
              </button>
            )}
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-sunken transition">
              <X size={18} className="text-ink-500" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* Route */}
          <div className="bg-surface-sunken rounded-lg p-4 border border-line">
            <p className="font-mono text-overline uppercase text-ink-muted mb-3 flex items-center gap-1.5">
              <Plane size={13} /> Flight route
            </p>
            <div className="grid grid-cols-2 gap-3 text-body-s">
              <div>
                <p className="text-micro text-ink-subtle mb-0.5">From</p>
                <p className="font-semibold text-ink-900">{match.flight?.from_city} ({match.flight?.from_code})</p>
              </div>
              <div>
                <p className="text-micro text-ink-subtle mb-0.5">To</p>
                <p className="font-semibold text-ink-900">{match.flight?.to_city} ({match.flight?.to_code})</p>
              </div>
              <div>
                <p className="text-micro text-ink-subtle mb-0.5">Airline</p>
                <p className="font-medium text-content">{match.flight?.airline}</p>
              </div>
              <div>
                <p className="text-micro text-ink-subtle mb-0.5">Date</p>
                <p className="font-mono font-medium text-content">
                  {match.flight?.flight_date
                    ? new Date(match.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Item */}
          <div className="bg-surface-sunken rounded-lg p-4 border border-line">
            <p className="font-mono text-overline uppercase text-ink-muted mb-3 flex items-center gap-1.5">
              <Package size={13} /> Shipment details
            </p>
            <div className="grid grid-cols-2 gap-3 text-body-s">
              <div>
                <p className="text-micro text-ink-subtle mb-0.5">Item</p>
                <p className="font-semibold text-ink-900">{match.request?.item_name}</p>
              </div>
              <div>
                <p className="text-micro text-ink-subtle mb-0.5">Category</p>
                <p className="font-medium text-content">{match.request?.category}</p>
              </div>
              <div>
                <p className="text-micro text-ink-subtle mb-0.5">Weight</p>
                <p className="font-mono font-semibold text-ink-900">{match.agreed_weight_kg || match.request?.weight_kg} kg</p>
              </div>
              {match.request?.item_dimensions && (
                <div>
                  <p className="text-micro text-ink-subtle mb-0.5">Dimensions</p>
                  <p className="font-medium text-content">{match.request.item_dimensions}</p>
                </div>
              )}
            </div>
            {match.request?.description && (
              <div className="mt-3 pt-3 border-t border-line">
                <p className="text-micro text-ink-subtle mb-1">Description</p>
                <p className="text-body-s text-ink-muted">{match.request.description}</p>
              </div>
            )}
          </div>

          {/* Shop & Ship */}
          {isPurchase && (
            <div className="bg-info-50 rounded-lg p-4 border border-line">
              <p className="font-mono text-overline uppercase text-info-500 mb-3 flex items-center gap-1.5">
                <ShoppingBag size={13} /> Shop & Ship details
              </p>
              <div className="space-y-2 text-body-s">
                {match.request?.purchase_store && (
                  <div className="flex items-start gap-2">
                    <MapPin size={13} className="text-info-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-micro text-ink-subtle">Store</p>
                      <p className="font-medium text-content">{match.request.purchase_store}</p>
                    </div>
                  </div>
                )}
                {match.request?.purchase_price && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Item purchase price</span>
                    <span className="font-mono font-semibold text-ink-900">${parseFloat(match.request.purchase_price).toFixed(2)}</span>
                  </div>
                )}
                {match.request?.purchase_url && (
                  <div>
                    <p className="text-micro text-ink-subtle mb-0.5">Product link</p>
                    <a href={match.request.purchase_url} target="_blank" rel="noreferrer"
                      className="text-micro text-info-500 underline break-all">{match.request.purchase_url}</a>
                  </div>
                )}
                {match.request?.purchase_details && (
                  <div>
                    <p className="text-micro text-ink-subtle mb-0.5">Specifications</p>
                    <p className="text-micro text-ink-muted">{match.request.purchase_details}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Handover details */}
          {(match.flight?.handover_location_departure || match.flight?.handover_location_arrival || match.request?.trusted_person_name) && (
            <div className="bg-surface-sunken rounded-lg p-4 border border-line">
              <p className="font-mono text-overline uppercase text-ink-muted mb-3 flex items-center gap-1.5">
                <MapPin size={13} /> Handover details
              </p>
              <div className="space-y-2 text-body-s">
                {match.flight?.handover_location_departure && (
                  <div>
                    <p className="text-micro text-ink-subtle">Departure handover</p>
                    <p className="font-medium text-content">{match.flight.handover_location_departure}</p>
                  </div>
                )}
                {match.flight?.handover_location_arrival && (
                  <div>
                    <p className="text-micro text-ink-subtle">Arrival handover</p>
                    <p className="font-medium text-content">{match.flight.handover_location_arrival}</p>
                  </div>
                )}
                {match.request?.trusted_person_name && (
                  <div className="pt-2 border-t border-line space-y-1">
                    <p className="font-mono text-overline uppercase text-ink-muted">Handover contact</p>
                    <p className="text-body-s font-semibold text-ink-900">{match.request.trusted_person_name}</p>
                    {match.request.trusted_person_phone && (
                      <p className="text-micro text-ink-muted flex items-center gap-1">
                        <Phone size={11} /> {match.request.trusted_person_phone}
                      </p>
                    )}
                    {match.request.trusted_person_location && (
                      <p className="text-micro text-ink-muted flex items-center gap-1">
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
            <div className="bg-surface rounded-lg border border-line-strong p-4 space-y-3">
              <p className="font-display font-semibold text-title-s text-ink-900 mb-1">Amend deal terms</p>
              <div className="flex items-start gap-2 bg-warning-tint border-l-[3px] border-warn-400 rounded-r px-2.5 py-2">
                <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
                <p className="text-body-s text-warning">Amending resets both parties' agreement. You will both need to re-agree to terms.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-label text-ink-muted mb-1 uppercase tracking-wide">Price/kg ($)</label>
                  <input type="number" min="0" step="0.5" inputMode="decimal"
                    value={form.agreed_price_per_kg}
                    onChange={e => setForm({ ...form, agreed_price_per_kg: e.target.value })}
                    className="input-field font-mono" />
                </div>
                <div>
                  <label className="block text-label text-ink-muted mb-1 uppercase tracking-wide">Weight (kg)</label>
                  <input type="number" min="0" step="0.1" inputMode="decimal"
                    value={form.agreed_weight_kg}
                    onChange={e => setForm({ ...form, agreed_weight_kg: e.target.value })}
                    className="input-field font-mono" />
                </div>
              </div>
              {isPurchase && (
                <div>
                  <label className="block text-label text-ink-muted mb-1 uppercase tracking-wide">
                    Shop & Ship service fee ($) <span className="text-info-500 font-normal normal-case">— the traveller's fee for purchasing the item</span>
                  </label>
                  <input type="number" min="0" step="0.5" inputMode="decimal" placeholder="e.g. 15.00"
                    value={form.agreed_shop_fee}
                    onChange={e => setForm({ ...form, agreed_shop_fee: e.target.value })}
                    className="input-field font-mono" />
                  <p className="text-micro text-ink-subtle mt-1">This is the traveller's service fee for going to the store and buying the item. The fetchr fee applies to this amount too.</p>
                </div>
              )}
              <div>
                <label className="block text-label text-ink-muted mb-1 uppercase tracking-wide">Notes</label>
                <textarea rows={2} placeholder="Any agreed conditions..."
                  value={form.agreed_notes}
                  onChange={e => setForm({ ...form, agreed_notes: e.target.value })}
                  className="input-field resize-none text-body-s" />
              </div>
              {form.agreed_price_per_kg && form.agreed_weight_kg && (
                <div className="bg-surface-sunken rounded-md p-3 text-body-s border border-line">
                  <div className="flex justify-between font-mono font-semibold text-ink-900">
                    <span>New deal value</span>
                    <span>${(parseFloat(form.agreed_price_per_kg) * parseFloat(form.agreed_weight_kg)).toFixed(2)}</span>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 btn-secondary">Keep it</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-[2] btn-primary disabled:opacity-50">
                  {saving ? 'Saving' : 'Save and notify'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-surface-sunken rounded-lg p-4 border border-line">
              <p className="font-mono text-overline uppercase text-ink-muted mb-3 flex items-center gap-1.5">
                <DollarSign size={13} /> Financial summary
              </p>
              <div className="space-y-2 text-body-s">
                {/* 1. Transport */}
                <div className="flex justify-between text-ink-muted font-mono">
                  <span>{match.agreed_weight_kg || match.request?.weight_kg} kg × ${match.agreed_price_per_kg || match.flight?.price_per_kg}/kg</span>
                  <span className="font-semibold text-ink-900">${dealValue.toFixed(2)}</span>
                </div>
                {/* 2. Shop & ship fee */}
                {isPurchase && (
                  <div className="flex justify-between text-ink-muted">
                    <span>Shop & ship service fee</span>
                    <span className="font-mono font-semibold">{shopFee > 0 ? `$${shopFee.toFixed(2)}` : <span className="text-warning">TBD — set in Amend</span>}</span>
                  </div>
                )}
                {/* 3. Item purchase price */}
                {isPurchase && purchasePrice > 0 && (
                  <div className="flex justify-between text-ink-muted">
                    <span>Item purchase price</span>
                    <span className="font-mono font-semibold text-ink-900">${purchasePrice.toFixed(2)}</span>
                  </div>
                )}
                {/* 4. Sender pays total */}
                <div className="border-t border-line pt-2">
                  <div className="flex justify-between font-mono font-bold text-ink-900">
                    <span>Sender pays total</span>
                    <span>${totalShipperPays.toFixed(2)}</span>
                  </div>
                </div>
                {/* 5. Fetchr fee (on transport + shop only) */}
                <div className="bg-surface rounded-md p-3 space-y-1.5 text-micro mt-1 border border-line">
                  <p className="text-ink-subtle font-mono uppercase tracking-wide">Distribution</p>
                  <div className="flex justify-between font-mono text-ink-muted">
                    <span>fetchr fee ({Math.round(fetchrPct * 100)}%) on ${fetchrBase.toFixed(2)}</span>
                    <span>−${fetchrFee.toFixed(2)}</span>
                  </div>
                  {isPurchase && purchasePrice > 0 && (
                    <div className="flex justify-between font-mono text-ink-muted">
                      <span>Item purchase reimbursement</span>
                      <span>+${purchasePrice.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-mono font-bold text-success border-t border-line pt-1.5">
                    <span>Traveller receives</span>
                    <span>${travelerReceives.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              {match.agreed_notes && (
                <div className="mt-3 pt-3 border-t border-line">
                  <p className="text-micro text-ink-subtle mb-1">Agreed notes</p>
                  <p className="text-body-s text-ink-muted italic">"{match.agreed_notes}"</p>
                </div>
              )}
            </div>
          )}

          <button onClick={onClose} className="w-full btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
};

// ── Main Messages Component ──
const Messages = ({ session, focusMatchId }) => {
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
  const [showProofModal, setShowProofModal] = useState(false);
  const [mobileComposerOpen, setMobileComposerOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const consumedFocusIdRef = useRef(null);

  // Deep-link from Home's "your turn" hero ticket straight into its thread.
  useEffect(() => {
    if (!focusMatchId || consumedFocusIdRef.current === focusMatchId) return;
    const match = acceptedMatches.find(m => m.id === focusMatchId);
    if (match) {
      consumedFocusIdRef.current = focusMatchId;
      setActiveMatch(match);
      setMobileComposerOpen(false);
    }
  }, [focusMatchId, acceptedMatches]);

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
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'cancellation_requests',
        filter: `match_id=eq.${activeMatch.id}`
      }, (payload) => {
        // Refresh cancel request for the other party immediately
        if (payload.new.requested_by !== activeMatch.traveler_id &&
            payload.new.requested_by !== activeMatch.shipper_id) return;
        fetchCancelRequest(activeMatch.id);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'cancellation_requests',
        filter: `match_id=eq.${activeMatch.id}`
      }, () => {
        fetchCancelRequest(activeMatch.id);
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
    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: otherAgreed
        ? `Terms agreed by both parties. The deal is locked in — the sender can now pay escrow.`
        : `Terms agreed by the ${iAmTraveler ? 'traveller' : 'sender'}. Waiting for the ${iAmTraveler ? 'sender' : 'traveller'} to also agree.`,
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
      const path = `${session.user.id}/proofs/${activeMatch.id}-${Date.now()}.${ext}`;
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
        content: `Proof uploaded: ${proofUrl}`, is_read: false,
      }]).select();
      if (msg) setMessages(prev => [...prev, msg[0]]);
      setActiveMatch(prev => ({ ...prev, proof_photo_url: proofUrl, status: 'proof_uploaded', deal_stage: 'proof_uploaded' }));
    } catch (e) { console.error('Proof upload error:', e); }
    setUploadingProof(false);
    setTimeout(scrollToBottom, 100);
  };

  // A deal can only be confirmed complete once the flight it's tied to has
  // actually happened — otherwise both sides could confirm delivery (and
  // release escrow) before the traveller has even flown. If the match gets
  // re-pointed at a different flight (amendment) this naturally re-checks
  // against whichever flight is current, since match.flight is a live join.
  const flightHasDeparted = (match) => {
    if (!match?.flight?.flight_date) return true; // no flight data — don't block on missing data
    const today = new Date().toISOString().split('T')[0];
    return match.flight.flight_date <= today;
  };

  const handleCompleteDeal = async () => {
    if (!activeMatch) return;
    if (!flightHasDeparted(activeMatch)) {
      alert(`This deal can't be marked delivered until the flight on ${new Date(activeMatch.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} has taken place.`);
      return;
    }
    const iAmTraveler = activeMatch.traveler_id === session.user.id;
    const myField = iAmTraveler ? 'traveler_completed' : 'shipper_completed';
    const otherDone = iAmTraveler ? activeMatch.shipper_completed : activeMatch.traveler_completed;
    if (!window.confirm(otherDone ? 'Confirm delivery and release escrow to the traveller?' : 'Confirm delivery on your side?')) return;
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
        content: `Deal completed. Both sides confirmed delivery — $${travelerReceives.toFixed(2)} has been released to the traveller's wallet.`,
        is_read: false,
      }]).select();
      if (msg) setMessages(prev => [...prev, msg[0]]);
      setTimeout(() => { setAcceptedMatches(prev => prev.filter(m => m.id !== activeMatch.id)); setActiveMatch(null); setMessages([]); }, 3000);
    } else {
      await supabase.from('matches').update({ [myField]: true }).eq('id', activeMatch.id);
      const { data: msg } = await supabase.from('messages').insert([{
        match_id: activeMatch.id, sender_id: session.user.id,
        content: `Delivery confirmed by the ${iAmTraveler ? 'traveller' : 'sender'}. Waiting for the ${iAmTraveler ? 'sender' : 'traveller'} to also confirm.`,
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
      content: `Cancellation request: ${cancelReason}. Respond to agree or decline.`, is_read: false,
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
        ? 'Cancellation agreed: deal cancelled. Escrow will be refunded within 5–10 business days.'
        : 'Cancellation agreed: deal cancelled by mutual agreement.',
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
      content: 'Cancellation declined: the deal continues as agreed.', is_read: false,
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

  // The single action blocked on this user — same precedence as the header
  // buttons above, surfaced instead as a sticky bar on mobile (§3 handoff).
  const getBlockedAction = () => {
    if (!activeMatch) return null;
    if (activeMatch.status === 'accepted' && !myTermsAgreed)
      return { label: 'Agree terms', icon: CheckCircle, onClick: agreeToTerms };
    if (isShipper(activeMatch) && activeMatch.status === 'terms_agreed')
      return { label: `Pay escrow · $${calcFees(activeMatch).totalShipperPays.toFixed(2)}`, icon: Lock,
        onClick: () => { setShowPayment(true); setShowCancelRequest(false); } };
    if (isTraveler(activeMatch) && activeMatch.status === 'in_escrow')
      return { label: 'Upload proof', icon: Camera, onClick: () => setShowProofModal(true) };
    if (['proof_uploaded', 'in_escrow'].includes(activeMatch.status) && !myCompleted && flightHasDeparted(activeMatch))
      return { label: otherCompleted ? 'Confirm & release' : 'Confirm delivery', icon: CheckCircle, onClick: handleCompleteDeal };
    return null;
  };
  const blockedAction = getBlockedAction();

  if (loading) return (
    <div className="max-w-md mx-auto py-6"><SkeletonList count={3} /></div>
  );

  if (acceptedMatches.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-20 h-20 bg-ink-100 rounded-lg flex items-center justify-center mb-4">
        <MessageCircle size={32} className="text-ink-300" />
      </div>
      <h2 className="font-display font-bold text-title-m text-ink-900 mb-1">No conversations</h2>
      <p className="text-body-m text-ink-muted">Chat opens once both sides accept a match</p>
    </div>
  );

  return (
    <div className="flex bg-surface overflow-hidden animate-fade-in
      h-[calc(100dvh-176px)] rounded-lg border border-line
      md:h-[calc(100vh-120px)] md:rounded-lg md:border md:border-line">

      {showDealDetails && activeMatch && (
        <DealDetailsModal match={activeMatch} session={session}
          onClose={() => setShowDealDetails(false)}
          onSaveAmendment={(updates) => { setActiveMatch(prev => ({ ...prev, ...updates })); setShowDealDetails(false); fetchMessages(activeMatch.id); }} />
      )}

      {showProofModal && activeMatch && (
        <ProofUploadModal
          match={activeMatch}
          session={session}
          onClose={() => setShowProofModal(false)}
          onUploaded={(url) => {
            setShowProofModal(false);
            setActiveMatch(prev => ({ ...prev, proof_photo_url: url, status: 'proof_uploaded', deal_stage: 'proof_uploaded' }));
            fetchMessages(activeMatch.id);
          }}
        />
      )}

      {/* Sidebar — full-screen list on mobile until a thread is opened */}
      <div className={`${activeMatch ? 'hidden md:flex' : 'flex'} w-full md:w-auto
        ${showSidebar ? 'md:w-64' : 'md:w-0'} border-r border-line flex-col flex-shrink-0 transition-all duration-300 overflow-hidden`}>
        <div className="p-4 border-b border-line flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-display font-semibold text-title-s text-ink-900">Messages</h2>
            <p className="text-micro text-ink-subtle mt-0.5">{acceptedMatches.length} active deal{acceptedMatches.length !== 1 ? 's' : ''}</p>
          </div>
          {totalUnread > 0 && (
            <span className="bg-accent-fill text-white font-mono text-micro font-bold rounded-full w-5 h-5 flex items-center justify-center">{totalUnread}</span>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {acceptedMatches.map(match => {
            const other = getOtherParty(match);
            const unread = unreadCounts[match.id] || 0;
            const isActive = activeMatch?.id === match.id;
            const stageInfo = STAGES.find(s => s.id === getCurrentStage(match)) || STAGES[0];
            const StageIcon = stageInfo.icon;
            return (
              <button key={match.id}
                onClick={() => { setActiveMatch(match); setShowPayment(false); setShowCancelRequest(false); }}
                className={`w-full text-left p-3.5 border-b border-line transition-all ${isActive ? 'bg-surface-sunken' : 'hover:bg-surface-sunken'}`}>
                <div className="flex items-center gap-2.5">
                  <div className="relative flex-shrink-0">
                    <div className={`w-9 h-9 rounded-avatar flex items-center justify-center text-micro font-mono font-semibold ${isActive ? 'bg-ink-900 text-paper-100' : 'bg-ink-100 text-ink-600'}`}>
                      {getInitials(other?.full_name)}
                    </div>
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 bg-accent-fill text-white font-mono text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-body-s truncate ${unread > 0 ? 'font-semibold text-ink-900' : 'font-medium text-content'}`}>{other?.full_name || 'User'}</p>
                      <StageIcon size={13} className="text-ink-400 flex-shrink-0" />
                    </div>
                    <p className="text-micro text-ink-subtle truncate mt-0.5">{match.flight?.from_code} → {match.flight?.to_code} · {match.request?.item_name}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat area — full-screen on mobile once a thread is active */}
      {activeMatch ? (
        <div className="flex-1 flex flex-col min-w-0 w-full">

          {/* Stage bar — tracking timeline, §7.15 */}
          <div className="bg-surface border-b border-line px-4 py-2.5 flex-shrink-0">
            <div className="flex items-center justify-between gap-1 max-w-md mx-auto">
              {STAGES.map((stage, i) => {
                const currentIdx = getStageIndex(getCurrentStage(activeMatch));
                const isDone = i < currentIdx;
                const isCurrent = i === currentIdx;
                const StageIcon = stage.icon;
                return (
                  <React.Fragment key={stage.id}>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className={`w-6 h-6 rounded-sm flex items-center justify-center transition-all ${isDone ? 'bg-success text-white' : isCurrent ? 'bg-accent-fill text-white' : 'bg-ink-200 text-ink-400'}`}>
                        {isDone ? <CheckCircle size={13} /> : <StageIcon size={12} />}
                      </div>
                      <p className={`hidden sm:block text-center font-mono ${isCurrent ? 'text-accent font-semibold' : 'text-ink-subtle'}`} style={{ fontSize: '9px' }}>{stage.label}</p>
                    </div>
                    {i < STAGES.length - 1 && <div className={`flex-1 h-0.5 rounded-full transition-all ${isDone ? 'bg-success' : 'bg-ink-100'}`} />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Chat header */}
          <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2 flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <button onClick={() => setActiveMatch(null)}
                className="md:hidden w-8 h-8 -ml-1 flex items-center justify-center rounded-md hover:bg-surface-sunken transition text-ink-700 flex-shrink-0">
                <ChevronLeft size={20} />
              </button>
              <button onClick={() => setShowSidebar(!showSidebar)}
                className="hidden md:flex w-7 h-7 items-center justify-center rounded-md hover:bg-surface-sunken transition text-ink-400 flex-shrink-0">
                <ChevronDown size={14} className={`transition-transform ${showSidebar ? 'rotate-90' : '-rotate-90'}`} />
              </button>
              <div className="w-8 h-8 rounded-avatar bg-ink-100 flex items-center justify-center text-micro font-mono font-semibold text-ink-600 flex-shrink-0">
                {getInitials(getOtherParty(activeMatch)?.full_name)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-display font-semibold text-title-s text-ink-900 truncate">{getOtherParty(activeMatch)?.full_name || 'User'}</p>
                  <VerificationBadge verified={getOtherParty(activeMatch)?.verified} />
                </div>
                <p className="text-micro text-ink-subtle truncate">{activeMatch.flight?.from_code} → {activeMatch.flight?.to_code} · {activeMatch.request?.item_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Deal details — always visible */}
              <button onClick={() => setShowDealDetails(true)} className="btn-secondary px-2.5 text-label">
                <Info size={12} /> Deal
              </button>

              {/* Agree Terms — the pending action is the one Signal button on this screen.
                  Mobile surfaces this same action via the sticky bar below the thread. */}
              {activeMatch.status === 'accepted' && !myTermsAgreed && (
                <button onClick={agreeToTerms} className="hidden md:inline-flex btn-signal px-3 text-label">
                  <CheckCircle size={12} /> Agree terms
                </button>
              )}

              {/* Pay Escrow — SENDER ONLY */}
              {isShipper(activeMatch) && activeMatch.status === 'terms_agreed' && (
                <button onClick={() => { setShowPayment(!showPayment); setShowCancelRequest(false); }}
                  className={`hidden md:inline-flex ${showPayment ? 'btn-secondary px-3 text-label' : 'btn-signal px-3 text-label'}`}>
                  <Shield size={12} /> Pay escrow
                </button>
              )}

              {/* Upload Proof — traveller only */}
              {isTraveler(activeMatch) && activeMatch.status === 'in_escrow' && (
                <button onClick={() => setShowProofModal(true)} className="hidden md:inline-flex btn-signal px-3 text-label">
                  <Camera size={12} /> Upload proof
                </button>
              )}

              {/* Confirm Delivery — blocked until the flight has actually taken place */}
              {['proof_uploaded', 'in_escrow'].includes(activeMatch.status) && (
                <button onClick={handleCompleteDeal}
                  disabled={submittingComplete || myCompleted || !flightHasDeparted(activeMatch)}
                  title={!flightHasDeparted(activeMatch) ? `Available once the flight on ${new Date(activeMatch.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} has taken place` : undefined}
                  className={`hidden md:inline-flex ${
                    myCompleted || !flightHasDeparted(activeMatch)
                      ? 'items-center gap-1 h-11 px-3 rounded-md text-label font-display font-semibold bg-ink-100 text-ink-400 cursor-not-allowed'
                      : 'btn-signal px-3 text-label'
                  }`}>
                  <CheckCircle size={12} />
                  {myCompleted ? 'Waiting' : !flightHasDeparted(activeMatch) ? 'Not yet flown' : otherCompleted ? 'Confirm & release' : 'Confirm delivery'}
                </button>
              )}

              <button onClick={() => { setShowCancelRequest(!showCancelRequest); setShowPayment(false); }}
                className="inline-flex items-center gap-1 h-11 px-2.5 rounded-md text-label font-display font-semibold text-ink-muted hover:bg-danger-tint hover:text-danger transition">
                <XCircle size={12} /> Cancel
              </button>
            </div>
          </div>

          {/* Pinned deal stub — mobile only; route, amount, escrow state, tap for the full ticket */}
          <button onClick={() => setShowDealDetails(true)}
            className="md:hidden flex-shrink-0 flex items-center gap-3 px-4 py-2.5 bg-surface-raised border-b border-line text-left">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-body-s font-semibold text-ink-900">
                {activeMatch.flight?.from_code} → {activeMatch.flight?.to_code}
              </p>
              <p className="text-label text-ink-subtle truncate">
                {isShipper(activeMatch) ? 'You pay' : 'You receive'} $
                {(isShipper(activeMatch) ? calcFees(activeMatch).totalShipperPays : calcFees(activeMatch).travelerReceives).toFixed(2)}
              </p>
            </div>
            <StatusPill tone={blockedAction ? 'signal' : activeMatch.status === 'completed' ? 'success' : 'neutral'} className="flex-shrink-0">
              {blockedAction ? `Your turn · ${blockedAction.label.split(' · ')[0]}`
                : (STAGES.find(s => s.id === getCurrentStage(activeMatch)) || STAGES[0]).label}
            </StatusPill>
          </button>

          {/* Safety notice — §7.9 advisory banner */}
          {activeMatch.status === 'accepted' && (
            <div className={`px-4 py-2.5 flex items-start gap-2 border-l-[3px] flex-shrink-0 ${isTraveler(activeMatch) ? 'bg-warning-tint border-warn-400' : 'bg-info-50 border-info-400'}`}>
              {isTraveler(activeMatch)
                ? <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
                : <Info size={14} className="text-info-500 flex-shrink-0 mt-0.5" />}
              <p className={`text-body-s leading-relaxed ${isTraveler(activeMatch) ? 'text-warning' : 'text-info-500'}`}>
                {activeMatch.request?.requires_purchase
                  ? isTraveler(activeMatch) ? 'Only purchase the item once escrow is confirmed paid.' : 'Once you agree terms and pay escrow, the traveller will purchase your item at the destination.'
                  : isTraveler(activeMatch) ? 'Only accept the item from the sender once escrow is confirmed paid.' : 'Hand the item to the traveller before their flight. Your payment is secured in escrow until both parties confirm delivery.'
                }
              </p>
            </div>
          )}

          {/* Terms status */}
          {activeMatch.status === 'accepted' && (
            <div className="bg-surface-sunken px-4 py-2 flex items-center gap-4 text-body-s border-b border-line flex-shrink-0">
              <p className="text-ink-muted font-semibold">Terms:</p>
              <span className={`flex items-center gap-1 font-semibold ${activeMatch.terms_agreed_traveler ? 'text-success' : 'text-ink-300'}`}>
                {activeMatch.terms_agreed_traveler ? <CheckCircle size={13} /> : <Circle size={13} />} Traveller
              </span>
              <span className={`flex items-center gap-1 font-semibold ${activeMatch.terms_agreed_shipper ? 'text-success' : 'text-ink-300'}`}>
                {activeMatch.terms_agreed_shipper ? <CheckCircle size={13} /> : <Circle size={13} />} Sender
              </span>
              <p className="text-ink-subtle ml-auto text-right">{!myTermsAgreed ? 'Tap "Agree terms" to proceed' : 'Waiting for other party'}</p>
            </div>
          )}

          {/* Escrow pending notice — copy per BRAND.md §9.2 */}
          {activeMatch.status === 'terms_agreed' && (
            <div className="px-4 py-2.5 flex items-start gap-2 border-l-[3px] border-info-400 bg-info-50 flex-shrink-0">
              <Shield size={14} className="flex-shrink-0 mt-0.5 text-info-500" />
              <p className="text-body-s leading-relaxed text-info-500">
                {isShipper(activeMatch)
                  ? `You'll pay $${calcFees(activeMatch).totalShipperPays.toFixed(2)} now. We hold it until you both confirm delivery.`
                  : `Nothing to do yet — ${getOtherParty(activeMatch)?.full_name || 'the sender'} pays into escrow before you fly.`}
              </p>
            </div>
          )}

          {/* Flight-not-yet-flown notice — delivery can't be confirmed early */}
          {['proof_uploaded', 'in_escrow'].includes(activeMatch.status) && !myCompleted && !flightHasDeparted(activeMatch) && (
            <div className="px-4 py-2.5 flex items-start gap-2 border-l-[3px] border-info-400 bg-info-50 flex-shrink-0">
              <Plane size={14} className="flex-shrink-0 mt-0.5 text-info-500" />
              <p className="text-body-s leading-relaxed text-info-500">
                Confirming delivery opens up on {new Date(activeMatch.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, once the flight has taken place.
              </p>
            </div>
          )}

          {/* Escrow panel — SENDER ONLY */}
          {showPayment && isShipper(activeMatch) && activeMatch.status === 'terms_agreed' && (
            <div className="border-b border-line bg-surface-sunken overflow-y-auto max-h-96 flex-shrink-0">
              <EscrowPayment match={activeMatch} session={session}
                onPaymentComplete={async () => { setShowPayment(false); await fetchMatches(); if (activeMatch) await fetchMessages(activeMatch.id); }} />
            </div>
          )}

          {/* Cancel form */}
          {showCancelRequest && !cancelRequest && (
            <div className="border-b border-line bg-danger-tint p-4 flex-shrink-0">
              <p className="text-body-s font-semibold text-danger mb-2 flex items-center gap-1.5"><AlertTriangle size={14} /> Request cancellation</p>
              {['in_escrow', 'proof_uploaded'].includes(activeMatch.status) && (
                <p className="text-micro text-danger mb-2">Escrow will be refunded automatically if both parties agree.</p>
              )}
              <textarea placeholder="Explain the reason..." value={cancelReason}
                onChange={e => setCancelReason(e.target.value)} rows={2} className="input-field resize-none text-body-s mb-2" />
              <div className="flex gap-2">
                <button onClick={() => setShowCancelRequest(false)} className="flex-1 btn-secondary">Keep it</button>
                <button onClick={requestCancellation} disabled={!cancelReason.trim() || submittingCancel}
                  className="flex-1 btn-danger disabled:opacity-50">
                  {submittingCancel ? 'Sending' : 'Send request'}
                </button>
              </div>
            </div>
          )}

          {/* Incoming cancel */}
          {cancelRequest && cancelRequest.requested_by !== session.user.id && (
            <div className="border-b border-line bg-warning-tint p-4 flex-shrink-0">
              <p className="text-body-s font-semibold text-warning mb-1 flex items-center gap-1.5"><AlertTriangle size={14} /> Cancellation requested</p>
              <p className="text-micro text-warning mb-2">Reason: {cancelRequest.reason}</p>
              <div className="flex gap-2">
                <button onClick={rejectCancellation} className="flex-1 btn-secondary">Decline</button>
                <button onClick={agreeCancellation} disabled={submittingCancel}
                  className="flex-1 btn-danger disabled:opacity-50">
                  {submittingCancel ? 'Processing' : 'Agree to cancel'}
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => {
              const isMe = msg.sender_id === session.user.id;

              if (msg.content?.includes('PROOF_IMAGE_1:') || msg.content?.startsWith('📸 PROOF UPLOADED:') || msg.content?.startsWith('Proof uploaded:')) {
                // Parse proof images — could be single URL or multi-image format
                const lines = msg.content.split('\n');
                const imageUrls = lines
                  .filter(l => l.startsWith('PROOF_IMAGE_') || l.startsWith('📸 PROOF UPLOADED: http') || l.startsWith('Proof uploaded: http'))
                  .map(l => l.includes('PROOF_IMAGE_') ? l.split(':').slice(1).join(':').trim() : l.replace(/^(📸 PROOF UPLOADED:|Proof uploaded:)\s*/, '').trim());
                const notes = lines.find(l => l.startsWith('Notes:'))?.replace('Notes: ', '');
                if (imageUrls.length === 0) {
                  imageUrls.push(msg.content.replace(/^(📸 PROOF UPLOADED:|Proof uploaded:)/, '').split('\n')[0].trim());
                }
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="bg-info-50 border border-line rounded-lg p-4 max-w-sm w-full">
                      <p className="font-mono text-overline uppercase text-info-500 mb-3 flex items-center gap-1.5">
                        <Camera size={13} /> Delivery proof submitted
                      </p>
                      <div className={`grid gap-2 mb-3 ${imageUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {imageUrls.filter(Boolean).map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`Proof ${i + 1}`}
                              className="rounded-md w-full h-32 object-cover hover:opacity-90 transition border border-line" />
                          </a>
                        ))}
                      </div>
                      {notes && <p className="text-micro text-info-500 italic">"{notes}"</p>}
                      <p className="text-micro text-ink-subtle mt-1">Tap photos to view full size</p>
                    </div>
                  </div>
                );
              }
              if (isSystemMessage(msg.content)) {
                const { icon: EventIcon, tone } = getSystemEventStyle(msg.content);
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="flex items-start gap-2.5 bg-surface-sunken border border-line rounded-lg px-3.5 py-2.5 max-w-sm w-full">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${EVENT_TONE_CLASSES[tone]}`}>
                        <EventIcon size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-body-s text-ink-900 leading-relaxed">{msg.content}</p>
                        <p className="font-mono text-micro text-ink-subtle mt-0.5">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {!isMe && (
                    <div className="w-7 h-7 rounded-avatar bg-ink-100 flex items-center justify-center text-micro font-mono font-semibold text-ink-600 flex-shrink-0 mr-2 mt-1">
                      {getInitials(msg.sender?.full_name)}
                    </div>
                  )}
                  <div className={`max-w-xs lg:max-w-sm flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {/* Literal ink-scale classes, not the semantic surface-inverse/
                        text-content tokens — those swap under system dark mode
                        (never verified for chat), which was collapsing both
                        bubble colors together and losing text contrast. */}
                    <div className={`px-3.5 py-2.5 rounded-lg text-body-m leading-relaxed ${isMe ? 'bg-ink-900 text-white rounded-br-[3px]' : 'bg-ink-50 text-ink-900 rounded-bl-[3px]'}`}>
                      {msg.content}
                    </div>
                    <p className={`font-mono text-micro text-ink-subtle mt-0.5 px-1 ${isMe ? 'text-right' : ''}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input — mobile replaces this with the single blocked action while one
              exists, per the handoff; desktop always shows the composer. */}
          <div className="border-t border-line flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {blockedAction && !mobileComposerOpen ? (
              <div className="md:hidden p-3 space-y-2">
                <button onClick={blockedAction.onClick} className="btn-signal w-full">
                  <blockedAction.icon size={16} /> {blockedAction.label}
                </button>
                <button onClick={() => setMobileComposerOpen(true)}
                  className="w-full text-center text-body-s text-ink-muted">
                  Message instead
                </button>
              </div>
            ) : null}
            <div className={`${blockedAction && !mobileComposerOpen ? 'hidden' : ''} md:block p-3`}>
              {blockedAction && (
                <button onClick={() => setMobileComposerOpen(false)}
                  className="md:hidden mb-2 flex items-center gap-1.5 text-label text-ink-muted">
                  <blockedAction.icon size={12} /> Back to {blockedAction.label}
                </button>
              )}
              <div className="flex items-end gap-2">
                <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown} placeholder="Type a message (Enter to send)"
                  rows={1} className="flex-1 input-field resize-none py-2.5 text-body-m min-h-[42px] max-h-24"
                  onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'; }} />
                <button onClick={sendMessage} disabled={!newMessage.trim() || sending}
                  className="w-11 h-11 bg-brand rounded-md flex items-center justify-center hover:bg-brand-hover transition disabled:opacity-50 flex-shrink-0">
                  {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={16} className="text-white" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8">
          <div className="w-16 h-16 bg-ink-100 rounded-lg flex items-center justify-center mb-4">
            <MessageCircle size={28} className="text-ink-300" />
          </div>
          <p className="font-display font-semibold text-title-s text-ink-900 mb-1">Select a conversation</p>
          <p className="text-body-m text-ink-muted">Choose a deal from the sidebar to start chatting</p>
        </div>
      )}
    </div>
  );
};

export default Messages;