import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, DollarSign, Weight, Calendar,
  CheckCircle, AlertCircle, Camera, X,
  ShoppingBag, MapPin, Link, User, Phone,
  AlertTriangle, Shield, Search, Info
} from 'lucide-react';

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
  { code: 'BGW', city: 'Baghdad', name: 'Baghdad International', country: 'Iraq' },
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

const StoreSearch = ({ value, onChange }) => {
  const [query, setQuery] = useState(value?.name || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const ref = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchPlaces = async (q) => {
    if (q.length < 3) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      setResults(data.map(p => ({
        name: p.display_name.split(',').slice(0, 2).join(',').trim(),
        address: p.display_name,
        lat: parseFloat(p.lat),
        lng: parseFloat(p.lon),
      })));
      setOpen(true);
    } catch (e) { console.error(e); }
    setSearching(false);
  };

  const handleChange = (q) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPlaces(q), 500);
  };

  const handleSelect = (place) => {
    setQuery(place.name);
    onChange(place);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
        Store name &amp; location *
      </label>
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-3.5 text-ink-400 pointer-events-none" />
        {searching && (
          <div className="absolute right-3.5 top-3.5">
            <div className="w-4 h-4 border-2 border-ink-300 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <input type="text" value={query} onChange={e => handleChange(e.target.value)}
          placeholder="Search for store name and location..."
          className="input-field pl-9 pr-10" />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-tooltip w-full mt-1 bg-surface border border-line rounded-lg shadow-elev-2 overflow-hidden max-h-64 overflow-y-auto">
          {results.map((place, i) => (
            <button key={i} type="button" onClick={() => handleSelect(place)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-surface-sunken text-left transition border-b border-line last:border-0">
              <MapPin size={16} className="text-ink-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-body-m font-semibold text-content truncate">{place.name}</p>
                <p className="text-body-s text-content-subtle truncate">{place.address}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && !searching && results.length === 0 && query.length >= 3 && (
        <div className="absolute z-tooltip w-full mt-1 bg-surface border border-line rounded-lg shadow-elev-2 px-4 py-3">
          <p className="text-body-m text-content-muted">No location found for "{query}".</p>
          <p className="text-body-s text-content-subtle mt-1">
            Try just the mall or building name (e.g. "Dubai Mall") instead of the store brand.
          </p>
        </div>
      )}
      {value?.address && (
        <div className="mt-2 bg-success-tint rounded-md px-3 py-2 flex items-start gap-2">
          <MapPin size={13} className="text-success flex-shrink-0 mt-0.5" />
          <p className="text-body-s text-success leading-relaxed">{value.address}</p>
        </div>
      )}
    </div>
  );
};

const AirportSearch = ({ label, value, onChange, placeholder }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualCity, setManualCity] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (value?.code && value.code !== 'OTHER' && value.code !== '') {
      setQuery(`${value.city} (${value.code})`);
    }
  }, [value?.code]);

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
    ).slice(0, 8);
    setResults(filtered);
    setOpen(true);
  };

  const handleSelect = (airport) => {
    if (airport.code === 'OTHER') {
      setShowManual(true); setOpen(false);
      setQuery('Other (enter manually)'); return;
    }
    setQuery(`${airport.city} (${airport.code})`);
    setOpen(false); setResults([]); setShowManual(false);
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
      <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <MapPin size={15} className="absolute left-3.5 top-3.5 text-ink-400 pointer-events-none" />
        <input type="text" value={query} onChange={e => handleSearch(e.target.value)}
          onFocus={() => query.length > 0 && results.length > 0 && setOpen(true)}
          placeholder={placeholder} className="input-field pl-9" />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-tooltip w-full mt-1 bg-surface border border-line rounded-lg shadow-elev-2 overflow-hidden max-h-64 overflow-y-auto">
          {results.map(airport => (
            <button key={airport.code} type="button" onClick={() => handleSelect(airport)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-sunken text-left transition border-b border-line last:border-0">
              <div className="w-16 flex-shrink-0 flex items-center justify-center">
                <span className="text-code-l font-mono font-semibold text-content">{airport.code}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body-m font-semibold text-content">{airport.city}</p>
                <p className="text-body-s text-content-subtle truncate">
                  {airport.name}{airport.country ? ` · ${airport.country}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      {showManual && (
        <div className="mt-2 bg-ink-100 rounded-md p-3 space-y-2">
          <p className="text-body-s font-semibold text-content-muted">Enter airport manually</p>
          <input type="text" placeholder="Airport code (e.g. XYZ)" value={manualCode}
            onChange={e => setManualCode(e.target.value.toUpperCase())} maxLength={3}
            className="input-field py-2 text-body-m uppercase font-mono" />
          <input type="text" placeholder="City name" value={manualCity}
            onChange={e => setManualCity(e.target.value)} className="input-field py-2 text-body-m" />
          <button onClick={handleManualSave} className="btn-primary w-full py-2 text-label">
            Confirm airport
          </button>
        </div>
      )}
    </div>
  );
};

const NewRequest = ({ session }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    item_name: '',
    description: '',
    category: '',
    from_city: '', from_code: '',
    to_city: '', to_code: '',
    weight_kg: '',
    dimensions: '',
    max_budget: '',
    needed_by: '',
    notes: '',
    delivery_mode: null,
    handover_type: 'self',
    trusted_person_name: '',
    trusted_person_phone: '',
    trusted_person_location: '',
    trusted_person_notes: '',
    purchase_store: null,
    purchase_price: '',
    purchase_url: '',
    purchase_details: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const fileInputRef = useRef(null);
  const today = new Date().toISOString().split('T')[0];

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB.'); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError('');
  };

  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const validateStep1 = () => {
    if (!form.item_name.trim()) { setError('Please enter the item name.'); return false; }
    if (!form.category) { setError('Please select a category.'); return false; }
    if (!form.description.trim()) { setError('Please describe the item.'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!form.from_code) { setError('Please select departure airport.'); return false; }
    if (!form.to_code) { setError('Please select arrival airport.'); return false; }
    if (!form.weight_kg || parseFloat(form.weight_kg) <= 0) { setError('Please enter item weight.'); return false; }
    return true;
  };

  const validateStep3 = () => {
    if (!form.delivery_mode) { setError('Please select a delivery option.'); return false; }
    if (form.delivery_mode === 'handover' && form.handover_type === 'trusted_person') {
      if (!form.trusted_person_name.trim()) { setError('Please enter the trusted person\'s name.'); return false; }
      if (!form.trusted_person_phone.trim()) { setError('Please enter their phone number.'); return false; }
      if (!form.trusted_person_location.trim()) { setError('Please enter the meeting location.'); return false; }
    }
    if (form.delivery_mode === 'purchase') {
      if (!form.purchase_store) { setError('Please search for and select the store.'); return false; }
      if (!form.purchase_price || parseFloat(form.purchase_price) <= 0) { setError('Please enter the purchase price.'); return false; }
      if (!form.purchase_url && !form.purchase_details.trim()) {
        setError('Please provide either a product link or product specifications.'); return false;
      }
    }
    if (!safetyAcknowledged) { setError('Please accept the Safety & Legal Declaration to continue.'); return false; }
    return true;
  };

  const handleNext = () => {
    setError('');
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const saveRequest = async () => {
    if (!validateStep3()) return;
    setLoading(true); setError('');

    let photoUrl = null;
    if (photoFile) {
      setUploadingPhoto(true);
      const ext = photoFile.name.split('.').pop();
      const path = `${session.user.id}/request-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars').upload(path, photoFile, { upsert: true });
      if (!upErr) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        photoUrl = data.publicUrl;
      }
      setUploadingPhoto(false);
    }

    const isPurchase = form.delivery_mode === 'purchase';

    let trustedPersonNote = null;
    if (form.delivery_mode === 'handover' && form.handover_type === 'trusted_person') {
      trustedPersonNote = `Handover contact: ${form.trusted_person_name} · ${form.trusted_person_phone} · Meeting location: ${form.trusted_person_location}${form.trusted_person_notes ? ` · ${form.trusted_person_notes}` : ''}`;
    }

    const { error } = await supabase.from('shipment_requests').insert([{
      user_id: session.user.id,
      item_name: form.item_name,
      description: form.description,
      category: form.category,
      from_city: form.from_city || form.from_code,
      from_code: form.from_code.toUpperCase(),
      to_city: form.to_city || form.to_code,
      to_code: form.to_code.toUpperCase(),
      weight_kg: parseFloat(form.weight_kg),
      budget_per_kg: form.max_budget ? parseFloat(form.max_budget) : null,
      needed_by: form.needed_by || null,
      notes: [
        form.notes,
        form.dimensions ? `Dimensions: ${form.dimensions}` : null,
        trustedPersonNote,
      ].filter(Boolean).join('\n') || null,
      item_photo_url: photoUrl,
      status: 'open',
      requires_purchase: isPurchase,
      purchase_store: isPurchase ? form.purchase_store?.name : null,
      purchase_store_address: isPurchase ? form.purchase_store?.address : null,
      purchase_store_lat: isPurchase ? form.purchase_store?.lat : null,
      purchase_store_lng: isPurchase ? form.purchase_store?.lng : null,
      purchase_price: isPurchase ? parseFloat(form.purchase_price) : null,
      purchase_currency: isPurchase ? 'USD' : null,
      purchase_url: isPurchase ? form.purchase_url : null,
      purchase_details: isPurchase ? form.purchase_details : null,
      handover_type: form.delivery_mode === 'handover' ? form.handover_type : null,
      trusted_person_name: form.handover_type === 'trusted_person' ? form.trusted_person_name : null,
      trusted_person_phone: form.handover_type === 'trusted_person' ? form.trusted_person_phone : null,
      trusted_person_location: form.handover_type === 'trusted_person' ? form.trusted_person_location : null,
      trusted_person_notes: form.handover_type === 'trusted_person' ? form.trusted_person_notes : null,
      item_dimensions: form.dimensions || null,
      max_budget: form.max_budget ? parseFloat(form.max_budget) : null,
      budget_currency: 'USD',
    }]);

    if (error) { setError(error.message); } else { setSuccess(true); }
    setLoading(false);
  };

  const resetForm = () => {
    setSuccess(false); setStep(1);
    setForm({
      item_name: '', description: '', category: '',
      from_city: '', from_code: '', to_city: '', to_code: '',
      weight_kg: '', dimensions: '', max_budget: '',
      needed_by: '', notes: '',
      delivery_mode: null, handover_type: 'self',
      trusted_person_name: '', trusted_person_phone: '',
      trusted_person_location: '', trusted_person_notes: '',
      purchase_store: null, purchase_price: '',
      purchase_url: '', purchase_details: '',
    });
    setPhotoFile(null); setPhotoPreview(null); setSafetyAcknowledged(false);
  };

  if (success) return (
    <div className="max-w-xl mx-auto py-16 px-6 text-center animate-fade-in">
      <div className="w-20 h-20 bg-success-tint rounded-lg flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={40} className="text-success" />
      </div>
      <h2 className="font-display font-bold text-title-l text-ink-900 mb-2">Request posted</h2>
      <p className="text-body-m text-content-muted mb-6">
        Your request for <strong className="text-content">{form.item_name}</strong> is live. We'll notify you when a traveller matches.
      </p>
      <div className="card p-5 mb-6 text-left space-y-2.5">
        {[
          { label: 'Item', value: form.item_name },
          { label: 'Category', value: form.category },
          { label: 'Route', value: `${form.from_city || form.from_code} → ${form.to_city || form.to_code}` },
          { label: 'Weight', value: `${form.weight_kg} kg${form.dimensions ? ` · ${form.dimensions}` : ''}` },
          { label: 'Delivery', value: form.delivery_mode === 'purchase' ? 'Shop & Ship' : form.handover_type === 'trusted_person' ? 'Via trusted person' : 'Self handover' },
          form.max_budget && { label: 'Max budget', value: `$${parseFloat(form.max_budget).toFixed(2)}` },
          form.needed_by && { label: 'Needed by', value: formatDateForDisplay(form.needed_by) },
        ].filter(Boolean).map((row, i) => (
          <div key={i} className="flex justify-between text-body-m">
            <span className="text-content-muted">{row.label}</span>
            <span className="font-mono font-semibold text-content">{row.value}</span>
          </div>
        ))}
      </div>
      <button onClick={resetForm} className="btn-primary w-full py-3">Post another request</button>
    </div>
  );

  return (
    <div className="max-w-xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display font-bold text-title-l text-ink-900">New shipment request</h1>
        <p className="text-body-s text-content-muted mt-0.5">Find a traveller to bring your item</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { n: 1, label: 'Item details' },
          { n: 2, label: 'Route & size' },
          { n: 3, label: 'Delivery & safety' },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-md flex items-center justify-center font-display text-body-m font-bold transition-all ${
                step > s.n ? 'bg-success text-white' :
                step === s.n ? 'bg-brand text-white' : 'bg-ink-100 text-ink-400'
              }`}>
                {step > s.n ? <CheckCircle size={16} /> : s.n}
              </div>
              <span className={`text-label font-semibold hidden sm:block ${step === s.n ? 'text-ink-900' : 'text-ink-400'}`}>
                {s.label}
              </span>
            </div>
            {i < 2 && <div className={`flex-1 h-0.5 rounded-full transition-all ${step > s.n ? 'bg-success' : 'bg-ink-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-danger-tint text-danger text-body-m px-4 py-3 rounded-md mb-4">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">Item name *</label>
            <div className="relative">
              <Package size={15} className="absolute left-3.5 top-3.5 text-ink-400 pointer-events-none" />
              <input type="text" placeholder="e.g. iPhone 15 Pro, Nike Air Max..."
                value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })}
                className="input-field pl-9" />
            </div>
          </div>

          <div>
            <label className="block text-label text-content-muted mb-2 uppercase tracking-wide">Category *</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button" onClick={() => setForm({ ...form, category: cat })}
                  className={`px-3 py-1.5 rounded-md text-label font-semibold border transition-all ${
                    form.category === cat
                      ? 'bg-brand text-white border-brand'
                      : 'bg-surface text-content border-line-strong hover:border-ink-400'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">Description *</label>
            <textarea placeholder="Describe the item — brand, model, color, size, condition..."
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              rows={3} className="input-field resize-none" />
          </div>

          <div>
            <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
              Item photo <span className="text-ink-300 font-normal normal-case">(optional but recommended)</span>
            </label>
            {photoPreview ? (
              <div className="relative rounded-lg overflow-hidden border border-line bg-surface-sunken" style={{ height: '176px' }}>
                <img src={photoPreview} alt="Preview" className="w-full h-full object-contain" />
                <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 bg-danger-fill text-white rounded-md flex items-center justify-center hover:bg-void-700">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-line-strong rounded-lg p-8 flex flex-col items-center gap-2 hover:border-ink-400 hover:bg-surface-sunken transition-all group">
                <div className="w-10 h-10 bg-ink-100 rounded-md flex items-center justify-center group-hover:bg-ink-200 transition">
                  <Camera size={20} className="text-ink-400 group-hover:text-ink-600 transition" />
                </div>
                <p className="text-body-m text-content-muted group-hover:text-content font-medium">Click to upload photo</p>
                <p className="text-body-s text-content-subtle">JPG, PNG up to 5MB</p>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          </div>

          <button onClick={handleNext} className="btn-primary w-full py-3.5">Continue to route &amp; size</button>
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-surface-sunken rounded-md p-3.5 flex items-center gap-3 border border-line">
            {photoPreview ? (
              <div className="w-12 h-12 rounded-md overflow-hidden bg-surface border border-line flex-shrink-0">
                <img src={photoPreview} alt="" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-12 h-12 bg-ink-100 rounded-md flex items-center justify-center flex-shrink-0">
                <Package size={18} className="text-ink-400" />
              </div>
            )}
            <div>
              <p className="font-display font-semibold text-title-s text-ink-900">{form.item_name}</p>
              <p className="text-body-s text-content-subtle">{form.category}</p>
            </div>
          </div>

          <AirportSearch
            label="From (Departure Airport) *"
            value={{ city: form.from_city, code: form.from_code }}
            onChange={airport => setForm({ ...form, from_code: airport.code, from_city: airport.city })}
            placeholder="Search city, airport or code..."
          />

          <AirportSearch
            label="To (Arrival Airport) *"
            value={{ city: form.to_city, code: form.to_code }}
            onChange={airport => setForm({ ...form, to_code: airport.code, to_city: airport.city })}
            placeholder="Search city, airport or code..."
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
                Total weight (kg) *
              </label>
              <div className="relative">
                <Weight size={15} className="absolute left-3.5 top-3.5 text-ink-400 pointer-events-none" />
                <input type="number" placeholder="e.g. 2.5" min="0.1" max="50" step="0.1"
                  value={form.weight_kg} onChange={e => setForm({ ...form, weight_kg: e.target.value })}
                  className="input-field pl-9 font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
                Dimensions <span className="text-ink-300 font-normal normal-case">(optional)</span>
              </label>
              <input type="text" placeholder="e.g. 30×20×10cm"
                value={form.dimensions} onChange={e => setForm({ ...form, dimensions: e.target.value })}
                className="input-field" />
            </div>
          </div>

          {/* Max budget — USD only */}
          <div>
            <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
              Max budget (USD) <span className="text-ink-300 font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <DollarSign size={15} className="absolute left-3.5 top-3.5 text-ink-400 pointer-events-none" />
              <input type="number" placeholder="Optional max you'll pay" min="0" step="0.01"
                value={form.max_budget} onChange={e => {
                  const v = e.target.value;
                  if (v === '' || parseFloat(v) >= 0) setForm({ ...form, max_budget: v });
                }}
                className="input-field pl-9 font-mono" />
            </div>
            {form.max_budget && (
              <div className="mt-2 bg-surface-sunken rounded-md p-3.5 flex items-center justify-between border border-line">
                <span className="text-body-m text-content-muted font-medium">Your maximum budget</span>
                <span className="font-mono text-num-l font-bold text-ink-900">${parseFloat(form.max_budget).toFixed(2)}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
              Needed by <span className="text-ink-300 font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <Calendar size={15} className="absolute left-3.5 top-3.5 text-ink-400 pointer-events-none" />
              <input type="date" min={today} value={form.needed_by}
                onChange={e => setForm({ ...form, needed_by: e.target.value })}
                className="input-field pl-9" />
            </div>
            {form.needed_by && (
              <p className="text-body-s text-content-subtle mt-1 ml-1 font-mono">Selected: {formatDateForDisplay(form.needed_by)}</p>
            )}
          </div>

          <div>
            <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
              Notes <span className="text-ink-300 font-normal normal-case">(optional)</span>
            </label>
            <textarea placeholder="Fragile, special packaging, any other requirements..."
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} className="input-field resize-none" />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1 py-3">Back</button>
            <button onClick={handleNext} className="btn-primary flex-1 py-3">Continue to delivery</button>
          </div>
        </div>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <div className="space-y-5">

          <div className="card p-4 space-y-1.5 text-body-m">
            {[
              { label: 'Item', value: form.item_name },
              { label: 'Route', value: `${form.from_city || form.from_code} → ${form.to_city || form.to_code}` },
              { label: 'Weight', value: `${form.weight_kg} kg${form.dimensions ? ` · ${form.dimensions}` : ''}` },
              form.max_budget && { label: 'Max budget', value: `$${parseFloat(form.max_budget).toFixed(2)}` },
            ].filter(Boolean).map((row, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-content-muted">{row.label}</span>
                <span className="font-mono font-semibold text-content">{row.value}</span>
              </div>
            ))}
          </div>

          {/* Delivery mode */}
          <div>
            <label className="block text-label text-content-muted mb-2 uppercase tracking-wide">
              How should this be delivered? *
            </label>
            <div className="space-y-2">
              {[
                {
                  value: 'handover',
                  icon: Package,
                  label: 'I have the item and will hand it to the traveller',
                  desc: 'You or a trusted person will provide the item directly to the traveller before their flight.',
                },
                {
                  value: 'purchase',
                  icon: ShoppingBag,
                  label: 'I need the traveller to purchase the item for me',
                  desc: 'The traveller buys the item at the destination. You pay the item cost plus their service fee via secure escrow.',
                },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm({ ...form, delivery_mode: opt.value })}
                  className={`w-full flex items-start gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                    form.delivery_mode === opt.value
                      ? 'border-ink-900 bg-surface-sunken'
                      : 'border-line hover:border-line-strong bg-surface'
                  }`}>
                  <opt.icon size={20} className="text-ink-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-display font-semibold text-title-s text-ink-900">{opt.label}</p>
                      {form.delivery_mode === opt.value && (
                        <CheckCircle size={15} className="text-ink-900 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-body-s text-content-muted mt-0.5 leading-relaxed">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Handover sub-flow */}
          {form.delivery_mode === 'handover' && (
            <div className="space-y-4">
              <div className="bg-danger-tint rounded-r px-2.5 py-2.5 flex items-start gap-2 border-l-[3px] border-danger">
                <AlertTriangle size={14} className="text-danger flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-body-s font-semibold text-danger mb-1">Item security notice</p>
                  <p className="text-body-s text-danger leading-relaxed">
                    Do not hand over the item until escrow is confirmed paid. Once the deal is matched and terms agreed, the sender must pay escrow before you release the item. The traveller's identity is logged in the deal — always verify it before releasing the item.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-label text-content-muted mb-2 uppercase tracking-wide">
                  Who will hand over the item? *
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'self', icon: User, label: 'I will hand it over myself', desc: 'You will personally meet the traveller and hand over the item.' },
                    { value: 'trusted_person', icon: Shield, label: 'A trusted person will hand it over on my behalf', desc: 'A family member, friend, or colleague will meet the traveller.' },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setForm({ ...form, handover_type: opt.value })}
                      className={`w-full flex items-start gap-3 p-3.5 rounded-lg border-2 transition-all text-left ${
                        form.handover_type === opt.value
                          ? 'border-ink-900 bg-surface-sunken'
                          : 'border-line hover:border-line-strong bg-surface'
                      }`}>
                      <opt.icon size={18} className="text-ink-600 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-display font-semibold text-title-s text-ink-900">{opt.label}</p>
                          {form.handover_type === opt.value && (
                            <CheckCircle size={14} className="text-ink-900 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-body-s text-content-muted mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {form.handover_type === 'trusted_person' && (
                <div className="bg-info-50 rounded-lg p-4 space-y-3">
                  <p className="text-body-s font-semibold text-info-500 flex items-center gap-1.5">
                    <User size={13} /> Trusted person details
                  </p>
                  <p className="text-body-s text-info-500 leading-relaxed">
                    These details will be shared with the matched traveller so they can coordinate the handover.
                  </p>
                  {[
                    { label: 'Full name *', key: 'trusted_person_name', placeholder: 'e.g. Sarah Johnson', icon: User },
                    { label: 'Phone / WhatsApp *', key: 'trusted_person_phone', placeholder: 'e.g. +971 50 123 4567', icon: Phone },
                    { label: 'Meeting location *', key: 'trusted_person_location', placeholder: 'e.g. Dubai Mall main entrance...', icon: MapPin },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">{f.label}</label>
                      <div className="relative">
                        <f.icon size={14} className="absolute left-3.5 top-3 text-ink-400 pointer-events-none" />
                        <input type="text" placeholder={f.placeholder}
                          value={form[f.key]}
                          onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                          className="input-field pl-8 py-2.5" />
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
                      Additional notes <span className="text-ink-300 font-normal normal-case">(optional)</span>
                    </label>
                    <input type="text" placeholder="e.g. Available weekdays 9am-6pm..."
                      value={form.trusted_person_notes}
                      onChange={e => setForm({ ...form, trusted_person_notes: e.target.value })}
                      className="input-field py-2.5" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Purchase sub-flow */}
          {form.delivery_mode === 'purchase' && (
            <div className="bg-info-50 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ShoppingBag size={16} className="text-info-500" />
                <p className="font-display font-semibold text-title-s text-info-500">Purchase details</p>
              </div>
              <p className="text-body-s text-info-500 leading-relaxed">
                All amounts in USD. Provide as much detail as possible so the traveller can find and purchase the exact item.
              </p>

              <StoreSearch
                value={form.purchase_store}
                onChange={place => setForm({ ...form, purchase_store: place })}
              />

              <div>
                <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
                  Anticipated purchase price (USD) *
                </label>
                <div className="relative">
                  <DollarSign size={15} className="absolute left-3.5 top-3.5 text-ink-400 pointer-events-none" />
                  <input type="number" placeholder="e.g. 299.00" min="0" step="0.01"
                    value={form.purchase_price}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '' || parseFloat(v) >= 0) setForm({ ...form, purchase_price: v });
                    }}
                    className="input-field pl-9 font-mono" />
                </div>
              </div>

              <div>
                <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
                  Product link <span className="text-ink-300 font-normal normal-case">(optional)</span>
                </label>
                <div className="relative">
                  <Link size={14} className="absolute left-3.5 top-3 text-ink-400 pointer-events-none" />
                  <input type="url" placeholder="https://www.apple.com/iphone-15-pro..."
                    value={form.purchase_url}
                    onChange={e => setForm({ ...form, purchase_url: e.target.value })}
                    className="input-field pl-8 py-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
                  Product specifications{' '}
                  {!form.purchase_url && <span className="text-danger">*</span>}
                  {form.purchase_url && <span className="text-ink-300 font-normal normal-case">(optional if link provided)</span>}
                </label>
                <textarea
                  placeholder="Size, color, model number, storage, specific variants..."
                  value={form.purchase_details}
                  onChange={e => setForm({ ...form, purchase_details: e.target.value })}
                  rows={3} className="input-field resize-none py-2.5"
                />
                {!form.purchase_url && (
                  <p className="text-body-s text-warning mt-1 flex items-center gap-1">
                    <Info size={11} /> Required when no product link is provided
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Safety declaration */}
          <div className="bg-warning-tint rounded-r px-4 py-4 border-l-[3px] border-warn-400">
            <p className="text-body-s font-semibold text-warning mb-3 flex items-center gap-1.5">
              <Shield size={13} /> Safety &amp; legal declaration
            </p>
            <div className="flex items-start gap-3">
              <input type="checkbox" id="safety-ack-req" checked={safetyAcknowledged}
                onChange={e => setSafetyAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-ink-900 flex-shrink-0" />
              <label htmlFor="safety-ack-req" className="text-body-s text-warning leading-relaxed cursor-pointer">
                I confirm that:
                <ul className="mt-1.5 space-y-1 list-disc list-inside ml-1">
                  <li>The item is <strong>legal</strong> and complies with all airline regulations and customs laws.</li>
                  <li>I am <strong>not</strong> requesting transport of illegal substances, weapons, counterfeit goods, or any prohibited items.</li>
                  <li>I accept <strong>full legal responsibility</strong> for this shipment.</li>
                  <li>fetchr is a <strong>matchmaking and payment platform only</strong> — no liability for items transported.</li>
                  <li>Violation results in <strong>immediate account termination</strong> and may be reported to authorities.</li>
                </ul>
              </label>
            </div>
            {!safetyAcknowledged && (
              <p className="text-body-s text-warning font-semibold mt-3 flex items-center gap-1.5">
                <AlertCircle size={12} /> You must accept this declaration to post the request.
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-danger-tint text-danger text-body-m px-4 py-3 rounded-md">
              <AlertCircle size={16} className="flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1 py-3">Back</button>
            <button onClick={saveRequest} disabled={loading || uploadingPhoto || !safetyAcknowledged}
              className="btn-primary flex-1 py-3.5 disabled:opacity-50">
              {loading || uploadingPhoto
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Posting</>
                : <><Package size={15} /> Post request</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewRequest;