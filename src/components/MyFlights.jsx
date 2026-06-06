import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Plane, Edit2, Trash2, Plus, AlertTriangle,
  CheckCircle, DollarSign, X, Save,
  MapPin, ShoppingBag, Briefcase, Package, Weight
} from 'lucide-react';

const CATEGORIES = [
  'Electronics', 'Clothing & Fashion', 'Cosmetics & Beauty',
  'Food & Beverages', 'Books & Stationery', 'Toys & Games',
  'Medical & Pharmacy', 'Jewelry & Accessories', 'Sports & Fitness',
  'Home & Living', 'Documents', 'Other'
];

const AIRLINE_CODES = {
  'Emirates': 'EK', 'Qatar Airways': 'QR', 'Etihad Airways': 'EY',
  'Lufthansa': 'LH', 'British Airways': 'BA', 'Air France': 'AF',
  'Turkish Airlines': 'TK', 'Flydubai': 'FZ', 'Air Arabia': 'G9',
  'Singapore Airlines': 'SQ', 'Cathay Pacific': 'CX', 'Qantas': 'QF',
  'American Airlines': 'AA', 'United Airlines': 'UA', 'Delta Air Lines': 'DL',
  'Southwest Airlines': 'WN', 'Ryanair': 'FR', 'easyJet': 'U2',
  'KLM': 'KL', 'Swiss': 'LX', 'Austrian Airlines': 'OS',
  'Finnair': 'AY', 'SAS': 'SK', 'Iberia': 'IB', 'EgyptAir': 'MS',
  'Ethiopian Airlines': 'ET', 'Kenya Airways': 'KQ', 'Saudia': 'SV',
  'Gulf Air': 'GF', 'Oman Air': 'WY', 'Air India': 'AI',
  'Japan Airlines': 'JL', 'Korean Air': 'KE', 'ANA': 'NH',
  'Thai Airways': 'TG', 'Malaysia Airlines': 'MH', 'LATAM': 'LA',
  'Air Canada': 'AC', 'IndiGo': '6E', 'flynas': 'XY',
  'Jazeera Airways': 'J9', 'Pegasus Airlines': 'PC', 'Royal Jordanian': 'RJ',
  'Middle East Airlines': 'ME', 'WizzAir': 'W6', 'Vueling': 'VY',
  'TAP Air Portugal': 'TP', 'Aer Lingus': 'EI', 'Norwegian': 'DY',
  'Air Asia': 'AK', 'Garuda Indonesia': 'GA', 'Philippine Airlines': 'PR',
  'Vietnam Airlines': 'VN', 'China Eastern': 'MU', 'China Southern': 'CZ',
  'Air China': 'CA', 'Hainan Airlines': 'HU', 'SunExpress': 'XQ',
};

