import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Search, CheckCircle, Package, DollarSign, Loader, Plane } from 'lucide-react';

const CATEGORIES = [
  'Documents', 'Electronics', 'Fashion', 'Cosmetics',
  'Food', 'Medicine', 'Jewellery', 'Other'
];

const AIRLINES = {
  'EK': 'Emirates', 'QR': 'Qatar Airways', 'EY': 'Etihad Airways',
  'LH': 'Lufthansa', 'BA': 'British Airways', 'AF': 'Air France',
  'TK': 'Turkish Airlines', 'FZ': 'Flydubai', 'G9': 'Air Arabia',
  'SQ': 'Singapore Airlines', 'CX': 'Cathay Pacific', 'QF': 'Qantas',
  'AA': 'American Airlines', 'UA': 'United Airlines', 'DL': 'Delta Air Lines',
  'WN': 'Southwest Airlines', 'FR': 'Ryanair', 'U2': 'easyJet',
  'W6': 'Wizz Air', 'VY': 'Vueling', 'IB': 'Iberia', 'AZ': 'ITA Airways',
  'KL': 'KLM', 'OS': 'Austrian Airlines', 'LX': 'Swiss', 'SK': 'SAS',
  'AY': 'Finnair', 'TP': 'TAP Air Portugal', 'RO': 'TAROM',
  'MS': 'EgyptAir', 'ET': 'Ethiopian Airlines', 'KQ': 'Kenya Airways',
  'SA': 'South African Airways', 'SV': 'Saudia', 'GF': 'Gulf Air',
  'WY': 'Oman Air', 'ME': 'Middle East Airlines', 'RJ': 'Royal Jordanian',
  'AI': 'Air India', 'UK': 'Vistara', '6E': 'IndiGo', 'SG': 'SpiceJet',
  'NH': 'ANA', 'JL': 'Japan Airlines', 'KE': 'Korean Air', 'OZ': 'Asiana',
  'CI': 'China Airlines', 'BR': 'EVA Air', 'MH': 'Malaysia Airlines',
  'TG': 'Thai Airways', 'GA': 'Garuda Indonesia', 'PR': 'Philippine Airlines',
  'VN': 'Vietnam Airlines', 'LA': 'LATAM', 'AV': 'Avianca', 'CM': 'Copa Airlines',
  'AC': 'Air Canada', 'WS': 'WestJet', 'NZ': 'Air New Zealand',
};

