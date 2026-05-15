import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Package, MapPin, DollarSign, Calendar, CheckCircle, Camera, X } from 'lucide-react';

const CATEGORIES = [
  'Documents', 'Electronics', 'Fashion', 'Cosmetics',
  'Food', 'Medicine', 'Jewellery', 'Other'
];

const NewRequest = ({ session }) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [itemPhoto, setItemPhoto] = useState(null);
  const [itemPhotoPreview, setItemPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    item_name: '',
    item_description: '',
    from_city: '',
    from_code: '',
    to_city: '',
    to_code: '',
    weight_kg: '',
    category: '',
    budget_per_kg: '',
    needed_by: '',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB.'); return; }
    setItemPhoto(file);
    setItemPhotoPreview(URL.createObjectURL(file));
  };

  const removePhoto = () => {
    setItemPhoto(null);
    setItemPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!form.item_name || !form.from_city || !form.to_city || !form.weight_kg || !form.category) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    let photoUrl = null;

    // Upload photo if provided
    if (itemPhoto) {
      const fileExt = itemPhoto.name.split('.').pop();
      const filePath = `${session.user.id}/item-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, itemPhoto, { upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);
        photoUrl = urlData.publicUrl;
      }
    }

    const { error } = await supabase.from('shipment_requests').insert([{
      user_id: session.user.id,
      item_name: form.item_name,
      item_description: form.item_description,
      item_photo_url: photoUrl,
      from_city: form.from_city,
      from_code: form.from_code.toUpperCase(),
      to_city: form.to_city,
      to_code: form.to_code.toUpperCase(),
      weight_kg: parseFloat(form.weight_kg),
      category: form.category,
      budget_per_kg: form.budget_per_kg ? parseFloat(form.budget_per_kg) : null,
      needed_by: form.needed_by || null,
      status: 'open'
    }]);

    setLoading(false);
    if (error) setError(error.message);
    else {
      setSuccess(true);
      setForm({
        item_name: '', item_description: '', from_city: '', from_code: '',
        to_city: '', to_code: '', weight_kg: '', category: '',
        budget_per_kg: '', needed_by: ''
      });
      setItemPhoto(null);
      setItemPhotoPreview(null);
    }
  };

  if (success) return (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <CheckCircle size={32} className="text-green-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Request Posted!</h2>
      <p className="text-gray-400 text-sm mb-6">We'll notify you when a traveler matches your request.</p>
      <button
        onClick={() => setSuccess(false)}
        className="bg-purple-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700"
      >
        Post Another Request
      </button>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">New Shipment Request</h1>
        <p className="text-gray-400 text-sm mt-1">Tell us what you need delivered and where</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

        {/* Item Details */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-2 block">
            📦 What do you need delivered? <span className="text-red-400">*</span>
          </label>
          <div className="space-y-3">
            <input
              name="item_name"
              placeholder="Item name (e.g. MacBook Pro 16 inch)"
              value={form.item_name}
              onChange={handleChange}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
            />
            <textarea
              name="item_description"
              placeholder="Additional details (optional) — brand, color, size, where to buy it..."
              value={form.item_description}
              onChange={handleChange}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 resize-none"
            />
          </div>
        </div>

        {/* Item Photo */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-2 block">
            📸 Item Photo <span className="text-gray-400 font-normal text-xs">(optional — helps travelers identify the item)</span>
          </label>
          {itemPhotoPreview ? (
            <div className="relative">
              <img
                src={itemPhotoPreview}
                alt="Item preview"
                className="w-full h-40 object-cover rounded-xl border border-gray-100"
              />
              <button
                onClick={removePhoto}
                className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-md hover:bg-red-50 transition"
              >
                <X size={14} className="text-red-500" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition"
            >
              <Camera size={24} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Click to upload a photo</p>
              <p className="text-xs text-gray-300 mt-1">JPG, PNG up to 5MB</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="hidden"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-2 block">
            🏷️ Category <span className="text-red-400">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setForm({ ...form, category: cat })}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                  form.category === cat
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Route */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-2 block">
            ✈️ Delivery Route <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input
              name="from_city"
              placeholder="Pick up from City (e.g. London)"
              value={form.from_city}
              onChange={handleChange}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
            />
            <input
              name="from_code"
              placeholder="Airport Code (e.g. LHR)"
              value={form.from_code}
              onChange={handleChange}
              maxLength={3}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 uppercase"
            />
            <input
              name="to_city"
              placeholder="Deliver to City (e.g. Dubai)"
              value={form.to_city}
              onChange={handleChange}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
            />
            <input
              name="to_code"
              placeholder="Airport Code (e.g. DXB)"
              value={form.to_code}
              onChange={handleChange}
              maxLength={3}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 uppercase"
            />
          </div>
        </div>

        {/* Weight, Budget, Date */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-2 block">
            ⚖️ Weight, Budget & Timeline
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div className="relative">
              <Package size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                name="weight_kg"
                type="number"
                placeholder="Weight (kg)"
                value={form.weight_kg}
                onChange={handleChange}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
              />
            </div>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                name="budget_per_kg"
                type="number"
                placeholder="Budget/kg (optional)"
                value={form.budget_per_kg}
                onChange={handleChange}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
              />
            </div>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                name="needed_by"
                type="date"
                value={form.needed_by}
                onChange={handleChange}
                className="w-full pl-9 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-xs bg-red-50 p-3 rounded-xl">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-purple-600 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50"
        >
          {loading ? 'Posting your request...' : 'Post Shipment Request →'}
        </button>
      </div>
    </div>
  );
};

export default NewRequest;