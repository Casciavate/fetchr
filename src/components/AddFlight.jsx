import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Plane, Search, MapPin, Calendar, Weight, DollarSign,
  CheckCircle, AlertCircle, ChevronDown, ShoppingBag, Info,
  Briefcase, Package, Plus, X
} from 'lucide-react';

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
  'ANA', 'Thai Airways', 'Malaysia Airlines', 'LATAM', 'Avianca',
  'Air Canada', 'IndiGo', 'SpiceJet', 'flynas', 'Jazeera Airways',
  'Pegasus Airlines', 'Royal Jordanian', 'Middle East Airlines',
  'flyadeal', 'Air Arabia Abu Dhabi', 'WizzAir', 'Vueling',
  'TAP Air Portugal', 'Aer Lingus', 'Norwegian', 'TUI Airways',
  'Air Asia', 'Garuda Indonesia', 'Philippine Airlines',
  'Vietnam Airlines', 'China Eastern', 'China Southern', 'Air China',
  'Hainan Airlines', 'SunExpress',
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
  'IndiGo': '6E', 'SpiceJet': 'SG', 'flynas': 'XY',
  'Jazeera Airways': 'J9', 'Pegasus Airlines': 'PC',
};

// Typical airline limits for guidance
const AIRLINE_LIMITS = {
  carry_on_kg: 7,
  carry_on_dims: '55×40×20cm',
  checkin_kg: 23,
  checkin_dims: 'Standard 23kg bag',
};

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
  { code: 'FCO', city: 'Rome', name: 'Fiumicino', country: 'Italy' },
  { code: 'MXP', city: 'Milan', name: 'Malpensa', country: 'Italy' },
  { code: 'LIN', city: 'Milan', name: 'Linate', country: 'Italy' },
  { code: 'BGY', city: 'Milan', name: 'Bergamo Orio al Serio', country: 'Italy' },
  { code: 'VCE', city: 'Venice', name: 'Marco Polo', country: 'Italy' },
  { code: 'NAP', city: 'Naples', name: 'Naples International', country: 'Italy' },
  { code: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Turkey' },
  { code: 'SAW', city: 'Istanbul', name: 'Sabiha Gokcen', country: 'Turkey' },
  { code: 'AYT', city: 'Antalya', name: 'Antalya Airport', country: 'Turkey' },
  { code: 'ATH', city: 'Athens', name: 'Eleftherios Venizelos', country: 'Greece' },
  { code: 'SKG', city: 'Thessaloniki', name: 'Macedonia Airport', country: 'Greece' },
  { code: 'HER', city: 'Heraklion', name: 'Nikos Kazantzakis', country: 'Greece' },
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
  { code: 'EWR', city: 'New York', name: 'Newark Liberty', country: 'USA' },
  { code: 'LGA', city: 'New York', name: 'LaGuardia', country: 'USA' },
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
  { code: 'OTHER', city: 'Other', name: 'Not listed — enter manually', country: '' },
];

const AirportSearch = ({ label, value, onChange, placeholder }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualCity, setManualCity] = useState('');
  const ref = useRef(null);

  React.useEffect(() => {
    if (value?.code && value.code !== 'OTHER' && value.code !== '') {
      setQuery(`${value.city} (${value.code})`);
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
      setQuery('Other (enter manually)');
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
        <MapPin size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
        <input type="text" value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => query.length > 0 && results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="input-field pl-9" />
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
        </div>
      )}
      {showManual && (
        <div className="mt-2 bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-2">
          <p className="text-xs font-semibold text-gray-600">Enter airport manually</p>
          <input type="text" placeholder="Airport code (e.g. XYZ)" value={manualCode}
            onChange={e => setManualCode(e.target.value.toUpperCase())} maxLength={3}
            className="input-field py-2 text-sm uppercase" />
          <input type="text" placeholder="City name" value={manualCity}
            onChange={e => setManualCity(e.target.value)}
            className="input-field py-2 text-sm" />
          <button onClick={handleManualSave} className="w-full btn-primary py-2 text-xs">
            Confirm Airport
          </button>
        </div>
      )}
    </div>
  );
};

