import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Plane, Mail, Lock, Eye, EyeOff, ArrowRight, Shield } from 'lucide-react';

const Auth = () => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } }
      });
      if (error) setError(error.message);
      else setSuccess('Account created! Please check your email to verify your account.');
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });
    if (error) { setError(error.message); setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-900 flex items-center justify-center p-4">

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500 rounded-full opacity-10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500 rounded-full opacity-10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600 rounded-full opacity-5 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl mb-4 border border-white/20">
            <Plane size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Fetchr</h1>
          <p className="text-purple-200 text-sm mt-2">The social delivery marketplace</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 p-8 shadow-2xl">

          {/* Tabs */}
          <div className="flex bg-white/10 rounded-2xl p-1 mb-6">
            {['login', 'signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setSuccess(''); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  mode === m
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-white/70 hover:text-white'
                }`}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Google Button */}
          <button onClick={handleGoogle} disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 rounded-2xl py-3.5 text-sm font-semibold hover:bg-gray-50 transition mb-4 shadow-sm disabled:opacity-50">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-white/40 text-xs">or</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40"
                />
              </div>
            )}

            <div className="relative">
              <Mail size={16} className="absolute left-4 top-4 text-white/40" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl pl-10 pr-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40"
              />
            </div>

            <div className="relative">
              <Lock size={16} className="absolute left-4 top-4 text-white/40" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl pl-10 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-4 text-white/40 hover:text-white/70">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-400/30 text-red-200 text-xs px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-500/20 border border-green-400/30 text-green-200 text-xs px-4 py-3 rounded-xl">
                {success}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-white text-purple-700 rounded-2xl py-3.5 text-sm font-bold hover:bg-purple-50 transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg mt-2">
              {loading ? (
                <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-4 mt-6 pt-6 border-t border-white/10">
            <div className="flex items-center gap-1.5 text-white/40 text-xs">
              <Shield size={12} />
              <span>Secure & Encrypted</span>
            </div>
            <div className="w-1 h-1 bg-white/20 rounded-full" />
            <div className="text-white/40 text-xs">No spam ever</div>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          {[
            { icon: '✈️', text: 'List your flights' },
            { icon: '📦', text: 'Ship anything' },
            { icon: '💰', text: 'Earn money' },
          ].map((f, i) => (
            <div key={i} className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/10">
              <p className="text-xl mb-1">{f.icon}</p>
              <p className="text-white/60 text-xs">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Auth;