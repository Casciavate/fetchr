import React, { useState, useEffect } from 'react';
import './index.css';
import { supabase } from './supabaseClient';
import Dashboard from './components/Dashboard';
import Auth from './components/Auth';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

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

  return session ? (
    <Dashboard session={session} />
  ) : (
    <Auth onAuthSuccess={() => {}} />
  );
}

export default App;