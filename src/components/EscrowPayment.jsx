import React, { useState, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../supabaseClient';
import {
  Lock, CheckCircle,
  Package, Plane, ShoppingBag, Camera, X, Upload, CreditCard, Wallet, Zap, Plus
} from 'lucide-react';
import AdvisoryBanner from './shared/AdvisoryBanner';
import { calcFees, resolveOptionPrice, MINIMUM_DEAL_SIZE, SHIPPER_SERVICE_FEE_PCT, SOURCING_FEE_PCT, resolvedIsPurchase } from '../lib/fees';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '14px',
      fontFamily: '"IBM Plex Mono", monospace',
      color: '#14181F',
      '::placeholder': { color: '#7F8794' },
      iconColor: '#14181F',
    },
    invalid: { color: '#B0301C', iconColor: '#B0301C' },
  },
  hidePostalCode: true,
};

// ── Proof Upload Modal ──
export const ProofUploadModal = ({ match, session, onClose, onUploaded }) => {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const isPurchase = resolvedIsPurchase(match);

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter(f => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024);
    if (valid.length !== selected.length) setError('Images only, max 10MB each');
    else setError('');
    const combined = [...files, ...valid].slice(0, 5);
    setFiles(combined);
    const newPreviews = valid.map(f => URL.createObjectURL(f));
    setPreviews(prev => [...prev, ...newPreviews].slice(0, 5));
  };

  const removeFile = (i) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleUpload = async () => {
    if (files.length === 0) { setError('Add at least one photo.'); return; }
    setUploading(true); setError('');
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const path = `${session.user.id}/proofs/${match.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('avatars').upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      await supabase.from('matches').update({
        proof_photo_url: uploadedUrls[0],
        proof_uploaded_at: new Date().toISOString(),
        status: 'proof_uploaded',
        deal_stage: 'proof_uploaded',
        proof_notes: notes || null,
      }).eq('id', match.id);

      const lines = [
        'PROOF UPLOADED:',
        ...uploadedUrls.map((url, i) => `PROOF_IMAGE_${i + 1}:${url}`),
        notes ? `Notes: ${notes}` : null,
      ].filter(Boolean);

      await supabase.from('messages').insert([{
        match_id: match.id,
        sender_id: session.user.id,
        content: lines.join('\n'),
        is_read: false,
      }]);

      onUploaded(uploadedUrls[0]);
    } catch (e) {
      setError(e.message || 'The upload failed. Try again.');
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-modal flex items-end md:items-center justify-center p-4" style={{ background: 'var(--scrim)' }}>
      <div className="bg-surface-raised rounded-xl w-full max-w-md shadow-elev-3">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-display font-bold text-title-s text-content">Upload delivery proof</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-sunken transition">
            <X size={18} className="text-content-muted" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-info-50 rounded-md p-3">
            <p className="text-label font-semibold text-info-500 mb-1 uppercase tracking-wide">What to upload</p>
            <ul className="text-body-s text-info-500 space-y-0.5">
              <li>Photo of the item</li>
              {isPurchase && <li>Purchase receipt from the store</li>}
              {isPurchase && <li>Photo of the purchased item</li>}
              <li>Any other delivery confirmation</li>
            </ul>
          </div>

          <div>
            <label className="block text-label font-semibold text-content-muted mb-2 uppercase tracking-wide">Photos (up to 5)</label>
            {previews.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {previews.map((url, i) => (
                  <div key={i} className="relative rounded-md overflow-hidden border border-line aspect-square">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 w-5 h-5 bg-danger-fill rounded-full flex items-center justify-center">
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
                {previews.length < 5 && (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-line-strong rounded-md aspect-square flex items-center justify-center hover:border-paper-600 hover:bg-surface-sunken transition">
                    <Camera size={20} className="text-ink-300" />
                  </button>
                )}
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-line-strong rounded-md p-8 flex flex-col items-center gap-2 hover:border-paper-600 hover:bg-surface-sunken transition">
                <Upload size={24} className="text-ink-300" />
                <p className="text-body-s text-content-muted font-medium">Tap to select photos</p>
                <p className="text-micro text-ink-300">JPG, PNG · max 10MB each</p>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
          </div>

          <div>
            <label className="block text-label font-semibold text-content-muted mb-1.5 uppercase tracking-wide">
              Notes <span className="text-ink-300 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              placeholder={isPurchase ? "e.g. Purchased from Apple Store, receipt attached..." : "e.g. Item delivered in perfect condition..."}
              value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="input-field resize-none text-body-s" />
          </div>

          {error && (
            <AdvisoryBanner tone="error">{error}</AdvisoryBanner>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
            <button onClick={handleUpload} disabled={uploading || files.length === 0}
              className="flex-[2] btn-primary disabled:opacity-50">
              {uploading
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading</>
                : <><Upload size={15} /> Upload proof</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Escrow Payment Inner ──
const EscrowInner = ({ match, session, onPaymentComplete }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardReady, setCardReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [profile, setProfile] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'card' | 'wallet' | 'split'
  const [useNewCard, setUseNewCard] = useState(false);
  const [splitWalletAmount, setSplitWalletAmount] = useState('');

  const fees = calcFees(match);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { if (data) setProfile(data); });
  }, [session.user.id]);

  const walletBalance = profile?.wallet_balance || 0;
  const hasSavedCard = !!(profile?.stripe_payment_method_id);
  const canPayFullWithWallet = walletBalance >= fees.shipperPays;
  const showCardForm = (paymentMethod === 'card' || paymentMethod === 'split') && (!hasSavedCard || useNewCard);

  const callStripe = async (action, data) => {
    const { data: { session: auth } } = await supabase.auth.getSession();
    const res = await fetch('https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.access_token}` },
      body: JSON.stringify({ action, data }),
    });
    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'Payment failed');
    return result;
  };

  const handlePay = async () => {
    if (!stripe || !elements) return;
    if ((paymentMethod === 'card' || paymentMethod === 'split') && showCardForm && !cardReady) {
      setError('The card form is not ready yet.'); return;
    }
    setLoading(true); setError('');

    try {
      const total = fees.shipperPays;

      // Wallet-only payment
      if (paymentMethod === 'wallet') {
        if (walletBalance < total) throw new Error(`Insufficient wallet balance. Available: $${walletBalance.toFixed(2)}`);
        await callStripe('escrow_from_wallet', { matchId: match.id, amount: total });
        setSuccess(true);
        setTimeout(() => onPaymentComplete?.(), 1500);
        return;
      }

      // Split: deduct wallet portion, charge card for remainder
      let cardAmount = total;
      if (paymentMethod === 'split') {
        const walletPortion = Math.min(parseFloat(splitWalletAmount) || 0, walletBalance);
        cardAmount = total - walletPortion;
        if (cardAmount <= 0.50) {
          // Stripe minimum is $0.50 — if remainder is tiny, use wallet only
          await callStripe('escrow_from_wallet', { matchId: match.id, amount: total });
          setSuccess(true);
          setTimeout(() => onPaymentComplete?.(), 1500);
          return;
        }
      }

      // Card payment (full or remainder)
      let pmId = hasSavedCard && !useNewCard
        ? profile.stripe_payment_method_id
        : null;

      if (!pmId) {
        const cardElement = elements.getElement(CardElement);
        const { error: pmError, paymentMethod: pm } = await stripe.createPaymentMethod({ type: 'card', card: cardElement });
        if (pmError) throw new Error(pmError.message);
        pmId = pm.id;
      }

      const result = await callStripe('create_payment_intent', {
        matchId: match.id,
        amount: cardAmount,  // dollars
        currency: 'usd',
        paymentMethodId: pmId,
        walletContribution: paymentMethod === 'split' ? (total - cardAmount) : 0,
      });

      if (!result.clientSecret) throw new Error('No client secret returned');

      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
        result.clientSecret, { payment_method: pmId }
      );
      if (confirmError) throw new Error(confirmError.message);
      if (paymentIntent.status !== 'requires_capture' && paymentIntent.status !== 'succeeded') {
        throw new Error(`Unexpected status: ${paymentIntent.status}`);
      }

      setSuccess(true);
      setTimeout(() => onPaymentComplete?.(), 1500);

    } catch (e) {
      setError(e.message || 'The payment failed. Try again.');
    }
    setLoading(false);
  };

  if (match.status === 'in_escrow') return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 bg-info-50 rounded-lg flex items-center justify-center mx-auto mb-3">
        <Lock size={28} className="text-info-500" />
      </div>
      <p className="font-display font-bold text-title-s text-content mb-1">Escrow secured</p>
      <p className="text-body-s text-content-muted mb-3 font-mono">${fees.shipperPays.toFixed(2)} is held by fetchr.</p>
      <div className="bg-info-50 rounded-md p-3 text-body-s text-info-500">
        Neither side can move it alone. It's released to the traveller once delivery is confirmed.
      </div>
    </div>
  );

  if (success) return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 bg-success-tint rounded-lg flex items-center justify-center mx-auto mb-3">
        <CheckCircle size={32} className="text-success" />
      </div>
      <p className="font-display font-bold text-title-m text-content mb-1">Escrow secured</p>
      <p className="text-body-s text-content-muted">
        <span className="font-mono">${fees.shipperPays.toFixed(2)}</span> is held by fetchr, released to the traveller once delivery is confirmed.
      </p>
    </div>
  );

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Lock size={18} className="text-ink-900" />
        <h3 className="font-display font-bold text-title-s text-content">Pay escrow</h3>
      </div>

      <div className="text-body-s text-info-500 bg-info-50 rounded-md p-3">
        You'll pay <span className="font-mono font-semibold">${fees.shipperPays.toFixed(2)}</span> now. We hold it until you both confirm delivery.
      </div>

      {fees.belowMinimum && (
        <AdvisoryBanner tone="error">
          This deal's transport + shop fee total is below fetchr's ${MINIMUM_DEAL_SIZE.toFixed(2)} minimum deal size —
          escrow can't be paid until the agreed terms reach at least ${MINIMUM_DEAL_SIZE.toFixed(2)}.
        </AdvisoryBanner>
      )}

      {/* Payment breakdown — shipper-only figures. Never show what the
          traveller's platform fee is: the shipper already sees transport
          + shop + purchase price, so showing "traveller receives" too
          would make that fee trivially derivable by subtraction. */}
      <div className="ticket">
        <div className="bg-surface-sunken px-4 py-2.5 border-b border-line">
          <p className="text-overline font-mono text-content-muted uppercase tracking-wide">Payment breakdown</p>
        </div>

        <div className="px-4 py-3 space-y-2">
          {/* Transport */}
          <div className="flex justify-between text-content-muted">
            <span className="flex items-center gap-1.5 font-mono text-num-m">
              <Plane size={12} className="text-ink-400" />
              {match.agreed_weight_kg || match.request?.weight_kg} kg × ${match.agreed_price_per_kg || resolveOptionPrice(match.flight, match.luggage_type)}/kg
            </span>
            <span className="font-mono text-num-m">${fees.transportFee.toFixed(2)}</span>
          </div>

          {/* Shop & ship fee */}
          {fees.isPurchase && (
            <div className="flex justify-between text-content-muted">
              <span className="flex items-center gap-1.5 font-mono text-num-m">
                <ShoppingBag size={12} className="text-ink-400" />
                Shop &amp; ship service fee
              </span>
              <span className="font-mono text-num-m">{fees.shopFee > 0 ? `$${fees.shopFee.toFixed(2)}` : 'TBD'}</span>
            </div>
          )}

          {/* Item purchase */}
          {fees.isPurchase && fees.purchasePrice > 0 && (
            <div className="flex justify-between text-content-muted">
              <span className="flex items-center gap-1.5 font-mono text-num-m">
                <Package size={12} className="text-ink-400" />
                Item purchase price
              </span>
              <span className="font-mono text-num-m">${fees.purchasePrice.toFixed(2)}</span>
            </div>
          )}

          {/* Fetchr service fee — deduction shown, not netted */}
          <div className="flex justify-between text-content-muted">
            <span className="font-mono text-num-m">
              Fetchr service fee {fees.floorApplied ? '(minimum)' : `(${Math.round(SHIPPER_SERVICE_FEE_PCT * 100)}%)`}
            </span>
            <span className="font-mono text-num-m">${fees.shipperServiceFee.toFixed(2)}</span>
          </div>

          {/* Sourcing fee — only when there's a purchase */}
          {fees.isPurchase && fees.purchasePrice > 0 && (
            <div className="flex justify-between text-content-muted">
              <span className="font-mono text-num-m">Sourcing fee ({Math.round(SOURCING_FEE_PCT * 100)}%)</span>
              <span className="font-mono text-num-m">${fees.sourcingFee.toFixed(2)}</span>
            </div>
          )}

          <div className="border-t border-line pt-2 mt-1">
            <div className="flex justify-between font-mono font-bold text-content text-num-l">
              <span className="font-sans font-bold text-num-m">Total you pay</span>
              <span>${fees.shipperPays.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment method selector */}
      <div>
        <label className="block text-label font-semibold text-content-muted mb-2 uppercase tracking-wide">Payment method</label>
        <div className="space-y-2">
          {/* Card */}
          <button type="button" onClick={() => setPaymentMethod('card')}
            className={`w-full flex items-center gap-3 p-3 rounded-md border-2 transition-all text-left ${paymentMethod === 'card' ? 'border-ink-900 bg-surface-sunken' : 'border-line hover:border-line-strong'}`}>
            <CreditCard size={20} className="text-ink-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-body-s font-bold text-content">Credit / debit card</p>
              <p className="text-micro text-content-subtle">Pay the full amount by card</p>
            </div>
            {paymentMethod === 'card' && <CheckCircle size={16} className="text-ink-900 flex-shrink-0" />}
          </button>

          {/* Wallet full */}
          {canPayFullWithWallet && (
            <button type="button" onClick={() => setPaymentMethod('wallet')}
              className={`w-full flex items-center gap-3 p-3 rounded-md border-2 transition-all text-left ${paymentMethod === 'wallet' ? 'border-ink-900 bg-surface-sunken' : 'border-line hover:border-line-strong'}`}>
              <Wallet size={20} className="text-ink-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-body-s font-bold text-content font-mono">Wallet (${walletBalance.toFixed(2)} available)</p>
                <p className="text-micro text-content-subtle">Pay the full amount from your wallet</p>
              </div>
              {paymentMethod === 'wallet' && <CheckCircle size={16} className="text-ink-900 flex-shrink-0" />}
            </button>
          )}

          {/* Split */}
          {walletBalance > 0 && !canPayFullWithWallet && (
            <button type="button" onClick={() => { setPaymentMethod('split'); setSplitWalletAmount(walletBalance.toFixed(2)); }}
              className={`w-full flex items-center gap-3 p-3 rounded-md border-2 transition-all text-left ${paymentMethod === 'split' ? 'border-ink-900 bg-surface-sunken' : 'border-line hover:border-line-strong'}`}>
              <Zap size={20} className="text-ink-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-body-s font-bold text-content">Wallet + card</p>
                <p className="text-micro text-content-subtle font-mono">${walletBalance.toFixed(2)} wallet + ${(fees.shipperPays - walletBalance).toFixed(2)} card</p>
              </div>
              {paymentMethod === 'split' && <CheckCircle size={16} className="text-ink-900 flex-shrink-0" />}
            </button>
          )}
        </div>
      </div>

      {/* Saved card option */}
      {(paymentMethod === 'card' || paymentMethod === 'split') && hasSavedCard && (
        <div className="space-y-2">
          {[
            { val: false, label: `${profile?.payout_card_brand ? profile.payout_card_brand.charAt(0).toUpperCase() + profile.payout_card_brand.slice(1) : 'Card'} ****${profile?.payout_card_last4}`, sub: 'Saved card', icon: CreditCard },
            { val: true, label: 'Use a different card', sub: 'Enter new details', icon: Plus },
          ].map(opt => (
            <button key={String(opt.val)} type="button" onClick={() => { setUseNewCard(opt.val); setError(''); }}
              className={`w-full flex items-center gap-3 p-3 rounded-md border-2 transition-all text-left ${useNewCard === opt.val ? 'border-ink-900 bg-surface-sunken' : 'border-line hover:border-line-strong'}`}>
              <opt.icon size={18} className="text-ink-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-body-s font-bold text-content font-mono">{opt.label}</p>
                <p className="text-micro text-content-subtle">{opt.sub}</p>
              </div>
              {useNewCard === opt.val && <CheckCircle size={14} className="text-ink-900" />}
            </button>
          ))}
        </div>
      )}

      {/* Card form */}
      {(paymentMethod === 'card' || paymentMethod === 'split') && showCardForm && (
        <div>
          <label className="block text-label font-semibold text-content-muted mb-1.5 uppercase tracking-wide">Card details</label>
          <div className="border-2 border-line-strong rounded-md px-4 py-3.5 focus-within:border-accent transition-all bg-surface">
            <CardElement options={{ ...CARD_ELEMENT_OPTIONS, wallets: { link: 'never' } }} onReady={() => setCardReady(true)} />
          </div>
          <div className="bg-warning-tint border-l-[3px] border-warn-400 rounded-r p-3 mt-2">
            <p className="text-body-s text-warning font-bold">Test mode</p>
            <p className="text-body-s text-warning mt-0.5 font-mono">4242 4242 4242 4242 · any future date · any CVC</p>
          </div>
        </div>
      )}

      {error && <AdvisoryBanner tone="error">{error}</AdvisoryBanner>}

      <button onClick={handlePay}
        disabled={loading || !stripe || fees.belowMinimum || ((paymentMethod === 'card' || paymentMethod === 'split') && showCardForm && !cardReady)}
        className="w-full btn-signal disabled:opacity-50">
        {loading
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing</>
          : <><Lock size={15} /> Pay ${fees.shipperPays.toFixed(2)} escrow</>
        }
      </button>

      <p className="text-micro text-content-subtle text-center flex items-center justify-center gap-1">
        <Lock size={11} /> fetchr secure escrow · powered by Stripe
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
