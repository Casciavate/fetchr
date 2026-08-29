import React, { useState, useEffect, useCallback } from 'react';
import './index.css';
import { supabase } from './supabaseClient';
import Dashboard from './components/Dashboard';
import Auth from './components/Auth';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Auto logout on inactivity
  useEffect(() => {
    if (!session) return;
    let timer;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        signOut();
      }, INACTIVITY_TIMEOUT);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [session, signOut]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-ground">
      <div className="flex flex-col items-center gap-3">
        <svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label="fetchr" className="animate-pulse">
          <rect width="48" height="48" rx="10" fill="#14181F" />
          <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
            fill="none" stroke="#FBFAF8" strokeWidth="4.6" strokeLinecap="round" />
          <rect x="10.5" y="21" width="16" height="4.4" rx="2.2" fill="#FBFAF8" />
          <path d="M29 10.5 L38.5 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518" />
        </svg>
        <p className="font-display font-semibold text-body-m text-ink-muted">
          Loading fetchr
        </p>
      </div>
    </div>
  );

  return session ? <Dashboard session={session} /> : <Auth onAuthSuccess={() => {}} />;
}

export default App;