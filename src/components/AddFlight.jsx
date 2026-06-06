import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Plane, Search, MapPin, Calendar, Weight, DollarSign,
  CheckCircle, AlertCircle, ChevronDown, ShoppingBag, Info,
  Package, Luggage
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
  'Finnair': 'AY', 'SAS': 'SK', 'Iberia': 'IB', 'EgyptAir': 'MS',
  'Ethiopian Airlines': 'ET', 'Kenya Airways': 'KQ', 'Saudia': 'SV',
  'Gulf Air': 'GF', 'Oman Air': 'WY', 'Air India': 'AI',
  'Japan Airlines': 'JL', 'Korean Air': 'KE', 'ANA': 'NH',
  'Thai Airways': 'TG', 'Malaysia Airlines': 'MH', 'LATAM': 'LA',
  'Air Canada': 'AC', 'IndiGo': '6E', 'flynas': 'XY',
  'Jazeera Airways': 'J9', 'Pegasus Airlines': 'PC',
  'flyadeal': 'F3', 'WizzAir': 'W6', 'Vueling': 'VY',
  'TAP Air Portugal': 'TP', 'Aer Lingus': 'EI', 'Norwegian': 'DY',
  'Air Asia': 'AK', 'Garuda Indonesia': 'GA', 'TUI Airways': 'BY',
  'China Eastern': 'MU', 'China Southern': 'CZ', 'Air China': 'CA',
};

// Tiered commission rates
const getFetchrFee = (subtotal) => {
  if (subtotal >= 500) return { pct: 7, label: 'Large deal rate' };
  if (subtotal >= 200) return { pct: 8.5, label: 'Medium deal rate' };
  if (subtotal >= 20) return { pct: 10, label: 'Standard rate' };
  return { pct: 12, label: 'Micro deal rate' };
};

// Hand luggage limits per airline (approximate)
const HAND_LUGGAGE_LIMITS = {
  default: { weight: 7, dims: '55×40×20cm' },
  'Emirates': { weight: 7, dims: '55×38×20cm' },
  'Qatar Airways': { weight: 7, dims: '50×37×25cm' },
  'Etihad Airways': { weight: 7, dims: '50×40×20cm' },
  'British Airways': { weight: 7, dims: '56×45×25cm' },
  'Lufthansa': { weight: 8, dims: '55×40×23cm' },
  'Air France': { weight: 12, dims: '55×35×25cm' },
  'Ryanair': { weight: 10, dims: '40×20×25cm' },
  'easyJet': { weight: 15, dims: '56×45×25cm' },
  'Flydubai': { weight: 7, dims: '55×38×20cm' },
  'Air Arabia': { weight: 7, dims: '55×40×20cm' },
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
  { code: 'MRS', city: 'Marseille', name: 'Marseille Provence', country: 'France' },
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
  { code: 'ALC', city: 'Alicante', name: 'Alicante Airport', country: 'Spain' },
  { code: 'PMI', city: 'Palma', name: 'Palma de Mallorca', country: 'Spain' },
  { code: 'VLC', city: 'Valencia', name: 'Valencia Airport', country: 'Spain' },
  { code: 'FCO', city: 'Rome', name: 'Fiumicino', country: 'Italy' },
  { code: 'MXP', city: 'Milan', name: 'Malpensa', country: 'Italy' },
  { code: 'LIN', city: 'Milan', name: 'Linate', country: 'Italy' },
  { code: 'BGY', city: 'Milan', name: 'Bergamo Orio al Serio', country: 'Italy' },
  { code: 'VCE', city: 'Venice', name: 'Marco Polo', country: 'Italy' },
  { code: 'NAP', city: 'Naples', name: 'Naples International', country: 'Italy' },
  { code: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Turkey' },
  { code: 'SAW', city: 'Istanbul', name: 'Sabiha Gokcen', country: 'Turkey' },
  { code: 'AYT', city: 'Antalya', name: 'Antalya Airport', country: 'Turkey' },
  { code: 'ADB', city: 'Izmir', name: 'Adnan Menderes', country: 'Turkey' },
  { code: 'ESB', city: 'Ankara', name: 'Esenboga Airport', country: 'Turkey' },
  { code: 'ATH', city: 'Athens', name: 'Eleftherios Venizelos', country: 'Greece' },
  { code: 'SKG', city: 'Thessaloniki', name: 'Macedonia Airport', country: 'Greece' },
  { code: 'HER', city: 'Heraklion', name: 'Nikos Kazantzakis', country: 'Greece' },
  { code: 'CPH', city: 'Copenhagen', name: 'Kastrup', country: 'Denmark' },
  { code: 'ARN', city: 'Stockholm', name: 'Arlanda', country: 'Sweden' },
  { code: 'HEL', city: 'Helsinki', name: 'Helsinki-Vantaa', country: 'Finland' },
  { code: 'OSL', city: 'Oslo', name: 'Gardermoen', country: 'Norway' },
  { code: 'WAW', city: 'Warsaw', name: 'Chopin Airport', country: 'Poland' },
  { code: 'KRK', city: 'Krakow', name: 'John Paul II', country: 'Poland' },
  { code: 'PRG', city: 'Prague', name: 'Vaclav Havel', country: 'Czech Republic' },
  { code: 'BUD', city: 'Budapest', name: 'Ferenc Liszt', country: 'Hungary' },
  { code: 'OTP', city: 'Bucharest', name: 'Henri Coanda', country: 'Romania' },
  { code: 'SOF', city: 'Sofia', name: 'Sofia Airport', country: 'Bulgaria' },
  { code: 'VIE', city: 'Vienna', name: 'Vienna International', country: 'Austria' },
  { code: 'BRU', city: 'Brussels', name: 'Brussels Airport', country: 'Belgium' },
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
  { code: 'MRU', city: 'Mauritius', name: 'Sir Seewoosagur Ramgoolam', country: 'Mauritius' },
  { code: 'ALA', city: 'Almaty', name: 'Almaty International', country: 'Kazakhstan' },
  { code: 'TAS', city: 'Tashkent', name: 'Islam Karimov International', country: 'Uzbekistan' },
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
    if (value?.code && value.code !== '' && !showManual) {
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
    setQuery(`${airport.city} (${airport.code})`);
    setOpen(false);
    setResults([]);
    onChange(airport);
  };

  const handleManualSave = () => {
    if (!manualCode || !manualCity) return;
    const airport = { code: manualCode.toUpperCase(), city: manualCity, name: manualCity, country: 'Other' };
    onChange(airport);
    setQuery(`${manualCity} (${manualCode.toUpperCase()})`);
    setShowManual(false);
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <MapPin size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => query.length > 0 && results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="input-field pl-9"
        />
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
                  {airport.name} · {airport.country}
                </p>
              </div>
            </button>
          ))}
          <button type="button" onClick={() => { setShowManual(true); setOpen(false); setQuery('Other (manual entry)'); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-gray-500">+</span>
            </div>
            <p className="text-sm font-semibold text-gray-500">Other — enter manually</p>
          </button>
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

const AddFlight = ({ session }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    from_city: '', from_code: '',
    to_city: '', to_code: '',
    flight_date: '', flight_number: '', airline: '',
    luggage_type: 'checkin', // 'checkin' or 'handluggage'
    available_kg: '', price_per_kg: '',
    categories: [], notes: '',
    delivery_type: 'handover',
    shop_and_ship_fee: '',
    handover_location_departure: '',
    handover_location_arrival: '',
    safety_acknowledged: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [flightNumberInput, setFlightNumberInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const handLuggageLimit = form.airline
    ? (HAND_LUGGAGE_LIMITS[form.airline] || HAND_LUGGAGE_LIMITS.default)
    : HAND_LUGGAGE_LIMITS.default;

  // Free flight lookup using aviationstack free tier
  const searchByFlightNumber = async () => {
    if (!flightNumberInput.trim()) return;
    setSearching(true);
    setSearchError('');
    const upper = flightNumberInput.toUpperCase().trim();

    // First try to detect airline from code prefix
    const airlineCode = upper.replace(/[0-9\s]/g, '');
    const detectedAirline = Object.entries(AIRLINE_CODES)
      .find(([, code]) => code === airlineCode)?.[0];

    if (detectedAirline) {
      setForm(prev => ({ ...prev, airline: detectedAirline, flight_number: upper }));
      setSearchError('');
    } else {
      setSearchError('Airline not recognised from flight number. Please select manually below.');
      setForm(prev => ({ ...prev, flight_number: upper }));
    }

    // Try aviationstack free API (no key needed for basic lookup)
    try {
      const res = await fetch(
        `https://api.aviationstack.com/v1/flights?access_key=free&flight_iata=${upper}&limit=1`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.data?.[0]) {
          const flight = data.data[0];
          const dep = flight.departure;
          const arr = flight.arrival;
          if (dep?.iata) {
            setForm(prev => ({
              ...prev,
              from_code: dep.iata,
              from_city: dep.airport || dep.iata,
              to_code: arr?.iata || prev.to_code,
              to_city: arr?.airport || arr?.iata || prev.to_city,
              airline: flight.airline?.name || detectedAirline || prev.airline,
              flight_number: upper,
            }));
            setSearchError('');
          }
        }
      }
    } catch (e) {
      // API unavailable — airline code detection above is the fallback
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
    if (form.luggage_type === 'handluggage') {
      const limit = handLuggageLimit.weight;
      if (parseFloat(form.available_kg) > limit) {
        setError(`Hand luggage limit for ${form.airline || 'this airline'} is ${limit}kg.`); return false;
      }
    }
    if (parseFloat(form.available_kg) > 50) {
      setError('Maximum 50kg per listing.'); return false;
    }
    if (!form.price_per_kg || parseFloat(form.price_per_kg) <= 0) {
      setError('Please enter your price per kg.'); return false;
    }
    if (form.categories.length === 0) {
      setError('Please select at least one category.'); return false;
    }
    if (!form.safety_acknowledged) {
      setError('Please accept the safety declaration.'); return false;
    }
    return true;
  };

  const handleNext = () => {
    setError('');
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const saveFlight = async () => {
    setLoading(true); setError('');
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
      notes: [form.notes, `Luggage type: ${form.luggage_type === 'handluggage' ? 'Hand luggage' : 'Check-in'}`].filter(Boolean).join(' · '),
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
    setFlightNumberInput('');
    setForm({
      from_city: '', from_code: '', to_city: '', to_code: '',
      flight_date: '', flight_number: '', airline: '',
      luggage_type: 'checkin',
      available_kg: '', price_per_kg: '', categories: [], notes: '',
      delivery_type: 'handover', shop_and_ship_fee: '',
      handover_location_departure: '', handover_location_arrival: '',
      safety_acknowledged: false,
    });
  };

  // Earnings calculations
  const grossEarnings = form.available_kg && form.price_per_kg
    ? parseFloat(form.available_kg) * parseFloat(form.price_per_kg) : 0;
  const { pct: fetchrPct, label: feeLabel } = getFetchrFee(grossEarnings);
  const fetchrFee = grossEarnings * fetchrPct / 100;
  const netEarnings = grossEarnings - fetchrFee;
  const shopFeeGross = parseFloat(form.shop_and_ship_fee) || 0;
  const shopFeeNet = shopFeeGross * 0.90;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

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
          { label: 'Date', value: formatDate(form.flight_date) },
          { label: 'Airline', value: `${form.airline} ${form.flight_number ? `· ${form.flight_number}` : ''}` },
          { label: 'Luggage type', value: form.luggage_type === 'handluggage' ? '🎒 Hand luggage' : '🧳 Check-in' },
          { label: 'Capacity', value: `${form.available_kg}kg @ $${form.price_per_kg}/kg` },
          { label: 'Net earnings est.', value: `$${netEarnings.toFixed(2)} (after ${fetchrPct}% fee)` },
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
        <p className="text-gray-500 text-sm mt-0.5">Earn money by delivering items on your next trip</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {[{ n: 1, label: 'Flight Info' }, { n: 2, label: 'Capacity' }, { n: 3, label: 'Delivery' }].map((s, i) => (
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
            {i < 2 && <div className={`flex-1 h-0.5 rounded-full ${step > s.n ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
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
            <p className="text-sm font-bold text-violet-700 mb-1">Quick Fill — Flight Number</p>
            <p className="text-xs text-gray-500 mb-3">
              Enter your flight number to auto-detect the airline. Select airports and date below.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. EK203, QR542..."
                value={flightNumberInput}
                onChange={e => setFlightNumberInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && searchByFlightNumber()}
                className="input-field flex-1"
              />
              <button type="button" onClick={searchByFlightNumber} disabled={searching}
                className="btn-primary px-4 flex items-center gap-2 flex-shrink-0 disabled:opacity-50">
                <Search size={15} />
                {searching ? 'Searching...' : 'Fill'}
              </button>
            </div>
            {form.airline && (
              <p className="text-xs text-emerald-600 font-semibold mt-2 flex items-center gap-1">
                <CheckCircle size={12} /> Airline detected: {form.airline}
              </p>
            )}
            {searchError && (
              <p className="text-xs text-amber-600 mt-2">{searchError}</p>
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
              Flight Date *
            </label>
            <div className="relative">
              <Calendar size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
              <input type="date" min={today} value={form.flight_date}
                onChange={e => setForm({ ...form, flight_date: e.target.value })}
                className="input-field pl-9" />
            </div>
            {form.flight_date && (
              <p className="text-xs text-gray-400 mt-1 ml-1">Selected: {formatDate(form.flight_date)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Airline *
            </label>
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

      {/* ── STEP 2: Capacity ── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Flight summary */}
          <div className="bg-gray-50 rounded-xl p-3.5 flex items-center gap-3 border border-gray-100">
            <Plane size={16} className="text-violet-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">
                {form.from_city} ({form.from_code}) → {form.to_city} ({form.to_code})
              </p>
              <p className="text-xs text-gray-400">
                {form.airline} · {formatDate(form.flight_date)}
              </p>
            </div>
          </div>

          {/* Luggage type — hand vs check-in */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Luggage Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  value: 'checkin',
                  icon: '🧳',
                  label: 'Check-in Luggage',
                  desc: 'Standard checked bag allowance. Typically 20–30kg.',
                  rate: 'Standard rate',
                },
                {
                  value: 'handluggage',
                  icon: '🎒',
                  label: 'Hand Luggage',
                  desc: `Cabin bag only. Max ${handLuggageLimit.weight}kg, ${handLuggageLimit.dims}`,
                  rate: 'Premium rate',
                },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => {
                    const kg = form.available_kg;
                    const limit = handLuggageLimit.weight;
                    setForm(prev => ({
                      ...prev,
                      luggage_type: opt.value,
                      available_kg: opt.value === 'handluggage' && parseFloat(kg) > limit
                        ? limit.toString() : kg,
                    }));
                  }}
                  className={`flex flex-col items-start p-3.5 rounded-xl border-2 transition-all text-left ${
                    form.luggage_type === opt.value
                      ? 'border-violet-400 bg-violet-50'
                      : 'border-gray-200 hover:border-violet-200 bg-white'
                  }`}>
                  <span className="text-2xl mb-1.5">{opt.icon}</span>
                  <p className="text-xs font-bold text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                  <span className={`badge mt-2 text-xs ${opt.value === 'handluggage' ? 'badge-purple' : 'badge-green'}`}>
                    {opt.rate}
                  </span>
                </button>
              ))}
            </div>

            {form.luggage_type === 'handluggage' && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mt-2">
                <p className="text-xs text-blue-700 font-semibold">
                  ✈️ {form.airline || 'Airline'} hand luggage: max {handLuggageLimit.weight}kg · {handLuggageLimit.dims}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Premium rate applies — hand luggage items are more valuable due to cabin access and no risk of loss.
                </p>
              </div>
            )}
          </div>

          {/* Weight + Price — fixed layout for mobile */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Available kg *
              </label>
              <div className="relative">
                <Weight size={14} className="absolute left-3 top-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="number"
                  placeholder={form.luggage_type === 'handluggage' ? `Max ${handLuggageLimit.weight}` : 'e.g. 10'}
                  min="0.5"
                  max={form.luggage_type === 'handluggage' ? handLuggageLimit.weight : 50}
                  step="0.5"
                  value={form.available_kg}
                  onChange={e => setForm({ ...form, available_kg: e.target.value })}
                  className="input-field pl-8"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Price/kg ($) *
              </label>
              <div className="flex rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-400 transition-all bg-gray-50 focus-within:bg-white">
                <span className="flex items-center pl-3 text-gray-400 text-sm font-medium flex-shrink-0 pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  placeholder="e.g. 10"
                  min="1"
                  step="0.5"
                  value={form.price_per_kg}
                  onChange={e => setForm({ ...form, price_per_kg: e.target.value })}
                  className="flex-1 bg-transparent border-0 focus:outline-none text-sm text-gray-800 py-3 px-2"
                />
              </div>
            </div>
          </div>

          {/* Earnings estimate with tiered fee */}
          {grossEarnings > 0 && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <p className="text-xs font-bold text-emerald-700 mb-3 flex items-center gap-1.5">
                <Info size={13} /> Earnings Estimate (if fully booked)
              </p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Gross ({form.available_kg}kg × ${form.price_per_kg})</span>
                  <span>${grossEarnings.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>Fetchr service fee ({fetchrPct}% — {feeLabel})</span>
                  <span>-${fetchrFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700 border-t border-emerald-200 pt-1.5">
                  <span>Your net earnings</span>
                  <span>${netEarnings.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-xs text-emerald-600 mt-2 italic">
                {feeLabel} — fee varies by deal size (7–12%)
              </p>
            </div>
          )}

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
            <p className="text-xs font-bold text-amber-800 mb-3">⚠️ Safety & Legal Declaration</p>
            <div className="flex items-start gap-3">
              <input type="checkbox" id="safety-flight" checked={form.safety_acknowledged}
                onChange={e => setForm({ ...form, safety_acknowledged: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-violet-600 flex-shrink-0" />
              <label htmlFor="safety-flight" className="text-xs text-amber-800 leading-relaxed cursor-pointer">
                I confirm I will only carry <strong>legal items</strong> permitted by airline regulations and customs laws. I will not transport illegal substances, weapons, counterfeit goods, or restricted items. I accept full legal responsibility for items I carry. Violations will result in immediate account termination and may be reported to authorities.
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
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Route</span>
              <span className="font-semibold text-gray-900">{form.from_code} → {form.to_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="font-semibold text-gray-900">{formatDate(form.flight_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Luggage</span>
              <span className="font-semibold text-gray-900">
                {form.luggage_type === 'handluggage' ? '🎒 Hand luggage' : '🧳 Check-in'} · {form.available_kg}kg @ ${form.price_per_kg}/kg
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Net earnings est.</span>
              <span className="font-semibold text-emerald-600">${netEarnings.toFixed(2)}</span>
            </div>
          </div>

          {/* Delivery type */}
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
                  desc: 'Shipper hands item to you at departure. You deliver it to recipient at arrival.',
                },
                {
                  value: 'both',
                  icon: '🛍️',
                  label: 'Handover + Shop & Ship',
                  desc: 'You can also purchase items at the destination for an additional service fee.',
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
                        <CheckCircle size={15} className="text-violet-600" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Handover locations */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Departure Handover Location
              </label>
              <p className="text-xs text-gray-400 mb-1.5">
                Where should the shipper hand the item to you before departure?
              </p>
              <div className="relative">
                <MapPin size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
                <input type="text"
                  placeholder="e.g. Dubai Airport Terminal 3 departures, Hotel lobby..."
                  value={form.handover_location_departure}
                  onChange={e => setForm({ ...form, handover_location_departure: e.target.value })}
                  className="input-field pl-9" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Arrival Handover Location
              </label>
              <p className="text-xs text-gray-400 mb-1.5">
                Where will you hand the item to the recipient at the destination?
              </p>
              <div className="relative">
                <MapPin size={15} className="absolute left-3.5 top-3.5 text-gray-400 pointer-events-none" />
                <input type="text"
                  placeholder="e.g. Heathrow arrivals hall, agreed meeting point..."
                  value={form.handover_location_arrival}
                  onChange={e => setForm({ ...form, handover_location_arrival: e.target.value })}
                  className="input-field pl-9" />
              </div>
            </div>
          </div>

          {/* Shop & Ship fee */}
          {form.delivery_type === 'both' && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <ShoppingBag size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-blue-700">Shop & Ship Service Fee</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Your fee for going to the store and purchasing. Item purchase price is paid separately by the shipper via escrow.
                  </p>
                </div>
              </div>
              <div className="flex rounded-xl border border-blue-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-300 transition-all bg-white">
                <span className="flex items-center pl-3 text-gray-400 text-sm font-medium flex-shrink-0 pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  placeholder="e.g. 15.00"
                  min="0"
                  step="0.5"
                  value={form.shop_and_ship_fee}
                  onChange={e => setForm({ ...form, shop_and_ship_fee: e.target.value })}
                  className="flex-1 bg-transparent border-0 focus:outline-none text-sm text-gray-800 py-3 px-2"
                />
              </div>
              {shopFeeGross > 0 && (
                <div className="text-xs space-y-1">
                  <div className="flex justify-between text-gray-500">
                    <span>Your Shop & Ship fee</span><span>${shopFeeGross.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-red-400">
                    <span>Fetchr service fee (10%)</span><span>-${(shopFeeGross * 0.10).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-600 border-t border-blue-100 pt-1">
                    <span>You receive</span><span>${shopFeeNet.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

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