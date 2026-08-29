import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, Plane, DollarSign, Clock, Lock,
  MessageCircle, ChevronRight, Zap, Check, X
} from 'lucide-react';

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

const stepIndex = (statusKey) => {
  const i = STEPS.findIndex(s => s.key === statusKey);
  return i === -1 ? 0 : i;
};

// Tracking timeline — docs/BRAND.md §7.15
const Timeline = ({ currentKey, waitingOnMe, isFailed }) => {
  const currentIdx = isFailed ? -1 : stepIndex(currentKey === 'accepted' ? 'matched' : currentKey);

  return (
    <ol className="flex md:items-start gap-0" aria-label="Deal progress">
      {STEPS.map((step, i) => {
        const isComplete = !isFailed && i < currentIdx;
        const isCurrent = !isFailed && i === currentIdx;
        const isFailedHere = isFailed && i === currentIdx;
        const isUpcoming = !isComplete && !isCurrent && !isFailedHere;

        let marker;
        let markerClass;
        let stateWord;
        if (isComplete) {
          markerClass = 'bg-success text-success-on';
          marker = <Check size={12} />;
          stateWord = 'Completed';
        } else if (isFailedHere) {
          markerClass = 'bg-danger text-white';
          marker = <X size={12} />;
          stateWord = 'Failed';
        } else if (isCurrent && waitingOnMe) {
          markerClass = 'bg-accent-fill text-white ring-2 ring-signal-500 ring-offset-2';
          marker = null;
          stateWord = 'Current step, waiting for you';
        } else if (isCurrent) {
          markerClass = 'bg-surface border-2 border-line-strong';
          marker = null;
          stateWord = 'Current step, waiting for the other party';
        } else {
          markerClass = 'bg-ink-200';
          marker = null;
          stateWord = 'Not started';
        }

        const connectorClass = isComplete
          ? 'bg-success'
          : isCurrent
            ? 'border-t-2 border-dashed border-line-perf'
            : 'bg-ink-100';

        return (
          <li key={step.key} className="flex-1 flex md:flex-col items-center md:items-stretch min-w-0"
            {...(isCurrent ? { 'aria-current': 'step' } : {})}>
            <span className="sr-only">{stateWord}: {step.label}</span>
            <div className="flex md:flex-row items-center w-full">
              <div className={`w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0 ${markerClass}`}
                aria-hidden="true">
                {marker}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`hidden md:block flex-1 h-0.5 mx-1 ${connectorClass}`} aria-hidden="true" />
              )}
            </div>
            <p className={`mt-1 text-label md:text-center truncate ${
              isComplete || isCurrent ? 'text-content font-medium' : 'text-content-subtle'
            }`}>
              {step.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
};

const ActiveDeals = ({ session, onNavigate }) => {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDeals = async () => {
    setLoading(true);
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
    setLoading(false);
  };

  useEffect(() => {
    fetchDeals();
    // Real-time updates
    const sub = supabase.channel('active-deals-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' },
        () => fetchDeals())
      .subscribe();
    return () => supabase.removeChannel(sub);
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

  const getDealValue = (deal) =>
    (deal.agreed_price_per_kg || deal.flight?.price_per_kg || 0) *
    (deal.agreed_weight_kg || deal.request?.weight_kg || 0);

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

  // Escrow copy, docs/BRAND.md §9.2 — exact wording, never "funds"/"disbursement"/"guaranteed"
  const getEscrowSentence = (deal, isTrav, otherName, needsAction, dealValue) => {
    const status = deal.deal_stage || deal.status;
    if (status === 'terms_agreed') {
      return !isTrav
        ? `You'll pay $${dealValue.toFixed(2)} now. We hold it until you both confirm delivery.`
        : `Nothing to do yet — ${otherName} pays into escrow before you fly.`;
    }
    if (status === 'in_escrow') {
      return `$${dealValue.toFixed(2)} is held by fetchr. Neither side can move it alone.`;
    }
    if (status === 'proof_uploaded') {
      return needsAction
        ? `Confirm you received it and we release $${dealValue.toFixed(2)} to ${otherName}.`
        : `Waiting on ${otherName} to confirm delivery.`;
    }
    return getStage(deal).desc;
  };

  // Status pill, docs/BRAND.md §7.13 / §9.2
  const getPill = (deal, isTrav, otherName, needsAction) => {
    const status = deal.deal_stage || deal.status;
    if (status === 'in_escrow') return { label: 'ESCROW SECURED', className: 'bg-success-tint text-success' };
    if (needsAction) {
      const label = status === 'terms_agreed' ? 'YOUR TURN · PAY ESCROW'
        : status === 'proof_uploaded' ? 'YOUR TURN · CONFIRM DELIVERY'
        : 'YOUR TURN';
      return { label, className: 'bg-accent-fill text-white' };
    }
    return { label: `WAITING ON ${(otherName || 'other party').toUpperCase()}`, className: 'bg-ink-100 text-content-muted' };
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
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
        {deals.length > 0 && (
          <div className="flex items-center gap-1.5 bg-success-tint text-success px-2.5 py-1 rounded-sm font-mono text-overline uppercase">
            <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
            Live
          </div>
        )}
      </div>

      {deals.length === 0 ? (
        <div className="text-center py-24 ticket">
          <div className="w-20 h-20 bg-ink-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Zap size={32} className="text-ink-300" />
          </div>
          <h2 className="font-display font-bold text-title-m text-ink-900 mb-2">No active deals</h2>
          <p className="text-body-m text-ink-muted mb-6">Accept a match to start a deal.</p>
          <button onClick={() => onNavigate('matches')} className="btn-primary">
            Browse matches
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {deals.map(deal => {
            const other = getOtherParty(deal);
            const otherName = other?.full_name || 'the other party';
            const stage = getStage(deal);
            const dealValue = getDealValue(deal);
            const needsAction = myActionNeeded(deal);
            const isTrav = isTraveler(deal);
            const myRole = isTrav ? 'Traveller' : 'Sender';
            const statusKey = deal.deal_stage || deal.status;
            const isFailed = statusKey === 'cancelled' || statusKey === 'disputed';
            const pill = getPill(deal, isTrav, otherName, needsAction);
            const escrowSentence = getEscrowSentence(deal, isTrav, otherName, needsAction, dealValue);

            return (
              <div key={deal.id} className="ticket">

                {/* Header bar */}
                <div className="px-4 py-2.5 flex items-center justify-between border-b border-line">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center h-[22px] px-2 rounded-sm font-mono text-overline uppercase ${pill.className}`}>
                      {pill.label}
                    </span>
                    {isFailed && (
                      <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-danger-tint text-danger font-mono text-overline uppercase">
                        {stage.label}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-overline uppercase text-ink-muted">
                    {myRole}
                  </span>
                </div>

                <div className="p-4">
                  {/* Route */}
                  <div className="flex items-center gap-2 mb-3">
                    <Plane size={14} className="text-ink-500 flex-shrink-0" />
                    <p className="text-body-m font-semibold text-ink-900">
                      {deal.flight?.from_city || deal.flight?.from_code} → {deal.flight?.to_city || deal.flight?.to_code}
                    </p>
                    <p className="text-body-s text-ink-subtle ml-auto">
                      {deal.flight?.flight_date
                        ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short'
                          })
                        : ''}
                    </p>
                  </div>

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
                        <DollarSign size={10} /> Deal value
                      </p>
                      <p className="font-mono font-semibold text-num-m text-ink-900">
                        ${dealValue.toFixed(2)}
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
                      <p className="text-body-m font-semibold text-ink-900">
                        {other?.full_name || 'User'}
                      </p>
                      <p className="text-body-s text-ink-subtle">
                        {isTrav ? 'Sender' : 'Traveller'}
                      </p>
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ActiveDeals;
