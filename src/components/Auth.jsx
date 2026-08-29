import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Plane, Package, DollarSign, Mail, Lock, Eye, EyeOff, ArrowRight, Shield, X, AlertTriangle } from 'lucide-react';

export const TC_SECTIONS = [
  {
    title: '1. Platform Role',
    body: 'fetchr is a peer-to-peer matchmaking platform that connects travellers with spare luggage capacity to individuals wishing to send items. fetchr acts solely as a facilitator and is not a courier, logistics provider, or shipping company. fetchr facilitates secure payment between parties but does not take possession of or responsibility for any items.'
  },
  {
    title: '2. User Responsibilities',
    body: 'All users are solely responsible for the items they send or carry. By using fetchr, you confirm that you will not use the platform to transport illegal, dangerous, prohibited, or restricted items including but not limited to: narcotics, weapons, counterfeit goods, hazardous materials, live animals, human remains, or any items prohibited by applicable law or airline regulations.'
  },
  {
    title: '3. Prohibited Items',
    body: 'Strictly prohibited on fetchr: illegal drugs or controlled substances, weapons or ammunition of any kind, live animals, human remains, currency above legal declaration limits, stolen goods, items violating intellectual property rights, and any items restricted by customs regulations of the origin or destination country. Violation will result in immediate account termination and referral to law enforcement.'
  },
  {
    title: '4. Liability Disclaimer',
    body: 'fetchr bears absolutely no liability for the content, nature, legality, or condition of items transported through the platform. All liability for items transported rests solely with the sender and traveller involved in the deal. fetchr\'s liability is strictly limited to its role as a payment escrow facilitator.'
  },
  {
    title: '5. Customs & Legal Compliance',
    body: 'Users are solely responsible for compliance with all applicable customs, import/export, and tax regulations in both origin and destination countries. fetchr takes no responsibility for customs seizures, fines, legal consequences, or delays arising from items transported through the platform.'
  },
  {
    title: '6. Escrow Payments',
    body: 'fetchr uses Stripe to process and hold payments in escrow until both parties confirm delivery. fetchr charges a tiered service fee on each transaction, which varies based on deal size (7%-12%). All fees are shown transparently before payment. Escrow is released only when both parties confirm delivery. Refunds on cancellation are subject to the agreed cancellation terms between parties.'
  },
  {
    title: '7. Identity & Safety',
    body: 'Travellers must verify their identity before accepting items from senders. Senders must not hand over items until escrow payment is confirmed. fetchr may at its discretion require identity verification for high-value transactions. Users agree to cooperate with any verification requests.'
  },
  {
    title: '8. Dispute Resolution',
    body: 'In the event of a dispute, fetchr may at its sole discretion review evidence provided by both parties. fetchr\'s decision on escrow release is final. fetchr is not obligated to mediate disputes and may refer parties to relevant authorities where illegal activity is suspected.'
  },
  {
    title: '9. Account Termination',
    body: 'fetchr reserves the right to suspend or terminate any account that violates these terms, engages in fraudulent activity, or misuses the platform, without prior notice and without liability to the account holder.'
  },
  {
    title: '10. Privacy & Data',
    body: 'fetchr collects and processes personal data solely for the purpose of operating the platform. We do not sell personal data to third parties. Data is stored securely using Supabase\'s enterprise-grade infrastructure. By using fetchr you consent to this processing.'
  },
  {
    title: '11. Governing Law',
    body: 'These terms are governed by applicable law. Any disputes arising from the use of fetchr shall be subject to the jurisdiction of the courts in the operator\'s country of registration.'
  },
];

const FEATURES = [
  { icon: Plane, text: 'List your flights' },
  { icon: Package, text: 'Send items globally' },
  { icon: DollarSign, text: 'Earn money' },
];

const Auth = () => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showTC, setShowTC] = useState(false);
  const [tcAgreed, setTcAgreed] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // T&C only required for signup
    if (mode === 'signup' && !tcAgreed) {
      setError('You must accept the Terms & Conditions to create an account.');
      return;
    }
    if (mode === 'signup' && !fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, terms_accepted_at: new Date().toISOString() } }
        });
        if (error) setError(error.message);
        else setSuccess('Account created! Please check your email to verify your account.');
      }
    } catch (err) {
      // A thrown network error (rather than a returned `error` field) used to
      // leave `loading` stuck true forever — the button would spin and never
      // become clickable again, with no message telling the user why.
      setError(err.message || 'Something went wrong. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // No T&C gate here: Google can be reached from either tab, and the OAuth
  // redirect throws away this component's state anyway (a checkbox ticked
  // here can't be reliably threaded through to the account that comes back).
  // The real gate is enforced after the redirect, in App.js, based on
  // profiles.terms_accepted_at — every account, however it was created,
  // must accept before it can use the app.
  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'https://fetchr-zeta.vercel.app',
          queryParams: { access_type: 'offline', prompt: 'consent' }
        }
      });
      if (error) { setError(error.message); setLoading(false); }
    } catch (err) {
      setError(err.message || 'Something went wrong. Check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ground flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg mb-4 bg-ink-900">
            <svg width="36" height="36" viewBox="0 0 48 48" role="img" aria-label="fetchr">
              <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
                fill="none" stroke="#FBFAF8" strokeWidth="4.6" strokeLinecap="round" />
              <rect x="10.5" y="21" width="16" height="4.4" rx="2.2" fill="#FBFAF8" />
              <path d="M29 10.5 L38.5 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518" />
            </svg>
          </div>
          <h1 className="font-display font-extrabold text-title-l text-ink-900 tracking-[-0.05em]">fetchr</h1>
          <p className="text-body-s text-content-muted mt-2">The social delivery marketplace</p>
        </div>

        {/* Card */}
        <div className="card shadow-elev-2 p-8">

          {/* Tabs */}
          <div className="flex border-b border-line mb-6">
            {['login', 'signup'].map(m => (
              <button key={m}
                onClick={() => { setMode(m); setError(''); setSuccess(''); }}
                className={`flex-1 h-11 text-body-m font-display font-semibold transition-all border-b-2 -mb-px ${
                  mode === m ? 'text-ink-900 border-ink-900' : 'text-content-muted border-transparent hover:text-content'
                }`}>
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          {/* Google */}
          <button onClick={handleGoogle} disabled={loading}
            className="btn-secondary w-full mb-4 disabled:opacity-50">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-line" />
            <span className="text-micro text-content-subtle">or</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label htmlFor="full-name" className="block text-label text-content-muted mb-1.5 uppercase">
                  Full name
                </label>
                <input id="full-name" type="text" placeholder="Jonas Weber" value={fullName}
                  onChange={e => setFullName(e.target.value)} required
                  className="input-field" />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-label text-content-muted mb-1.5 uppercase">
                Email address
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                <input id="email" type="email" placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)} required
                  className="input-field pl-10" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-label text-content-muted mb-1.5 uppercase">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                <input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} required
                  className="input-field pl-10 pr-11" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* T&C — signup only */}
            {mode === 'signup' && (
              <div className={`flex items-start gap-3 rounded-md p-3 border transition-all ${
                tcAgreed ? 'bg-success-tint border-secure-200' : 'bg-surface-sunken border-line'
              }`}>
                <input type="checkbox" id="tc" checked={tcAgreed}
                  onChange={e => setTcAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-ink-900 flex-shrink-0 cursor-pointer" />
                <label htmlFor="tc" className="text-body-s text-content-muted leading-relaxed cursor-pointer">
                  I have read and agree to the{' '}
                  <button type="button" onClick={() => setShowTC(true)}
                    className="text-ink-900 underline hover:text-ink-700 transition font-semibold">
                    Terms &amp; Conditions
                  </button>
                  {' '}and{' '}
                  <button type="button" onClick={() => setShowTC(true)}
                    className="text-ink-900 underline hover:text-ink-700 transition font-semibold">
                    Privacy Policy
                  </button>
                  . I confirm I will not use fetchr to transport illegal items. I understand fetchr is a matchmaking platform only and bears no liability for items transported.
                </label>
              </div>
            )}

            {error && (
              <div className="bg-danger-tint text-danger text-body-s px-4 py-3 rounded-md">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-success-tint text-success text-body-s px-4 py-3 rounded-md">
                {success}
              </div>
            )}

            <button type="submit"
              disabled={loading || (mode === 'signup' && !tcAgreed)}
              className="btn-primary w-full mt-1">
              {loading
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <>{mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight size={16} /></>
              }
            </button>
          </form>

          <div className="flex items-center justify-center gap-4 mt-6 pt-6 border-t border-line">
            <div className="flex items-center gap-1.5 text-content-subtle text-micro">
              <Shield size={12} />
              <span>Secure &amp; encrypted</span>
            </div>
            <div className="w-1 h-1 bg-line rounded-full" />
            <button onClick={() => setShowTC(true)}
              className="text-content-subtle text-micro hover:text-content-muted transition underline">
              Terms &amp; Conditions
            </button>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          {FEATURES.map((f, i) => (
            <div key={i} className="card p-3 text-center">
              <f.icon size={20} className="text-ink-600 mx-auto mb-1" />
              <p className="text-content-muted text-micro">{f.text}</p>
            </div>
          ))}
        </div>

        <p className="text-content-subtle text-micro text-center mt-4 px-4 leading-relaxed">
          fetchr is a matchmaking platform only. All transactions are between travellers and senders. Users are solely responsible for legal compliance with all applicable laws.
        </p>
      </div>

      {/* T&C Modal */}
      {showTC && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4" style={{ background: 'var(--scrim)' }}>
          <div className="bg-surface rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-elev-3">
            <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-ink-900 rounded-md flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 48 48" role="img" aria-label="fetchr">
                    <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
                      fill="none" stroke="#FBFAF8" strokeWidth="5" strokeLinecap="round" />
                    <rect x="10.5" y="21" width="16" height="4.6" rx="2.3" fill="#FBFAF8" />
                    <path d="M29 10.5 L39 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518" />
                  </svg>
                </div>
                <h3 className="font-display font-bold text-title-s text-ink-900">fetchr terms &amp; conditions</h3>
              </div>
              <button onClick={() => setShowTC(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-sunken transition">
                <X size={18} className="text-ink-500" />
              </button>
            </div>
            <div className="p-6 space-y-5 text-body-m text-content-muted leading-relaxed">
              {TC_SECTIONS.map((section, i) => (
                <div key={i}>
                  <h4 className="font-display font-bold text-ink-900 mb-1.5">{section.title}</h4>
                  <p>{section.body}</p>
                </div>
              ))}
              <div className="bg-danger-tint rounded-md p-4 border-l-[3px] border-void-500">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-danger flex-shrink-0 mt-0.5" />
                  <p className="text-danger font-semibold text-body-s">
                    Important: by creating a fetchr account you acknowledge that you have read, understood, and agree to all of these Terms &amp; Conditions. Violation may result in immediate account termination and referral to law enforcement authorities.
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 space-y-2">
              <button onClick={() => { setShowTC(false); setTcAgreed(true); }}
                className="btn-primary w-full">
                I have read &amp; agree to these terms
              </button>
              <button onClick={() => setShowTC(false)}
                className="btn-secondary w-full">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Auth;