// Luggage option card component
const LuggageOption = ({ type, data, onChange, onRemove }) => {
  const isCarryOn = type === 'carry_on';
  const icon = isCarryOn ? Briefcase : Package;
  const Icon = icon;
  const label = isCarryOn ? 'Hand Luggage' : 'Check-in Luggage';
  const hint = isCarryOn
    ? `Typically max ${AIRLINE_LIMITS.carry_on_kg}kg · ${AIRLINE_LIMITS.carry_on_dims}`
    : `Typically max ${AIRLINE_LIMITS.checkin_kg}kg · ${AIRLINE_LIMITS.checkin_dims}`;
  const color = isCarryOn ? 'border-blue-200 bg-blue-50/50' : 'border-emerald-200 bg-emerald-50/50';
  const iconColor = isCarryOn ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50';
  const badgeColor = isCarryOn ? 'text-blue-700 bg-blue-100' : 'text-emerald-700 bg-emerald-100';

  // Tiered fee display
  const getNetEarnings = (kg, ppk) => {
    if (!kg || !ppk) return null;
    const gross = parseFloat(kg) * parseFloat(ppk);
    let pct = 0.10;
    if (gross >= 500) pct = 0.07;
    else if (gross >= 200) pct = 0.085;
    else if (gross < 20) pct = 0.12;
    return { gross, net: gross * (1 - pct), fee: gross * pct, pct: Math.round(pct * 100) };
  };

  const earnings = getNetEarnings(data.available_kg, data.price_per_kg);

  return (
    <div className={`rounded-2xl border-2 ${color} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconColor}`}>
            <Icon size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{label}</p>
            <p className="text-xs text-gray-400">{hint}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-1 rounded-lg ${badgeColor}`}>
            {isCarryOn ? '✈️ Cabin' : '🧳 Hold'}
          </span>
          <button onClick={onRemove}
            className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-red-50 transition">
            <X size={15} className="text-red-400" />
          </button>
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
            Available kg *
          </label>
          <div className="relative">
            <Weight size={14} className="absolute left-3 top-3 text-gray-400 pointer-events-none" />
            <input
              type="number"
              placeholder={isCarryOn ? 'e.g. 5' : 'e.g. 15'}
              min="0.5"
              max={isCarryOn ? '10' : '32'}
              step="0.5"
              value={data.available_kg}
              onChange={e => onChange({ ...data, available_kg: e.target.value })}
              className="input-field pl-8 py-2.5 text-sm"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Max: {isCarryOn ? '10kg' : '32kg'}
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
            Price/kg ($) *
          </label>
          <div className="relative">
            <DollarSign size={14} className="absolute left-3 top-3 text-gray-400 pointer-events-none" />
            <input
              type="number"
              placeholder={isCarryOn ? 'e.g. 15' : 'e.g. 8'}
              min="1"
              step="0.5"
              value={data.price_per_kg}
              onChange={e => onChange({ ...data, price_per_kg: e.target.value })}
              className="input-field pl-8 py-2.5 text-sm"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {isCarryOn ? 'Cabin rates typically higher' : 'Hold rates typically lower'}
          </p>
        </div>
      </div>

      {/* Earnings preview */}
      {earnings && (
        <div className="bg-white rounded-xl p-3 border border-gray-100 space-y-1 text-xs">
          <p className="font-semibold text-gray-600 mb-1">Earnings if fully booked</p>
          <div className="flex justify-between text-gray-500">
            <span>Gross ({data.available_kg}kg × ${data.price_per_kg})</span>
            <span>${earnings.gross.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-red-400">
            <span>Fetchr fee ({earnings.pct}%)</span>
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

  // Luggage options — traveler can add carry_on, checkin, or both
  const [luggageOptions, setLuggageOptions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [flightNumberSearch, setFlightNumberSearch] = useState('');
  const [searching, setSearching] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const hasCarryOn = luggageOptions.some(l => l.type === 'carry_on');
  const hasCheckin = luggageOptions.some(l => l.type === 'checkin');

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

  const searchByFlightNumber = () => {
    if (!flightNumberSearch.trim()) return;
    setSearching(true);
    const upper = flightNumberSearch.toUpperCase().trim();
    const airlineCode = upper.replace(/[0-9\s]/g, '');
    const found = Object.entries(AIRLINE_CODES).find(([, code]) => code === airlineCode);
    const airline = found ? found[0] : null;
    if (airline) {
      setForm(prev => ({ ...prev, airline, flight_number: upper }));
      setError('');
    } else {
      setError('Airline not detected. Please select it manually below.');
      setForm(prev => ({ ...prev, flight_number: upper }));
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
    if (luggageOptions.length === 0) {
      setError('Please add at least one luggage option (hand luggage or check-in).'); return false;
    }
    for (const opt of luggageOptions) {
      if (!opt.available_kg || parseFloat(opt.available_kg) <= 0) {
        setError(`Please enter available kg for ${opt.type === 'carry_on' ? 'hand luggage' : 'check-in luggage'}.`);
        return false;
      }
      if (!opt.price_per_kg || parseFloat(opt.price_per_kg) <= 0) {
        setError(`Please enter price per kg for ${opt.type === 'carry_on' ? 'hand luggage' : 'check-in luggage'}.`);
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
      setError('Please accept the safety declaration.'); return false;
    }
    return true;
  };

  const handleNext = () => {
    setError('');
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  // Use first luggage option as primary for backward compat with DB
  const getPrimaryLuggage = () => {
    if (luggageOptions.length === 0) return { available_kg: 0, price_per_kg: 0 };
    return luggageOptions[0];
  };

  const saveFlight = async () => {
    setLoading(true); setError('');
    const primary = getPrimaryLuggage();

    // Store all luggage options as JSON in notes field supplement
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
      available_kg: parseFloat(primary.available_kg),
      price_per_kg: parseFloat(primary.price_per_kg),
      categories: form.categories,
      notes: [
        form.notes,
        `Luggage options: ${luggageJson}`,
      ].filter(Boolean).join('\n'),
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
    setSuccess(false); setStep(1);
    setForm({
      from_city: '', from_code: '', to_city: '', to_code: '',
      flight_date: '', flight_number: '', airline: '',
      categories: [], notes: '', safetyAcknowledged: false,
      delivery_type: 'handover', shop_and_ship_fee: '',
      handover_location_departure: '', handover_location_arrival: '',
    });
    setLuggageOptions([]);
    setFlightNumberSearch('');
  };

  // Total capacity + net earnings across all luggage options
  const totalCapacity = luggageOptions.reduce((s, l) => s + (parseFloat(l.available_kg) || 0), 0);
  const totalNetEarnings = luggageOptions.reduce((s, l) => {
    const gross = (parseFloat(l.available_kg) || 0) * (parseFloat(l.price_per_kg) || 0);
    let pct = 0.10;
    if (gross >= 500) pct = 0.07;
    else if (gross >= 200) pct = 0.085;
    else if (gross < 20 && gross > 0) pct = 0.12;
    return s + gross * (1 - pct);
  }, 0);

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
          { label: 'Total Capacity', value: `${totalCapacity.toFixed(1)}kg` },
          { label: 'Luggage Types', value: luggageOptions.map(l => l.type === 'carry_on' ? '✈️ Hand luggage' : '🧳 Check-in').join(' + ') },
          { label: 'Max net earnings', value: `$${totalNetEarnings.toFixed(2)} (after fees)` },
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
        <p className="text-gray-500 text-sm mt-0.5">Earn money by using your spare luggage capacity</p>
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
              <span className={`text-xs font-semibold hidden sm:block ${step === s.n ? 'text-violet-600' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
            {i < 2 && <div className={`flex-1 h-0.5 rounded-full transition-all ${step > s.n ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── STEP 1: Flight Info ── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Quick fill */}
          <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
            <p className="text-sm font-semibold text-violet-700 mb-1">Quick Fill — Flight Number</p>
            <p className="text-xs text-gray-500 mb-2">Auto-detects your airline from the flight number.</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input type="text" placeholder="e.g. EK203, QR542..."
                  value={flightNumberSearch}
                  onChange={e => setFlightNumberSearch(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && searchByFlightNumber()}
                  className="input-field" />
              </div>
              <button type="button" onClick={searchByFlightNumber} disabled={searching}
                className="btn-primary flex items-center gap-2 px-4 disabled:opacity-50">
                <Search size={15} /> Fill
              </button>
            </div>
            {form.airline && (
              <p className="text-xs text-emerald-600 font-semibold mt-2">
                ✓ Airline detected: {form.airline}
              </p>
            )}
          </div>

          <AirportSearch
            label="Departure Airport *"
            value={{ city: form.from_city, code: form.from_code }}
            onChange={airport => setForm(prev => ({ ...prev, from_city: airport.city, from_code: airport.code }))}
            placeholder="Search city, airport or code..."
          />

          <AirportSearch
            label="Arrival Airport *"
            value={{ city: form.to_city, code: form.to_code }}
            onChange={airport => setForm(prev => ({ ...prev, to_city: airport.city, to_code: airport.code }))}
            placeholder="Search city, airport or code..."
          />

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

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Airline *</label>
            <div className="relative">
              <Plane size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
              <select value={form.airline}
                onChange={e => setForm({ ...form, airline: e.target.value })}
                className="input-field pl-9 appearance-none">
                <option value="">Select airline...</option>
                {AIRLINES.sort().map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronDown size={15} className="absolute right-3.5 top-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Flight Number <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <input type="text" placeholder="e.g. EK203"
              value={form.flight_number}
              onChange={e => setForm({ ...form, flight_number: e.target.value.toUpperCase() })}
              className="input-field" />
          </div>

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

          {/* Add luggage options */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-gray-900">Luggage Options *</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Add hand luggage, check-in, or both — each with its own capacity and price
                </p>
              </div>
            </div>

            {/* Add buttons */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => addLuggageOption('carry_on')}
                disabled={hasCarryOn}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                  hasCarryOn
                    ? 'border-blue-300 bg-blue-50 text-blue-700 cursor-default'
                    : 'border-dashed border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50'
                }`}>
                {hasCarryOn ? <CheckCircle size={15} /> : <Plus size={15} />}
                <Briefcase size={15} />
                Hand Luggage
              </button>
              <button
                type="button"
                onClick={() => addLuggageOption('checkin')}
                disabled={hasCheckin}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                  hasCheckin
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 cursor-default'
                    : 'border-dashed border-emerald-200 text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50'
                }`}>
                {hasCheckin ? <CheckCircle size={15} /> : <Plus size={15} />}
                <Package size={15} />
                Check-in
              </button>
            </div>

            {luggageOptions.length === 0 && (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <Briefcase size={20} className="text-gray-300" />
                  <Package size={20} className="text-gray-300" />
                </div>
                <p className="text-sm text-gray-400 font-medium">
                  Add at least one luggage type above
                </p>
                <p className="text-xs text-gray-300 mt-1">
                  You can offer hand luggage, check-in, or both
                </p>
              </div>
            )}

            <div className="space-y-3">
              {luggageOptions.map((opt, i) => (
                <LuggageOption
                  key={i}
                  type={opt.type}
                  data={opt}
                  onChange={data => updateLuggageOption(i, data)}
                  onRemove={() => removeLuggageOption(i)}
                />
              ))}
            </div>

            {/* Total summary if both added */}
            {luggageOptions.length > 1 && totalCapacity > 0 && (
              <div className="mt-3 bg-violet-50 rounded-xl p-3.5 border border-violet-100">
                <p className="text-xs font-bold text-violet-700 mb-2">Combined Capacity Summary</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-gray-400">Total capacity</p>
                    <p className="font-bold text-gray-900">{totalCapacity.toFixed(1)}kg</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Max net earnings</p>
                    <p className="font-bold text-emerald-600">${totalNetEarnings.toFixed(2)}</p>
                  </div>
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
            <textarea placeholder="Any special conditions, restrictions, or preferences..."
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} className="input-field resize-none" />
          </div>

          {/* Safety declaration */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-800 mb-3 flex items-center gap-1.5">
              ⚠️ Safety & Legal Declaration
            </p>
            <div className="flex items-start gap-3">
              <input type="checkbox" id="safety-ack-flight" checked={form.safetyAcknowledged}
                onChange={e => setForm({ ...form, safetyAcknowledged: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-violet-600 flex-shrink-0" />
              <label htmlFor="safety-ack-flight" className="text-xs text-amber-800 leading-relaxed cursor-pointer">
                I confirm that:
                <ul className="mt-1.5 space-y-1 list-disc list-inside ml-1">
                  <li>I will <strong>only carry legal items</strong> permitted by airline regulations and customs laws.</li>
                  <li>I will <strong>not carry</strong> illegal substances, weapons, counterfeit goods, or any restricted items.</li>
                  <li>I will <strong>verify the shipper's identity</strong> before accepting the item and will only accept items <strong>after escrow is confirmed</strong>.</li>
                  <li>I accept <strong>full legal responsibility</strong> for items in my possession.</li>
                  <li>Fetchr is a matchmaking platform only — all legal liability is mine as the traveler.</li>
                </ul>
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 btn-secondary py-3">Back</button>
            <button onClick={handleNext} className="flex-1 btn-primary py-3">Continue to Delivery</button>
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
              <span className="font-semibold text-gray-900">{form.from_code} → {form.to_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="font-semibold text-gray-900">
                {form.flight_date ? new Date(form.flight_date).toLocaleDateString('en-GB', {
                  day: '2-digit', month: '2-digit', year: 'numeric'
                }) : ''}
              </span>
            </div>
            {luggageOptions.map((opt, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-500">
                  {opt.type === 'carry_on' ? '✈️ Hand luggage' : '🧳 Check-in'}
                </span>
                <span className="font-semibold text-gray-900">
                  {opt.available_kg}kg @ ${opt.price_per_kg}/kg
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-gray-200 pt-2">
              <span className="text-gray-500">Max net earnings</span>
              <span className="font-bold text-emerald-600">${totalNetEarnings.toFixed(2)}</span>
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
                  desc: 'You can also purchase items at the destination for the shipper, for an additional service fee.',
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
                      {form.delivery_type === opt.value && <CheckCircle size={15} className="text-violet-600" />}
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
              <div className="flex items-center gap-2 mb-3">
                <ShoppingBag size={15} className="text-blue-600" />
                <p className="text-sm font-semibold text-blue-700">Shop & Ship Service Fee</p>
              </div>
              <p className="text-xs text-blue-600 mb-3">
                Your fee for going to the store and purchasing. Item purchase price is covered separately via escrow.
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
                placeholder="e.g. Dubai Airport Terminal 3 departures, Hotel lobby..."
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
                placeholder="e.g. Heathrow arrivals hall, Agreed meeting point..."
                value={form.handover_location_arrival}
                onChange={e => setForm({ ...form, handover_location_arrival: e.target.value })}
                className="input-field" />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 btn-secondary py-3">Back</button>
            <button onClick={saveFlight} disabled={loading}
              className="flex-1 btn-primary py-3.5 flex items-center justify-center gap-2 disabled:opacity-50">
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