import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, DollarSign, Weight, Calendar,
  CheckCircle, AlertCircle, Camera, X,
  ShoppingBag, MapPin, Link, Search, User, Phone
} from 'lucide-react';

const CATEGORIES = [
  'Electronics', 'Clothing & Fashion', 'Cosmetics & Beauty',
  'Food & Beverages', 'Books & Stationery', 'Toys & Games',
  'Medical & Pharmacy', 'Jewelry & Accessories', 'Sports & Fitness',
  'Home & Living', 'Documents', 'Other'
];

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal' },
  { code: 'QAR', symbol: 'QAR', name: 'Qatari Riyal' },
  { code: 'KWD', symbol: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'BHD', symbol: 'BHD', name: 'Bahraini Dinar' },
  { code: 'OMR', symbol: 'OMR', name: 'Omani Rial' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
];

const AIRPORTS = [
  { code: 'DXB', city: 'Dubai', name: 'Dubai International', country: 'UAE' },
  { code: 'DWC', city: 'Dubai', name: 'Al Maktoum International', country: 'UAE' },
  { code: 'AUH', city: 'Abu Dhabi', name: 'Zayed International', country: 'UAE' },
  { code: 'SHJ', city: 'Sharjah', name: 'Sharjah International', country: 'UAE' },
  { code: 'RKT', city: 'Ras Al Khaimah', name: 'RAK International', country: 'UAE' },
  { code: 'DOH', city: 'Doha', name: 'Hamad International', country: 'Qatar' },
  { code: 'KWI', city: 'Kuwait City', name: 'Kuwait International', country: 'Kuwait' },
  { code: 'BAH', city: 'Manama', name: 'Bahrain International', country: 'Bahrain' },
  { code: 'RUH', city: 'Riyadh', name: 'King Khalid International', country: 'Saudi Arabia' },
  { code: 'JED', city: 'Jeddah', name: 'King Abdulaziz International', country: 'Saudi Arabia' },
  { code: 'DMM', city: 'Dammam', name: 'King Fahd International', country: 'Saudi Arabia' },
  { code: 'MCT', city: 'Muscat', name: 'Muscat International', country: 'Oman' },
  { code: 'AMM', city: 'Amman', name: 'Queen Alia International', country: 'Jordan' },
  { code: 'BEY', city: 'Beirut', name: 'Rafic Hariri International', country: 'Lebanon' },
  { code: 'CAI', city: 'Cairo', name: 'Cairo International', country: 'Egypt' },
  { code: 'TLV', city: 'Tel Aviv', name: 'Ben Gurion International', country: 'Israel' },
  { code: 'LHR', city: 'London', name: 'Heathrow', country: 'UK' },
  { code: 'LGW', city: 'London', name: 'Gatwick', country: 'UK' },
  { code: 'STN', city: 'London', name: 'Stansted', country: 'UK' },
  { code: 'MAN', city: 'Manchester', name: 'Manchester Airport', country: 'UK' },
  { code: 'BHX', city: 'Birmingham', name: 'Birmingham Airport', country: 'UK' },
  { code: 'EDI', city: 'Edinburgh', name: 'Edinburgh Airport', country: 'UK' },
  { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle', country: 'France' },
  { code: 'ORY', city: 'Paris', name: 'Orly', country: 'France' },
  { code: 'NCE', city: 'Nice', name: 'Nice Cote d Azur', country: 'France' },
  { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt Airport', country: 'Germany' },
  { code: 'MUC', city: 'Munich', name: 'Munich Airport', country: 'Germany' },
  { code: 'BER', city: 'Berlin', name: 'Brandenburg Airport', country: 'Germany' },
  { code: 'AMS', city: 'Amsterdam', name: 'Schiphol', country: 'Netherlands' },
  { code: 'MAD', city: 'Madrid', name: 'Adolfo Suarez Barajas', country: 'Spain' },
  { code: 'BCN', city: 'Barcelona', name: 'El Prat', country: 'Spain' },
  { code: 'FCO', city: 'Rome', name: 'Fiumicino', country: 'Italy' },
  { code: 'MXP', city: 'Milan', name: 'Malpensa', country: 'Italy' },
  { code: 'VCE', city: 'Venice', name: 'Marco Polo', country: 'Italy' },
  { code: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Turkey' },
  { code: 'SAW', city: 'Istanbul', name: 'Sabiha Gokcen', country: 'Turkey' },
  { code: 'ATH', city: 'Athens', name: 'Eleftherios Venizelos', country: 'Greece' },
  { code: 'ZRH', city: 'Zurich', name: 'Zurich Airport', country: 'Switzerland' },
  { code: 'GVA', city: 'Geneva', name: 'Geneva Airport', country: 'Switzerland' },
  { code: 'VIE', city: 'Vienna', name: 'Vienna International', country: 'Austria' },
  { code: 'BRU', city: 'Brussels', name: 'Brussels Airport', country: 'Belgium' },
  { code: 'CPH', city: 'Copenhagen', name: 'Kastrup', country: 'Denmark' },
  { code: 'ARN', city: 'Stockholm', name: 'Arlanda', country: 'Sweden' },
  { code: 'HEL', city: 'Helsinki', name: 'Helsinki-Vantaa', country: 'Finland' },
  { code: 'OSL', city: 'Oslo', name: 'Gardermoen', country: 'Norway' },
  { code: 'WAW', city: 'Warsaw', name: 'Chopin Airport', country: 'Poland' },
  { code: 'PRG', city: 'Prague', name: 'Vaclav Havel', country: 'Czech Republic' },
  { code: 'BUD', city: 'Budapest', name: 'Ferenc Liszt', country: 'Hungary' },
  { code: 'LIS', city: 'Lisbon', name: 'Humberto Delgado', country: 'Portugal' },
  { code: 'DUB', city: 'Dublin', name: 'Dublin Airport', country: 'Ireland' },
  { code: 'JFK', city: 'New York', name: 'John F Kennedy', country: 'USA' },
  { code: 'EWR', city: 'New York', name: 'Newark Liberty', country: 'USA' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', country: 'USA' },
  { code: 'ORD', city: 'Chicago', name: 'O Hare International', country: 'USA' },
  { code: 'ATL', city: 'Atlanta', name: 'Hartsfield-Jackson', country: 'USA' },
  { code: 'MIA', city: 'Miami', name: 'Miami International', country: 'USA' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco International', country: 'USA' },
  { code: 'BOS', city: 'Boston', name: 'Logan International', country: 'USA' },
  { code: 'DFW', city: 'Dallas', name: 'Dallas Fort Worth', country: 'USA' },
  { code: 'SEA', city: 'Seattle', name: 'Seattle-Tacoma', country: 'USA' },
  { code: 'YYZ', city: 'Toronto', name: 'Pearson International', country: 'Canada' },
  { code: 'YVR', city: 'Vancouver', name: 'Vancouver International', country: 'Canada' },
  { code: 'YUL', city: 'Montreal', name: 'Pierre Elliott Trudeau', country: 'Canada' },
  { code: 'GRU', city: 'Sao Paulo', name: 'Guarulhos International', country: 'Brazil' },
  { code: 'EZE', city: 'Buenos Aires', name: 'Ministro Pistarini', country: 'Argentina' },
  { code: 'SIN', city: 'Singapore', name: 'Changi Airport', country: 'Singapore' },
  { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi', country: 'Thailand' },
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
  { code: 'GYD', city: 'Baku', name: 'Heydar Aliyev International', country: 'Azerbaijan' },
  { code: 'TBS', city: 'Tbilisi', name: 'Shota Rustaveli International', country: 'Georgia' },
  { code: 'OTHER', city: 'Other', name: 'Not listed — enter manually', country: '' },
];

const AirportSearch = ({ label, value, onChange, placeholder }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualCity, setManualCity] = useState('');
  const ref = React.useRef(null);

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
        <MapPin size={15} className="absolute left-3.5 top-3.5 text-gray-400" />
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

const NewRequest = ({ session }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    item_name: '',
    description: '',
    category: '',
    from_city: '', from_code: '',
    to_city: '', to_code: '',
    weight_kg: '',
    budget_per_kg: '',
    currency: 'USD',
    needed_by: '',
    notes: '',
    // Handover details
    handover_type: 'self', // 'self' or 'trusted_person'
    trusted_person_name: '',
    trusted_person_phone: '',
    trusted_person_notes: '',
    // Shop & Ship
    requires_purchase: false,
    purchase_store: '',
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

  const selectedCurrency = CURRENCIES.find(c => c.code === form.currency) || CURRENCIES[0];

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB.'); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError('');
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
    if (!form.budget_per_kg || parseFloat(form.budget_per_kg) <= 0) { setError('Please enter budget per kg.'); return false; }
    return true;
  };

  const validateStep3 = () => {
    if (!safetyAcknowledged) { setError('Please accept the safety & legal declaration.'); return false; }
    if (form.handover_type === 'trusted_person') {
      if (!form.trusted_person_name.trim()) { setError('Please enter the trusted person\'s name.'); return false; }
      if (!form.trusted_person_phone.trim()) { setError('Please enter the trusted person\'s phone number.'); return false; }
    }
    if (form.requires_purchase) {
      if (!form.purchase_store.trim()) { setError('Please enter the store name.'); return false; }
      if (!form.purchase_price || parseFloat(form.purchase_price) <= 0) { setError('Please enter the purchase price.'); return false; }
    }
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
      budget_per_kg: parseFloat(form.budget_per_kg),
      needed_by: form.needed_by || null,
      notes: form.notes,
      item_photo_url: photoUrl,
      status: 'open',
      requires_purchase: form.requires_purchase,
      purchase_store: form.requires_purchase ? form.purchase_store : null,
      purchase_price: form.requires_purchase ? parseFloat(form.purchase_price) : null,
      purchase_url: form.requires_purchase ? form.purchase_url : null,
      purchase_details: form.requires_purchase
        ? `${form.purchase_details}${form.trusted_person_name ? `\n\nHandover contact: ${form.trusted_person_name} · ${form.trusted_person_phone}${form.trusted_person_notes ? ` · ${form.trusted_person_notes}` : ''}` : ''}`
        : form.trusted_person_name
          ? `Trusted handover person: ${form.trusted_person_name} · ${form.trusted_person_phone}${form.trusted_person_notes ? ` · ${form.trusted_person_notes}` : ''}`
          : null,
    }]);

    if (error) { setError(error.message); } else { setSuccess(true); }
    setLoading(false);
  };

  const resetForm = () => {
    setSuccess(false); setStep(1);
    setForm({
      item_name: '', description: '', category: '',
      from_city: '', from_code: '', to_city: '', to_code: '',
      weight_kg: '', budget_per_kg: '', currency: 'USD',
      needed_by: '', notes: '',
      handover_type: 'self',
      trusted_person_name: '', trusted_person_phone: '', trusted_person_notes: '',
      requires_purchase: false,
      purchase_store: '', purchase_price: '', purchase_url: '', purchase_details: '',
    });
    setPhotoFile(null); setPhotoPreview(null); setSafetyAcknowledged(false);
  };

  const totalBudget = form.weight_kg && form.budget_per_kg
    ? (parseFloat(form.weight_kg) * parseFloat(form.budget_per_kg)).toFixed(2)
    : null;

  if (success) return (
    <div className="max-w-xl mx-auto py-16 px-6 text-center animate-fade-in">
      <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={40} className="text-emerald-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Request Posted!</h2>
      <p className="text-gray-500 mb-6">
        Your request for <strong>{form.item_name}</strong> is live. We'll notify you when a traveler matches.
      </p>
      <div className="bg-gray-50 rounded-2xl p-5 mb-6 text-left space-y-2 border border-gray-100">
        {[
          { label: 'Item', value: form.item_name },
          { label: 'Category', value: form.category },
          { label: 'Route', value: `${form.from_city || form.from_code} → ${form.to_city || form.to_code}` },
          { label: 'Weight', value: `${form.weight_kg}kg` },
          { label: 'Budget', value: `${selectedCurrency.symbol}${form.budget_per_kg}/kg · ~${selectedCurrency.symbol}${totalBudget}` },
        ].map((row, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-500">{row.label}</span>
            <span className="font-semibold text-gray-900">{row.value}</span>
          </div>
        ))}
      </div>
      <button onClick={resetForm} className="w-full btn-primary py-3">
        Post Another Request
      </button>
    </div>
  );

  return (
    <div className="max-w-xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Shipment Request</h1>
        <p className="text-gray-500 text-sm mt-0.5">Find a traveler to bring your item</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { n: 1, label: 'Item Details' },
          { n: 2, label: 'Route & Budget' },
          { n: 3, label: 'Delivery & Safety' },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${
                step > s.n ? 'bg-emerald-500 text-white' :
                step === s.n ? 'bg-violet-600 text-white shadow-button' :
                'bg-gray-100 text-gray-400'
              }`}>
                {step > s.n ? <CheckCircle size={16} /> : s.n}
              </div>
              <span className={`text-xs font-semibold hidden sm:block ${
                step === s.n ? 'text-violet-600' : 'text-gray-400'
              }`}>
                {s.label}
              </span>
            </div>
            {i < 2 && (
              <div className={`flex-1 h-0.5 rounded-full transition-all ${
                step > s.n ? 'bg-emerald-400' : 'bg-gray-200'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── STEP 1: Item Details ── */}
      {step === 1 && (
        <div className="space-y-4">

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Item Name *
            </label>
            <div className="relative">
              <Package size={15} className="absolute left-3.5 top-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="e.g. iPhone 15 Pro, Nike Air Max..."
                value={form.item_name}
                onChange={e => setForm({ ...form, item_name: e.target.value })}
                className="input-field pl-9"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Category *
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button"
                  onClick={() => setForm({ ...form, category: cat })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    form.category === cat
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
              Description *
            </label>
            <textarea
              placeholder="Describe the item in detail — brand, model, color, size, condition..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="input-field resize-none"
            />
          </div>

          {/* Photo upload */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Item Photo{' '}
              <span className="text-gray-300 font-normal normal-case">(optional but recommended)</span>
            </label>
            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50" style={{ height: '176px' }}>
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-lg flex items-center justify-center hover:bg-red-600 shadow-sm">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 hover:border-violet-300 hover:bg-violet-50/30 transition-all group">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-violet-100 transition">
                  <Camera size={20} className="text-gray-400 group-hover:text-violet-500 transition" />
                </div>
                <p className="text-sm text-gray-400 group-hover:text-violet-500 transition font-medium">
                  Click to upload photo
                </p>
                <p className="text-xs text-gray-300">JPG, PNG up to 5MB</p>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          </div>

          <button onClick={handleNext} className="w-full btn-primary py-3.5">
            Continue to Route & Budget
          </button>
        </div>
      )}

      {/* ── STEP 2: Route & Budget ── */}
      {step === 2 && (
        <div className="space-y-4">

          {/* Item summary */}
          <div className="bg-gray-50 rounded-xl p-3.5 flex items-center gap-3 border border-gray-100">
            {photoPreview ? (
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-white border border-gray-100 flex-shrink-0">
                <img src={photoPreview} alt="" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-12 h-12 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Package size={18} className="text-violet-400" />
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-gray-900">{form.item_name}</p>
              <p className="text-xs text-gray-400">{form.category}</p>
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
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Weight (kg) *
              </label>
              <div className="relative">
                <Weight size={15} className="absolute left-3.5 top-3.5 text-gray-400" />
                <input
                  type="number" placeholder="e.g. 2" min="0.1" max="30" step="0.1"
                  value={form.weight_kg}
                  onChange={e => setForm({ ...form, weight_kg: e.target.value })}
                  className="input-field pl-9"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Budget/kg *
              </label>
              <div className="flex gap-1.5">
                <select
                  value={form.currency}
                  onChange={e => setForm({ ...form, currency: e.target.value })}
                  className="input-field py-3 px-2 w-24 flex-shrink-0 text-xs font-semibold">
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
                <div className="relative flex-1">
                  <DollarSign size={15} className="absolute left-3 top-3.5 text-gray-400" />
                  <input
                    type="number" placeholder="e.g. 10" min="1" step="0.5"
                    value={form.budget_per_kg}
                    onChange={e => setForm({ ...form, budget_per_kg: e.target.value })}
                    className="input-field pl-8"
                  />
                </div>
              </div>
            </div>
          </div>

          {totalBudget && (
            <div className="bg-violet-50 rounded-xl p-3.5 flex items-center justify-between border border-violet-100">
              <span className="text-sm text-gray-600 font-medium">Estimated shipping budget</span>
              <span className="text-base font-bold text-violet-700">
                {selectedCurrency.symbol}{totalBudget} {form.currency !== 'USD' ? form.currency : ''}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Needed By{' '}
              <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <Calendar size={15} className="absolute left-3.5 top-3.5 text-gray-400" />
              <input
                type="date" min={today}
                value={form.needed_by}
                onChange={e => setForm({ ...form, needed_by: e.target.value })}
                className="input-field pl-9"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Notes{' '}
              <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              placeholder="Special handling, fragile items, packaging requirements..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="input-field resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 btn-secondary py-3">Back</button>
            <button onClick={handleNext} className="flex-1 btn-primary py-3">
              Continue to Delivery
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Delivery & Safety ── */}
      {step === 3 && (
        <div className="space-y-4">

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Item</span>
              <span className="font-semibold text-gray-900">{form.item_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Route</span>
              <span className="font-semibold text-gray-900">
                {form.from_city || form.from_code} → {form.to_city || form.to_code}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Budget</span>
              <span className="font-semibold text-violet-700">
                {selectedCurrency.symbol}{form.budget_per_kg}/kg · ~{selectedCurrency.symbol}{totalBudget}
              </span>
            </div>
          </div>

          {/* ── Handover arrangement ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              How will the item be handed over? *
            </label>
            <div className="space-y-2">
              {[
                {
                  value: 'self',
                  icon: '🙋',
                  label: 'I will hand it over myself',
                  desc: 'You will personally meet the traveler at the departure location and hand over the item.',
                },
                {
                  value: 'trusted_person',
                  icon: '🤝',
                  label: 'A trusted person will hand it over on my behalf',
                  desc: 'Someone you trust (family, friend, colleague) will meet the traveler and hand over the item. You\'ll need to provide their contact details.',
                },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm({ ...form, handover_type: opt.value })}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    form.handover_type === opt.value
                      ? 'border-violet-400 bg-violet-50'
                      : 'border-gray-200 hover:border-violet-200 bg-white'
                  }`}>
                  <span className="text-2xl flex-shrink-0">{opt.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900">{opt.label}</p>
                      {form.handover_type === opt.value && (
                        <CheckCircle size={15} className="text-violet-600 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Trusted person details */}
          {form.handover_type === 'trusted_person' && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
                <User size={13} /> Trusted Person Details
              </p>
              <p className="text-xs text-indigo-600 leading-relaxed">
                These details will be shared with the matched traveler so they can coordinate the handover.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Full Name *
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3.5 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="e.g. Sarah Johnson"
                    value={form.trusted_person_name}
                    onChange={e => setForm({ ...form, trusted_person_name: e.target.value })}
                    className="input-field pl-8 py-2.5"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Phone / WhatsApp *
                </label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3.5 top-3 text-gray-400" />
                  <input
                    type="tel"
                    placeholder="e.g. +971 50 123 4567"
                    value={form.trusted_person_phone}
                    onChange={e => setForm({ ...form, trusted_person_phone: e.target.value })}
                    className="input-field pl-8 py-2.5"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Additional Notes{' '}
                  <span className="text-gray-300 font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Will be at Dubai Mall entrance at 2pm..."
                  value={form.trusted_person_notes}
                  onChange={e => setForm({ ...form, trusted_person_notes: e.target.value })}
                  className="input-field py-2.5"
                />
              </div>
            </div>
          )}

          {/* ── Purchase type ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Do you need the traveler to purchase the item? *
            </label>
            <div className="space-y-2">
              {[
                {
                  value: false,
                  icon: '📦',
                  label: 'No — I already have the item',
                  desc: 'You or your trusted person will provide the item to the traveler.',
                },
                {
                  value: true,
                  icon: '🛍️',
                  label: 'Yes — the traveler should purchase it for me',
                  desc: 'The traveler buys the item at the destination. You pay item price + their service fee via escrow.',
                },
              ].map(opt => (
                <button key={String(opt.value)} type="button"
                  onClick={() => setForm({ ...form, requires_purchase: opt.value })}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    form.requires_purchase === opt.value
                      ? 'border-violet-400 bg-violet-50'
                      : 'border-gray-200 hover:border-violet-200 bg-white'
                  }`}>
                  <span className="text-2xl flex-shrink-0">{opt.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900">{opt.label}</p>
                      {form.requires_purchase === opt.value && (
                        <CheckCircle size={15} className="text-violet-600 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Shop & Ship purchase details */}
          {form.requires_purchase && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag size={16} className="text-blue-600" />
                <p className="text-sm font-bold text-blue-700">Purchase Details</p>
              </div>
              <p className="text-xs text-blue-600 mb-2 leading-relaxed">
                Provide as much detail as possible so the traveler can find and purchase the exact item.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Store Name & Location *
                </label>
                <div className="relative">
                  <Search size={14} className="absolute left-3.5 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="e.g. Apple Store Regent Street London, Zara Oxford Street..."
                    value={form.purchase_store}
                    onChange={e => setForm({ ...form, purchase_store: e.target.value })}
                    className="input-field pl-8 py-2.5"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Include the store name and city/area so the traveler can find it easily.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Anticipated Purchase Price *
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={form.currency}
                    onChange={e => setForm({ ...form, currency: e.target.value })}
                    className="input-field py-2.5 px-2 w-24 flex-shrink-0 text-xs font-semibold">
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                  <div className="relative flex-1">
                    <DollarSign size={14} className="absolute left-3 top-3 text-gray-400" />
                    <input
                      type="number" placeholder="e.g. 299.00" min="0" step="0.01"
                      value={form.purchase_price}
                      onChange={e => setForm({ ...form, purchase_price: e.target.value })}
                      className="input-field pl-8 py-2.5"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Product Link{' '}
                  <span className="text-gray-300 font-normal normal-case">(optional but very helpful)</span>
                </label>
                <div className="relative">
                  <Link size={14} className="absolute left-3.5 top-3 text-gray-400" />
                  <input
                    type="url"
                    placeholder="https://www.apple.com/iphone-15-pro..."
                    value={form.purchase_url}
                    onChange={e => setForm({ ...form, purchase_url: e.target.value })}
                    className="input-field pl-8 py-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Product Specifications
                </label>
                <textarea
                  placeholder="Size, color, model number, storage capacity, specific variants the traveler must get..."
                  value={form.purchase_details}
                  onChange={e => setForm({ ...form, purchase_details: e.target.value })}
                  rows={3}
                  className="input-field resize-none py-2.5"
                />
              </div>

              {form.purchase_price && totalBudget && (
                <div className="bg-white rounded-xl p-3.5 space-y-1.5 text-xs border border-blue-100">
                  <p className="font-bold text-gray-700 mb-2">Indicative Total Escrow</p>
                  <p className="text-gray-400 italic mb-2">
                    This is an estimate only. The final amount is agreed between you and the traveler during the deal negotiation in chat.
                  </p>
                  <div className="flex justify-between text-gray-500">
                    <span>Shipping budget</span>
                    <span>{selectedCurrency.symbol}{totalBudget}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Item purchase price</span>
                    <span>{selectedCurrency.symbol}{parseFloat(form.purchase_price).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 italic">
                    <span>Traveler's service fee</span>
                    <span>TBD by traveler</span>
                  </div>
                  <div className="flex justify-between text-gray-400 italic">
                    <span>Fetchr service fees</span>
                    <span>calculated at checkout</span>
                  </div>
                  <div className="flex justify-between font-bold text-violet-700 border-t border-gray-100 pt-1.5">
                    <span>Minimum estimate</span>
                    <span>
                      ~{selectedCurrency.symbol}{(
                        parseFloat(totalBudget) + parseFloat(form.purchase_price)
                      ).toFixed(2)}+
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Safety & Legal Declaration ── */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-800 mb-3 flex items-center gap-1.5">
              ⚠️ Safety & Legal Declaration
            </p>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="safety-ack-req"
                checked={safetyAcknowledged}
                onChange={e => setSafetyAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-violet-600 flex-shrink-0"
              />
              <label htmlFor="safety-ack-req" className="text-xs text-amber-800 leading-relaxed cursor-pointer">
                I confirm that:
                <ul className="mt-1.5 space-y-1 list-disc list-inside">
                  <li>The item I am requesting to transport is <strong>legal</strong> and complies with all airline regulations and customs laws.</li>
                  <li>I am <strong>not</strong> requesting the transport of illegal substances, weapons, counterfeit goods, currency above legal limits, or any restricted/prohibited items.</li>
                  <li>I accept <strong>full legal responsibility</strong> for this shipment.</li>
                  <li>Fetchr is a <strong>matchmaking and payment platform only</strong> and bears no liability for items transported, customs issues, or any legal consequences.</li>
                  <li>Violation of these terms will result in <strong>immediate account termination</strong> and may be reported to law enforcement.</li>
                </ul>
              </label>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
              <AlertCircle size={16} className="flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 btn-secondary py-3">Back</button>
            <button
              onClick={saveRequest}
              disabled={loading || uploadingPhoto}
              className="flex-1 btn-primary py-3.5 flex items-center justify-center gap-2 disabled:opacity-50">
              {loading || uploadingPhoto
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Posting...</>
                : <><Package size={15} /> Post Request</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewRequest;