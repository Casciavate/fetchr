import React, { useState, useEffect } from 'react';
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
import {
  Home, Plane, PlusCircle, DollarSign, User, Package,
  FileText, Bell, MessageCircle, Wallet, Star, Heart,
  ChevronRight, Shield, LogOut, CheckCircle, Search,
  Menu, X, TrendingUp, Zap, ArrowUpRight
} from 'lucide-react';

const AIRLINE_CODES = {
  'Emirates': 'EK', 'Qatar Airways': 'QR', 'Etihad Airways': 'EY',
  'Lufthansa': 'LH', 'British Airways': 'BA', 'Air France': 'AF',
  'Turkish Airlines': 'TK', 'Flydubai': 'FZ', 'Air Arabia': 'G9',
  'Singapore Airlines': 'SQ', 'Cathay Pacific': 'CX', 'Qantas': 'QF',
  'American Airlines': 'AA', 'United Airlines': 'UA', 'Delta Air Lines': 'DL',
};

const AirlineLogo = ({ airline }) => {
  const code = AIRLINE_CODES[airline];
  if (!code) return <Plane size={16} className="text-brand-600" />;
  return (
    <img src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`}
      alt={airline} className="w-8 h-8 object-contain"
      onError={e => { e.target.style.display = 'none'; }} />
  );
};

const Dashboard = ({ session }) => {
  const [activeNav, setActiveNav] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [stats, setStats] = useState({
    activeDeals: 0, upcomingFlights: 0,
    completedDeals: 0, walletBalance: 0, totalRequests: 0,
  });
  const [recentMatches, setRecentMatches] = useState([]);
  const [upcomingFlights, setUpcomingFlights] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [activeDeals, setActiveDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const getUserRole = () => {
    const hasFlights = stats.upcomingFlights > 0 || stats.completedDeals > 0;
    const hasRequests = stats.totalRequests > 0 || stats.activeDeals > 0;
    if (hasFlights && hasRequests) return 'Traveler & Shipper';
    if (hasFlights) return 'Traveler';
    if (hasRequests) return 'Shipper';
    return 'New Member';
  };

  const userName = profile?.full_name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'there';

  const fetchDashboardData = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const userId = session.user.id;

    const { data: profileData } = await supabase
      .from('profiles').select('*').eq('id', userId).single();

    if (profileData) {
      setProfile(profileData);
      if (profileData.avatar_url) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(profileData.avatar_url);
        setAvatarUrl(urlData.publicUrl);
      }
    }

    const [
      { count: activeDealsCount },
      { count: flightsCount },
      { count: completedCount },
      { count: requestsCount },
    ] = await Promise.all([
      supabase.from('matches').select('id', { count: 'exact' })
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .in('status', ['accepted', 'in_escrow']),
      supabase.from('flights').select('id', { count: 'exact' })
        .eq('user_id', userId).eq('status', 'active')
        .gte('flight_date', new Date().toISOString().split('T')[0]),
      supabase.from('matches').select('id', { count: 'exact' })
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .eq('status', 'completed'),
      supabase.from('shipment_requests').select('id', { count: 'exact' })
        .eq('user_id', userId),
    ]);

    setStats({
      activeDeals: activeDealsCount || 0,
      upcomingFlights: flightsCount || 0,
      completedDeals: completedCount || 0,
      walletBalance: profileData?.wallet_balance || 0,
      totalRequests: requestsCount || 0,
    });

    const { data: matchesData } = await supabase
      .from('matches')
      .select(`*, flight:flights(*), request:shipment_requests(*),
        traveler:profiles!matches_traveler_id_fkey(*),
        shipper:profiles!matches_shipper_id_fkey(*)`)
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
      .eq('status', 'pending')
      .order('match_score', { ascending: false }).limit(3);
    setRecentMatches(matchesData || []);

    const { data: flightsData } = await supabase
      .from('flights').select('*').eq('user_id', userId)
      .eq('status', 'active')
      .gte('flight_date', new Date().toISOString().split('T')[0])
      .order('flight_date', { ascending: true }).limit(3);
    setUpcomingFlights(flightsData || []);

    const { data: chatsData } = await supabase
      .from('matches')
      .select(`*, flight:flights(*), request:shipment_requests(*),
        traveler:profiles!matches_traveler_id_fkey(*),
        shipper:profiles!matches_shipper_id_fkey(*)`)
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
      .in('status', ['accepted', 'in_escrow', 'completed'])
      .order('created_at', { ascending: false }).limit(4);
    setRecentChats(chatsData || []);

    const { data: activeDealsData } = await supabase
      .from('matches')
      .select(`*, flight:flights(*), request:shipment_requests(*)`)
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
      .in('status', ['accepted', 'in_escrow'])
      .order('created_at', { ascending: false }).limit(2);
    setActiveDeals(activeDealsData || []);

    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    fetchDashboardData(true);
    const userId = session.user.id;
    const sub = supabase.channel(`dashboard-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `traveler_id=eq.${userId}` }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `shipper_id=eq.${userId}` }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights', filter: `user_id=eq.${userId}` }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipment_requests', filter: `user_id=eq.${userId}` }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, () => fetchDashboardData())
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  const navGroups = [
    {
      label: 'Account',
      items: [
        { id: 'profile', icon: User, label: 'Profile' },
        { id: 'earnings', icon: TrendingUp, label: 'Earnings' },
        { id: 'wallet', icon: Wallet, label: 'Wallet' },
      ]
    },
    {
      label: 'Traveler',
      items: [
        { id: 'flights', icon: Plane, label: 'My Flights' },
        { id: 'add-flight', icon: PlusCircle, label: 'Add Flight' },
      ]
    },
    {
      label: 'Shipper',
      items: [
        { id: 'new-request', icon: PlusCircle, label: 'New Request' },
        { id: 'my-requests', icon: Package, label: 'My Requests' },
      ]
    },
    {
      label: 'Deals',
      items: [
        { id: 'matches', icon: Search, label: 'Matches' },
        { id: 'active-deals', icon: Zap, label: 'Active Deals' },
        { id: 'completed', icon: CheckCircle, label: 'Completed' },
        { id: 'messages', icon: MessageCircle, label: 'Messages', badge: true },
      ]
    },
  ];

  const bottomNavItems = [
    { id: 'dashboard', icon: Home, label: 'Home' },
    { id: 'matches', icon: Search, label: 'Matches' },
    { id: 'messages', icon: MessageCircle, label: 'Chat', badge: stats.activeDeals },
    { id: 'active-deals', icon: Zap, label: 'Deals' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getOtherParty = (match) => match.traveler_id === session.user.id ? match.shipper : match.traveler;

  const navigate = (id) => { setActiveNav(id); setSidebarOpen(false); };

  const renderMain = () => {
    switch (activeNav) {
      case 'add-flight': return <AddFlight session={session} />;
      case 'flights': return <MyFlights session={session} onAddFlight={() => navigate('add-flight')} />;
      case 'new-request': return <NewRequest session={session} />;
      case 'my-requests': return <MyRequests session={session} onNewRequest={() => navigate('new-request')} />;
      case 'matches': return <Matches session={session} />;
      case 'messages': return <Messages session={session} />;
      case 'active-deals': return <ActiveDeals session={session} onNavigate={navigate} />;
      case 'completed': return <Completed session={session} />;
      case 'profile': return <Profile session={session} userRole={getUserRole()} />;
      case 'earnings': return <Earnings session={session} />;
      case 'wallet': return <WalletScreen session={session} />;
      default: return renderDashboard();
    }
  };

  const statCards = [
    {
      label: 'Active Deals',
      value: stats.activeDeals,
      icon: Zap,
      color: 'from-violet-500 to-purple-600',
      textColor: 'text-violet-600',
      bg: 'bg-violet-50',
      nav: 'active-deals',
      suffix: null,
    },
    {
      label: 'Flights Listed',
      value: stats.upcomingFlights,
      icon: Plane,
      color: 'from-blue-500 to-indigo-600',
      textColor: 'text-blue-600',
      bg: 'bg-blue-50',
      nav: 'flights',
      suffix: null,
    },
    {
      label: 'Deals Done',
      value: stats.completedDeals,
      icon: CheckCircle,
      color: 'from-emerald-500 to-green-600',
      textColor: 'text-emerald-600',
      bg: 'bg-emerald-50',
      nav: 'completed',
      suffix: null,
    },
    {
      label: 'Wallet',
      value: stats.walletBalance,
      icon: Wallet,
      color: 'from-amber-500 to-orange-600',
      textColor: 'text-amber-600',
      bg: 'bg-amber-50',
      nav: 'wallet',
      prefix: '$',
    },
  ];

  const renderDashboard = () => (
    <div className="animate-fade-in">
      {/* Hero greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {userName} 👋
        </h1>
        <p className="text-gray-500 mt-1">Here's what's happening with your deliveries today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat, i) => (
          <button key={i} onClick={() => navigate(stat.nav)}
            className="group bg-white rounded-2xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 text-left border border-gray-100/80">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center`}>
                <stat.icon size={18} className={stat.textColor} />
              </div>
              <ArrowUpRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
            </div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight">
              {stat.prefix || ''}{typeof stat.value === 'number' && stat.prefix === '$'
                ? stat.value.toFixed(2)
                : stat.value}
            </p>
            <p className="text-sm text-gray-500 mt-0.5 font-medium">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Recommended Matches */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Recommended Matches</h2>
            <p className="text-sm text-gray-500 mt-0.5">Curated for you based on your activity</p>
          </div>
          <button onClick={() => navigate('matches')}
            className="flex items-center gap-1.5 text-sm text-violet-600 font-semibold hover:text-violet-700 transition">
            View all <ChevronRight size={16} />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1,2,3].map(i => (
              <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : recentMatches.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-xl">
            <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Search size={20} className="text-violet-500" />
            </div>
            <p className="text-gray-600 font-medium text-sm mb-1">No matches yet</p>
            <p className="text-gray-400 text-xs mb-4">Add a flight or request to start matching</p>
            <button onClick={() => navigate('matches')}
              className="btn-primary">
              Find Matches
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recentMatches.map(match => {
              const other = getOtherParty(match);
              return (
                <div key={match.id}
                  onClick={() => navigate('matches')}
                  className="group border border-gray-100 rounded-xl p-4 hover:border-violet-200 hover:bg-violet-50/30 transition-all cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`badge ${
                      match.match_score >= 90 ? 'badge-green' :
                      match.match_score >= 75 ? 'badge-blue' : 'badge-yellow'
                    }`}>
                      ⚡ {match.match_score}% match
                    </span>
                    <Heart size={14} className="text-gray-300 group-hover:text-violet-400 transition-colors" />
                  </div>
                  <p className="font-bold text-gray-900 text-sm mb-0.5">
                    {match.flight?.from_city} → {match.flight?.to_city}
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    {match.flight?.flight_date ? new Date(match.flight.flight_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-600">
                      {getInitials(other?.full_name)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{other?.full_name || 'User'}</p>
                      {other?.rating > 0 && (
                        <div className="flex items-center gap-0.5">
                          <Star size={10} className="text-amber-400 fill-amber-400" />
                          <span className="text-xs text-gray-500">{other.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xs font-bold text-violet-600">${match.flight?.price_per_kg}/kg</p>
                      <p className="text-xs text-gray-400">{match.flight?.available_kg}kg</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two column bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Upcoming Flights */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">Upcoming Flights</h2>
            <button onClick={() => navigate('flights')}
              className="text-sm text-violet-600 font-semibold hover:text-violet-700 flex items-center gap-1">
              View all <ChevronRight size={14} />
            </button>
          </div>
          {upcomingFlights.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-xl">
              <Plane size={24} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm font-medium mb-3">No upcoming flights</p>
              <button onClick={() => navigate('add-flight')} className="btn-primary text-xs">
                + Add Flight
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingFlights.map((flight, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition group">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100 flex-shrink-0 overflow-hidden">
                    <AirlineLogo airline={flight.airline} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">
                      {flight.from_code} → {flight.to_code}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(flight.flight_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-violet-600">${flight.price_per_kg}/kg</p>
                    <p className="text-xs text-gray-400">{flight.available_kg}kg free</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Deals */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">Active Deals</h2>
            <button onClick={() => navigate('active-deals')}
              className="text-sm text-violet-600 font-semibold hover:text-violet-700 flex items-center gap-1">
              View all <ChevronRight size={14} />
            </button>
          </div>
          {activeDeals.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-xl">
              <Zap size={24} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm font-medium mb-3">No active deals</p>
              <button onClick={() => navigate('matches')} className="btn-primary text-xs">
                Browse Matches
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeDeals.map((deal, i) => {
                const dealValue = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
                return (
                  <button key={i} onClick={() => navigate('messages')}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition text-left group">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      deal.status === 'in_escrow' ? 'bg-blue-50' : 'bg-amber-50'
                    }`}>
                      <span className="text-lg">{deal.status === 'in_escrow' ? '🔒' : '🤝'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{deal.request?.item_name}</p>
                      <p className="text-xs text-gray-400">
                        {deal.flight?.from_code} → {deal.flight?.to_code}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-800">${dealValue.toFixed(0)}</p>
                      <span className={`text-xs font-semibold ${deal.status === 'in_escrow' ? 'text-blue-500' : 'text-amber-500'}`}>
                        {deal.status === 'in_escrow' ? 'Escrow' : 'Pending'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#f8f7ff] overflow-hidden">

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative inset-y-0 left-0 z-50
        w-64 bg-white border-r border-gray-100
        flex flex-col overflow-y-auto
        transform transition-transform duration-300 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center shadow-button">
              <Plane size={15} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-xl tracking-tight">Fetchr</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-gray-600 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-6">
          <button onClick={() => navigate('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeNav === 'dashboard'
                ? 'bg-violet-600 text-white shadow-button'
                : 'text-gray-600 hover:bg-gray-100'
            }`}>
            <Home size={16} /> Dashboard
          </button>

          {navGroups.map(group => (
            <div key={group.label}>
              <p className="text-xs font-semibold text-gray-400 px-3 mb-2 uppercase tracking-widest">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <button key={item.id} onClick={() => navigate(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeNav === item.id
                        ? 'bg-violet-50 text-violet-700 font-semibold'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}>
                    <span className="flex items-center gap-3">
                      <item.icon size={15} /> {item.label}
                    </span>
                    {item.badge && stats.activeDeals > 0 && (
                      <span className="bg-violet-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {stats.activeDeals}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-4 space-y-1 border-t border-gray-100 pt-4">
          <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl p-4 mb-3">
            <p className="text-xs font-bold text-white mb-0.5">Refer & Earn</p>
            <p className="text-xs text-violet-200 mb-3">Earn 10% on every referral deal</p>
            <button className="w-full bg-white text-violet-700 text-xs font-bold py-1.5 rounded-lg hover:bg-violet-50 transition">
              Share Fetchr 🎁
            </button>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition font-medium">
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 md:px-6 py-3.5 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition text-gray-500">
              <Menu size={20} />
            </button>
            <div className="hidden md:block">
              <p className="text-sm font-semibold text-gray-900">
                {activeNav === 'dashboard' ? 'Dashboard' :
                 activeNav === 'add-flight' ? 'Add Flight' :
                 activeNav === 'flights' ? 'My Flights' :
                 activeNav === 'new-request' ? 'New Request' :
                 activeNav === 'my-requests' ? 'My Requests' :
                 activeNav === 'matches' ? 'Matches' :
                 activeNav === 'messages' ? 'Messages' :
                 activeNav === 'active-deals' ? 'Active Deals' :
                 activeNav === 'completed' ? 'Completed' :
                 activeNav === 'profile' ? 'Profile' :
                 activeNav === 'earnings' ? 'Earnings' :
                 activeNav === 'wallet' ? 'Wallet' : 'Fetchr'}
              </p>
              <p className="text-xs text-gray-400">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => navigate('messages')}
              className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition text-gray-500">
              <Bell size={18} />
              {stats.activeDeals > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-violet-600 rounded-full" />
              )}
            </button>

            <button onClick={() => navigate('profile')}
              className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl hover:bg-gray-100 transition">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile"
                  className="w-8 h-8 rounded-lg object-cover border-2 border-violet-100" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">
                  {getInitials(profile?.full_name || userName)}
                </div>
              )}
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{userName}</p>
                <p className="text-xs text-gray-400 leading-tight">{getUserRole()}</p>
              </div>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 md:pb-6">
            {renderMain()}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-100 z-30 px-2 py-2 safe-area-bottom">
        <div className="flex items-center justify-around">
          {bottomNavItems.map(item => (
            <button key={item.id} onClick={() => navigate(item.id)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                activeNav === item.id ? 'text-violet-600' : 'text-gray-400'
              }`}>
              <div className="relative">
                <item.icon size={22} strokeWidth={activeNav === item.id ? 2.5 : 1.8} />
                {item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-violet-600 rounded-full" />
                )}
              </div>
              <span className={`text-xs font-medium ${activeNav === item.id ? 'font-bold' : ''}`}>
                {item.label}
              </span>
            </button>
          ))}
          <button onClick={async () => { await supabase.auth.signOut(); }}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition text-gray-400">
            <LogOut size={22} strokeWidth={1.8} />
            <span className="text-xs font-medium">Logout</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Dashboard;