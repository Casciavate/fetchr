import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { AIRLINE_CODES } from './shared/airlines';
import {
  Plane, Edit2, Trash2, Plus, AlertTriangle,
  CheckCircle, DollarSign, X, Save,
  MapPin, ShoppingBag, Briefcase, Package, Weight, Handshake
} from 'lucide-react';
import Toast from './shared/Toast';
import EmptyState from './shared/EmptyState';
import AdvisoryBanner from './shared/AdvisoryBanner';
import { TicketSkeleton } from './shared/Skeleton';
import { calcFees, TRAVELER_PLATFORM_FEE_PCT } from '../lib/fees';

const CATEGORIES = [
  'Electronics', 'Clothing & Fashion', 'Cosmetics & Beauty',
  'Food & Beverages', 'Books & Stationery', 'Toys & Games',
  'Medical & Pharmacy', 'Jewelry & Accessories', 'Sports & Fitness',
  'Home & Living', 'Documents', 'Other'
];

// Bare glyph, docs/BRAND.md §2.6 — ticket header bar
const BareGlyph = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="fetchr">
    <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
      fill="none" stroke="#FBFAF8" strokeWidth="5" strokeLinecap="round" />
    <rect x="10.5" y="21" width="16" height="4.6" rx="2.3" fill="#FBFAF8" />
    <path d="M29 10.5 L39 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518" />
  </svg>
);

