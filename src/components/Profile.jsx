import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  User, Mail, Phone, Globe, Star, Shield, Edit2,
  Check, X, Award, Package, Plane, DollarSign, Camera,
  CreditCard, CheckCircle, Trash2, TrendingUp, AlertTriangle,
  ChevronDown, ChevronUp, MessageCircle, LogOut
} from 'lucide-react';

const LANGUAGES = [
  'English', 'Arabic', 'French', 'German', 'Spanish', 'Italian',
  'Portuguese', 'Russian', 'Chinese', 'Japanese', 'Hindi', 'Turkish',
  'Dutch', 'Korean', 'Swedish', 'Norwegian', 'Danish', 'Finnish',
  'Urdu', 'Bengali', 'Tagalog', 'Persian', 'Swahili'
];

const NATIONALITIES = [
  'Afghan', 'Albanian', 'Algerian', 'American', 'Argentinian', 'Australian',
  'Austrian', 'Bahraini', 'Bangladeshi', 'Belgian', 'Brazilian', 'British',
  'Bulgarian', 'Canadian', 'Chilean', 'Chinese', 'Colombian', 'Croatian',
  'Czech', 'Danish', 'Dutch', 'Egyptian', 'Emirati', 'Ethiopian', 'Finnish',
  'French', 'German', 'Ghanaian', 'Greek', 'Hungarian', 'Indian', 'Indonesian',
  'Iranian', 'Iraqi', 'Irish', 'Israeli', 'Italian', 'Japanese', 'Jordanian',
  'Kenyan', 'Korean', 'Kuwaiti', 'Lebanese', 'Malaysian', 'Mexican', 'Moroccan',
  'Nigerian', 'Norwegian', 'Omani', 'Pakistani', 'Palestinian', 'Peruvian',
  'Philippine', 'Polish', 'Portuguese', 'Qatari', 'Romanian', 'Russian',
  'Saudi', 'Singaporean', 'South African', 'Spanish', 'Sri Lankan', 'Swedish',
  'Swiss', 'Syrian', 'Thai', 'Tunisian', 'Turkish', 'Ukrainian', 'Vietnamese'
];

const Profile = ({ session, userRole }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [showPayoutSetup, setShowPayoutSetup] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutCard, setPayoutCard] = useState({ number: '', expiry: '', name: '' });
  const [stats, setStats] = useState({
    flightsActive: 0, flightsCompleted: 0,
    requestsActive: 0, requestsCompleted: 0,
    dealsCompleted: 0, dealsOngoing: 0,
  });
  const [reviews, setReviews] = useState([]);
  const [showReviews, setShowReviews] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteEmailSent, setDeleteEmailSent] = useState(false);
  const [form, setForm] = useState({
    full_name: '', bio: '', phone: '', nationality: '', languages: []
  });
  const fileInputRef = useRef(null);

  const fetchProfile = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles').select('*').eq('id', session.user.id).single();
    if (data) {
      setProfile(data);
      setForm({
        full_name: data.full_name || '',
        bio: data.bio || '',
        phone: data.phone || '',
        nationality: data.nationality || '',
        languages: data.languages || []
      });
      if (data.avatar_url) {
        const { data: urlData } = supabase.storage
          .from('avatars').getPublicUrl(data.avatar_url);
        setAvatarUrl(urlData.publicUrl);
      }
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    const userId = session.user.id;
    const today = new Date().toISOString().split('T')[0];

    const [
      { count: flightsActive },
      { count: flightsCompleted },
      { count: requestsActive },
      { count: requestsCompleted },
      { count: dealsCompleted },
      { count: dealsOngoing },
    ] = await Promise.all([
      supabase.from('flights').select('id', { count: 'exact' })
        .eq('user_id', userId).eq('status', 'active')
        .gte('flight_date', today),
      supabase.from('flights').select('id', { count: 'exact' })
        .eq('user_id', userId).eq('status', 'expired'),
      supabase.from('shipment_requests').select('id', { count: 'exact' })
        .eq('user_id', userId).eq('status', 'open'),
      supabase.from('shipment_requests').select('id', { count: 'exact' })
        .eq('user_id', userId).eq('status', 'matched'),
      supabase.from('matches').select('id', { count: 'exact' })
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .eq('status', 'completed'),
      supabase.from('matches').select('id', { count: 'exact' })
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
        .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded']),
    ]);

    setStats({
      flightsActive: flightsActive || 0,
      flightsCompleted: flightsCompleted || 0,
      requestsActive: requestsActive || 0,
      requestsCompleted: requestsCompleted || 0,
      dealsCompleted: dealsCompleted || 0,
      dealsOngoing: dealsOngoing || 0,
    });
  };

  const fetchReviews = async () => {
    // Reviews are ratings given to this user via completed deals
    const userId = session.user.id;
    const { data: dealsAsTraveler } = await supabase
      .from('matches')
      .select(`*, shipper:profiles!matches_shipper_id_fkey(full_name, avatar_url)`)
      .eq('traveler_id', userId)
      .eq('status', 'completed')
      .not('shipper_rating', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: dealsAsShipper } = await supabase
      .from('matches')
      .select(`*, traveler:profiles!matches_traveler_id_fkey(full_name, avatar_url)`)
      .eq('shipper_id', userId)
      .eq('status', 'completed')
      .not('traveler_rating', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    const combined = [
      ...(dealsAsTraveler || []).map(d => ({
        id: d.id,
        rating: d.shipper_rating,
        reviewer: d.shipper,
        role: 'Traveler',
        date: d.created_at,
      })),
      ...(dealsAsShipper || []).map(d => ({
        id: d.id,
        rating: d.traveler_rating,
        reviewer: d.traveler,
        role: 'Shipper',
        date: d.created_at,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    setReviews(combined);
  };

  useEffect(() => {
    fetchProfile();
    fetchStats();
    fetchReviews();

    // Real-time updates
    const userId = session.user.id;
    const sub = supabase.channel(`profile-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, () => {
        fetchProfile();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        fetchStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights', filter: `user_id=eq.${userId}` }, () => {
        fetchStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipment_requests', filter: `user_id=eq.${userId}` }, () => {
        fetchStats();
      })
      .subscribe();

    return () => supabase.removeChannel(sub);
  }, []);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) { setError('Please select an image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB.'); return; }
    setUploadingPhoto(true); setError('');
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${session.user.id}/avatar.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      await supabase.from('profiles').update({ avatar_url: filePath }).eq('id', session.user.id);
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setAvatarUrl(urlData.publicUrl + '?t=' + Date.now());
      setSuccess('Photo updated!'); setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
    setUploadingPhoto(false);
  };

  const toggleLanguage = (lang) => {
    setForm(prev => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter(l => l !== lang)
        : [...prev.languages, lang]
    }));
  };

  const saveProfile = async () => {
    if (!form.full_name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name,
      bio: form.bio,
      phone: form.phone,
      nationality: form.nationality,
      languages: form.languages,
    }).eq('id', session.user.id);
    if (error) { setError(error.message); } else {
      setSuccess('Profile updated!');
      setEditing(false);
      fetchProfile();
      setTimeout(() => setSuccess(''), 3000);
    }
    setSaving(false);
  };

  const savePayoutCard = async () => {
    if (!payoutCard.number || !payoutCard.expiry || !payoutCard.name) {
      setError('Please fill all card details.'); return;
    }
    setSavingPayout(true); setError('');
    try {
      const last4 = payoutCard.number.replace(/\s/g, '').slice(-4);
      const first = payoutCard.number.replace(/\s/g, '')[0];
      const brand = first === '4' ? 'Visa' : first === '5' ? 'Mastercard' : first === '3' ? 'Amex' : 'Card';
      await supabase.from('profiles').update({
        payout_card_last4: last4,
        payout_card_brand: brand,
      }).eq('id', session.user.id);
      setProfile(prev => ({ ...prev, payout_card_last4: last4, payout_card_brand: brand }));
      setPayoutCard({ number: '', expiry: '', name: '' });
      setShowPayoutSetup(false);
      setSuccess('Card saved securely!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
    setSavingPayout(false);
  };

  const removeCard = async () => {
    if (!window.confirm('Remove stored card?')) return;
    await supabase.from('profiles').update({
      payout_card_last4: null, payout_card_brand: null
    }).eq('id', session.user.id);
    setProfile(prev => ({ ...prev, payout_card_last4: null, payout_card_brand: null }));
    setSuccess('Card removed.'); setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setError('Please type DELETE to confirm.'); return;
    }
    setDeletingAccount(true);
    // Send verification email via Supabase OTP
    const { error } = await supabase.auth.signInWithOtp({
      email: session.user.email,
      options: {
        emailRedirectTo: `${window.location.origin}?delete=true`,
        shouldCreateUser: false,
      }
    });
    if (error) {
      setError(error.message);
    } else {
      setDeleteEmailSent(true);
    }
    setDeletingAccount(false);
  };

  const formatCard = (val) => val.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim().slice(0, 19);
  const formatExpiry = (val) => val.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5);
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in space-y-4">

      {(success || error) && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
          success ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'
        }`}>
          {success ? <Check size={16} /> : <X size={16} />}
          {success || error}
        </div>
      )}

      {/* ── Profile header ── */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div className="relative">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile"
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-violet-100 shadow-sm" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-button">
                  {getInitials(profile?.full_name)}
                </div>
              )}
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}
                className="absolute -bottom-2 -right-2 w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center border-2 border-white hover:bg-violet-700 transition shadow-button disabled:opacity-50">
                {uploadingPhoto
                  ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera size={13} className="text-white" />
                }
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">{profile?.full_name || 'Your Name'}</h2>
                {profile?.verified && (
                  <span className="badge badge-blue"><Shield size={10} /> Verified</span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-0.5">{session.user.email}</p>

              {/* Rating */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {profile?.rating > 0 ? (
                  <button onClick={() => setShowReviews(!showReviews)}
                    className="flex items-center gap-1 hover:opacity-80 transition">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} size={14}
                        className={s <= Math.round(profile.rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
                    ))}
                    <span className="text-sm font-bold text-gray-700 ml-0.5">{profile.rating.toFixed(1)}</span>
                    <span className="text-xs text-gray-400">({profile.total_reviews} reviews)</span>
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">No reviews yet</span>
                )}
                <span className="badge badge-purple">{userRole || 'New Member'}</span>
              </div>
            </div>
          </div>

          <button onClick={() => { setEditing(!editing); setError(''); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              editing ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'btn-primary'
            }`}>
            {editing ? <><X size={14} /> Cancel</> : <><Edit2 size={14} /> Edit</>}
          </button>
        </div>

        {!editing && profile?.bio && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-600 leading-relaxed italic">"{profile.bio}"</p>
          </div>
        )}
      </div>

      {/* ── Real-time Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {/* Flights */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
              <Plane size={15} className="text-blue-600" />
            </div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Flights</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Active / Upcoming</span>
              <span className="font-bold text-blue-600">{stats.flightsActive}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Completed</span>
              <span className="font-bold text-gray-700">{stats.flightsCompleted}</span>
            </div>
          </div>
        </div>

        {/* Requests */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-violet-50 rounded-xl flex items-center justify-center">
              <Package size={15} className="text-violet-600" />
            </div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Requests</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Open</span>
              <span className="font-bold text-violet-600">{stats.requestsActive}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Matched</span>
              <span className="font-bold text-gray-700">{stats.requestsCompleted}</span>
            </div>
          </div>
        </div>

        {/* Deals */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Award size={15} className="text-emerald-600" />
            </div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Deals</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Ongoing</span>
              <span className="font-bold text-amber-600">{stats.dealsOngoing}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Completed</span>
              <span className="font-bold text-emerald-600">{stats.dealsCompleted}</span>
            </div>
          </div>
        </div>

        {/* Wallet balance */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-4 col-span-2 md:col-span-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center">
                <DollarSign size={15} className="text-amber-600" />
              </div>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Wallet Balance</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              ${(profile?.wallet_balance || 0).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Reviews ── */}
      {profile?.rating > 0 && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden">
          <button
            onClick={() => setShowReviews(!showReviews)}
            className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
                <Star size={16} className="text-amber-500 fill-amber-400" />
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-900 text-sm">Reviews & Ratings</p>
                <p className="text-xs text-gray-400">
                  {profile.rating.toFixed(1)} average · {profile.total_reviews} review{profile.total_reviews !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            {showReviews ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>

          {showReviews && (
            <div className="border-t border-gray-100 p-5 space-y-3">
              {reviews.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No detailed reviews yet</p>
              ) : (
                reviews.map((review, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-600 flex-shrink-0">
                      {getInitials(review.reviewer?.full_name)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">
                          {review.reviewer?.full_name || 'User'}
                        </p>
                        <span className="badge badge-gray text-xs">{review.role}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} size={12}
                            className={s <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
                        ))}
                        <span className="text-xs text-gray-500 ml-1">{review.rating}/5</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(review.date).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Edit form ── */}
      {editing && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6 space-y-4">
          <h3 className="font-bold text-gray-900">Edit Information</h3>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Full Name *</label>
            <div className="relative">
              <User size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
              <input type="text" placeholder="Your full name" value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                className="input-field pl-9" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Bio</label>
            <textarea placeholder="Tell shippers and travelers about yourself..."
              value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })}
              rows={3} className="input-field resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Phone</label>
              <div className="relative">
                <Phone size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
                <input type="tel" placeholder="+971 50 000 0000" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="input-field pl-9" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Nationality</label>
              <div className="relative">
                <Globe size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
                <select value={form.nationality}
                  onChange={e => setForm({ ...form, nationality: e.target.value })}
                  className="input-field pl-9 appearance-none">
                  <option value="">Select...</option>
                  {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Languages</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map(lang => (
                <button key={lang} onClick={() => toggleLanguage(lang)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    form.languages.includes(lang)
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                  }`}>
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-xs bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}

          <button onClick={saveProfile} disabled={saving}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50">
            <Check size={15} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* ── Personal Info display ── */}
      {!editing && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6">
          <h3 className="font-bold text-gray-900 mb-4">Personal Information</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: 'Email', value: session.user.email, icon: Mail },
              { label: 'Phone', value: profile?.phone || 'Not set', icon: Phone },
              { label: 'Nationality', value: profile?.nationality || 'Not set', icon: Globe },
              { label: 'Role', value: userRole || 'New Member', icon: Award },
            ].map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                <div className="flex items-center gap-2">
                  <item.icon size={13} className="text-violet-400 flex-shrink-0" />
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          {profile?.languages?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Languages</p>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map(lang => (
                  <span key={lang} className="badge badge-purple">{lang}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Stored Credit Card ── */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard size={18} className="text-violet-600" />
          <h3 className="font-bold text-gray-900">Stored Credit Card</h3>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Used for all payments — wallet top ups, escrow payments, and withdrawals. Stored securely. Only the last 4 digits are saved on our servers.
        </p>

        {profile?.payout_card_last4 ? (
          <div>
            <div className="flex items-center justify-between bg-emerald-50 rounded-xl p-4 mb-3 border border-emerald-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100">
                  <CreditCard size={18} className="text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {profile.payout_card_brand} •••• {profile.payout_card_last4}
                  </p>
                  <p className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5">
                    <CheckCircle size={11} /> Active · Used for all transactions
                  </p>
                </div>
              </div>
              <button onClick={removeCard}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 transition">
                <Trash2 size={15} className="text-red-400" />
              </button>
            </div>
            <button onClick={() => setShowPayoutSetup(!showPayoutSetup)}
              className="text-xs text-violet-600 font-semibold hover:text-violet-700">
              {showPayoutSetup ? 'Cancel' : 'Change card'}
            </button>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 flex items-start gap-2">
            <Shield size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              No card stored. Add one to enable payments, top ups, and withdrawals.
            </p>
          </div>
        )}

        {(!profile?.payout_card_last4 || showPayoutSetup) && (
          <div className="space-y-3 mt-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Cardholder Name</label>
              <input type="text" placeholder="John Smith" value={payoutCard.name}
                onChange={e => setPayoutCard({ ...payoutCard, name: e.target.value })}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Card Number</label>
              <input type="text" placeholder="4242 4242 4242 4242" value={payoutCard.number}
                onChange={e => setPayoutCard({ ...payoutCard, number: formatCard(e.target.value) })}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Expiry</label>
              <input type="text" placeholder="MM/YY" value={payoutCard.expiry}
                onChange={e => setPayoutCard({ ...payoutCard, expiry: formatExpiry(e.target.value) })}
                className="input-field" />
            </div>
            {error && <p className="text-red-500 text-xs bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
            <button onClick={savePayoutCard} disabled={savingPayout}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50">
              <CreditCard size={15} />
              {savingPayout ? 'Saving...' : 'Save Card Securely'}
            </button>
            <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
              <Shield size={11} /> Only last 4 digits stored · Never shared
            </p>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p className="text-xs text-amber-700 font-bold">🧪 Test Mode</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Card: <strong>4242 4242 4242 4242</strong> · Any future date
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Delete Account ── */}
      <div className="bg-white rounded-2xl shadow-card border border-red-100 p-6">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={18} className="text-red-500" />
          <h3 className="font-bold text-red-700">Delete Account</h3>
        </div>
        <p className="text-xs text-gray-400 mb-4 leading-relaxed">
          Permanently delete your Fetchr account and all associated data. This action cannot be undone. Any active deals must be completed or cancelled first.
        </p>

        {!showDeleteAccount ? (
          <button onClick={() => setShowDeleteAccount(true)}
            className="flex items-center gap-2 border border-red-200 text-red-500 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-50 transition">
            <Trash2 size={15} /> Delete My Account
          </button>
        ) : deleteEmailSent ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-sm font-bold text-emerald-700 mb-1">Verification email sent!</p>
            <p className="text-xs text-emerald-600">
              Check your email at <strong>{session.user.email}</strong>. Click the link in the email to permanently delete your account.
            </p>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-red-700">⚠️ This cannot be undone</p>
            <p className="text-xs text-red-600">
              All your flights, requests, deal history, and wallet balance will be permanently deleted.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input type="text" placeholder="DELETE" value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                className="input-field" />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setShowDeleteAccount(false); setDeleteConfirmText(''); setError(''); }}
                className="flex-1 btn-secondary py-2.5 text-sm">
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deletingAccount || deleteConfirmText !== 'DELETE'}
                className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-red-600 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {deletingAccount
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending...</>
                  : <><Trash2 size={14} /> Send Verification Email</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;