const AIRPORTS = {
  'DXB': { city: 'Dubai', country: 'UAE', name: 'Dubai International' },
  'AUH': { city: 'Abu Dhabi', country: 'UAE', name: 'Zayed International' },
  'SHJ': { city: 'Sharjah', country: 'UAE', name: 'Sharjah International' },
  'DOH': { city: 'Doha', country: 'Qatar', name: 'Hamad International' },
  'KWI': { city: 'Kuwait City', country: 'Kuwait', name: 'Kuwait International' },
  'BAH': { city: 'Bahrain', country: 'Bahrain', name: 'Bahrain International' },
  'RUH': { city: 'Riyadh', country: 'Saudi Arabia', name: 'King Khalid International' },
  'JED': { city: 'Jeddah', country: 'Saudi Arabia', name: 'King Abdulaziz International' },
  'MCT': { city: 'Muscat', country: 'Oman', name: 'Muscat International' },
  'BEY': { city: 'Beirut', country: 'Lebanon', name: 'Rafic Hariri International' },
  'AMM': { city: 'Amman', country: 'Jordan', name: 'Queen Alia International' },
  'CAI': { city: 'Cairo', country: 'Egypt', name: 'Cairo International' },
  'LHR': { city: 'London', country: 'UK', name: 'Heathrow' },
  'LGW': { city: 'London', country: 'UK', name: 'Gatwick' },
  'STN': { city: 'London', country: 'UK', name: 'Stansted' },
  'CDG': { city: 'Paris', country: 'France', name: 'Charles de Gaulle' },
  'ORY': { city: 'Paris', country: 'France', name: 'Orly' },
  'AMS': { city: 'Amsterdam', country: 'Netherlands', name: 'Schiphol' },
  'FRA': { city: 'Frankfurt', country: 'Germany', name: 'Frankfurt Airport' },
  'MUC': { city: 'Munich', country: 'Germany', name: 'Munich Airport' },
  'ZRH': { city: 'Zurich', country: 'Switzerland', name: 'Zurich Airport' },
  'GVA': { city: 'Geneva', country: 'Switzerland', name: 'Geneva Airport' },
  'VIE': { city: 'Vienna', country: 'Austria', name: 'Vienna International' },
  'BRU': { city: 'Brussels', country: 'Belgium', name: 'Brussels Airport' },
  'MAD': { city: 'Madrid', country: 'Spain', name: 'Adolfo Suárez' },
  'BCN': { city: 'Barcelona', country: 'Spain', name: 'El Prat' },
  'FCO': { city: 'Rome', country: 'Italy', name: 'Fiumicino' },
  'MXP': { city: 'Milan', country: 'Italy', name: 'Malpensa' },
  'IST': { city: 'Istanbul', country: 'Turkey', name: 'Istanbul Airport' },
  'SAW': { city: 'Istanbul', country: 'Turkey', name: 'Sabiha Gökçen' },
  'ATH': { city: 'Athens', country: 'Greece', name: 'Eleftherios Venizelos' },
  'CPH': { city: 'Copenhagen', country: 'Denmark', name: 'Kastrup' },
  'ARN': { city: 'Stockholm', country: 'Sweden', name: 'Arlanda' },
  'HEL': { city: 'Helsinki', country: 'Finland', name: 'Helsinki Airport' },
  'OSL': { city: 'Oslo', country: 'Norway', name: 'Gardermoen' },
  'WAW': { city: 'Warsaw', country: 'Poland', name: 'Chopin Airport' },
  'PRG': { city: 'Prague', country: 'Czech Republic', name: 'Václav Havel' },
  'BUD': { city: 'Budapest', country: 'Hungary', name: 'Ferenc Liszt' },
  'OTP': { city: 'Bucharest', country: 'Romania', name: 'Henri Coandă' },
  'SVO': { city: 'Moscow', country: 'Russia', name: 'Sheremetyevo' },
  'JFK': { city: 'New York', country: 'USA', name: 'John F. Kennedy' },
  'LGA': { city: 'New York', country: 'USA', name: 'LaGuardia' },
  'EWR': { city: 'New York', country: 'USA', name: 'Newark Liberty' },
  'LAX': { city: 'Los Angeles', country: 'USA', name: 'Los Angeles International' },
  'ORD': { city: 'Chicago', country: 'USA', name: "O'Hare International" },
  'ATL': { city: 'Atlanta', country: 'USA', name: 'Hartsfield-Jackson' },
  'DFW': { city: 'Dallas', country: 'USA', name: 'Dallas/Fort Worth' },
  'MIA': { city: 'Miami', country: 'USA', name: 'Miami International' },
  'SFO': { city: 'San Francisco', country: 'USA', name: 'San Francisco International' },
  'BOS': { city: 'Boston', country: 'USA', name: 'Logan International' },
  'IAD': { city: 'Washington DC', country: 'USA', name: 'Dulles International' },
  'YYZ': { city: 'Toronto', country: 'Canada', name: 'Pearson International' },
  'YVR': { city: 'Vancouver', country: 'Canada', name: 'Vancouver International' },
  'YUL': { city: 'Montreal', country: 'Canada', name: 'Pierre Elliott Trudeau' },
  'GRU': { city: 'São Paulo', country: 'Brazil', name: 'Guarulhos International' },
  'EZE': { city: 'Buenos Aires', country: 'Argentina', name: 'Ministro Pistarini' },
  'BOG': { city: 'Bogotá', country: 'Colombia', name: 'El Dorado International' },
  'LIM': { city: 'Lima', country: 'Peru', name: 'Jorge Chávez International' },
  'MEX': { city: 'Mexico City', country: 'Mexico', name: 'Benito Juárez International' },
  'SIN': { city: 'Singapore', country: 'Singapore', name: 'Changi Airport' },
  'BKK': { city: 'Bangkok', country: 'Thailand', name: 'Suvarnabhumi' },
  'KUL': { city: 'Kuala Lumpur', country: 'Malaysia', name: 'KLIA' },
  'CGK': { city: 'Jakarta', country: 'Indonesia', name: 'Soekarno-Hatta' },
  'MNL': { city: 'Manila', country: 'Philippines', name: 'Ninoy Aquino' },
  'HKG': { city: 'Hong Kong', country: 'China', name: 'Hong Kong International' },
  'PVG': { city: 'Shanghai', country: 'China', name: 'Pudong International' },
  'PEK': { city: 'Beijing', country: 'China', name: 'Capital International' },
  'PKX': { city: 'Beijing', country: 'China', name: 'Daxing International' },
  'CAN': { city: 'Guangzhou', country: 'China', name: 'Baiyun International' },
  'NRT': { city: 'Tokyo', country: 'Japan', name: 'Narita International' },
  'HND': { city: 'Tokyo', country: 'Japan', name: 'Haneda' },
  'ICN': { city: 'Seoul', country: 'South Korea', name: 'Incheon International' },
  'DEL': { city: 'New Delhi', country: 'India', name: 'Indira Gandhi International' },
  'BOM': { city: 'Mumbai', country: 'India', name: 'Chhatrapati Shivaji' },
  'BLR': { city: 'Bangalore', country: 'India', name: 'Kempegowda International' },
  'MAA': { city: 'Chennai', country: 'India', name: 'Chennai International' },
  'HYD': { city: 'Hyderabad', country: 'India', name: 'Rajiv Gandhi International' },
  'CCU': { city: 'Kolkata', country: 'India', name: 'Netaji Subhas Chandra Bose' },
  'CMB': { city: 'Colombo', country: 'Sri Lanka', name: 'Bandaranaike International' },
  'KTM': { city: 'Kathmandu', country: 'Nepal', name: 'Tribhuvan International' },
  'DAC': { city: 'Dhaka', country: 'Bangladesh', name: 'Hazrat Shahjalal' },
  'KHI': { city: 'Karachi', country: 'Pakistan', name: 'Jinnah International' },
  'LHE': { city: 'Lahore', country: 'Pakistan', name: 'Allama Iqbal International' },
  'ISB': { city: 'Islamabad', country: 'Pakistan', name: 'New Islamabad International' },
  'TLV': { city: 'Tel Aviv', country: 'Israel', name: 'Ben Gurion International' },
  'ADD': { city: 'Addis Ababa', country: 'Ethiopia', name: 'Bole International' },
  'NBO': { city: 'Nairobi', country: 'Kenya', name: 'Jomo Kenyatta International' },
  'LOS': { city: 'Lagos', country: 'Nigeria', name: 'Murtala Muhammed' },
  'ACC': { city: 'Accra', country: 'Ghana', name: 'Kotoka International' },
  'JNB': { city: 'Johannesburg', country: 'South Africa', name: 'OR Tambo International' },
  'CPT': { city: 'Cape Town', country: 'South Africa', name: 'Cape Town International' },
  'CMN': { city: 'Casablanca', country: 'Morocco', name: 'Mohammed V International' },
  'TUN': { city: 'Tunis', country: 'Tunisia', name: 'Tunis-Carthage International' },
  'ALG': { city: 'Algiers', country: 'Algeria', name: 'Houari Boumediene' },
  'SYD': { city: 'Sydney', country: 'Australia', name: 'Kingsford Smith' },
  'MEL': { city: 'Melbourne', country: 'Australia', name: 'Melbourne Airport' },
  'BNE': { city: 'Brisbane', country: 'Australia', name: 'Brisbane Airport' },
  'PER': { city: 'Perth', country: 'Australia', name: 'Perth Airport' },
  'AKL': { city: 'Auckland', country: 'New Zealand', name: 'Auckland Airport' },
};

