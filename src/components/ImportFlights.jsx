import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { AIRPORTS } from './shared/airports';
import {
  Mail, Copy, Check, RefreshCw, CheckCircle, AlertCircle,
  Briefcase, Package, Plane,
} from 'lucide-react';

const FLIGHT_SEARCH_URL = 'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/flight-search';

const searchFlightSchedule = async (action, data) => {
  const { data: { session: auth } } = await supabase.auth.getSession();
  const res = await fetch(FLIGHT_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.access_token}` },
    body: JSON.stringify({ action, data }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Flight search failed');
  return result;
};

const CATEGORIES = [
  'Electronics', 'Clothing & Fashion', 'Cosmetics & Beauty',
  'Food & Beverages', 'Books & Stationery', 'Toys & Games',
  'Medical & Pharmacy', 'Jewelry & Accessories', 'Sports & Fitness',
  'Home & Living', 'Documents', 'Other'
];

// Where users forward booking confirmations. Update this once the inbound
// parse subdomain is live — see supabase/functions/email-import/index.ts
// for the SendGrid Inbound Parse setup this depends on.
const IMPORT_EMAIL_ADDRESS = 'flights@import.fetchr.app';

const todayIso = () => new Date().toISOString().split('T')[0];

const ImportFlights = ({ session, onDone }) => {
  const [pending, setPending] = useState(null); // null = not loaded yet
  const [candidates, setCandidates] = useState(null); // enriched, reviewable list
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(null);

  const [handKg, setHandKg] = useState('');
  const [handPrice, setHandPrice] = useState('');
  const [checkinKg, setCheckinKg] = useState('');
  const [checkinPrice, setCheckinPrice] = useState('');
  const [categories, setCategories] = useState([]);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);

  const fetchPending = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const { data } = await supabase
      .from('pending_flight_imports')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setPending(data || []);
    if (showLoading) setLoading(false);
  }, [session.user.id]);

  useEffect(() => {
    fetchPending(true);
    const poll = setInterval(() => fetchPending(false), 8000);
    const sub = supabase.channel(`pending-imports-${session.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'pending_flight_imports',
        filter: `user_id=eq.${session.user.id}`,
      }, () => fetchPending(false))
      .subscribe();
    return () => { clearInterval(poll); supabase.removeChannel(sub); };
  }, [fetchPending, session.user.id]);

  const copyAddress = () => {
    navigator.clipboard?.writeText(IMPORT_EMAIL_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Enrich the raw parsed rows (flight number + date only) with the real
  // route via the same live schedule lookup AddFlight.jsx uses — falls back
  // to manual entry per flight if unavailable or no match, same pattern as
  // the manual add flow.
  const reviewPending = async () => {
    setError('');
    const rows = pending;
    const enriched = await Promise.all(rows.map(async (row) => {
      let from = null, to = null, airline = null;
      try {
        const result = await searchFlightSchedule('by_number', { flightNumber: row.flight_number, date: row.flight_date });
        const match = result.flights?.[0];
        if (match) {
          airline = match.airline || null;
          const fromAirport = AIRPORTS.find(a => a.code === match.from?.iata);
          const toAirport = AIRPORTS.find(a => a.code === match.to?.iata);
          from = fromAirport || (match.from?.iata ? { code: match.from.iata, city: match.from.city || match.from.iata } : null);
          to = toAirport || (match.to?.iata ? { code: match.to.iata, city: match.to.city || match.to.iata } : null);
        }
      } catch (e) { /* graceful fallback below */ }
      return {
        id: row.id, flightNumber: row.flight_number, date: row.flight_date, airline,
        fromCode: from?.code || '', fromCity: from?.city || '',
        toCode: to?.code || '', toCity: to?.city || '',
        selected: true, resolved: !!from && !!to,
      };
    }));
    setCandidates(enriched);
  };

  const updateCandidate = (id, patch) => setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const toggleAll = (value) => setCandidates(prev => prev.map(c => ({ ...c, selected: value })));
  const toggleCategory = (cat) => setCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  const selectedCount = candidates?.filter(c => c.selected).length || 0;
  const readyToImport = selectedCount > 0
    && (handKg && handPrice || checkinKg && checkinPrice)
    && categories.length > 0 && safetyAcknowledged
    && candidates.filter(c => c.selected).every(c => c.fromCode && c.toCode && c.date && c.date >= todayIso());

  const runImport = async () => {
    setImporting(true); setError('');
    const luggageOptions = [];
    if (handKg && handPrice) luggageOptions.push({ type: 'carry_on', available_kg: parseFloat(handKg), price_per_kg: parseFloat(handPrice) });
    if (checkinKg && checkinPrice) luggageOptions.push({ type: 'checkin', available_kg: parseFloat(checkinKg), price_per_kg: parseFloat(checkinPrice) });
    const totalKg = luggageOptions.reduce((s, l) => s + l.available_kg, 0);
    const selected = candidates.filter(c => c.selected);

    const rows = selected.map(c => ({
      user_id: session.user.id,
      from_city: c.fromCity, from_code: c.fromCode,
      to_city: c.toCity, to_code: c.toCode,
      flight_date: c.date, flight_number: c.flightNumber, airline: c.airline,
      available_kg: totalKg, price_per_kg: luggageOptions[0].price_per_kg,
      luggage_options: luggageOptions, categories, status: 'active',
      delivery_type: 'handover', shop_and_ship_fee: 0,
      notes: 'Imported from a forwarded booking confirmation.',
    }));

    const { error: insertError } = await supabase.from('flights').insert(rows);
    if (insertError) { setError(insertError.message); setImporting(false); return; }

    await supabase.from('pending_flight_imports')
      .update({ status: 'imported' })
      .in('id', selected.map(c => c.id));
    // Anything left unselected in this batch goes back to the pending pool
    // rather than being dismissed silently — the user can review it again later.

    setImporting(false);
    setImportedCount(rows.length);
  };

  if (importedCount !== null) {
    return (
      <div className="ticket text-center py-16 px-6">
        <div className="w-16 h-16 bg-success-tint rounded-lg flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-success" />
        </div>
        <h2 className="font-display font-bold text-title-m text-ink-900 mb-2">
          {importedCount} flight{importedCount !== 1 ? 's' : ''} imported
        </h2>
        <p className="text-body-m text-content-muted mb-6">They're live and visible to senders now.</p>
        <button onClick={onDone} className="btn-primary">Done</button>
      </div>
    );
  }

  if (candidates) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-label text-content-muted">{candidates.length} flight{candidates.length !== 1 ? 's' : ''} found</p>
          <div className="flex gap-2">
            <button onClick={() => toggleAll(true)} className="text-label font-semibold text-ink-900 hover:underline">Select all</button>
            <span className="text-content-subtle">·</span>
            <button onClick={() => toggleAll(false)} className="text-label font-semibold text-content-muted hover:underline">Deselect all</button>
          </div>
        </div>

        <div className="space-y-2">
          {candidates.map(c => (
            <div key={c.id} className={`ticket p-3 flex items-start gap-3 ${!c.selected ? 'opacity-50' : ''}`}>
              <input type="checkbox" checked={c.selected} onChange={e => updateCandidate(c.id, { selected: e.target.checked })}
                className="mt-1 w-4 h-4 accent-ink-900 flex-shrink-0" />
              <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-overline text-ink-400 font-mono uppercase">Flight</p>
                  <p className="font-mono font-semibold text-body-m text-ink-900">{c.flightNumber}</p>
                  <p className="text-body-s text-content-muted truncate">{c.airline || 'Unknown airline'}</p>
                </div>
                <div>
                  <p className="text-overline text-ink-400 font-mono uppercase">Date</p>
                  <input type="date" min={todayIso()} value={c.date}
                    onChange={e => updateCandidate(c.id, { date: e.target.value })}
                    className="input-field py-1.5 text-body-s font-mono" />
                </div>
                <div className="col-span-2">
                  <p className="text-overline text-ink-400 font-mono uppercase mb-1">Route</p>
                  {c.resolved ? (
                    <p className="font-mono text-body-m font-semibold text-ink-900">
                      {c.fromCode} ({c.fromCity}) → {c.toCode} ({c.toCity})
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input type="text" placeholder="FROM code" maxLength={3} value={c.fromCode}
                        onChange={e => updateCandidate(c.id, { fromCode: e.target.value.toUpperCase() })}
                        className="input-field py-1.5 text-body-s font-mono w-24 uppercase" />
                      <Plane size={13} className="text-ink-400 flex-shrink-0" />
                      <input type="text" placeholder="TO code" maxLength={3} value={c.toCode}
                        onChange={e => updateCandidate(c.id, { toCode: e.target.value.toUpperCase() })}
                        className="input-field py-1.5 text-body-s font-mono w-24 uppercase" />
                      <span className="text-micro text-warning">Route not found — enter manually</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="ticket p-4 space-y-3">
          <p className="font-display font-semibold text-title-s text-ink-900">Capacity &amp; pricing for these flights</p>
          <p className="text-body-s text-content-muted">Applied to every flight you import in this batch — edit any of them individually afterwards from My Flights.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-line p-3 space-y-2">
              <p className="text-label font-semibold text-content-muted flex items-center gap-1"><Briefcase size={12} /> Hand luggage</p>
              <input type="number" placeholder="kg available" min="0" step="0.5" value={handKg}
                onChange={e => setHandKg(e.target.value)} className="input-field py-2 text-body-s" />
              <input type="number" placeholder="$/kg" min="0" step="0.5" value={handPrice}
                onChange={e => setHandPrice(e.target.value)} className="input-field py-2 text-body-s" />
            </div>
            <div className="rounded-md border border-line p-3 space-y-2">
              <p className="text-label font-semibold text-content-muted flex items-center gap-1"><Package size={12} /> Check-in</p>
              <input type="number" placeholder="kg available" min="0" step="0.5" value={checkinKg}
                onChange={e => setCheckinKg(e.target.value)} className="input-field py-2 text-body-s" />
              <input type="number" placeholder="$/kg" min="0" step="0.5" value={checkinPrice}
                onChange={e => setCheckinPrice(e.target.value)} className="input-field py-2 text-body-s" />
            </div>
          </div>

          <p className="text-label font-semibold text-content-muted">What items can you carry?</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                className={`px-3 py-1.5 rounded-md text-body-s font-semibold border transition-all ${
                  categories.includes(cat) ? 'bg-brand text-white border-brand' : 'bg-surface text-content border-line hover:border-line-strong'
                }`}>
                {cat}
              </button>
            ))}
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={safetyAcknowledged} onChange={e => setSafetyAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-ink-900 flex-shrink-0" />
            <span className="text-body-s text-content-muted leading-relaxed">
              I confirm I'll only carry legal items permitted by airline regulations and customs law, and I accept full legal responsibility for what I carry.
            </span>
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-danger-tint text-danger text-body-s px-4 py-3 rounded-md">
            <AlertCircle size={14} className="flex-shrink-0" /> {error}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => setCandidates(null)} className="btn-secondary flex-1">Back</button>
          <button onClick={runImport} disabled={!readyToImport || importing} className="btn-primary flex-[2] disabled:opacity-50">
            {importing
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing</>
              : <>Import {selectedCount} flight{selectedCount !== 1 ? 's' : ''}</>
            }
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="ticket p-5 text-center">
        <div className="w-12 h-12 bg-ink-100 rounded-lg flex items-center justify-center mx-auto mb-3">
          <Mail size={22} className="text-ink-900" />
        </div>
        <h2 className="font-display font-bold text-title-s text-ink-900 mb-1.5">Forward your booking confirmation</h2>
        <p className="text-body-s text-content-muted mb-4 leading-relaxed">
          From the email address on your fetchr account ({session.user.email}), forward any airline booking
          confirmation — or an export from Flighty, TripIt, or your calendar — to the address below. We'll find the
          flight details and show them here to review, usually within a minute.
        </p>
        <button onClick={copyAddress}
          className="w-full flex items-center justify-between gap-2 bg-surface-sunken border border-line rounded-md px-4 py-3 hover:border-line-strong transition">
          <span className="font-mono text-body-m font-semibold text-ink-900">{IMPORT_EMAIL_ADDRESS}</span>
          {copied ? <Check size={16} className="text-success flex-shrink-0" /> : <Copy size={16} className="text-ink-400 flex-shrink-0" />}
        </button>
      </div>

      {pending?.length > 0 ? (
        <div className="ticket p-4 flex items-center justify-between">
          <div>
            <p className="font-display font-semibold text-title-s text-ink-900">
              {pending.length} flight{pending.length !== 1 ? 's' : ''} ready to review
            </p>
            <p className="text-body-s text-content-muted">Found from a forwarded email.</p>
          </div>
          <button onClick={reviewPending} className="btn-primary">Review &amp; import</button>
        </div>
      ) : (
        <button onClick={() => fetchPending(true)} disabled={loading}
          className="btn-secondary w-full disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Checking...' : 'Check for new imports'}
        </button>
      )}
    </div>
  );
};

export default ImportFlights;
