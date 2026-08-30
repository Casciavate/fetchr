import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { LogOut } from 'lucide-react';
import { TC_SECTIONS } from './Auth';
import AdvisoryBanner from './shared/AdvisoryBanner';

// Shown once, full-screen, before Dashboard ever renders — for ANY account
// that reached a session without profiles.terms_accepted_at being set.
// This is what actually closes the "Continue with Google skips T&Cs" gap:
// Google OAuth creates the auth user (and, via the handle_new_user trigger,
// the profile row) before any of our own UI runs, so the only reliable
// place to require acceptance is right here, after a session exists but
// before the rest of the app is usable — regardless of how the account
// was created.
const AcceptTerms = ({ session, onAccepted }) => {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAccept = async () => {
    setLoading(true);
    setError('');
    const { error } = await supabase
      .from('profiles')
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq('id', session.user.id);
    if (error) {
      setError('Something went wrong saving your acceptance. Try again.');
      setLoading(false);
      return;
    }
    onAccepted();
  };

  return (
    <div className="min-h-screen bg-ground flex items-center justify-center p-4">
      <div className="w-full max-w-lg card shadow-elev-2 max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-line flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 bg-ink-900 rounded-md flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 48 48" role="img" aria-label="fetchr">
              <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
                fill="none" stroke="#FBFAF8" strokeWidth="5" strokeLinecap="round" />
              <rect x="10.5" y="21" width="16" height="4.6" rx="2.3" fill="#FBFAF8" />
              <path d="M29 10.5 L39 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518" />
            </svg>
          </div>
          <div>
            <h1 className="font-display font-bold text-title-m text-ink-900">One more thing</h1>
            <p className="text-body-s text-content-muted">Accept the terms to continue to fetchr.</p>
          </div>
        </div>

        <div className="p-6 space-y-5 text-body-m text-content-muted leading-relaxed overflow-y-auto">
          {TC_SECTIONS.map((section, i) => (
            <div key={i}>
              <h4 className="font-display font-bold text-ink-900 mb-1.5">{section.title}</h4>
              <p>{section.body}</p>
            </div>
          ))}
          <AdvisoryBanner tone="error">
            <span className="font-semibold">By continuing you acknowledge that you have read, understood, and agree to all of these Terms &amp; Conditions.</span> Violation may result in immediate account termination and referral to law enforcement authorities.
          </AdvisoryBanner>
        </div>

        <div className="p-6 border-t border-line space-y-3 flex-shrink-0">
          <div className={`flex items-start gap-3 rounded-md p-3 border transition-all ${
            agreed ? 'bg-success-tint border-secure-200' : 'bg-surface-sunken border-line'
          }`}>
            <input type="checkbox" id="accept-tc" checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-ink-900 flex-shrink-0 cursor-pointer" />
            <label htmlFor="accept-tc" className="text-body-s text-content-muted leading-relaxed cursor-pointer">
              I have read and agree to the Terms &amp; Conditions and Privacy Policy. I confirm I will not use fetchr to transport illegal items. I understand fetchr is a matchmaking platform only and bears no liability for items transported.
            </label>
          </div>

          {error && <AdvisoryBanner tone="error">{error}</AdvisoryBanner>}

          <button onClick={handleAccept} disabled={!agreed || loading}
            className="btn-primary w-full disabled:opacity-50">
            {loading
              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : 'I agree — continue to fetchr'
            }
          </button>
          <button onClick={() => supabase.auth.signOut()}
            className="btn-secondary w-full">
            <LogOut size={14} /> Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
};

export default AcceptTerms;
