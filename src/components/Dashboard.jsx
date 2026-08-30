import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabaseClient';
import AddFlight from './AddFlight';
import MyFlights from './MyFlights';
import NewRequest from './NewRequest';
import MyRequests from './MyRequests';
import Matches from './Matches';
import Messages from './Messages';
import ActiveDeals from './ActiveDeals';
import Completed from './Completed';
import Profile from './Profile';
import Earnings from './Earnings';
import WalletScreen from './Wallet';
import { AIRLINE_CODES } from './shared/airlines';
import { calcFees, resolveOptionPrice, SHIPPER_SERVICE_FEE_PCT, TRAVELER_PLATFORM_FEE_PCT, SOURCING_FEE_PCT } from '../lib/fees';
import StatusPill from './shared/StatusPill';
import { RowSkeleton } from './shared/Skeleton';
import VerificationBadge from './shared/VerificationBadge';
import RatingDisplay from './shared/RatingDisplay';
import ReviewsSheet from './shared/ReviewsSheet';
import CardStack from './shared/CardStack';
import Barcode from './shared/Barcode';
import {
  Home, Plane, PlusCircle, User, Package,
  Bell, MessageCircle, Wallet,
  ChevronRight, ChevronDown, ChevronUp, LogOut, CheckCircle, Search,
  Zap, ArrowUpRight, Lock, Camera, Ticket, Weight
} from 'lucide-react';

// Running inside the native iOS shell always gets the touch-optimized
// bottom-nav layout, regardless of viewport width — a phone rotated to
// landscape is still a phone, not a tablet/desktop, and the md: breakpoint
// used to switch the whole nav paradigm (sidebar vs bottom tabs) based on
// width alone, which is the wrong signal here. The web app (real browsers,
// any width) keeps its existing responsive breakpoint behavior unchanged.
const IS_NATIVE = Capacitor.isNativePlatform();
// Lazy-loaded: pulls in recharts, which only admins ever need — keeps that
// weight out of the bundle every regular user downloads.
const AdminDashboard = React.lazy(() => import('./AdminDashboard'));

// Bare glyph, docs/BRAND.md §2.6 — used inside the sidebar lockup and
// anywhere else the ink tile would double up.
const BareGlyph = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="fetchr">
    <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
      fill="none" stroke="#14181F" strokeWidth="5" strokeLinecap="round" />
    <rect x="10.5" y="21" width="16" height="4.6" rx="2.3" fill="#14181F" />
    <path d="M29 10.5 L39 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518" />
  </svg>
);