const AirlineLogo = ({ airline }) => {
  const code = AIRLINE_CODES[airline];
  if (!code) return (
    <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center flex-shrink-0">
      <Plane size={22} className="text-violet-400" />
    </div>
  );
  return (
    <div className="w-12 h-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0">
      <img
        src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`}
        alt={airline}
        className="w-9 h-9 object-contain"
        onError={e => {
          e.target.style.display = 'none';
          e.target.parentNode.innerHTML = `<span style="font-size:11px;font-weight:800;color:#6c47ff">${code}</span>`;
        }}
      />
    </div>
  );
};

const getLuggageOptions = (flight) => {
  // Try to parse from luggage_options JSONB first
  if (flight.luggage_options && Array.isArray(flight.luggage_options)) {
    return flight.luggage_options;
  }
  // Try to parse from notes field (legacy format)
  if (flight.notes) {
    const match = flight.notes.match(/Luggage options: (\[.*\])/);
    if (match) {
      try { return JSON.parse(match[1]); } catch (e) {}
    }
  }
  // Fall back to single option from main fields
  if (flight.available_kg && flight.price_per_kg) {
    return [{
      type: 'checkin',
      available_kg: flight.available_kg,
      price_per_kg: flight.price_per_kg,
    }];
  }
  return [];
};

const getNetEarnings = (kg, ppk) => {
  if (!kg || !ppk) return null;
  const gross = parseFloat(kg) * parseFloat(ppk);
  let pct = 0.10;
  if (gross >= 500) pct = 0.07;
  else if (gross >= 200) pct = 0.085;
  else if (gross < 20 && gross > 0) pct = 0.12;
  return { gross, net: gross * (1 - pct), fee: gross * pct, pct: Math.round(pct * 100) };
};

const LuggageEditCard = ({ opt, index, onChange, onRemove }) => {
  const isCarryOn = opt.type === 'carry_on';
  const earnings = getNetEarnings(opt.available_kg, opt.price_per_kg);

  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${
      isCarryOn ? 'border-blue-200 bg-blue-50/30' : 'border-emerald-200 bg-emerald-50/30'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isCarryOn
            ? <Briefcase size={16} className="text-blue-600" />
            : <Package size={16} className="text-emerald-600" />
          }
          <p className="text-sm font-bold text-gray-900">
            {isCarryOn ? '✈️ Hand Luggage' : '🧳 Check-in Luggage'}
          </p>
        </div>
        <button onClick={() => onRemove(index)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition">
          <X size={14} className="text-red-400" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
            kg available
          </label>
          <div className="relative">
            <Weight size={13} className="absolute left-3 top-3 text-gray-400 pointer-events-none" />
            <input type="number" min="0.5"
              max={isCarryOn ? '10' : '32'} step="0.5"
              value={opt.available_kg}
              onChange={e => onChange(index, { ...opt, available_kg: e.target.value })}
              className="input-field pl-8 py-2.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
            Price/kg ($)
          </label>
          <div className="relative">
            <DollarSign size={13} className="absolute left-3 top-3 text-gray-400 pointer-events-none" />
            <input type="number" min="1" step="0.5"
              value={opt.price_per_kg}
              onChange={e => onChange(index, { ...opt, price_per_kg: e.target.value })}
              className="input-field pl-8 py-2.5 text-sm" />
          </div>
        </div>
      </div>

      {earnings && (
        <div className="bg-white rounded-lg p-2.5 text-xs space-y-1 border border-gray-100">
          <div className="flex justify-between text-gray-500">
            <span>Gross</span><span>${earnings.gross.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-red-400">
            <span>Fetchr fee ({earnings.pct}%)</span>
            <span>-${earnings.fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-emerald-600 border-t border-gray-100 pt-1">
            <span>Net earnings</span><span>${earnings.net.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const MyFlights = ({ session, onAddFlight }) => {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flightStatuses, setFlightStatuses] = useState({});
  const [editingFlight, setEditingFlight] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editLuggage, setEditLuggage] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchFlights = async () => {
    setLoading(true);
    await supabase.rpc('expire_old_flights');
    const { data, error } = await supabase
      .from('flights').select('*').eq('user_id', session.user.id)
      .in('status', ['active', 'expired'])
      .order('flight_date', { ascending: true });
    if (!error && data) {
      setFlights(data);
      await fetchFlightStatuses(data);
    }
    setLoading(false);
  };

  const fetchFlightStatuses = async (flightList) => {
    const statuses = {};
    for (const flight of flightList) {
      const { data } = await supabase.from('matches').select('status')
        .eq('flight_id', flight.id)
        .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
        .limit(1);
      if (data && data.length > 0) statuses[flight.id] = data[0].status;
    }
    setFlightStatuses(statuses);
  };

  useEffect(() => { fetchFlights(); }, []);

  const hasActiveMatch = (flightId) => !!flightStatuses[flightId];

  const startEditing = (flight) => {
    setEditingFlight(flight.id);
    const luggageOpts = getLuggageOptions(flight);
    setEditLuggage(luggageOpts.map(l => ({ ...l })));
    setEditForm({
      categories: flight.categories || [],
      notes: (flight.notes || '').replace(/\nLuggage options:.*$/s, '').trim(),
      delivery_type: flight.delivery_type || 'handover',
      shop_and_ship_fee: flight.shop_and_ship_fee?.toString() || '',
      handover_location_departure: flight.handover_location_departure || '',
      handover_location_arrival: flight.handover_location_arrival || '',
    });
    setError(''); setSuccess('');
  };

  const cancelEditing = () => {
    setEditingFlight(null); setEditForm({}); setEditLuggage([]); setError('');
  };

  const addLuggageOption = (type) => {
    const alreadyHas = editLuggage.some(l => l.type === type);
    if (alreadyHas) return;
    setEditLuggage(prev => [...prev, { type, available_kg: '', price_per_kg: '' }]);
  };

  const updateLuggageOption = (index, data) => {
    setEditLuggage(prev => prev.map((l, i) => i === index ? data : l));
  };

  const removeLuggageOption = (index) => {
    setEditLuggage(prev => prev.filter((_, i) => i !== index));
  };

  const saveEdit = async (flightId) => {
    if (editLuggage.length === 0) { setError('Add at least one luggage option.'); return; }
    for (const opt of editLuggage) {
      if (!opt.available_kg || parseFloat(opt.available_kg) <= 0) {
        setError(`Enter valid kg for ${opt.type === 'carry_on' ? 'hand luggage' : 'check-in'}.`); return;
      }
      if (!opt.price_per_kg || parseFloat(opt.price_per_kg) <= 0) {
        setError(`Enter valid price for ${opt.type === 'carry_on' ? 'hand luggage' : 'check-in'}.`); return;
      }
    }
    if (editForm.categories.length === 0) { setError('Select at least one category.'); return; }

    setSaving(true); setError('');

    const primary = editLuggage[0];
    const luggageJson = JSON.stringify(editLuggage.map(l => ({
      type: l.type,
      available_kg: parseFloat(l.available_kg),
      price_per_kg: parseFloat(l.price_per_kg),
    })));

    const totalKg = editLuggage.reduce((s, l) => s + parseFloat(l.available_kg || 0), 0);

    const { error } = await supabase.from('flights').update({
      available_kg: totalKg,
      price_per_kg: parseFloat(primary.price_per_kg),
      luggage_options: editLuggage.map(l => ({
        type: l.type,
        available_kg: parseFloat(l.available_kg),
        price_per_kg: parseFloat(l.price_per_kg),
      })),
      categories: editForm.categories,
      notes: [editForm.notes, `Luggage options: ${luggageJson}`].filter(Boolean).join('\n'),
      delivery_type: editForm.delivery_type,
      shop_and_ship_fee: parseFloat(editForm.shop_and_ship_fee) || 0,
      handover_location_departure: editForm.handover_location_departure,
      handover_location_arrival: editForm.handover_location_arrival,
    }).eq('id', flightId);

    if (error) { setError(error.message); } else {
      setSuccess('Flight updated!');
      setEditingFlight(null); setEditForm({}); setEditLuggage([]);
      await fetchFlights();
      setTimeout(() => setSuccess(''), 3000);
    }
    setSaving(false);
  };

  const deleteFlight = async (flightId) => {
    if (hasActiveMatch(flightId)) { alert('Cannot delete a flight with an active deal.'); return; }
    if (!window.confirm('Delete this flight? This cannot be undone.')) return;
    const { error } = await supabase.from('flights').delete().eq('id', flightId);
    if (!error) setFlights(prev => prev.filter(f => f.id !== flightId));
  };

  const toggleCategory = (cat) => {
    setEditForm(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const getStatusBadge = (flight) => {
    const status = flightStatuses[flight.id];
    if (status === 'in_escrow') return <span className="badge badge-blue">🔒 Escrow Active</span>;
    if (status === 'proof_uploaded') return <span className="badge badge-purple">📸 Proof Uploaded</span>;
    if (status === 'terms_agreed') return <span className="badge badge-yellow">✅ Terms Agreed</span>;
    if (status === 'accepted') return <span className="badge badge-yellow">🤝 Deal Active</span>;
    if (flight.status === 'expired') return <span className="badge badge-gray">✈️ Flight Passed</span>;
    return <span className="badge badge-green">✅ Active</span>;
  };

  const daysUntilRemoval = (flight) => {
    return Math.max(0, 5 - Math.floor(
      (new Date() - new Date(flight.flight_date)) / (1000 * 60 * 60 * 24)
    ));
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
          <h1 className="text-2xl font-bold text-gray-900">My Flights</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {flights.length} flight{flights.length !== 1 ? 's' : ''} listed
          </p>
        </div>
        <button onClick={onAddFlight} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Flight
        </button>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
          <CheckCircle size={16} /> {success}
        </div>
      )}

      {flights.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl shadow-card border border-gray-100/80">
          <div className="w-20 h-20 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Plane size={32} className="text-violet-300" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">No flights listed yet</h2>
          <p className="text-gray-400 text-sm mb-6">Add your upcoming flights to start earning</p>
          <button onClick={onAddFlight} className="btn-primary">+ Add Your First Flight</button>
        </div>
      ) : (
        <div className="space-y-4">
          {flights.map(flight => {
            const luggageOpts = getLuggageOptions(flight);
            const totalKg = luggageOpts.reduce((s, l) => s + parseFloat(l.available_kg || 0), 0);
            const totalNet = luggageOpts.reduce((s, l) => {
              const e = getNetEarnings(l.available_kg, l.price_per_kg);
              return s + (e?.net || 0);
            }, 0);

            return (
              <div key={flight.id}
                className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden hover:shadow-card-hover transition-all duration-300">
                <div className="p-5">

                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <AirlineLogo airline={flight.airline} />
                      <div>
                        <p className="text-xl font-bold text-gray-900 tracking-tight">
                          {flight.from_code} → {flight.to_code}
                        </p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {flight.from_city} → {flight.to_city}
                        </p>
                        <p className="text-xs text-violet-600 font-semibold mt-1">
                          {flight.airline}
                          {flight.flight_number ? ` · ${flight.flight_number}` : ''} ·{' '}
                          {new Date(flight.flight_date).toLocaleDateString('en-GB', {
                            day: '2-digit', month: '2-digit', year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(flight)}
                  </div>

                  {flight.status === 'expired' && (
                    <div className="flex items-start gap-2 bg-amber-50 rounded-xl p-3 mb-4 border border-amber-100">
                      <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">
                        Flight passed. Auto-removes in {daysUntilRemoval(flight)} day{daysUntilRemoval(flight) !== 1 ? 's' : ''}.
                      </p>
                    </div>
                  )}

                  {hasActiveMatch(flight.id) && (
                    <div className="flex items-start gap-2 bg-blue-50 rounded-xl p-3 mb-4 border border-blue-100">
                      <AlertTriangle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-700">
                        Active deal in progress — cannot delete until complete.
                      </p>
                    </div>
                  )}

                  {/* View mode */}
                  {editingFlight !== flight.id && (
                    <>
                      {/* Luggage options display */}
                      <div className="space-y-2 mb-4">
                        {luggageOpts.map((opt, i) => {
                          const e = getNetEarnings(opt.available_kg, opt.price_per_kg);
                          const isCarryOn = opt.type === 'carry_on';
                          return (
                            <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${
                              isCarryOn ? 'bg-blue-50 border-blue-100' : 'bg-emerald-50 border-emerald-100'
                            }`}>
                              <div className="flex items-center gap-2">
                                {isCarryOn
                                  ? <Briefcase size={15} className="text-blue-600" />
                                  : <Package size={15} className="text-emerald-600" />
                                }
                                <div>
                                  <p className="text-xs font-bold text-gray-800">
                                    {isCarryOn ? '✈️ Hand Luggage' : '🧳 Check-in Luggage'}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {opt.available_kg}kg @ ${opt.price_per_kg}/kg
                                  </p>
                                </div>
                              </div>
                              {e && (
                                <div className="text-right">
                                  <p className="text-xs font-bold text-emerald-600">${e.net.toFixed(2)}</p>
                                  <p className="text-xs text-gray-400">net ({e.pct}% fee)</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Total if multiple options */}
                      {luggageOpts.length > 1 && (
                        <div className="flex items-center justify-between bg-violet-50 rounded-xl p-3 mb-4 border border-violet-100">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-violet-700">Total if fully booked</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-violet-700">{totalKg.toFixed(1)}kg</p>
                            <p className="text-xs text-emerald-600 font-semibold">
                              Net: ${totalNet.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Categories */}
                      {flight.categories?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {flight.categories.map(cat => (
                            <span key={cat} className="badge badge-purple">{cat}</span>
                          ))}
                        </div>
                      )}

                      {/* Handover locations */}
                      {flight.handover_location_departure && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                          <MapPin size={11} /> Dep: {flight.handover_location_departure}
                        </p>
                      )}
                      {flight.handover_location_arrival && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                          <MapPin size={11} /> Arr: {flight.handover_location_arrival}
                        </p>
                      )}

                      {/* Delivery type */}
                      {flight.delivery_type === 'both' && (
                        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 rounded-xl px-3 py-2 mb-3 border border-blue-100 text-xs font-semibold">
                          <ShoppingBag size={12} /> Shop & Ship available
                          {flight.shop_and_ship_fee > 0 ? ` · $${flight.shop_and_ship_fee} service fee` : ''}
                        </div>
                      )}

                      {/* Notes (cleaned) */}
                      {editForm.notes && (
                        <p className="text-xs text-gray-400 italic mb-3">"{editForm.notes}"</p>
                      )}

                      <div className="flex gap-2 mt-4">
                        <button onClick={() => startEditing(flight)}
                          className="flex-1 flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm">
                          <Edit2 size={14} /> Edit
                        </button>
                        <button onClick={() => deleteFlight(flight.id)}
                          disabled={hasActiveMatch(flight.id)}
                          className="flex-1 flex items-center justify-center gap-2 border border-red-100 text-red-400 rounded-xl py-2.5 text-sm font-semibold hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed">
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </>
                  )}

                  {/* Edit mode */}
                  {editingFlight === flight.id && (
                    <div className="border-t border-gray-100 pt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-900">Edit Flight</p>
                        <button onClick={cancelEditing}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition">
                          <X size={16} className="text-gray-400" />
                        </button>
                      </div>

                      {error && (
                        <div className="flex items-center gap-2 bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-100">
                          <AlertTriangle size={13} /> {error}
                        </div>
                      )}

                      {/* Luggage options editing */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                          Luggage Options
                        </p>

                        {/* Add buttons */}
                        <div className="flex gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => addLuggageOption('carry_on')}
                            disabled={editLuggage.some(l => l.type === 'carry_on')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                              editLuggage.some(l => l.type === 'carry_on')
                                ? 'border-blue-300 bg-blue-50 text-blue-700 cursor-default'
                                : 'border-dashed border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50'
                            }`}>
                            {editLuggage.some(l => l.type === 'carry_on')
                              ? <CheckCircle size={13} />
                              : <Plus size={13} />
                            }
                            <Briefcase size={13} /> Hand Luggage
                          </button>
                          <button
                            type="button"
                            onClick={() => addLuggageOption('checkin')}
                            disabled={editLuggage.some(l => l.type === 'checkin')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                              editLuggage.some(l => l.type === 'checkin')
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 cursor-default'
                                : 'border-dashed border-emerald-200 text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50'
                            }`}>
                            {editLuggage.some(l => l.type === 'checkin')
                              ? <CheckCircle size={13} />
                              : <Plus size={13} />
                            }
                            <Package size={13} /> Check-in
                          </button>
                        </div>

                        <div className="space-y-3">
                          {editLuggage.map((opt, i) => (
                            <LuggageEditCard
                              key={i}
                              opt={opt}
                              index={i}
                              onChange={updateLuggageOption}
                              onRemove={removeLuggageOption}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Categories */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                          Categories *
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {CATEGORIES.map(cat => (
                            <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                editForm.categories?.includes(cat)
                                  ? 'bg-violet-600 text-white border-violet-600'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                              }`}>
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Delivery type */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                          Delivery Service
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 'handover', label: '🤝 Handover Only' },
                            { value: 'both', label: '🛍️ + Shop & Ship' },
                          ].map(opt => (
                            <button key={opt.value} type="button"
                              onClick={() => setEditForm({ ...editForm, delivery_type: opt.value })}
                              className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                                editForm.delivery_type === opt.value
                                  ? 'border-violet-400 bg-violet-50 text-violet-700'
                                  : 'border-gray-200 text-gray-600 hover:border-violet-200'
                              }`}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {editForm.delivery_type === 'both' && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                            Shop & Ship Fee ($)
                          </label>
                          <div className="relative">
                            <DollarSign size={13} className="absolute left-3 top-3 text-gray-400 pointer-events-none" />
                            <input type="number" min="0" step="0.5"
                              placeholder="e.g. 15.00" value={editForm.shop_and_ship_fee}
                              onChange={e => setEditForm({ ...editForm, shop_and_ship_fee: e.target.value })}
                              className="input-field pl-8 py-2.5" />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                          📍 Departure Handover
                        </label>
                        <input type="text"
                          placeholder="e.g. Dubai Airport T3 departures..."
                          value={editForm.handover_location_departure}
                          onChange={e => setEditForm({ ...editForm, handover_location_departure: e.target.value })}
                          className="input-field py-2.5" />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                          📍 Arrival Handover
                        </label>
                        <input type="text"
                          placeholder="e.g. Heathrow arrivals hall..."
                          value={editForm.handover_location_arrival}
                          onChange={e => setEditForm({ ...editForm, handover_location_arrival: e.target.value })}
                          className="input-field py-2.5" />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                          Notes
                        </label>
                        <textarea placeholder="Any special conditions..."
                          value={editForm.notes}
                          onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                          rows={2} className="input-field resize-none py-2.5" />
                      </div>

                      <div className="flex gap-2">
                        <button onClick={cancelEditing}
                          className="flex-1 btn-secondary flex items-center justify-center gap-2 py-2.5">
                          <X size={14} /> Cancel
                        </button>
                        <button onClick={() => saveEdit(flight.id)} disabled={saving}
                          className="flex-[2] btn-primary flex items-center justify-center gap-2 py-2.5 disabled:opacity-50">
                          <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyFlights;