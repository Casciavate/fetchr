import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Plane, Edit2, Trash2, Plus, AlertTriangle,
  CheckCircle, Weight, DollarSign, X, Save,
  MapPin, ShoppingBag, Calendar
} from 'lucide-react';

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
  'Middle East Airlines': 'ME', 'flyadeal': 'F3', 'WizzAir': 'W6',
  'Vueling': 'VY', 'TAP Air Portugal': 'TP', 'Aer Lingus': 'EI',
  'Norwegian': 'DY', 'Air Asia': 'AK', 'Garuda Indonesia': 'GA',
  'Philippine Airlines': 'PR', 'Vietnam Airlines': 'VN',
};

const <AirlineLogo airline={flight.airline} />
  const code = AIRLINE_CODES[airline];
  if (!code) return (
    <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
      <Plane size={18} className="text-violet-400" />
    </div>
  );
  return (
    <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center overflow-hidden shadow-sm">
      <img
        src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`}
        alt={airline}
        className="w-8 h-8 object-contain"
        onError={e => {
          e.target.style.display = 'none';
          e.target.parentNode.innerHTML = `<span class="text-xs font-bold text-violet-600">${code}</span>`;
        }}
      />
    </div>
  );
};

const CATEGORIES = [
  'Electronics', 'Clothing & Fashion', 'Cosmetics & Beauty',
  'Food & Beverages', 'Books & Stationery', 'Toys & Games',
  'Medical & Pharmacy', 'Jewelry & Accessories', 'Sports & Fitness',
  'Home & Living', 'Documents', 'Other'
];

const MyFlights = ({ session, onAddFlight }) => {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flightStatuses, setFlightStatuses] = useState({});
  const [editingFlight, setEditingFlight] = useState(null);
  const [editForm, setEditForm] = useState({});
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
    if (!error && data) { setFlights(data); await fetchFlightStatuses(data); }
    setLoading(false);
  };

  const fetchFlightStatuses = async (flightList) => {
    const statuses = {};
    for (const flight of flightList) {
      const { data } = await supabase.from('matches').select('status')
        .eq('flight_id', flight.id).in('status', ['accepted', 'in_escrow']).limit(1);
      if (data && data.length > 0) statuses[flight.id] = data[0].status;
    }
    setFlightStatuses(statuses);
  };

  useEffect(() => { fetchFlights(); }, []);

  const hasActiveMatch = (flightId) => !!flightStatuses[flightId];

  const startEditing = (flight) => {
    setEditingFlight(flight.id);
    setEditForm({
      available_kg: flight.available_kg?.toString() || '',
      price_per_kg: flight.price_per_kg?.toString() || '',
      categories: flight.categories || [],
      notes: flight.notes || '',
      delivery_type: flight.delivery_type || 'handover',
      shop_and_ship_fee: flight.shop_and_ship_fee?.toString() || '',
      handover_location_departure: flight.handover_location_departure || '',
      handover_location_arrival: flight.handover_location_arrival || '',
    });
    setError(''); setSuccess('');
  };

  const cancelEditing = () => { setEditingFlight(null); setEditForm({}); setError(''); };

  const saveEdit = async (flightId) => {
    if (!editForm.available_kg || parseFloat(editForm.available_kg) <= 0) { setError('Enter valid weight.'); return; }
    if (!editForm.price_per_kg || parseFloat(editForm.price_per_kg) <= 0) { setError('Enter valid price.'); return; }
    if (editForm.categories.length === 0) { setError('Select at least one category.'); return; }
    setSaving(true); setError('');
    const { error } = await supabase.from('flights').update({
      available_kg: parseFloat(editForm.available_kg),
      price_per_kg: parseFloat(editForm.price_per_kg),
      categories: editForm.categories,
      notes: editForm.notes,
      delivery_type: editForm.delivery_type,
      shop_and_ship_fee: parseFloat(editForm.shop_and_ship_fee) || 0,
      handover_location_departure: editForm.handover_location_departure,
      handover_location_arrival: editForm.handover_location_arrival,
    }).eq('id', flightId);
    if (error) { setError(error.message); } else {
      setSuccess('Flight updated!'); setEditingFlight(null); setEditForm({});
      await fetchFlights(); setTimeout(() => setSuccess(''), 3000);
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
    if (status === 'accepted') return <span className="badge badge-yellow">🤝 Deal Accepted</span>;
    if (flight.status === 'expired') return <span className="badge badge-gray">✈️ Flight Passed</span>;
    return <span className="badge badge-green">✅ Active</span>;
  };

  const daysUntilRemoval = (flight) => {
    return Math.max(0, 5 - Math.floor((new Date() - new Date(flight.flight_date)) / (1000 * 60 * 60 * 24)));
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
          <p className="text-gray-500 text-sm mt-0.5">{flights.length} flight{flights.length !== 1 ? 's' : ''} listed</p>
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
          {flights.map(flight => (
            <div key={flight.id}
              className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden hover:shadow-card-hover transition-all duration-300">

              {/* Header */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <Plane size={22} className="text-violet-600" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-900 tracking-tight">
                        {flight.from_code} → {flight.to_code}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {flight.from_city} → {flight.to_city}
                      </p>
                      <p className="text-xs text-violet-600 font-semibold mt-1">
                        {flight.airline} {flight.flight_number} · {new Date(flight.flight_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(flight)}
                </div>

                {/* Expired notice */}
                {flight.status === 'expired' && (
                  <div className="flex items-start gap-2 bg-amber-50 rounded-xl p-3 mb-4 border border-amber-100">
                    <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      Flight passed. Auto-removes in {daysUntilRemoval(flight)} day{daysUntilRemoval(flight) !== 1 ? 's' : ''}.
                    </p>
                  </div>
                )}

                {/* Active deal warning */}
                {hasActiveMatch(flight.id) && (
                  <div className="flex items-start gap-2 bg-blue-50 rounded-xl p-3 mb-4 border border-blue-100">
                    <AlertTriangle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700">Active deal in progress — cannot delete until complete.</p>
                  </div>
                )}

                {/* View mode */}
                {editingFlight !== flight.id && (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <p className="text-xs text-gray-400 mb-1">Capacity</p>
                        <p className="text-base font-bold text-gray-900">{flight.available_kg}kg</p>
                      </div>
                      <div className="bg-violet-50 rounded-xl p-3 text-center border border-violet-100">
                        <p className="text-xs text-gray-400 mb-1">Price</p>
                        <p className="text-base font-bold text-violet-700">${flight.price_per_kg}/kg</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <p className="text-xs text-gray-400 mb-1">Service</p>
                        <p className="text-base font-bold text-gray-900">
                          {flight.delivery_type === 'both' ? '🛍️' : '🤝'}
                        </p>
                      </div>
                    </div>

                    {flight.categories?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {flight.categories.map(cat => (
                          <span key={cat} className="badge badge-purple">{cat}</span>
                        ))}
                      </div>
                    )}

                    {flight.handover_location_departure && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                        <MapPin size={11} /> Dep: {flight.handover_location_departure}
                      </p>
                    )}
                    {flight.handover_location_arrival && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mb-3">
                        <MapPin size={11} /> Arr: {flight.handover_location_arrival}
                      </p>
                    )}
                    {flight.notes && (
                      <p className="text-xs text-gray-400 italic mb-3">"{flight.notes}"</p>
                    )}

                    <div className="flex gap-2">
                      <button onClick={() => startEditing(flight)}
                        className="flex-1 flex items-center justify-center gap-2 btn-secondary py-2.5 text-sm">
                        <Edit2 size={14} /> Edit
                      </button>
                      <button onClick={() => deleteFlight(flight.id)} disabled={hasActiveMatch(flight.id)}
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
                      <button onClick={cancelEditing} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition">
                        <X size={16} className="text-gray-400" />
                      </button>
                    </div>

                    {error && (
                      <div className="flex items-center gap-2 bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-100">
                        <AlertTriangle size={13} /> {error}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Available kg</label>
                        <div className="relative">
                          <Weight size={13} className="absolute left-3 top-3 text-gray-400" />
                          <input type="number" min="0.5" max="50" step="0.5" value={editForm.available_kg}
                            onChange={e => setEditForm({ ...editForm, available_kg: e.target.value })}
                            className="input-field pl-8 py-2.5" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Price/kg ($)</label>
                        <div className="relative">
                          <DollarSign size={13} className="absolute left-3 top-3 text-gray-400" />
                          <input type="number" min="1" step="0.5" value={editForm.price_per_kg}
                            onChange={e => setEditForm({ ...editForm, price_per_kg: e.target.value })}
                            className="input-field pl-8 py-2.5" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Categories *</label>
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

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Delivery Service</label>
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
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Shop & Ship Fee ($)</label>
                        <div className="relative">
                          <DollarSign size={13} className="absolute left-3 top-3 text-gray-400" />
                          <input type="number" min="0" step="0.5" placeholder="e.g. 15.00" value={editForm.shop_and_ship_fee}
                            onChange={e => setEditForm({ ...editForm, shop_and_ship_fee: e.target.value })}
                            className="input-field pl-8 py-2.5" />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">📍 Departure Handover</label>
                      <input type="text" placeholder="e.g. Dubai Airport T3 departures..." value={editForm.handover_location_departure}
                        onChange={e => setEditForm({ ...editForm, handover_location_departure: e.target.value })}
                        className="input-field py-2.5" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">📍 Arrival Handover</label>
                      <input type="text" placeholder="e.g. Heathrow arrivals hall..." value={editForm.handover_location_arrival}
                        onChange={e => setEditForm({ ...editForm, handover_location_arrival: e.target.value })}
                        className="input-field py-2.5" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Notes</label>
                      <textarea placeholder="Any special conditions..." value={editForm.notes}
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
          ))}
        </div>
      )}
    </div>
  );
};

export default MyFlights;