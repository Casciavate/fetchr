import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, DollarSign, Weight, Calendar,
  CheckCircle, AlertCircle, Camera, X,
  ShoppingBag, MapPin, Link, FileText
} from 'lucide-react';

const CATEGORIES = [
  'Electronics', 'Clothing & Fashion', 'Cosmetics & Beauty',
  'Food & Beverages', 'Books & Stationery', 'Toys & Games',
  'Medical & Pharmacy', 'Jewelry & Accessories', 'Sports & Fitness',
  'Home & Living', 'Documents', 'Other'
];

const NewRequest = ({ session }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    item_name: '', description: '', category: '',
    from_city: '', from_code: '', to_city: '', to_code: '',
    weight_kg: '', budget_per_kg: '', needed_by: '', notes: '',
    requires_purchase: false,
    purchase_store: '', purchase_price: '', purchase_url: '', purchase_details: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);
  const today = new Date().toISOString().split('T')[0];

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB.'); return; }
    setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); setError('');
  };

  const validateStep1 = () => {
    if (!form.item_name.trim()) { setError('Please enter the item name.'); return false; }
    if (!form.category) { setError('Please select a category.'); return false; }
    if (!form.description.trim()) { setError('Please describe the item.'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!form.from_code.trim()) { setError('Please enter departure airport code.'); return false; }
    if (!form.to_code.trim()) { setError('Please enter arrival airport code.'); return false; }
    if (!form.weight_kg || parseFloat(form.weight_kg) <= 0) { setError('Please enter item weight.'); return false; }
    if (!form.budget_per_kg || parseFloat(form.budget_per_kg) <= 0) { setError('Please enter budget per kg.'); return false; }
    return true;
  };

  const validateStep3 = () => {
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
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, photoFile, { upsert: true });
      if (!upErr) { const { data } = supabase.storage.from('avatars').getPublicUrl(path); photoUrl = data.publicUrl; }
      setUploadingPhoto(false);
    }
    const { error } = await supabase.from('shipment_requests').insert([{
      user_id: session.user.id,
      item_name: form.item_name, description: form.description, category: form.category,
      from_city: form.from_city || form.from_code, from_code: form.from_code.toUpperCase(),
      to_city: form.to_city || form.to_code, to_code: form.to_code.toUpperCase(),
      weight_kg: parseFloat(form.weight_kg), budget_per_kg: parseFloat(form.budget_per_kg),
      needed_by: form.needed_by || null, notes: form.notes, item_photo_url: photoUrl,
      status: 'open', requires_purchase: form.requires_purchase,
      purchase_store: form.requires_purchase ? form.purchase_store : null,
      purchase_price: form.requires_purchase ? parseFloat(form.purchase_price) : null,
      purchase_url: form.requires_purchase ? form.purchase_url : null,
      purchase_details: form.requires_purchase ? form.purchase_details : null,
    }]);
    if (error) { setError(error.message); } else { setSuccess(true); }
    setLoading(false);
  };

  const resetForm = () => {
    setSuccess(false); setStep(1);
    setForm({ item_name: '', description: '', category: '', from_city: '', from_code: '', to_city: '', to_code: '', weight_kg: '', budget_per_kg: '', needed_by: '', notes: '', requires_purchase: false, purchase_store: '', purchase_price: '', purchase_url: '', purchase_details: '' });
    setPhotoFile(null); setPhotoPreview(null);
  };

  const totalBudget = form.weight_kg && form.budget_per_kg
    ? (parseFloat(form.weight_kg) * parseFloat(form.budget_per_kg)).toFixed(2) : null;

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
          { label: 'Route', value: `${form.from_code} → ${form.to_code}` },
          { label: 'Weight', value: `${form.weight_kg}kg` },
          { label: 'Budget', value: `$${form.budget_per_kg}/kg (~$${totalBudget})` },
          form.requires_purchase && { label: 'Purchase price', value: `~$${form.purchase_price} from ${form.purchase_store}` },
        ].filter(Boolean).map((row, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-500">{row.label}</span>
            <span className="font-semibold text-gray-900">{row.value}</span>
          </div>
        ))}
      </div>
      <button onClick={resetForm} className="w-full btn-primary py-3">Post Another Request</button>
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
        {[{ n: 1, label: 'Item Details' }, { n: 2, label: 'Route & Budget' }, { n: 3, label: 'Delivery Type' }].map((s, i) => (
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

      {/* Step 1: Item Details */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Item Name *</label>
            <div className="relative">
              <Package size={15} className="absolute left-3.5 top-3.5 text-gray-400" />
              <input type="text" placeholder="e.g. iPhone 15 Pro, Nike Air Max..."
                value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })}
                className="input-field pl-9" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Category *</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button" onClick={() => setForm({ ...form, category: cat })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    form.category === cat ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Description *</label>
            <textarea placeholder="Describe the item — brand, model, color, size, condition..."
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              rows={3} className="input-field resize-none" />
          </div>

          {/* Photo */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Item Photo <span className="text-gray-300 font-normal normal-case">(optional but recommended)</span>
            </label>
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="Preview"
                  className="w-full h-44 object-cover rounded-xl border border-gray-200" />
                <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-lg flex items-center justify-center hover:bg-red-600 shadow-sm">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 hover:border-violet-300 hover:bg-violet-50/30 transition-all group">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-violet-100 transition">
                  <Camera size={20} className="text-gray-400 group-hover:text-violet-500 transition" />
                </div>
                <p className="text-sm text-gray-400 group-hover:text-violet-500 transition font-medium">Click to upload photo</p>
                <p className="text-xs text-gray-300">JPG, PNG up to 5MB</p>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          </div>

          <button onClick={handleNext} className="w-full btn-primary py-3.5">Continue to Route & Budget</button>
        </div>
      )}

      {/* Step 2: Route & Budget */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Item summary */}
          <div className="bg-gray-50 rounded-xl p-3.5 flex items-center gap-3 border border-gray-100">
            {photoPreview && <img src={photoPreview} alt="" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />}
            <div>
              <p className="text-sm font-bold text-gray-900">{form.item_name}</p>
              <p className="text-xs text-gray-400">{form.category}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">From (Code) *</label>
              <input type="text" placeholder="e.g. DXB" value={form.from_code} maxLength={3}
                onChange={e => setForm({ ...form, from_code: e.target.value.toUpperCase() })}
                className="input-field uppercase text-center font-bold text-lg tracking-widest" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">To (Code) *</label>
              <input type="text" placeholder="e.g. LHR" value={form.to_code} maxLength={3}
                onChange={e => setForm({ ...form, to_code: e.target.value.toUpperCase() })}
                className="input-field uppercase text-center font-bold text-lg tracking-widest" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Weight (kg) *</label>
              <div className="relative">
                <Weight size={15} className="absolute left-3.5 top-3.5 text-gray-400" />
                <input type="number" placeholder="e.g. 2" min="0.1" max="30" step="0.1"
                  value={form.weight_kg} onChange={e => setForm({ ...form, weight_kg: e.target.value })}
                  className="input-field pl-9" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Budget/kg ($) *</label>
              <div className="relative">
                <DollarSign size={15} className="absolute left-3.5 top-3.5 text-gray-400" />
                <input type="number" placeholder="e.g. 10" min="1" step="0.5"
                  value={form.budget_per_kg} onChange={e => setForm({ ...form, budget_per_kg: e.target.value })}
                  className="input-field pl-9" />
              </div>
            </div>
          </div>

          {totalBudget && (
            <div className="bg-violet-50 rounded-xl p-3.5 flex items-center justify-between border border-violet-100">
              <span className="text-sm text-gray-600 font-medium">Estimated shipping budget</span>
              <span className="text-base font-bold text-violet-700">${totalBudget}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Needed By <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <Calendar size={15} className="absolute left-3.5 top-3.5 text-gray-400" />
              <input type="date" min={today} value={form.needed_by}
                onChange={e => setForm({ ...form, needed_by: e.target.value })}
                className="input-field pl-9" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Notes <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <textarea placeholder="Special handling, fragile items, packaging requirements..."
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} className="input-field resize-none" />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 btn-secondary py-3">Back</button>
            <button onClick={handleNext} className="flex-1 btn-primary py-3">Continue to Delivery</button>
          </div>
        </div>
      )}

      {/* Step 3: Delivery Type */}
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
              <span className="font-semibold text-gray-900">{form.from_code} → {form.to_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Budget</span>
              <span className="font-semibold text-violet-700">${form.budget_per_kg}/kg · ~${totalBudget}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">How do you want the item delivered? *</label>
            <div className="space-y-2">
              {[
                { value: false, icon: '🤝', label: 'I will provide the item to the traveler', desc: 'You hand or ship the item to the traveler at departure. They deliver it at the destination.' },
                { value: true, icon: '🛍️', label: 'I need the traveler to purchase the item for me', desc: 'The traveler buys the item at the destination. You pay item price + their service fee.' },
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
                      {form.requires_purchase === opt.value && <CheckCircle size={15} className="text-violet-600" />}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Shop & Ship fields */}
          {form.requires_purchase && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag size={16} className="text-blue-600" />
                <p className="text-sm font-bold text-blue-700">Purchase Details</p>
              </div>
              <p className="text-xs text-blue-600 mb-3 leading-relaxed">
                Provide full details so the traveler can find and purchase the exact item.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Store Name & Location *</label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3.5 top-3 text-gray-400" />
                  <input type="text" placeholder="e.g. Apple Store Regent Street London..."
                    value={form.purchase_store} onChange={e => setForm({ ...form, purchase_store: e.target.value })}
                    className="input-field pl-8 py-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Anticipated Price ($) *</label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3.5 top-3 text-gray-400" />
                  <input type="number" placeholder="e.g. 299.00" min="0" step="0.01"
                    value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })}
                    className="input-field pl-8 py-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Product Link <span className="text-gray-300 font-normal normal-case">(optional)</span>
                </label>
                <div className="relative">
                  <Link size={14} className="absolute left-3.5 top-3 text-gray-400" />
                  <input type="url" placeholder="https://www.apple.com/iphone-15-pro..."
                    value={form.purchase_url} onChange={e => setForm({ ...form, purchase_url: e.target.value })}
                    className="input-field pl-8 py-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Product Details</label>
                <textarea placeholder="Size, color, model number, specific variants..."
                  value={form.purchase_details} onChange={e => setForm({ ...form, purchase_details: e.target.value })}
                  rows={3} className="input-field resize-none py-2.5" />
              </div>

              {form.purchase_price && totalBudget && (
                <div className="bg-white rounded-xl p-3.5 space-y-1.5 text-xs border border-blue-100">
                  <p className="font-bold text-gray-700 mb-2">Estimated Total Escrow</p>
                  <div className="flex justify-between text-gray-500">
                    <span>Shipping fee</span><span>${totalBudget}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Item purchase price</span><span>${parseFloat(form.purchase_price).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Traveler service fee</span><span>TBD</span>
                  </div>
                  <div className="flex justify-between font-bold text-violet-700 border-t border-gray-100 pt-1.5">
                    <span>Minimum estimate</span>
                    <span>~${(parseFloat(totalBudget) + parseFloat(form.purchase_price)).toFixed(2)}+</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
              <AlertCircle size={16} className="flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 btn-secondary py-3">Back</button>
            <button onClick={saveRequest} disabled={loading || uploadingPhoto}
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