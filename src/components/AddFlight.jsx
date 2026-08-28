import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { AIRLINES, AIRLINE_CODES, CODE_TO_AIRLINE } from './shared/airlines';
import {
  Plane, Search, MapPin, Calendar, DollarSign,
  CheckCircle, AlertCircle, ShoppingBag,
  Briefcase, Package, Plus, X, Weight, AlertTriangle,
  Radar, ChevronDown, PenLine
} from 'lucide-react';

const FLIGHT_SEARCH_URL = 'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/flight-search';

// Live schedule lookup — proxies to AeroDataBox server-side (see
// supabase/functions/flight-search). Never throws for a "no data"
// outcome; the caller checks `unavailable`/`flights` and falls back
// to manual entry.
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

const AIRPORTS = [
  { code: 'DXB', city: 'Dubai', name: 'Dubai International', country: 'UAE' },
  { code: 'DWC', city: 'Dubai', name: 'Al Maktoum International', country: 'UAE' },
  { code: 'AUH', city: 'Abu Dhabi', name: 'Zayed International', country: 'UAE' },
  { code: 'SHJ', city: 'Sharjah', name: 'Sharjah International', country: 'UAE' },
  { code: 'RKT', city: 'Ras Al Khaimah', name: 'RAK International', country: 'UAE' },
  { code: 'FJR', city: 'Fujairah', name: 'Fujairah International', country: 'UAE' },
  { code: 'DOH', city: 'Doha', name: 'Hamad International', country: 'Qatar' },
  { code: 'KWI', city: 'Kuwait City', name: 'Kuwait International', country: 'Kuwait' },
  { code: 'BAH', city: 'Manama', name: 'Bahrain International', country: 'Bahrain' },
  { code: 'RUH', city: 'Riyadh', name: 'King Khalid International', country: 'Saudi Arabia' },
  { code: 'JED', city: 'Jeddah', name: 'King Abdulaziz International', country: 'Saudi Arabia' },
  { code: 'DMM', city: 'Dammam', name: 'King Fahd International', country: 'Saudi Arabia' },
  { code: 'MED', city: 'Medina', name: 'Prince Mohammad Bin Abdulaziz', country: 'Saudi Arabia' },
  { code: 'MCT', city: 'Muscat', name: 'Muscat International', country: 'Oman' },
  { code: 'SLL', city: 'Salalah', name: 'Salalah Airport', country: 'Oman' },
  { code: 'AMM', city: 'Amman', name: 'Queen Alia International', country: 'Jordan' },
  { code: 'BEY', city: 'Beirut', name: 'Rafic Hariri International', country: 'Lebanon' },
  { code: 'CAI', city: 'Cairo', name: 'Cairo International', country: 'Egypt' },
  { code: 'HRG', city: 'Hurghada', name: 'Hurghada International', country: 'Egypt' },
  { code: 'SSH', city: 'Sharm El Sheikh', name: 'Sharm El Sheikh International', country: 'Egypt' },
  { code: 'TLV', city: 'Tel Aviv', name: 'Ben Gurion International', country: 'Israel' },
  { code: 'GYD', city: 'Baku', name: 'Heydar Aliyev International', country: 'Azerbaijan' },
  { code: 'TBS', city: 'Tbilisi', name: 'Shota Rustaveli International', country: 'Georgia' },
  { code: 'LHR', city: 'London', name: 'Heathrow', country: 'UK' },
  { code: 'LGW', city: 'London', name: 'Gatwick', country: 'UK' },
  { code: 'STN', city: 'London', name: 'Stansted', country: 'UK' },
  { code: 'LTN', city: 'London', name: 'Luton', country: 'UK' },
  { code: 'MAN', city: 'Manchester', name: 'Manchester Airport', country: 'UK' },
  { code: 'BHX', city: 'Birmingham', name: 'Birmingham Airport', country: 'UK' },
  { code: 'EDI', city: 'Edinburgh', name: 'Edinburgh Airport', country: 'UK' },
  { code: 'GLA', city: 'Glasgow', name: 'Glasgow Airport', country: 'UK' },
  { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle', country: 'France' },
  { code: 'ORY', city: 'Paris', name: 'Orly', country: 'France' },
  { code: 'NCE', city: 'Nice', name: 'Nice Cote d Azur', country: 'France' },
  { code: 'LYS', city: 'Lyon', name: 'Saint-Exupery', country: 'France' },
  { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt Airport', country: 'Germany' },
  { code: 'MUC', city: 'Munich', name: 'Munich Airport', country: 'Germany' },
  { code: 'BER', city: 'Berlin', name: 'Brandenburg Airport', country: 'Germany' },
  { code: 'HAM', city: 'Hamburg', name: 'Hamburg Airport', country: 'Germany' },
  { code: 'DUS', city: 'Dusseldorf', name: 'Dusseldorf Airport', country: 'Germany' },
  { code: 'STR', city: 'Stuttgart', name: 'Stuttgart Airport', country: 'Germany' },
  { code: 'ZRH', city: 'Zurich', name: 'Zurich Airport', country: 'Switzerland' },
  { code: 'GVA', city: 'Geneva', name: 'Geneva Airport', country: 'Switzerland' },
  { code: 'BSL', city: 'Basel', name: 'EuroAirport Basel-Mulhouse', country: 'Switzerland' },
  { code: 'AMS', city: 'Amsterdam', name: 'Schiphol', country: 'Netherlands' },
  { code: 'EIN', city: 'Eindhoven', name: 'Eindhoven Airport', country: 'Netherlands' },
  { code: 'MAD', city: 'Madrid', name: 'Adolfo Suarez Barajas', country: 'Spain' },
  { code: 'BCN', city: 'Barcelona', name: 'El Prat', country: 'Spain' },
  { code: 'AGP', city: 'Malaga', name: 'Malaga Airport', country: 'Spain' },
  { code: 'VLC', city: 'Valencia', name: 'Valencia Airport', country: 'Spain' },
  { code: 'PMI', city: 'Palma', name: 'Palma de Mallorca', country: 'Spain' },
  { code: 'TFS', city: 'Tenerife', name: 'Tenerife South', country: 'Spain' },
  { code: 'LPA', city: 'Gran Canaria', name: 'Gran Canaria Airport', country: 'Spain' },
  { code: 'FCO', city: 'Rome', name: 'Fiumicino', country: 'Italy' },
  { code: 'MXP', city: 'Milan', name: 'Malpensa', country: 'Italy' },
  { code: 'LIN', city: 'Milan', name: 'Linate', country: 'Italy' },
  { code: 'BGY', city: 'Milan', name: 'Bergamo Orio al Serio', country: 'Italy' },
  { code: 'VCE', city: 'Venice', name: 'Marco Polo', country: 'Italy' },
  { code: 'NAP', city: 'Naples', name: 'Naples International', country: 'Italy' },
  { code: 'CTA', city: 'Catania', name: 'Fontanarossa', country: 'Italy' },
  { code: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Turkey' },
  { code: 'SAW', city: 'Istanbul', name: 'Sabiha Gokcen', country: 'Turkey' },
  { code: 'AYT', city: 'Antalya', name: 'Antalya Airport', country: 'Turkey' },
  { code: 'ADB', city: 'Izmir', name: 'Adnan Menderes', country: 'Turkey' },
  { code: 'ESB', city: 'Ankara', name: 'Esenboga Airport', country: 'Turkey' },
  { code: 'ATH', city: 'Athens', name: 'Eleftherios Venizelos', country: 'Greece' },
  { code: 'SKG', city: 'Thessaloniki', name: 'Macedonia Airport', country: 'Greece' },
  { code: 'HER', city: 'Heraklion', name: 'Nikos Kazantzakis', country: 'Greece' },
  { code: 'RHO', city: 'Rhodes', name: 'Diagoras Airport', country: 'Greece' },
  { code: 'VIE', city: 'Vienna', name: 'Vienna International', country: 'Austria' },
  { code: 'BRU', city: 'Brussels', name: 'Brussels Airport', country: 'Belgium' },
  { code: 'CPH', city: 'Copenhagen', name: 'Kastrup', country: 'Denmark' },
  { code: 'ARN', city: 'Stockholm', name: 'Arlanda', country: 'Sweden' },
  { code: 'GOT', city: 'Gothenburg', name: 'Landvetter', country: 'Sweden' },
  { code: 'HEL', city: 'Helsinki', name: 'Helsinki-Vantaa', country: 'Finland' },
  { code: 'OSL', city: 'Oslo', name: 'Gardermoen', country: 'Norway' },
  { code: 'WAW', city: 'Warsaw', name: 'Chopin Airport', country: 'Poland' },
  { code: 'KRK', city: 'Krakow', name: 'John Paul II', country: 'Poland' },
  { code: 'PRG', city: 'Prague', name: 'Vaclav Havel', country: 'Czech Republic' },
  { code: 'BUD', city: 'Budapest', name: 'Ferenc Liszt', country: 'Hungary' },
  { code: 'OTP', city: 'Bucharest', name: 'Henri Coanda', country: 'Romania' },
  { code: 'SOF', city: 'Sofia', name: 'Sofia Airport', country: 'Bulgaria' },
  { code: 'LIS', city: 'Lisbon', name: 'Humberto Delgado', country: 'Portugal' },
  { code: 'OPO', city: 'Porto', name: 'Francisco Sa Carneiro', country: 'Portugal' },
  { code: 'FAO', city: 'Faro', name: 'Faro Airport', country: 'Portugal' },
  { code: 'DUB', city: 'Dublin', name: 'Dublin Airport', country: 'Ireland' },
  { code: 'RIX', city: 'Riga', name: 'Riga International', country: 'Latvia' },
  { code: 'TLL', city: 'Tallinn', name: 'Lennart Meri', country: 'Estonia' },
  { code: 'LUX', city: 'Luxembourg', name: 'Luxembourg Findel', country: 'Luxembourg' },
  { code: 'MLA', city: 'Malta', name: 'Malta International', country: 'Malta' },
  { code: 'LCA', city: 'Larnaca', name: 'Larnaca International', country: 'Cyprus' },
  { code: 'JFK', city: 'New York', name: 'John F Kennedy', country: 'USA' },
  { code: 'LGA', city: 'New York', name: 'LaGuardia', country: 'USA' },
  { code: 'EWR', city: 'New York', name: 'Newark Liberty', country: 'USA' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', country: 'USA' },
  { code: 'ORD', city: 'Chicago', name: 'O Hare International', country: 'USA' },
  { code: 'MDW', city: 'Chicago', name: 'Midway International', country: 'USA' },
  { code: 'ATL', city: 'Atlanta', name: 'Hartsfield-Jackson', country: 'USA' },
  { code: 'DFW', city: 'Dallas', name: 'Dallas Fort Worth', country: 'USA' },
  { code: 'MIA', city: 'Miami', name: 'Miami International', country: 'USA' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco International', country: 'USA' },
  { code: 'BOS', city: 'Boston', name: 'Logan International', country: 'USA' },
  { code: 'IAD', city: 'Washington DC', name: 'Dulles International', country: 'USA' },
  { code: 'SEA', city: 'Seattle', name: 'Seattle-Tacoma', country: 'USA' },
  { code: 'LAS', city: 'Las Vegas', name: 'Harry Reid International', country: 'USA' },
  { code: 'DEN', city: 'Denver', name: 'Denver International', country: 'USA' },
  { code: 'PHX', city: 'Phoenix', name: 'Sky Harbor International', country: 'USA' },
  { code: 'MCO', city: 'Orlando', name: 'Orlando International', country: 'USA' },
  { code: 'YYZ', city: 'Toronto', name: 'Pearson International', country: 'Canada' },
  { code: 'YVR', city: 'Vancouver', name: 'Vancouver International', country: 'Canada' },
  { code: 'YUL', city: 'Montreal', name: 'Pierre Elliott Trudeau', country: 'Canada' },
  { code: 'YYC', city: 'Calgary', name: 'Calgary International', country: 'Canada' },
  { code: 'GRU', city: 'Sao Paulo', name: 'Guarulhos International', country: 'Brazil' },
  { code: 'GIG', city: 'Rio de Janeiro', name: 'Galeao International', country: 'Brazil' },
  { code: 'EZE', city: 'Buenos Aires', name: 'Ministro Pistarini', country: 'Argentina' },
  { code: 'SCL', city: 'Santiago', name: 'Arturo Merino Benitez', country: 'Chile' },
  { code: 'LIM', city: 'Lima', name: 'Jorge Chavez International', country: 'Peru' },
  { code: 'BOG', city: 'Bogota', name: 'El Dorado International', country: 'Colombia' },
  { code: 'MEX', city: 'Mexico City', name: 'Benito Juarez International', country: 'Mexico' },
  { code: 'CUN', city: 'Cancun', name: 'Cancun International', country: 'Mexico' },
  { code: 'SIN', city: 'Singapore', name: 'Changi Airport', country: 'Singapore' },
  { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi', country: 'Thailand' },
  { code: 'DMK', city: 'Bangkok', name: 'Don Mueang', country: 'Thailand' },
  { code: 'HKT', city: 'Phuket', name: 'Phuket International', country: 'Thailand' },
  { code: 'KUL', city: 'Kuala Lumpur', name: 'KLIA', country: 'Malaysia' },
  { code: 'CGK', city: 'Jakarta', name: 'Soekarno-Hatta', country: 'Indonesia' },
  { code: 'DPS', city: 'Bali', name: 'Ngurah Rai International', country: 'Indonesia' },
  { code: 'MNL', city: 'Manila', name: 'Ninoy Aquino International', country: 'Philippines' },
  { code: 'SGN', city: 'Ho Chi Minh City', name: 'Tan Son Nhat International', country: 'Vietnam' },
  { code: 'HAN', city: 'Hanoi', name: 'Noi Bai International', country: 'Vietnam' },
  { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong International', country: 'Hong Kong' },
  { code: 'NRT', city: 'Tokyo', name: 'Narita International', country: 'Japan' },
  { code: 'HND', city: 'Tokyo', name: 'Haneda', country: 'Japan' },
  { code: 'KIX', city: 'Osaka', name: 'Kansai International', country: 'Japan' },
  { code: 'ICN', city: 'Seoul', name: 'Incheon International', country: 'South Korea' },
  { code: 'GMP', city: 'Seoul', name: 'Gimpo International', country: 'South Korea' },
  { code: 'PUS', city: 'Busan', name: 'Gimhae International', country: 'South Korea' },
  { code: 'PVG', city: 'Shanghai', name: 'Pudong International', country: 'China' },
  { code: 'PEK', city: 'Beijing', name: 'Capital International', country: 'China' },
  { code: 'CAN', city: 'Guangzhou', name: 'Baiyun International', country: 'China' },
  { code: 'SZX', city: 'Shenzhen', name: 'Bao an International', country: 'China' },
  { code: 'CTU', city: 'Chengdu', name: 'Tianfu International', country: 'China' },
  { code: 'SYD', city: 'Sydney', name: 'Kingsford Smith', country: 'Australia' },
  { code: 'MEL', city: 'Melbourne', name: 'Melbourne Airport', country: 'Australia' },
  { code: 'BNE', city: 'Brisbane', name: 'Brisbane Airport', country: 'Australia' },
  { code: 'PER', city: 'Perth', name: 'Perth Airport', country: 'Australia' },
  { code: 'AKL', city: 'Auckland', name: 'Auckland Airport', country: 'New Zealand' },
  { code: 'DEL', city: 'New Delhi', name: 'Indira Gandhi International', country: 'India' },
  { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj', country: 'India' },
  { code: 'BLR', city: 'Bangalore', name: 'Kempegowda International', country: 'India' },
  { code: 'MAA', city: 'Chennai', name: 'Chennai International', country: 'India' },
  { code: 'HYD', city: 'Hyderabad', name: 'Rajiv Gandhi International', country: 'India' },
  { code: 'COK', city: 'Kochi', name: 'Cochin International', country: 'India' },
  { code: 'GOI', city: 'Goa', name: 'Dabolim Airport', country: 'India' },
  { code: 'ISB', city: 'Islamabad', name: 'New Islamabad International', country: 'Pakistan' },
  { code: 'LHE', city: 'Lahore', name: 'Allama Iqbal International', country: 'Pakistan' },
  { code: 'KHI', city: 'Karachi', name: 'Jinnah International', country: 'Pakistan' },
  { code: 'DAC', city: 'Dhaka', name: 'Hazrat Shahjalal International', country: 'Bangladesh' },
  { code: 'CMB', city: 'Colombo', name: 'Bandaranaike International', country: 'Sri Lanka' },
  { code: 'KTM', city: 'Kathmandu', name: 'Tribhuvan International', country: 'Nepal' },
  { code: 'JNB', city: 'Johannesburg', name: 'OR Tambo International', country: 'South Africa' },
  { code: 'CPT', city: 'Cape Town', name: 'Cape Town International', country: 'South Africa' },
  { code: 'NBO', city: 'Nairobi', name: 'Jomo Kenyatta International', country: 'Kenya' },
  { code: 'ADD', city: 'Addis Ababa', name: 'Bole International', country: 'Ethiopia' },
  { code: 'LOS', city: 'Lagos', name: 'Murtala Muhammed', country: 'Nigeria' },
  { code: 'CMN', city: 'Casablanca', name: 'Mohammed V International', country: 'Morocco' },
  { code: 'RAK', city: 'Marrakech', name: 'Menara Airport', country: 'Morocco' },
  { code: 'TUN', city: 'Tunis', name: 'Carthage International', country: 'Tunisia' },
  { code: 'ALG', city: 'Algiers', name: 'Houari Boumediene', country: 'Algeria' },
  { code: 'MRU', city: 'Mauritius', name: 'Sir Seewoosagur Ramgoolam', country: 'Mauritius' },
  { code: 'ALA', city: 'Almaty', name: 'Almaty International', country: 'Kazakhstan' },
  { code: 'TAS', city: 'Tashkent', name: 'Islam Karimov International', country: 'Uzbekistan' },
];

// ── Airport Search Component ──
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
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <MapPin size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
        <input type="text" value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => query.length > 0 && results.length > 0 && setOpen(true)}
          placeholder={placeholder || 'Search city, airport or code...'}
          className="input-field pl-9"
          autoComplete="off" />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {results.map(airport => (
            <button key={airport.code} type="button" onClick={() => handleSelect(airport)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50 text-left transition border-b border-gray-50 last:border-0">
              <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-violet-600">{airport.code}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{airport.city}</p>
                <p className="text-xs text-gray-400 truncate">
                  {airport.name}{airport.country ? ` · ${airport.country}` : ''}
                </p>
              </div>
            </button>
          ))}
          <button type="button"
            onClick={() => { setShowManual(true); setOpen(false); setQuery(''); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-t border-gray-100">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-gray-500">?</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600">Not listed</p>
              <p className="text-xs text-gray-400">Enter manually</p>
            </div>
          </button>
        </div>
      )}
      {showManual && (
        <div className="mt-2 bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-2">
          <p className="text-xs font-semibold text-gray-600">Enter airport manually</p>
          <input type="text" placeholder="3-letter code (e.g. XYZ)"
            value={manualCode}
            onChange={e => setManualCode(e.target.value.toUpperCase().slice(0, 3))}
            maxLength={3} className="input-field py-2 text-sm font-mono" />
          <input type="text" placeholder="City name" value={manualCity}
            onChange={e => setManualCity(e.target.value)}
            className="input-field py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={() => { setShowManual(false); setManualCode(''); setManualCity(''); }}
              className="flex-1 btn-secondary py-2 text-xs">Cancel</button>
            <button onClick={handleManualSave}
              disabled={!manualCode || manualCode.length < 2 || !manualCity}
              className="flex-1 btn-primary py-2 text-xs disabled:opacity-50">Confirm</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Airline Search Component ──
const AirlineSearch = ({ label, value, onChange, suggestions = [], suggestionsLabel }) => {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  React.useEffect(() => { setQuery(value || ''); }, [value]);

  React.useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        // Freeform fallback — accept a typed name even if it's not in our list
        setQuery(q => {
          if (q.trim() && q.trim() !== value) onChange(q.trim());
          return q;
        });
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [value, onChange]);

  const handleSearch = (q) => {
    setQuery(q);
    if (q.length < 1) { setResults([]); setOpen(false); return; }
    const lq = q.toLowerCase();
    const filtered = AIRLINES.filter(name =>
      name.toLowerCase().includes(lq) || AIRLINE_CODES[name].toLowerCase().startsWith(lq)
    ).slice(0, 8);
    setResults(filtered);
    setOpen(true);
  };

  const handleSelect = (name) => {
    setQuery(name);
    setOpen(false);
    setResults([]);
    onChange(name);
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <Plane size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
        <input type="text" value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => query.length > 0 && results.length > 0 && setOpen(true)}
          placeholder="Search airline name or code..."
          className="input-field pl-9"
          autoComplete="off" />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {results.map(name => (
            <button key={name} type="button" onClick={() => handleSelect(name)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50 text-left transition border-b border-gray-50 last:border-0">
              <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-violet-600">{AIRLINE_CODES[name]}</span>
              </div>
              <p className="text-sm font-semibold text-gray-800 flex-1 min-w-0 truncate">{name}</p>
            </button>
          ))}
        </div>
      )}
      {!open && !value && suggestions.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-gray-400 mb-1.5">{suggestionsLabel}</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(name => (
              <button key={name} type="button" onClick={() => handleSelect(name)}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-full bg-violet-50 text-violet-700 hover:bg-violet-100 transition">
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Luggage Option Card ──
const getNetEarnings = (kg, ppk) => {
  if (!kg || !ppk) return null;
  const gross = parseFloat(kg) * parseFloat(ppk);
  if (gross <= 0) return null;
  let pct = 0.10;
  if (gross >= 500) pct = 0.07;
  else if (gross >= 200) pct = 0.085;
  else if (gross < 20) pct = 0.12;
  return { gross, net: gross * (1 - pct), fee: gross * pct, pct: Math.round(pct * 100) };
};

const LuggageOptionCard = ({ type, data, onChange, onRemove }) => {
  const isCarryOn = type === 'carry_on';
  const earnings = getNetEarnings(data.available_kg, data.price_per_kg);

  return (
    <div className={`rounded-2xl border-2 p-4 space-y-3 ${
      isCarryOn ? 'border-blue-200 bg-blue-50/40' : 'border-emerald-200 bg-emerald-50/40'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            isCarryOn ? 'bg-blue-100' : 'bg-emerald-100'
          }`}>
            {isCarryOn
              ? <Briefcase size={17} className="text-blue-600" />
              : <Package size={17} className="text-emerald-600" />
            }
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">
              {isCarryOn ? '✈️ Hand Luggage' : '🧳 Check-in Luggage'}
            </p>
            <p className="text-xs text-gray-400">
              {isCarryOn ? 'Max 10kg · cabin bag' : 'Max 32kg · hold luggage'}
            </p>
          </div>
        </div>
        <button onClick={onRemove}
          className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-red-50 transition">
          <X size={14} className="text-red-400" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
            kg available
          </label>
          <div className="relative">
            <Weight size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input type="number"
              placeholder={isCarryOn ? 'e.g. 5' : 'e.g. 15'}
              min="0.5" max={isCarryOn ? '10' : '32'} step="0.5"
              value={data.available_kg}
              onChange={e => onChange({ ...data, available_kg: e.target.value })}
              className="input-field pl-8 py-2.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
            Price/kg ($)
          </label>
          <div className="relative">
            <DollarSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input type="number"
              placeholder={isCarryOn ? 'e.g. 15' : 'e.g. 8'}
              min="1" step="0.5"
              value={data.price_per_kg}
              onChange={e => onChange({ ...data, price_per_kg: e.target.value })}
              className="input-field pl-8 py-2.5 text-sm" />
          </div>
        </div>
      </div>

      {earnings && (
        <div className="bg-white rounded-xl p-3 border border-gray-100 space-y-1 text-xs">
          <div className="flex justify-between text-gray-500">
            <span>Gross ({data.available_kg}kg × ${data.price_per_kg})</span>
            <span>${earnings.gross.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-red-400">
            <span>Fetchr service fee ({earnings.pct}%)</span>
            <span>-${earnings.fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-emerald-600 border-t border-gray-100 pt-1">
            <span>Your net earnings</span>
            <span>${earnings.net.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main AddFlight Component ──
const AddFlight = ({ session }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    from_city: '', from_code: '',
    to_city: '', to_code: '',
    flight_date: '', flight_number: '', airline: '',
    categories: [], notes: '',
    safetyAcknowledged: false,
    delivery_type: 'handover',
    shop_and_ship_fee: '',
    handover_location_departure: '',
    handover_location_arrival: '',
  });
  const [luggageOptions, setLuggageOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [routeData, setRouteData] = useState(null);

  // Live schedule search state — two entry points into the same
  // AeroDataBox-backed lookup: by flight number, or by route + date.
  const [searchTab, setSearchTab] = useState('number'); // 'number' | 'route'
  const [numberSearching, setNumberSearching] = useState(false);
  const [numberResults, setNumberResults] = useState(null); // null = not searched, [] = searched, no match
  const [numberNote, setNumberNote] = useState('');
  const [routeSearching, setRouteSearching] = useState(false);
  const [routeResults, setRouteResults] = useState(null);
  const [routeNote, setRouteNote] = useState('');
  const [showManualFields, setShowManualFields] = useState(false);

  // Route/airline suggestion data is ~80KB gzipped — load it lazily so it
  // doesn't bloat the initial bundle for users who never open this screen.
  React.useEffect(() => { import('./shared/routes').then(setRouteData); }, []);

  const today = new Date().toISOString().split('T')[0];
  const hasCarryOn = luggageOptions.some(l => l.type === 'carry_on');
  const hasCheckin = luggageOptions.some(l => l.type === 'checkin');

  // "Popular routes for this airline" — helps fill the route in one tap
  // once the airline is known (via flight number or manual pick).
  const suggestedRoutesForAirline = (() => {
    const code = AIRLINE_CODES[form.airline];
    if (!routeData || !code || (form.from_code && form.to_code)) return [];
    return (routeData.AIRLINE_ROUTES[code] || []).slice(0, 6).map(r => {
      const [fromCode, toCode] = r.split('-');
      const from = AIRPORTS.find(a => a.code === fromCode);
      const to = AIRPORTS.find(a => a.code === toCode);
      return from && to ? { fromCode, toCode, from, to } : null;
    }).filter(Boolean);
  })();

  // "Airlines flying this route" — helps fill the airline in one tap
  // once both airports are known.
  const suggestedAirlinesForRoute = (() => {
    if (!routeData || !form.from_code || !form.to_code || form.airline) return [];
    const codes = routeData.ROUTE_AIRLINES[`${form.from_code}-${form.to_code}`] || [];
    return codes.map(c => CODE_TO_AIRLINE[c]).filter(Boolean).slice(0, 6);
  })();

  const addLuggageOption = (type) => {
    if (type === 'carry_on' && hasCarryOn) return;
    if (type === 'checkin' && hasCheckin) return;
    setLuggageOptions(prev => [...prev, { type, available_kg: '', price_per_kg: '' }]);
  };

  const updateLuggageOption = (index, data) => {
    setLuggageOptions(prev => prev.map((l, i) => i === index ? data : l));
  };

  const removeLuggageOption = (index) => {
    setLuggageOptions(prev => prev.filter((_, i) => i !== index));
  };

  // Live airline detection — runs on every keystroke, no button needed.
  // IATA flight numbers always start with the airline's 2-character code
  // (which can be alphanumeric, e.g. "6E" IndiGo, "9W" Jet Airways).
  const handleFlightNumberChange = (raw) => {
    const upper = raw.toUpperCase();
    const prefix = upper.replace(/\s/g, '').slice(0, 2);
    const detected = CODE_TO_AIRLINE[prefix];
    setForm(prev => ({
      ...prev,
      flight_number: upper,
      airline: detected || prev.airline,
    }));
  };

  // Resolve an AeroDataBox airport (iata/name/city) against our own
  // AIRPORTS list first, so results match what AirportSearch expects —
  // falling back to whatever the API returned if it's not one we list.
  const resolveAirport = (apiAirport) => {
    if (!apiAirport?.iata) return null;
    const known = AIRPORTS.find(a => a.code === apiAirport.iata);
    return known || { code: apiAirport.iata, city: apiAirport.city || apiAirport.iata, name: apiAirport.name || apiAirport.iata };
  };

  const applyScheduleResult = (flight) => {
    const from = resolveAirport(flight.from);
    const to = resolveAirport(flight.to);
    setForm(prev => ({
      ...prev,
      flight_number: flight.flightNumber || prev.flight_number,
      airline: flight.airline || prev.airline,
      from_code: from?.code || prev.from_code, from_city: from?.city || prev.from_city,
      to_code: to?.code || prev.to_code, to_city: to?.city || prev.to_city,
    }));
    setSuccessMsg(`✓ ${flight.flightNumber} · ${flight.airline || 'Airline'} — ${from?.city || flight.from?.iata} → ${to?.city || flight.to?.iata}. Please verify and continue.`);
  };

  // Live schedule search by flight number + date — real scheduled-flight
  // data (works for future dates, unlike the old ADS-B-only lookup),
  // proxied through the flight-search edge function.
  const searchByNumber = async () => {
    if (!form.flight_number.trim()) return;
    if (!form.flight_date) { setError('Pick a flight date first.'); return; }
    if (form.flight_date < today) { setError('Flight date cannot be in the past.'); return; }
    setNumberSearching(true); setNumberResults(null); setNumberNote('');
    setError(''); setSuccessMsg('');

    try {
      const result = await searchFlightSchedule('by_number', {
        flightNumber: form.flight_number, date: form.flight_date,
      });
      if (result.unavailable) {
        setNumberNote("Couldn't reach live flight search — fill in the details below.");
        setShowManualFields(true);
      } else if (result.flights.length === 0) {
        setNumberNote('No scheduled flight found for that number and date. Fill in the details below.');
        setShowManualFields(true);
      } else if (result.flights.length === 1) {
        applyScheduleResult(result.flights[0]);
      } else {
        setNumberResults(result.flights);
      }
    } catch (e) {
      setNumberNote("Couldn't reach live flight search — fill in the details below.");
      setShowManualFields(true);
    }
    setNumberSearching(false);
  };

  // Browse every scheduled flight on a route for a given date —
  // requires both airports to already be picked below.
  const searchByRoute = async () => {
    if (!form.from_code || !form.to_code) { setError('Pick departure and arrival airports first.'); return; }
    if (!form.flight_date) { setError('Pick a flight date first.'); return; }
    if (form.flight_date < today) { setError('Flight date cannot be in the past.'); return; }
    setRouteSearching(true); setRouteResults(null); setRouteNote('');
    setError(''); setSuccessMsg('');

    try {
      const result = await searchFlightSchedule('by_route', {
        fromIata: form.from_code, toIata: form.to_code, date: form.flight_date,
      });
      if (result.unavailable) {
        setRouteNote("Couldn't reach live flight search — pick your airline below.");
        setShowManualFields(true);
      } else if (result.flights.length === 0) {
        setRouteNote('No scheduled flights found on this route for that date. Pick your airline below.');
        setShowManualFields(true);
      } else {
        setRouteResults(result.flights);
      }
    } catch (e) {
      setRouteNote("Couldn't reach live flight search — pick your airline below.");
      setShowManualFields(true);
    }
    setRouteSearching(false);
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
    if (!form.flight_date) { setError('Please select a flight date.'); return false; }
    if (form.flight_date < today) { setError('Flight date cannot be in the past.'); return false; }
    if (!form.from_code) { setShowManualFields(true); setError('Please select departure airport.'); return false; }
    if (!form.to_code) { setShowManualFields(true); setError('Please select arrival airport.'); return false; }
    if (form.from_code === form.to_code) { setShowManualFields(true); setError('Departure and arrival cannot be the same.'); return false; }
    if (!form.airline) { setShowManualFields(true); setError('Please select your airline.'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (luggageOptions.length === 0) {
      setError('Please add at least one luggage option.'); return false;
    }
    for (const opt of luggageOptions) {
      if (!opt.available_kg || parseFloat(opt.available_kg) <= 0) {
        setError(`Please enter kg for ${opt.type === 'carry_on' ? 'hand luggage' : 'check-in'}.`);
        return false;
      }
      if (!opt.price_per_kg || parseFloat(opt.price_per_kg) <= 0) {
        setError(`Please enter price/kg for ${opt.type === 'carry_on' ? 'hand luggage' : 'check-in'}.`);
        return false;
      }
      if (opt.type === 'carry_on' && parseFloat(opt.available_kg) > 10) {
        setError('Hand luggage maximum is 10kg.'); return false;
      }
      if (opt.type === 'checkin' && parseFloat(opt.available_kg) > 32) {
        setError('Check-in luggage maximum is 32kg.'); return false;
      }
    }
    if (form.categories.length === 0) {
      setError('Please select at least one item category.'); return false;
    }
    if (!form.safetyAcknowledged) {
      setError('Please accept the safety declaration to continue.'); return false;
    }
    return true;
  };

  const handleNext = () => {
    setError(''); setSuccessMsg('');
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const saveFlight = async () => {
    setLoading(true); setError('');
    const primary = luggageOptions[0];
    const totalKg = luggageOptions.reduce((s, l) => s + parseFloat(l.available_kg || 0), 0);
    const luggageJson = JSON.stringify(luggageOptions.map(l => ({
      type: l.type,
      available_kg: parseFloat(l.available_kg),
      price_per_kg: parseFloat(l.price_per_kg),
    })));

    const { error } = await supabase.from('flights').insert([{
      user_id: session.user.id,
      from_city: form.from_city,
      from_code: form.from_code,
      to_city: form.to_city,
      to_code: form.to_code,
      flight_date: form.flight_date,
      flight_number: form.flight_number,
      airline: form.airline,
      available_kg: totalKg,
      price_per_kg: parseFloat(primary.price_per_kg),
      luggage_options: luggageOptions.map(l => ({
        type: l.type,
        available_kg: parseFloat(l.available_kg),
        price_per_kg: parseFloat(l.price_per_kg),
      })),
      categories: form.categories,
      notes: [form.notes, `Luggage options: ${luggageJson}`].filter(Boolean).join('\n'),
      status: 'active',
      delivery_type: form.delivery_type,
      shop_and_ship_fee: parseFloat(form.shop_and_ship_fee) || 0,
      handover_location_departure: form.handover_location_departure,
      handover_location_arrival: form.handover_location_arrival,
    }]);

    if (error) { setError(error.message); } else { setSuccess(true); }
    setLoading(false);
  };

  const resetForm = () => {
    setSuccess(false); setStep(1); setError(''); setSuccessMsg('');
    setForm({
      from_city: '', from_code: '', to_city: '', to_code: '',
      flight_date: '', flight_number: '', airline: '',
      categories: [], notes: '', safetyAcknowledged: false,
      delivery_type: 'handover', shop_and_ship_fee: '',
      handover_location_departure: '', handover_location_arrival: '',
    });
    setLuggageOptions([]);
    setSearchTab('number');
    setNumberResults(null); setNumberNote('');
    setRouteResults(null); setRouteNote('');
    setShowManualFields(false);
  };

  const totalKg = luggageOptions.reduce((s, l) => s + (parseFloat(l.available_kg) || 0), 0);
  const totalNet = luggageOptions.reduce((s, l) => {
    const e = getNetEarnings(l.available_kg, l.price_per_kg);
    return s + (e?.net || 0);
  }, 0);

  // ── Success screen ──
  if (success) return (
    <div className="max-w-xl mx-auto py-16 px-6 text-center animate-fade-in">
      <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={40} className="text-emerald-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Flight Listed!</h2>
      <p className="text-gray-500 mb-6">
        Your flight from <strong>{form.from_city}</strong> to <strong>{form.to_city}</strong> is now live.
      </p>
      <div className="bg-gray-50 rounded-2xl p-5 mb-6 text-left space-y-2.5 border border-gray-100">
        {[
          { label: 'Route', value: `${form.from_code} → ${form.to_code}` },
          { label: 'Date', value: new Date(form.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) },
          { label: 'Airline', value: `${form.airline}${form.flight_number ? ` · ${form.flight_number}` : ''}` },
          { label: 'Total capacity', value: `${totalKg.toFixed(1)}kg` },
          { label: 'Luggage types', value: luggageOptions.map(l => l.type === 'carry_on' ? '✈️ Hand' : '🧳 Check-in').join(' + ') },
          { label: 'Max net earnings', value: `$${totalNet.toFixed(2)} after fees` },
        ].map((row, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-500">{row.label}</span>
            <span className="font-semibold text-gray-900">{row.value}</span>
          </div>
        ))}
      </div>
      <button onClick={resetForm} className="w-full btn-primary py-3">Add Another Flight</button>
    </div>
  );

  return (
    <div className="max-w-xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">List Your Flight</h1>
        <p className="text-gray-500 text-sm mt-0.5">Earn money using your spare luggage capacity</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { n: 1, label: 'Flight Info' },
          { n: 2, label: 'Capacity & Safety' },
          { n: 3, label: 'Delivery' },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${
                step > s.n ? 'bg-emerald-500 text-white' :
                step === s.n ? 'bg-violet-600 text-white shadow-button' : 'bg-gray-100 text-gray-400'
              }`}>
                {step > s.n ? <CheckCircle size={16} /> : s.n}
              </div>
              <span className={`text-xs font-semibold hidden sm:block ${
                step === s.n ? 'text-violet-600' : 'text-gray-400'
              }`}>{s.label}</span>
            </div>
            {i < 2 && <div className={`flex-1 h-0.5 rounded-full ${step > s.n ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm px-4 py-3 rounded-xl mb-4">
          <CheckCircle size={16} className="flex-shrink-0" /> {successMsg}
        </div>
      )}

      {/* ── STEP 1: Flight Info ── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Date comes first — both search modes need it, and it can never be in the past */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Flight Date * <span className="text-gray-300 font-normal normal-case">(dd/mm/yyyy)</span>
            </label>
            <div className="relative">
              <Calendar size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
              <input type="date" min={today} value={form.flight_date}
                onChange={e => setForm({ ...form, flight_date: e.target.value })}
                className="input-field pl-9" />
            </div>
            {form.flight_date && (
              <p className="text-xs text-gray-400 mt-1 ml-1">
                {new Date(form.flight_date).toLocaleDateString('en-GB', {
                  day: '2-digit', month: '2-digit', year: 'numeric'
                })}
              </p>
            )}
          </div>

          {/* Live schedule search — flight number or route + date */}
          <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Radar size={15} className="text-violet-600" />
              <p className="text-sm font-semibold text-violet-700">Find your flight</p>
            </div>

            <div className="flex gap-1 bg-white/70 rounded-xl p-1">
              <button type="button" onClick={() => setSearchTab('number')}
                className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${
                  searchTab === 'number' ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:bg-white'
                }`}>
                By flight number
              </button>
              <button type="button" onClick={() => setSearchTab('route')}
                className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${
                  searchTab === 'route' ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:bg-white'
                }`}>
                By route
              </button>
            </div>

            {searchTab === 'number' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Type your flight number — we'll fill in the airline and route automatically.
                </p>
                <div className="flex gap-2">
                  <input type="text" placeholder="e.g. EK203, 6E204, QR542..."
                    value={form.flight_number}
                    onChange={e => handleFlightNumberChange(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchByNumber()}
                    className="input-field flex-1" />
                  <button type="button" onClick={searchByNumber}
                    disabled={numberSearching || !form.flight_number.trim() || !form.flight_date}
                    className="btn-primary px-4 gap-2 flex-shrink-0 disabled:opacity-50">
                    <Search size={15} />
                    {numberSearching ? '...' : 'Search'}
                  </button>
                </div>
                {!form.flight_date && form.flight_number && (
                  <p className="text-xs text-amber-600">Pick a flight date above first.</p>
                )}
                {form.airline && !numberResults?.length && (
                  <p className="text-xs text-emerald-600 font-semibold">✓ Airline detected: {form.airline}</p>
                )}
                {numberNote && <p className="text-xs text-gray-500">{numberNote}</p>}
                {numberResults?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-500">Multiple matches — pick yours:</p>
                    {numberResults.map((f, i) => (
                      <button key={i} type="button"
                        onClick={() => { applyScheduleResult(f); setNumberResults(null); }}
                        className="w-full text-left bg-white rounded-xl px-3 py-2.5 border border-gray-100 hover:border-violet-300 transition">
                        <p className="text-sm font-bold text-gray-800">{f.flightNumber} · {f.airline || 'Unknown airline'}</p>
                        <p className="text-xs text-gray-400">
                          {f.from?.iata || '?'} → {f.to?.iata || '?'}
                          {f.departureLocal ? ` · dep ${new Date(f.departureLocal).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {searchTab === 'route' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Pick your departure and arrival airports below, then browse every scheduled flight for that date.
                </p>
                <button type="button" onClick={searchByRoute}
                  disabled={routeSearching || !form.from_code || !form.to_code || !form.flight_date}
                  className="btn-primary w-full gap-2 disabled:opacity-50">
                  <Search size={15} />
                  {routeSearching ? 'Searching...' : 'Browse flights for this route'}
                </button>
                {(!form.from_code || !form.to_code) && (
                  <p className="text-xs text-amber-600">Pick both airports below first.</p>
                )}
                {routeNote && <p className="text-xs text-gray-500">{routeNote}</p>}
                {routeResults?.length > 0 && (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    <p className="text-xs font-semibold text-gray-500">{routeResults.length} scheduled flight{routeResults.length === 1 ? '' : 's'} found:</p>
                    {routeResults.map((f, i) => (
                      <button key={i} type="button"
                        onClick={() => { applyScheduleResult(f); setRouteResults(null); }}
                        className="w-full text-left bg-white rounded-xl px-3 py-2.5 border border-gray-100 hover:border-violet-300 transition">
                        <p className="text-sm font-bold text-gray-800">{f.flightNumber} · {f.airline || 'Unknown airline'}</p>
                        {f.departureLocal && (
                          <p className="text-xs text-gray-400">
                            Departs {new Date(f.departureLocal).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Manual fields — the source of truth for the form; auto-revealed
              once search fills anything in, or the user opts in directly */}
          <button type="button" onClick={() => setShowManualFields(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700">
            <PenLine size={13} />
            {showManualFields ? 'Hide manual entry' : 'Enter or edit details manually'}
            <ChevronDown size={13} className={`transition-transform ${showManualFields ? 'rotate-180' : ''}`} />
          </button>

          {(showManualFields || form.from_code || form.to_code || form.airline) && (
            <div className="space-y-4 animate-fade-in">
              <AirlineSearch
                label="Airline *"
                value={form.airline}
                onChange={airline => setForm(prev => ({ ...prev, airline }))}
                suggestions={suggestedAirlinesForRoute}
                suggestionsLabel="Airlines flying this route:"
              />

              {suggestedRoutesForAirline.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">Popular routes for {form.airline}:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedRoutesForAirline.map(r => (
                      <button key={`${r.fromCode}-${r.toCode}`} type="button"
                        onClick={() => setForm(prev => ({
                          ...prev,
                          from_code: r.from.code, from_city: r.from.city,
                          to_code: r.to.code, to_city: r.to.city,
                        }))}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 transition">
                        {r.from.code} → {r.to.code}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <AirportSearch
                label="Departure Airport *"
                value={{ city: form.from_city, code: form.from_code }}
                onChange={airport => setForm(prev => ({
                  ...prev, from_city: airport.city, from_code: airport.code
                }))}
                placeholder="Search city, airport or code..."
              />

              <AirportSearch
                label="Arrival Airport *"
                value={{ city: form.to_city, code: form.to_code }}
                onChange={airport => setForm(prev => ({
                  ...prev, to_city: airport.city, to_code: airport.code
                }))}
                placeholder="Search city, airport or code..."
              />
            </div>
          )}

          <button onClick={handleNext} className="w-full btn-primary py-3.5">
            Continue to Capacity
          </button>
        </div>
      )}

      {/* ── STEP 2: Capacity & Safety ── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Flight summary */}
          <div className="bg-gray-50 rounded-xl p-3.5 flex items-center gap-3 border border-gray-100">
            <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Plane size={16} className="text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">
                {form.from_city} ({form.from_code}) → {form.to_city} ({form.to_code})
              </p>
              <p className="text-xs text-gray-400">
                {form.airline}{form.flight_number ? ` · ${form.flight_number}` : ''} ·{' '}
                {form.flight_date ? new Date(form.flight_date).toLocaleDateString('en-GB', {
                  day: '2-digit', month: '2-digit', year: 'numeric'
                }) : ''}
              </p>
            </div>
          </div>

          {/* Luggage type selector */}
          <div>
            <p className="text-sm font-bold text-gray-900 mb-1">Luggage Options *</p>
            <p className="text-xs text-gray-400 mb-3">
              Add hand luggage, check-in, or both — each with separate capacity and pricing
            </p>

            <div className="flex gap-2 mb-4">
              <button type="button" onClick={() => addLuggageOption('carry_on')}
                disabled={hasCarryOn}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                  hasCarryOn
                    ? 'border-blue-300 bg-blue-50 text-blue-700 cursor-default'
                    : 'border-dashed border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50/50'
                }`}>
                {hasCarryOn ? <CheckCircle size={14} /> : <Plus size={14} />}
                <Briefcase size={14} />
                Hand Luggage
              </button>
              <button type="button" onClick={() => addLuggageOption('checkin')}
                disabled={hasCheckin}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                  hasCheckin
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 cursor-default'
                    : 'border-dashed border-emerald-200 text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50/50'
                }`}>
                {hasCheckin ? <CheckCircle size={14} /> : <Plus size={14} />}
                <Package size={14} />
                Check-in
              </button>
            </div>

            {luggageOptions.length === 0 && (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <Briefcase size={20} className="text-gray-300" />
                  <Package size={20} className="text-gray-300" />
                </div>
                <p className="text-sm text-gray-400 font-medium">Add at least one luggage type</p>
              </div>
            )}

            <div className="space-y-3">
              {luggageOptions.map((opt, i) => (
                <LuggageOptionCard
                  key={i} type={opt.type} data={opt}
                  onChange={data => updateLuggageOption(i, data)}
                  onRemove={() => removeLuggageOption(i)}
                />
              ))}
            </div>

            {luggageOptions.length > 1 && totalKg > 0 && (
              <div className="mt-3 bg-violet-50 rounded-xl p-3.5 border border-violet-100 flex items-center justify-between">
                <p className="text-xs font-bold text-violet-700">Combined if fully booked</p>
                <div className="text-right">
                  <p className="text-sm font-bold text-violet-700">{totalKg.toFixed(1)}kg total</p>
                  <p className="text-xs text-emerald-600 font-semibold">${totalNet.toFixed(2)} net</p>
                </div>
              </div>
            )}
          </div>

          {/* Categories */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              What items can you carry? *
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    form.categories.includes(cat)
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Notes <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <textarea placeholder="Any special conditions or restrictions..."
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} className="input-field resize-none" />
          </div>

          {/* Safety declaration */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-800 mb-3 flex items-center gap-1.5">
              <AlertTriangle size={13} /> Safety & Legal Declaration
            </p>
            <div className="flex items-start gap-3">
              <input type="checkbox" id="safety-flight"
                checked={form.safetyAcknowledged}
                onChange={e => setForm({ ...form, safetyAcknowledged: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-violet-600 flex-shrink-0" />
              <label htmlFor="safety-flight" className="text-xs text-amber-800 leading-relaxed cursor-pointer">
                I confirm I will only carry legal items permitted by airline regulations and customs laws.
                I will <strong>not carry</strong> illegal substances, weapons, counterfeit goods, or restricted items.
                I will <strong>verify the shipper's identity</strong> and only accept items
                <strong> after escrow is confirmed paid</strong>.
                I accept full legal responsibility. Fetchr bears no liability.
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 btn-secondary py-3">Back</button>
            <button onClick={handleNext} className="flex-1 btn-primary py-3">
              Continue to Delivery
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Delivery ── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Route</span>
              <span className="font-semibold">{form.from_code} → {form.to_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="font-semibold">
                {new Date(form.flight_date).toLocaleDateString('en-GB', {
                  day: '2-digit', month: '2-digit', year: 'numeric'
                })}
              </span>
            </div>
            {luggageOptions.map((opt, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-500">
                  {opt.type === 'carry_on' ? '✈️ Hand' : '🧳 Check-in'}
                </span>
                <span className="font-semibold">
                  {opt.available_kg}kg @ ${opt.price_per_kg}/kg
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-gray-200 pt-2">
              <span className="text-gray-500">Max net earnings</span>
              <span className="font-bold text-emerald-600">${totalNet.toFixed(2)}</span>
            </div>
          </div>

          {/* Delivery service */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Delivery Service *
            </label>
            <div className="space-y-2">
              {[
                {
                  value: 'handover',
                  icon: '🤝',
                  label: 'Handover Only',
                  desc: 'The shipper hands you the item before your flight. You deliver it to the recipient at the destination.',
                },
                {
                  value: 'both',
                  icon: '🛍️',
                  label: 'Handover + Shop & Ship',
                  desc: 'You can also purchase items at the destination for shippers, for an additional service fee.',
                },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm({ ...form, delivery_type: opt.value })}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    form.delivery_type === opt.value
                      ? 'border-violet-400 bg-violet-50'
                      : 'border-gray-200 hover:border-violet-200 bg-white'
                  }`}>
                  <span className="text-2xl flex-shrink-0">{opt.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900">{opt.label}</p>
                      {form.delivery_type === opt.value && (
                        <CheckCircle size={14} className="text-violet-600" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Shop & Ship fee */}
          {form.delivery_type === 'both' && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingBag size={15} className="text-blue-600" />
                <p className="text-sm font-semibold text-blue-700">Shop & Ship Service Fee</p>
              </div>
              <p className="text-xs text-blue-600 mb-3">
                Your fee for purchasing. Item purchase price covered separately via escrow.
              </p>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3.5 top-3 text-gray-400 pointer-events-none" />
                <input type="number" placeholder="e.g. 15.00" min="0" step="0.5"
                  value={form.shop_and_ship_fee}
                  onChange={e => setForm({ ...form, shop_and_ship_fee: e.target.value })}
                  className="input-field pl-8 py-2.5" />
              </div>
            </div>
          )}

          {/* Handover locations */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                📍 Departure Handover Location
              </label>
              <p className="text-xs text-gray-400 mb-1.5">
                Where should the shipper hand the item to you before your flight?
              </p>
              <input type="text"
                placeholder="e.g. Dubai Airport Terminal 3 departures..."
                value={form.handover_location_departure}
                onChange={e => setForm({ ...form, handover_location_departure: e.target.value })}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                📍 Arrival Handover Location
              </label>
              <p className="text-xs text-gray-400 mb-1.5">
                Where will you hand the item to the recipient at the destination?
              </p>
              <input type="text"
                placeholder="e.g. Heathrow arrivals hall, agreed meeting point..."
                value={form.handover_location_arrival}
                onChange={e => setForm({ ...form, handover_location_arrival: e.target.value })}
                className="input-field" />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 btn-secondary py-3">Back</button>
            <button onClick={saveFlight} disabled={loading}
              className="flex-1 btn-primary py-3.5 disabled:opacity-50">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Publishing...</>
                : <><Plane size={15} /> Publish Flight</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddFlight;