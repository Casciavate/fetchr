import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { PROFILE_PUBLIC_COLUMNS } from '../lib/profileColumns';
import {
  Send, Package, Plane, DollarSign, CheckCircle, Shield,
  XCircle, AlertTriangle, ChevronDown, ChevronLeft, MessageCircle,
  Camera, Lock, Info, X, Edit2,
  Circle, Zap, AlertOctagon,
} from 'lucide-react';
import EscrowPayment, { ProofUploadModal } from './EscrowPayment';
import { calcFees, resolveOptionPrice, MINIMUM_DEAL_SIZE, SHIPPER_SERVICE_FEE_PCT, TRAVELER_PLATFORM_FEE_PCT, SOURCING_FEE_PCT, shopShipMismatch, resolvedIsPurchase } from '../lib/fees';
import StatusPill from './shared/StatusPill';
import SkeletonList from './shared/Skeleton';
import VerificationBadge from './shared/VerificationBadge';
import RatingDisplay from './shared/RatingDisplay';
import DealInfoSections from './shared/DealInfoSections';
import AdvisoryBanner from './shared/AdvisoryBanner';
import Barcode from './shared/Barcode';

// Bare glyph, docs/BRAND.md §2.6 — used inside ticket-style header bars,
// same small local copy every other ticket-rendering file already keeps
// (Matches.jsx, MyFlights.jsx) rather than a new shared import.
const BareGlyph = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="fetchr">
    <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
      fill="none" stroke="#FBFAF8" strokeWidth="5" strokeLinecap="round" />
    <rect x="10.5" y="21" width="16" height="4.6" rx="2.3" fill="#FBFAF8" />
    <path d="M29 10.5 L39 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518" />
  </svg>
);

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
  'Proof uploaded:', 'Dispute escalated:', 'Dispute resolved:',
  '🎉', '✅', '⏳', '⚠️', '❌', '🔒', '📸', '✏️',
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
  if (content?.startsWith('Dispute escalated:')) return { icon: AlertOctagon, tone: 'warning' };
  if (content?.startsWith('Dispute resolved:')) return { icon: AlertOctagon, tone: 'danger' };
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
    agreed_price_per_kg: match.agreed_price_per_kg || resolveOptionPrice(match.flight, match.luggage_type) || '',
    agreed_weight_kg: match.agreed_weight_kg || match.request?.weight_kg || '',
    agreed_notes: match.agreed_notes || '',
    agreed_shop_fee: match.agreed_shop_fee || match.flight?.shop_and_ship_fee || '',
  });
  const [saving, setSaving] = useState(false);

  // Reflects the form's currently-edited values while amending, falling
  // back to the locked-in match otherwise — same shape calcFees expects
  // everywhere else.
  const fees = calcFees({
    agreed_price_per_kg: form.agreed_price_per_kg || match.agreed_price_per_kg || resolveOptionPrice(match.flight, match.luggage_type),
    agreed_weight_kg: form.agreed_weight_kg || match.agreed_weight_kg || match.request?.weight_kg,
    agreed_shop_fee: form.agreed_shop_fee || match.agreed_shop_fee || match.flight?.shop_and_ship_fee,
    request: match.request,
    shop_ship_included: match.shop_ship_included,
  });
  const { isPurchase, purchasePrice, shopFee } = fees;
  const dealValue = fees.transportFee;

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

  // Same ticket/cargo-tag split as Matches.jsx and MyFlights.jsx — the
  // traveller is tracking a trip (boarding pass), the shipper is tracking
  // an item (cargo manifest). This modal used to be a plain settings-style
  // sheet regardless of role, with no visual relation to the ticket the
  // rest of the app shows for the same deal; it now embeds the actual
  // ticket body (status, route, data strip, other party, barcode) rather
  // than jumping straight to a grid of info cards.
  const ref = match.id.slice(0, 6).toUpperCase();
  const other = isTrav ? match.shipper : match.traveler;
  const getInitials = (name) => { if (!name) return '?'; return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); };
  const getAvatarUrl = (profile) => {
    if (!profile?.avatar_url) return null;
    const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
    return data?.publicUrl;
  };
  const avatarUrl = getAvatarUrl(other);
  const dealStatusLabel = {
    accepted: 'Chat open', terms_agreed: 'Terms agreed', in_escrow: 'Escrow secured',
    proof_uploaded: 'Proof uploaded', completed: 'Delivered',
  }[match.status] || match.status;

  return (
    <div className="fixed inset-0 bg-[var(--scrim)] z-modal flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-surface-raised rounded-t-xl md:rounded-xl w-full max-w-lg max-h-[92vh] md:max-h-[90vh] overflow-y-auto shadow-elev-3">
        <div className="md:hidden flex justify-center pt-2.5 pb-1 sticky top-0 bg-surface-raised z-10">
          <div className="w-8 h-1 rounded-full bg-line-strong" />
        </div>
        <div className="sticky top-0 md:top-0 z-10 h-10 bg-ink-900 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <BareGlyph size={15} />
            <span className="font-display font-extrabold text-[12px] tracking-[-0.05em] text-paper-100">fetchr</span>
          </div>
          <span className="font-mono text-[10px] text-ink-300 uppercase">
            {isTrav ? 'Boarding pass' : 'Cargo manifest'} · #{ref}
          </span>
        </div>
        <div className="bg-surface-raised border-b border-line px-5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <StatusPill tone={match.status === 'completed' ? 'success' : match.status === 'in_escrow' ? 'success' : 'neutral'}>
                {dealStatusLabel}
              </StatusPill>
            </div>
            <p className="font-mono font-semibold text-code-l text-ink-900 leading-none">
              {match.flight?.from_code || '—'} <span className="text-ink-400">→</span> {match.flight?.to_code || '—'}
            </p>
            <p className="text-body-s text-content-muted truncate mt-1">{match.request?.item_name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!editing && ['accepted', 'terms_agreed'].includes(match.status) && (
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

        {/* Data strip — date · flight/airline · weight, same line the
            boarding-pass and cargo-ticket cards both use. */}
        <p className="font-mono text-micro text-content-muted px-5 py-2 border-b border-line whitespace-nowrap overflow-hidden text-ellipsis">
          {match.flight?.flight_date
            ? new Date(match.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—'}
          {' · '}{match.flight?.flight_number || match.flight?.airline || '—'}
          {' · '}{match.agreed_weight_kg || match.request?.weight_kg}kg
        </p>

        {/* Other party — the modal never showed who's actually on the
            other end of the deal before. */}
        <div className="flex items-center gap-2.5 px-5 py-3 border-b border-line">
          <div className="w-9 h-9 rounded-avatar bg-ink-900 flex items-center justify-center text-body-s font-mono font-semibold text-paper-100 flex-shrink-0 overflow-hidden">
            {avatarUrl ? <img src={avatarUrl} alt={other?.full_name} className="w-full h-full object-cover" /> : getInitials(other?.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-display font-semibold text-title-s text-ink-900 truncate">{other?.full_name || 'User'}</p>
              <VerificationBadge verified={other?.verified} />
            </div>
            <RatingDisplay rating={other?.rating} totalReviews={other?.total_reviews} qualifier={isTrav ? 'New sender' : 'New traveller'} />
          </div>
          <span className="badge badge-gray flex-shrink-0">{isTrav ? 'Sender' : 'Traveller'}</span>
        </div>

        <div className="p-5 space-y-4">

          <DealInfoSections match={match} />

          {/* Financials / Amend */}
          {editing ? (
            <div className="bg-surface rounded-lg border border-line-strong p-4 space-y-3">
              <p className="font-display font-semibold text-title-s text-ink-900 mb-1">Amend deal terms</p>
              <AdvisoryBanner tone="warning">Amending resets both parties' agreement. You will both need to re-agree to terms.</AdvisoryBanner>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-label text-content-muted mb-1 uppercase tracking-wide">Price/kg ($)</label>
                  <input type="number" min="0" step="0.5" inputMode="decimal"
                    value={form.agreed_price_per_kg}
                    onChange={e => setForm({ ...form, agreed_price_per_kg: e.target.value })}
                    className="input-field font-mono" />
                </div>
                <div>
                  <label className="block text-label text-content-muted mb-1 uppercase tracking-wide">Weight (kg)</label>
                  <input type="number" min="0" step="0.1" inputMode="decimal"
                    value={form.agreed_weight_kg}
                    onChange={e => setForm({ ...form, agreed_weight_kg: e.target.value })}
                    className="input-field font-mono" />
                </div>
              </div>
              {isPurchase && (
                <div>
                  <label className="block text-label text-content-muted mb-1 uppercase tracking-wide">
                    Shop & Ship service fee ($) <span className="text-info-500 font-normal normal-case">— the traveller's fee for purchasing the item</span>
                  </label>
                  <input type="number" min="0" step="0.5" inputMode="decimal" placeholder="e.g. 15.00"
                    value={form.agreed_shop_fee}
                    onChange={e => setForm({ ...form, agreed_shop_fee: e.target.value })}
                    className="input-field font-mono" />
                  <p className="text-micro text-content-subtle mt-1">This is the traveller's service fee for going to the store and buying the item. The fetchr fee applies to this amount too.</p>
                </div>
              )}
              <div>
                <label className="block text-label text-content-muted mb-1 uppercase tracking-wide">Notes</label>
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
              <p className="font-mono text-overline uppercase text-content-muted mb-3 flex items-center gap-1.5">
                <DollarSign size={13} /> Financial summary
              </p>
              <div className="space-y-2 text-body-s">
                {/* Transport — both sides see this */}
                <div className="flex justify-between text-content-muted font-mono">
                  <span>{match.agreed_weight_kg || match.request?.weight_kg} kg × ${match.agreed_price_per_kg || resolveOptionPrice(match.flight, match.luggage_type)}/kg</span>
                  <span className="font-semibold text-ink-900">${dealValue.toFixed(2)}</span>
                </div>
                {isPurchase && (
                  <div className="flex justify-between text-content-muted">
                    <span>Shop & ship service fee</span>
                    <span className="font-mono font-semibold">{shopFee > 0 ? `$${shopFee.toFixed(2)}` : <span className="text-warning">TBD — set in Amend</span>}</span>
                  </div>
                )}
                {isPurchase && purchasePrice > 0 && (
                  <div className="flex justify-between text-content-muted">
                    <span>Item purchase price{isTrav ? ' (reimbursed)' : ''}</span>
                    <span className="font-mono font-semibold text-ink-900">${purchasePrice.toFixed(2)}</span>
                  </div>
                )}

                {/* Fee lines diverge below — never show the shipper's cut to
                    the traveller (or vice versa): each side only sees the
                    fee that changes their own number. */}
                {!isTrav ? (
                  <>
                    <div className="flex justify-between text-content-muted">
                      <span>Fetchr service fee {fees.floorApplied ? '(minimum)' : `(${Math.round(SHIPPER_SERVICE_FEE_PCT * 100)}%)`}</span>
                      <span className="font-mono">${fees.shipperServiceFee.toFixed(2)}</span>
                    </div>
                    {isPurchase && purchasePrice > 0 && (
                      <div className="flex justify-between text-content-muted">
                        <span>Sourcing fee ({Math.round(SOURCING_FEE_PCT * 100)}%)</span>
                        <span className="font-mono">${fees.sourcingFee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="border-t border-line pt-2">
                      <div className="flex justify-between font-mono font-bold text-ink-900">
                        <span>Total you pay</span>
                        <span>${fees.shipperPays.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-content-muted">
                      <span>Platform fee ({Math.round(TRAVELER_PLATFORM_FEE_PCT * 100)}%)</span>
                      <span className="font-mono">−${fees.travelerPlatformFee.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-line pt-2">
                      <div className="flex justify-between font-mono font-bold text-success">
                        <span>You receive</span>
                        <span>${fees.travelerReceives.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {match.agreed_notes && (
                <div className="mt-3 pt-3 border-t border-line">
                  <p className="text-micro text-content-subtle mb-1">Agreed notes</p>
                  <p className="text-body-s text-content-muted italic">"{match.agreed_notes}"</p>
                </div>
              )}
              <Barcode deal={match} />
            </div>
          )}

          <button onClick={onClose} className="w-full btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
};

// ── Report a problem / raise a dispute ──
// Filing this never moves money by itself — it hands the case to
// raise_dispute (stripe-connect), which runs Claude against the original
// request, the delivery proof, and this evidence, then either auto-
// resolves (high confidence, small deal) or escalates to fetchr's admin
// queue. Either outcome comes back as a chat message posted server-side,
// so this modal's own job ends the moment the request succeeds.
const DisputeModal = ({ match, session, onClose, onFiled }) => {
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter(f => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024);
    if (valid.length !== selected.length) setError('Images only, max 10MB each');
    else setError('');
    const combined = [...files, ...valid].slice(0, 5);
    setFiles(combined);
    const newPreviews = valid.map(f => URL.createObjectURL(f));
    setPreviews(prev => [...prev, ...newPreviews].slice(0, 5));
  };
  const removeFile = (i) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Describe the problem.'); return; }
    setSubmitting(true); setError('');
    try {
      const evidencePhotoUrls = [];
      for (const file of files) {
        const ext = file.name.split('.').pop();
        // Same bucket/path shape as proof uploads — RLS on 'avatars'
        // requires the uploader's own id as the first path segment.
        const path = `${session.user.id}/disputes/${match.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        evidencePhotoUrls.push(urlData.publicUrl);
      }
      const { data: { session: auth } } = await supabase.auth.getSession();
      const res = await fetch('https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.access_token}` },
        body: JSON.stringify({ action: 'raise_dispute', data: { matchId: match.id, reason: reason.trim(), evidencePhotoUrls } }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Failed to file the dispute');
      onFiled(result);
    } catch (e) {
      setError(e.message || 'Something went wrong. Try again.');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-modal flex items-end md:items-center justify-center p-4" style={{ background: 'var(--scrim)' }}>
      <div className="bg-surface-raised rounded-xl w-full max-w-md shadow-elev-3">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-display font-bold text-title-s text-content flex items-center gap-2">
            <AlertOctagon size={16} className="text-danger" /> Report a problem
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-sunken transition">
            <X size={18} className="text-content-muted" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <AdvisoryBanner tone="warning" title="Before you file">
            Escrow stays held while this is reviewed — filing doesn't release or refund anything by itself.
            Clear-cut cases get an AI decision right away; anything uncertain goes to fetchr's team.
          </AdvisoryBanner>
          <div>
            <label className="block text-label text-content-muted mb-1 uppercase tracking-wide">What's wrong?</label>
            <textarea rows={4} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. The item delivered doesn't match what I ordered…"
              className="input-field resize-none text-body-s" />
          </div>
          <div>
            <label className="block text-label text-content-muted mb-1 uppercase tracking-wide">Evidence photos (optional)</label>
            <div className="grid grid-cols-3 gap-2">
              {previews.map((src, i) => (
                <div key={i} className="relative aspect-square rounded-md overflow-hidden border border-line">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeFile(i)} className="absolute top-1 right-1 w-5 h-5 bg-ink-900/70 rounded-full flex items-center justify-center">
                    <X size={11} className="text-white" />
                  </button>
                </div>
              ))}
              {files.length < 5 && (
                <button onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-md border border-dashed border-line-strong flex items-center justify-center text-ink-400 hover:border-ink-600 hover:text-ink-600 transition">
                  <Camera size={18} />
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
          </div>
          {error && <p className="text-body-s text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 btn-secondary">Keep it</button>
            <button onClick={handleSubmit} disabled={submitting || !reason.trim()}
              className="flex-[2] btn-primary disabled:opacity-50">
              {submitting ? 'Reviewing…' : 'File dispute'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Messages Component ──
const Messages = ({ session, focusMatchId, focusToken }) => {
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
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeInfo, setDisputeInfo] = useState(null);
  const [mobileComposerOpen, setMobileComposerOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const consumedFocusTokenRef = useRef(null);

  // Deep-link from Home's "your turn" hero ticket straight into its thread.
  // Keyed off focusToken (bumped by Dashboard on every navigate() call),
  // not focusMatchId itself — this screen now stays permanently mounted
  // (see Dashboard's KEEP_ALIVE_TABS), so a ref keyed on the id alone would
  // never fire again for a repeat click on the same match's tile later in
  // the session.
  useEffect(() => {
    if (!focusMatchId || consumedFocusTokenRef.current === focusToken) return;
    const match = acceptedMatches.find(m => m.id === focusMatchId);
    if (match) {
      consumedFocusTokenRef.current = focusToken;
      setActiveMatch(match);
      setMobileComposerOpen(false);
    }
  }, [focusMatchId, focusToken, acceptedMatches]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchMatches = async () => {
    const { data } = await supabase
      .from('matches')
      .select(`*, flight:flights(*), request:shipment_requests(*),
        traveler:profiles!matches_traveler_id_fkey(${PROFILE_PUBLIC_COLUMNS}),
        shipper:profiles!matches_shipper_id_fkey(${PROFILE_PUBLIC_COLUMNS})`)
      .or(`traveler_id.eq.${session.user.id},shipper_id.eq.${session.user.id}`)
      .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded', 'disputed'])
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      setAcceptedMatches(data);
      // Never auto-select on this background refresh — null means the user
      // deliberately backed out to the list (or a just-completed/cancelled
      // deal dropped off), not "nothing loaded yet" (that's loadWithRetry's
      // job, once, on mount). Refreshing here used to force activeMatch back
      // to data[0], so a poll/realtime tick landing right after the user hit
      // back would silently reopen whatever chat happened to be first.
      setActiveMatch(prev => {
        if (!prev) return null;
        const still = data.find(m => m.id === prev.id);
        return still ? { ...prev, ...still } : null;
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
            traveler:profiles!matches_traveler_id_fkey(${PROFILE_PUBLIC_COLUMNS}),
            shipper:profiles!matches_shipper_id_fkey(${PROFILE_PUBLIC_COLUMNS})`)
          .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
          .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded', 'disputed'])
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

    // Polling fallback only — the realtime subscription below is the
    // primary update path, this just catches a missed event.
    const pollInterval = setInterval(async () => {
      if (cancelled) return;
      const { data } = await supabase
        .from('matches')
        .select(`*, flight:flights(*), request:shipment_requests(*),
          traveler:profiles!matches_traveler_id_fkey(${PROFILE_PUBLIC_COLUMNS}),
          shipper:profiles!matches_shipper_id_fkey(${PROFILE_PUBLIC_COLUMNS})`)
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded', 'disputed'])
        .order('created_at', { ascending: false });

      if (!data || cancelled) return;
      if (data.length > 0) {
        setAcceptedMatches(data);
        // Same rule as fetchMatches() above — don't resurrect a chat the
        // user deliberately backed out of just because the 3s poll ticked.
        setActiveMatch(prev => {
          if (!prev) return null;
          const still = data.find(m => m.id === prev.id);
          return still ? { ...prev, ...still } : null;
        });
        await fetchUnreadCounts(data);
      }
    }, 15000);

    // Realtime subscription — filtered server-side to this user's own
    // matches (traveler_id / shipper_id need two listeners: Postgrest
    // realtime filters are single-column equality only, no OR), instead of
    // receiving every match update system-wide and discarding most of them
    // client-side.
    const handleMatchUpdate = (payload) => {
      const u = payload.new;
      if (['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded', 'disputed'].includes(u.status)) {
        fetchMatches();
      }
    };
    const sub = supabase.channel(`messages-main-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `traveler_id=eq.${userId}` },
        handleMatchUpdate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `shipper_id=eq.${userId}` },
        handleMatchUpdate)
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
    if (activeMatch?.status === 'disputed') fetchDisputeInfo(activeMatch.id);
    else setDisputeInfo(null);
  }, [activeMatch?.id, activeMatch?.status]);

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
      .select(`*, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)`)
      .eq('match_id', matchId).order('created_at', { ascending: true });
    if (data) setMessages(data);
    setTimeout(scrollToBottom, 100);
    try {
      await supabase.rpc('mark_messages_read', { p_match_id: matchId, p_user_id: session.user.id });
    } catch (e) {}
    setUnreadCounts(prev => ({ ...prev, [matchId]: 0 }));
  };

  // The most recent still-open dispute on this match — 'open' covers the
  // brief window while raise_dispute's own AI call is still running, so
  // the banner below has something to show even before that resolves.
  const fetchDisputeInfo = async (matchId) => {
    const { data } = await supabase.from('disputes')
      .select('*').eq('match_id', matchId).in('status', ['open', 'escalated'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    setDisputeInfo(data || null);
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
    const { error: err } = await supabase.from('matches').update({
      [myField]: true,
      ...(otherAgreed ? { status: 'terms_agreed', deal_stage: 'terms_agreed' } : {})
    }).eq('id', activeMatch.id);
    // The DB itself refuses to let a deal reach terms_agreed while a Shop &
    // Ship mismatch is unresolved (enforce_shop_ship_resolution) — the UI
    // already hides this button in that state, but a stale client/race
    // could still hit it, so this stays a real error, not a silent no-op.
    if (err) { alert('This deal has a Shop & Ship mismatch that needs to be resolved first — see the notice above the chat.'); return; }
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

  // Explicit resolution of a Shop & Ship mismatch — either party can
  // propose it; resetting both terms_agreed_* flags reuses the exact same
  // "amend resets agreement, both must re-confirm" mechanism the deal-terms
  // amend flow already relies on, rather than a parallel agreement system.
  const resolveShopShip = async (included) => {
    const iAmTraveler = activeMatch.traveler_id === session.user.id;
    await supabase.from('matches').update({
      shop_ship_included: included,
      terms_agreed_traveler: false,
      terms_agreed_shipper: false,
    }).eq('id', activeMatch.id);
    const { data: msg } = await supabase.from('messages').insert([{
      match_id: activeMatch.id, sender_id: session.user.id,
      content: `Shop & Ship resolved by the ${iAmTraveler ? 'traveller' : 'sender'}: ${
        included ? 'the traveller will purchase and carry the item.' : 'handover only — no purchase involved.'
      } Both parties need to agree to terms again.`,
      is_read: false,
    }]).select();
    if (msg) setMessages(prev => [...prev, msg[0]]);
    setActiveMatch(prev => ({
      ...prev, shop_ship_included: included,
      terms_agreed_traveler: false, terms_agreed_shipper: false,
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
      const { travelerReceives } = calcFees(activeMatch);
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

  // Group the sidebar by the flight/request each chat actually belongs to
  // — reuses the exact same matches join Messages.jsx already fetches, no
  // new data or entities. A chat where I'm the traveler groups under its
  // flight (one flight can have several shippers); one where I'm the
  // shipper groups under its request (mine, so exactly one at a time, but
  // grouped the same way for consistency).
  const groupChats = (list, keyFn) => {
    const order = [];
    const groups = new Map();
    for (const m of list) {
      const key = keyFn(m);
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key).push(m);
    }
    return order.map(key => ({ key, matches: groups.get(key) }));
  };
  const flightChatGroups = groupChats(acceptedMatches.filter(isTraveler), m => m.flight_id);
  const requestChatGroups = groupChats(acceptedMatches.filter(m => !isTraveler(m)), m => m.request_id);

  const renderChatRow = (match) => {
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
            <p className="text-micro text-content-subtle truncate mt-0.5">{match.flight?.from_code} → {match.flight?.to_code} · {match.request?.item_name}</p>
          </div>
        </div>
      </button>
    );
  };
  const getCurrentStage = (match) => { if (!match) return 'matched'; const s = match.deal_stage || match.status || 'matched'; if (s === 'accepted') return 'matched'; return s; };
  const getStageIndex = (stage) => STAGES.findIndex(st => st.id === stage);
  const myTermsAgreed = activeMatch ? (isTraveler(activeMatch) ? activeMatch.terms_agreed_traveler : activeMatch.terms_agreed_shipper) : false;
  const myCompleted = activeMatch ? (isTraveler(activeMatch) ? activeMatch.traveler_completed : activeMatch.shipper_completed) : false;
  const otherCompleted = activeMatch ? (isTraveler(activeMatch) ? activeMatch.shipper_completed : activeMatch.traveler_completed) : false;

  // The single action blocked on this user — same precedence as the header
  // buttons above, surfaced instead as a sticky bar on mobile (§3 handoff).
  const getBlockedAction = () => {
    if (!activeMatch) return null;
    // A Shop & Ship mismatch must be explicitly resolved (see the notice
    // above the chat) before terms can be agreed at all — the DB enforces
    // this too (enforce_shop_ship_resolution), this just keeps the CTA from
    // offering an action that would fail.
    if (activeMatch.status === 'accepted' && !myTermsAgreed
      && shopShipMismatch(activeMatch) && activeMatch.shop_ship_included == null)
      return null;
    if (activeMatch.status === 'accepted' && !myTermsAgreed)
      return { label: 'Agree terms', icon: CheckCircle, onClick: agreeToTerms };
    if (isShipper(activeMatch) && activeMatch.status === 'terms_agreed')
      return { label: `Pay escrow · $${calcFees(activeMatch).shipperPays.toFixed(2)}`, icon: Lock,
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
      <p className="text-body-m text-content-muted">Chat opens once both sides accept a match</p>
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

      {showDisputeModal && activeMatch && (
        <DisputeModal
          match={activeMatch}
          session={session}
          onClose={() => setShowDisputeModal(false)}
          onFiled={(result) => {
            setShowDisputeModal(false);
            // ai_resolved lands the match on 'completed' or 'rejected'
            // (whichever the AI decided) — anything still 'disputed'
            // means it's escalated and waiting on a human. Either way the
            // authoritative state is whatever the server actually wrote,
            // so re-fetch rather than trying to guess it locally.
            fetchMatches();
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
            <p className="text-micro text-content-subtle mt-0.5">{acceptedMatches.length} active deal{acceptedMatches.length !== 1 ? 's' : ''}</p>
          </div>
          {totalUnread > 0 && (
            <span className="bg-accent-fill text-white font-mono text-micro font-bold rounded-full w-5 h-5 flex items-center justify-center">{totalUnread}</span>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {acceptedMatches.length === 0 ? null : (
            <>
              {flightChatGroups.length > 0 && (
                <div className="px-3.5 pt-3 pb-1">
                  <p className="font-mono text-overline uppercase text-content-subtle">Your flights</p>
                </div>
              )}
              {flightChatGroups.map(group => {
                const f = group.matches[0].flight;
                return (
                  <div key={`f-${group.key}`} className="border-b border-line">
                    <div className="px-3.5 py-2 bg-surface-sunken/60 flex items-center gap-1.5">
                      <Plane size={11} className="text-ink-400 flex-shrink-0" />
                      <p className="text-micro font-semibold text-content-muted truncate">
                        {f?.from_code} → {f?.to_code}{f?.flight_date ? ` · ${new Date(f.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
                      </p>
                    </div>
                    {group.matches.map(match => renderChatRow(match))}
                  </div>
                );
              })}

              {requestChatGroups.length > 0 && (
                <div className="px-3.5 pt-3 pb-1">
                  <p className="font-mono text-overline uppercase text-content-subtle">Your requests</p>
                </div>
              )}
              {requestChatGroups.map(group => {
                const r = group.matches[0].request;
                return (
                  <div key={`r-${group.key}`} className="border-b border-line">
                    <div className="px-3.5 py-2 bg-surface-sunken/60 flex items-center gap-1.5">
                      <Package size={11} className="text-ink-400 flex-shrink-0" />
                      <p className="text-micro font-semibold text-content-muted truncate">{r?.item_name}</p>
                    </div>
                    {group.matches.map(match => renderChatRow(match))}
                  </div>
                );
              })}
            </>
          )}
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
                      <p className={`hidden sm:block text-center font-mono ${isCurrent ? 'text-accent font-semibold' : 'text-content-subtle'}`} style={{ fontSize: '9px' }}>{stage.label}</p>
                    </div>
                    {i < STAGES.length - 1 && <div className={`flex-1 h-0.5 rounded-full transition-all ${isDone ? 'bg-success' : 'bg-ink-100'}`} />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Chat header — fixed height (matches the design system's
              Header chrome, 56px), identity only. Route/price/status
              moved entirely to the deal stub strip right below, so this
              bar never has to fit three different kinds of information
              into one cramped line. Name and verification badge get a
              line each instead of sharing one — a name long enough to
              truncate no longer visually collides with the badge. */}
          <div className="h-14 px-4 border-b border-line flex items-center justify-between gap-2 flex-shrink-0">
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
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-title-s text-ink-900 truncate">{getOtherParty(activeMatch)?.full_name || 'User'}</p>
                <VerificationBadge verified={getOtherParty(activeMatch)?.verified} />
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

              {/* Report a problem — only while there's actual escrow at
                  stake to redirect (in_escrow through proof_uploaded).
                  Filing pauses the normal flow (match.status flips to
                  'disputed'), so this and the buttons above become
                  mutually exclusive with it automatically. */}
              {['in_escrow', 'proof_uploaded'].includes(activeMatch.status) && (
                <button onClick={() => setShowDisputeModal(true)}
                  className="hidden md:inline-flex items-center gap-1 h-11 px-2.5 rounded-md text-label font-display font-semibold text-content-muted hover:bg-danger-tint hover:text-danger transition">
                  <AlertOctagon size={12} /> Report
                </button>
              )}

              <button onClick={() => { setShowCancelRequest(!showCancelRequest); setShowPayment(false); }}
                className="inline-flex items-center gap-1 h-11 px-2.5 rounded-md text-label font-display font-semibold text-content-muted hover:bg-danger-tint hover:text-danger transition">
                <XCircle size={12} /> Cancel
              </button>
            </div>
          </div>

          {/* Pinned deal stub — route, amount, status, tap for the full
              ticket. Shown on every viewport now: this is where deal
              context lives (matching the design system's Header +
              DealStub as two separate persistent bars), not squeezed
              into the identity header above. */}
          <button onClick={() => setShowDealDetails(true)}
            className={`flex-shrink-0 flex items-center gap-3 px-4 py-2.5 bg-surface-raised border-b border-line text-left ${blockedAction ? 'border-l-[3px] border-l-signal-500' : ''}`}>
            <div className="w-7 h-7 rounded-md bg-ink-900 flex items-center justify-center flex-shrink-0">
              <BareGlyph size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-body-s font-semibold text-ink-900">
                {activeMatch.flight?.from_code} → {activeMatch.flight?.to_code}
              </p>
              <p className="text-label text-content-subtle truncate uppercase tracking-wide">
                {isShipper(activeMatch) ? 'You pay' : 'You receive'} · {activeMatch.status === 'disputed' ? 'Disputed' : (STAGES.find(s => s.id === getCurrentStage(activeMatch)) || STAGES[0]).label}
              </p>
            </div>
            <span className="font-mono font-bold text-num-m text-ink-900 flex-shrink-0">
              ${(isShipper(activeMatch) ? calcFees(activeMatch).shipperPays : calcFees(activeMatch).travelerReceives).toFixed(2)}
            </span>
            <ChevronDown size={16} className="text-ink-400 flex-shrink-0" />
          </button>

          {/* Disputed — the AI has already run by the time this can render
              (raise_dispute runs it synchronously before returning), so
              disputeInfo.status here is only ever 'open' for the brief
              window before that request's response lands, or 'escalated'
              once it's actually sitting in the admin queue. */}
          {activeMatch.status === 'disputed' && (
            <div className="px-4 pt-3 flex-shrink-0">
              <AdvisoryBanner tone="error" title="This deal is disputed">
                {disputeInfo?.status === 'escalated'
                  ? "Escrow stays held while fetchr's team reviews this — you'll see an update here once it's resolved."
                  : 'Escrow stays held while this is reviewed.'}
                {disputeInfo?.reason && (
                  <p className="mt-1.5 text-content-muted italic">"{disputeInfo.reason}"</p>
                )}
              </AdvisoryBanner>
            </div>
          )}

          {/* Shop & Ship mismatch — must be explicitly resolved by both
              parties before terms can be agreed (enforced in the DB too).
              Covers both directions: sender wants a purchase the flight
              doesn't offer, or the flight offers one the sender never asked
              for. */}
          {activeMatch.status === 'accepted' && shopShipMismatch(activeMatch) && activeMatch.shop_ship_included == null && (
            <div className="px-4 pt-3 flex-shrink-0">
              <AdvisoryBanner tone="warning" title="Shop & Ship doesn't match">
                {activeMatch.request?.requires_purchase
                  ? 'The sender wants the traveller to buy the item, but this flight only offers handover.'
                  : 'The traveller offers to buy items on this flight, but this request is handover only.'}
                {' '}Agree how to handle it before continuing.
                <div className="flex gap-2 mt-2">
                  <button onClick={() => resolveShopShip(false)} className="btn-secondary flex-1 text-label">
                    Handover only
                  </button>
                  <button onClick={() => resolveShopShip(true)} className="btn-secondary flex-1 text-label">
                    Traveller will buy &amp; ship
                  </button>
                </div>
              </AdvisoryBanner>
            </div>
          )}

          {/* Safety notice — reflects the resolved Shop & Ship outcome
              (never the raw, possibly-mismatched request field), and only
              shows once there's nothing left to resolve. */}
          {activeMatch.status === 'accepted' && !(shopShipMismatch(activeMatch) && activeMatch.shop_ship_included == null) && (
            <div className="px-4 pt-3 flex-shrink-0">
              <AdvisoryBanner tone={isTraveler(activeMatch) ? 'warning' : 'info'}>
                {resolvedIsPurchase(activeMatch)
                  ? isTraveler(activeMatch) ? 'Only purchase the item once escrow is confirmed paid.' : 'Once you agree terms and pay escrow, the traveller will purchase your item at the destination.'
                  : isTraveler(activeMatch) ? 'Only accept the item from the sender once escrow is confirmed paid.' : 'Hand the item to the traveller before their flight. Your payment is secured in escrow until both parties confirm delivery.'
                }
              </AdvisoryBanner>
            </div>
          )}

          {/* Terms status */}
          {activeMatch.status === 'accepted' && (
            <div className="bg-surface-sunken px-4 py-2 flex items-center gap-4 text-body-s border-b border-line flex-shrink-0">
              <p className="text-content-muted font-semibold">Terms:</p>
              <span className={`flex items-center gap-1 font-semibold ${activeMatch.terms_agreed_traveler ? 'text-success' : 'text-ink-300'}`}>
                {activeMatch.terms_agreed_traveler ? <CheckCircle size={13} /> : <Circle size={13} />} Traveller
              </span>
              <span className={`flex items-center gap-1 font-semibold ${activeMatch.terms_agreed_shipper ? 'text-success' : 'text-ink-300'}`}>
                {activeMatch.terms_agreed_shipper ? <CheckCircle size={13} /> : <Circle size={13} />} Sender
              </span>
              <p className="text-content-subtle ml-auto text-right">{!myTermsAgreed ? 'Tap "Agree terms" to proceed' : 'Waiting for other party'}</p>
            </div>
          )}

          {/* Escrow pending notice — copy per BRAND.md §9.2 */}
          {activeMatch.status === 'terms_agreed' && (
            <div className="px-4 pt-3 flex-shrink-0">
              <AdvisoryBanner tone="info">
                {isShipper(activeMatch)
                  ? `You'll pay $${calcFees(activeMatch).shipperPays.toFixed(2)} now. We hold it until you both confirm delivery.`
                  : `Nothing to do yet — ${getOtherParty(activeMatch)?.full_name || 'the sender'} pays into escrow before you fly.`}
              </AdvisoryBanner>
            </div>
          )}

          {/* Flight-not-yet-flown notice — delivery can't be confirmed early */}
          {['proof_uploaded', 'in_escrow'].includes(activeMatch.status) && !myCompleted && !flightHasDeparted(activeMatch) && (
            <div className="px-4 pt-3 flex-shrink-0">
              <AdvisoryBanner tone="info">
                Confirming delivery opens up on {new Date(activeMatch.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, once the flight has taken place.
              </AdvisoryBanner>
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
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === session.user.id;
              const prevMsg = messages[idx - 1];
              const isNewDay = !prevMsg || new Date(prevMsg.created_at).toDateString() !== new Date(msg.created_at).toDateString();
              // Grouped run of consecutive bubbles from the same sender —
              // only the first shows an avatar/wider gap, so a burst of
              // quick messages reads as one thought instead of a wall of
              // repeated avatars. A system/proof card or a day boundary
              // always breaks the run.
              const groupedWithPrev = !isNewDay && prevMsg && prevMsg.sender_id === msg.sender_id
                && !isSystemMessage(prevMsg.content)
                && !(prevMsg.content?.includes('PROOF_IMAGE_1:') || prevMsg.content?.startsWith('📸 PROOF UPLOADED:') || prevMsg.content?.startsWith('Proof uploaded:'));
              const isLastMine = isMe && idx === messages.length - 1;

              const dateSeparator = isNewDay && (
                <div key={`day-${msg.id}`} className="flex justify-center py-1">
                  <span className="font-mono text-overline uppercase text-content-subtle bg-surface-sunken border border-line rounded-full px-3 py-1">
                    {new Date(msg.created_at).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                  </span>
                </div>
              );

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
                  <React.Fragment key={msg.id}>
                    {dateSeparator}
                    <div className="flex justify-center">
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
                        <p className="text-micro text-content-subtle mt-1">Tap photos to view full size</p>
                      </div>
                    </div>
                  </React.Fragment>
                );
              }
              if (isSystemMessage(msg.content)) {
                const { icon: EventIcon, tone } = getSystemEventStyle(msg.content);
                return (
                  <React.Fragment key={msg.id}>
                    {dateSeparator}
                    <div className="flex justify-center">
                      {/* bg-ink-50, not bg-surface-sunken — that semantic token goes
                          near-black under system dark mode while text-ink-900 stays
                          literal-dark, producing the black-on-black bug. */}
                      <div className="flex items-start gap-2.5 bg-ink-50 border border-line rounded-lg px-3.5 py-2.5 max-w-sm w-full">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${EVENT_TONE_CLASSES[tone]}`}>
                          <EventIcon size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-body-s text-ink-900 leading-relaxed">{msg.content}</p>
                          <p className="font-mono text-micro text-ink-500 mt-0.5">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              }
              return (
                <React.Fragment key={msg.id}>
                  {dateSeparator}
                  <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${groupedWithPrev ? 'mt-0.5' : 'mt-2'}`}>
                    {!isMe && (
                      <div className="w-7 h-7 flex-shrink-0 mr-2">
                        {!groupedWithPrev && (
                          <div className="w-7 h-7 rounded-avatar bg-ink-100 flex items-center justify-center text-micro font-mono font-semibold text-ink-600 mt-1">
                            {getInitials(msg.sender?.full_name)}
                          </div>
                        )}
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
                      {(!groupedWithPrev || idx === messages.length - 1) && (
                        <p className={`font-mono text-micro text-content-subtle mt-0.5 px-1 flex items-center gap-1 ${isMe ? 'text-right' : ''}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          {isLastMine && msg.is_read && <span>· Seen</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </React.Fragment>
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
                  className="w-full text-center text-body-s text-content-muted">
                  Message instead
                </button>
              </div>
            ) : null}
            <div className={`${blockedAction && !mobileComposerOpen ? 'hidden' : ''} md:block p-3`}>
              {blockedAction && (
                <button onClick={() => setMobileComposerOpen(false)}
                  className="md:hidden mb-2 flex items-center gap-1.5 text-label text-content-muted">
                  <blockedAction.icon size={12} /> Back to {blockedAction.label}
                </button>
              )}
              <div className="flex items-end gap-2">
                <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown} placeholder="Type a message (Enter to send)"
                  rows={1} className="flex-1 input-field resize-none py-2.5 text-body-m min-h-[42px] max-h-24"
                  onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'; }} />
                <button onClick={sendMessage} disabled={!newMessage.trim() || sending}
                  className="w-11 h-11 bg-ink-900 rounded-md flex items-center justify-center hover:bg-ink-700 transition disabled:opacity-50 flex-shrink-0">
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
          <p className="text-body-m text-content-muted">Choose a deal from the sidebar to start chatting</p>
        </div>
      )}
    </div>
  );
};

export default Messages;