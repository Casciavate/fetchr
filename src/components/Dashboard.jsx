import React, { useState, useEffect, useCallback } from 'react';
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
import AdminDashboard from './AdminDashboard';
import { AIRLINE_CODES } from './shared/airlines';
import { calcFees } from './EscrowPayment';
import StatusPill from './shared/StatusPill';
import { RowSkeleton } from './shared/Skeleton';
import VerificationBadge from './shared/VerificationBadge';
import RatingDisplay from './shared/RatingDisplay';
import {
  Home, Plane, PlusCircle, User, Package,
  Bell, MessageCircle, Wallet,
  ChevronRight, LogOut, CheckCircle, Search,
  Zap, ArrowUpRight, Lock, Camera
} from 'lucide-react';

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
    <p className="text-body-s text-ink-muted mt-1 mb-6">
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
            <p className="text-body-s text-ink-muted mt-0.5">{opt.sub}</p>
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
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
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

    // Widget data — all in parallel
    const [
      { data: matchesData },
      { data: flightsData },
      { data: activeDealsData },
      { data: requestsData },
    ] = await Promise.all([
      supabase.from('matches')
        .select(`*, flight:flights(*), request:shipment_requests(*),
          traveler:profiles!matches_traveler_id_fkey(*),
          shipper:profiles!matches_shipper_id_fkey(*)`)
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .in('status', ['pending', 'awaiting_other'])
        .order('match_score', { ascending: false }).limit(3),

      supabase.from('flights').select('*')
        .eq('user_id', userId).eq('status', 'active')
        .gte('flight_date', new Date().toISOString().split('T')[0])
        .order('flight_date', { ascending: true }).limit(4),

      supabase.from('matches')
        .select(`*, flight:flights(*), request:shipment_requests(*)`)
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
        .order('created_at', { ascending: false }).limit(4),

      supabase.from('shipment_requests').select('*')
        .eq('user_id', userId).eq('status', 'open')
        .order('created_at', { ascending: false }).limit(4),
    ]);

    setRecentMatches(matchesData || []);
    setUpcomingFlights(flightsData || []);
    setActiveDeals(activeDealsData || []);
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

  const navigate = (id, opts) => { setActiveNav(id); setFocusMatchId(opts?.focusMatchId ?? null); };

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

  const getYourTurnItem = () => {
    for (const deal of activeDeals) {
      const myTermsAgreed = isTraveler(deal) ? deal.terms_agreed_traveler : deal.terms_agreed_shipper;
      const myCompleted = isTraveler(deal) ? deal.traveler_completed : deal.shipper_completed;
      if (deal.status === 'accepted' && !myTermsAgreed) {
        return { kind: 'deal', deal, action: 'Agree terms', icon: CheckCircle };
      }
      if (deal.status === 'terms_agreed' && isShipper(deal)) {
        return { kind: 'deal', deal, action: 'Pay escrow', icon: Lock };
      }
      if (deal.status === 'in_escrow' && isTraveler(deal)) {
        return { kind: 'deal', deal, action: 'Upload proof', icon: Camera };
      }
      if (deal.status === 'proof_uploaded' && !myCompleted && flightHasDeparted(deal)) {
        return { kind: 'deal', deal, action: 'Confirm delivery', icon: CheckCircle };
      }
    }
    if (recentMatches.length > 0) {
      return { kind: 'match', deal: recentMatches[0], action: 'Review match', icon: Search };
    }
    return null;
  };

  const renderMain = () => {
    switch (activeNav) {
      case 'post': return <PostChooser onNavigate={navigate} />;
      case 'add-flight': return <AddFlight session={session} />;
      case 'flights': return <MyFlights session={session} onAddFlight={() => navigate('add-flight')} />;
      case 'new-request': return <NewRequest session={session} />;
      case 'my-requests': return <MyRequests session={session} onNewRequest={() => navigate('new-request')} />;
case 'matches': return <Matches session={session} onNavigate={navigate} />;
      case 'messages': return <Messages session={session} focusMatchId={focusMatchId}
        onThreadOpenChange={setMobileThreadOpen} />;
      case 'active-deals': return <ActiveDeals session={session} onNavigate={navigate} />;
      case 'completed': return <Completed session={session} />;
      case 'profile': return <Profile session={session} userRole={getUserRole()}
        onNavigate={navigate} isAdmin={isAdmin} />;
      case 'earnings': return <Earnings session={session} />;
      case 'wallet': return <WalletScreen session={session} />;
      case 'admin': return isAdmin ? <AdminDashboard /> : renderDashboard();
      default: return renderDashboard();
    }
  };

  const renderDashboard = () => {
    const yourTurn = getYourTurnItem();
    const comingUp = [
      ...activeDeals.filter(d => !(yourTurn?.kind === 'deal' && d.id === yourTurn.deal.id)),
      ...recentMatches.filter(m => !(yourTurn?.kind === 'match' && m.id === yourTurn.deal.id)),
    ].slice(0, 4);

    return (
    <div className="animate-fade-in space-y-6">

      {/* Greeting */}
      <div>
        <h1 className="font-display font-bold text-title-l text-ink-900 tracking-tight">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {userName}
        </h1>
        <p className="text-body-s text-ink-muted mt-1">
          Here's what's happening with your deliveries today.
        </p>
      </div>

      {/* ── Mobile — one decision per screen, real TicketCard anatomy
            matching fetchr_design/ui_kits/fetchr-mobile/MobileApp.jsx's
            MHome ─────────────────────────────────────────────────── */}
      <div className="md:hidden space-y-5">
        {yourTurn ? (() => {
          const deal = yourTurn.deal;
          const other = getOtherParty(deal);
          const ref = (deal.id || '').slice(0, 6).toUpperCase();
          const fees = yourTurn.kind === 'deal' ? calcFees(deal) : null;
          const amount = fees ? (isShipper(deal) ? fees.totalShipperPays : fees.travelerReceives) : null;
          return (
            <div className="ticket">
              {/* Header bar */}
              <div className="h-9 bg-ink-900 flex items-center justify-between px-3.5">
                <div className="flex items-center gap-1.5">
                  <BareGlyph size={15} />
                  <span className="font-display font-extrabold text-[12px] tracking-[-0.05em] text-paper-100">fetchr</span>
                </div>
                <span className="font-mono text-[10px] text-ink-300 uppercase">
                  {yourTurn.kind === 'deal' ? 'DEAL' : 'MATCH'}{deal.match_score != null ? ` · ${Math.min(deal.match_score, 100)}%` : ''} · #{ref}
                </span>
              </div>

              <div className="px-4 py-3.5 space-y-3">
                <StatusPill tone="signal" icon={yourTurn.icon}>Your turn · {yourTurn.action}</StatusPill>

                <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-overline uppercase text-ink-400">From</p>
                    <p className="font-mono font-semibold text-code-l text-ink-900 leading-none mt-0.5">{deal.flight?.from_code || '—'}</p>
                  </div>
                  <div className="flex items-center justify-center pt-4">
                    <div className="w-7 border-t border-dashed border-line-perf" />
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="font-mono text-overline uppercase text-ink-400">To</p>
                    <p className="font-mono font-semibold text-code-l text-ink-900 leading-none mt-0.5">{deal.flight?.to_code || '—'}</p>
                  </div>
                </div>

                <p className="font-mono text-micro text-ink-muted border-t border-b border-line py-1.5 truncate">
                  {deal.flight?.flight_date
                    ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                    : '—'}
                  {' · '}{deal.flight?.flight_number || deal.flight?.airline || '—'}
                  {' · '}{deal.agreed_weight_kg || deal.request?.weight_kg || '—'}kg
                </p>

                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-avatar bg-ink-900 flex items-center justify-center text-[11px] font-mono font-semibold text-paper-100 flex-shrink-0">
                    {getInitials(other?.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-display font-semibold text-title-s text-ink-900 truncate">{other?.full_name || 'User'}</p>
                      <VerificationBadge verified={other?.verified} />
                    </div>
                    <RatingDisplay rating={other?.rating} totalReviews={other?.total_reviews} qualifier="New traveller" />
                  </div>
                </div>

                <p className="text-body-s text-ink-subtle truncate">{deal.request?.item_name}</p>
              </div>

              <div className="perf mx-4" />

              <div className="px-4 py-3.5 space-y-3">
                {amount != null && (
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-body-m text-ink-muted">{isShipper(deal) ? 'You pay' : 'You receive'}</span>
                    <span className="font-mono font-bold text-num-l text-ink-900">${amount.toFixed(2)}</span>
                  </div>
                )}
                <button
                  onClick={() => navigate(yourTurn.kind === 'deal' ? 'messages' : 'matches',
                    yourTurn.kind === 'deal' ? { focusMatchId: deal.id } : undefined)}
                  className="btn-signal w-full">
                  {yourTurn.action}
                </button>
                {yourTurn.kind === 'deal' && (
                  <p className="text-body-s text-ink-muted text-center">We hold it until you both confirm delivery.</p>
                )}
              </div>
            </div>
          );
        })() : (
          <div className="card p-5 text-center">
            <CheckCircle size={20} className="text-ink-300 mx-auto mb-2" />
            <p className="text-body-s text-ink-muted">Nothing needs you right now.</p>
          </div>
        )}

        {comingUp.length > 0 && (
          <div>
            <p className="font-mono text-overline uppercase text-ink-subtle mb-2">Coming up</p>
            <div className="space-y-2">
              {comingUp.map((item, i) => {
                const isDeal = !!item.status && activeDeals.includes(item);
                const stageInfo = isDeal ? getDealStageLabel(item) : null;
                const stubState = isDeal && item.status === 'in_escrow' ? 'secured' : isDeal ? 'yours' : 'default';
                return (
                  <button key={item.id || i}
                    onClick={() => navigate(isDeal ? 'messages' : 'matches', isDeal ? { focusMatchId: item.id } : undefined)}
                    className={`w-full h-14 flex items-center gap-3 px-3.5 rounded-md border bg-surface hover:border-line-strong transition text-left ${
                      stubState === 'yours' ? 'border-l-[3px] border-l-signal-500 border-y-line border-r-line' : 'border-line'
                    }`}>
                    <div className="min-w-0">
                      <p className="font-mono text-body-s font-semibold text-ink-900">
                        {item.flight?.from_code} → {item.flight?.to_code}
                      </p>
                      <p className="text-micro text-ink-subtle truncate">{item.request?.item_name}</p>
                    </div>
                    <p className={`ml-auto text-label font-semibold flex-shrink-0 ${
                      stubState === 'secured' ? 'text-success' : isDeal ? stageInfo.color : 'text-ink-muted'
                    }`}>
                      {isDeal ? stageInfo.label : `${item.match_score}% match`}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => navigate('add-flight')}
            className="card p-4 flex flex-col items-center gap-2 text-center hover:border-line-strong transition">
            <Plane size={18} className="text-ink-700" />
            <span className="text-body-s font-semibold text-ink-900">Add a flight</span>
          </button>
          <button onClick={() => navigate('new-request')}
            className="card p-4 flex flex-col items-center gap-2 text-center hover:border-line-strong transition">
            <Package size={18} className="text-ink-700" />
            <span className="text-body-s font-semibold text-ink-900">Post a request</span>
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
            <p className="text-label text-ink-muted mt-0.5">{stat.label}</p>
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
              <p className="text-label text-ink-subtle mt-0.5">Based on your flights & requests</p>
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
              <p className="text-body-s text-ink-muted font-medium mb-1">No matches yet</p>
              <p className="text-label text-ink-subtle mb-3">Add a flight or request to start matching</p>
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
                      <p className="text-label text-ink-subtle truncate">
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
                        ${match.flight?.price_per_kg}/kg
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
              <p className="text-label text-ink-subtle mt-0.5">Deals currently in progress</p>
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
              <p className="text-body-s text-ink-muted font-medium mb-1">No active deals</p>
              <p className="text-label text-ink-subtle mb-3">Accept a match to start a deal</p>
              <button onClick={() => navigate('matches')} className="btn-primary text-label px-4 py-2 min-h-0">
                Browse matches
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeDeals.map((deal, i) => {
                const dealValue = (deal.agreed_price_per_kg || deal.flight?.price_per_kg || 0) *
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
                      <p className="font-mono text-label text-ink-subtle">
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
              <p className="text-label text-ink-subtle mt-0.5">Your listed flights</p>
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
              <p className="text-body-s text-ink-muted font-medium mb-1">No upcoming flights</p>
              <p className="text-label text-ink-subtle mb-3">List a flight to start earning</p>
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
                    <p className="text-label text-ink-subtle">{flight.airline}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono text-label font-semibold text-ink-700">${flight.price_per_kg}/kg</p>
                    <p className="text-label text-ink-subtle">
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
              <p className="text-label text-ink-subtle mt-0.5">Your open shipment requests</p>
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
              <p className="text-body-s text-ink-muted font-medium mb-1">No open requests</p>
              <p className="text-label text-ink-subtle mb-3">Post a request to find a traveller</p>
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
                    <p className="font-mono text-label text-ink-subtle">
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
                    <p className="text-label text-ink-subtle">{req.category}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
    );
  };

  return (
    <div className="flex h-screen bg-ground overflow-hidden">

      {/* Sidebar — desktop only; mobile navigation is the bottom nav */}
      <aside className="hidden md:flex md:relative inset-y-0 left-0 w-60 bg-surface border-r border-line
        flex-col overflow-y-auto">
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
                : 'text-ink-muted hover:bg-surface-sunken'
            }`}>
            <Home size={16} /> Dashboard
          </button>

          {navGroups.map(group => (
            <div key={group.label}>
              <p className="font-mono text-overline uppercase text-ink-subtle px-3 mb-2">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <button key={item.id} onClick={() => navigate(item.id)}
                    className={`w-full flex items-center justify-between px-3 h-10 rounded-md text-body-m font-medium transition-all ${
                      activeNav === item.id
                        ? 'bg-surface-sunken text-ink-900 font-semibold border-l-[3px] border-ink-900'
                        : 'text-ink-muted hover:bg-surface-sunken'
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
              <p className="font-mono text-overline uppercase text-ink-subtle px-3 mb-2">
                Admin
              </p>
              <div className="space-y-0.5">
                <button onClick={() => navigate('admin')}
                  className={`w-full flex items-center gap-3 px-3 h-10 rounded-md text-body-m font-medium transition-all ${
                    activeNav === 'admin'
                      ? 'bg-surface-sunken text-ink-900 font-semibold border-l-[3px] border-ink-900'
                      : 'text-ink-muted hover:bg-surface-sunken'
                  }`}>
                  <Lock size={15} /> Admin dashboard
                </button>
              </div>
            </div>
          )}
        </nav>

        <div className="px-3 pb-4 border-t border-line pt-4">
          <button onClick={async () => { await supabase.auth.signOut(); }}
            className="w-full flex items-center gap-3 px-3 h-10 rounded-md text-body-m text-ink-muted hover:bg-surface-sunken hover:text-ink-900 transition font-medium">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <header className="bg-surface border-b border-line px-4 md:px-6 py-3.5 flex items-center justify-between sticky top-0 z-sticky flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('dashboard')} className="md:hidden flex items-center gap-2">
              <BareGlyph size={20} />
              <span className="font-display font-extrabold text-title-s tracking-[-0.05em] text-ink-900">fetchr</span>
            </button>
            <div className="hidden md:block">
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
              <p className="text-label text-ink-subtle">
                {new Date().toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long'
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => navigate('post')}
              className="hidden md:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-brand text-white hover:bg-brand-hover transition font-display font-semibold text-body-s">
              <PlusCircle size={16} /> Post
            </button>
            <button onClick={() => navigate('wallet')}
              className="hidden md:flex items-center gap-1.5 h-9 px-2.5 rounded-md bg-surface-sunken border border-line text-ink-900 hover:border-line-strong transition">
              <Wallet size={15} />
              <span className="font-mono text-num-m font-semibold">${stats.walletBalance.toFixed(2)}</span>
            </button>
            <button onClick={() => navigate('wallet')}
              className="md:hidden flex items-center gap-1.5 h-9 px-2.5 rounded-md bg-surface-sunken border border-line text-ink-900 hover:border-line-strong transition">
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
                <p className="text-label text-ink-subtle leading-tight">{getUserRole()}</p>
              </div>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className={`max-w-6xl mx-auto md:p-6 ${mobileThreadOpen ? 'pb-0' : 'p-4 pb-24'} md:pb-6`}>
            {renderMain()}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav — exactly the 5 items the design spec fixes; hidden
          while a chat thread owns the screen (§ ui_kits/fetchr-mobile). */}
      {!mobileThreadOpen && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-line z-nav px-2 py-2">
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
      )}
    </div>
  );
};

export default Dashboard;
