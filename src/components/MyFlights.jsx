import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Plane, Edit2, Trash2, Plus, AlertTriangle,
  CheckCircle, Calendar, Weight, DollarSign, Tag, X, Save
} from 'lucide-react';

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
      .from('flights')
      .select('*')
      .eq('user_id', session.user.id)
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
      const { data } = await supabase
        .from('matches')
        .select('status')
        .eq('flight_id', flight.id)
        .in('status', ['accepted', 'in_escrow'])
        .limit(1);
      if (data && data.length > 0) {
        statuses[flight.id] = data[0].status;
      }
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
    setError('');
    setSuccess('');
  };

  const cancelEditing = () => {
    setEditingFlight(null);
    setEditForm({});
    setError('');
  };

  const saveEdit = async (flightId) => {
    if (!editForm.available_kg || parseFloat(editForm.available_kg) <= 0) {
      setError('Please enter valid available weight.');
      return;
    }
    if (!editForm.price_per_kg || parseFloat(editForm.price_per_kg) <= 0) {
      setError('Please enter valid price per kg.');
      return;
    }
    if (editForm.categories.length === 0) {
      setError('Please select at least one category.');
      return;
    }

    setSaving(true);
    setError('');

    const { error } = await supabase
      .from('flights')
      .update({
        available_kg: parseFloat(editForm.available_kg),
        price_per_kg: parseFloat(editForm.price_per_kg),
        categories: editForm.categories,
        notes: editForm.notes,
        delivery_type: editForm.delivery_type,
        shop_and_ship_fee: parseFloat(editForm.shop_and_ship_fee) || 0,
        handover_location_departure: editForm.handover_location_departure,
        handover_location_arrival: editForm.handover_location_arrival,
      })
      .eq('id', flightId);

    if (error) {
      setError(error.message);
    } else {
      setSuccess('Flight updated successfully!');
      setEditingFlight(null);
      setEditForm({});
      await fetchFlights();
      setTimeout(() => setSuccess(''), 3000);
    }
    setSaving(false);
  };

  const deleteFlight = async (flightId) => {
    if (hasActiveMatch(flightId)) {
      alert('Cannot delete a flight with an active deal or escrow. Please wait for the deal to complete or be cancelled first.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this flight? This cannot be undone.')) return;

    const { error } = await supabase.from('flights').delete().eq('id', flightId);
    if (!error) {
      setFlights(prev => prev.filter(f => f.id !== flightId));
    }
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
    if (status === 'in_escrow') return (
      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-600">
        🔒 Escrow Active
      </span>
    );
    if (status === 'accepted') return (
      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-yellow-50 text-yellow-600">
        🤝 Deal Accepted
      </span>
    );
    if (flight.status === 'expired') return (
      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-500">
        ✈️ Flight Passed
      </span>
    );
    return (
      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-600">
        ✅ Active
      </span>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-gray-400 text-sm">Loading your flights...</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 md:px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">My Flights</h1>
          <p className="text-gray-400 text-sm mt-1">{flights.length} flight{flights.length !== 1 ? 's' : ''} listed</p>
        </div>
        <button
          onClick={onAddFlight}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700 transition"
        >
          <Plus size={16} /> Add Flight
        </button>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-100 text-green-700 text-sm px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
          <CheckCircle size={16} /> {success}
        </div>
      )}

      {flights.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plane size={36} className="text-purple-300" />
          </div>
          <h2 className="text-lg font-bold text-gray-700 mb-2">No flights listed yet</h2>
          <p className="text-gray-400 text-sm mb-6">Add your upcoming flights to start earning</p>
          <button onClick={onAddFlight}
            className="bg-purple-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-purple-700 transition">
            + Add Your First Flight
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {flights.map(flight => (
            <div key={flight.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Flight Header */}
              <div className="p-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Plane size={22} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 text-lg">
                      {flight.from_code} → {flight.to_code}
                    </p>
                    <p className="text-sm text-gray-500">
                      {flight.from_city} → {flight.to_city}
                    </p>
                    <p className="text-xs text-purple-600 font-semibold mt-0.5">
                      {flight.airline} {flight.flight_number} •{' '}
                      {new Date(flight.flight_date).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(flight)}
                </div>
              </div>

              {/* Flight expired notice */}
              {flight.status === 'expired' && (
                <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl p-3 text-xs bg-gray-50 text-gray-500">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-yellow-500" />
                  <p>
                    This flight has passed. It will be automatically removed in{' '}
                    {Math.max(0, 5 - Math.floor((new Date() - new Date(flight.flight_date)) / (1000 * 60 * 60 * 24)))} day(s).
                    You can still edit the details if anything changed.
                  </p>
                </div>
              )}

              {/* Active deal warning */}
              {hasActiveMatch(flight.id) && (
                <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl p-3 text-xs bg-yellow-50 text-yellow-700">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <p>This flight has an active deal. You cannot delete it until the deal is completed or cancelled.</p>
                </div>
              )}

              {/* Flight Details — view mode */}
              {editingFlight !== flight.id && (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">Available</p>
                      <p className="text-sm font-bold text-gray-800">{flight.available_kg}kg</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">Price</p>
                      <p className="text-sm font-bold text-purple-600">${flight.price_per_kg}/kg</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">Service</p>
                      <p className="text-sm font-bold text-gray-800">
                        {flight.delivery_type === 'both' ? '🛍️ + Shop' : '🤝 Only'}
                      </p>
                    </div>
                  </div>

                  {flight.categories?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {flight.categories.map(cat => (
                        <span key={cat} className="text-xs bg-purple-50 text-purple-600 px-2.5 py-1 rounded-full font-medium">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  {flight.handover_location_departure && (
                    <p className="text-xs text-gray-400 mb-1">
                      📍 Departure: {flight.handover_location_departure}
                    </p>
                  )}
                  {flight.handover_location_arrival && (
                    <p className="text-xs text-gray-400 mb-1">
                      📍 Arrival: {flight.handover_location_arrival}
                    </p>
                  )}
                  {flight.notes && (
                    <p className="text-xs text-gray-400 italic mt-1">"{flight.notes}"</p>
                  )}

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => startEditing(flight)}
                      className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50 transition"
                    >
                      <Edit2 size={14} /> Edit
                    </button>
                    <button
                      onClick={() => deleteFlight(flight.id)}
                      disabled={hasActiveMatch(flight.id)}
                      className="flex-1 flex items-center justify-center gap-2 border border-red-100 text-red-400 rounded-xl py-2.5 text-sm font-semibold hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              )}

              {/* Edit Form */}
              {editingFlight === flight.id && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-gray-800">✏️ Edit Flight Details</p>
                    <button onClick={cancelEditing} className="text-gray-400 hover:text-gray-600">
                      <X size={18} />
                    </button>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 bg-red-50 text-red-600 text-xs p-3 rounded-xl">
                      <AlertTriangle size={14} /> {error}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">Available kg</label>
                      <div className="relative">
                        <Weight size={14} className="absolute left-3 top-3 text-gray-400" />
                        <input type="number" min="0.5" max="50" step="0.5"
                          value={editForm.available_kg}
                          onChange={e => setEditForm({ ...editForm, available_kg: e.target.value })}
                          className="w-full pl-8 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">Price per kg ($)</label>
                      <div className="relative">
                        <DollarSign size={14} className="absolute left-3 top-3 text-gray-400" />
                        <input type="number" min="1" step="0.5"
                          value={editForm.price_per_kg}
                          onChange={e => setEditForm({ ...editForm, price_per_kg: e.target.value })}
                          className="w-full pl-8 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-2 block">Categories *</label>
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORIES.map(cat => (
                        <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                            editForm.categories?.includes(cat)
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                          }`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-2 block">Delivery Service</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'handover', label: '🤝 Handover Only' },
                        { value: 'both', label: '🛍️ + Shop & Ship' },
                      ].map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setEditForm({ ...editForm, delivery_type: opt.value })}
                          className={`p-2.5 rounded-xl border text-xs font-semibold transition ${
                            editForm.delivery_type === opt.value
                              ? 'border-purple-400 bg-purple-50 text-purple-700'
                              : 'border-gray-200 text-gray-600 hover:border-purple-200'
                          }`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {editForm.delivery_type === 'both' && (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">Shop & Ship Fee ($)</label>
                      <div className="relative">
                        <DollarSign size={14} className="absolute left-3 top-3 text-gray-400" />
                        <input type="number" min="0" step="0.5" placeholder="e.g. 15.00"
                          value={editForm.shop_and_ship_fee}
                          onChange={e => setEditForm({ ...editForm, shop_and_ship_fee: e.target.value })}
                          className="w-full pl-8 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">📍 Departure Handover Location</label>
                    <input type="text" placeholder="e.g. Dubai Airport Terminal 3..."
                      value={editForm.handover_location_departure}
                      onChange={e => setEditForm({ ...editForm, handover_location_departure: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">📍 Arrival Handover Location</label>
                    <input type="text" placeholder="e.g. Heathrow arrivals hall..."
                      value={editForm.handover_location_arrival}
                      onChange={e => setEditForm({ ...editForm, handover_location_arrival: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Notes</label>
                    <textarea placeholder="Any special conditions..."
                      value={editForm.notes}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none" />
                  </div>

                  <div className="flex gap-2">
                    <button onClick={cancelEditing}
                      className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-2">
                      <X size={14} /> Cancel
                    </button>
                    <button onClick={() => saveEdit(flight.id)} disabled={saving}
                      className="flex-[2] bg-purple-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                      <Save size={14} />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyFlights;