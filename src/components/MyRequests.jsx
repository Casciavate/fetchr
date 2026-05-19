import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Package, Trash2, Plus, AlertTriangle, CheckCircle,
  MapPin, Weight, DollarSign, Calendar, ShoppingBag,
  Link, ChevronDown, ChevronUp, User, Phone, Shield,
  Plane, Star, Clock, X
} from 'lucide-react';

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

  const getStatusBadge = (req) => {
    const status = requestStatuses[req.id];
    if (status === 'in_escrow') return <span className="badge badge-blue">🔒 Escrow Active</span>;
    if (status === 'proof_uploaded') return <span className="badge badge-purple">📸 Proof Uploaded</span>;
    if (status === 'terms_agreed') return <span className="badge badge-yellow">✅ Terms Agreed</span>;
    if (status === 'accepted') return <span className="badge badge-yellow">🤝 Deal Accepted</span>;
    return <span className="badge badge-green">✅ Open</span>;
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
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Requests</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {requests.length} active request{requests.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={onNewRequest} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Request
        </button>
      </div>

      {/* Platform liability notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Shield size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-amber-800 mb-0.5">Platform Liability Notice</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Fetchr is a matchmaking and secure payment platform only. All transactions, item legality, and delivery arrangements are solely between the traveler and shipper. Fetchr bears no liability for items transported, customs issues, or delivery disputes. Users accept full legal responsibility for their shipments.
          </p>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl shadow-card border border-gray-100/80">
          <div className="w-20 h-20 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package size={32} className="text-violet-300" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">No requests yet</h2>
          <p className="text-gray-400 text-sm mb-6">Post a shipment request to find a traveler</p>
          <button onClick={onNewRequest} className="btn-primary">+ Post First Request</button>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(req => {
            const isExpanded = expandedId === req.id;
            const hasMatch = hasActiveMatch(req.id);
            const deal = dealDetails[req.id];
            const isLoadingDeal = loadingDeal[req.id];

            return (
              <div key={req.id}
                className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden hover:shadow-card-hover transition-all duration-300">

                {/* Main content */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      {/* Item photo — object-contain to scale to fit */}
                      {req.item_photo_url ? (
                        <div className="w-14 h-14 rounded-xl overflow-hidden border border-gray-100 flex-shrink-0 bg-gray-50 flex items-center justify-center">
                          <img
                            src={req.item_photo_url}
                            alt={req.item_name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-14 h-14 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Package size={22} className="text-violet-400" />
                        </div>
                      )}
                      <div>
                        <p className="text-lg font-bold text-gray-900">{req.item_name}</p>
                        <p className="text-sm text-gray-400 mt-0.5">{req.category}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="badge badge-gray text-xs">
                            {req.from_code} → {req.to_code}
                          </span>
                          {req.requires_purchase && (
                            <span className="badge badge-blue text-xs">
                              <ShoppingBag size={9} /> Shop & Ship
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {getStatusBadge(req)}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">Weight</p>
                      <p className="text-base font-bold text-gray-900">{req.weight_kg}kg</p>
                    </div>
                    <div className="bg-violet-50 rounded-xl p-3 text-center border border-violet-100">
                      <p className="text-xs text-gray-400 mb-1">Budget</p>
                      <p className="text-base font-bold text-violet-700">${req.budget_per_kg}/kg</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">Est. Total</p>
                      <p className="text-base font-bold text-gray-900">
                        ~${(req.weight_kg * req.budget_per_kg).toFixed(0)}
                      </p>
                    </div>
                  </div>

                  {hasMatch && (
                    <div className="flex items-start gap-2 bg-blue-50 rounded-xl p-3 mb-4 border border-blue-100">
                      <AlertTriangle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-700">Active deal in progress — cannot delete until complete.</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => handleExpand(req.id)}
                      className="flex-1 btn-secondary py-2.5 text-sm flex items-center justify-center gap-2">
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      {isExpanded ? 'Hide Details' : 'View Details'}
                    </button>
                    <button onClick={() => deleteRequest(req.id)} disabled={hasMatch}
                      className="flex-1 flex items-center justify-center gap-2 border border-red-100 text-red-400 rounded-xl py-2.5 text-sm font-semibold hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50 p-5 space-y-4">

                    {/* ── Item details ── */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Item Details</p>

                      {req.description && (
                        <div className="bg-white rounded-xl p-4 border border-gray-100 mb-3">
                          <p className="text-xs text-gray-400 mb-1">Description</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{req.description}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white rounded-xl p-3 border border-gray-100">
                          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                            <MapPin size={10} /> Route
                          </p>
                          <p className="text-sm font-bold text-gray-900">
                            {req.from_city || req.from_code}
                          </p>
                          <p className="text-xs text-gray-400">→ {req.to_city || req.to_code}</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-gray-100">
                          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                            <Weight size={10} /> Weight & Budget
                          </p>
                          <p className="text-sm font-bold text-gray-900">{req.weight_kg}kg</p>
                          <p className="text-xs text-gray-400">${req.budget_per_kg}/kg</p>
                        </div>
                        {req.needed_by && (
                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                              <Calendar size={10} /> Needed By
                            </p>
                            <p className="text-sm font-bold text-gray-900">
                              {new Date(req.needed_by).toLocaleDateString('en-GB', {
                                day: '2-digit', month: '2-digit', year: 'numeric'
                              })}
                            </p>
                          </div>
                        )}
                        <div className="bg-white rounded-xl p-3 border border-gray-100">
                          <p className="text-xs text-gray-400 mb-1">Posted</p>
                          <p className="text-sm font-bold text-gray-900">
                            {new Date(req.created_at).toLocaleDateString('en-GB', {
                              day: '2-digit', month: '2-digit', year: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>

                      {req.notes && (
                        <div className="bg-white rounded-xl p-3 border border-gray-100 mt-3">
                          <p className="text-xs text-gray-400 mb-1">Notes</p>
                          <p className="text-sm text-gray-700 italic">"{req.notes}"</p>
                        </div>
                      )}
                    </div>

                    {/* ── Indicative escrow ── */}
                    <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
                      <p className="text-xs font-bold text-violet-700 mb-1">
                        Indicative Escrow Amount
                      </p>
                      <p className="text-xs text-violet-500 italic mb-3">
                        This is an estimate only. The final amount is agreed between you and the traveler during negotiation in chat.
                      </p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between text-gray-600">
                          <span>Shipping ({req.weight_kg}kg × ${req.budget_per_kg})</span>
                          <span className="font-semibold">
                            ${(req.weight_kg * req.budget_per_kg).toFixed(2)}
                          </span>
                        </div>
                        {req.requires_purchase && req.purchase_price && (
                          <div className="flex justify-between text-gray-600">
                            <span>Item purchase price</span>
                            <span className="font-semibold">
                              ${parseFloat(req.purchase_price).toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-gray-400 italic">
                          <span>Fetchr service fees</span>
                          <span>calculated at checkout</span>
                        </div>
                        <div className="flex justify-between font-bold text-violet-700 border-t border-violet-200 pt-1.5">
                          <span>Minimum estimate</span>
                          <span>
                            ~${(
                              req.weight_kg * req.budget_per_kg +
                              (req.requires_purchase ? parseFloat(req.purchase_price || 0) : 0)
                            ).toFixed(2)}+
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ── Shop & Ship details ── */}
                    {req.requires_purchase && (
                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <p className="text-xs font-bold text-blue-700 mb-3 flex items-center gap-1.5">
                          <ShoppingBag size={13} /> Shop & Ship Purchase Details
                        </p>
                        <div className="space-y-2.5">
                          {req.purchase_store && (
                            <div className="flex items-start gap-2">
                              <MapPin size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs text-blue-500 mb-0.5">Store</p>
                                <p className="text-sm font-semibold text-gray-800">{req.purchase_store}</p>
                              </div>
                            </div>
                          )}
                          {req.purchase_price && (
                            <div className="flex items-start gap-2">
                              <DollarSign size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs text-blue-500 mb-0.5">Expected price</p>
                                <p className="text-sm font-semibold text-gray-800">
                                  ${parseFloat(req.purchase_price).toFixed(2)}
                                </p>
                              </div>
                            </div>
                          )}
                          {req.purchase_url && (
                            <div className="flex items-start gap-2">
                              <Link size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <p className="text-xs text-blue-500 mb-0.5">Product link</p>
                                <a href={req.purchase_url} target="_blank" rel="noreferrer"
                                  className="text-sm font-semibold text-violet-600 hover:text-violet-700 underline truncate block">
                                  {req.purchase_url}
                                </a>
                              </div>
                            </div>
                          )}
                          {req.purchase_details && (
                            <div className="bg-white rounded-lg p-3 mt-1 border border-blue-100">
                              <p className="text-xs text-blue-500 mb-1">Product specifications</p>
                              <p className="text-xs text-gray-700 leading-relaxed">{req.purchase_details}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Current deal details ── */}
                    {isLoadingDeal ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : deal ? (
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                          Current Deal
                        </p>
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

                          {/* Deal stage */}
                          <div className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 ${
                            deal.status === 'in_escrow' ? 'bg-blue-50 text-blue-700' :
                            deal.status === 'proof_uploaded' ? 'bg-indigo-50 text-indigo-700' :
                            deal.status === 'terms_agreed' ? 'bg-violet-50 text-violet-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            <span>
                              {deal.status === 'in_escrow' ? '🔒' :
                               deal.status === 'proof_uploaded' ? '📸' :
                               deal.status === 'terms_agreed' ? '✅' : '🤝'}
                            </span>
                            {deal.status === 'in_escrow' ? 'Escrow Active — payment secured' :
                             deal.status === 'proof_uploaded' ? 'Proof submitted by traveler' :
                             deal.status === 'terms_agreed' ? 'Terms agreed — awaiting escrow' :
                             'Deal accepted — negotiating terms'}
                          </div>

                          <div className="p-4 space-y-3">
                            {/* Traveler info */}
                            {deal.traveler && (
                              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-600 flex-shrink-0 overflow-hidden">
                                  {getTravelerAvatar(deal.traveler)
                                    ? <img src={getTravelerAvatar(deal.traveler)} alt="" className="w-full h-full object-cover" />
                                    : getInitials(deal.traveler.full_name)
                                  }
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-bold text-gray-900">{deal.traveler.full_name}</p>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {deal.traveler.rating > 0 ? (
                                      <>
                                        {[1,2,3,4,5].map(s => (
                                          <Star key={s} size={11}
                                            className={s <= Math.round(deal.traveler.rating)
                                              ? 'text-amber-400 fill-amber-400'
                                              : 'text-gray-200'} />
                                        ))}
                                        <span className="text-xs text-gray-500 ml-0.5">
                                          {deal.traveler.rating.toFixed(1)}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-xs text-gray-400">New member</span>
                                    )}
                                    {deal.traveler.verified && (
                                      <span className="badge badge-blue ml-1"><Shield size={9} /> Verified</span>
                                    )}
                                  </div>
                                </div>
                                <span className="badge badge-purple text-xs">✈️ Traveler</span>
                              </div>
                            )}

                            {/* Flight info */}
                            {deal.flight && (
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                  <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                                    <Plane size={10} /> Flight
                                  </p>
                                  <p className="text-sm font-bold text-gray-900">
                                    {deal.flight.from_code} → {deal.flight.to_code}
                                  </p>
                                  <p className="text-xs text-gray-500">{deal.flight.airline}</p>
                                  <p className="text-xs text-violet-600 font-semibold mt-1">
                                    {new Date(deal.flight.flight_date).toLocaleDateString('en-GB', {
                                      day: '2-digit', month: '2-digit', year: 'numeric'
                                    })}
                                  </p>
                                </div>
                                <div className="bg-violet-50 rounded-xl p-3 border border-violet-100">
                                  <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                                    <DollarSign size={10} /> Agreed Deal
                                  </p>
                                  <p className="text-sm font-bold text-violet-700">
                                    ${((deal.agreed_price_per_kg || deal.flight.price_per_kg) * req.weight_kg).toFixed(2)}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    ${deal.agreed_price_per_kg || deal.flight.price_per_kg}/kg
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Agreed notes */}
                            {deal.agreed_notes && (
                              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                <p className="text-xs text-gray-400 mb-1">Deal Notes</p>
                                <p className="text-xs text-gray-700 italic">"{deal.agreed_notes}"</p>
                              </div>
                            )}

                            {/* Completion status */}
                            <div className="flex items-center gap-3 text-xs">
                              <span className={`flex items-center gap-1 font-semibold ${
                                deal.traveler_completed ? 'text-emerald-600' : 'text-gray-300'
                              }`}>
                                {deal.traveler_completed ? <CheckCircle size={12} /> : <Clock size={12} />}
                                Traveler confirmed
                              </span>
                              <span className={`flex items-center gap-1 font-semibold ${
                                deal.shipper_completed ? 'text-emerald-600' : 'text-gray-300'
                              }`}>
                                {deal.shipper_completed ? <CheckCircle size={12} /> : <Clock size={12} />}
                                Shipper confirmed
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : hasMatch ? (
                      <div className="bg-gray-50 rounded-xl p-4 text-center text-xs text-gray-400">
                        Loading deal details...
                      </div>
                    ) : null}
                  </div>
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