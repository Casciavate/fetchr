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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center animate-pulse">
          <span className="text-white text-xl">✈️</span>
        </div>
        <p className="text-purple-600 font-semibold text-sm">Loading Fetchr...</p>
      </div>
    </div>
  );

  return session ? <Dashboard session={session} /> : <Auth onAuthSuccess={() => {}} />;
}

export default App;