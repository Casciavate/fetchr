import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  CheckCircle, Star, Package, Plane, ChevronDown,
  ChevronUp, Award, TrendingUp
} from 'lucide-react';
import RatingDisplay from './shared/RatingDisplay';
import ReviewsSheet from './shared/ReviewsSheet';
import StatusPill from './shared/StatusPill';
import EmptyState from './shared/EmptyState';
import { TicketSkeleton } from './shared/Skeleton';

// Barcode strip, docs/BRAND.md §7.7 item 5 / Assumptions #8 — same
// treatment as the active-deal ticket, carried through to the completed
// ticket so the deal keeps its reference code visible after delivery.
const Barcode = ({ deal }) => {
  const ref = deal.id.slice(0, 6).toUpperCase();
  const route = `${deal.flight?.from_code || '???'}${deal.flight?.to_code || '???'}`;
  const ddmmyy = deal.flight?.flight_date
    ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '')
    : '------';
  const code = ref + route + ddmmyy;
  const bars = Array.from({ length: 40 }, (_, i) => (code.charCodeAt(i % code.length) % 3) + 1);
  return (
    <div className="pt-4 -mx-2">
      <div className="perf mb-3 mx-2" />
      <div className="h-[26px] flex items-stretch gap-[2px] px-2" aria-hidden="true">
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

const Completed = ({ session, focusDealId }) => {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [ratings, setRatings] = useState({});
  const [comments, setComments] = useState({});
  const [submittingRating, setSubmittingRating] = useState({});
  const [ratedDeals, setRatedDeals] = useState({});
  const [reviewsFor, setReviewsFor] = useState(null);

  // Deep-link from Profile's "Completed deals" list straight into this
  // deal's expanded boarding-pass detail — same one-shot pattern as
  // Messages.jsx's focusMatchId.
  const consumedFocusRef = useRef(null);
  useEffect(() => {
    if (!focusDealId || consumedFocusRef.current === focusDealId) return;
    if (deals.some(d => d.id === focusDealId)) {
      consumedFocusRef.current = focusDealId;
      setExpandedId(focusDealId);
    }
  }, [focusDealId, deals]);

  const fetchCompleted = async () => {
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
      .eq('status', 'completed')
      .order('created_at', { ascending: false });
    if (data) setDeals(data);

    // Load this user's own reviews for these deals, so "already rated" is a
    // real, persisted fact — not local state that resets on reload (which
    // was the previous behaviour and could let someone submit twice).
    if (data?.length) {
      const { data: myReviews } = await supabase
        .from('reviews')
        .select('match_id, rating, comment')
        .eq('reviewer_id', session.user.id)
        .in('match_id', data.map(d => d.id));
      if (myReviews) {
        const map = {};
        myReviews.forEach(r => { map[r.match_id] = { rating: r.rating, comment: r.comment }; });
        setRatedDeals(map);
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchCompleted(); }, []);

  const isTraveler = (deal) => deal.traveler_id === session.user.id;
  const getOtherParty = (deal) => isTraveler(deal) ? deal.shipper : deal.traveler;

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getDealValue = (deal) => {
    return (deal.agreed_price_per_kg || deal.flight?.price_per_kg || 0) *
      (deal.agreed_weight_kg || deal.request?.weight_kg || 0);
  };

  const getFetchrPct = (value) => {
    if (value >= 500) return 0.07;
    if (value >= 200) return 0.085;
    if (value < 20 && value > 0) return 0.12;
    return 0.10;
  };

  // Inserting into `reviews` — a DB trigger (recalc_profile_rating) recomputes
  // the reviewee's profiles.rating/total_reviews server-side. The previous
  // version tried to update the OTHER party's profile row directly from the
  // client, which profiles' RLS policy (auth.uid() = id) silently blocks —
  // that's why ratings never showed up on the other person's profile.
  const submitRating = async (dealId, otherPartyId, rating, comment) => {
    setSubmittingRating(prev => ({ ...prev, [dealId]: true }));
    const { error } = await supabase.from('reviews').insert([{
      match_id: dealId,
      reviewer_id: session.user.id,
      reviewee_id: otherPartyId,
      rating,
      comment: comment?.trim() || null,
    }]);
    if (!error) {
      setRatedDeals(prev => ({ ...prev, [dealId]: { rating, comment: comment?.trim() || null } }));
    }
    setSubmittingRating(prev => ({ ...prev, [dealId]: false }));
  };

  const totalEarned = deals
    .filter(d => isTraveler(d))
    .reduce((sum, d) => {
      const v = getDealValue(d);
      return sum + v * (1 - getFetchrPct(v));
    }, 0);

  const totalSpent = deals
    .filter(d => !isTraveler(d))
    .reduce((sum, d) => sum + getDealValue(d), 0);

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-3">
      {[1, 2, 3].map(i => <TicketSkeleton key={i} />)}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display font-bold text-title-l text-ink-900">Completed deals</h1>
        <p className="text-body-s text-content-muted mt-0.5">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} completed
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total deals', value: deals.length, icon: Award, bg: 'bg-ink-100', fg: 'text-ink-700', mono: false },
          { label: 'Total earned', value: `$${totalEarned.toFixed(0)}`, icon: TrendingUp, bg: 'bg-success-tint', fg: 'text-success', mono: true },
          { label: 'Total spent', value: `$${totalSpent.toFixed(0)}`, icon: Package, bg: 'bg-info-50', fg: 'text-info-500', mono: true },
        ].map((s, i) => (
          <div key={i} className="card p-4 text-center">
            <div className={`w-10 h-10 ${s.bg} rounded-md flex items-center justify-center mx-auto mb-2`}>
              <s.icon size={18} className={s.fg} />
            </div>
            <p className={`text-title-m text-ink-900 ${s.mono ? 'font-mono font-semibold' : 'font-display font-bold'}`}>
              {s.value}
            </p>
            <p className="text-micro text-content-subtle mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {deals.length === 0 ? (
        <EmptyState icon={CheckCircle} title="No completed deals yet"
          body="Your completed deliveries will appear here." />
      ) : (
        <div className="space-y-3">
          {deals.map(deal => {
            const other = getOtherParty(deal);
            const dealValue = getDealValue(deal);
            const fetchrPct = getFetchrPct(dealValue);
            const fetchrFee = dealValue * fetchrPct;
            const travelerReceives = dealValue - fetchrFee;
            const isExpanded = expandedId === deal.id;
            const currentRating = ratings[deal.id] || 0;
            const currentComment = comments[deal.id] || '';
            const myReview = ratedDeals[deal.id];
            const hasRated = !!myReview;

            return (
              <div key={deal.id} className="relative ticket border-b-[3px] border-b-success">
                {isExpanded && <span className="stamp text-success" aria-hidden="true">Delivered</span>}

                {/* Header row */}
                <div
                  className="p-4 cursor-pointer hover:bg-surface-sunken transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : deal.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-success-tint rounded-md flex items-center justify-center flex-shrink-0">
                        <CheckCircle size={20} className="text-success" />
                      </div>
                      <div>
                        <p className="font-display font-semibold text-title-s text-ink-900">
                          {deal.flight?.from_city || deal.flight?.from_code} → {deal.flight?.to_city || deal.flight?.to_code}
                        </p>
                        <p className="text-micro text-content-subtle">
                          {deal.request?.item_name} ·{' '}
                          {new Date(deal.created_at).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`font-mono font-semibold text-num-m ${isTraveler(deal) ? 'text-success' : 'text-ink-900'}`}>
                          {isTraveler(deal) ? '+' : ''}${isTraveler(deal)
                            ? travelerReceives.toFixed(2)
                            : dealValue.toFixed(2)}
                        </p>
                        <p className="text-micro text-content-subtle">
                          {isTraveler(deal) ? 'earned' : 'paid'}
                        </p>
                      </div>
                      {isExpanded
                        ? <ChevronUp size={16} className="text-ink-400" />
                        : <ChevronDown size={16} className="text-ink-400" />
                      }
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-line p-4 space-y-4 bg-surface-sunken/50">

                    {/* Flight + Item */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-surface rounded-md p-3 border border-line">
                        <p className="text-label text-content-muted mb-2 flex items-center gap-1">
                          <Plane size={11} /> Flight
                        </p>
                        <p className="font-mono font-semibold text-code-m text-ink-900">
                          {deal.flight?.from_code} → {deal.flight?.to_code}
                        </p>
                        <p className="text-body-s text-content-muted mt-0.5">{deal.flight?.airline}</p>
                        {deal.flight?.flight_number && (
                          <p className="font-mono text-micro text-content-subtle">{deal.flight.flight_number}</p>
                        )}
                        <p className="font-mono text-micro text-content-muted mt-1">
                          {deal.flight?.flight_date
                            ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', {
                                day: '2-digit', month: '2-digit', year: 'numeric'
                              })
                            : ''}
                        </p>
                      </div>
                      <div className="bg-surface rounded-md p-3 border border-line">
                        <p className="text-label text-content-muted mb-2 flex items-center gap-1">
                          <Package size={11} /> Item
                        </p>
                        <p className="font-display font-semibold text-title-s text-ink-900">{deal.request?.item_name}</p>
                        <p className="text-body-s text-content-muted mt-0.5">{deal.request?.category}</p>
                        <p className="font-mono text-micro text-content-subtle mt-1">
                          {deal.agreed_weight_kg || deal.request?.weight_kg}kg
                        </p>
                      </div>
                    </div>

                    {/* Fee breakdown */}
                    <div className="bg-surface rounded-md p-3 border border-line space-y-1.5">
                      <p className="font-display font-semibold text-title-s text-ink-900 mb-2">Deal breakdown</p>
                      <div className="flex justify-between font-mono text-num-m text-content-muted">
                        <span>
                          {deal.agreed_weight_kg || deal.request?.weight_kg}kg ×
                          ${deal.agreed_price_per_kg || deal.flight?.price_per_kg}/kg
                        </span>
                        <span>${dealValue.toFixed(2)}</span>
                      </div>
                      {isTraveler(deal) ? (
                        <>
                          <div className="flex justify-between font-mono text-num-m text-content-muted">
                            <span>fetchr fee ({Math.round(fetchrPct * 100)}%)</span>
                            <span>−${fetchrFee.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-mono font-bold text-num-m text-success border-t border-line pt-1.5">
                            <span>You received</span>
                            <span>+${travelerReceives.toFixed(2)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between font-mono font-bold text-num-m text-ink-900 border-t border-line pt-1.5">
                          <span>You paid</span>
                          <span>${dealValue.toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    {/* Proof photo */}
                    {deal.proof_photo_url && (
                      <div>
                        <p className="text-label text-content-muted mb-2">Delivery proof</p>
                        <a href={deal.proof_photo_url} target="_blank" rel="noreferrer">
                          <img src={deal.proof_photo_url} alt="Proof"
                            className="w-full h-36 object-cover rounded-md border border-line hover:opacity-90 transition" />
                        </a>
                      </div>
                    )}

                    {/* Other party */}
                    <div className="flex items-center gap-3 p-3 bg-surface rounded-md border border-line">
                      <div className="w-10 h-10 rounded-avatar bg-ink-900 flex items-center justify-center text-body-s font-mono font-semibold text-paper-100 flex-shrink-0">
                        {getInitials(other?.full_name)}
                      </div>
                      <div className="flex-1">
                        <p className="font-display font-semibold text-title-s text-ink-900">{other?.full_name || 'User'}</p>
                        <p className="text-micro text-content-subtle">
                          {isTraveler(deal) ? 'Sender' : 'Traveller'}
                        </p>
                        <div className="mt-0.5">
                          <RatingDisplay rating={other?.rating} totalReviews={other?.total_reviews}
                            onClick={other?.id ? () => setReviewsFor({ id: other.id, name: other.full_name }) : undefined} />
                        </div>
                      </div>
                      <StatusPill tone="success" icon={CheckCircle}>Completed</StatusPill>
                    </div>

                    {/* Rating */}
                    {!hasRated ? (
                      <div>
                        <p className="text-label text-content-muted mb-2">
                          Rate your experience with {other?.full_name?.split(' ')[0] || 'this user'}
                        </p>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex gap-1">
                            {[1,2,3,4,5].map(star => (
                              <button key={star}
                                onClick={() => setRatings(prev => ({ ...prev, [deal.id]: star }))}
                                className="transition-transform hover:scale-110">
                                <Star size={28}
                                  className={star <= currentRating
                                    ? 'text-ink-900 fill-ink-900'
                                    : 'text-ink-200'} />
                              </button>
                            ))}
                          </div>
                        </div>
                        {currentRating > 0 && (
                          <div className="space-y-2">
                            <textarea
                              value={currentComment}
                              onChange={e => setComments(prev => ({ ...prev, [deal.id]: e.target.value }))}
                              placeholder="Leave a comment for this rating (optional)"
                              rows={2}
                              maxLength={500}
                              className="input-field resize-none text-body-s" />
                            <button
                              onClick={() => submitRating(deal.id, other?.id, currentRating, currentComment)}
                              disabled={submittingRating[deal.id]}
                              className="btn-primary px-4 py-1.5 min-h-0 text-body-s disabled:opacity-50">
                              {submittingRating[deal.id] ? 'Submitting' : 'Submit rating'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-success-tint rounded-md p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <CheckCircle size={16} className="text-success flex-shrink-0" />
                          <p className="text-body-s text-success font-medium">
                            You rated {other?.full_name?.split(' ')[0]} {myReview.rating} star{myReview.rating !== 1 ? 's' : ''}
                          </p>
                        </div>
                        {myReview.comment && (
                          <p className="text-body-s text-content-muted italic pl-6">"{myReview.comment}"</p>
                        )}
                      </div>
                    )}

                    <p className="text-micro text-content-subtle text-center">
                      Completed on {new Date(deal.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'long', year: 'numeric'
                      })}
                    </p>

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

export default Completed;
