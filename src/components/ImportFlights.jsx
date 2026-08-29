import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { CODE_TO_AIRLINE } from './shared/airlines';
import { AIRPORTS } from './shared/airports';
import {
  Mail, Upload, Search, CheckCircle, AlertCircle, X,
  Briefcase, Package, Plane, FileText,
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

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const FLIGHT_NUM_RE = /\b([A-Za-z][A-Za-z0-9]|[0-9][A-Za-z])\s?(\d{1,4})\b/g;

// Best-effort: extract flight number + date pairs from free-form booking
// confirmation text (or the SUMMARY/DESCRIPTION of a single .ics VEVENT).
// This deliberately does NOT try to also parse the route — the same
// flight-search edge function AddFlight.jsx already uses can look that up
// authoritatively from the flight number + date once we have both, which
// is far more reliable than guessing airport codes out of free text.
const extractCandidates = (text) => {
  if (!text) return [];
  const found = [];

  // Date tokens with their character position, so we can pair each flight
  // number with whichever date appears nearest to it in the source text.
  const dateMatches = [];
  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  let m;
  while ((m = isoRe.exec(text))) {
    dateMatches.push({ index: m.index, iso: `${m[1]}-${m[2]}-${m[3]}` });
  }
  const monthNameRe = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi;
  while ((m = monthNameRe.exec(text))) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    dateMatches.push({ index: m.index, iso: `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` });
  }
  const monthFirstRe = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;
  while ((m = monthFirstRe.exec(text))) {
    const mi = MONTHS.indexOf(m[1].toLowerCase());
    dateMatches.push({ index: m.index, iso: `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` });
  }

  const nearestDate = (pos) => {
    let best = null, bestDist = Infinity;
    for (const d of dateMatches) {
      const dist = Math.abs(d.index - pos);
      if (dist < bestDist && dist < 400) { best = d.iso; bestDist = dist; }
    }
    return best;
  };

  const seen = new Set();
  while ((m = FLIGHT_NUM_RE.exec(text))) {
    const prefix = m[1].toUpperCase();
    if (!CODE_TO_AIRLINE[prefix]) continue; // only keep tokens matching a real airline code
    const flightNumber = `${prefix}${m[2]}`;
    const date = nearestDate(m.index);
    if (!date) continue; // no nearby date — too low-confidence to surface
    const key = `${flightNumber}_${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ flightNumber, date, airline: CODE_TO_AIRLINE[prefix] });
  }
  return found;
};

// Minimal .ics parser — pairs each VEVENT's own SUMMARY/DESCRIPTION with its
// own DTSTART, which is more reliable than scanning the whole file at once.
const extractFromICS = (text) => {
  const events = text.split(/BEGIN:VEVENT/i).slice(1);
  const out = [];
  for (const raw of events) {
    const block = raw.split(/END:VEVENT/i)[0];
    const dtMatch = block.match(/DTSTART[^:]*:(\d{4})(\d{2})(\d{2})/);
    const textFields = (block.match(/SUMMARY:.*|DESCRIPTION:.*|LOCATION:.*/gi) || []).join('\n');
    const candidates = extractCandidates(textFields || block);
    if (candidates.length) {
      out.push(...candidates.map(c => ({ ...c, date: dtMatch ? `${dtMatch[1]}-${dtMatch[2]}-${dtMatch[3]}` : c.date })));
    } else if (dtMatch) {
      // No flight number found in this event's text — skip rather than guess
    }
  }
  return out;
};

const todayIso = () => new Date().toISOString().split('T')[0];

const ImportFlights = ({ session, onDone }) => {
  const [source, setSource] = useState('paste'); // 'paste' | 'ics'
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [candidates, setCandidates] = useState(null); // null = not parsed yet
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(null);

  const [handKg, setHandKg] = useState('');
  const [handPrice, setHandPrice] = useState('');
  const [checkinKg, setCheckinKg] = useState('');
  const [checkinPrice, setCheckinPrice] = useState('');
  const [categories, setCategories] = useState([]);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setRawText(text);
    setSource('ics');
  };

  const runParse = async () => {
    setError(''); setImportedCount(null);
    if (!rawText.trim()) { setError('Paste some text or upload a file first.'); return; }
    setParsing(true);
    const parsed = source === 'ics' ? extractFromICS(rawText) : extractCandidates(rawText);
    if (parsed.length === 0) {
      setError("Couldn't find any recognisable flight number + date in there. Try the manual search tab instead, or check the text includes both.");
      setCandidates([]);
      setParsing(false);
      return;
    }

    // Enrich each candidate with the real route via the same live schedule
    // lookup AddFlight.jsx uses — falls back gracefully to "route unknown,
    // fill in manually" per flight if the lookup is unavailable or finds
    // no match, exactly like the manual flow already does.
    const enriched = await Promise.all(parsed.map(async (c, i) => {
      let from = null, to = null, airline = c.airline;
      try {
        const result = await searchFlightSchedule('by_number', { flightNumber: c.flightNumber, date: c.date });
        const match = result.flights?.[0];
        if (match) {
          airline = match.airline || airline;
          const fromAirport = AIRPORTS.find(a => a.code === match.from?.iata);
          const toAirport = AIRPORTS.find(a => a.code === match.to?.iata);
          from = fromAirport || (match.from?.iata ? { code: match.from.iata, city: match.from.city || match.from.iata } : null);
          to = toAirport || (match.to?.iata ? { code: match.to.iata, city: match.to.city || match.to.iata } : null);
        }
      } catch (e) { /* graceful fallback below */ }
      return {
        id: `${c.flightNumber}_${c.date}_${i}`,
        flightNumber: c.flightNumber, date: c.date, airline,
        fromCode: from?.code || '', fromCity: from?.city || '',
        toCode: to?.code || '', toCity: to?.city || '',
        selected: true,
        resolved: !!from && !!to,
      };
    }));

    setCandidates(enriched);
    setParsing(false);
  };

  const updateCandidate = (id, patch) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  const toggleAll = (value) => setCandidates(prev => prev.map(c => ({ ...c, selected: value })));

  const toggleCategory = (cat) => {
    setCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

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

    const rows = candidates.filter(c => c.selected).map(c => ({
      user_id: session.user.id,
      from_city: c.fromCity, from_code: c.fromCode,
      to_city: c.toCity, to_code: c.toCode,
      flight_date: c.date, flight_number: c.flightNumber, airline: c.airline,
      available_kg: totalKg, price_per_kg: luggageOptions[0].price_per_kg,
      luggage_options: luggageOptions, categories, status: 'active',
      delivery_type: 'handover', shop_and_ship_fee: 0,
      notes: `Imported via ${source === 'ics' ? 'calendar file' : 'pasted confirmation'}.`,
    }));

    const { error } = await supabase.from('flights').insert(rows);
    setImporting(false);
    if (error) { setError(error.message); return; }
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

  return (
    <div className="space-y-4">
      <div className="bg-surface-sunken rounded-md p-4 border border-line">
        <p className="text-body-s text-content-muted leading-relaxed">
          Paste the text of a booking confirmation email, or upload a calendar (.ics) file exported from your
          airline, Gmail, or a flight tracker like Flighty. We'll pull out the flight number and date and look up
          the real route for you to review before anything is added.
        </p>
      </div>

      {candidates === null && (
        <>
          <div className="flex gap-1 bg-surface-sunken rounded-md p-1">
            <button type="button" onClick={() => setSource('paste')}
              className={`flex-1 flex items-center justify-center gap-1.5 text-label font-display font-semibold py-2 rounded transition-all ${
                source === 'paste' ? 'bg-surface shadow-elev-1 text-ink-900' : 'text-content-muted'
              }`}>
              <Mail size={13} /> Paste confirmation
            </button>
            <button type="button" onClick={() => document.getElementById('ics-input').click()}
              className={`flex-1 flex items-center justify-center gap-1.5 text-label font-display font-semibold py-2 rounded transition-all ${
                source === 'ics' ? 'bg-surface shadow-elev-1 text-ink-900' : 'text-content-muted'
              }`}>
              <Upload size={13} /> Upload .ics file
            </button>
            <input id="ics-input" type="file" accept=".ics,text/calendar" className="hidden" onChange={handleFile} />
          </div>

          {source === 'paste' ? (
            <textarea rows={7} className="input-field resize-none font-mono text-body-s"
              placeholder="Paste your booking confirmation email here..."
              value={rawText} onChange={e => setRawText(e.target.value)} />
          ) : (
            <div className="input-field flex items-center gap-2 text-body-s text-content-muted">
              <FileText size={15} />
              {fileName || 'No file selected — tap "Upload .ics file" above'}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-danger-tint text-danger text-body-s px-4 py-3 rounded-md">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          <button onClick={runParse} disabled={parsing || !rawText.trim()} className="btn-primary w-full disabled:opacity-50">
            <Search size={15} /> {parsing ? 'Reading...' : 'Find flights'}
          </button>
        </>
      )}

      {candidates?.length > 0 && (
        <>
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
        </>
      )}

      {candidates?.length === 0 && (
        <button onClick={() => setCandidates(null)} className="btn-secondary w-full">Try again</button>
      )}
    </div>
  );
};

export default ImportFlights;
