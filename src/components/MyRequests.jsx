import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, Trash2, Plus, AlertTriangle, CheckCircle,
  MapPin, Weight, DollarSign, Calendar, ShoppingBag,
  Link, ChevronDown, ChevronUp, User, Phone, Shield,
  Plane, Clock, X
} from 'lucide-react';
import RatingDisplay from './shared/RatingDisplay';
import AdvisoryBanner from './shared/AdvisoryBanner';
import EmptyState from './shared/EmptyState';
import { TicketSkeleton } from './shared/Skeleton';

// Bare glyph, docs/BRAND.md §2.6 — ticket header bar
const BareGlyph = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="fetchr">
    <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
      fill="none" stroke="#FBFAF8" strokeWidth="5" strokeLinecap="round" />
    <rect x="10.5" y="21" width="16" height="4.6" rx="2.3" fill="#FBFAF8" />
    <path d="M29 10.5 L39 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518" />
  </svg>
);

const MyRequests = ({ session, onNewRequest }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestStatuses, setRequestStatuses] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [dealDetails, setDealDetails] = useState({});
  const [loadingDeal, setLoadingDeal] = useState({});

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('shipment_requests')
      .select('*')
      .eq('user_id', session.user.id)
      .in('status', ['open', 'matched'])
      .order('created_at', { ascending: false });
    if (!error && data) {
      setRequests(data);
      await fetchStatuses(data);
    }
    setLoading(false);
  };

  const fetchStatuses = async (reqs) => {
    const statuses = {};
    for (const req of reqs) {
      const { data } = await supabase
        .from('matches')
        .select('status')
        .eq('request_id', req.id)
        .in('status', ['accepted', 'in_escrow', 'terms_agreed', 'proof_uploaded'])
        .limit(1);
      if (data && data.length > 0) statuses[req.id] = data[0].status;
    }
    setRequestStatuses(statuses);
  };

  const fetchDealDetails = async (requestId) => {
    if (dealDetails[requestId]) return;
    setLoadingDeal(prev => ({ ...prev, [requestId]: true }));
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        flight:flights(*),
        traveler:profiles!matches_traveler_id_fkey(
          id, full_name, avatar_url, rating, total_reviews,
          nationality, languages, verified
        )
      `)
      .eq('request_id', requestId)
      .not('status', 'in', '["pending","rejected"]')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setDealDetails(prev => ({ ...prev, [requestId]: data }));
    setLoadingDeal(prev => ({ ...prev, [requestId]: false }));
  };

  useEffect(() => { fetchRequests(); }, []);

  const hasActiveMatch = (id) => !!requestStatuses[id];

  const deleteRequest = async (id) => {
    if (hasActiveMatch(id)) { alert('Cannot delete a request with an active deal.'); return; }
    if (!window.confirm('Delete this request? This cannot be undone.')) return;
    const { error } = await supabase.from('shipment_requests').delete().eq('id', id);
    if (!error) setRequests(prev => prev.filter(r => r.id !== id));
  };

  const handleExpand = async (id) => {
    const isExpanding = expandedId !== id;
    setExpandedId(isExpanding ? id : null);
    if (isExpanding) await fetchDealDetails(id);
  };

  // Status pill, docs/BRAND.md §7.13
  const getStatusPill = (req) => {
    const status = requestStatuses[req.id];
    if (status === 'in_escrow') return <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-success-tint text-success font-mono text-overline uppercase">Escrow active</span>;
    if (status === 'proof_uploaded') return <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-accent-fill text-white font-mono text-overline uppercase">Proof uploaded</span>;
    if (status === 'terms_agreed') return <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-ink-100 text-content-muted font-mono text-overline uppercase">Terms agreed</span>;
    if (status === 'accepted') return <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-ink-100 text-content-muted font-mono text-overline uppercase">Deal accepted</span>;
    return <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-success-tint text-success font-mono text-overline uppercase">Open</span>;
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getTravelerAvatar = (traveler) => {
    if (!traveler?.avatar_url) return null;
    const { data } = supabase.storage.from('avatars').getPublicUrl(traveler.avatar_url);
    return data?.publicUrl;
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
          <h1 className="font-display font-bold text-title-l text-ink-900">My requests</h1>
          <p className="text-body-s text-ink-muted mt-0.5">
            {requests.length} active request{requests.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={onNewRequest} className="btn-primary">
          <Plus size={16} /> New request
        </button>
      </div>

      {/* Platform liability notice — §7.9 advisory, info tone */}
      <AdvisoryBanner tone="info" title="Platform liability notice" className="mb-6">
        fetchr is a matchmaking and secure payment platform only. All transactions, item legality, and delivery arrangements are solely between the traveller and sender. fetchr bears no liability for items transported, customs issues, or delivery disputes. Users accept full legal responsibility for their shipments.
      </AdvisoryBanner>

      {requests.length === 0 ? (
        <EmptyState icon={Package} title="No requests yet"
          body="Post what you need and travellers on your route will offer to carry it."
          action={<button onClick={onNewRequest} className="btn-primary">Post a request</button>} />
      ) : (
        <div className="space-y-4">
          {requests.map(req => {
            const isExpanded = expandedId === req.id;
            const hasMatch = hasActiveMatch(req.id);
            const deal = dealDetails[req.id];
            const isLoadingDeal = loadingDeal[req.id];
            const ref = req.id.slice(0, 6).toUpperCase();

            return (
              <div key={req.id} className="ticket">

                {/* Header bar — request ticket, docs/BRAND.md §7.7 variant */}
                <div className="h-10 bg-ink-900 flex items-center justify-between px-4">
                  <div className="flex items-center gap-2">
                    <BareGlyph size={16} />
                    <span className="font-display font-extrabold text-[13px] tracking-[-0.05em] text-paper-100">
                      fetchr
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-ink-300">
                    REQUEST · #{ref}
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      {req.item_photo_url ? (
                        <div className="w-14 h-14 rounded-lg overflow-hidden border border-line flex-shrink-0 bg-surface-sunken flex items-center justify-center">
                          <img
                            src={req.item_photo_url}
                            alt={req.item_name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-14 h-14 bg-ink-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Package size={22} className="text-ink-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-display font-semibold text-title-s text-ink-900 truncate">{req.item_name}</p>
                        <p className="text-body-s text-ink-subtle mt-0.5">{req.category}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="badge badge-gray">
                            {req.from_code} &rarr; {req.to_code}
                          </span>
                          {req.requires_purchase && (
                            <span className="badge badge-blue">
                              <ShoppingBag size={9} /> Shop & Ship
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {getStatusPill(req)}
                  </div>

                  {/* Data strip — Needed by · Weight · Value · Offers, §7.7 */}
                  <div className="font-mono text-micro text-ink-muted border-t border-b border-line py-1.5 flex flex-wrap gap-x-1">
                    <span>{req.needed_by ? `by ${new Date(req.needed_by).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : 'no deadline'}</span>
                    <span>&middot;</span>
                    <span>{req.weight_kg}kg</span>
                    <span>&middot;</span>
                    <span>{req.max_budget ? `${req.budget_currency || 'USD'} ${parseFloat(req.max_budget).toFixed(0)} max` : 'open budget'}</span>
                  </div>

                  {hasMatch && (
                    <div className="flex items-start gap-2 bg-info-50 rounded-r px-2.5 py-2 border-l-[3px] border-info-400">
                      <AlertTriangle size={14} className="text-info-500 flex-shrink-0 mt-0.5" />
                      <p className="text-body-s text-info-500">Active deal in progress — cannot delete until complete.</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => handleExpand(req.id)} className="flex-1 btn-secondary">
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      {isExpanded ? 'Hide details' : 'View details'}
                    </button>
                    <button onClick={() => deleteRequest(req.id)} disabled={hasMatch}
                      className="flex-1 btn-danger disabled:opacity-30 disabled:cursor-not-allowed">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <>
                    <div className="perf" />
                    <div className="bg-surface-sunken p-4 space-y-4">

                      <div>
                        <p className="text-label text-ink-muted mb-3">Item details</p>

                        {req.description && (
                          <div className="bg-surface rounded-md p-4 border border-line mb-3">
                            <p className="text-body-s text-ink-subtle mb-1">Description</p>
                            <p className="text-body-m text-ink-900 leading-relaxed">{req.description}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-surface rounded-md p-3 border border-line">
                            <p className="text-body-s text-ink-subtle mb-1 flex items-center gap-1">
                              <MapPin size={10} /> Route
                            </p>
                            <p className="text-body-s font-semibold text-ink-900">
                              {req.from_city || req.from_code}
                            </p>
                            <p className="text-body-s text-ink-subtle">&rarr; {req.to_city || req.to_code}</p>
                          </div>
                          <div className="bg-surface rounded-md p-3 border border-line">
                            <p className="text-body-s text-ink-subtle mb-1 flex items-center gap-1">
                              <Weight size={10} /> Weight & budget
                            </p>
                            <p className="text-body-s font-semibold text-ink-900 font-mono">{req.weight_kg}kg</p>
                            <p className="text-body-s text-ink-subtle font-mono">${req.budget_per_kg}/kg</p>
                          </div>
                          {req.needed_by && (
                            <div className="bg-surface rounded-md p-3 border border-line">
                              <p className="text-body-s text-ink-subtle mb-1 flex items-center gap-1">
                                <Calendar size={10} /> Needed by
                              </p>
                              <p className="text-body-s font-semibold text-ink-900 font-mono">
                                {new Date(req.needed_by).toLocaleDateString('en-GB', {
                                  day: '2-digit', month: '2-digit', year: 'numeric'
                                })}
                              </p>
                            </div>
                          )}
                          <div className="bg-surface rounded-md p-3 border border-line">
                            <p className="text-body-s text-ink-subtle mb-1">Posted</p>
                            <p className="text-body-s font-semibold text-ink-900 font-mono">
                              {new Date(req.created_at).toLocaleDateString('en-GB', {
                                day: '2-digit', month: '2-digit', year: 'numeric'
                              })}
                            </p>
                          </div>
                        </div>

                        {req.notes && (
                          <div className="bg-surface rounded-md p-3 border border-line mt-3">
                            <p className="text-body-s text-ink-subtle mb-1">Notes</p>
                            <p className="text-body-m text-ink-900 italic">"{req.notes}"</p>
                          </div>
                        )}
                      </div>

                      <div className="bg-surface rounded-md p-4 border border-line">
                        <p className="text-label text-ink-muted mb-3">Budget & size</p>
                        <div className="space-y-1.5 text-body-s font-mono">
                          <div className="flex justify-between text-ink-600">
                            <span>Total weight</span>
                            <span className="font-semibold">{req.weight_kg}kg</span>
                          </div>
                          {req.item_dimensions && (
                            <div className="flex justify-between text-ink-600">
                              <span>Dimensions</span>
                              <span className="font-semibold">{req.item_dimensions}</span>
                            </div>
                          )}
                          {req.max_budget ? (
                            <div className="flex justify-between font-bold text-ink-900 border-t border-line pt-1.5">
                              <span>Maximum budget</span>
                              <span>{req.budget_currency || 'USD'} {parseFloat(req.max_budget).toFixed(2)}</span>
                            </div>
                          ) : (
                            <div className="flex justify-between text-ink-subtle italic border-t border-line pt-1.5">
                              <span>Budget</span>
                              <span>Open to offers — negotiate in chat</span>
                            </div>
                          )}
                          {req.requires_purchase && req.purchase_price && (
                            <div className="flex justify-between text-ink-600">
                              <span>Purchase price estimate</span>
                              <span className="font-semibold">
                                {req.purchase_currency || 'USD'} {parseFloat(req.purchase_price).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="text-body-s text-ink-subtle italic mt-3">
                          Final deal price agreed between you and the traveller in chat.
                        </p>
                      </div>

                      {req.requires_purchase && (
                        <div className="bg-info-50 rounded-md p-4 border border-info-100">
                          <p className="text-label text-info-500 mb-3 flex items-center gap-1.5">
                            <ShoppingBag size={13} /> Shop & Ship purchase details
                          </p>
                          <div className="space-y-2.5">
                            {req.purchase_store && (
                              <div className="flex items-start gap-2">
                                <MapPin size={13} className="text-info-400 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-body-s text-info-500 mb-0.5">Store</p>
                                  <p className="text-body-m font-semibold text-ink-900">{req.purchase_store}</p>
                                </div>
                              </div>
                            )}
                            {req.purchase_price && (
                              <div className="flex items-start gap-2">
                                <DollarSign size={13} className="text-info-400 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-body-s text-info-500 mb-0.5">Expected price</p>
                                  <p className="text-body-m font-semibold text-ink-900 font-mono">
                                    ${parseFloat(req.purchase_price).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            )}
                            {req.purchase_url && (
                              <div className="flex items-start gap-2">
                                <Link size={13} className="text-info-400 flex-shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                  <p className="text-body-s text-info-500 mb-0.5">Product link</p>
                                  <a href={req.purchase_url} target="_blank" rel="noreferrer"
                                    className="text-body-m font-semibold text-ink-900 hover:text-ink-700 underline truncate block">
                                    {req.purchase_url}
                                  </a>
                                </div>
                              </div>
                            )}
                            {req.purchase_details && (
                              <div className="bg-surface rounded-md p-3 mt-1 border border-info-100">
                                <p className="text-body-s text-info-500 mb-1">Product specifications</p>
                                <p className="text-body-s text-ink-900 leading-relaxed">{req.purchase_details}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {isLoadingDeal ? (
                        <div className="flex items-center justify-center py-6">
                          <div className="w-6 h-6 border-2 border-ink-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : deal ? (
                        <div>
                          <p className="text-label text-ink-muted mb-3">
                            Current deal
                          </p>
                          <div className="bg-surface rounded-md border border-line overflow-hidden">

                            <div className={`px-4 py-2.5 text-label font-semibold flex items-center gap-2 ${
                              deal.status === 'in_escrow' ? 'bg-success-tint text-success' :
                              deal.status === 'proof_uploaded' ? 'bg-accent-tint text-accent' :
                              deal.status === 'terms_agreed' ? 'bg-ink-100 text-content-muted' :
                              'bg-warning-tint text-warning'
                            }`}>
                              {deal.status === 'in_escrow' ? 'Escrow active — payment secured' :
                               deal.status === 'proof_uploaded' ? 'Proof submitted by traveller' :
                               deal.status === 'terms_agreed' ? 'Terms agreed — awaiting escrow' :
                               'Deal accepted — negotiating terms'}
                            </div>

                            <div className="p-4 space-y-3">
                              {deal.traveler && (
                                <div className="flex items-center gap-3 p-3 bg-surface-sunken rounded-md border border-line">
                                  <div className="w-11 h-11 rounded-avatar bg-ink-900 flex items-center justify-center text-body-s font-mono font-semibold text-paper-100 flex-shrink-0 overflow-hidden">
                                    {getTravelerAvatar(deal.traveler)
                                      ? <img src={getTravelerAvatar(deal.traveler)} alt="" className="w-full h-full object-cover" />
                                      : getInitials(deal.traveler.full_name)
                                    }
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-body-s font-semibold text-ink-900">{deal.traveler.full_name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <RatingDisplay rating={deal.traveler?.rating} totalReviews={deal.traveler?.total_reviews} qualifier="New traveller" />
                                      {deal.traveler.verified && (
                                        <span className="badge badge-green"><Shield size={9} /> ID verified</span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="badge badge-gray"><Plane size={9} /> Traveller</span>
                                </div>
                              )}

                              {deal.flight && (
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="bg-surface-sunken rounded-md p-3 border border-line">
                                    <p className="text-body-s text-ink-subtle mb-1 flex items-center gap-1">
                                      <Plane size={10} /> Flight
                                    </p>
                                    <p className="text-body-s font-semibold text-ink-900 font-mono">
                                      {deal.flight.from_code} &rarr; {deal.flight.to_code}
                                    </p>
                                    <p className="text-body-s text-ink-muted">{deal.flight.airline}</p>
                                    <p className="text-body-s text-ink-900 font-mono font-semibold mt-1">
                                      {new Date(deal.flight.flight_date).toLocaleDateString('en-GB', {
                                        day: '2-digit', month: '2-digit', year: 'numeric'
                                      })}
                                    </p>
                                  </div>
                                  <div className="bg-ink-100 rounded-md p-3">
                                    <p className="text-body-s text-ink-subtle mb-1 flex items-center gap-1">
                                      <DollarSign size={10} /> Agreed deal
                                    </p>
                                    <p className="text-body-s font-bold text-ink-900 font-mono">
                                      ${((deal.agreed_price_per_kg || deal.flight.price_per_kg) * req.weight_kg).toFixed(2)}
                                    </p>
                                    <p className="text-body-s text-ink-muted font-mono">
                                      ${deal.agreed_price_per_kg || deal.flight.price_per_kg}/kg
                                    </p>
                                  </div>
                                </div>
                              )}

                              {deal.agreed_notes && (
                                <div className="bg-surface-sunken rounded-md p-3 border border-line">
                                  <p className="text-body-s text-ink-subtle mb-1">Deal notes</p>
                                  <p className="text-body-s text-ink-900 italic">"{deal.agreed_notes}"</p>
                                </div>
                              )}

                              {req.handover_type === 'trusted_person' && req.trusted_person_name && (
                                <div className="bg-info-50 rounded-md p-3 border border-info-100">
                                  <p className="text-label text-info-500 mb-2 flex items-center gap-1.5">
                                    <User size={12} /> Handover contact
                                  </p>
                                  <div className="space-y-1 text-body-s">
                                    <p className="text-ink-900 font-semibold">{req.trusted_person_name}</p>
                                    <p className="text-ink-muted flex items-center gap-1"><Phone size={10} /> {req.trusted_person_phone}</p>
                                    {req.trusted_person_location && (
                                      <p className="text-ink-muted flex items-center gap-1">
                                        <MapPin size={10} /> {req.trusted_person_location}
                                      </p>
                                    )}
                                    {req.trusted_person_notes && (
                                      <p className="text-ink-subtle italic">{req.trusted_person_notes}</p>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center gap-3 text-body-s">
                                <span className={`flex items-center gap-1 font-semibold ${
                                  deal.traveler_completed ? 'text-success' : 'text-ink-300'
                                }`}>
                                  {deal.traveler_completed ? <CheckCircle size={12} /> : <Clock size={12} />}
                                  Traveller confirmed
                                </span>
                                <span className={`flex items-center gap-1 font-semibold ${
                                  deal.shipper_completed ? 'text-success' : 'text-ink-300'
                                }`}>
                                  {deal.shipper_completed ? <CheckCircle size={12} /> : <Clock size={12} />}
                                  Sender confirmed
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : hasMatch ? (
                        <div className="bg-surface rounded-md p-4 text-center text-body-s text-ink-subtle border border-line">
                          Loading deal details…
                        </div>
                      ) : null}
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

export default MyRequests;
