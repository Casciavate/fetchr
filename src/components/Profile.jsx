import React, { useState, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../supabaseClient';
import {
  User, Mail, Phone, Globe, Star, Edit2,
  Check, Award, Package, Plane, Camera,
  CreditCard, CheckCircle, Trash2, AlertTriangle,
  ChevronDown, ChevronUp, ChevronRight, Building, Lock,
  Info, LogOut, TrendingUp, Shield
} from 'lucide-react';
import VerificationBadge from './shared/VerificationBadge';
import RatingDisplay from './shared/RatingDisplay';
import AdvisoryBanner from './shared/AdvisoryBanner';
import Toast from './shared/Toast';
import BottomSheet from './shared/BottomSheet';
import { RowSkeleton } from './shared/Skeleton';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '14px',
      fontFamily: '"IBM Plex Mono", monospace',
      color: '#14181F',
      '::placeholder': { color: '#7F8794' },
      iconColor: '#14181F',
    },
    invalid: { color: '#B0301C', iconColor: '#B0301C' },
  },
  hidePostalCode: true,
};

const LANGUAGES = [
  'English','Arabic','French','German','Spanish','Italian',
  'Portuguese','Russian','Chinese','Japanese','Hindi','Turkish',
  'Dutch','Korean','Swedish','Norwegian','Danish','Finnish',
  'Urdu','Bengali','Tagalog','Persian','Swahili'
];

const NATIONALITIES = [
  'Afghan','Albanian','Algerian','American','Argentinian','Australian',
  'Austrian','Bahraini','Bangladeshi','Belgian','Brazilian','British',
  'Bulgarian','Canadian','Chilean','Chinese','Colombian','Croatian',
  'Czech','Danish','Dutch','Egyptian','Emirati','Ethiopian','Finnish',
  'French','German','Ghanaian','Greek','Hungarian','Indian','Indonesian',
  'Iranian','Iraqi','Irish','Israeli','Italian','Japanese','Jordanian',
  'Kenyan','Korean','Kuwaiti','Lebanese','Malaysian','Mexican','Moroccan',
  'Nigerian','Norwegian','Omani','Pakistani','Palestinian','Peruvian',
  'Philippine','Polish','Portuguese','Qatari','Romanian','Russian',
  'Saudi','Singaporean','South African','Spanish','Sri Lankan','Swedish',
  'Swiss','Syrian','Thai','Tunisian','Turkish','Ukrainian','Vietnamese'
];

const callStripe = async (action, data) => {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, data }),
    }
  );
  const result = await res.json();
  if (!res.ok || result.error) throw new Error(result.error || 'Request failed');
  return result;
};

// ── Save Card Form (inside Elements context) ──
const SaveCardForm = ({ session, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardReady, setCardReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!stripe || !elements || !cardReady) {
      setError('Card form not ready. Please wait.'); return;
    }
    setLoading(true); setError('');
    try {
      // Step 1: Get SetupIntent from edge function
      const { clientSecret } = await callStripe('create_setup_intent', {});

      // Step 2: Confirm card setup — Stripe tokenizes card details
      // Card number never touches our servers
      const cardElement = elements.getElement(CardElement);
      const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(
        clientSecret,
        { payment_method: { card: cardElement } }
      );
      if (confirmError) throw new Error(confirmError.message);

      // Step 3: Save payment method ID + last4/brand to profile
      const result = await callStripe('save_payment_method', {
        paymentMethodId: setupIntent.payment_method,
      });

      onSuccess(result);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3 mt-3">
      <div>
        <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
          Card details
        </label>
        <div className="border border-line-strong rounded-md px-4 py-3.5 focus-within:border-accent transition-colors bg-surface">
          <CardElement
            options={CARD_ELEMENT_OPTIONS}
            onReady={() => setCardReady(true)}
          />
        </div>
        <p className="text-micro text-content-subtle mt-1.5 flex items-center gap-1">
          <Lock size={10} /> Card encrypted by Stripe — number never stored on fetchr servers
        </p>
      </div>

      <div className="bg-info-50 rounded-md p-3">
        <p className="text-body-s font-semibold text-info-500">Test mode</p>
        <p className="text-body-s text-info-500 mt-0.5">
          Card: <strong>4242 4242 4242 4242</strong> · Any future date · Any 3-digit CVC
        </p>
      </div>

      {error && <AdvisoryBanner tone="error">{error}</AdvisoryBanner>}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 btn-secondary py-2.5 text-sm">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={loading || !stripe || !cardReady}
          className="flex-[2] btn-primary py-2.5 text-sm disabled:opacity-50">
          {loading
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving</>
            : <><CreditCard size={14} /> Save card securely</>
          }
        </button>
      </div>
    </div>
  );
};