const AirlineLogo = ({ airline }) => {
  const code = AIRLINE_CODES[airline];
  if (!code) return <Plane size={16} className="text-ink-600" />;
  return (
    <img
      src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`}
      alt={airline}
      className="w-8 h-8 object-contain"
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
};

// Post chooser, fetchr_design/ui_kits/fetchr-app/Post.jsx — the single
// "Post" nav entry that replaced separate Add Flight / New Request items.
const PostChooser = ({ onNavigate }) => (
  <div className="max-w-xl mx-auto mt-6 animate-fade-in">
    <h1 className="font-display font-bold text-title-l text-ink-900">What do you want to do?</h1>
    <p className="text-body-s text-content-muted mt-1 mb-6">
      Add space you have, or find someone already flying.
    </p>
    <div className="space-y-3">
      {[
        { icon: Plane, title: 'Add a flight', sub: 'Earn on space you already have', id: 'add-flight' },
        { icon: Package, title: 'Post a request', sub: 'Find someone already flying', id: 'new-request' },
      ].map(opt => (
        <button key={opt.id} onClick={() => onNavigate(opt.id)}
          className="w-full flex items-center gap-4 text-left min-h-24 card p-5 hover:border-line-strong transition">
          <span className="w-[52px] h-[52px] rounded-md bg-surface-sunken flex items-center justify-center flex-shrink-0 text-ink-700">
            <opt.icon size={26} />
          </span>
          <span className="flex-1">
            <p className="font-display font-semibold text-title-s text-ink-900">{opt.title}</p>
            <p className="text-body-s text-content-muted mt-0.5">{opt.sub}</p>
          </span>
          <ChevronRight size={22} className="text-ink-400 flex-shrink-0" />
        </button>
      ))}
    </div>
  </div>
);

const Dashboard = ({ session }) => {
  const [activeNav, setActiveNav] = useState('dashboard');
  const [focusMatchId, setFocusMatchId] = useState(null);
  const [focusDealId, setFocusDealId] = useState(null);
  const [reviewsFor, setReviewsFor] = useState(null);
  const [profile, setProfile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [stats, setStats] = useState({
    activeDeals: 0, upcomingFlights: 0,
    completedDeals: 0, walletBalance: 0, totalRequests: 0,
    completedAsTraveler: 0,
  });
  const [recentMatches, setRecentMatches] = useState([]);
  const [upcomingFlights, setUpcomingFlights] = useState([]);
  const [activeDeals, setActiveDeals] = useState([]);
  const [ongoingRequests, setOngoingRequests] = useState([]);
  const [allMatches, setAllMatches] = useState([]);
  const [activeFlightIdx, setActiveFlightIdx] = useState(0);
  const [activeRequestIdx, setActiveRequestIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  const userName = profile?.full_name?.split(' ')[0]
    || session?.user?.email?.split('@')[0]
    || 'there';

  const getUserRole = () => {
    const hasFlights = stats.upcomingFlights > 0 || stats.completedAsTraveler > 0;
    const hasRequests = stats.totalRequests > 0;
    if (hasFlights && hasRequests) return 'Traveller & Sender';
    if (hasFlights) return 'Traveller';
    if (hasRequests) return 'Sender';
    return 'New member';
  };

  // useCallback so the same reference is used in subscriptions
  const fetchDashboardData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const userId = session.user.id;

    // Profile
    const { data: profileData } = await supabase
      .from('profiles').select('*').eq('id', userId).single();
    if (profileData) {
      setProfile(profileData);
      if (profileData.avatar_url) {
        const { data: urlData } = supabase.storage
          .from('avatars').getPublicUrl(profileData.avatar_url);
        setAvatarUrl(urlData.publicUrl);
      }
    }

    // All counts in parallel
    const [
      { count: activeDealsCount },
      { count: flightsCount },
      { count: completedCount },
      { count: requestsCount },
      { count: completedAsTravelerCount },
    ] = await Promise.all([
      supabase.from('matches').select('id', { count: 'exact', head: true })
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded']),
      supabase.from('flights').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'active')
        .gte('flight_date', new Date().toISOString().split('T')[0]),
      supabase.from('matches').select('id', { count: 'exact', head: true })
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .eq('status', 'completed'),
      supabase.from('shipment_requests').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'open'),
      supabase.from('matches').select('id', { count: 'exact', head: true })
        .eq('traveler_id', userId).eq('status', 'completed'),
    ]);

    setStats({
      activeDeals: activeDealsCount || 0,
      upcomingFlights: flightsCount || 0,
      completedDeals: completedCount || 0,
      walletBalance: profileData?.wallet_balance || 0,
      totalRequests: requestsCount || 0,
      completedAsTraveler: completedAsTravelerCount || 0,
    });

// Generate new matches for this user before fetching
    await supabase.rpc('find_matches');

    // Widget data — all in parallel. One broad matches query (every status
    // that isn't finished/cancelled) replaces the old separate "pending"
    // and "accepted+" queries — recentMatches/activeDeals below are just
    // client-side slices of it, and the full set also drives the Home
    // carousels' per-flight/per-request grouping (flightGroups/
    // requestGroups), which need every match tied to a listing, not a
    // top-N sample.
    const [
      { data: matchesData },
      { data: flightsData },
      { data: requestsData },
    ] = await Promise.all([
      supabase.from('matches')
        .select(`*, flight:flights(*), request:shipment_requests(*),
          traveler:profiles!matches_traveler_id_fkey(*),
          shipper:profiles!matches_shipper_id_fkey(*)`)
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .in('status', ['pending', 'awaiting_other', 'accepted', 'terms_agreed', 'in_escrow', 'proof_uploaded'])
        .order('created_at', { ascending: false }).limit(100),

      supabase.from('flights').select('*')
        .eq('user_id', userId).eq('status', 'active')
        .gte('flight_date', new Date().toISOString().split('T')[0])
        .order('flight_date', { ascending: true }).limit(20),

      supabase.from('shipment_requests').select('*')
        .eq('user_id', userId).eq('status', 'open')
        .order('created_at', { ascending: false }).limit(20),
    ]);

    const all = matchesData || [];
    setAllMatches(all);
    setRecentMatches(all.filter(m => ['pending', 'awaiting_other'].includes(m.status))
      .sort((a, b) => (b.match_score || 0) - (a.match_score || 0)).slice(0, 3));
    setActiveDeals(all.filter(m => ['accepted', 'terms_agreed', 'in_escrow', 'proof_uploaded'].includes(m.status)).slice(0, 4));
    setUpcomingFlights(flightsData || []);
    setOngoingRequests(requestsData || []);

    if (showLoading) setLoading(false);
  }, [session.user.id]);

  useEffect(() => {
    fetchDashboardData(true);

    const userId = session.user.id;

    // ── Real-time subscriptions covering every relevant table ──
    // We use a single channel with multiple listeners so Supabase
    // fires fetchDashboardData on ANY change that affects this user.

    const channel = supabase
      .channel(`dashboard-realtime-${userId}`)

      // Matches — new match, accepted, status change, completion
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matches',
        filter: `traveler_id=eq.${userId}`,
      }, () => fetchDashboardData())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matches',
        filter: `shipper_id=eq.${userId}`,
      }, () => fetchDashboardData())

      // Flights — new flight added or status changed
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'flights',
        filter: `user_id=eq.${userId}`,
      }, () => fetchDashboardData())

      // Shipment requests — new request, status change
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shipment_requests',
        filter: `user_id=eq.${userId}`,
      }, () => fetchDashboardData())

      // Profile — wallet balance, avatar, name updates
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'profiles',
        filter: `id=eq.${userId}`,
      }, () => fetchDashboardData())

      // Transactions — wallet top-up, withdrawal, escrow release
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'transactions',
        filter: `user_id=eq.${userId}`,
      }, () => fetchDashboardData())

      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Dashboard real-time connected');
        }
      });

    // Polling fallback — every 15 seconds in case websocket misses anything
    const pollInterval = setInterval(() => fetchDashboardData(), 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [fetchDashboardData]);

  // Flatter grouping matching fetchr_design/ui_kits/fetchr-app/AppShell.jsx —
  // Add Flight/New Request consolidate into one "Post" destination (a
  // chooser screen, like the kit's Post.jsx); My Flights/My Requests/
  // Earnings stay reachable from Profile's stat tiles and quick links
  // rather than as separate sidebar entries. Completed stays in Deals
  // (unlike the kit) since it's real functionality with no other path.
  const navGroups = [
    {
      label: 'Deals',
      items: [
        { id: 'matches', icon: Search, label: 'Matches' },
        { id: 'active-deals', icon: Zap, label: 'Active deals' },
        { id: 'completed', icon: CheckCircle, label: 'Completed' },
        { id: 'messages', icon: MessageCircle, label: 'Chat', badge: true },
      ]
    },
    {
      label: 'Post',
      items: [
        { id: 'post', icon: PlusCircle, label: 'Post' },
      ]
    },
    {
      label: 'Account',
      items: [
        { id: 'wallet', icon: Wallet, label: 'Wallet' },
        { id: 'profile', icon: User, label: 'Profile' },
      ]
    },
  ];

  // Matches fetchr_design/ui_kits/fetchr-mobile/MobileApp.jsx's actual
  // `items` array exactly — Post is the 5th tab, not Profile; Profile is
  // reached from the Home header avatar (MHome's `right` slot) instead.
  const bottomNavItems = [
    { id: 'dashboard', icon: Home, label: 'Home' },
    { id: 'matches', icon: Search, label: 'Matches' },
    { id: 'messages', icon: MessageCircle, label: 'Chat', badge: stats.activeDeals },
    { id: 'active-deals', icon: Zap, label: 'Deals' },
    { id: 'post', icon: PlusCircle, label: 'Post' },
  ];

  const statCards = [
    { label: 'Active deals', value: stats.activeDeals, icon: Zap, nav: 'active-deals' },
    { label: 'Flights', value: stats.upcomingFlights, icon: Plane, nav: 'flights' },
    { label: 'Requests', value: stats.totalRequests, icon: Package, nav: 'my-requests' },
    { label: 'Completed', value: stats.completedDeals, icon: CheckCircle, nav: 'completed' },
    { label: 'Wallet', value: stats.walletBalance, icon: Wallet, nav: 'wallet', prefix: '$' },
  ];

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getOtherParty = (match) =>
    match.traveler_id === session.user.id ? match.shipper : match.traveler;

  const navigate = (id, opts) => {
    setActiveNav(id);
    setFocusMatchId(opts?.focusMatchId ?? null);
    setFocusDealId(opts?.focusDealId ?? null);
  };

  const isAdmin = !!profile?.is_admin;

  const getDealStageLabel = (deal) => {
    const s = deal.deal_stage || deal.status;
    if (s === 'terms_agreed') return { label: 'Terms agreed', color: 'text-content-muted' };
    if (s === 'in_escrow') return { label: 'Escrow secured', color: 'text-success' };
    if (s === 'proof_uploaded') return { label: 'Proof uploaded', color: 'text-warning' };
    return { label: 'In progress', color: 'text-content-muted' };
  };

  // Mirrors the blocked-action precedence Messages.jsx uses for its header CTA.
  const isTraveler = (m) => m?.traveler_id === session.user.id;
  const isShipper = (m) => m?.shipper_id === session.user.id;
  const flightHasDeparted = (m) => {
    if (!m?.flight?.flight_date) return true;
    return m.flight.flight_date <= new Date().toISOString().split('T')[0];
  };

  // The single blocking action for a match/deal, if any — one place for
  // the precedence Home's tile-highlighting, the badge count, and
  // Messages.jsx's own header CTA all need to agree on. Returns where
  // clicking the highlight should navigate: Home never completes the
  // action itself, it only routes into Matches/Messages so the existing
  // workflow there stays the single place these actually happen.
  const getMatchAction = (m) => {
    if (['pending', 'awaiting_other'].includes(m.status)) {
      const mine = isTraveler(m) ? m.traveler_accepted : m.shipper_accepted;
      if (!mine) return { label: 'Issue boarding pass', icon: Ticket, nav: 'matches' };
      return null; // waiting on the other party to accept
    }
    const myTermsAgreed = isTraveler(m) ? m.terms_agreed_traveler : m.terms_agreed_shipper;
    const myCompleted = isTraveler(m) ? m.traveler_completed : m.shipper_completed;
    if (m.status === 'accepted' && !myTermsAgreed) return { label: 'Agree terms', icon: CheckCircle, nav: 'messages' };
    if (m.status === 'terms_agreed' && isShipper(m)) return { label: 'Pay escrow', icon: Lock, nav: 'messages' };
    if (m.status === 'in_escrow' && isTraveler(m)) return { label: 'Upload proof', icon: Camera, nav: 'messages' };
    if (m.status === 'proof_uploaded' && !myCompleted && flightHasDeparted(m)) return { label: 'Confirm delivery', icon: CheckCircle, nav: 'messages' };
    return null;
  };

  // Home groups every match by the flight/request it's tied to, rather
  // than showing loose boarding-pass tickets — a flight or request tile is
  // the unit, its matches (any status) are what's underneath it.
  const flightGroups = upcomingFlights.map(flight => ({
    flight,
    matches: allMatches.filter(m => m.flight_id === flight.id),
  }));
  const requestGroups = ongoingRequests.map(request => ({
    request,
    matches: allMatches.filter(m => m.request_id === request.id),
  }));
  const remainingKg = (flight) => Math.max(0, (Number(flight.available_kg) || 0) - (Number(flight.booked_kg) || 0));

  const renderMain = () => {
    switch (activeNav) {
      case 'post': return <PostChooser onNavigate={navigate} />;
      case 'add-flight': return <AddFlight session={session} />;
      case 'flights': return <MyFlights session={session} onAddFlight={() => navigate('add-flight')} />;
      case 'new-request': return <NewRequest session={session} />;
      case 'my-requests': return <MyRequests session={session} onNewRequest={() => navigate('new-request')} />;
case 'matches': return <Matches session={session} onNavigate={navigate} focusMatchId={focusMatchId} />;
      case 'messages': return <Messages session={session} focusMatchId={focusMatchId} />;
      case 'active-deals': return <ActiveDeals session={session} onNavigate={navigate} />;
      case 'completed': return <Completed session={session} focusDealId={focusDealId} />;
      case 'profile': return <Profile session={session} userRole={getUserRole()}
        onNavigate={navigate} isAdmin={isAdmin} />;
      case 'earnings': return <Earnings session={session} />;
      case 'wallet': return <WalletScreen session={session} />;
      case 'admin': return isAdmin ? (
        <React.Suspense fallback={<div className="max-w-6xl mx-auto p-6 text-content-muted text-body-s">Loading admin dashboard…</div>}>
          <AdminDashboard />
        </React.Suspense>
      ) : renderDashboard();
      default: return renderDashboard();
    }
  };

  const renderDashboard = () => {
    // One row under a flight/request tile — a real boarding-pass ticket
    // (barcode visible) once the match is past pending/awaiting_other,
    // otherwise a lighter match-preview row. Clicking never completes the
    // action here — it routes into Matches (still pending) or Messages
    // (already a deal) where the existing workflow owns it.
    const renderMatchRow = (m, kind) => {
      const other = getOtherParty(m);
      const isDeal = !['pending', 'awaiting_other'].includes(m.status);
      const action = getMatchAction(m);
      const stageInfo = isDeal ? getDealStageLabel(m) : null;
      const waitingLabel = !isDeal && !action ? `Waiting for ${isTraveler(m) ? 'sender' : 'traveller'}` : null;
      return (
        <button key={m.id}
          onClick={() => navigate(isDeal ? 'messages' : 'matches', { focusMatchId: m.id })}
          className={`w-full text-left ticket transition ${action ? 'ring-2 ring-signal-500' : 'hover:border-line-strong'}`}>
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-avatar bg-ink-900 flex items-center justify-center text-[11px] font-mono font-semibold text-paper-100 flex-shrink-0">
              {getInitials(other?.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-body-s text-ink-900 truncate">
                {kind === 'flight' ? (m.request?.item_name || 'Item') : `${m.flight?.from_code || '—'} → ${m.flight?.to_code || '—'}`}
              </p>
              <p className="text-micro text-content-subtle truncate">
                {other?.full_name || 'User'} · {isDeal ? stageInfo.label : waitingLabel || `${m.match_score}% match`}
              </p>
            </div>
            {action ? (
              <StatusPill tone="signal" icon={action.icon}>{action.label}</StatusPill>
            ) : (
              <ChevronRight size={16} className="text-ink-300 flex-shrink-0" />
            )}
          </div>
          {isDeal && <div className="px-4 pb-3"><Barcode deal={m} /></div>}
        </button>
      );
    };

    const renderMatchesUnder = (matches, kind, emptyLabel) => (
      matches.length === 0 ? (
        <div className="text-center py-6 bg-surface-sunken rounded-md border border-line">
          <p className="text-body-s text-content-muted">{emptyLabel}</p>
        </div>
      ) : (
        <div className="space-y-2">{matches.map(m => renderMatchRow(m, kind))}</div>
      )
    );

    const renderFlightTile = (flight) => {
      const free = remainingKg(flight);
      return (
        <div className="ticket">
          <div className="h-9 bg-ink-900 flex items-center justify-between px-3.5">
            <div className="flex items-center gap-1.5">
              <BareGlyph size={15} />
              <span className="font-display font-extrabold text-[12px] tracking-[-0.05em] text-paper-100">fetchr</span>
            </div>
            <span className="font-mono text-[10px] text-ink-300 uppercase">FLIGHT · #{flight.id.slice(0, 6).toUpperCase()}</span>
          </div>
          <div className="px-4 py-3.5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-md bg-surface-sunken flex items-center justify-center border border-line flex-shrink-0 overflow-hidden">
                <AirlineLogo airline={flight.airline} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-title-s text-ink-900 truncate">{flight.airline || 'Flight'}</p>
                <p className="font-mono text-micro text-content-subtle">
                  {new Date(flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  {flight.flight_number ? ` · ${flight.flight_number}` : ''}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
              <div className="min-w-0">
                <p className="font-mono text-overline uppercase text-ink-400">From</p>
                <p className="font-mono font-semibold text-code-l text-ink-900 leading-none mt-0.5">{flight.from_code}</p>
              </div>
              <div className="flex items-center justify-center pt-4">
                <div className="w-7 border-t border-dashed border-line-perf" />
              </div>
              <div className="min-w-0 text-right">
                <p className="font-mono text-overline uppercase text-ink-400">To</p>
                <p className="font-mono font-semibold text-code-l text-ink-900 leading-none mt-0.5">{flight.to_code}</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-2.5">
              <span className="flex items-center gap-1.5 text-body-s text-content-muted"><Weight size={14} /> Remaining capacity</span>
              <span className={`font-mono font-semibold text-num-m ${free <= 0 ? 'text-danger' : 'text-success'}`}>{free.toFixed(1)} kg</span>
            </div>
          </div>
        </div>
      );
    };

    const renderRequestTile = (request) => (
      <div className="ticket">
        <div className="h-9 bg-ink-900 flex items-center justify-between px-3.5">
          <div className="flex items-center gap-1.5">
            <BareGlyph size={15} />
            <span className="font-display font-extrabold text-[12px] tracking-[-0.05em] text-paper-100">fetchr</span>
          </div>
          <span className="font-mono text-[10px] text-ink-300 uppercase">REQUEST · #{request.id.slice(0, 6).toUpperCase()}</span>
        </div>
        <div className="px-4 py-3.5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md bg-ink-100 flex items-center justify-center flex-shrink-0">
              <Package size={16} className="text-ink-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold text-title-s text-ink-900 truncate">{request.item_name}</p>
              <p className="text-micro text-content-subtle">{request.category}</p>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
            <div className="min-w-0">
              <p className="font-mono text-overline uppercase text-ink-400">From</p>
              <p className="font-mono font-semibold text-code-l text-ink-900 leading-none mt-0.5">{request.from_code}</p>
            </div>
            <div className="flex items-center justify-center pt-4">
              <div className="w-7 border-t border-dashed border-line-perf" />
            </div>
            <div className="min-w-0 text-right">
              <p className="font-mono text-overline uppercase text-ink-400">To</p>
              <p className="font-mono font-semibold text-code-l text-ink-900 leading-none mt-0.5">{request.to_code}</p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-2.5 text-body-s">
            <span className="text-content-muted">Needed by</span>
            <span className="font-mono font-semibold text-ink-900">
              {request.needed_by
                ? new Date(request.needed_by).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—'}
            </span>
          </div>
        </div>
      </div>
    );

    return (
    <div className="animate-fade-in space-y-6">

      {/* Greeting */}
      <div>
        <h1 className="font-display font-bold text-title-l text-ink-900 tracking-tight">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {userName}
        </h1>
        <p className="text-body-s text-content-muted mt-1">
          Here's what's happening with your deliveries today.
        </p>
      </div>

      {/* ── Mobile — one decision per screen, real TicketCard anatomy
            matching fetchr_design/ui_kits/fetchr-mobile/MobileApp.jsx's
            MHome ─────────────────────────────────────────────────── */}
      <div className="md:hidden space-y-6">
        {/* A. Upcoming Flights — swipe between flights, the boarding
            passes underneath always reflect whichever one is centered. */}
        <div>
          <p className="font-mono text-overline uppercase text-content-subtle mb-2">Upcoming flights</p>
          {upcomingFlights.length === 0 ? (
            <div className="card p-5 text-center">
              <Plane size={20} className="text-ink-300 mx-auto mb-2" />
              <p className="text-body-s text-content-muted mb-3">No upcoming flights</p>
              <button onClick={() => navigate('add-flight')} className="btn-primary text-label px-4 py-2 min-h-0">
                Add a flight
              </button>
            </div>
          ) : (
            <>
              <CardStack items={upcomingFlights} keyFn={f => f.id} renderItem={renderFlightTile}
                onActiveChange={(_, i) => setActiveFlightIdx(i)} />
              <div className="mt-3">
                {renderMatchesUnder(
                  flightGroups[activeFlightIdx]?.matches || [],
                  'flight',
                  'No boarding passes on this flight yet.'
                )}
              </div>
            </>
          )}
        </div>

        {/* B. Requests — inverse of A: swipe between requests, matching
            flights/boarding passes underneath follow the selected one. */}
        <div>
          <p className="font-mono text-overline uppercase text-content-subtle mb-2">Your requests</p>
          {ongoingRequests.length === 0 ? (
            <div className="card p-5 text-center">
              <Package size={20} className="text-ink-300 mx-auto mb-2" />
              <p className="text-body-s text-content-muted mb-3">No open requests</p>
              <button onClick={() => navigate('new-request')} className="btn-primary text-label px-4 py-2 min-h-0">
                Post a request
              </button>
            </div>
          ) : (
            <>
              <CardStack items={ongoingRequests} keyFn={r => r.id} renderItem={renderRequestTile}
                onActiveChange={(_, i) => setActiveRequestIdx(i)} />
              <div className="mt-3">
                {renderMatchesUnder(
                  requestGroups[activeRequestIdx]?.matches || [],
                  'request',
                  'No matching flights for this request yet.'
                )}
              </div>
            </>
          )}
        </div>

        {/* Existing flights/requests — creation lives behind the bottom
            nav's Post tab; modify/cancel stays in MyFlights/MyRequests. */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => navigate('flights')}
            className="card p-4 flex flex-col items-center gap-2 text-center hover:border-line-strong transition">
            <Plane size={18} className="text-ink-700" />
            <span className="text-body-s font-semibold text-ink-900">My flights</span>
          </button>
          <button onClick={() => navigate('my-requests')}
            className="card p-4 flex flex-col items-center gap-2 text-center hover:border-line-strong transition">
            <Package size={18} className="text-ink-700" />
            <span className="text-body-s font-semibold text-ink-900">My requests</span>
          </button>
        </div>
      </div>

      {/* ── Desktop — stat grid + full detail ──────────────────────── */}
      <div className="hidden md:block space-y-6">

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((stat, i) => (
          <button key={i} onClick={() => navigate(stat.nav)}
            className="group card p-4 hover:border-line-strong transition-colors text-left">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 bg-ink-100 rounded-md flex items-center justify-center">
                <stat.icon size={17} className="text-ink-700" />
              </div>
              <ArrowUpRight size={14} className="text-ink-300 group-hover:text-ink-500 transition-colors" />
            </div>
            <p className="font-mono text-title-m font-semibold text-ink-900 tracking-tight">
              {stat.prefix || ''}{typeof stat.value === 'number' && stat.prefix === '$'
                ? stat.value.toFixed(2) : stat.value}
            </p>
            <p className="text-label text-content-muted mt-0.5">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Row 1 — Recommended Matches + Active Deals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recommended Matches */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-semibold text-title-s text-ink-900">Recommended matches</h2>
              <p className="text-label text-content-subtle mt-0.5">Based on your flights & requests</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill tone="success" dot>Live</StatusPill>
              <button onClick={() => navigate('matches')}
                className="flex items-center gap-1 text-label text-ink-700 font-semibold hover:text-ink-900">
                View all <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <RowSkeleton /><RowSkeleton /><RowSkeleton />
            </div>
          ) : recentMatches.length === 0 ? (
            <div className="text-center py-8 bg-surface-sunken rounded-md border border-line">
              <Search size={22} className="text-ink-300 mx-auto mb-2" />
              <p className="text-body-s text-content-muted font-medium mb-1">No matches yet</p>
              <p className="text-label text-content-subtle mb-3">Add a flight or request to start matching</p>
              <button onClick={() => navigate('matches')} className="btn-primary text-label px-4 py-2 min-h-0">
                Find matches
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentMatches.map(match => {
                const other = getOtherParty(match);
                return (
                  <button key={match.id} onClick={() => navigate('matches')}
                    className="w-full flex items-center gap-3 p-3 rounded-md hover:bg-surface-sunken transition border border-line text-left">
                    <div className="w-9 h-9 rounded-avatar bg-ink-100 flex items-center justify-center text-label font-mono font-semibold text-ink-700 flex-shrink-0">
                      {getInitials(other?.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-body-s font-semibold text-ink-900">
                        {match.flight?.from_code} → {match.flight?.to_code}
                      </p>
                      <p className="text-label text-content-subtle truncate">
                        {match.request?.item_name} · {other?.full_name}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`badge text-micro ${
                        match.match_score >= 90 ? 'badge-green' :
                        match.match_score >= 75 ? 'badge-blue' : 'badge-yellow'
                      }`}>
                        {match.match_score}% match
                      </span>
                      <p className="font-mono text-label text-ink-700 font-semibold mt-1">
                        ${resolveOptionPrice(match.flight, match.luggage_type)}/kg
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Deals */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-semibold text-title-s text-ink-900">Active deals</h2>
              <p className="text-label text-content-subtle mt-0.5">Deals currently in progress</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill tone="success" dot>Live</StatusPill>
              <button onClick={() => navigate('active-deals')}
                className="flex items-center gap-1 text-label text-ink-700 font-semibold hover:text-ink-900">
                View all <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <RowSkeleton /><RowSkeleton />
            </div>
          ) : activeDeals.length === 0 ? (
            <div className="text-center py-8 bg-surface-sunken rounded-md border border-line">
              <Zap size={22} className="text-ink-300 mx-auto mb-2" />
              <p className="text-body-s text-content-muted font-medium mb-1">No active deals</p>
              <p className="text-label text-content-subtle mb-3">Accept a match to start a deal</p>
              <button onClick={() => navigate('matches')} className="btn-primary text-label px-4 py-2 min-h-0">
                Browse matches
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeDeals.map((deal, i) => {
                const dealValue = (deal.agreed_price_per_kg || resolveOptionPrice(deal.flight, deal.luggage_type) || 0) *
                  (deal.agreed_weight_kg || deal.request?.weight_kg || 0);
                const stageInfo = getDealStageLabel(deal);
                const StageIcon = deal.status === 'in_escrow' ? Lock
                  : deal.status === 'terms_agreed' ? CheckCircle
                  : deal.status === 'proof_uploaded' ? Camera
                  : Zap;
                return (
                  <button key={i} onClick={() => navigate('messages')}
                    className="w-full flex items-center gap-3 p-3 rounded-md hover:bg-surface-sunken transition border border-line text-left">
                    <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 bg-ink-100">
                      <StageIcon size={15} className="text-ink-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-s font-semibold text-ink-900 truncate">
                        {deal.request?.item_name}
                      </p>
                      <p className="font-mono text-label text-content-subtle">
                        {deal.flight?.from_code} → {deal.flight?.to_code}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-mono text-body-s font-semibold text-ink-900">${dealValue.toFixed(0)}</p>
                      <p className={`text-label font-semibold ${stageInfo.color}`}>
                        {stageInfo.label}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Row 2 — Upcoming Flights + Ongoing Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Upcoming Flights */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-semibold text-title-s text-ink-900">Upcoming flights</h2>
              <p className="text-label text-content-subtle mt-0.5">Your listed flights</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill tone="success" dot>Live</StatusPill>
              <button onClick={() => navigate('flights')}
                className="flex items-center gap-1 text-label text-ink-700 font-semibold hover:text-ink-900">
                View all <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <RowSkeleton /><RowSkeleton />
            </div>
          ) : upcomingFlights.length === 0 ? (
            <div className="text-center py-8 bg-surface-sunken rounded-md border border-line">
              <Plane size={22} className="text-ink-300 mx-auto mb-2" />
              <p className="text-body-s text-content-muted font-medium mb-1">No upcoming flights</p>
              <p className="text-label text-content-subtle mb-3">List a flight to start earning</p>
              <button onClick={() => navigate('add-flight')} className="btn-primary text-label px-4 py-2 min-h-0">
                Add a flight
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingFlights.map((flight, i) => (
                <button key={i} onClick={() => navigate('flights')}
                  className="w-full flex items-center gap-3 p-3 rounded-md hover:bg-surface-sunken transition border border-line text-left">
                  <div className="w-9 h-9 rounded-md bg-surface-sunken flex items-center justify-center border border-line flex-shrink-0 overflow-hidden">
                    <AirlineLogo airline={flight.airline} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-body-s font-semibold text-ink-900">
                      {flight.from_code} → {flight.to_code}
                    </p>
                    <p className="text-label text-content-subtle">{flight.airline}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono text-label font-semibold text-ink-700">${flight.price_per_kg}/kg</p>
                    <p className="text-label text-content-subtle">
                      {new Date(flight.flight_date).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short'
                      })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ongoing Requests */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-semibold text-title-s text-ink-900">Ongoing requests</h2>
              <p className="text-label text-content-subtle mt-0.5">Your open shipment requests</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill tone="success" dot>Live</StatusPill>
              <button onClick={() => navigate('my-requests')}
                className="flex items-center gap-1 text-label text-ink-700 font-semibold hover:text-ink-900">
                View all <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <RowSkeleton /><RowSkeleton />
            </div>
          ) : ongoingRequests.length === 0 ? (
            <div className="text-center py-8 bg-surface-sunken rounded-md border border-line">
              <Package size={22} className="text-ink-300 mx-auto mb-2" />
              <p className="text-body-s text-content-muted font-medium mb-1">No open requests</p>
              <p className="text-label text-content-subtle mb-3">Post a request to find a traveller</p>
              <button onClick={() => navigate('new-request')} className="btn-primary text-label px-4 py-2 min-h-0">
                Post a request
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {ongoingRequests.map((req, i) => (
                <button key={i} onClick={() => navigate('my-requests')}
                  className="w-full flex items-center gap-3 p-3 rounded-md hover:bg-surface-sunken transition border border-line text-left">
                  <div className="w-9 h-9 rounded-md bg-ink-100 flex items-center justify-center flex-shrink-0">
                    <Package size={16} className="text-ink-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-s font-semibold text-ink-900 truncate">{req.item_name}</p>
                    <p className="font-mono text-label text-content-subtle">
                      {req.from_code} → {req.to_code} · {req.weight_kg}kg
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono text-label font-semibold text-ink-700">
                      {req.budget_per_kg
                        ? `$${req.budget_per_kg}/kg`
                        : req.max_budget
                          ? `$${req.max_budget} max`
                          : '—'}
                    </p>
                    <p className="text-label text-content-subtle">{req.category}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>

      {reviewsFor && (
        <ReviewsSheet userId={reviewsFor.id} userName={reviewsFor.name} onClose={() => setReviewsFor(null)} />
      )}
    </div>
    );
  };

  return (
    <div className="flex h-screen bg-ground overflow-hidden">

      {/* Sidebar — desktop only; mobile navigation is the bottom nav */}
      <aside className={`${IS_NATIVE ? 'hidden' : 'hidden md:flex md:relative'} inset-y-0 left-0 w-60 bg-surface border-r border-line
        flex-col min-h-0 overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-line">
          <div className="flex items-center gap-2">
            <BareGlyph size={20} />
            <span className="font-display font-extrabold text-title-m tracking-[-0.05em] text-ink-900">fetchr</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-5">
          <button onClick={() => navigate('dashboard')}
            className={`w-full flex items-center gap-3 px-3 h-10 rounded-md text-body-m font-medium transition-all ${
              activeNav === 'dashboard'
                ? 'bg-surface-sunken text-ink-900 font-semibold border-l-[3px] border-ink-900'
                : 'text-content-muted hover:bg-surface-sunken'
            }`}>
            <Home size={16} /> Dashboard
          </button>

          {navGroups.map(group => (
            <div key={group.label}>
              <p className="font-mono text-overline uppercase text-content-subtle px-3 mb-2">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <button key={item.id} onClick={() => navigate(item.id)}
                    className={`w-full flex items-center justify-between px-3 h-10 rounded-md text-body-m font-medium transition-all ${
                      activeNav === item.id
                        ? 'bg-surface-sunken text-ink-900 font-semibold border-l-[3px] border-ink-900'
                        : 'text-content-muted hover:bg-surface-sunken'
                    }`}>
                    <span className="flex items-center gap-3">
                      <item.icon size={15} /> {item.label}
                    </span>
                    {item.badge && stats.activeDeals > 0 && (
                      <span className="w-1.5 h-1.5 bg-signal-500 rounded-full flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {isAdmin && (
            <div>
              <p className="font-mono text-overline uppercase text-content-subtle px-3 mb-2">
                Admin
              </p>
              <div className="space-y-0.5">
                <button onClick={() => navigate('admin')}
                  className={`w-full flex items-center gap-3 px-3 h-10 rounded-md text-body-m font-medium transition-all ${
                    activeNav === 'admin'
                      ? 'bg-surface-sunken text-ink-900 font-semibold border-l-[3px] border-ink-900'
                      : 'text-content-muted hover:bg-surface-sunken'
                  }`}>
                  <Lock size={15} /> Admin dashboard
                </button>
              </div>
            </div>
          )}
        </nav>

        <div className="px-3 pb-4 border-t border-line pt-4">
          <button onClick={async () => { await supabase.auth.signOut(); }}
            className="w-full flex items-center gap-3 px-3 h-10 rounded-md text-body-m text-content-muted hover:bg-surface-sunken hover:text-ink-900 transition font-medium">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">

        <header className="bg-surface border-b border-line px-4 md:px-6 pb-3.5 flex items-center justify-between sticky top-0 z-sticky flex-shrink-0"
          style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('dashboard')} className={`${IS_NATIVE ? 'flex' : 'md:hidden flex'} items-center gap-2`}>
              <BareGlyph size={20} />
              <span className="font-display font-extrabold text-title-s tracking-[-0.05em] text-ink-900">fetchr</span>
            </button>
            <div className={IS_NATIVE ? 'hidden' : 'hidden md:block'}>
              <p className="font-display font-semibold text-title-s text-ink-900">
                {activeNav === 'dashboard' ? 'Dashboard' :
                 activeNav === 'post' ? 'Post' :
                 activeNav === 'add-flight' ? 'Add flight' :
                 activeNav === 'flights' ? 'My flights' :
                 activeNav === 'new-request' ? 'New request' :
                 activeNav === 'my-requests' ? 'My requests' :
                 activeNav === 'matches' ? 'Matches' :
                 activeNav === 'messages' ? 'Messages' :
                 activeNav === 'active-deals' ? 'Active deals' :
                 activeNav === 'completed' ? 'Completed' :
                 activeNav === 'profile' ? 'Profile' :
                 activeNav === 'earnings' ? 'Earnings' :
                 activeNav === 'wallet' ? 'Wallet' :
                 activeNav === 'admin' ? 'Admin dashboard' : 'fetchr'}
              </p>
              <p className="text-label text-content-subtle">
                {new Date().toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long'
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => navigate('post')}
              className={`${IS_NATIVE ? 'hidden' : 'hidden md:inline-flex'} items-center gap-1.5 h-9 px-3.5 rounded-md bg-brand text-white hover:bg-brand-hover transition font-display font-semibold text-body-s`}>
              <PlusCircle size={16} /> Post
            </button>
            <button onClick={() => navigate('wallet')}
              className={`${IS_NATIVE ? 'hidden' : 'hidden md:flex'} items-center gap-1.5 h-9 px-2.5 rounded-md bg-surface-sunken border border-line text-ink-900 hover:border-line-strong transition`}>
              <Wallet size={15} />
              <span className="font-mono text-num-m font-semibold">${stats.walletBalance.toFixed(2)}</span>
            </button>
            <button onClick={() => navigate('wallet')}
              className={`${IS_NATIVE ? 'flex' : 'md:hidden flex'} items-center gap-1.5 h-9 px-2.5 rounded-md bg-surface-sunken border border-line text-ink-900 hover:border-line-strong transition`}>
              <Wallet size={15} />
              <span className="font-mono text-num-m font-semibold">${stats.walletBalance.toFixed(2)}</span>
            </button>
            <button onClick={() => navigate('messages')}
              className="relative w-9 h-9 flex items-center justify-center rounded-md hover:bg-surface-sunken transition text-ink-500">
              <Bell size={18} />
              {stats.activeDeals > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-signal-500 rounded-full" />
              )}
            </button>
            <button onClick={() => navigate('profile')}
              className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-md hover:bg-surface-sunken transition">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile"
                  className="w-8 h-8 rounded-avatar object-cover border border-line" />
              ) : (
                <div className="w-8 h-8 rounded-avatar bg-ink-900 flex items-center justify-center text-label font-mono font-semibold text-paper-100">
                  {getInitials(profile?.full_name || userName)}
                </div>
              )}
              <div className="hidden sm:block text-left">
                <p className="text-body-s font-semibold text-ink-900 leading-tight">{userName}</p>
                <p className="text-label text-content-subtle leading-tight">{getUserRole()}</p>
              </div>
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className={`max-w-6xl mx-auto ${IS_NATIVE ? 'p-4' : 'p-4 md:p-6'} pb-[calc(6rem+env(safe-area-inset-bottom))] ${IS_NATIVE ? '' : 'md:pb-6'}`}>
            {renderMain()}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav — exactly the 5 items the design spec fixes;
          stays visible at all times, including inside an open chat thread. */}
      <nav className={`${IS_NATIVE ? '' : 'md:hidden'} fixed bottom-0 left-0 right-0 bg-surface border-t border-line z-nav px-2 pt-2`}
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
          <div className="flex items-center justify-around">
            {bottomNavItems.map(item => (
              <button key={item.id} onClick={() => navigate(item.id)}
                className={`relative flex flex-col items-center gap-1 px-3 py-1.5 min-w-[44px] min-h-[44px] justify-center rounded-md transition-all ${
                  activeNav === item.id ? 'text-ink-900' : 'text-ink-400'
                }`}>
                {activeNav === item.id && (
                  <span className="absolute top-0 left-2 right-2 h-0.5 bg-ink-900 rounded-full" />
                )}
                <div className="relative">
                  <item.icon size={22} strokeWidth={activeNav === item.id ? 2.5 : 1.8} />
                  {item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-signal-500 rounded-full" />
                  )}
                </div>
                <span className={`text-micro ${activeNav === item.id ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </nav>
    </div>
  );
};

export default Dashboard;
