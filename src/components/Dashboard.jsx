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
  FileText, Bell, MessageCircle, Wallet,
  Star, Heart, MoreVertical, ChevronRight, Shield,
  LogOut, CheckCircle, Search, Menu, X
} from 'lucide-react';

const AIRLINE_CODES = {
  'Emirates': 'EK', 'Qatar Airways': 'QR', 'Etihad Airways': 'EY',
  'Lufthansa': 'LH', 'British Airways': 'BA', 'Air France': 'AF',
  'Turkish Airlines': 'TK', 'Flydubai': 'FZ', 'Air Arabia': 'G9',
  'Singapore Airlines': 'SQ', 'Cathay Pacific': 'CX', 'Qantas': 'QF',
  'American Airlines': 'AA', 'United Airlines': 'UA', 'Delta Air Lines': 'DL',
  'Southwest Airlines': 'WN', 'Ryanair': 'FR', 'easyJet': 'U2',
  'KLM': 'KL', 'Swiss': 'LX', 'Austrian Airlines': 'OS',
  'Finnair': 'AY', 'SAS': 'SK', 'Iberia': 'IB',
  'EgyptAir': 'MS', 'Ethiopian Airlines': 'ET', 'Kenya Airways': 'KQ',
  'Saudia': 'SV', 'Gulf Air': 'GF', 'Oman Air': 'WY',
  'Air India': 'AI', 'Japan Airlines': 'JL', 'Korean Air': 'KE',
  'ANA': 'NH', 'Thai Airways': 'TG', 'Malaysia Airlines': 'MH',
  'LATAM': 'LA', 'Avianca': 'AV', 'Air Canada': 'AC',
};

const AirlineLogo = ({ airline }) => {
  const code = AIRLINE_CODES[airline];
  if (!code) return <Plane size={16} className="text-purple-600" />;
  return (
    <img
      src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`}
      alt={airline}
      className="w-8 h-8 object-contain"
      onError={e => { e.target.style.display = 'none'; }}
    />
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

  const userName = profile?.full_name || session?.user?.email || 'there';

  const fetchDashboardData = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const userId = session.user.id;

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
    const dashboardSub = supabase
      .channel(`dashboard-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `traveler_id=eq.${userId}` }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `shipper_id=eq.${userId}` }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights', filter: `user_id=eq.${userId}` }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipment_requests', filter: `user_id=eq.${userId}` }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, () => fetchDashboardData())
      .subscribe();
    return () => supabase.removeChannel(dashboardSub);
  }, []);

  const navItems = {
    account: [
      { id: 'profile', icon: User, label: 'Profile' },
      { id: 'earnings', icon: DollarSign, label: 'Earnings' },
      { id: 'wallet', icon: Wallet, label: 'Wallet' },
    ],
    traveler: [
      { id: 'flights', icon: Plane, label: 'My Flights' },
      { id: 'add-flight', icon: PlusCircle, label: 'Add Flight' },
    ],
    shipper: [
      { id: 'new-request', icon: PlusCircle, label: 'New Request' },
      { id: 'my-requests', icon: Package, label: 'My Requests' },
    ],
    deals: [
      { id: 'matches', icon: Search, label: 'Matches' },
      { id: 'active-deals', icon: FileText, label: 'Active Deals' },
      { id: 'completed', icon: CheckCircle, label: 'Completed' },
      { id: 'messages', icon: MessageCircle, label: 'Messages' },
    ]
  };

  // Bottom nav items for mobile
  const bottomNavItems = [
    { id: 'dashboard', icon: Home, label: 'Home' },
    { id: 'matches', icon: Search, label: 'Matches' },
    { id: 'messages', icon: MessageCircle, label: 'Chat', badge: stats.activeDeals },
    { id: 'active-deals', icon: FileText, label: 'Deals' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getOtherParty = (match) => {
    return match.traveler_id === session.user.id ? match.shipper : match.traveler;
  };

  const navigate = (id) => {
    setActiveNav(id);
    setSidebarOpen(false);
  };

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

  const renderDashboard = () => (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Active Deals', value: stats.activeDeals, link: 'View deals', color: 'purple', icon: '🛍️', nav: 'active-deals' },
          { label: 'Upcoming Flights', value: stats.upcomingFlights, link: 'View flights', color: 'green', icon: '✈️', nav: 'flights' },
          { label: 'Completed', value: stats.completedDeals, link: 'View history', color: 'yellow', icon: '✅', nav: 'completed' },
          { label: 'Wallet', value: `$${stats.walletBalance.toFixed(2)}`, link: 'View wallet', color: 'gray', icon: '💰', nav: 'wallet' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className={`text-xs font-medium ${
                stat.color === 'purple' ? 'text-purple-600' :
                stat.color === 'green' ? 'text-green-600' :
                stat.color === 'yellow' ? 'text-yellow-600' : 'text-gray-600'
              }`}>{stat.label}</p>
              <span className="text-lg">{stat.icon}</span>
            </div>
            <p className="text-xl md:text-2xl font-bold text-gray-800">{stat.value}</p>
            <button onClick={() => navigate(stat.nav)}
              className="text-xs text-purple-500 mt-1 flex items-center gap-1">
              {stat.link} <ChevronRight size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* Recommended Matches */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">Recommended Matches</h2>
          <button onClick={() => navigate('matches')} className="text-sm text-purple-500 flex items-center gap-1">
            View all <ChevronRight size={14} />
          </button>
        </div>
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-6">Loading...</p>
        ) : recentMatches.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm mb-3">No pending matches yet</p>
            <button onClick={() => navigate('matches')}
              className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700">
              Find Matches
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recentMatches.map(match => {
              const other = getOtherParty(match);
              return (
                <div key={match.id}
                  className="border border-gray-100 rounded-xl p-4 hover:border-purple-200 transition-all cursor-pointer"
                  onClick={() => navigate('matches')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      match.match_score >= 90 ? 'bg-green-50 text-green-600' :
                      match.match_score >= 75 ? 'bg-blue-50 text-blue-600' :
                      'bg-orange-50 text-orange-600'
                    }`}>{match.match_score}% Match</span>
                    <Heart size={16} className="text-gray-300" />
                  </div>
                  <p className="font-semibold text-gray-800 text-sm">
                    {match.flight?.from_city} → {match.flight?.to_city}
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    {match.flight?.flight_date ? new Date(match.flight.flight_date).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short'
                    }) : ''}
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-600">
                      {getInitials(other?.full_name)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{other?.full_name || 'User'}</p>
                      {other?.rating > 0 && (
                        <div className="flex items-center gap-1">
                          <Star size={10} className="text-yellow-400 fill-yellow-400" />
                          <span className="text-xs text-gray-600">{other.rating}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">{match.flight?.available_kg}kg</span>
                    <span className="text-xs font-semibold text-purple-600">${match.flight?.price_per_kg}/kg</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming Flights */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">Upcoming Flights</h2>
          <button onClick={() => navigate('flights')} className="text-sm text-purple-500 flex items-center gap-1">
            View all <ChevronRight size={14} />
          </button>
        </div>
        {upcomingFlights.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-400 text-sm mb-3">No upcoming flights</p>
            <button onClick={() => navigate('add-flight')}
              className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700">
              + Add Flight
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingFlights.map((flight, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <AirlineLogo airline={flight.airline} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {flight.from_code} → {flight.to_code}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(flight.flight_date).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short'
                      })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-600">{flight.available_kg}kg</p>
                  <p className="text-xs font-semibold text-purple-600">${flight.price_per_kg}/kg</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Chats — mobile only */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6 md:hidden">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800">Recent Chats</h3>
          <button onClick={() => navigate('messages')} className="text-xs text-purple-500">View all</button>
        </div>
        {recentChats.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No chats yet</p>
        ) : (
          <div className="space-y-3">
            {recentChats.slice(0, 3).map((chat, i) => {
              const other = getOtherParty(chat);
              return (
                <button key={i} onClick={() => navigate('messages')}
                  className="w-full flex items-center gap-2 text-left">
                  <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0">
                    {getInitials(other?.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {other?.full_name || 'User'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {chat.request?.item_name} • {chat.flight?.from_code} → {chat.flight?.to_code}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-50
        w-64 md:w-56 bg-white border-r border-gray-100
        flex flex-col py-4 px-3 flex-shrink-0
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex items-center justify-between px-2 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-purple-600 rounded-lg flex items-center justify-center">
              <Plane size={14} className="text-white" />
            </div>
            <span className="font-bold text-purple-600 text-lg">Fetchr</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400">
            <X size={20} />
          </button>
        </div>

        <button onClick={() => navigate('dashboard')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-sm font-medium ${activeNav === 'dashboard' ? 'bg-purple-50 text-purple-600' : 'text-gray-600 hover:bg-gray-50'}`}>
          <Home size={16} /> Dashboard
        </button>

        <p className="text-xs font-semibold text-gray-400 px-3 mb-1 uppercase tracking-wider">Account</p>
        {navItems.account.map(item => (
          <button key={item.id} onClick={() => navigate(item.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${activeNav === item.id ? 'bg-purple-50 text-purple-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            <item.icon size={16} />{item.label}
          </button>
        ))}

        <p className="text-xs font-semibold text-gray-400 px-3 mb-1 mt-3 uppercase tracking-wider">Traveler</p>
        {navItems.traveler.map(item => (
          <button key={item.id} onClick={() => navigate(item.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${activeNav === item.id ? 'bg-purple-50 text-purple-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            <item.icon size={16} />{item.label}
          </button>
        ))}

        <p className="text-xs font-semibold text-gray-400 px-3 mb-1 mt-3 uppercase tracking-wider">Shipper</p>
        {navItems.shipper.map(item => (
          <button key={item.id} onClick={() => navigate(item.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${activeNav === item.id ? 'bg-purple-50 text-purple-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            <item.icon size={16} />{item.label}
          </button>
        ))}

        <p className="text-xs font-semibold text-gray-400 px-3 mb-1 mt-3 uppercase tracking-wider">Deals</p>
        {navItems.deals.map(item => (
          <button key={item.id} onClick={() => navigate(item.id)}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${activeNav === item.id ? 'bg-purple-50 text-purple-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            <span className="flex items-center gap-2"><item.icon size={16} />{item.label}</span>
            {item.id === 'messages' && stats.activeDeals > 0 && (
              <span className="bg-purple-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {stats.activeDeals}
              </span>
            )}
          </button>
        ))}

        <div className="mt-auto mx-1 bg-purple-50 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-purple-700">Refer & Earn</p>
              <p className="text-xs text-gray-500 mt-0.5">Earn 10% commission</p>
            </div>
            <span className="text-2xl">🎁</span>
          </div>
          <button className="mt-2 w-full bg-white text-purple-600 text-xs font-semibold py-1.5 rounded-lg border border-purple-200">
            Refer Now
          </button>
        </div>

        <button onClick={async () => { await supabase.auth.signOut(); }}
          className="flex items-center gap-2 px-3 py-2 mt-2 text-gray-400 text-sm hover:text-gray-600">
          <LogOut size={16} /> Logout
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto flex flex-col min-w-0">

        {/* Top Bar */}
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Hamburger menu — mobile only */}
            <button onClick={() => setSidebarOpen(true)}
              className="md:hidden text-gray-500 hover:text-gray-700">
              <Menu size={22} />
            </button>
            <div>
              <h1 className="text-base md:text-lg font-bold text-gray-800">
                Welcome, {userName.split(' ')[0]}! 👋
              </h1>
              <p className="text-xs text-gray-400 hidden md:block">Ready to deliver the world together.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="relative cursor-pointer" onClick={() => navigate('messages')}>
              <Bell size={20} className="text-gray-500" />
              {stats.activeDeals > 0 && (
                <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {stats.activeDeals}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('profile')}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-8 h-8 rounded-full object-cover border-2 border-purple-100" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600">
                  {getInitials(userName)}
                </div>
              )}
              <div className="hidden md:block">
                <p className="text-sm font-semibold text-gray-800">{userName}</p>
                <p className="text-xs text-gray-400">{getUserRole()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
            {renderMain()}
          </div>

          {/* Right Panel — desktop only, dashboard only */}
          {activeNav === 'dashboard' && (
            <div className="hidden lg:flex w-72 bg-white border-l border-gray-100 flex-col overflow-y-auto flex-shrink-0 p-4">

              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800">Recent Chats</h3>
                  <button onClick={() => navigate('messages')} className="text-xs text-purple-500">View all</button>
                </div>
                {recentChats.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No chats yet</p>
                ) : (
                  <div className="space-y-3">
                    {recentChats.map((chat, i) => {
                      const other = getOtherParty(chat);
                      return (
                        <button key={i} onClick={() => navigate('messages')}
                          className="w-full flex items-center gap-2 hover:bg-gray-50 rounded-lg p-1.5 -mx-1.5 text-left">
                          <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0">
                            {getInitials(other?.full_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {other?.full_name || 'User'}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {chat.request?.item_name} • {chat.flight?.from_code} → {chat.flight?.to_code}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800">Active Deals</h3>
                  <button onClick={() => navigate('active-deals')} className="text-xs text-purple-500">View all</button>
                </div>
                {activeDeals.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No active deals yet</p>
                ) : (
                  <div className="space-y-3">
                    {activeDeals.map((deal, i) => {
                      const dealValue = (deal.flight?.price_per_kg || 0) * (deal.request?.weight_kg || 0);
                      const total = dealValue * 1.10;
                      return (
                        <div key={i} className="border border-gray-100 rounded-xl p-3">
                          {deal.request?.item_photo_url && (
                            <img src={deal.request.item_photo_url} alt={deal.request.item_name}
                              className="w-full h-20 object-cover rounded-lg mb-2" />
                          )}
                          <p className="text-sm font-semibold text-gray-800 truncate">{deal.request?.item_name}</p>
                          <p className="text-xs text-gray-400 mb-2">{deal.flight?.from_city} → {deal.flight?.to_city}</p>
                          <div className="flex justify-between text-xs mb-2">
                            <span className="text-gray-500">Deal <span className="font-semibold text-gray-800">${dealValue.toFixed(2)}</span></span>
                            <span className="text-gray-500">Escrow <span className="font-semibold text-purple-600">${total.toFixed(2)}</span></span>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            deal.status === 'in_escrow' ? 'bg-blue-50 text-blue-600' : 'bg-yellow-50 text-yellow-600'
                          }`}>
                            {deal.status === 'in_escrow' ? '💰 In Escrow' : '⏳ Awaiting Payment'}
                          </span>
                          <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                            <div className="bg-purple-600 h-1.5 rounded-full"
                              style={{ width: deal.status === 'in_escrow' ? '66%' : '33%' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-purple-50 rounded-xl p-3 flex gap-2">
                <Shield size={20} className="text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-purple-700">Your Safety is Our Priority</p>
                  <p className="text-xs text-gray-500 mt-0.5">All transactions secured with escrow.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

{/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30">
        <div className="flex items-center justify-around px-2 py-2">
          {bottomNavItems.map(item => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition ${
                activeNav === item.id ? 'text-purple-600' : 'text-gray-400'
              }`}
            >
              <div className="relative">
                <item.icon size={22} />
                {item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
              {activeNav === item.id && (
                <div className="w-1 h-1 bg-purple-600 rounded-full" />
              )}
            </button>
          ))}
          <button
            onClick={async () => { await supabase.auth.signOut(); }}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition text-gray-400"
          >
            <LogOut size={22} />
            <span className="text-xs font-medium">Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
