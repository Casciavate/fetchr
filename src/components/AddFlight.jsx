import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Plane, Search, MapPin, Calendar, Weight, DollarSign, Tag, CheckCircle, AlertCircle, ChevronDown, Package, ShoppingBag, MapPin as Location } from 'lucide-react';

const CATEGORIES = [
  'Electronics', 'Clothing & Fashion', 'Cosmetics & Beauty',
  'Food & Beverages', 'Books & Stationery', 'Toys & Games',
  'Medical & Pharmacy', 'Jewelry & Accessories', 'Sports & Fitness',
  'Home & Living', 'Documents', 'Other'
];

const AIRLINES = [
  'Emirates', 'Qatar Airways', 'Etihad Airways', 'Lufthansa',
  'British Airways', 'Air France', 'Turkish Airlines', 'Flydubai',
  'Air Arabia', 'Singapore Airlines', 'Cathay Pacific', 'Qantas',
  'American Airlines', 'United Airlines', 'Delta Air Lines',
  'Southwest Airlines', 'Ryanair', 'easyJet', 'KLM', 'Swiss',
  'Austrian Airlines', 'Finnair', 'SAS', 'Iberia', 'EgyptAir',
  'Ethiopian Airlines', 'Kenya Airways', 'Saudia', 'Gulf Air',
  'Oman Air', 'Air India', 'Japan Airlines', 'Korean Air',
  'ANA', 'Thai Airways', 'Malaysia Airlines', 'LATAM', 'Avianca', 'Air Canada'
];

const AIRPORTS = [
  { code: 'DXB', city: 'Dubai', name: 'Dubai International', country: 'UAE' },
  { code: 'AUH', city: 'Abu Dhabi', name: 'Zayed International', country: 'UAE' },
  { code: 'SHJ', city: 'Sharjah', name: 'Sharjah International', country: 'UAE' },
  { code: 'DOH', city: 'Doha', name: 'Hamad International', country: 'Qatar' },
  { code: 'KWI', city: 'Kuwait City', name: 'Kuwait International', country: 'Kuwait' },
  { code: 'BAH', city: 'Bahrain', name: 'Bahrain International', country: 'Bahrain' },
  { code: 'RUH', city: 'Riyadh', name: 'King Khalid International', country: 'Saudi Arabia' },
  { code: 'JED', city: 'Jeddah', name: 'King Abdulaziz International', country: 'Saudi Arabia' },
  { code: 'MCT', city: 'Muscat', name: 'Muscat International', country: 'Oman' },
  { code: 'BEY', city: 'Beirut', name: 'Rafic Hariri International', country: 'Lebanon' },
  { code: 'AMM', city: 'Amman', name: 'Queen Alia International', country: 'Jordan' },
  { code: 'CAI', city: 'Cairo', name: 'Cairo International', country: 'Egypt' },
  { code: 'TLV', city: 'Tel Aviv', name: 'Ben Gurion International', country: 'Israel' },
  { code: 'LHR', city: 'London', name: 'Heathrow', country: 'UK' },
  { code: 'LGW', city: 'London', name: 'Gatwick', country: 'UK' },
  { code: 'STN', city: 'London', name: 'Stansted', country: 'UK' },
  { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle', country: 'France' },
  { code: 'ORY', city: 'Paris', name: 'Orly', country: 'France' },
  { code: 'AMS', city: 'Amsterdam', name: 'Schiphol', country: 'Netherlands' },
  { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt Airport', country: 'Germany' },
  { code: 'MUC', city: 'Munich', name: 'Munich Airport', country: 'Germany' },
  { code: 'ZRH', city: 'Zurich', name: 'Zurich Airport', country: 'Switzerland' },
  { code: 'GVA', city: 'Geneva', name: 'Geneva Airport', country: 'Switzerland' },
  { code: 'VIE', city: 'Vienna', name: 'Vienna International', country: 'Austria' },
  { code: 'BRU', city: 'Brussels', name: 'Brussels Airport', country: 'Belgium' },
  { code: 'MAD', city: 'Madrid', name: 'Adolfo Suarez', country: 'Spain' },
  { code: 'BCN', city: 'Barcelona', name: 'El Prat', country: 'Spain' },
  { code: 'FCO', city: 'Rome', name: 'Fiumicino', country: 'Italy' },
  { code: 'MXP', city: 'Milan', name: 'Malpensa', country: 'Italy' },
  { code: 'LIN', city: 'Milan', name: 'Linate', country: 'Italy' },
  { code: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Turkey' },
  { code: 'SAW', city: 'Istanbul', name: 'Sabiha Gokcen', country: 'Turkey' },
  { code: 'ATH', city: 'Athens', name: 'Eleftherios Venizelos', country: 'Greece' },
  { code: 'CPH', city: 'Copenhagen', name: 'Kastrup', country: 'Denmark' },
  { code: 'ARN', city: 'Stockholm', name: 'Arlanda', country: 'Sweden' },
  { code: 'HEL', city: 'Helsinki', name: 'Helsinki Airport', country: 'Finland' },
  { code: 'OSL', city: 'Oslo', name: 'Gardermoen', country: 'Norway' },
  { code: 'WAW', city: 'Warsaw', name: 'Chopin Airport', country: 'Poland' },
  { code: 'PRG', city: 'Prague', name: 'Vaclav Havel', country: 'Czech Republic' },
  { code: 'BUD', city: 'Budapest', name: 'Ferenc Liszt', country: 'Hungary' },
  { code: 'JFK', city: 'New York', name: 'John F Kennedy', country: 'USA' },
  { code: 'LGA', city: 'New York', name: 'LaGuardia', country: 'USA' },
  { code: 'EWR', city: 'New York', name: 'Newark Liberty', country: 'USA' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', country: 'USA' },
  { code: 'ORD', city: 'Chicago', name: 'O Hare International', country: 'USA' },
  { code: 'ATL', city: 'Atlanta', name: 'Hartsfield Jackson', country: 'USA' },
  { code: 'DFW', city: 'Dallas', name: 'Dallas Fort Worth', country: 'USA' },
  { code: 'MIA', city: 'Miami', name: 'Miami International', country: 'USA' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco International', country: 'USA' },
  { code: 'BOS', city: 'Boston', name: 'Logan International', country: 'USA' },
  { code: 'YYZ', city: 'Toronto', name: 'Pearson International', country: 'Canada' },
  { code: 'YVR', city: 'Vancouver', name: 'Vancouver International', country: 'Canada' },
  { code: 'GRU', city: 'Sao Paulo', name: 'Guarulhos International', country: 'Brazil' },
  { code: 'MEX', city: 'Mexico City', name: 'Benito Juarez International', country: 'Mexico' },
  { code: 'SIN', city: 'Singapore', name: 'Changi Airport', country: 'Singapore' },
  { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi', country: 'Thailand' },
  { code: 'KUL', city: 'Kuala Lumpur', name: 'KLIA', country: 'Malaysia' },
  { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong International', country: 'China' },
  { code: 'PVG', city: 'Shanghai', name: 'Pudong International', country: 'China' },
  { code: 'PEK', city: 'Beijing', name: 'Capital International', country: 'China' },
  { code: 'NRT', city: 'Tokyo', name: 'Narita International', country: 'Japan' },
  { code: 'HND', city: 'Tokyo', name: 'Haneda', country: 'Japan' },
  { code: 'ICN', city: 'Seoul', name: 'Incheon International', country: 'South Korea' },
  { code: 'DEL', city: 'New Delhi', name: 'Indira Gandhi International', country: 'India' },
  { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji', country: 'India' },
  { code: 'BLR', city: 'Bangalore', name: 'Kempegowda International', country: 'India' },
  { code: 'SYD', city: 'Sydney', name: 'Kingsford Smith', country: 'Australia' },
  { code: 'MEL', city: 'Melbourne', name: 'Melbourne Airport', country: 'Australia' },
  { code: 'JNB', city: 'Johannesburg', name: 'OR Tambo International', country: 'South Africa' },
  { code: 'NBO', city: 'Nairobi', name: 'Jomo Kenyatta International', country: 'Kenya' },
  { code: 'ADD', city: 'Addis Ababa', name: 'Bole International', country: 'Ethiopia' },
  { code: 'LOS', city: 'Lagos', name: 'Murtala Muhammed', country: 'Nigeria' },
  { code: 'CMN', city: 'Casablanca', name: 'Mohammed V International', country: 'Morocco' },
];

const AIRLINE_CODES = {
  'Emirates': 'EK', 'Qatar Airways': 'QR', 'Etihad Airways': 'EY',
  'Lufthansa': 'LH', 'British Airways': 'BA', 'Air France': 'AF',
  'Turkish Airlines': 'TK', 'Flydubai': 'FZ', 'Air Arabia': 'G9',
  'Singapore Airlines': 'SQ', 'Cathay Pacific': 'CX', 'Qantas': 'QF',
  'American Airlines': 'AA', 'United Airlines': 'UA', 'Delta Air Lines': 'DL',
  'Southwest Airlines': 'WN', 'Ryanair': 'FR', 'easyJet': 'U2',
  'KLM': 'KL', 'Swiss': 'LX', 'Austrian Airlines': 'OS',
  'Finnair': 'AY', 'SAS': 'SK', 'Iberia': 'IB',
  'EgyptAir': 'MS', 'Ethiopian Airlines': 'ET', 'Kenya Airways': 'KQ',
  'Saudia': 'SV', 'Gulf Air': 'GF', 'Oman Air': 'WY',
  'Air India': 'AI', 'Japan Airlines': 'JL', 'Korean Air': 'KE',
  'ANA': 'NH', 'Thai Airways': 'TG', 'Malaysia Airlines': 'MH',
  'LATAM': 'LA', 'Avianca': 'AV', 'Air Canada': 'AC',
};

const AirportSearch = ({ label, value, onChange, placeholder }) => {
  const [query, setQuery] = useState(value?.city ? `${value.city} (${value.code})` : '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
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
    ).slice(0, 6);
    setResults(filtered);
    setOpen(true);
  };

  const handleSelect = (airport) => {
    setQuery(`${airport.city} (${airport.code})`);
    setOpen(false);
    setResults([]);
    onChange(airport);
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <MapPin size={16} className="absolute left-3 top-3.5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => query.length > 0 && results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {results.map(airport => (
            <button
              key={airport.code}
              type="button"
              onClick={() => handleSelect(airport)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50 text-left transition"
            >
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-purple-600">{airport.code}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{airport.city}</p>
                <p className="text-xs text-gray-400">{airport.name} • {airport.country}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const AddFlight = ({ session }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    from_city: '', from_code: '',
    to_city: '', to_code: '',
    flight_date: '', flight_number: '', airline: '',
    available_kg: '', price_per_kg: '',
    categories: [], notes: '',
    delivery_type: 'handover',
    shop_and_ship_fee: '',
    handover_location: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [flightNumberSearch, setFlightNumberSearch] = useState('');
  const [searching, setSearching] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const searchByFlightNumber = async () => {
    if (!flightNumberSearch.trim()) return;
    setSearching(true);
    setError('');
    try {
      const upper = flightNumberSearch.toUpperCase().trim();
      const airlineCode = upper.replace(/[0-9]/g, '');
      const airline = Object.entries(AIRLINE_CODES).find(([, code]) => code === airlineCode)?.[0];
      if (airline) {
        setForm(prev => ({ ...prev, airline, flight_number: upper }));
      } else {
        setForm(prev => ({ ...prev, flight_number: upper }));
      }
    } catch {
      setError('Could not find flight. Please enter details manually.');
    }
    setSearching(false);
  };

  const toggleCategory = (cat) => {
    setForm(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const validateStep1 = () => {
    if (!form.from_code) { setError('Please select departure airport.'); return false; }
    if (!form.to_code) { setError('Please select arrival airport.'); return false; }
    if (form.from_code === form.to_code) { setError('Departure and arrival cannot be the same.'); return false; }
    if (!form.flight_date) { setError('Please select flight date.'); return false; }
    if (form.flight_date < today) { setError('Flight date cannot be in the past.'); return false; }
    if (!form.airline) { setError('Please select your airline.'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!form.available_kg || parseFloat(form.available_kg) <= 0) {
      setError('Please enter available weight.'); return false;
    }
    if (parseFloat(form.available_kg) > 30) {
      setError('Maximum 30kg per listing.'); return false;
    }
    if (!form.price_per_kg || parseFloat(form.price_per_kg) <= 0) {
      setError('Please enter your price per kg.'); return false;
    }
    if (form.categories.length === 0) {
      setError('Please select at least one category.'); return false;
    }
    return true;
  };

  const handleNext = () => {
    setError('');
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const saveFlight = async () => {
    setLoading(true);
    setError('');

    const { error } = await supabase.from('flights').insert([{
      user_id: session.user.id,
      from_city: form.from_city,
      from_code: form.from_code,
      to_city: form.to_city,
      to_code: form.to_code,
      flight_date: form.flight_date,
      flight_number: form.flight_number,
      airline: form.airline,
      available_kg: parseFloat(form.available_kg),
      price_per_kg: parseFloat(form.price_per_kg),
      categories: form.categories,
      notes: form.notes,
      status: 'active',
      delivery_type: form.delivery_type,
      shop_and_ship_fee: parseFloat(form.shop_and_ship_fee) || 0,
      handover_location: form.handover_location,
    }]);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  if (success) return (
    <div className="max-w-xl mx-auto py-16 px-6 text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={40} className="text-green-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Flight Listed! ✈️</h2>
      <p className="text-gray-400 mb-2">
        Your flight from <strong>{form.from_city}</strong> to <strong>{form.to_city}</strong> is now live.
      </p>
      <p className="text-gray-400 text-sm mb-6">
        Fetchr will match you with shippers automatically. You'll be notified when a match is found.
      </p>
      <div className="bg-purple-50 rounded-2xl p-4 mb-6 text-left space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Route</span>
          <span className="font-semibold">{form.from_code} → {form.to_code}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Date</span>
          <span className="font-semibold">{new Date(form.flight_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Capacity</span>
          <span className="font-semibold">{form.available_kg}kg @ ${form.price_per_kg}/kg</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Delivery type</span>
          <span className="font-semibold">{form.delivery_type === 'both' ? '🛍️ Handover + Shop & Ship' : '🤝 Handover only'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Potential earnings</span>
          <span className="font-semibold text-green-600">
            up to ${(parseFloat(form.available_kg) * parseFloat(form.price_per_kg) * 0.9).toFixed(2)}
          </span>
        </div>
      </div>
      <button
        onClick={() => { setSuccess(false); setStep(1); setForm({
          from_city: '', from_code: '', to_city: '', to_code: '',
          flight_date: '', flight_number: '', airline: '',
          available_kg: '', price_per_kg: '', categories: [], notes: '',
          delivery_type: 'handover', shop_and_ship_fee: '', handover_location: '',
        }); }}
        className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition"
      >
        Add Another Flight
      </button>
    </div>
  );

  return (
    <div className="max-w-xl mx-auto py-6 px-4 md:px-6">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">List Your Flight</h1>
        <p className="text-gray-400 text-sm mt-1">Earn money by delivering items on your next trip</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { n: 1, label: 'Flight Info' },
          { n: 2, label: 'Capacity' },
          { n: 3, label: 'Delivery' },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
                step > s.n ? 'bg-green-500 text-white' :
                step === s.n ? 'bg-purple-600 text-white' :
                'bg-gray-100 text-gray-400'
              }`}>
                {step > s.n ? <CheckCircle size={16} /> : s.n}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${
                step === s.n ? 'text-purple-600' : 'text-gray-400'
              }`}>{s.label}</span>
            </div>
            {i < 2 && <div className={`flex-1 h-0.5 ${step > s.n ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Step 1: Flight Info */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Flight Number Search */}
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
            <p className="text-sm font-semibold text-purple-700 mb-2">🔍 Quick Fill — Search by Flight Number</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. EK203, QR542..."
                value={flightNumberSearch}
                onChange={e => setFlightNumberSearch(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && searchByFlightNumber()}
                className="flex-1 border border-purple-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
              />
              <button
                type="button"
                onClick={searchByFlightNumber}
                disabled={searching}
                className="bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                <Search size={15} />
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <p className="text-xs text-purple-500 mt-2">Or fill in the details manually below</p>
          </div>

          <AirportSearch
            label="Departure Airport *"
            value={{ city: form.from_city, code: form.from_code }}
            onChange={(airport) => setForm(prev => ({
              ...prev, from_city: airport.city, from_code: airport.code
            }))}
            placeholder="Search city or airport code..."
          />

          <AirportSearch
            label="Arrival Airport *"
            value={{ city: form.to_city, code: form.to_code }}
            onChange={(airport) => setForm(prev => ({
              ...prev, to_city: airport.city, to_code: airport.code
            }))}
            placeholder="Search city or airport code..."
          />

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Flight Date *</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                type="date"
                min={today}
                value={form.flight_date}
                onChange={e => setForm({ ...form, flight_date: e.target.value })}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Airline *</label>
            <div className="relative">
              <Plane size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <select
                value={form.airline}
                onChange={e => setForm({ ...form, airline: e.target.value })}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 appearance-none text-gray-700"
              >
                <option value="">Select airline...</option>
                {AIRLINES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Flight Number</label>
            <input
              type="text"
              placeholder="e.g. EK203"
              value={form.flight_number}
              onChange={e => setForm({ ...form, flight_number: e.target.value.toUpperCase() })}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>

          <button
            onClick={handleNext}
            className="w-full bg-purple-600 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-purple-700 transition"
          >
            Continue to Capacity →
          </button>
        </div>
      )}

      {/* Step 2: Capacity & Categories */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Route summary */}
          <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2 text-sm">
            <Plane size={15} className="text-purple-600" />
            <span className="font-semibold text-gray-700">{form.from_city} ({form.from_code})</span>
            <span className="text-gray-400">→</span>
            <span className="font-semibold text-gray-700">{form.to_city} ({form.to_code})</span>
            <span className="text-gray-400 ml-auto">
              {form.flight_date ? new Date(form.flight_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Available Weight (kg) *</label>
              <div className="relative">
                <Weight size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input
                  type="number"
                  placeholder="e.g. 10"
                  min="0.5" max="30" step="0.5"
                  value={form.available_kg}
                  onChange={e => setForm({ ...form, available_kg: e.target.value })}
                  className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Price per kg ($) *</label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input
                  type="number"
                  placeholder="e.g. 10"
                  min="1" step="0.5"
                  value={form.price_per_kg}
                  onChange={e => setForm({ ...form, price_per_kg: e.target.value })}
                  className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>
            </div>
          </div>

          {/* Earnings estimate */}
          {form.available_kg && form.price_per_kg && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm text-green-700">Potential earnings (if fully booked)</span>
              <span className="text-sm font-bold text-green-700">
                up to ${(parseFloat(form.available_kg) * parseFloat(form.price_per_kg) * 0.9).toFixed(2)}
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              What items can you carry? * <span className="text-gray-400 font-normal">(select all that apply)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    form.categories.includes(cat)
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Additional Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              placeholder="Any special conditions, restrictions, or information for shippers..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 transition"
            >
              ← Back
            </button>
            <button
              onClick={handleNext}
              className="flex-[2] bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition"
            >
              Continue to Delivery →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Delivery Preferences */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Route</span>
              <span className="font-semibold">{form.from_code} → {form.to_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Capacity</span>
              <span className="font-semibold">{form.available_kg}kg @ ${form.price_per_kg}/kg</span>
            </div>
          </div>

          {/* Delivery Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              What delivery service do you offer? *
            </label>
            <div className="space-y-2">
              {[
                {
                  value: 'handover',
                  icon: '🤝',
                  label: 'Handover Only',
                  desc: 'Shipper brings item to you at airport or agreed meeting point'
                },
                {
                  value: 'both',
                  icon: '🛍️',
                  label: 'Handover + Shop & Ship',
                  desc: 'You can also purchase the item at destination for an additional service fee'
                },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, delivery_type: opt.value })}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 transition text-left ${
                    form.delivery_type === opt.value
                      ? 'border-purple-400 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-200 bg-white'
                  }`}
                >
                  <span className="text-2xl flex-shrink-0">{opt.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-800">{opt.label}</p>
                      {form.delivery_type === opt.value && (
                        <CheckCircle size={15} className="text-purple-600" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Shop & Ship Fee */}
          {form.delivery_type === 'both' && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-start gap-2 mb-3">
                <ShoppingBag size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-700">Shop & Ship Service Fee</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    This is your fee for going to the store and purchasing the item. The item's actual purchase price will be added separately to the escrow.
                  </p>
                </div>
              </div>
              <div className="relative">
                <DollarSign size={15} className="absolute left-3 top-3.5 text-gray-400" />
                <input
                  type="number"
                  placeholder="e.g. 15.00"
                  min="0" step="0.5"
                  value={form.shop_and_ship_fee}
                  onChange={e => setForm({ ...form, shop_and_ship_fee: e.target.value })}
                  className="w-full pl-8 border border-blue-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                />
              </div>
            </div>
          )}

          {/* Handover Location */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Preferred Handover Location
            </label>
            <div className="relative">
              <Location size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="e.g. Airport departures terminal, Hotel lobby, Mall..."
                value={form.handover_location}
                onChange={e => setForm({ ...form, handover_location: e.target.value })}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
          </div>

          {/* Listing Summary */}
          <div className="bg-purple-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-purple-700 mb-3">📋 Listing Summary</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-gray-400">Route</p>
                <p className="font-semibold text-gray-700">{form.from_city} → {form.to_city}</p>
              </div>
              <div>
                <p className="text-gray-400">Date</p>
                <p className="font-semibold text-gray-700">
                  {form.flight_date ? new Date(form.flight_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Capacity</p>
                <p className="font-semibold text-gray-700">{form.available_kg}kg @ ${form.price_per_kg}/kg</p>
              </div>
              <div>
                <p className="text-gray-400">Service</p>
                <p className="font-semibold text-gray-700">
                  {form.delivery_type === 'both' ? `Handover + Shop & Ship (+$${form.shop_and_ship_fee || 0})` : 'Handover only'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-400">Categories</p>
                <p className="font-semibold text-gray-700">{form.categories.join(', ') || '—'}</p>
              </div>
              {form.handover_location && (
                <div className="col-span-2">
                  <p className="text-gray-400">Handover at</p>
                  <p className="font-semibold text-gray-700">{form.handover_location}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 transition"
            >
              ← Back
            </button>
            <button
              onClick={saveFlight}
              disabled={loading}
              className="flex-[2] bg-purple-600 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Publishing...</>
              ) : (
                <><Plane size={16} /> Publish Flight Listing</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddFlight;