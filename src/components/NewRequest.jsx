import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, DollarSign,
  CheckCircle, AlertCircle, Camera, X,
  ShoppingBag, MapPin, Link, User, Phone,
  AlertTriangle, Shield, Search, Info
} from 'lucide-react';
import RoutePicker from './shared/RoutePicker';
import WeightInput from './shared/WeightInput';
import DatePicker from './shared/DatePicker';

const CATEGORIES = [
  'Electronics', 'Clothing & Fashion', 'Cosmetics & Beauty',
  'Food & Beverages', 'Books & Stationery', 'Toys & Games',
  'Medical & Pharmacy', 'Jewelry & Accessories', 'Sports & Fitness',
  'Home & Living', 'Documents', 'Other'
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

          <RoutePicker
            fromLabel="From (departure airport) *"
            toLabel="To (arrival airport) *"
            from={{ city: form.from_city, code: form.from_code }}
            to={{ city: form.to_city, code: form.to_code }}
            onFromChange={airport => setForm({ ...form, from_code: airport.code, from_city: airport.city })}
            onToChange={airport => setForm({ ...form, to_code: airport.code, to_city: airport.city })}
            onSwap={() => setForm({
              ...form,
              from_city: form.to_city, from_code: form.to_code,
              to_city: form.from_city, to_code: form.from_code,
            })}
          />

          <WeightInput label="Total weight (kg) *" min={0.1} max={50} step={0.1}
            value={form.weight_kg} onChange={v => setForm({ ...form, weight_kg: v })} />

          <div>
            <label className="block text-label text-content-muted mb-1.5 uppercase tracking-wide">
              Dimensions <span className="text-ink-300 font-normal normal-case">(optional)</span>
            </label>
            <input type="text" placeholder="e.g. 30×20×10cm"
              value={form.dimensions} onChange={e => setForm({ ...form, dimensions: e.target.value })}
              className="input-field" />
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
            <DatePicker label="Needed by (optional)" min={today} value={form.needed_by}
              onChange={v => setForm({ ...form, needed_by: v })} />
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