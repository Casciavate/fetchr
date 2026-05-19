import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, Trash2, Plus, AlertTriangle, CheckCircle,
  MapPin, Weight, DollarSign, Calendar, ShoppingBag, Link
} from 'lucide-react';

const AIRPORTS = [
  { code: 'DXB', city: 'Dubai', name: 'Dubai International', country: 'UAE' },
  { code: 'AUH', city: 'Abu Dhabi', name: 'Zayed International', country: 'UAE' },
  { code: 'DOH', city: 'Doha', name: 'Hamad International', country: 'Qatar' },
  { code: 'LHR', city: 'London', name: 'Heathrow', country: 'UK' },
  { code: 'LGW', city: 'London', name: 'Gatwick', country: 'UK' },
  { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle', country: 'France' },
  { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt Airport', country: 'Germany' },
  { code: 'AMS', city: 'Amsterdam', name: 'Schiphol', country: 'Netherlands' },
  { code: 'MAD', city: 'Madrid', name: 'Adolfo Suarez Barajas', country: 'Spain' },
  { code: 'BCN', city: 'Barcelona', name: 'El Prat', country: 'Spain' },
  { code: 'FCO', city: 'Rome', name: 'Fiumicino', country: 'Italy' },
  { code: 'MXP', city: 'Milan', name: 'Malpensa', country: 'Italy' },
  { code: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Turkey' },
  { code: 'ATH', city: 'Athens', name: 'Eleftherios Venizelos', country: 'Greece' },
  { code: 'JFK', city: 'New York', name: 'John F Kennedy', country: 'USA' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', country: 'USA' },
  { code: 'ORD', city: 'Chicago', name: 'O Hare International', country: 'USA' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco International', country: 'USA' },
  { code: 'MIA', city: 'Miami', name: 'Miami International', country: 'USA' },
  { code: 'YYZ', city: 'Toronto', name: 'Pearson International', country: 'Canada' },
  { code: 'SIN', city: 'Singapore', name: 'Changi Airport', country: 'Singapore' },
  { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi', country: 'Thailand' },
  { code: 'KUL', city: 'Kuala Lumpur', name: 'KLIA', country: 'Malaysia' },
  { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong International', country: 'Hong Kong' },
  { code: 'NRT', city: 'Tokyo', name: 'Narita International', country: 'Japan' },
  { code: 'ICN', city: 'Seoul', name: 'Incheon International', country: 'South Korea' },
  { code: 'SYD', city: 'Sydney', name: 'Kingsford Smith', country: 'Australia' },
  { code: 'MEL', city: 'Melbourne', name: 'Melbourne Airport', country: 'Australia' },
  { code: 'DEL', city: 'New Delhi', name: 'Indira Gandhi International', country: 'India' },
  { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj', country: 'India' },
  { code: 'JNB', city: 'Johannesburg', name: 'OR Tambo International', country: 'South Africa' },
  { code: 'CAI', city: 'Cairo', name: 'Cairo International', country: 'Egypt' },
  { code: 'RUH', city: 'Riyadh', name: 'King Khalid International', country: 'Saudi Arabia' },
  { code: 'JED', city: 'Jeddah', name: 'King Abdulaziz International', country: 'Saudi Arabia' },
  { code: 'MCT', city: 'Muscat', name: 'Muscat International', country: 'Oman' },
  { code: 'KWI', city: 'Kuwait City', name: 'Kuwait International', country: 'Kuwait' },
  { code: 'BAH', city: 'Manama', name: 'Bahrain International', country: 'Bahrain' },
  { code: 'AMM', city: 'Amman', name: 'Queen Alia International', country: 'Jordan' },
  { code: 'BEY', city: 'Beirut', name: 'Rafic Hariri International', country: 'Lebanon' },
  { code: 'GRU', city: 'Sao Paulo', name: 'Guarulhos International', country: 'Brazil' },
  { code: 'EZE', city: 'Buenos Aires', name: 'Ministro Pistarini', country: 'Argentina' },
  { code: 'LIM', city: 'Lima', name: 'Jorge Chavez International', country: 'Peru' },
  { code: 'ISB', city: 'Islamabad', name: 'New Islamabad International', country: 'Pakistan' },
  { code: 'LHE', city: 'Lahore', name: 'Allama Iqbal International', country: 'Pakistan' },
  { code: 'KHI', city: 'Karachi', name: 'Jinnah International', country: 'Pakistan' },
  { code: 'DAC', city: 'Dhaka', name: 'Hazrat Shahjalal International', country: 'Bangladesh' },
  { code: 'CMB', city: 'Colombo', name: 'Bandaranaike International', country: 'Sri Lanka' },
  { code: 'OTHER', city: 'Other', name: 'Not listed — enter manually', country: '' },
];

const AirportSearch = ({ label, value, onChange, placeholder }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualCity, setManualCity] = useState('');
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (value?.code && value.code !== 'OTHER') setQuery(`${value.city} (${value.code})`);
  }, [value]);

  React.useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearch = (q) => {
    setQuery(q);
    if (q.length < 1) { setResults([]); setOpen(false); return; }
    const filtered = AIRPORTS.filter(a =>
      a.city.toLowerCase().includes(q.toLowerCase()) ||
      a.code.toLowerCase().includes(q.toLowerCase()) ||
      a.name.toLowerCase().includes(q.toLowerCase()) ||
      a.country.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 8);
    setResults(filtered);
    setOpen(true);
  };

  const handleSelect = (airport) => {
    if (airport.code === 'OTHER') {
      setShowManual(true);
      setOpen(false);
      setQuery('Other (manual entry)');
      return;
    }
    setQuery(`${airport.city} (${airport.code})`);
    setOpen(false);
    setResults([]);
    setShowManual(false);
    onChange(airport);
  };

  const handleManualSave = () => {
    if (!manualCode || !manualCity) return;
    onChange({ code: manualCode.toUpperCase(), city: manualCity, name: manualCity, country: 'Other' });
    setQuery(`${manualCity} (${manualCode.toUpperCase()})`);
    setShowManual(false);
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <MapPin size={15} className="absolute left-3.5 top-3.5 text-gray-400" />
        <input type="text" value={query} onChange={e => handleSearch(e.target.value)}
          onFocus={() => query.length > 0 && results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="input-field pl-9" />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {results.map(airport => (
            <button key={airport.code} type="button" onClick={() => handleSelect(airport)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50 text-left transition border-b border-gray-50 last:border-0">
              <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-violet-600">{airport.code}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{airport.city}</p>
                <p className="text-xs text-gray-400 truncate">{airport.name}{airport.country ? ` · ${airport.country}` : ''}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {showManual && (
        <div className="mt-2 bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-2">
          <p className="text-xs font-semibold text-gray-600">Enter airport details manually</p>
          <input type="text" placeholder="Airport code (e.g. XYZ)" value={manualCode}
            onChange={e => setManualCode(e.target.value.toUpperCase())} maxLength={3}
            className="input-field py-2 text-sm uppercase" />
          <input type="text" placeholder="City name" value={manualCity}
            onChange={e => setManualCity(e.target.value)}
            className="input-field py-2 text-sm" />
          <button onClick={handleManualSave}
            className="w-full btn-primary py-2 text-xs">Confirm</button>
        </div>
      )}
    </div>
  );
};

const MyRequests = ({ session, onNewRequest }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestStatuses, setRequestStatuses] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState('');

  const fetchRequests = async () => {
    setLoading(true);
    await supabase.rpc('expire_old_flights');
    const { data, error } = await supabase
      .from('shipment_requests').select('*').eq('user_id', session.user.id)
      .in('status', ['open', 'matched']).order('created_at', { ascending: false });
    if (!error && data) { setRequests(data); await fetchStatuses(data); }
    setLoading(false);
  };

  const fetchStatuses = async (reqs) => {
    const statuses = {};
    for (const req of reqs) {
      const { data } = await supabase.from('matches').select('status')
        .eq('request_id', req.id).in('status', ['accepted', 'in_escrow']).limit(1);
      if (data && data.length > 0) statuses[req.id] = data[0].status;
    }
    setRequestStatuses(statuses);
  };

  useEffect(() => { fetchRequests(); }, []);

  const hasActiveMatch = (id) => !!requestStatuses[id];

  const deleteRequest = async (id) => {
    if (hasActiveMatch(id)) { alert('Cannot delete a request with an active deal.'); return; }
    if (!window.confirm('Delete this request?')) return;
    const { error } = await supabase.from('shipment_requests').delete().eq('id', id);
    if (!error) setRequests(prev => prev.filter(r => r.id !== id));
  };

  const getStatusBadge = (req) => {
    const status = requestStatuses[req.id];
    if (status === 'in_escrow') return <span className="badge badge-blue">🔒 Escrow Active</span>;
    if (status === 'accepted') return <span className="badge badge-yellow">🤝 Deal Accepted</span>;
    return <span className="badge badge-green">✅ Open</span>;
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Requests</h1>
          <p className="text-gray-500 text-sm mt-0.5">{requests.length} active request{requests.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onNewRequest} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Request
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl shadow-card border border-gray-100/80">
          <div className="w-20 h-20 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package size={32} className="text-violet-300" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">No requests yet</h2>
          <p className="text-gray-400 text-sm mb-6">Post a shipment request to find a traveler</p>
          <button onClick={onNewRequest} className="btn-primary">+ Post First Request</button>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(req => {
            const isExpanded = expandedId === req.id;
            const hasMatch = hasActiveMatch(req.id);

            return (
              <div key={req.id}
                className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden hover:shadow-card-hover transition-all duration-300">

                {/* Main content */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      {req.item_photo_url ? (
                        <img src={req.item_photo_url} alt={req.item_name}
                          className="w-14 h-14 rounded-xl object-cover border border-gray-100 flex-shrink-0" />
                      ) : (
                        <div className="w-14 h-14 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Package size={22} className="text-violet-400" />
                        </div>
                      )}
                      <div>
                        <p className="text-lg font-bold text-gray-900">{req.item_name}</p>
                        <p className="text-sm text-gray-400 mt-0.5">{req.category}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="badge badge-gray text-xs">
                            {req.from_code} → {req.to_code}
                          </span>
                          {req.requires_purchase && (
                            <span className="badge badge-blue text-xs">
                              <ShoppingBag size={9} /> Shop & Ship
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {getStatusBadge(req)}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">Weight</p>
                      <p className="text-base font-bold text-gray-900">{req.weight_kg}kg</p>
                    </div>
                    <div className="bg-violet-50 rounded-xl p-3 text-center border border-violet-100">
                      <p className="text-xs text-gray-400 mb-1">Budget</p>
                      <p className="text-base font-bold text-violet-700">${req.budget_per_kg}/kg</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">Total</p>
                      <p className="text-base font-bold text-gray-900">${(req.weight_kg * req.budget_per_kg).toFixed(0)}</p>
                    </div>
                  </div>

                  {hasMatch && (
                    <div className="flex items-start gap-2 bg-blue-50 rounded-xl p-3 mb-4 border border-blue-100">
                      <AlertTriangle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-700">Active deal in progress — cannot delete until complete.</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      className="flex-1 btn-secondary py-2.5 text-sm">
                      {isExpanded ? 'Hide Details' : 'View Details'}
                    </button>
                    <button onClick={() => deleteRequest(req.id)} disabled={hasMatch}
                      className="flex-1 flex items-center justify-center gap-2 border border-red-100 text-red-400 rounded-xl py-2.5 text-sm font-semibold hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/50">

                    {req.description && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Description</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{req.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl p-3 border border-gray-100">
                        <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><MapPin size={10} /> Route</p>
                        <p className="text-sm font-bold text-gray-900">{req.from_code} → {req.to_code}</p>
                      </div>
                      {req.needed_by && (
                        <div className="bg-white rounded-xl p-3 border border-gray-100">
                          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Calendar size={10} /> Needed by</p>
                          <p className="text-sm font-bold text-gray-900">
                            {new Date(req.needed_by).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      )}
                    </div>

                    {req.notes && (
                      <div className="bg-white rounded-xl p-3 border border-gray-100">
                        <p className="text-xs text-gray-400 mb-1">Notes</p>
                        <p className="text-sm text-gray-700 italic">"{req.notes}"</p>
                      </div>
                    )}

                    {/* Shop & Ship details */}
                    {req.requires_purchase && (
                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <p className="text-xs font-bold text-blue-700 mb-3 flex items-center gap-1.5">
                          <ShoppingBag size={13} /> Shop & Ship Purchase Details
                        </p>
                        <div className="space-y-2">
                          {req.purchase_store && (
                            <div className="flex items-start gap-2">
                              <MapPin size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs text-blue-500">Store</p>
                                <p className="text-sm font-semibold text-gray-800">{req.purchase_store}</p>
                              </div>
                            </div>
                          )}
                          {req.purchase_price && (
                            <div className="flex items-start gap-2">
                              <DollarSign size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs text-blue-500">Expected price</p>
                                <p className="text-sm font-semibold text-gray-800">${parseFloat(req.purchase_price).toFixed(2)}</p>
                              </div>
                            </div>
                          )}
                          {req.purchase_url && (
                            <div className="flex items-start gap-2">
                              <Link size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs text-blue-500">Product link</p>
                                <a href={req.purchase_url} target="_blank" rel="noreferrer"
                                  className="text-sm font-semibold text-violet-600 hover:text-violet-700 underline truncate block max-w-xs">
                                  {req.purchase_url}
                                </a>
                              </div>
                            </div>
                          )}
                          {req.purchase_details && (
                            <div className="bg-white rounded-lg p-3 mt-1">
                              <p className="text-xs text-blue-500 mb-1">Additional details</p>
                              <p className="text-xs text-gray-700 leading-relaxed">{req.purchase_details}</p>
                            </div>
                          )}
                          <div className="bg-white rounded-xl p-3 mt-2 space-y-1.5 text-xs border border-blue-100">
                            <p className="font-bold text-gray-700 mb-1">Estimated Total Escrow</p>
                            <div className="flex justify-between text-gray-500">
                              <span>Shipping ({req.weight_kg}kg × ${req.budget_per_kg})</span>
                              <span>${(req.weight_kg * req.budget_per_kg).toFixed(2)}</span>
                            </div>
                            {req.purchase_price && (
                              <div className="flex justify-between text-gray-500">
                                <span>Item purchase price</span>
                                <span>${parseFloat(req.purchase_price).toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-bold text-violet-700 border-t border-gray-100 pt-1.5">
                              <span>Total estimate</span>
                              <span>~${(req.weight_kg * req.budget_per_kg + (parseFloat(req.purchase_price) || 0)).toFixed(2)}+</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-gray-400">
                      Posted {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyRequests;