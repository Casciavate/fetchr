import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Plane,
  Trash2,
  Calendar,
  Package,
  DollarSign,
  Edit2,
  Check,
  X,
  AlertTriangle
} from 'lucide-react';

const CATEGORIES = [
  'Documents',
  'Electronics',
  'Fashion',
  'Cosmetics',
  'Food',
  'Medicine',
  'Jewellery',
  'Other'
];

const AIRLINES = [
  'Emirates',
  'Qatar Airways',
  'Lufthansa',
  'British Airways',
  'Air France',
  'Turkish Airlines',
  'Etihad Airways',
  'Flydubai',
  'Other'
];

const AIRLINE_CODES = {
  Emirates: 'EK',
  'Qatar Airways': 'QR',
  'Etihad Airways': 'EY',
  Lufthansa: 'LH',
  'British Airways': 'BA',
  'Air France': 'AF',
  'Turkish Airlines': 'TK',
  Flydubai: 'FZ',
  'Air Arabia': 'G9',
  'Singapore Airlines': 'SQ',
  'Cathay Pacific': 'CX',
  Qantas: 'QF',
  'American Airlines': 'AA',
  'United Airlines': 'UA',
  'Delta Air Lines': 'DL',
  KLM: 'KL',
  Swiss: 'LX',
  'Austrian Airlines': 'OS'
};

const AirlineLogo = ({ airline }) => {
  const code = AIRLINE_CODES[airline];

  if (!code) {
    return <Plane size={18} className="text-purple-600" />;
  }

  return (
    <img
      src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`}
      alt={airline}
      className="w-8 h-8 object-contain"
      onError={(e) => {
        e.target.style.display = 'none';
      }}
    />
  );
};

const MyFlights = ({ session, onAddFlight }) => {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [flightStatuses, setFlightStatuses] = useState({});

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
      await checkFlightStatuses(data);
    }

    setLoading(false);
  };

  const checkFlightStatuses = async (flightsList) => {
    const statuses = {};

    for (const flight of flightsList) {
      const { data: matches } = await supabase
        .from('matches')
        .select('id, status')
        .eq('flight_id', flight.id)
        .in('status', ['accepted', 'in_escrow']);

      if (matches && matches.length > 0) {
        const hasEscrow = matches.some(
          (m) => m.status === 'in_escrow'
        );

        statuses[flight.id] = hasEscrow
          ? 'in_escrow'
          : 'accepted';
      } else {
        statuses[flight.id] = 'free';
      }
    }

    setFlightStatuses(statuses);
  };

  useEffect(() => {
    fetchFlights();
  }, []);

  useEffect(() => {
    if (!loading && flights.length === 0 && onAddFlight) {
      onAddFlight();
    }
  }, [loading, flights]);

  const deleteFlight = async (flight) => {
    const status = flightStatuses[flight.id];

    if (status === 'in_escrow') {
      alert(
        '❌ This flight has an active escrow payment. You must cancel the deal and refund the escrow via chat before deleting.'
      );
      return;
    }

    if (status === 'accepted') {
      alert(
        '❌ This flight has an accepted deal. Both parties must agree to cancel via chat before you can delete it.'
      );
      return;
    }

    if (
      window.confirm(
        'Are you sure you want to delete this flight?'
      )
    ) {
      const { error } = await supabase
        .from('flights')
        .delete()
        .eq('id', flight.id)
        .eq('user_id', session.user.id);

      if (error) {
        alert('Failed to delete: ' + error.message);
      } else {
        setFlights(
          flights.filter((f) => f.id !== flight.id)
        );
      }
    }
  };

  const startEdit = (flight) => {
    const status = flightStatuses[flight.id];

    if (status === 'in_escrow') {
      alert(
        '❌ Cannot edit a flight with an active escrow payment.'
      );
      return;
    }

    setEditingId(flight.id);

    setEditForm({
      from_city: flight.from_city,
      from_code: flight.from_code,
      to_city: flight.to_city,
      to_code: flight.to_code,
      flight_date: flight.flight_date,
      flight_number: flight.flight_number || '',
      airline: flight.airline || '',
      available_kg: flight.available_kg,
      price_per_kg: flight.price_per_kg,
      categories: flight.categories || []
    });

    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setError('');
  };

  const toggleCategory = (cat) => {
    setEditForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const saveEdit = async (id) => {
    if (
      !editForm.from_city ||
      !editForm.to_city ||
      !editForm.flight_date ||
      !editForm.available_kg ||
      !editForm.price_per_kg
    ) {
      setError('Please fill in all required fields.');
      return;
    }

    if (editForm.categories.length === 0) {
      setError('Please select at least one category.');
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('flights')
      .update({
        from_city: editForm.from_city,
        from_code: editForm.from_code.toUpperCase(),
        to_city: editForm.to_city,
        to_code: editForm.to_code.toUpperCase(),
        flight_date: editForm.flight_date,
        flight_number: editForm.flight_number,
        airline: editForm.airline,
        available_kg: parseFloat(editForm.available_kg),
        price_per_kg: parseFloat(editForm.price_per_kg),
        categories: editForm.categories
      })
      .eq('id', id);

    if (error) {
      setError(error.message);
    } else {
      setFlights(
        flights.map((f) =>
          f.id === id
            ? {
                ...f,
                ...editForm,
                from_code:
                  editForm.from_code.toUpperCase(),
                to_code:
                  editForm.to_code.toUpperCase(),
                available_kg: parseFloat(
                  editForm.available_kg
                ),
                price_per_kg: parseFloat(
                  editForm.price_per_kg
                )
              }
            : f
        )
      );

      setEditingId(null);
      setEditForm({});
    }

    setSaving(false);
  };

  const getStatusBadge = (flight) => {
    const status = flightStatuses[flight.id];

    if (status === 'in_escrow') {
      return (
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-600">
          🔒 Escrow Active
        </span>
      );
    }

    if (status === 'accepted') {
      return (
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-yellow-50 text-yellow-600">
          🤝 Deal Accepted
        </span>
      );
    }

    if (flight.status === 'expired') {
      return (
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-500">
          ✈️ Flight Passed
        </span>
      );
    }

    if (flight.status === 'completed') {
      return (
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-600">
          ✅ Completed
        </span>
      );
    }

    return (
      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-600">
        Active
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-sm">
          Loading your flights...
        </p>
      </div>
    );
  }

  if (flights.length === 0) return null;

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            My Flights
          </h1>

          <p className="text-gray-400 text-sm mt-1">
            {flights.length} flight
            {flights.length !== 1 ? 's' : ''} listed
          </p>
        </div>

        {onAddFlight && (
          <button
            onClick={onAddFlight}
            className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700 transition"
          >
            + Add Flight
          </button>
        )}
      </div>

      <div className="space-y-4">
        {flights.map((flight) => (
          <div
            key={flight.id}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
          >
            {editingId === flight.id ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-gray-800 text-sm">
                    ✏️ Editing Flight
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={cancelEdit}
                      className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50"
                    >
                      <X size={13} />
                      Cancel
                    </button>

                    <button
                      onClick={() => saveEdit(flight.id)}
                      disabled={saving}
                      className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700 disabled:opacity-50"
                    >
                      <Check size={13} />
                      {saving
                        ? 'Saving...'
                        : 'Save Changes'}
                    </button>
                  </div>
                </div>

                {/* EDIT FORM CONTENT HERE */}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center overflow-hidden">
                      <AirlineLogo airline={flight.airline} />
                    </div>

                    <div>
                      <p className="font-bold text-gray-800">
                        {flight.from_city} (
                        {flight.from_code}) →{' '}
                        {flight.to_city} (
                        {flight.to_code})
                      </p>

                      <p className="text-xs text-gray-400">
                        {flight.airline} •{' '}
                        {flight.flight_number}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {getStatusBadge(flight)}

                    <button
                      onClick={() => startEdit(flight)}
                      className="p-2 hover:bg-purple-50 rounded-lg transition"
                      title="Edit"
                    >
                      <Edit2
                        size={15}
                        className="text-purple-400"
                      />
                    </button>

                    <button
                      onClick={() => deleteFlight(flight)}
                      className={`p-2 rounded-lg transition ${
                        flightStatuses[flight.id] ===
                        'free'
                          ? 'hover:bg-red-50'
                          : 'opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <Trash2
                        size={15}
                        className={
                          flightStatuses[flight.id] ===
                          'free'
                            ? 'text-red-400'
                            : 'text-gray-300'
                        }
                      />
                    </button>
                  </div>
                </div>

                {/* Deal / escrow warning */}
                {flightStatuses[flight.id] !==
                  'free' && (
                  <div
                    className={`flex items-start gap-2 rounded-xl p-3 mb-3 text-xs ${
                      flightStatuses[flight.id] ===
                      'in_escrow'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-yellow-50 text-yellow-700'
                    }`}
                  >
                    <AlertTriangle
                      size={14}
                      className="flex-shrink-0 mt-0.5"
                    />

                    <p>
                      {flightStatuses[flight.id] ===
                      'in_escrow'
                        ? 'This flight has an active escrow payment. To cancel, both parties must agree via chat and the escrow must be refunded first.'
                        : 'This flight has an accepted deal. Both parties must agree to cancel via chat before this can be deleted.'}
                    </p>
                  </div>
                )}

                {/* Expired flight notice */}
                {flight.status === 'expired' && (
                  <div className="flex items-start gap-2 rounded-xl p-3 mb-3 text-xs bg-gray-50 text-gray-500">
                    <AlertTriangle
                      size={14}
                      className="flex-shrink-0 mt-0.5"
                    />

                    <p>
                      This flight has passed. It
                      will be automatically removed
                      in{' '}
                      {Math.max(
                        0,
                        5 -
                          Math.floor(
                            (new Date() -
                              new Date(
                                flight.flight_date
                              )) /
                              (1000 *
                                60 *
                                60 *
                                24)
                          )
                      )}{' '}
                      day(s). You can still edit it
                      if the flight details changed.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                    <Calendar
                      size={15}
                      className="text-purple-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Flight Date
                      </p>

                      <p className="text-sm font-semibold text-gray-700">
                        {new Date(
                          flight.flight_date
                        ).toLocaleDateString(
                          'en-GB',
                          {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          }
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                    <Package
                      size={15}
                      className="text-purple-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Available Space
                      </p>

                      <p className="text-sm font-semibold text-gray-700">
                        {flight.available_kg} kg
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                    <DollarSign
                      size={15}
                      className="text-purple-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Price per kg
                      </p>

                      <p className="text-sm font-semibold text-gray-700">
                        ${flight.price_per_kg}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {flight.categories.map((cat) => (
                    <span
                      key={cat}
                      className="text-xs bg-purple-50 text-purple-600 px-3 py-1 rounded-full font-medium"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyFlights;