import React, { useState, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../supabaseClient';
import {
  Shield, CheckCircle, AlertTriangle, Lock,
  DollarSign, Package, Plane, ShoppingBag, Camera, X, Upload
} from 'lucide-react';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '14px',
      fontFamily: 'Inter, sans-serif',
      color: '#1f2937',
      '::placeholder': { color: '#9ca3af' },
      iconColor: '#7c3aed',
    },
    invalid: { color: '#ef4444', iconColor: '#ef4444' },
  },
  hidePostalCode: true,
};

// ── Fee calculator (correct logic) ──
// Fetchr fee = % of (delivery fee + shop & ship fee)  [NOT on purchase price]
// Shipper pays = delivery fee + shop & ship fee + item purchase price
// Traveler receives = delivery fee + shop & ship fee - Fetchr fee + item purchase price
export const calcFees = (match) => {
  const pricePerKg = parseFloat(match.agreed_price_per_kg || match.flight?.price_per_kg || 0);
  const weightKg = parseFloat(match.agreed_weight_kg || match.request?.weight_kg || 0);
  const deliveryFee = pricePerKg * weightKg;

  const isPurchase = !!(match.request?.requires_purchase);
  const purchasePrice = isPurchase ? (parseFloat(match.request?.purchase_price) || 0) : 0;

  // Shop & ship fee — traveler-defined service fee for going to buy the item
  // Stored on agreed_shop_fee (set during deal amendment) or flight's shop_and_ship_fee
  const shopFee = isPurchase
    ? (parseFloat(match.agreed_shop_fee || match.flight?.shop_and_ship_fee) || 0)
    : 0;

  // Fetchr fee applies to delivery + shop fee only
  const fetchrBase = deliveryFee + shopFee;
  let fetchrPct = 0.10;
  if (fetchrBase >= 500) fetchrPct = 0.07;
  else if (fetchrBase >= 200) fetchrPct = 0.085;
  else if (fetchrBase < 20 && fetchrBase > 0) fetchrPct = 0.12;

  const fetchrFee = fetchrBase * fetchrPct;

  // What shipper pays total
  const totalShipperPays = deliveryFee + shopFee + purchasePrice;

  // What traveler receives
  const travelerReceives = deliveryFee + shopFee - fetchrFee + purchasePrice;

  // Amount held in escrow (what Stripe charges — does NOT include item purchase price
  // as that's a separate reimbursement; but for simplicity we hold total)
  const escrowAmount = totalShipperPays;

  return {
    deliveryFee,
    shopFee,
    purchasePrice,
    fetchrBase,
    fetchrFee,
    fetchrPct,
    totalShipperPays,
    travelerReceives,
    escrowAmount,
    isPurchase,
  };
};

// ── Proof Upload Modal ──
export const ProofUploadModal = ({ match, session, onClose, onUploaded }) => {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const isPurchase = match.request?.requires_purchase;

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter(f => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024);
    if (valid.length !== selected.length) setError('Some files were skipped (images only, max 10MB each)');
    else setError('');
    setFiles(prev => [...prev, ...valid].slice(0, 5));
    const newPreviews = valid.map(f => URL.createObjectURL(f));
    setPreviews(prev => [...prev, ...newPreviews].slice(0, 5));
  };

  const removeFile = (i) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleUpload = async () => {
    if (files.length === 0) { setError('Please select at least one photo.'); return; }
    setUploading(true); setError('');
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const path = `proofs/${match.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('avatars').upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      const primaryUrl = uploadedUrls[0];
      const allUrls = uploadedUrls.join('\n');

      // Update match
      await supabase.from('matches').update({
        proof_photo_url: primaryUrl,
        proof_uploaded_at: new Date().toISOString(),
        status: 'proof_uploaded',
        deal_stage: 'proof_uploaded',
        proof_notes: notes || null,
      }).eq('id', match.id);

      // Post message with all proof images
      const content = [
        `📸 PROOF UPLOADED:`,
        ...uploadedUrls.map((url, i) => `PROOF_IMAGE_${i + 1}:${url}`),
        notes ? `Notes: ${notes}` : null,
      ].filter(Boolean).join('\n');

      await supabase.from('messages').insert([{
        match_id: match.id,
        sender_id: session.user.id,
        content,
        is_read: false,
      }]);

      onUploaded(primaryUrl);
    } catch (e) {
      setError(e.message || 'Upload failed. Please try again.');
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Upload Delivery Proof</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <p className="text-xs font-bold text-blue-700 mb-1">What to upload</p>
            <ul className="text-xs text-blue-600 space-y-0.5">
              <li>📦 Photo of the item received</li>
              {isPurchase && <li>🧾 Purchase receipt from the store</li>}
              {isPurchase && <li>📸 Photo of the purchased item</li>}
              <li>✅ Any other proof of delivery</li>
            </ul>
          </div>

          {/* Photo picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Photos (up to 5)
            </label>
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {previews.map((url, i) => (
                  <div key={i} className="relative rounded-xl overflow-hidden border border-gray-200 aspect-square">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
                {previews.length < 5 && (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 rounded-xl aspect-square flex items-center justify-center hover:border-violet-300 hover:bg-violet-50 transition">
                    <Camera size={20} className="text-gray-300" />
                  </button>
                )}
              </div>
            )}
            {previews.length === 0 && (
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 hover:border-violet-300 hover:bg-violet-50 transition">
                <Upload size={24} className="text-gray-300" />
                <p className="text-sm text-gray-400 font-medium">Tap to select photos</p>
                <p className="text-xs text-gray-300">JPG, PNG · Max 10MB each</p>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" multiple
              onChange={handleFileChange} className="hidden" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Notes <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              placeholder={isPurchase
                ? "e.g. Item purchased from Apple Store, receipt included..."
                : "e.g. Item delivered in perfect condition..."}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="input-field resize-none text-sm"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 btn-secondary py-3">Cancel</button>
            <button onClick={handleUpload}
              disabled={uploading || files.length === 0}
              className="flex-[2] btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50">
              {uploading
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
                : <><Upload size={15} /> Submit Proof</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Escrow Payment Component ──
const EscrowInner = ({ match, session, onPaymentComplete }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardReady, setCardReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [profile, setProfile] = useState(null);
  const [useNewCard, setUseNewCard] = useState(false);

  const fees = calcFees(match);

  useEffect(() => {
    supabase.from('profiles').select('*')
      .eq('id', session.user.id).single()
      .then(({ data }) => { if (data) setProfile(data); });
  }, [session.user.id]);

  const hasSavedCard = !!(profile?.stripe_payment_method_id);
  const showCardForm = !hasSavedCard || useNewCard;

  const callStripe = async (action, data) => {
    const { data: { session: auth } } = await supabase.auth.getSession();
    const res = await fetch(
      'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.access_token}` },
        body: JSON.stringify({ action, data }),
      }
    );
    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'Payment failed');
    return result;
  };

  const handlePay = async () => {
    if (!stripe || !elements) return;
    if (showCardForm && !cardReady) { setError('Card form not ready.'); return; }
    setLoading(true); setError('');

    try {
      // Send amount in DOLLARS — edge function does *100 conversion
      const amountDollars = fees.escrowAmount;

      let paymentMethodId = null;

      if (showCardForm) {
        const cardElement = elements.getElement(CardElement);
        const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card', card: cardElement,
        });
        if (pmError) throw new Error(pmError.message);
        paymentMethodId = paymentMethod.id;
      } else {
        paymentMethodId = profile.stripe_payment_method_id;
      }

      // Call edge function — sends dollars, edge function converts to cents
      const result = await callStripe('create_payment_intent', {
        matchId: match.id,
        amount: amountDollars,  // DOLLARS
        currency: 'usd',
        paymentMethodId,
      });

      if (!result.clientSecret) throw new Error('No client secret returned');

      // Confirm the payment
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
        result.clientSecret,
        { payment_method: paymentMethodId }
      );
      if (confirmError) throw new Error(confirmError.message);
      if (paymentIntent.status !== 'requires_capture' && paymentIntent.status !== 'succeeded') {
        throw new Error(`Unexpected payment status: ${paymentIntent.status}`);
      }

      setSuccess(true);
      setTimeout(() => onPaymentComplete?.(), 1500);

    } catch (e) {
      setError(e.message || 'Payment failed. Please try again.');
    }
    setLoading(false);
  };

  if (match.status === 'in_escrow') return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <Lock size={28} className="text-blue-600" />
      </div>
      <p className="text-base font-bold text-gray-900 mb-1">Escrow Active</p>
      <p className="text-sm text-gray-500 mb-3">
        ${fees.escrowAmount.toFixed(2)} secured. Traveler receives ${fees.travelerReceives.toFixed(2)} upon confirmed delivery.
      </p>
      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 border border-blue-100">
        Funds released automatically once both parties confirm delivery.
      </div>
    </div>
  );

  if (success) return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <CheckCircle size={32} className="text-emerald-500" />
      </div>
      <p className="text-lg font-bold text-gray-900 mb-1">Escrow Secured!</p>
      <p className="text-sm text-gray-500">
        ${fees.escrowAmount.toFixed(2)} held securely. Traveler receives ${fees.travelerReceives.toFixed(2)} upon delivery.
      </p>
    </div>
  );

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield size={18} className="text-violet-600" />
        <h3 className="font-bold text-gray-900">Secure Escrow Payment</h3>
      </div>

      <div className="text-xs text-gray-500 leading-relaxed bg-violet-50 rounded-xl p-3 border border-violet-100">
        Payment is held securely. Released to the traveler only after both parties confirm delivery.
      </div>

      {/* Full breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Payment Breakdown</p>
        </div>

        <div className="px-4 py-3 space-y-2 text-sm border-b border-gray-100">
          <div className="flex items-center gap-1.5 mb-2">
            <Plane size={12} className="text-violet-500" />
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Delivery Service</p>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>{match.agreed_weight_kg || match.request?.weight_kg}kg × ${match.agreed_price_per_kg || match.flight?.price_per_kg}/kg</span>
            <span className="font-semibold">${fees.deliveryFee.toFixed(2)}</span>
          </div>
          {fees.isPurchase && fees.shopFee > 0 && (
            <div className="flex justify-between text-gray-600">
              <span className="flex items-center gap-1"><ShoppingBag size={11} /> Shop & ship service fee</span>
              <span className="font-semibold">${fees.shopFee.toFixed(2)}</span>
            </div>
          )}
          {fees.isPurchase && fees.shopFee === 0 && (
            <div className="flex justify-between text-amber-600 text-xs">
              <span>⚠️ Shop & ship fee (not yet agreed)</span>
              <span>TBD</span>
            </div>
          )}
          <div className="flex justify-between text-red-400 text-xs pt-1 border-t border-gray-100">
            <span>Fetchr fee ({Math.round(fees.fetchrPct * 100)}%) on delivery{fees.isPurchase && fees.shopFee > 0 ? ' + shop fee' : ''}</span>
            <span>−${fees.fetchrFee.toFixed(2)}</span>
          </div>
        </div>

        {fees.isPurchase && fees.purchasePrice > 0 && (
          <div className="px-4 py-3 space-y-2 text-sm border-b border-gray-100">
            <div className="flex items-center gap-1.5 mb-2">
              <ShoppingBag size={12} className="text-blue-500" />
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Item Purchase</p>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Item purchase price (reimbursed to traveler)</span>
              <span className="font-semibold">${fees.purchasePrice.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="px-4 py-3 bg-violet-50 space-y-1.5">
          <div className="flex justify-between font-bold text-violet-700 text-base">
            <span>Total you pay</span>
            <span>${fees.totalShipperPays.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-emerald-600 text-sm font-semibold">
            <span>Traveler receives on delivery</span>
            <span>${fees.travelerReceives.toFixed(2)}</span>
          </div>
          <p className="text-xs text-gray-400 pt-1">
            Held in escrow. Released automatically when both parties confirm delivery.
          </p>
        </div>
      </div>

      {/* Saved card selector */}
      {hasSavedCard && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment Method</label>
          {[
            { val: false, label: `${profile?.payout_card_brand ? profile.payout_card_brand.charAt(0).toUpperCase() + profile.payout_card_brand.slice(1) : 'Card'} ****${profile?.payout_card_last4}`, sub: 'Saved card', icon: '💳' },
            { val: true, label: 'Use a different card', sub: 'Enter new card details', icon: '➕' },
          ].map(opt => (
            <button key={String(opt.val)} type="button"
              onClick={() => { setUseNewCard(opt.val); setError(''); }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${useNewCard === opt.val ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-200'}`}>
              <span className="text-xl">{opt.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-400">{opt.sub}</p>
              </div>
              {useNewCard === opt.val && <CheckCircle size={16} className="text-violet-600 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}

      {/* Card input */}
      {showCardForm && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Card Details</label>
          <div className="border-2 border-gray-200 rounded-xl px-4 py-3.5 focus-within:border-violet-400 transition-all bg-white">
            <CardElement
              options={{ ...CARD_ELEMENT_OPTIONS, wallets: { link: 'never' } }}
              onReady={() => setCardReady(true)}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
            <Lock size={10} /> Encrypted by Stripe · never stored on Fetchr servers
          </p>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mt-2">
            <p className="text-xs text-amber-700 font-bold">🧪 Test Mode</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Card: <strong>4242 4242 4242 4242</strong> · Any future date · Any CVC
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      <button onClick={handlePay}
        disabled={loading || !stripe || (showCardForm && !cardReady)}
        className="w-full btn-primary py-3.5 disabled:opacity-50 flex items-center justify-center gap-2">
        {loading
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
          : <><Lock size={15} /> Pay ${fees.totalShipperPays.toFixed(2)} into Escrow</>
        }
      </button>

      <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
        <Shield size={11} /> Fetchr Secure Escrow · Powered by Stripe
      </p>
    </div>
  );
};

const EscrowPayment = ({ match, session, onPaymentComplete }) => (
  <Elements stripe={stripePromise}>
    <EscrowInner match={match} session={session} onPaymentComplete={onPaymentComplete} />
  </Elements>
);

export default EscrowPayment;