import React, { useState, useRef } from 'react';
import { MapPin, AlertCircle } from 'lucide-react';
import { AIRPORTS } from './airports';

// Airport typeahead — the "most important control in the product"
// (docs/BRAND.md §7.4). Was hand-duplicated between AddFlight.jsx and
// NewRequest.jsx and had drifted (NewRequest's manual-entry fallback was
// missing a Cancel button); this is the single shared implementation.
const AirportSearch = ({ label, value, onChange, placeholder }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualCity, setManualCity] = useState('');
  const ref = useRef(null);

  React.useEffect(() => {
    if (value?.code && value.code !== 'OTHER') {
      const airport = AIRPORTS.find(a => a.code === value.code);
      if (airport) setQuery(`${airport.city} (${airport.code})`);
      else if (value.city) setQuery(`${value.city} (${value.code})`);
    } else if (!value?.code) {
      setQuery('');
    }
  }, [value?.code]);

  React.useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearch = (q) => {
    setQuery(q);
    if (q.length < 1) { setResults([]); setOpen(false); return; }
    const lq = q.toLowerCase();
    const filtered = AIRPORTS.filter(a =>
      a.code.toLowerCase().startsWith(lq) ||
      a.city.toLowerCase().includes(lq) ||
      a.name.toLowerCase().includes(lq) ||
      a.country.toLowerCase().includes(lq)
    ).slice(0, 8);
    setResults(filtered);
    setOpen(true);
  };

  const handleSelect = (airport) => {
    if (airport.code === 'OTHER') {
      setShowManual(true);
      setOpen(false);
      setQuery('');
      return;
    }
    // Use EXACT values from our airport list — prevents wrong code bug
    setQuery(`${airport.city} (${airport.code})`);
    setOpen(false);
    setResults([]);
    setShowManual(false);
    onChange({ code: airport.code, city: airport.city, name: airport.name, country: airport.country });
  };

  const handleManualSave = () => {
    if (!manualCode || manualCode.length < 2 || !manualCity) return;
    const code = manualCode.toUpperCase().slice(0, 3);
    onChange({ code, city: manualCity, name: manualCity, country: 'Other' });
    setQuery(`${manualCity} (${code})`);
    setShowManual(false);
    setManualCode('');
    setManualCity('');
  };

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="block text-label text-content-muted mb-1.5 uppercase">
          {label}
        </label>
      )}
      <div className="relative">
        <MapPin size={15} className="absolute left-3.5 top-3.5 text-ink-400 pointer-events-none" />
        <input type="text" value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => query.length > 0 && results.length > 0 && setOpen(true)}
          placeholder={placeholder || 'Search city, airport or code...'}
          className="input-field pl-9"
          autoComplete="off" />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-tooltip w-full mt-1 bg-surface border border-line rounded-lg shadow-elev-2 overflow-hidden max-h-64 overflow-y-auto">
          {results.map(airport => (
            <button key={airport.code} type="button" onClick={() => handleSelect(airport)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-sunken text-left transition border-b border-line last:border-0">
              <div className="w-16 flex-shrink-0">
                <span className="font-mono text-code-l font-semibold text-content">{airport.code}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body-m font-semibold text-content">{airport.city}</p>
                <p className="text-body-s text-content-muted truncate">
                  {airport.name}{airport.country ? ` · ${airport.country}` : ''}
                </p>
              </div>
            </button>
          ))}
          <button type="button"
            onClick={() => { setShowManual(true); setOpen(false); setQuery(''); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-sunken text-left border-t border-line">
            <div className="w-10 h-10 bg-ink-100 rounded-md flex items-center justify-center flex-shrink-0">
              <AlertCircle size={16} className="text-ink-400" />
            </div>
            <div>
              <p className="text-body-m font-semibold text-content-muted">Not listed</p>
              <p className="text-body-s text-content-subtle">Enter manually</p>
            </div>
          </button>
        </div>
      )}
      {showManual && (
        <div className="mt-2 bg-surface-sunken rounded-md p-3 border border-line space-y-2">
          <p className="text-body-s font-semibold text-content-muted">Enter airport manually</p>
          <input type="text" placeholder="3-letter code (e.g. XYZ)"
            value={manualCode}
            onChange={e => setManualCode(e.target.value.toUpperCase().slice(0, 3))}
            maxLength={3} className="input-field py-2 text-body-s font-mono" />
          <input type="text" placeholder="City name" value={manualCity}
            onChange={e => setManualCity(e.target.value)}
            className="input-field py-2 text-body-s" />
          <div className="flex gap-2">
            <button onClick={() => { setShowManual(false); setManualCode(''); setManualCity(''); }}
              className="flex-1 btn-secondary py-2 text-body-s">Cancel</button>
            <button onClick={handleManualSave}
              disabled={!manualCode || manualCode.length < 2 || !manualCity}
              className="flex-1 btn-primary py-2 text-body-s disabled:opacity-50">Confirm</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AirportSearch;
