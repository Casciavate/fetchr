import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  User, Mail, Phone, Globe, Star, Shield, Edit2,
  Check, X, Award, Package, Plane, DollarSign, Camera
} from 'lucide-react';

const LANGUAGES = [
  'English', 'Arabic', 'French', 'German', 'Spanish', 'Italian',
  'Portuguese', 'Russian', 'Chinese', 'Japanese', 'Hindi', 'Turkish',
  'Dutch', 'Korean', 'Swedish', 'Norwegian', 'Danish', 'Finnish'
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
  const [stats, setStats] = useState({
    totalFlights: 0,
    totalRequests: 0,
    completedDeals: 0,
  });
  const [form, setForm] = useState({
    full_name: '',
    bio: '',
    phone: '',
    nationality: '',
    languages: [],
  });
  const fileInputRef = useRef(null);

  const fetchProfile = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (!error && data) {
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
          .from('avatars')
          .getPublicUrl(data.avatar_url);
        setAvatarUrl(urlData.publicUrl);
      }
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    const [flightsRes, requestsRes, dealsRes] = await Promise.all([
      supabase.from('flights').select('id', { count: 'exact' }).eq('user_id', session.user.id),
      supabase.from('shipment_requests').select('id', { count: 'exact' }).eq('user_id', session.user.id),
      supabase.from('matches').select('id', { count: 'exact' })
        .or(`traveler_id.eq.${session.user.id},shipper_id.eq.${session.user.id}`)
        .eq('status', 'completed'),
    ]);
    setStats({
      totalFlights: flightsRes.count || 0,
      totalRequests: requestsRes.count || 0,
      completedDeals: dealsRes.count || 0,
    });
  };

  useEffect(() => { fetchProfile(); }, []);
  useEffect(() => { if (profile) fetchStats(); }, [profile]);

  const handlePhotoClick = () => fileInputRef.current?.click();

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB.'); return; }

    setUploadingPhoto(true);
    setError('');

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${session.user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: filePath })
        .eq('id', session.user.id);
      if (updateError) throw updateError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      setAvatarUrl(urlData.publicUrl + '?t=' + Date.now());
      setSuccess('Profile photo updated!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to upload photo.');
    }
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
    setSaving(true);
    setError('');

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name,
        bio: form.bio,
        phone: form.phone,
        nationality: form.nationality,
        languages: form.languages,
      })
      .eq('id', session.user.id);

    if (error) {
      setError(error.message);
    } else {
      setSuccess('Profile updated successfully!');
      setEditing(false);
      fetchProfile();
      setTimeout(() => setSuccess(''), 3000);
    }
    setSaving(false);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const roleColor = () => {
    if (!userRole || userRole === 'New Member') return 'bg-gray-50 text-gray-500';
    if (userRole === 'Traveler') return 'bg-blue-50 text-blue-600';
    if (userRole === 'Shipper') return 'bg-green-50 text-green-600';
    return 'bg-purple-50 text-purple-600';
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-gray-400 text-sm">Loading profile...</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">My Profile</h1>
        <p className="text-gray-400 text-sm mt-1">Manage your personal information and preferences</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-100 text-green-700 text-sm px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
          <Check size={16} /> {success}
        </div>
      )}

      {/* Profile Header Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">

            {/* Avatar */}
            <div className="relative">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile"
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-purple-100" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                  {getInitials(profile?.full_name)}
                </div>
              )}
              <button
                onClick={handlePhotoClick}
                disabled={uploadingPhoto}
                className="absolute -bottom-2 -right-2 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center border-2 border-white hover:bg-purple-700 transition disabled:opacity-50"
                title="Change photo"
              >
                {uploadingPhoto ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={13} className="text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-800">{profile?.full_name || 'Your Name'}</h2>
                {profile?.verified && (
                  <div className="flex items-center gap-1 bg-blue-50 text-blue-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                    <Shield size={11} /> Verified
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-0.5">{session.user.email}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {profile?.rating > 0 && (
                  <div className="flex items-center gap-1">
                    <Star size={14} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-semibold text-gray-700">{profile.rating.toFixed(1)}</span>
                    <span className="text-xs text-gray-400">({profile.total_reviews} reviews)</span>
                  </div>
                )}
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${roleColor()}`}>
                  {userRole || 'New Member'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => { setEditing(!editing); setError(''); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition ${
              editing ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
            }`}
          >
            {editing ? <><X size={15} /> Cancel</> : <><Edit2 size={15} /> Edit Profile</>}
          </button>
        </div>

        {!editing && (
          <div className="mt-4 pt-4 border-t border-gray-50">
            <p className="text-sm text-gray-500 italic">
              {profile?.bio || 'No bio yet — click Edit Profile to add one!'}
            </p>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Flights Listed', value: stats.totalFlights, icon: Plane, color: 'purple' },
          { label: 'Requests Posted', value: stats.totalRequests, icon: Package, color: 'blue' },
          { label: 'Deals Completed', value: stats.completedDeals, icon: Award, color: 'green' },
          { label: 'Wallet Balance', value: `$${(profile?.wallet_balance || 0).toFixed(2)}`, icon: DollarSign, color: 'yellow' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
              stat.color === 'purple' ? 'bg-purple-50' :
              stat.color === 'blue' ? 'bg-blue-50' :
              stat.color === 'green' ? 'bg-green-50' : 'bg-yellow-50'
            }`}>
              <stat.icon size={16} className={
                stat.color === 'purple' ? 'text-purple-600' :
                stat.color === 'blue' ? 'text-blue-600' :
                stat.color === 'green' ? 'text-green-600' : 'text-yellow-600'
              } />
            </div>
            <p className="text-xl font-bold text-gray-800">{stat.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Edit Form */}
      {editing && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4 space-y-4">
          <h3 className="font-bold text-gray-800">Edit Your Information</h3>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Full Name *</label>
            <div className="relative">
              <User size={15} className="absolute left-3 top-3.5 text-gray-400" />
              <input type="text" placeholder="Your full name" value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Bio</label>
            <textarea placeholder="Tell shippers about yourself..."
              value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Phone Number</label>
            <div className="relative">
              <Phone size={15} className="absolute left-3 top-3.5 text-gray-400" />
              <input type="tel" placeholder="+971 50 000 0000" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Nationality</label>
            <div className="relative">
              <Globe size={15} className="absolute left-3 top-3.5 text-gray-400" />
              <select value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 text-gray-600">
                <option value="">Select nationality</option>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Languages Spoken</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map(lang => (
                <button key={lang} onClick={() => toggleLanguage(lang)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    form.languages.includes(lang)
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}>
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-xs bg-red-50 p-3 rounded-xl">{error}</p>}

          <button onClick={saveProfile} disabled={saving}
            className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
            <Check size={15} />
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      )}

      {/* Info Display */}
      {!editing && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-gray-800">Personal Information</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Email</p>
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-purple-400" />
                <p className="text-sm font-medium text-gray-700 truncate">{session.user.email}</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Phone</p>
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-purple-400" />
                <p className="text-sm font-medium text-gray-700">{profile?.phone || 'Not set'}</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Nationality</p>
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-purple-400" />
                <p className="text-sm font-medium text-gray-700">{profile?.nationality || 'Not set'}</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Member Role</p>
              <div className="flex items-center gap-2">
                <Award size={14} className="text-purple-400" />
                <p className="text-sm font-medium text-gray-700">{userRole || 'New Member'}</p>
              </div>
            </div>
          </div>

          {profile?.languages && profile.languages.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Languages</p>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map(lang => (
                  <span key={lang} className="text-xs bg-purple-50 text-purple-600 px-3 py-1 rounded-full font-medium">
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Profile;