const AirlineLogo = ({ airline }) => {
  const code = AIRLINE_CODES[airline];
  if (!code) return (
    <div className="w-12 h-12 bg-ink-100 rounded-lg flex items-center justify-center flex-shrink-0">
      <Plane size={22} className="text-ink-400" />
    </div>
  );
  return (
    <div className="w-12 h-12 rounded-lg bg-surface border border-line flex items-center justify-center overflow-hidden flex-shrink-0">
      <img
        src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`}
        alt={airline}
        className="w-9 h-9 object-contain"
        onError={e => {
          e.target.style.display = 'none';
          e.target.parentNode.innerHTML = `<span style="font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;color:#14181F">${code}</span>`;
        }}
      />
    </div>
  );
};

const getLuggageOptions = (flight) => {
  // Try to parse from luggage_options JSONB first
  if (flight.luggage_options && Array.isArray(flight.luggage_options)) {
    return flight.luggage_options;
  }
  // Try to parse from notes field (legacy format)
  if (flight.notes) {
    const match = flight.notes.match(/Luggage options: (\[.*\])/);
    if (match) {
      try { return JSON.parse(match[1]); } catch (e) {}
    }
  }
  // Fall back to single option from main fields
  if (flight.available_kg && flight.price_per_kg) {
    return [{
      type: 'checkin',
      available_kg: flight.available_kg,
      price_per_kg: flight.price_per_kg,
      booked_kg: flight.booked_kg,
    }];
  }
  return [];
};

// Potential-earnings estimate shown before any real deal exists — no
// match/request to run through calcFees, so this builds the minimal
// synthetic shape calcFees expects and lets it do the actual math. Was
// previously its own copy of the old percentage-tier model AND ignored
// shop_and_ship_fee entirely, understating potential earnings on any
// flight offering Shop & Ship.
const getNetEarnings = (kg, ppk, shopFee = 0, offersShopShip = false) => {
  if (!kg || !ppk) return null;
  const fees = calcFees({
    agreed_price_per_kg: ppk,
    agreed_weight_kg: kg,
    agreed_shop_fee: shopFee,
    request: { requires_purchase: offersShopShip, purchase_price: 0 },
  });
  const gross = fees.transportFee + fees.shopFee;
  return { gross, net: fees.travelerReceives, fee: fees.travelerPlatformFee, pct: Math.round(TRAVELER_PLATFORM_FEE_PCT * 100) };
};

const LuggageEditCard = ({ opt, index, onChange, onRemove, shopFee, offersShopShip }) => {
  const isCarryOn = opt.type === 'carry_on';
  const earnings = getNetEarnings(opt.available_kg, opt.price_per_kg, shopFee, offersShopShip);

  return (
    <div className="rounded-md border border-line-strong bg-surface-sunken p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isCarryOn
            ? <Briefcase size={16} className="text-ink-600" />
            : <Package size={16} className="text-ink-600" />
          }
          <p className="text-body-s font-semibold text-ink-900">
            {isCarryOn ? 'Hand luggage' : 'Check-in luggage'}
          </p>
        </div>
        <button onClick={() => onRemove(index)}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-danger-tint transition">
          <X size={14} className="text-danger" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-label text-content-muted mb-1">
            kg available
          </label>
          <div className="relative">
            <Weight size={13} className="absolute left-3 top-3.5 text-ink-400 pointer-events-none" />
            <input type="number" min="0.5"
              max={isCarryOn ? '10' : '32'} step="0.5"
              value={opt.available_kg}
              onChange={e => onChange(index, { ...opt, available_kg: e.target.value })}
              className="input-field pl-8 py-2.5 text-body-s" />
          </div>
        </div>
        <div>
          <label className="block text-label text-content-muted mb-1">
            Price/kg ($)
          </label>
          <div className="relative">
            <DollarSign size={13} className="absolute left-3 top-3.5 text-ink-400 pointer-events-none" />
            <input type="number" min="1" step="0.5"
              value={opt.price_per_kg}
              onChange={e => onChange(index, { ...opt, price_per_kg: e.target.value })}
              className="input-field pl-8 py-2.5 text-body-s" />
          </div>
        </div>
      </div>

      {earnings && (
        <div className="bg-surface rounded-md p-2.5 text-body-s space-y-1 border border-line font-mono">
          <div className="flex justify-between text-content-muted">
            <span>Gross</span><span>${earnings.gross.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-content-muted">
            <span>fetchr fee ({earnings.pct}%)</span>
            <span>&minus;${earnings.fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-success border-t border-line pt-1">
            <span>Net earnings</span><span>${earnings.net.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const MyFlights = ({ session, onAddFlight }) => {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flightStatuses, setFlightStatuses] = useState({});
  const [editingFlight, setEditingFlight] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editLuggage, setEditLuggage] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchFlights = async () => {
    setLoading(true);
    await supabase.rpc('expire_old_flights');
    const { data, error } = await supabase
      .from('flights').select('*').eq('user_id', session.user.id)
      .in('status', ['active', 'expired'])
      .order('flight_date', { ascending: true });
    if (!error && data) {
      setFlights(data);
      await fetchFlightStatuses(data);
    }
    setLoading(false);
  };

  const fetchFlightStatuses = async (flightList) => {
    const statuses = {};
    for (const flight of flightList) {
      const { data } = await supabase.from('matches').select('status')
        .eq('flight_id', flight.id)
        .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
        .limit(1);
      if (data && data.length > 0) statuses[flight.id] = data[0].status;
    }
    setFlightStatuses(statuses);
  };

  useEffect(() => { fetchFlights(); }, []);

  const hasActiveMatch = (flightId) => !!flightStatuses[flightId];

  const startEditing = (flight) => {
    if (hasActiveMatch(flight.id)) return;
    setEditingFlight(flight.id);
    const luggageOpts = getLuggageOptions(flight);
    setEditLuggage(luggageOpts.map(l => ({ ...l })));
    setEditForm({
      categories: flight.categories || [],
      notes: (flight.notes || '').replace(/\nLuggage options:.*$/s, '').trim(),
      delivery_type: flight.delivery_type || 'handover',
      shop_and_ship_fee: flight.shop_and_ship_fee?.toString() || '',
      handover_location_departure: flight.handover_location_departure || '',
      handover_location_arrival: flight.handover_location_arrival || '',
    });
    setError(''); setSuccess('');
  };

  const cancelEditing = () => {
    setEditingFlight(null); setEditForm({}); setEditLuggage([]); setError('');
  };

  const addLuggageOption = (type) => {
    const alreadyHas = editLuggage.some(l => l.type === type);
    if (alreadyHas) return;
    setEditLuggage(prev => [...prev, { type, available_kg: '', price_per_kg: '' }]);
  };

  const updateLuggageOption = (index, data) => {
    setEditLuggage(prev => prev.map((l, i) => i === index ? data : l));
  };

  const removeLuggageOption = (index) => {
    setEditLuggage(prev => prev.filter((_, i) => i !== index));
  };

  const saveEdit = async (flightId) => {
    if (hasActiveMatch(flightId)) { setError('This flight has an active deal — changes must go through the deal chat.'); return; }
    if (editLuggage.length === 0) { setError('Add at least one luggage option.'); return; }
    for (const opt of editLuggage) {
      if (!opt.available_kg || parseFloat(opt.available_kg) <= 0) {
        setError(`Enter valid kg for ${opt.type === 'carry_on' ? 'hand luggage' : 'check-in'}.`); return;
      }
      if (!opt.price_per_kg || parseFloat(opt.price_per_kg) <= 0) {
        setError(`Enter valid price for ${opt.type === 'carry_on' ? 'hand luggage' : 'check-in'}.`); return;
      }
    }
    if (editForm.categories.length === 0) { setError('Select at least one category.'); return; }

    setSaving(true); setError('');

    const primary = editLuggage[0];
    const luggageJson = JSON.stringify(editLuggage.map(l => ({
      type: l.type,
      available_kg: parseFloat(l.available_kg),
      price_per_kg: parseFloat(l.price_per_kg),
    })));

    const totalKg = editLuggage.reduce((s, l) => s + parseFloat(l.available_kg || 0), 0);

    const { error } = await supabase.from('flights').update({
      available_kg: totalKg,
      price_per_kg: parseFloat(primary.price_per_kg),
      luggage_options: editLuggage.map(l => ({
        type: l.type,
        available_kg: parseFloat(l.available_kg),
        price_per_kg: parseFloat(l.price_per_kg),
      })),
      categories: editForm.categories,
      notes: [editForm.notes, `Luggage options: ${luggageJson}`].filter(Boolean).join('\n'),
      delivery_type: editForm.delivery_type,
      shop_and_ship_fee: parseFloat(editForm.shop_and_ship_fee) || 0,
      handover_location_departure: editForm.handover_location_departure,
      handover_location_arrival: editForm.handover_location_arrival,
    }).eq('id', flightId);

    if (error) { setError(error.message); } else {
      setSuccess('Flight updated.');
      setEditingFlight(null); setEditForm({}); setEditLuggage([]);
      await fetchFlights();
      setTimeout(() => setSuccess(''), 3000);
    }
    setSaving(false);
  };

  const deleteFlight = async (flightId) => {
    if (hasActiveMatch(flightId)) { alert('Cannot delete a flight with an active deal.'); return; }
    if (!window.confirm('Delete this flight? This cannot be undone.')) return;
    const { error } = await supabase.from('flights').delete().eq('id', flightId);
    if (!error) setFlights(prev => prev.filter(f => f.id !== flightId));
  };

  const toggleCategory = (cat) => {
    setEditForm(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  // Status pill, docs/BRAND.md §7.13 — one state pill, no icons except ID verified
  const getStatusPill = (flight) => {
    const status = flightStatuses[flight.id];
    if (status === 'in_escrow') return <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-success-tint text-success font-mono text-overline uppercase">Escrow active</span>;
    if (status === 'proof_uploaded') return <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-accent-fill text-white font-mono text-overline uppercase">Proof uploaded</span>;
    if (status === 'terms_agreed') return <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-ink-100 text-content-muted font-mono text-overline uppercase">Terms agreed</span>;
    if (status === 'accepted') return <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-ink-100 text-content-muted font-mono text-overline uppercase">Deal active</span>;
    if (flight.status === 'expired') return <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-ink-100 text-content-muted font-mono text-overline uppercase">Flight passed</span>;
    return <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-success-tint text-success font-mono text-overline uppercase">Active</span>;
  };

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-4">
      {[1, 2, 3].map(i => <TicketSkeleton key={i} />)}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-title-l text-ink-900">My flights</h1>
          <p className="text-body-s text-content-muted mt-0.5">
            {flights.length} flight{flights.length !== 1 ? 's' : ''} listed
          </p>
        </div>
        <button onClick={onAddFlight} className="btn-primary">
          <Plus size={16} /> Add flight
        </button>
      </div>

      <Toast message={success} tone="success" />

      {flights.length === 0 ? (
        <EmptyState icon={Plane} title="No flights listed"
          body="Add a trip you're already taking and start earning on the luggage space you're not using."
          action={<button onClick={onAddFlight} className="btn-primary">Add a flight</button>} />
      ) : (
        <div className="space-y-4">
          {flights.map(flight => {
            const luggageOpts = getLuggageOptions(flight);
            const totalKg = luggageOpts.reduce((s, l) => s + parseFloat(l.available_kg || 0), 0);
            const bookedKg = parseFloat(flight.booked_kg || 0);
            // Each tranche's own remaining capacity, not a pooled
            // available-minus-booked — 10kg check-in fully booked and 8kg
            // hand luggage untouched is 8kg free, never "18kg minus however
            // much of either type has been booked so far."
            const remainingKg = luggageOpts.reduce((s, l) =>
              s + Math.max(0, parseFloat(l.available_kg || 0) - parseFloat(l.booked_kg || 0)), 0);
            const offersShopShip = flight.delivery_type === 'both';
            const shopShipFee = offersShopShip ? (parseFloat(flight.shop_and_ship_fee) || 0) : 0;
            // Shop & ship fee is a flat one-time fee per deal, not per
            // luggage tranche — summed once here rather than inside the
            // per-option reduce below, which would double (or triple) it
            // if a flight offers both carry-on and check-in space.
            const totalNet = luggageOpts.reduce((s, l) => {
              const e = getNetEarnings(l.available_kg, l.price_per_kg);
              return s + (e?.net || 0);
            }, 0) + (shopShipFee > 0 ? shopShipFee * (1 - TRAVELER_PLATFORM_FEE_PCT) : 0);
            const ref = flight.id.slice(0, 6).toUpperCase();

            return (
              <div key={flight.id} className="ticket">

                {/* Header bar — trip ticket, docs/BRAND.md §7.7 variant */}
                <div className="h-10 bg-ink-900 flex items-center justify-between px-4">
                  <div className="flex items-center gap-2">
                    <BareGlyph size={16} />
                    <span className="font-display font-extrabold text-[13px] tracking-[-0.05em] text-paper-100">
                      fetchr
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-ink-300">
                    TRIP · #{ref}
                  </span>
                </div>

                <div className="p-4 space-y-3">

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <AirlineLogo airline={flight.airline} />
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-code-l text-ink-900">
                          {flight.from_code} <span className="text-ink-400">&rarr;</span> {flight.to_code}
                        </p>
                        <p className="text-body-s text-content-muted truncate">
                          {flight.from_city} &rarr; {flight.to_city}
                        </p>
                      </div>
                    </div>
                    {getStatusPill(flight)}
                  </div>

                  {/* Data strip — Date · Flight · Free, §7.7 */}
                  <div className="font-mono text-micro text-content-muted border-t border-b border-line py-1.5 flex flex-wrap gap-x-1">
                    <span>{new Date(flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    <span>&middot;</span>
                    <span>{flight.airline}{flight.flight_number ? ` ${flight.flight_number}` : ''}</span>
                    <span>&middot;</span>
                    <span>
                      {bookedKg > 0
                        ? `${remainingKg.toFixed(1)}kg free of ${totalKg.toFixed(1)}kg`
                        : `${totalKg.toFixed(1)}kg free`}
                    </span>
                  </div>

                  {flight.status === 'expired' && (
                    <div className="flex items-start gap-2 bg-warning-tint rounded-r px-2.5 py-2 border-l-[3px] border-warn-400">
                      <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
                      <p className="text-body-s text-warning">
                        This flight already departed. It's kept here because it has deal history.
                      </p>
                    </div>
                  )}

                  {hasActiveMatch(flight.id) && (
                    <div className="flex items-start gap-2 bg-info-50 rounded-r px-2.5 py-2 border-l-[3px] border-info-400">
                      <AlertTriangle size={14} className="text-info-500 flex-shrink-0 mt-0.5" />
                      <p className="text-body-s text-info-500">
                        {bookedKg > 0
                          ? `${bookedKg.toFixed(1)}kg already committed to an active deal — ${remainingKg.toFixed(1)}kg still free for other matches. `
                          : 'Active deal in progress — '}
                        This flight can't be deleted or edited here. Any change to price or
                        terms needs to go through the Messages tab for that deal.
                      </p>
                    </div>
                  )}

                  {/* View mode */}
                  {editingFlight !== flight.id && (
                    <>
                      <div className="space-y-2">
                        {luggageOpts.map((opt, i) => {
                          const optBooked = parseFloat(opt.booked_kg || 0);
                          const optRemaining = Math.max(0, parseFloat(opt.available_kg || 0) - optBooked);
                          const e = getNetEarnings(optRemaining, opt.price_per_kg);
                          const isCarryOn = opt.type === 'carry_on';
                          return (
                            <div key={i} className="flex items-center justify-between p-3 rounded-md bg-surface-sunken border border-line">
                              <div className="flex items-center gap-2">
                                {isCarryOn
                                  ? <Briefcase size={15} className="text-ink-600" />
                                  : <Package size={15} className="text-ink-600" />
                                }
                                <div>
                                  <p className="text-body-s font-semibold text-ink-900">
                                    {isCarryOn ? 'Hand luggage' : 'Check-in luggage'}
                                  </p>
                                  <p className="text-body-s text-content-muted font-mono">
                                    {optBooked > 0
                                      ? `${optRemaining}kg free of ${opt.available_kg}kg @ $${opt.price_per_kg}/kg`
                                      : `${opt.available_kg}kg @ $${opt.price_per_kg}/kg`}
                                  </p>
                                </div>
                              </div>
                              {e && (
                                <div className="text-right font-mono">
                                  <p className="text-body-s font-bold text-success">${e.net.toFixed(2)}</p>
                                  <p className="text-micro text-content-subtle">net ({e.pct}% fee)</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {offersShopShip && shopShipFee > 0 && (
                          <div className="flex items-center justify-between p-3 rounded-md bg-surface-sunken border border-line">
                            <div className="flex items-center gap-2">
                              <ShoppingBag size={15} className="text-ink-600" />
                              <div>
                                <p className="text-body-s font-semibold text-ink-900">Shop &amp; ship service fee</p>
                                <p className="text-body-s text-content-muted font-mono">
                                  ${shopShipFee.toFixed(2)} flat, when a sender needs an item bought
                                </p>
                              </div>
                            </div>
                            <div className="text-right font-mono">
                              <p className="text-body-s font-bold text-success">
                                +${(shopShipFee * (1 - TRAVELER_PLATFORM_FEE_PCT)).toFixed(2)}
                              </p>
                              <p className="text-micro text-content-subtle">net ({Math.round(TRAVELER_PLATFORM_FEE_PCT * 100)}% fee)</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {luggageOpts.length > 1 && (
                        <div className="flex items-center justify-between bg-ink-100 rounded-md p-3">
                          <p className="text-body-s font-semibold text-ink-900">Total if fully booked</p>
                          <div className="text-right font-mono">
                            <p className="text-body-s font-bold text-ink-900">{totalKg.toFixed(1)}kg</p>
                            <p className="text-body-s text-success font-semibold">
                              Net: ${totalNet.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      )}

                      {flight.categories?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {flight.categories.map(cat => (
                            <span key={cat} className="badge badge-gray">{cat}</span>
                          ))}
                        </div>
                      )}

                      {flight.handover_location_departure && (
                        <p className="text-body-s text-content-subtle flex items-center gap-1">
                          <MapPin size={11} /> Dep: {flight.handover_location_departure}
                        </p>
                      )}
                      {flight.handover_location_arrival && (
                        <p className="text-body-s text-content-subtle flex items-center gap-1">
                          <MapPin size={11} /> Arr: {flight.handover_location_arrival}
                        </p>
                      )}

                      {flight.delivery_type === 'both' && (
                        <div className="flex items-center gap-2 bg-info-50 text-info-500 rounded-md px-3 py-2 text-body-s font-semibold">
                          <ShoppingBag size={12} /> Shop &amp; Ship available
                          {flight.shop_and_ship_fee > 0 ? ` · $${flight.shop_and_ship_fee} service fee` : ''}
                        </div>
                      )}

                      {editForm.notes && (
                        <p className="text-body-s text-content-subtle italic">"{editForm.notes}"</p>
                      )}
                    </>
                  )}

                  {/* Edit mode */}
                  {editingFlight === flight.id && (
                    <div className="border-t border-line pt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-body-s font-bold text-ink-900">Edit flight</p>
                        <button onClick={cancelEditing}
                          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-surface-sunken transition">
                          <X size={16} className="text-ink-400" />
                        </button>
                      </div>

                      {error && <AdvisoryBanner tone="error">{error}</AdvisoryBanner>}

                      <div>
                        <p className="text-label text-content-muted mb-2">Luggage options</p>

                        <div className="flex gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => addLuggageOption('carry_on')}
                            disabled={editLuggage.some(l => l.type === 'carry_on')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md border text-label font-semibold transition-all ${
                              editLuggage.some(l => l.type === 'carry_on')
                                ? 'border-line-strong bg-ink-100 text-ink-900 cursor-default'
                                : 'border-dashed border-line-strong text-ink-600 hover:bg-surface-sunken'
                            }`}>
                            {editLuggage.some(l => l.type === 'carry_on')
                              ? <CheckCircle size={13} />
                              : <Plus size={13} />
                            }
                            <Briefcase size={13} /> Hand luggage
                          </button>
                          <button
                            type="button"
                            onClick={() => addLuggageOption('checkin')}
                            disabled={editLuggage.some(l => l.type === 'checkin')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md border text-label font-semibold transition-all ${
                              editLuggage.some(l => l.type === 'checkin')
                                ? 'border-line-strong bg-ink-100 text-ink-900 cursor-default'
                                : 'border-dashed border-line-strong text-ink-600 hover:bg-surface-sunken'
                            }`}>
                            {editLuggage.some(l => l.type === 'checkin')
                              ? <CheckCircle size={13} />
                              : <Plus size={13} />
                            }
                            <Package size={13} /> Check-in
                          </button>
                        </div>

                        <div className="space-y-3">
                          {editLuggage.map((opt, i) => (
                            <LuggageEditCard
                              key={i}
                              opt={opt}
                              index={i}
                              onChange={updateLuggageOption}
                              onRemove={removeLuggageOption}
                              shopFee={editForm.delivery_type === 'both' ? (parseFloat(editForm.shop_and_ship_fee) || 0) : 0}
                              offersShopShip={editForm.delivery_type === 'both'}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-label text-content-muted mb-2">
                          Categories (required)
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {CATEGORIES.map(cat => (
                            <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                              className={`px-2.5 py-1 rounded-md text-label font-semibold border transition-all ${
                                editForm.categories?.includes(cat)
                                  ? 'bg-brand text-white border-brand'
                                  : 'bg-surface text-ink-600 border-line-strong hover:bg-surface-sunken'
                              }`}>
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-label text-content-muted mb-2">
                          Delivery service
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 'handover', label: 'Handover only', icon: Handshake },
                            { value: 'both', label: '+ Shop & Ship', icon: ShoppingBag },
                          ].map(opt => (
                            <button key={opt.value} type="button"
                              onClick={() => setEditForm({ ...editForm, delivery_type: opt.value })}
                              className={`flex items-center justify-center gap-1.5 p-2.5 rounded-md border text-label font-semibold transition-all ${
                                editForm.delivery_type === opt.value
                                  ? 'border-ink-900 bg-ink-100 text-ink-900'
                                  : 'border-line-strong text-ink-600 hover:bg-surface-sunken'
                              }`}>
                              <opt.icon size={13} /> {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {editForm.delivery_type === 'both' && (
                        <div>
                          <label className="block text-label text-content-muted mb-1.5">
                            Shop & Ship fee ($)
                          </label>
                          <div className="relative">
                            <DollarSign size={13} className="absolute left-3 top-3.5 text-ink-400 pointer-events-none" />
                            <input type="number" min="0" step="0.5"
                              placeholder="e.g. 15.00" value={editForm.shop_and_ship_fee}
                              onChange={e => setEditForm({ ...editForm, shop_and_ship_fee: e.target.value })}
                              className="input-field pl-8 py-2.5" />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-label text-content-muted mb-1.5">
                          Departure handover location
                        </label>
                        <input type="text"
                          placeholder="e.g. Dubai Airport T3 departures..."
                          value={editForm.handover_location_departure}
                          onChange={e => setEditForm({ ...editForm, handover_location_departure: e.target.value })}
                          className="input-field py-2.5" />
                      </div>

                      <div>
                        <label className="block text-label text-content-muted mb-1.5">
                          Arrival handover location
                        </label>
                        <input type="text"
                          placeholder="e.g. Heathrow arrivals hall..."
                          value={editForm.handover_location_arrival}
                          onChange={e => setEditForm({ ...editForm, handover_location_arrival: e.target.value })}
                          className="input-field py-2.5" />
                      </div>

                      <div>
                        <label className="block text-label text-content-muted mb-1.5">
                          Notes
                        </label>
                        <textarea placeholder="Any special conditions..."
                          value={editForm.notes}
                          onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                          rows={2} className="input-field resize-none py-2.5" />
                      </div>

                      <div className="flex gap-2">
                        <button onClick={cancelEditing} className="flex-1 btn-secondary py-2.5">
                          <X size={14} /> Cancel
                        </button>
                        <button onClick={() => saveEdit(flight.id)} disabled={saving}
                          className="flex-[2] btn-primary py-2.5 disabled:opacity-50">
                          <Save size={14} /> {saving ? 'Saving' : 'Save changes'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {editingFlight !== flight.id && (
                  <>
                    <div className="perf" />
                    <div className="px-4 pt-3.5 pb-4 space-y-3">
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-body-m text-content-muted">Max net earnings</span>
                        <span className="font-mono font-bold text-num-l text-ink-900">${totalNet.toFixed(2)}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => startEditing(flight)}
                          disabled={hasActiveMatch(flight.id)}
                          className="flex-1 btn-secondary disabled:opacity-30 disabled:cursor-not-allowed">
                          <Edit2 size={14} /> Edit
                        </button>
                        <button onClick={() => deleteFlight(flight.id)}
                          disabled={hasActiveMatch(flight.id)}
                          className="flex-1 btn-danger disabled:opacity-30 disabled:cursor-not-allowed">
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyFlights;