const getAirlineFromCode = (flightNumber) => {
  const code = flightNumber.replace(/[0-9]/g, '').toUpperCase().slice(0, 2);
  return AIRLINES[code] || '';
};

const getAirportInfo = (code) => {
  return AIRPORTS[code?.toUpperCase()] || null;
};

const AddFlight = ({ session }) => {
  const [searchMode, setSearchMode] = useState('number');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [flightFound, setFlightFound] = useState(null);

  const [flightNumber, setFlightNumber] = useState('');
  const [flightDate, setFlightDate] = useState('');

  const [fromCode, setFromCode] = useState('');
  const [toCode, setToCode] = useState('');
  const [routeDate, setRouteDate] = useState('');

  const [availableKg, setAvailableKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [categories, setCategories] = useState([]);

  const searchByFlightNumber = () => {
    if (!flightNumber || !flightDate) {
      setError('Please enter a flight number and date.');
      return;
    }
    setError('');

    const upperFlight = flightNumber.toUpperCase().trim();
    const depCode = upperFlight.slice(0, 2);
    const airline = getAirlineFromCode(upperFlight);

    setFlightFound({
      flight_number: upperFlight,
      airline: airline,
      from_city: '',
      from_code: '',
      to_city: '',
      to_code: '',
      flight_date: flightDate,
      needs_route: true,
    });
  };

  const searchByRoute = () => {
    if (!fromCode || !toCode || !routeDate) {
      setError('Please enter both airport codes and date.');
      return;
    }
    setError('');

    const from = getAirportInfo(fromCode);
    const to = getAirportInfo(toCode);

    if (!from) {
      setError(`Airport code "${fromCode.toUpperCase()}" not recognised. Please check and try again.`);
      return;
    }
    if (!to) {
      setError(`Airport code "${toCode.toUpperCase()}" not recognised. Please check and try again.`);
      return;
    }

    setFlightFound({
      flight_number: '',
      airline: '',
      from_city: from.city,
      from_code: fromCode.toUpperCase(),
      to_city: to.city,
      to_code: toCode.toUpperCase(),
      flight_date: routeDate,
      needs_route: false,
    });
  };

  const updateRouteOnFlight = (field, value) => {
    if (!flightFound) return;
    const updated = { ...flightFound, [field]: value };

    if (field === 'from_code') {
      const info = getAirportInfo(value);
      if (info) updated.from_city = info.city;
    }
    if (field === 'to_code') {
      const info = getAirportInfo(value);
      if (info) updated.to_city = info.city;
    }
    setFlightFound(updated);
  };

  const toggleCategory = (cat) => {
    setCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleSubmit = async () => {
    if (!flightFound) {
      setError('Please search for a flight first.');
      return;
    }
    if (!flightFound.from_code || !flightFound.to_code) {
      setError('Please enter the departure and arrival airport codes.');
      return;
    }
    if (!availableKg || !pricePerKg) {
      setError('Please enter available kg and price per kg.');
      return;
    }
    if (categories.length === 0) {
      setError('Please select at least one category.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('flights').insert([{
      user_id: session.user.id,
      from_city: flightFound.from_city,
      from_code: flightFound.from_code,
      to_city: flightFound.to_city,
      to_code: flightFound.to_code,
      flight_date: flightFound.flight_date,
      flight_number: flightFound.flight_number,
      airline: flightFound.airline,
      available_kg: parseFloat(availableKg),
      price_per_kg: parseFloat(pricePerKg),
      categories,
      status: 'active'
    }]);

    setLoading(false);
    if (error) setError(error.message);
    else {
      setSuccess(true);
      setFlightFound(null);
      setFlightNumber('');
      setFlightDate('');
      setFromCode('');
      setToCode('');
      setRouteDate('');
      setAvailableKg('');
      setPricePerKg('');
      setCategories([]);
    }
  };

  if (success) return (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <CheckCircle size={32} className="text-green-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Flight Listed!</h2>
      <p className="text-gray-400 text-sm mb-6">Your flight is now live and visible to shippers.</p>
      <button
        onClick={() => setSuccess(false)}
        className="bg-purple-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700"
      >
        Add Another Flight
      </button>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Add a Flight</h1>
        <p className="text-gray-400 text-sm mt-1">Enter your flight details to list your spare luggage space</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

        {/* Search Mode Toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => { setSearchMode('number'); setError(''); setFlightFound(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              searchMode === 'number' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            🔢 I Know My Flight Number
          </button>
          <button
            onClick={() => { setSearchMode('route'); setError(''); setFlightFound(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              searchMode === 'route' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            🗺️ I Know My Route
          </button>
        </div>

        {/* Search by Flight Number */}
        {searchMode === 'number' && !flightFound && (
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">
              Enter your flight number and date
            </label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input
                placeholder="e.g. EK087"
                value={flightNumber}
                onChange={e => setFlightNumber(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 uppercase"
              />
              <input
                type="date"
                value={flightDate}
                onChange={e => setFlightDate(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
            <button
              onClick={searchByFlightNumber}
              className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition flex items-center justify-center gap-2"
            >
              <Search size={16} /> Continue
            </button>
          </div>
        )}

        {/* Search by Route */}
        {searchMode === 'route' && !flightFound && (
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">
              Enter departure airport, arrival airport and date
            </label>
            <div className="grid grid-cols-3 gap-3 mb-1">
              <div>
                <input
                  placeholder="From (e.g. DXB)"
                  value={fromCode}
                  onChange={e => setFromCode(e.target.value.toUpperCase())}
                  maxLength={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 uppercase"
                />
                {fromCode.length === 3 && getAirportInfo(fromCode) && (
                  <p className="text-xs text-green-600 mt-1 ml-1">✓ {getAirportInfo(fromCode).city}</p>
                )}
              </div>
              <div>
                <input
                  placeholder="To (e.g. LHR)"
                  value={toCode}
                  onChange={e => setToCode(e.target.value.toUpperCase())}
                  maxLength={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 uppercase"
                />
                {toCode.length === 3 && getAirportInfo(toCode) && (
                  <p className="text-xs text-green-600 mt-1 ml-1">✓ {getAirportInfo(toCode).city}</p>
                )}
              </div>
              <input
                type="date"
                value={routeDate}
                onChange={e => setRouteDate(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
            <p className="text-xs text-gray-400 mb-3 ml-1">Use IATA airport codes — e.g. DXB, LHR, JFK, CDG</p>
            <button
              onClick={searchByRoute}
              className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition flex items-center justify-center gap-2"
            >
              <Search size={16} /> Confirm Route
            </button>
          </div>
        )}

        {/* Flight Found / Confirmed Card */}
        {flightFound && (
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plane size={16} className="text-purple-600" />
                <p className="text-sm font-bold text-purple-700">
                  {flightFound.flight_number && `${flightFound.flight_number} — `}
                  {flightFound.airline || 'Flight Details'}
                </p>
              </div>
              <button
                onClick={() => { setFlightFound(null); setError(''); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Change
              </button>
            </div>

            {/* If flight number mode — need to enter route */}
            {flightFound.needs_route ? (
              <div>
                <p className="text-xs text-gray-500 mb-2">Now enter your departure and arrival airports:</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      placeholder="From Code (e.g. DXB)"
                      value={flightFound.from_code}
                      onChange={e => updateRouteOnFlight('from_code', e.target.value.toUpperCase())}
                      maxLength={3}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 uppercase bg-white"
                    />
                    {flightFound.from_city && (
                      <p className="text-xs text-green-600 mt-1 ml-1">✓ {flightFound.from_city}</p>
                    )}
                  </div>
                  <div>
                    <input
                      placeholder="To Code (e.g. LHR)"
                      value={flightFound.to_code}
                      onChange={e => updateRouteOnFlight('to_code', e.target.value.toUpperCase())}
                      maxLength={3}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 uppercase bg-white"
                    />
                    {flightFound.to_city && (
                      <p className="text-xs text-green-600 mt-1 ml-1">✓ {flightFound.to_city}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm font-semibold text-gray-800">
                {flightFound.from_city} ({flightFound.from_code}) → {flightFound.to_city} ({flightFound.to_code})
              </p>
            )}

            <p className="text-xs text-gray-500">
              📅 {new Date(flightFound.flight_date).toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
              })}
            </p>
          </div>
        )}

        {/* Capacity & Price */}
        {flightFound && (
          <>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">📦 Capacity & Price</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <Package size={16} className="absolute left-3 top-3.5 text-gray-400" />
                  <input
                    type="number"
                    placeholder="Available kg (e.g. 20)"
                    value={availableKg}
                    onChange={e => setAvailableKg(e.target.value)}
                    className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                </div>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3 top-3.5 text-gray-400" />
                  <input
                    type="number"
                    placeholder="Price per kg (e.g. 8.50)"
                    value={pricePerKg}
                    onChange={e => setPricePerKg(e.target.value)}
                    className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">🏷️ What will you carry?</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                      categories.includes(cat)
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-red-500 text-xs bg-red-50 p-3 rounded-xl">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-purple-600 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'List My Flight →'}
            </button>
          </>
        )}

        {error && !flightFound && (
          <p className="text-red-500 text-xs bg-red-50 p-3 rounded-xl">{error}</p>
        )}
      </div>
    </div>
  );
};

export default AddFlight;