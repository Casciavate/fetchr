import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, Plane, DollarSign, Clock, Lock,
  MessageCircle, ChevronRight, ChevronDown, ChevronUp, Zap, Check, X
} from 'lucide-react';
import StatusPill from './shared/StatusPill';
import EmptyState from './shared/EmptyState';
import { TicketSkeleton } from './shared/Skeleton';
import VerificationBadge from './shared/VerificationBadge';
import RatingDisplay from './shared/RatingDisplay';
import ReviewsSheet from './shared/ReviewsSheet';
import { calcFees } from './EscrowPayment';

const STEPS = [
  { key: 'matched', label: 'Matched' },
  { key: 'terms_agreed', label: 'Terms agreed' },
  { key: 'in_escrow', label: 'Escrow paid' },
  { key: 'proof_uploaded', label: 'Proof uploaded' },
  { key: 'completed', label: 'Delivered' },
];

const STAGE_INFO = {
  accepted: { label: 'Matched', desc: 'Chat to agree terms.' },
  matched: { label: 'Matched', desc: 'Chat to agree terms.' },
  terms_agreed: { label: 'Terms agreed', desc: 'Terms agreed.' },
  in_escrow: { label: 'Escrow paid', desc: 'Payment secured.' },
  proof_uploaded: { label: 'Proof uploaded', desc: 'Both parties confirm delivery.' },
  completed: { label: 'Delivered', desc: 'Delivered.' },
  cancelled: { label: 'Cancelled', desc: 'No money moved.' },
  disputed: { label: 'Disputed', desc: 'This deal is on hold.' },
};

// Barcode strip, docs/BRAND.md §7.7 item 5 / Assumptions #8 — decorative
// today, encodes match id + route + date as text only (no scanner reads
// this yet; it's specified so a real handover code can replace it later
// without a redesign).
const Barcode = ({ deal }) => {
  const ref = deal.id.slice(0, 6).toUpperCase();
  const route = `${deal.flight?.from_code || '???'}${deal.flight?.to_code || '???'}`;
  const ddmmyy = deal.flight?.flight_date
    ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '')
    : '------';
  // Deterministic bar weights from the ref (repeated to fill a full row of
  // bars), stable per deal. Bars use flex so the strip spans the card
  // width instead of staying a small fixed-width cluster.
  // Real boarding-pass barcodes (Code128-style) are packed with many thin
  // bars of varying width, not a handful of thick blocks — that's what
  // was reading as "stretched/unrealistic". More bars, 1px each at most,
  // 1px gaps, shorter height.
  const code = ref + route + ddmmyy;
  const bars = Array.from({ length: 70 }, (_, i) => (code.charCodeAt(i % code.length) % 2) + 1);
  return (
    <div className="pt-4 mt-1 -mx-2">
      <div className="perf mb-3 mx-2" />
      <div className="h-[22px] flex items-stretch gap-px px-2" aria-hidden="true">
        {bars.map((w, i) => (
          <div key={i} className="bg-ink-900" style={{ flex: w, opacity: 0.82 }} />
        ))}
      </div>
      <p className="mt-1.5 text-center font-mono text-overline text-ink-muted tracking-[0.28em]">
        {ref}·{route}·{ddmmyy}
      </p>
    </div>
  );
};

const stepIndex = (statusKey) => {
  const i = STEPS.findIndex(s => s.key === statusKey);
  return i === -1 ? 0 : i;
};

// Tracking timeline — docs/BRAND.md §7.15. A cramped 5-column horizontal
// row with truncated captions doesn't read on phone width, so mobile gets
// a real vertical stepper; md+ keeps the horizontal row (there's room).
const stepState = (i, currentIdx, isFailed, waitingOnMe) => {
  if (isFailed && i === currentIdx) return { kind: 'failed', word: 'Failed' };
  if (!isFailed && i < currentIdx) return { kind: 'complete', word: 'Completed' };
  if (!isFailed && i === currentIdx) return waitingOnMe
    ? { kind: 'current-mine', word: 'Current step, waiting for you' }
    : { kind: 'current-other', word: 'Current step, waiting for the other party' };
  return { kind: 'upcoming', word: 'Not started' };
};

const MARKER_CLASS = {
  complete: 'bg-success text-success-on',
  failed: 'bg-danger text-white',
  'current-mine': 'bg-accent-fill text-white ring-2 ring-signal-500 ring-offset-2',
  'current-other': 'bg-surface border-2 border-line-strong',
  upcoming: 'bg-ink-200',
};

const Timeline = ({ currentKey, waitingOnMe, isFailed }) => {
  const currentIdx = isFailed ? -1 : stepIndex(currentKey === 'accepted' ? 'matched' : currentKey);

  return (
    <>
      {/* Mobile — vertical stepper */}
      <ol className="md:hidden flex flex-col" aria-label="Deal progress">
        {STEPS.map((step, i) => {
          const s = stepState(i, currentIdx, isFailed, waitingOnMe);
          return (
            <li key={step.key} className="flex gap-3" {...(s.kind.startsWith('current') ? { 'aria-current': 'step' } : {})}>
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0 ${MARKER_CLASS[s.kind]}`} aria-hidden="true">
                  {s.kind === 'complete' && <Check size={12} />}
                  {s.kind === 'failed' && <X size={12} />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-0.5 flex-1 min-h-[16px] my-0.5 ${s.kind === 'complete' ? 'bg-success' : 'bg-ink-100'}`} aria-hidden="true" />
                )}
              </div>
              <div className="pb-3 min-w-0">
                <span className="sr-only">{s.word}: </span>
                <p className={`text-body-s ${s.kind === 'complete' || s.kind.startsWith('current') ? 'text-content font-semibold' : 'text-content-subtle'}`}>
                  {step.label}
                </p>
                {s.kind.startsWith('current') && (
                  <p className="text-label text-ink-subtle">{waitingOnMe ? 'Waiting on you' : 'Waiting on the other party'}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Desktop — horizontal row */}
      <ol className="hidden md:flex md:items-start gap-0" aria-label="Deal progress">
        {STEPS.map((step, i) => {
          const s = stepState(i, currentIdx, isFailed, waitingOnMe);
          const connectorClass = s.kind === 'complete'
            ? 'bg-success'
            : s.kind.startsWith('current')
              ? 'border-t-2 border-dashed border-line-perf'
              : 'bg-ink-100';
          return (
            <li key={step.key} className="flex-1 flex flex-col items-stretch min-w-0"
              {...(s.kind.startsWith('current') ? { 'aria-current': 'step' } : {})}>
              <span className="sr-only">{s.word}: {step.label}</span>
              <div className="flex flex-row items-center w-full">
                <div className={`w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0 ${MARKER_CLASS[s.kind]}`} aria-hidden="true">
                  {s.kind === 'complete' && <Check size={12} />}
                  {s.kind === 'failed' && <X size={12} />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 ${connectorClass}`} aria-hidden="true" />
                )}
              </div>
              <p className={`mt-1 text-label text-center truncate ${
                s.kind === 'complete' || s.kind.startsWith('current') ? 'text-content font-medium' : 'text-content-subtle'
              }`}>
                {step.label}
              </p>
            </li>
          );
        })}
      </ol>
    </>
  );
};

const ActiveDeals = ({ session, onNavigate }) => {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [reviewsFor, setReviewsFor] = useState(null);

  const fetchDeals = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        flight:flights(*),
        request:shipment_requests(*),
        traveler:profiles!matches_traveler_id_fkey(*),
        shipper:profiles!matches_shipper_id_fkey(*)
      `)
      .or(`traveler_id.eq.${session.user.id},shipper_id.eq.${session.user.id}`)
      .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
      .order('created_at', { ascending: false });
    if (data) setDeals(data);
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    fetchDeals();
    // Real-time updates
    const sub = supabase.channel('active-deals-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' },
        () => fetchDeals(false))
      .subscribe();
    // Polling fallback — every 5 seconds, in case a realtime event is missed
    // (same resilience pattern as Matches.jsx / Dashboard.jsx). This is what
    // was missing: escrow payment updates the DB correctly, but a tab left
    // open on this screen before payment could stay stale if the realtime
    // event didn't land, showing "Terms agreed" after the sender had already
    // paid into escrow.
    const pollInterval = setInterval(() => fetchDeals(false), 5000);
    return () => {
      supabase.removeChannel(sub);
      clearInterval(pollInterval);
    };
  }, []);

  const isTraveler = (deal) => deal.traveler_id === session.user.id;
  const getOtherParty = (deal) => isTraveler(deal) ? deal.shipper : deal.traveler;
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStage = (deal) => {
    const s = deal.deal_stage || deal.status || 'accepted';
    return STAGE_INFO[s] || STAGE_INFO['accepted'];
  };

  const myActionNeeded = (deal) => {
    const isTrav = isTraveler(deal);
    const status = deal.deal_stage || deal.status;
    if (status === 'accepted' || status === 'matched') {
      const myTerms = isTrav ? deal.terms_agreed_traveler : deal.terms_agreed_shipper;
      return !myTerms;
    }
    if (status === 'terms_agreed') return !isTrav; // sender needs to pay
    if (status === 'in_escrow') return isTrav; // traveller needs to upload proof
    if (status === 'proof_uploaded') {
      const myDone = isTrav ? deal.traveler_completed : deal.shipper_completed;
      return !myDone;
    }
    return false;
  };

  // Escrow copy, docs/BRAND.md §9.2 — exact wording, never "funds"/"disbursement"/"guaranteed".
  // Uses the full escrowed amount (transport + shop fee + item price, per
  // CLAUDE.md's fee formula), not the plain price×weight lump — a deal
  // with a purchase price previously understated what's actually held.
  const getEscrowSentence = (deal, isTrav, otherName, needsAction, fees) => {
    const status = deal.deal_stage || deal.status;
    if (status === 'terms_agreed') {
      return !isTrav
        ? `You'll pay $${fees.totalShipperPays.toFixed(2)} now. We hold it until you both confirm delivery.`
        : `Nothing to do yet — ${otherName} pays into escrow before you fly.`;
    }
    if (status === 'in_escrow') {
      return `$${fees.totalShipperPays.toFixed(2)} is held by fetchr. Neither side can move it alone.`;
    }
    if (status === 'proof_uploaded') {
      return needsAction
        ? `Confirm you received it and we release $${fees.totalShipperPays.toFixed(2)} to ${otherName}.`
        : `Waiting on ${otherName} to confirm delivery.`;
    }
    return getStage(deal).desc;
  };

  // Status pill, docs/BRAND.md §7.13 / §9.2
  const getPill = (deal, isTrav, otherName, needsAction) => {
    const status = deal.deal_stage || deal.status;
    if (status === 'in_escrow') return { label: 'Escrow secured', tone: 'success' };
    if (needsAction) {
      const label = status === 'terms_agreed' ? 'Your turn · Pay escrow'
        : status === 'proof_uploaded' ? 'Your turn · Confirm delivery'
        : 'Your turn';
      return { label, tone: 'signal' };
    }
    return { label: `Waiting on ${otherName || 'other party'}`, tone: 'neutral' };
  };

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-4">
      {[1, 2].map(i => <TicketSkeleton key={i} />)}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-title-l text-ink-900">Active deals</h1>
          <p className="text-body-s text-ink-muted mt-0.5">
            {deals.length} deal{deals.length !== 1 ? 's' : ''} in progress
          </p>
        </div>
        {deals.length > 0 && <StatusPill tone="success" dot>Live</StatusPill>}
      </div>

      {deals.length === 0 ? (
        <EmptyState icon={Zap} title="No active deals" body="Accept a match to start a deal."
          action={<button onClick={() => onNavigate('matches')} className="btn-primary">Browse matches</button>} />
      ) : (
        <div className="space-y-4">
          {deals.map(deal => {
            const other = getOtherParty(deal);
            const otherName = other?.full_name || 'the other party';
            const stage = getStage(deal);
            const fees = calcFees(deal);
            const needsAction = myActionNeeded(deal);
            const isTrav = isTraveler(deal);
            const myRole = isTrav ? 'Traveller' : 'Sender';
            const statusKey = deal.deal_stage || deal.status;
            const isFailed = statusKey === 'cancelled' || statusKey === 'disputed';
            const pill = getPill(deal, isTrav, otherName, needsAction);
            const escrowSentence = getEscrowSentence(deal, isTrav, otherName, needsAction, fees);

            const isExpanded = expandedId === deal.id || (deals.length === 1 && expandedId === null);
            const amount = isTrav ? fees.travelerReceives : fees.totalShipperPays;

            return (
              <div key={deal.id} className="ticket relative">
                {isFailed && (
                  <span className={`stamp ${statusKey === 'disputed' ? 'text-danger' : 'text-ink-400'}`} aria-hidden="true">
                    {statusKey === 'disputed' ? 'Disputed' : 'Void'}
                  </span>
                )}

                {/* Header bar */}
                <div className="px-4 py-2.5 flex items-center justify-between border-b border-line">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isFailed
                      ? <StatusPill tone="danger">{stage.label}</StatusPill>
                      : <StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
                  </div>
                  <span className="font-mono text-overline uppercase text-ink-muted">
                    {myRole}
                  </span>
                </div>

                {/* Always-visible summary — tap to expand full details.
                    Keeps the screen scannable with several concurrent deals. */}
                <button onClick={() => setExpandedId(isExpanded ? null : deal.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-sunken transition">
                  <Plane size={14} className="text-ink-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-body-m font-semibold text-ink-900 truncate">
                      {deal.flight?.from_code} → {deal.flight?.to_code}
                    </p>
                    <p className="text-body-s text-ink-subtle truncate">{deal.request?.item_name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono font-semibold text-num-m text-ink-900">${amount.toFixed(2)}</p>
                    <p className="text-label text-ink-subtle">{isTrav ? 'you receive' : 'you pay'}</p>
                  </div>
                  {isExpanded ? <ChevronUp size={18} className="text-ink-400 flex-shrink-0" /> : <ChevronDown size={18} className="text-ink-400 flex-shrink-0" />}
                </button>

                {isExpanded && (
                <div className="p-4 pt-0">
                  {/* Item + Value */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-surface-sunken rounded-md p-3 border border-line">
                      <p className="text-overline uppercase text-ink-400 font-mono mb-1 flex items-center gap-1">
                        <Package size={10} /> Item
                      </p>
                      <p className="text-body-m font-semibold text-ink-900 truncate">
                        {deal.request?.item_name}
                      </p>
                      <p className="text-body-s text-ink-muted">
                        {deal.agreed_weight_kg || deal.request?.weight_kg} kg
                      </p>
                    </div>
                    <div className="bg-surface-sunken rounded-md p-3 border border-line">
                      <p className="text-overline uppercase text-ink-400 font-mono mb-1 flex items-center gap-1">
                        <DollarSign size={10} /> {isTrav ? 'You receive' : 'You pay'}
                      </p>
                      <p className="font-mono font-semibold text-num-m text-ink-900">
                        ${(isTrav ? fees.travelerReceives : fees.totalShipperPays).toFixed(2)}
                      </p>
                      <p className="text-body-s text-ink-muted">
                        ${deal.agreed_price_per_kg || deal.flight?.price_per_kg}/kg
                      </p>
                    </div>
                  </div>

                  {/* Other party */}
                  <div className="flex items-center gap-3 mb-4 p-3 bg-surface-sunken rounded-md border border-line">
                    <div className="w-9 h-9 rounded-avatar bg-ink-900 flex items-center justify-center text-body-s font-mono font-semibold text-paper-100 flex-shrink-0">
                      {getInitials(other?.full_name)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-body-m font-semibold text-ink-900">
                          {other?.full_name || 'User'}
                        </p>
                        <VerificationBadge verified={other?.verified} />
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-body-s text-ink-subtle">
                          {isTrav ? 'Sender' : 'Traveller'}
                        </p>
                        {other?.id && (
                          <RatingDisplay rating={other?.rating} totalReviews={other?.total_reviews}
                            size={11} onClick={() => setReviewsFor({ id: other.id, name: other.full_name })} />
                        )}
                      </div>
                    </div>
                    {deal.status === 'in_escrow' && (
                      <div className="flex items-center gap-1 bg-success-tint text-success font-mono text-overline uppercase px-2 py-1 rounded-sm">
                        <Lock size={10} /> Escrow secured
                      </div>
                    )}
                  </div>

                  {/* Tracking timeline — §7.15 */}
                  <div className="mb-4">
                    <Timeline
                      currentKey={statusKey === 'accepted' ? 'matched' : statusKey}
                      waitingOnMe={needsAction}
                      isFailed={isFailed}
                    />
                  </div>

                  {/* Escrow / next-action sentence */}
                  <div className="text-body-s p-2.5 rounded-md mb-3 bg-surface-sunken border border-line text-content">
                    {escrowSentence}
                  </div>

                  {/* Completion status */}
                  {(deal.status === 'proof_uploaded' || deal.traveler_completed || deal.shipper_completed) && (
                    <div className="flex items-center gap-4 text-body-s mb-3 bg-surface-sunken rounded-md p-3 border border-line">
                      <span className={`flex items-center gap-1 font-medium ${
                        deal.traveler_completed ? 'text-success' : 'text-ink-300'
                      }`}>
                        {deal.traveler_completed ? <Check size={12} /> : <Clock size={12} />}
                        Traveller confirmed
                      </span>
                      <span className={`flex items-center gap-1 font-medium ${
                        deal.shipper_completed ? 'text-success' : 'text-ink-300'
                      }`}>
                        {deal.shipper_completed ? <Check size={12} /> : <Clock size={12} />}
                        Sender confirmed
                      </span>
                    </div>
                  )}

                  <button
                    onClick={() => onNavigate('messages')}
                    className="w-full btn-primary py-3">
                    <MessageCircle size={15} />
                    Open chat
                    <ChevronRight size={15} />
                  </button>

                  <Barcode deal={deal} />
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {reviewsFor && (
        <ReviewsSheet userId={reviewsFor.id} userName={reviewsFor.name} onClose={() => setReviewsFor(null)} />
      )}
    </div>
  );
};

export default ActiveDeals;