// ── Save Bank Account Form ──
const SaveBankForm = ({ profile, onSuccess, onCancel }) => {
  const [bank, setBank] = useState({
    accountHolderName: profile?.bank_account_holder || '',
    accountNumber: '',
    routingNumber: '',
    country: '',
    currency: 'usd',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!bank.accountHolderName.trim()) { setError('Enter account holder name.'); return; }
    if (!bank.accountNumber.trim()) { setError('Enter account number or IBAN.'); return; }
    if (!bank.country.trim() || bank.country.length !== 2) {
      setError('Enter a valid 2-letter country code (e.g. US, GB, AE).'); return;
    }
    setLoading(true); setError('');
    try {
      const result = await callStripe('save_bank_account', {
        accountHolderName: bank.accountHolderName,
        accountNumber: bank.accountNumber.replace(/\s/g, ''),
        routingNumber: bank.routingNumber,
        country: bank.country.toUpperCase(),
        currency: bank.currency || 'usd',
      });
      onSuccess(result);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3 mt-3">
      <div className="bg-info-50 rounded-md p-3">
        <p className="text-body-s font-semibold text-info-500 mb-1">Bank account details</p>
        <p className="text-body-s text-info-500">
          For SEPA/international accounts enter IBAN. For US accounts enter account number + routing number.
        </p>
      </div>

      {[
        { label: 'Account holder name (required)', key: 'accountHolderName', placeholder: 'Full name as on bank account' },
        { label: 'Country code (required)', key: 'country', placeholder: 'e.g. US, GB, AE, DE, AU, SG', maxLen: 2 },
        { label: 'Account number / IBAN (required)', key: 'accountNumber', placeholder: 'IBAN or account number' },
        { label: 'Routing number (US only)', key: 'routingNumber', placeholder: '9-digit routing number' },
        { label: 'Currency', key: 'currency', placeholder: 'usd, gbp, eur, aed...' },
      ].map(f => (
        <div key={f.key}>
          <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
            {f.label}
          </label>
          <input
            type="text"
            placeholder={f.placeholder}
            maxLength={f.maxLen}
            value={bank[f.key]}
            onChange={e => setBank({ ...bank, [f.key]: f.key === 'country' ? e.target.value.toUpperCase() : e.target.value })}
            className="input-field"
          />
        </div>
      ))}

      <div className="bg-info-50 rounded-md p-3">
        <p className="text-body-s font-semibold text-info-500">Test mode</p>
        <p className="text-body-s text-info-500 mt-0.5">
          US: Account <strong>000123456789</strong> · Routing <strong>110000000</strong> · Country <strong>US</strong><br />
          UK: IBAN <strong>GB29NWBK60161331926819</strong> · Country <strong>GB</strong>
        </p>
      </div>

      {error && <AdvisoryBanner tone="error">{error}</AdvisoryBanner>}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex-[2] btn-primary py-2.5 text-sm disabled:opacity-50">
          {loading
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving</>
            : <><Building size={14} /> Save bank account</>
          }
        </button>
      </div>
    </div>
  );
};

// ── Main Profile Component ──
const Profile = ({ session, userRole, onNavigate, isAdmin }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);
  const [stats, setStats] = useState({
    flightsActive: 0, flightsCompleted: 0,
    requestsActive: 0, requestsCompleted: 0,
    dealsCompleted: 0, dealsOngoing: 0,
  });
  const [reviews, setReviews] = useState([]);
  const [showReviews, setShowReviews] = useState(false);
  const [receivedReviews, setReceivedReviews] = useState([]);
  const [showReceivedReviews, setShowReceivedReviews] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
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
        languages: data.languages || [],
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
      supabase.from('flights').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'active').gte('flight_date', today),
      supabase.from('flights').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'expired'),
      supabase.from('shipment_requests').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'open'),
      supabase.from('shipment_requests').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'matched'),
      supabase.from('matches').select('id', { count: 'exact', head: true })
        .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`).eq('status', 'completed'),
      supabase.from('matches').select('id', { count: 'exact', head: true })
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
    const userId = session.user.id;
    const { data } = await supabase
      .from('matches')
      .select(`id, created_at, status,
        traveler:profiles!matches_traveler_id_fkey(id, full_name),
        shipper:profiles!matches_shipper_id_fkey(id, full_name),
        flight:flights(from_city, to_city)`)
      .or(`traveler_id.eq.${userId},shipper_id.eq.${userId}`)
      .eq('status', 'completed')
      .order('created_at', { ascending: false }).limit(10);
    setReviews(data || []);
  };

  // Reviews other people left about this user — separate from fetchReviews()
  // above (which is actually just this user's own completed-deal history).
  const fetchReceivedReviews = async () => {
    const { data } = await supabase
      .from('reviews')
      .select(`id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey(full_name)`)
      .eq('reviewee_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setReceivedReviews(data || []);
  };

  useEffect(() => {
    fetchProfile(); fetchStats(); fetchReviews(); fetchReceivedReviews();
    const userId = session.user.id;
    const sub = supabase.channel(`profile-rt-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, fetchProfile)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights', filter: `user_id=eq.${userId}` }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipment_requests', filter: `user_id=eq.${userId}` }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `reviewee_id=eq.${userId}` }, fetchReceivedReviews)
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
      full_name: form.full_name, bio: form.bio,
      phone: form.phone, nationality: form.nationality,
      languages: form.languages,
    }).eq('id', session.user.id);
    if (error) { setError(error.message); }
    else {
      setSuccess('Profile updated!'); setEditing(false);
      fetchProfile(); setTimeout(() => setSuccess(''), 3000);
    }
    setSaving(false);
  };

  const removeCard = async () => {
    if (!window.confirm('Remove stored card?')) return;
    await supabase.from('profiles').update({
      payout_card_last4: null, payout_card_brand: null,
      stripe_payment_method_id: null,
    }).eq('id', session.user.id);
    setProfile(prev => ({ ...prev, payout_card_last4: null, payout_card_brand: null, stripe_payment_method_id: null }));
    setSuccess('Card removed.'); setTimeout(() => setSuccess(''), 3000);
  };

  const removeBank = async () => {
    if (!window.confirm('Remove stored bank account?')) return;
    await supabase.from('profiles').update({
      bank_account_last4: null, bank_account_country: null,
      bank_account_holder: null, stripe_bank_token: null,
    }).eq('id', session.user.id);
    setProfile(prev => ({ ...prev, bank_account_last4: null }));
    setSuccess('Bank account removed.'); setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') { setError('Please type DELETE to confirm.'); return; }
    if (stats.dealsOngoing > 0) {
      setError(`Complete or cancel your ${stats.dealsOngoing} active deal${stats.dealsOngoing > 1 ? 's' : ''} first.`); return;
    }
    if ((profile?.wallet_balance || 0) > 0) {
      setError(`Withdraw your $${(profile?.wallet_balance || 0).toFixed(2)} wallet balance first.`); return;
    }
    setDeletingAccount(true); setError('');
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) { setError('Session expired. Please sign in again.'); setDeletingAccount(false); return; }
      const res = await fetch(
        'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/delete-account',
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authSession.access_token}` } }
      );
      const data = await res.json();
      if (!res.ok) { setError(data.message || data.error || 'Failed to delete account.'); setDeletingAccount(false); return; }
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (e) { setError('Network error. Please try again.'); setDeletingAccount(false); }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const canDelete = stats.dealsOngoing === 0 && (profile?.wallet_balance || 0) <= 0;

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-3">
      <RowSkeleton /><RowSkeleton /><RowSkeleton />
    </div>
  );

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).getFullYear()
    : null;

  return (
    <Elements stripe={stripePromise}>
      <div className="max-w-3xl mx-auto animate-fade-in space-y-4">

        <Toast message={success} tone="success" />
        <Toast message={error} tone="error" />

        {/* ── Profile Header ── */}
        <div className="card p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              <div className="relative">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile"
                    className="w-24 h-24 rounded-avatar object-cover border border-line" />
                ) : (
                  <div className="w-24 h-24 rounded-avatar bg-surface-inverse flex items-center justify-center text-content-inverse text-title-l font-mono font-semibold">
                    {getInitials(profile?.full_name)}
                  </div>
                )}
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}
                  className="absolute -bottom-2 -right-2 w-8 h-8 bg-brand rounded-md flex items-center justify-center border-2 border-surface hover:bg-brand-hover transition-colors disabled:opacity-50">
                  {uploadingPhoto
                    ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Camera size={13} className="text-white" />}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display font-bold text-title-m text-ink-900">{profile?.full_name || 'Your name'}</h2>
                  {profile?.verified ? (
                    <button onClick={() => setShowIdentity(true)}>
                      <VerificationBadge verified />
                    </button>
                  ) : (
                    <VerificationBadge verified={false} />
                  )}
                </div>
                <p className="text-body-s text-content-subtle mt-0.5">{session.user.email}</p>
                {/* Trust hierarchy, §9.1: verification (above) → completed deliveries → rating → member since */}
                <div className="flex items-center gap-3 mt-2 flex-wrap text-body-s">
                  {stats.dealsCompleted > 0 && (
                    <span className="text-content-muted">{stats.dealsCompleted} deliver{stats.dealsCompleted === 1 ? 'y' : 'ies'}</span>
                  )}
                  {profile?.rating > 0 ? (
                    <button onClick={() => setShowReviews(!showReviews)} className="hover:opacity-80 transition-opacity">
                      <RatingDisplay rating={profile.rating} totalReviews={profile.total_reviews} />
                    </button>
                  ) : (
                    <RatingDisplay rating={0} totalReviews={0} />
                  )}
                  {memberSince && <span className="text-micro text-content-subtle">Member since {memberSince}</span>}
                </div>
                <p className="text-micro text-content-muted mt-1.5">{userRole || 'New member'}</p>
              </div>
            </div>
            <button
              onClick={() => { setEditing(true); setError(''); setSuccess(''); }}
              className="btn-primary">
              <Edit2 size={14} /> Edit
            </button>
          </div>
          {profile?.bio && (
            <div className="mt-4 pt-4 border-t border-line">
              <p className="text-body-s text-content-muted leading-relaxed italic">"{profile.bio}"</p>
            </div>
          )}
        </div>

        {/* ── Stats — also this account's quick links now the mobile sidebar is gone ── */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { title: 'Flights', icon: Plane, nav: 'flights',
              rows: [{ label: 'Active / upcoming', val: stats.flightsActive }, { label: 'Completed', val: stats.flightsCompleted }] },
            { title: 'Requests', icon: Package, nav: 'my-requests',
              rows: [{ label: 'Open', val: stats.requestsActive }, { label: 'Matched', val: stats.requestsCompleted }] },
            { title: 'Deals', icon: Award, nav: 'active-deals',
              rows: [{ label: 'Ongoing', val: stats.dealsOngoing }, { label: 'Completed', val: stats.dealsCompleted }] },
            { title: 'Earnings', icon: TrendingUp, nav: 'earnings' },
          ].map((card, i) => {
            const Tag = onNavigate ? 'button' : 'div';
            return (
              <Tag key={i} onClick={onNavigate ? () => onNavigate(card.nav) : undefined}
                className={`card p-4 text-left ${onNavigate ? 'hover:border-line-strong transition-colors' : ''}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-ink-100 rounded-md flex items-center justify-center">
                    <card.icon size={15} className="text-ink-600" />
                  </div>
                  <p className="text-label text-content-muted uppercase tracking-wide">{card.title}</p>
                </div>
                {card.balance ? (
                  <p className="font-mono text-title-m font-bold text-ink-900">${(profile?.wallet_balance || 0).toFixed(2)}</p>
                ) : card.rows ? (
                  <div className="space-y-1.5">
                    {card.rows.map((r, j) => (
                      <div key={j} className="flex justify-between text-body-s">
                        <span className="text-content-subtle">{r.label}</span>
                        <span className="font-mono font-semibold text-content">{r.val}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-body-s text-content-subtle">View your earnings</p>
                )}
              </Tag>
            );
          })}
        </div>

        {/* ── Quick links — admin only now; My Flights/My Requests/Earnings
              are stat tiles above, Add flight/Post a request live behind
              the bottom nav's Post tab, Wallet is in the header. ── */}
        {onNavigate && isAdmin && (
          <div className="card overflow-hidden">
            {[{ id: 'admin', icon: Shield, label: 'Admin dashboard' }].map((item, i, arr) => (
              <button key={item.id} onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken transition ${i < arr.length - 1 ? 'border-b border-line' : ''}`}>
                <item.icon size={16} className="text-ink-600 flex-shrink-0" />
                <span className="flex-1 text-body-s font-medium text-content">{item.label}</span>
                <ChevronRight size={16} className="text-ink-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* ── Completed Deals / Reviews ── */}
        {reviews.length > 0 && (
          <div className="ticket">
            <button onClick={() => setShowReviews(!showReviews)}
              className="w-full flex items-center justify-between p-5 hover:bg-surface-sunken transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-success-tint rounded-md flex items-center justify-center">
                  <CheckCircle size={16} className="text-success" />
                </div>
                <div className="text-left">
                  <p className="font-display font-semibold text-title-s text-ink-900">Completed deals</p>
                  <p className="text-body-s text-content-subtle">{reviews.length} deal{reviews.length !== 1 ? 's' : ''} completed</p>
                </div>
              </div>
              {showReviews ? <ChevronUp size={18} className="text-ink-400" /> : <ChevronDown size={18} className="text-ink-400" />}
            </button>
            {showReviews && (
              <div className="border-t border-line p-5 space-y-3">
                {reviews.map((deal, i) => {
                  const isTraveler = deal.traveler?.id === session.user.id;
                  const other = isTraveler ? deal.shipper : deal.traveler;
                  return (
                    <button key={i} onClick={() => onNavigate && onNavigate('completed', { focusDealId: deal.id })}
                      className="w-full flex items-center gap-3 p-3 bg-surface-sunken rounded-md border border-line hover:border-line-strong transition text-left">
                      <div className="w-9 h-9 rounded-avatar bg-surface-inverse flex items-center justify-center text-overline font-mono font-semibold text-content-inverse flex-shrink-0">
                        {getInitials(other?.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-s font-semibold text-content">{other?.full_name || 'User'}</p>
                        <p className="text-micro text-content-subtle">
                          {deal.flight?.from_city} → {deal.flight?.to_city} ·{' '}
                          {new Date(deal.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span className="badge-green flex-shrink-0">
                        <CheckCircle size={10} /> Done
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Reviews received ── */}
        {receivedReviews.length > 0 && (
          <div className="ticket">
            <button onClick={() => setShowReceivedReviews(!showReceivedReviews)}
              className="w-full flex items-center justify-between p-5 hover:bg-surface-sunken transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-ink-100 rounded-md flex items-center justify-center">
                  <Star size={16} className="text-ink-900" />
                </div>
                <div className="text-left">
                  <p className="font-display font-semibold text-title-s text-ink-900">Reviews received</p>
                  <p className="text-body-s text-content-subtle">{receivedReviews.length} review{receivedReviews.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {showReceivedReviews ? <ChevronUp size={18} className="text-ink-400" /> : <ChevronDown size={18} className="text-ink-400" />}
            </button>
            {showReceivedReviews && (
              <div className="border-t border-line p-5 space-y-3">
                {receivedReviews.map(review => (
                  <div key={review.id} className="p-3 bg-surface-sunken rounded-md border border-line">
                    <div className="flex items-center gap-3 mb-1.5">
                      <div className="w-8 h-8 rounded-avatar bg-surface-inverse flex items-center justify-center text-overline font-mono font-semibold text-content-inverse flex-shrink-0">
                        {getInitials(review.reviewer?.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-s font-semibold text-content">{review.reviewer?.full_name || 'User'}</p>
                        <p className="text-micro text-content-subtle">
                          {new Date(review.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 flex-shrink-0">
                        <Star size={13} className="text-ink-900 fill-ink-900" />
                        <span className={`font-mono text-num-m font-semibold ${review.rating < 3 ? 'text-danger' : 'text-ink-900'}`}>
                          {review.rating}
                        </span>
                      </span>
                    </div>
                    {review.comment && (
                      <p className="text-body-s text-content-muted italic pl-11">"{review.comment}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Edit Form ── */}
        {editing && (
          <BottomSheet title="Edit information" onClose={() => { setEditing(false); setError(''); setSuccess(''); }}
            footer={<button onClick={saveProfile} disabled={saving} className="w-full btn-primary disabled:opacity-50">
              <Check size={15} /> {saving ? 'Saving' : 'Save changes'}
            </button>}>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">Full name (required)</label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-3.5 text-ink-400 pointer-events-none" />
                <input type="text" placeholder="Your full name" value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })} className="input-field pl-9" />
              </div>
            </div>
            <div>
              <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">Bio</label>
              <textarea placeholder="Tell senders and travellers about yourself..."
                value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })}
                rows={3} className="input-field resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">Phone</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-3.5 text-ink-400 pointer-events-none" />
                  <input type="tel" placeholder="+971 50 000 0000" value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field pl-9" />
                </div>
              </div>
              <div>
                <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">Nationality</label>
                <div className="relative">
                  <Globe size={15} className="absolute left-3.5 top-3.5 text-ink-400 pointer-events-none" />
                  <select value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })}
                    className="input-field pl-9 appearance-none">
                    <option value="">Select...</option>
                    {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-label text-content-muted mb-2 uppercase tracking-wide">Languages</label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map(lang => (
                  <button key={lang} type="button" onClick={() => toggleLanguage(lang)}
                    className={`px-3 py-1.5 rounded-md text-body-s font-semibold border transition-colors ${
                      form.languages.includes(lang)
                        ? 'bg-brand text-white border-brand'
                        : 'bg-surface text-content border-line-strong hover:border-paper-600'
                    }`}>
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>
          </BottomSheet>
        )}

        {/* ── Personal Info Display ── */}
        <div className="card p-6">
            <h3 className="font-display font-semibold text-title-s text-ink-900 mb-4">Personal information</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Email', value: session.user.email, icon: Mail },
                { label: 'Phone', value: profile?.phone || 'Not set', icon: Phone },
                { label: 'Nationality', value: profile?.nationality || 'Not set', icon: Globe },
                { label: 'Role', value: userRole || 'New member', icon: Award },
              ].map((item, i) => (
                <div key={i} className="bg-surface-sunken rounded-md p-3.5 border border-line">
                  <p className="text-micro text-content-subtle mb-1">{item.label}</p>
                  <div className="flex items-center gap-2">
                    <item.icon size={13} className="text-ink-400 flex-shrink-0" />
                    <p className="text-body-s font-semibold text-content truncate">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
            {profile?.languages?.length > 0 && (
              <div>
                <p className="text-micro text-content-subtle mb-2">Languages</p>
                <div className="flex flex-wrap gap-2">
                  {profile.languages.map(lang => <span key={lang} className="badge-purple">{lang}</span>)}
                </div>
              </div>
            )}
        </div>

        {/* ── Stored Credit Card ── */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard size={18} className="text-ink-600" />
            <h3 className="font-display font-semibold text-title-s text-ink-900">Stored credit card</h3>
          </div>
          <p className="text-body-s text-content-subtle mb-4 leading-relaxed">
            Saved securely via Stripe. Used for top ups and escrow payments. Only the last 4 digits are visible.
          </p>

          {profile?.payout_card_last4 ? (
            <div>
              <div className="flex items-center justify-between bg-success-tint rounded-md p-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-surface rounded-md flex items-center justify-center border border-line">
                    <CreditCard size={18} className="text-ink-600" />
                  </div>
                  <div>
                    <p className="text-body-s font-bold text-ink-900">
                      {profile.payout_card_brand
                        ? profile.payout_card_brand.charAt(0).toUpperCase() + profile.payout_card_brand.slice(1)
                        : 'Card'} •••• {profile.payout_card_last4}
                    </p>
                    <p className="text-micro text-success flex items-center gap-1 mt-0.5">
                      <CheckCircle size={11} /> Saved via Stripe · secure
                    </p>
                  </div>
                </div>
                <button onClick={removeCard}
                  className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-danger-tint transition-colors">
                  <Trash2 size={15} className="text-danger" />
                </button>
              </div>
              <button onClick={() => setShowCardForm(true)}
                className="text-body-s text-content font-semibold hover:text-ink-700 underline underline-offset-2">
                Replace card
              </button>
            </div>
          ) : (
            <>
              <div className="bg-info-50 rounded-md p-3 mb-4 flex items-start gap-2">
                <Info size={14} className="text-info-500 flex-shrink-0 mt-0.5" />
                <p className="text-body-s text-info-500">
                  No card saved. Add one to enable top ups and payments.
                </p>
              </div>
              <button onClick={() => setShowCardForm(true)} className="btn-secondary">
                <CreditCard size={14} /> Add card
              </button>
            </>
          )}

          {showCardForm && (
            <BottomSheet title="Payment card" onClose={() => setShowCardForm(false)}>
              <div className="p-5">
                <SaveCardForm
                  session={session}
                  onSuccess={(result) => {
                    setShowCardForm(false);
                    fetchProfile();
                    setSuccess(`Card ****${result.last4} saved.`);
                    setTimeout(() => setSuccess(''), 4000);
                  }}
                  onCancel={() => setShowCardForm(false)}
                />
              </div>
            </BottomSheet>
          )}
        </div>

        {/* ── Stored Bank Account ── */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <Building size={18} className="text-ink-600" />
            <h3 className="font-display font-semibold text-title-s text-ink-900">Stored bank account</h3>
          </div>
          <p className="text-body-s text-content-subtle mb-4 leading-relaxed">
            Used for withdrawals. Bank details are saved via Stripe. Only the last 4 digits are visible.
          </p>

          {profile?.bank_account_last4 ? (
            <div>
              <div className="flex items-center justify-between bg-success-tint rounded-md p-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-surface rounded-md flex items-center justify-center border border-line">
                    <Building size={18} className="text-ink-600" />
                  </div>
                  <div>
                    <p className="text-body-s font-bold text-ink-900">
                      Bank account •••• {profile.bank_account_last4}
                    </p>
                    <p className="text-micro text-content-muted mt-0.5">
                      {profile.bank_account_holder || 'Saved account'} · {profile.bank_account_country || ''}
                    </p>
                    <p className="text-micro text-success flex items-center gap-1 mt-0.5">
                      <CheckCircle size={11} /> Saved · used for withdrawals
                    </p>
                  </div>
                </div>
                <button onClick={removeBank}
                  className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-danger-tint transition-colors">
                  <Trash2 size={15} className="text-danger" />
                </button>
              </div>
              <button onClick={() => setShowBankForm(true)}
                className="text-body-s text-content font-semibold hover:text-ink-700 underline underline-offset-2">
                Replace bank account
              </button>
            </div>
          ) : (
            <>
              <div className="bg-info-50 rounded-md p-3 mb-4 flex items-start gap-2">
                <Info size={14} className="text-info-500 flex-shrink-0 mt-0.5" />
                <p className="text-body-s text-info-500">
                  No bank account saved. Add one to enable withdrawals.
                </p>
              </div>
              <button onClick={() => setShowBankForm(true)} className="btn-secondary">
                <Building size={14} /> Add bank account
              </button>
            </>
          )}

          {showBankForm && (
            <BottomSheet title="Bank account" onClose={() => setShowBankForm(false)}>
              <div className="p-5">
                <SaveBankForm
                  profile={profile}
                  onSuccess={(result) => {
                    setShowBankForm(false);
                    fetchProfile();
                    setSuccess(`Bank account ****${result.last4} saved.`);
                    setTimeout(() => setSuccess(''), 4000);
                  }}
                  onCancel={() => setShowBankForm(false)}
                />
              </div>
            </BottomSheet>
          )}
        </div>

        {/* ── Sign out ── */}
        <button onClick={async () => { await supabase.auth.signOut(); }}
          className="w-full flex items-center justify-center gap-2 h-11 rounded-md border border-line-strong text-body-m font-display font-semibold text-content hover:bg-surface-sunken transition">
          <LogOut size={15} /> Sign out
        </button>

        {/* ── Delete Account ── */}
        <div className="bg-surface rounded-lg border border-void-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={18} className="text-danger" />
            <h3 className="font-display font-semibold text-title-s text-danger">Delete account</h3>
          </div>
          <p className="text-body-s text-content-subtle mb-4 leading-relaxed">
            Permanently delete your account and all data. Immediate and cannot be undone.
          </p>

          <div className="bg-surface-sunken rounded-md p-4 border border-line mb-4 space-y-2.5">
            <p className="text-body-s font-semibold text-content mb-1">Must be cleared before deletion:</p>
            {[
              { label: 'No active deals', check: stats.dealsOngoing === 0, detail: stats.dealsOngoing > 0 ? `${stats.dealsOngoing} active` : null },
              { label: 'Wallet balance is $0.00', check: (profile?.wallet_balance || 0) <= 0, detail: (profile?.wallet_balance || 0) > 0 ? `$${(profile?.wallet_balance || 0).toFixed(2)} remaining` : null },
              { label: 'No pending escrow', check: stats.dealsOngoing === 0, detail: null },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className={`flex items-center gap-2 text-body-s font-medium ${item.check ? 'text-success' : 'text-danger'}`}>
                  {item.check ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  {item.label}
                </span>
                {item.detail && <span className="text-micro text-danger font-medium">{item.detail}</span>}
              </div>
            ))}
          </div>

          {!canDelete ? (
            <div className="bg-warning-tint border-l-[3px] border-warn-400 rounded-r p-4">
              <p className="text-body-s font-semibold text-warning mb-1">Account cannot be deleted yet</p>
              <p className="text-body-s text-warning leading-relaxed">
                {stats.dealsOngoing > 0 && `Complete or cancel your ${stats.dealsOngoing} active deal${stats.dealsOngoing > 1 ? 's' : ''} first. `}
                {(profile?.wallet_balance || 0) > 0 && `Withdraw your $${(profile?.wallet_balance || 0).toFixed(2)} wallet balance first.`}
              </p>
            </div>
          ) : (
            <button onClick={() => { setShowDeleteAccount(true); setError(''); }}
              className="flex items-center gap-2 border border-void-200 text-danger rounded-md px-4 py-2.5 text-body-s font-semibold hover:bg-danger-tint transition-colors">
              <Trash2 size={15} /> Delete my account
            </button>
          )}
        </div>

        {showDeleteAccount && (
          <BottomSheet title="Delete account"
            onClose={() => { setShowDeleteAccount(false); setDeleteConfirmText(''); setError(''); }}
            footer={
              <div className="flex flex-col gap-2">
                <button onClick={() => { setShowDeleteAccount(false); setDeleteConfirmText(''); setError(''); }}
                  className="w-full btn-secondary">Keep my account</button>
                <button onClick={handleDeleteAccount}
                  disabled={deletingAccount || deleteConfirmText !== 'DELETE'}
                  className="w-full btn-danger disabled:opacity-50">
                  {deletingAccount
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Deleting</>
                    : <><Trash2 size={14} /> Delete account permanently</>}
                </button>
              </div>
            }>
            <div className="p-5 space-y-4">
              <AdvisoryBanner tone="error" title="This cannot be undone">
                Your profile, flights, requests and message history are removed permanently.
              </AdvisoryBanner>
              <div>
                <label className="block text-label text-content-muted mb-1.5">
                  Type <strong className="text-danger">DELETE</strong> to confirm
                </label>
                <input type="text" placeholder="Type DELETE here"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  className="input-field" autoComplete="off" />
              </div>
            </div>
          </BottomSheet>
        )}

        {showIdentity && (
          <BottomSheet title="Identity" onClose={() => setShowIdentity(false)}
            footer={<button onClick={() => setShowIdentity(false)} className="w-full btn-secondary">Close</button>}>
            <div className="p-5 space-y-3">
              <VerificationBadge verified />
              <p className="text-body-m text-content-muted leading-relaxed">
                We checked a government ID against a selfie. Senders and travellers see the green badge
                beside your name. Your document is not shown to anyone.
              </p>
            </div>
          </BottomSheet>
        )}

      </div>
    </Elements>
  );
};

export default Profile;