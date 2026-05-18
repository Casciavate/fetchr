import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, DollarSign, Weight, Calendar, Tag,
  CheckCircle, AlertCircle, Upload, X, ShoppingBag,
  MapPin, Link, FileText, Camera
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
    item_name: '',
    description: '',
    category: '',
    from_city: '',
    from_code: '',
    to_city: '',
    to_code: '',
    weight_kg: '',
    budget_per_kg: '',
    needed_by: '',
    notes: '',
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
  const fileInputRef = useRef(null);

  const today = new Date().toISOString().split('T')[0];

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
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
    if (!form.from_code.trim()) { setError('Please enter departure airport code.'); return false; }
    if (!form.to_code.trim()) { setError('Please enter arrival airport code.'); return false; }
    if (!form.weight_kg || parseFloat(form.weight_kg) <= 0) { setError('Please enter item weight.'); return false; }
    if (!form.budget_per_kg || parseFloat(form.budget_per_kg) <= 0) { setError('Please enter your budget per kg.'); return false; }
    return true;
  };

  const validateStep3 = () => {
    if (form.requires_purchase) {
      if (!form.purchase_store.trim()) { setError('Please enter the store name.'); return false; }
      if (!form.purchase_price || parseFloat(form.purchase_price) <= 0) { setError('Please enter the anticipated purchase price.'); return false; }
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
    setLoading(true);
    setError('');

    let photoUrl = null;

    if (photoFile) {
      setUploadingPhoto(true);
      const fileExt = photoFile.name.split('.').pop();
      const filePath = `${session.user.id}/request-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, photoFile, { upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
        photoUrl = urlData.publicUrl;
      }
      setUploadingPhoto(false);
    }

    const { error } = await supabase.from('shipment_requests').insert([{
      user_id: session.user.id,
      item_name: form.item_name,
      description: form.description,
      category: form.category,
      from_city: form.from_city,
      from_code: form.from_code.toUpperCase(),
      to_city: form.to_city,
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
      purchase_details: form.requires_purchase ? form.purchase_details : null,
    }]);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setSuccess(false);
    setStep(1);
    setForm({
      item_name: '', description: '', category: '',
      from_city: '', from_code: '', to_city: '', to_code: '',
      weight_kg: '', budget_per_kg: '', needed_by: '', notes: '',
      requires_purchase: false, purchase_store: '',
      purchase_price: '', purchase_url: '', purchase_details: '',
    });
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const totalBudget = form.weight_kg && form.budget_per_kg
    ? (parseFloat(form.weight_kg) * parseFloat(form.budget_per_kg)).toFixed(2)
    : null;

  const totalCost = form.requires_purchase && form.purchase_price && totalBudget
    ? (parseFloat(totalBudget) + parseFloat(form.purchase_price)).toFixed(2)
    : totalBudget;

  if (success) {
    return (
      <div className="max-w-xl mx-auto py-16 px-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={40} className="text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Request Posted!</h2>
        <p className="text-gray-400 mb-6">
          Your request for <strong>{form.item_name}</strong> is now live. We'll notify you when a traveler matches.
        </p>
        <div className="bg-purple-50 rounded-2xl p-4 mb-6 text-left space-y-2">
          {[
            { label: 'Item', value: form.item_name },
            { label: 'Category', value: form.category },
            { label: 'Route', value: `${form.from_code} to ${form.to_code}` },
            { label: 'Weight', value: `${form.weight_kg}kg` },
            { label: 'Budget', value: `$${form.budget_per_kg}/kg (total ~$${totalBudget})` },
            form.requires_purchase && { label: 'Purchase price', value: `~$${form.purchase_price} from ${form.purchase_store}` },
            form.requires_purchase && { label: 'Total escrow estimate', value: `~$${totalCost}` },
          ].filter(Boolean).map((row, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-500">{row.label}</span>
              <span className="font-semibold text-gray-800">{row.value}</span>
            </div>
          ))}
        </div>
        <button onClick={resetForm}
          className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition">
          Post Another Request
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4 md:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">New Shipment Request</h1>
        <p className="text-gray-400 text-sm mt-1">Find a traveler to bring your item</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { n: 1, label: 'Item Details' },
          { n: 2, label: 'Route & Budget' },
          { n: 3, label: 'Delivery Type' },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
                step > s.n ? 'bg-green-500 text-white' :
                step === s.n ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                {step > s.n ? <CheckCircle size={16} /> : s.n}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${step === s.n ? 'text-purple-600' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
            {i < 2 && <div className={`flex-1 h-0.5 ${step > s.n ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* STEP 1: Item Details */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Item Name *</label>
            <div className="relative">
              <Package size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input type="text" placeholder="e.g. iPhone 15 Pro, Nike Air Max..."
                value={form.item_name}
                onChange={e => setForm({ ...form, item_name: e.target.value })}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category *</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button"
                  onClick={() => setForm({ ...form, category: cat })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    form.category === cat
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Item Description *</label>
            <textarea
              placeholder="Describe the item in detail — brand, model, color, size, condition..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Item Photo <span className="text-gray-400 font-normal">(optional but recommended)</span>
            </label>
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="Preview"
                  className="w-full h-40 object-cover rounded-xl border border-gray-200" />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-purple-300 hover:bg-purple-50 transition">
                <Camera size={24} className="text-gray-400" />
                <p className="text-sm text-gray-400">Click to upload item photo</p>
                <p className="text-xs text-gray-300">JPG, PNG up to 5MB</p>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*"
              onChange={handlePhotoChange} className="hidden" />
          </div>

          <button onClick={handleNext}
            className="w-full bg-purple-600 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-purple-700 transition">
            Continue to Route & Budget
          </button>
        </div>
      )}

      {/* STEP 2: Route & Budget */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Item summary */}
          <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
            {photoPreview && (
              <img src={photoPreview} alt={form.item_name}
                className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold text-gray-800">{form.item_name}</p>
              <p className="text-xs text-gray-400">{form.category}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">From (Airport Code) *</label>
              <input type="text" placeholder="e.g. DXB"
                value={form.from_code}
                onChange={e => setForm({ ...form, from_code: e.target.value.toUpperCase(), from_city: e.target.value.toUpperCase() })}
                maxLength={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 uppercase" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">To (Airport Code) *</label>
              <input type="text" placeholder="e.g. LHR"
                value={form.to_code}
                onChange={e => setForm({ ...form, to_code: e.target.value.toUpperCase(), to_city: e.target.value.toUpperCase() })}
                maxLength={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 uppercase" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Weight (kg) *</label>
              <div className="relative">
                <Weight size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input type="number" placeholder="e.g. 2" min="0.1" max="30" step="0.1"
                  value={form.weight_kg}
                  onChange={e => setForm({ ...form, weight_kg: e.target.value })}
                  className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Budget per kg ($) *</label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input type="number" placeholder="e.g. 10" min="1" step="0.5"
                  value={form.budget_per_kg}
                  onChange={e => setForm({ ...form, budget_per_kg: e.target.value })}
                  className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
              </div>
            </div>
          </div>

          {totalBudget && (
            <div className="bg-purple-50 rounded-xl p-3 flex items-center justify-between text-sm">
              <span className="text-gray-500">Estimated shipping budget</span>
              <span className="font-bold text-purple-600">${totalBudget}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Needed By <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input type="date" min={today}
                value={form.needed_by}
                onChange={e => setForm({ ...form, needed_by: e.target.value })}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Additional Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea placeholder="Any special handling requirements, fragile items, etc..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none" />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 transition">
              Back
            </button>
            <button onClick={handleNext}
              className="flex-1 bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 transition">
              Continue to Delivery
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Delivery Type */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Item</span>
              <span className="font-semibold">{form.item_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Route</span>
              <span className="font-semibold">{form.from_code} to {form.to_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Budget</span>
              <span className="font-semibold">${form.budget_per_kg}/kg (~${totalBudget} total)</span>
            </div>
          </div>

          {/* Delivery preference */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              How do you want the item delivered? *
            </label>
            <div className="space-y-2">
              {[
                {
                  value: false,
                  icon: '🤝',
                  label: 'I will provide the item to the traveler',
                  desc: 'You bring or ship the item to the traveler at the departure location. They carry it and hand it over at the destination.',
                },
                {
                  value: true,
                  icon: '🛍️',
                  label: 'I need the traveler to purchase the item for me',
                  desc: 'The traveler buys the item at the destination on your behalf. You pay for the item + a Shop & Ship service fee.',
                },
              ].map(opt => (
                <button key={String(opt.value)} type="button"
                  onClick={() => setForm({ ...form, requires_purchase: opt.value })}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 transition text-left ${
                    form.requires_purchase === opt.value
                      ? 'border-purple-400 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-200 bg-white'
                  }`}>
                  <span className="text-2xl flex-shrink-0">{opt.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-800">{opt.label}</p>
                      {form.requires_purchase === opt.value && (
                        <CheckCircle size={15} className="text-purple-600" />
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
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag size={16} className="text-blue-600" />
                <p className="text-sm font-semibold text-blue-700">Purchase Details</p>
              </div>
              <p className="text-xs text-blue-600 mb-3">
                Provide as much detail as possible so the traveler can find and purchase the exact item.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Store Name & Location *
                </label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-3 text-gray-400" />
                  <input type="text"
                    placeholder="e.g. Apple Store Regent Street London, Zara Oxford Street..."
                    value={form.purchase_store}
                    onChange={e => setForm({ ...form, purchase_store: e.target.value })}
                    className="w-full pl-8 border border-blue-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Anticipated Purchase Price ($) *
                </label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3 top-3 text-gray-400" />
                  <input type="number" placeholder="e.g. 299.00" min="0" step="0.01"
                    value={form.purchase_price}
                    onChange={e => setForm({ ...form, purchase_price: e.target.value })}
                    className="w-full pl-8 border border-blue-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Product Link <span className="text-gray-400 font-normal">(optional but helpful)</span>
                </label>
                <div className="relative">
                  <Link size={14} className="absolute left-3 top-3 text-gray-400" />
                  <input type="url"
                    placeholder="https://www.apple.com/iphone-15-pro..."
                    value={form.purchase_url}
                    onChange={e => setForm({ ...form, purchase_url: e.target.value })}
                    className="w-full pl-8 border border-blue-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Additional Product Details
                </label>
                <textarea
                  placeholder="Size, color, model number, any specific variants the traveler should look for..."
                  value={form.purchase_details}
                  onChange={e => setForm({ ...form, purchase_details: e.target.value })}
                  rows={3}
                  className="w-full border border-blue-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white resize-none" />
              </div>

              {form.purchase_price && totalBudget && (
                <div className="bg-white rounded-xl p-3 space-y-1.5 text-xs">
                  <p className="font-semibold text-gray-700 mb-1">Estimated Total Escrow</p>
                  <div className="flex justify-between text-gray-500">
                    <span>Shipping fee (~{form.weight_kg}kg x ${form.budget_per_kg})</span>
                    <span>${totalBudget}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Item purchase price</span>
                    <span>${parseFloat(form.purchase_price).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Traveler Shop & Ship fee</span>
                    <span>TBD by traveler</span>
                  </div>
                  <div className="flex justify-between font-bold text-purple-700 border-t border-gray-100 pt-1">
                    <span>Estimated total</span>
                    <span>~${totalCost}+</span>
                  </div>
                  <p className="text-gray-400 pt-1">
                    Final amount confirmed when matched with traveler
                  </p>
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
            <button onClick={() => setStep(2)}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 transition">
              Back
            </button>
            <button onClick={saveRequest} disabled={loading || uploadingPhoto}
              className="flex-1 bg-purple-600 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {loading || uploadingPhoto
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Posting...</>
                : <><Package size={16} /> Post Request</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewRequest;