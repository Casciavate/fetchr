import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Search, CheckCircle, XCircle,
  ChevronRight, X, Award, Globe,
  AlertTriangle, Info
} from 'lucide-react';
import RatingDisplay from './shared/RatingDisplay';
import VerificationBadge from './shared/VerificationBadge';
import StatusPill from './shared/StatusPill';
import EmptyState from './shared/EmptyState';

// Bare glyph, docs/BRAND.md §2.6 — used inside the ticket header bar,
// where the tile would double up on the surface-inverse fill.
const BareGlyph = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="fetchr">
    <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
      fill="none" stroke="#FBFAF8" strokeWidth="5" strokeLinecap="round" />
    <rect x="10.5" y="21" width="16" height="4.6" rx="2.3" fill="#FBFAF8" />
    <path d="M29 10.5 L39 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518" />
  </svg>
);

const Matches = ({ session, onNavigate }) => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState({});
  const [viewingProfile, setViewingProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchDeclinedIds = async (userId) => {
    const { data } = await supabase
      .from('match_declines').select('match_id').eq('user_id', userId);
    return (data || []).map(d => d.match_id);
  };

  const fetchMatches = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    await supabase.rpc('find_matches');
    const declinedIds = await fetchDeclinedIds(session.user.id);
    let query = supabase
      .from('matches')
      .select(`
        *,
        flight:flights(*),
        request:shipment_requests(*),
        traveler:profiles!matches_traveler_id_fkey(*),
        shipper:profiles!matches_shipper_id_fkey(*)
      `)
      .or(`traveler_id.eq.${session.user.id},shipper_id.eq.${session.user.id}`)
      .in('status', ['pending', 'awaiting_other'])
      .order('match_score', { ascending: false });
    if (declinedIds.length > 0) query = query.not('id', 'in', `(${declinedIds.join(',')})`);
    const { data, error } = await query;
    if (!error) setMatches(data || []);
    if (showLoading) setLoading(false);
  };

  const fetchProfile = async (userId) => {
    setProfileLoading(true);
    const { data } = await supabase
      .from('profiles').select('*').eq('id', userId).single();
    const { count: flightsCount } = await supabase
      .from('flights').select('id', { count: 'exact' }).eq('user_id', userId);
    const { count: dealsCount } = await supabase
      .from('matches').select('id', { count: 'exact' })
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
      .eq('status', 'completed');
    setViewingProfile({
      ...data,
      totalFlights: flightsCount || 0,
      totalDeals: dealsCount || 0
    });
    setProfileLoading(false);
  };

  useEffect(() => {
    fetchMatches();
    const userId = session.user.id;

    // Poll every 2 seconds — detects when match becomes 'accepted'
    // This handles the first party who is waiting for the second to accept
    const interval = setInterval(async () => {
      await supabase.rpc('find_matches');

      // Lightweight check: has any of our matches become 'accepted'?
      const { data } = await supabase
        .from('matches')
        .select('id, status, traveler_id, shipper_id')
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .in('status', ['pending', 'awaiting_other', 'accepted']);

      if (!data) return;

      // If any match is now 'accepted', remove it and go to messages
      const acceptedMatch = data.find(m => m.status === 'accepted');
      if (acceptedMatch) {
        setMatches(prev => prev.filter(m => m.id !== acceptedMatch.id));
        if (onNavigate) onNavigate('messages');
        return;
      }

      // Otherwise refresh full match list
      const declinedIds = await fetchDeclinedIds(userId);
      let fullQuery = supabase
        .from('matches')
        .select(`
          *,
          flight:flights(*),
          request:shipment_requests(*),
          traveler:profiles!matches_traveler_id_fkey(*),
          shipper:profiles!matches_shipper_id_fkey(*)
        `)
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .in('status', ['pending', 'awaiting_other'])
        .order('match_score', { ascending: false });
      if (declinedIds.length > 0) fullQuery = fullQuery.not('id', 'in', `(${declinedIds.join(',')})`);
      const { data: fullData, error } = await fullQuery;

      if (!error) setMatches(fullData || []);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const handleAccept = async (matchId) => {
    setActing(prev => ({ ...prev, [matchId]: 'accepting' }));

    // Always fetch fresh from DB to avoid stale local state
    const { data: freshMatch } = await supabase
      .from('matches').select('*').eq('id', matchId).single();

    if (!freshMatch) {
      setActing(prev => ({ ...prev, [matchId]: null }));
      return;
    }

    const isTrav = freshMatch.traveler_id === session.user.id;
    const myField = isTrav ? 'traveler_accepted' : 'shipper_accepted';

    // status === 'awaiting_other' means the other party already accepted
    // Also check boolean fields as fallback
    const otherAccepted =
      freshMatch.status === 'awaiting_other' ||
      (isTrav ? freshMatch.shipper_accepted : freshMatch.traveler_accepted);

    if (otherAccepted) {
      // Both accepted — write final accepted status to DB
      const { error } = await supabase.from('matches').update({
        [myField]: true,
        status: 'accepted',
        deal_stage: 'matched',
        terms_agreed_traveler: false,
        terms_agreed_shipper: false,
        traveler_completed: false,
        shipper_completed: false,
      }).eq('id', matchId);

      if (error) {
        console.error('Accept error:', error);
        setActing(prev => ({ ...prev, [matchId]: null }));
        return;
      }

      // Insert welcome message into chat
      await supabase.from('messages').insert([{
        match_id: matchId,
        sender_id: session.user.id,
        content: `Match accepted. Both parties have agreed — you can now chat and arrange the delivery.`,
        is_read: false,
      }]);

      // Remove from local list immediately so it disappears
      setMatches(prev => prev.filter(m => m.id !== matchId));
      setActing(prev => ({ ...prev, [matchId]: null }));

      // Navigate to messages — delay slightly so DB write commits before Messages queries
      setTimeout(() => {
        if (onNavigate) onNavigate('messages');
      }, 800);

    } else {
      // I am first to accept — mark my acceptance and wait for other party
      await supabase.from('matches').update({
        [myField]: true,
        status: 'awaiting_other',
      }).eq('id', matchId);

      await fetchMatches(false);
      setActing(prev => ({ ...prev, [matchId]: null }));
    }
  };

  const handleDecline = async (matchId) => {
    setActing(prev => ({ ...prev, [matchId]: 'declining' }));
    // Per-user hide: the match stays in the pool for the other party.
    await supabase.from('match_declines')
      .upsert({ match_id: matchId, user_id: session.user.id }, { onConflict: 'match_id,user_id' });
    setMatches(prev => prev.filter(m => m.id !== matchId));
    setActing(prev => ({ ...prev, [matchId]: null }));
  };

  const isTraveler = (match) => match.traveler_id === session.user.id;
  const getOtherParty = (match) => isTraveler(match) ? match.shipper : match.traveler;

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarUrl = (profile) => {
    if (!profile?.avatar_url) return null;
    const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
    return data?.publicUrl;
  };

  const getFeePreview = (match) => {
    const agreedPrice = (match.flight?.price_per_kg || 0) *
      (match.request?.weight_kg || 0);
    let fetchrPct = 0.10;
    if (agreedPrice >= 500) fetchrPct = 0.07;
    else if (agreedPrice >= 200) fetchrPct = 0.085;
    else if (agreedPrice < 20 && agreedPrice > 0) fetchrPct = 0.12;
    const fetchrFee = agreedPrice * fetchrPct;
    const travelerReceives = agreedPrice - fetchrFee;
    return { agreedPrice, fetchrFee, fetchrPct, travelerReceives };
  };

  if (loading && matches.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-14 h-14 bg-ink-100 rounded-lg flex items-center justify-center mb-4 animate-pulse">
        <Search size={24} className="text-ink-400" />
      </div>
      <p className="text-body-m text-ink-muted font-medium">Finding your matches</p>
      <p className="text-body-s text-ink-subtle mt-1">This updates every 2 seconds</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-title-l text-ink-900">Your matches</h1>
          <p className="text-body-s text-ink-muted mt-0.5">
            {matches.length} pending match{matches.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <StatusPill tone="success" dot>Live</StatusPill>
      </div>

      {matches.length === 0 ? (
        <EmptyState icon={Search} title="No matches yet"
          body="Add a flight or shipment request and we'll find your match automatically." />
      ) : (
        <div className="space-y-4">
          {matches.map(match => {
            const other = getOtherParty(match);
            const avatarUrl = getAvatarUrl(other);
            const fees = getFeePreview(match);
            const iAmTraveler = isTraveler(match);
            const iHaveAccepted = iAmTraveler
              ? match.traveler_accepted
              : match.shipper_accepted;
            const otherHasAccepted = iAmTraveler
              ? match.shipper_accepted
              : match.traveler_accepted;
            // Also treat awaiting_other as other having accepted
            const otherHasAcceptedFull = otherHasAccepted || match.status === 'awaiting_other';
            const ref = match.id.slice(0, 6).toUpperCase();

            return (
              <div key={match.id}
                className={`ticket ${!iHaveAccepted ? 'border-l-[3px] border-l-signal-500' : ''}`}>

                {/* Header bar — docs/BRAND.md §7.7 / §7.8 (32px compact) */}
                <div className="h-8 bg-ink-900 flex items-center justify-between px-3">
                  <div className="flex items-center gap-1.5">
                    <BareGlyph size={14} />
                    <span className="font-display font-extrabold text-[11px] tracking-[-0.05em] text-paper-100">
                      fetchr
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-ink-300">
                    MATCH · {Math.min(match.match_score, 100)}% · #{ref}
                  </span>
                </div>

                <div className="px-4 py-3 space-y-2.5">

                  {/* State pill */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!iHaveAccepted && (
                      <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-accent-fill text-white font-mono text-overline uppercase">
                        Your turn
                      </span>
                    )}
                    {iHaveAccepted && !otherHasAcceptedFull && (
                      <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-ink-100 text-content-muted font-mono text-overline uppercase">
                        Waiting on {iAmTraveler ? 'sender' : 'traveller'}
                      </span>
                    )}
                    {iHaveAccepted && otherHasAcceptedFull && (
                      <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-success-tint text-success font-mono text-overline uppercase">
                        Both accepted
                      </span>
                    )}
                  </div>

                  {/* Route block */}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-overline uppercase text-ink-400">From</p>
                      <p className="font-mono font-semibold text-code-l text-ink-900 leading-none mt-0.5">
                        {match.flight?.from_code || '—'}
                      </p>
                      <p className="text-body-s text-ink-muted truncate" title={match.flight?.from_city}>
                        {match.flight?.from_city}
                      </p>
                    </div>
                    <div className="flex items-center justify-center pt-4">
                      <div className="w-8 border-t border-dashed border-line-perf" />
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="font-mono text-overline uppercase text-ink-400">To</p>
                      <p className="font-mono font-semibold text-code-l text-ink-900 leading-none mt-0.5">
                        {match.flight?.to_code || '—'}
                      </p>
                      <p className="text-body-s text-ink-muted truncate" title={match.flight?.to_city}>
                        {match.flight?.to_city}
                      </p>
                    </div>
                  </div>

                  {/* Data strip — single micro line, §7.8 */}
                  <p className="font-mono text-micro text-ink-muted border-t border-b border-line py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                    {match.flight?.flight_date
                      ? new Date(match.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                      : '—'}
                    {' · '}{match.flight?.flight_number || match.flight?.airline || '—'}
                    {' · '}{match.request?.weight_kg}kg
                  </p>

                  {/* Advisory — §7.9 */}
                  {match.flight?.delivery_type === 'both' && (
                    <div className="flex items-start gap-2 bg-info-50 rounded-r px-2.5 py-2 border-l-[3px] border-info-400">
                      <Info size={14} className="text-info-500 flex-shrink-0 mt-0.5" />
                      <p className="text-body-s text-info-500">
                        <span className="font-semibold">Shop & Ship available</span> — the traveller can buy at the destination.
                      </p>
                    </div>
                  )}
                  {match.request?.requires_purchase && match.flight?.delivery_type !== 'both' && (
                    <div className="flex items-start gap-2 bg-warning-tint rounded-r px-2.5 py-2 border-l-[3px] border-warn-400">
                      <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
                      <div className="text-body-s text-warning">
                        <p className="font-semibold">Buy-and-carry needed</p>
                        <p>This traveller only offers handover, not Shop & Ship.</p>
                      </div>
                    </div>
                  )}

                  {/* Person row */}
                  <button onClick={() => fetchProfile(other?.id)}
                    className="w-full flex items-center gap-2.5 py-1 group">
                    <div className="w-8 h-8 rounded-avatar bg-ink-900 flex items-center justify-center text-[11px] font-mono font-semibold text-paper-100 flex-shrink-0 overflow-hidden">
                      {avatarUrl
                        ? <img src={avatarUrl} alt={other?.full_name} className="w-full h-full object-cover" />
                        : getInitials(other?.full_name)
                      }
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <p className="font-display font-semibold text-title-s text-ink-900 truncate">
                          {other?.full_name || 'User'}
                        </p>
                        <VerificationBadge verified={other?.verified} />
                      </div>
                      <RatingDisplay rating={other?.rating} totalReviews={other?.total_reviews} qualifier="New traveller" />
                    </div>
                    <ChevronRight size={16} className="text-ink-400 flex-shrink-0 group-hover:text-ink-600 transition-colors" />
                  </button>
                </div>

                <div className="perf" />

                {/* Coupon — one money line + one action, §7.8 */}
                <div className="px-4 pt-3.5 pb-4 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-body-m text-ink-muted">
                      {iAmTraveler ? 'You receive' : 'You pay'}
                    </span>
                    <span className="font-mono font-bold text-num-l text-ink-900">
                      ${(iAmTraveler ? fees.travelerReceives : fees.agreedPrice).toFixed(2)}
                    </span>
                  </div>

                  {!iHaveAccepted ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDecline(match.id)}
                        disabled={!!acting[match.id]}
                        className="btn-secondary flex-1 disabled:opacity-50">
                        <XCircle size={15} />
                        {acting[match.id] === 'declining' ? 'Declining' : 'Decline'}
                      </button>
                      <button
                        onClick={() => handleAccept(match.id)}
                        disabled={!!acting[match.id]}
                        className="btn-primary flex-[2] disabled:opacity-50">
                        <CheckCircle size={15} />
                        {acting[match.id] === 'accepting'
                          ? 'Accepting'
                          : otherHasAcceptedFull
                            ? 'Confirm & start chat'
                            : 'Accept match'
                        }
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-success-tint rounded-md px-3 py-2.5">
                      <CheckCircle size={16} className="text-success flex-shrink-0" />
                      <p className="text-body-s text-success font-medium">
                        Waiting for {iAmTraveler ? 'sender' : 'traveller'} to confirm
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Profile Modal */}
      {viewingProfile && (
        <div className="fixed inset-0 bg-[var(--scrim)] z-backdrop flex items-end md:items-center justify-center p-4">
          <div className="bg-surface-raised rounded-xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-elev-3 animate-slide-up">
            <div className="sticky top-0 bg-surface-raised border-b border-line px-5 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="font-display font-semibold text-title-m text-ink-900">User profile</h3>
              <button onClick={() => setViewingProfile(null)}
                className="w-11 h-11 flex items-center justify-center rounded-md hover:bg-surface-sunken transition">
                <X size={18} className="text-ink-500" />
              </button>
            </div>

            {profileLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="p-5">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-16 h-16 rounded-avatar bg-ink-900 flex items-center justify-center text-title-m font-mono font-semibold text-paper-100 overflow-hidden flex-shrink-0">
                    {viewingProfile?.avatar_url ? (
                      <img
                        src={supabase.storage.from('avatars').getPublicUrl(viewingProfile.avatar_url).data?.publicUrl}
                        alt={viewingProfile.full_name}
                        className="w-full h-full object-cover"
                      />
                    ) : getInitials(viewingProfile?.full_name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display font-bold text-title-m text-ink-900">
                        {viewingProfile?.full_name || 'User'}
                      </h2>
                      <VerificationBadge verified={viewingProfile?.verified} />
                    </div>
                    <div className="mt-1">
                      <RatingDisplay rating={viewingProfile?.rating} totalReviews={viewingProfile?.total_reviews} qualifier="New traveller" />
                    </div>
                  </div>
                </div>

                {viewingProfile?.bio && (
                  <div className="bg-surface-sunken rounded-md p-4 mb-4 border border-line">
                    <p className="text-body-m text-content-muted italic leading-relaxed">
                      "{viewingProfile.bio}"
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Deals done', value: viewingProfile?.totalDeals || 0 },
                    { label: 'Flights', value: viewingProfile?.totalFlights || 0 },
                    { label: 'Response', value: `${viewingProfile?.response_rate || 100}%` },
                  ].map((stat, i) => (
                    <div key={i} className="card p-3 text-center">
                      <p className="font-mono text-title-m font-bold text-ink-900">{stat.value}</p>
                      <p className="text-label text-content-muted mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2.5 mb-5">
                  {viewingProfile?.nationality && (
                    <div className="flex items-center gap-2.5 text-body-m text-content-muted">
                      <Globe size={15} className="text-ink-400 flex-shrink-0" />
                      <span>{viewingProfile.nationality}</span>
                    </div>
                  )}
                  {viewingProfile?.languages?.length > 0 && (
                    <div className="flex items-center gap-2.5 text-body-m text-content-muted">
                      <Award size={15} className="text-ink-400 flex-shrink-0" />
                      <span>{viewingProfile.languages.join(', ')}</span>
                    </div>
                  )}
                </div>

                <button onClick={() => setViewingProfile(null)} className="btn-primary w-full py-3">
                  Close profile
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Matches;