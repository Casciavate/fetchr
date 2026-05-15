import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Package, Trash2, Calendar, MapPin, DollarSign, AlertTriangle } from 'lucide-react';

const MyRequests = ({ session, onNewRequest }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestStatuses, setRequestStatuses] = useState({});

 const fetchRequests = async () => {
    setLoading(true);

    // Run expiry cleanup
    await supabase.rpc('expire_old_flights');

    const { data, error } = await supabase
      .from('shipment_requests')
      .select('*')
      .eq('user_id', session.user.id)
      .in('status', ['open', 'matched']) // Only show active requests
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRequests(data);
      await checkRequestStatuses(data);
    }
    setLoading(false);
  };

  const checkRequestStatuses = async (requestsList) => {
    const statuses = {};
    for (const req of requestsList) {
      const { data: matches } = await supabase
        .from('matches')
        .select('id, status')
        .eq('request_id', req.id)
        .in('status', ['accepted', 'in_escrow']);

      if (matches && matches.length > 0) {
        const hasEscrow = matches.some(m => m.status === 'in_escrow');
        statuses[req.id] = hasEscrow ? 'in_escrow' : 'accepted';
      } else {
        statuses[req.id] = 'free';
      }
    }
    setRequestStatuses(statuses);
  };

  useEffect(() => { fetchRequests(); }, []);

  // Redirect to new request if none exist
  useEffect(() => {
    if (!loading && requests.length === 0 && onNewRequest) {
      onNewRequest();
    }
  }, [loading, requests]);

  const deleteRequest = async (req) => {
    const status = requestStatuses[req.id];

    if (status === 'in_escrow') {
      alert('❌ This request has an active escrow payment. You must cancel the deal and get a refund via chat before deleting.');
      return;
    }
    if (status === 'accepted') {
      alert('❌ This request has an accepted deal. Both parties must agree to cancel via chat before you can delete it.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this request?')) {
      const { error } = await supabase
        .from('shipment_requests')
        .delete()
        .eq('id', req.id)
        .eq('user_id', session.user.id);

      if (error) alert('Failed to delete: ' + error.message);
      else setRequests(requests.filter(r => r.id !== req.id));
    }
  };

  const getStatusBadge = (reqId) => {
    const status = requestStatuses[reqId];
    if (status === 'in_escrow') return (
      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-600">
        🔒 Escrow Active
      </span>
    );
    if (status === 'accepted') return (
      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-yellow-50 text-yellow-600">
        🤝 Deal Accepted
      </span>
    );
    return (
      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-600">
        Open
      </span>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-gray-400 text-sm">Loading your requests...</p>
    </div>
  );

  if (requests.length === 0) return null;

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">My Requests</h1>
          <p className="text-gray-400 text-sm mt-1">{requests.length} request{requests.length !== 1 ? 's' : ''} posted</p>
        </div>
        {onNewRequest && (
          <button onClick={onNewRequest}
            className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700 transition">
            + New Request
          </button>
        )}
      </div>

      <div className="space-y-4">
        {requests.map(req => (
          <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">

            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                {req.item_photo_url ? (
                  <img src={req.item_photo_url} alt={req.item_name}
                    className="w-14 h-14 rounded-xl object-cover border border-gray-100 flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Package size={22} className="text-purple-400" />
                  </div>
                )}
                <div>
                  <p className="font-bold text-gray-800">{req.item_name}</p>
                  {req.item_description && (
                    <p className="text-xs text-gray-400 mt-0.5 max-w-sm">{req.item_description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {getStatusBadge(req.id)}
                <button
                  onClick={() => deleteRequest(req)}
                  className={`p-2 rounded-lg transition ${
                    requestStatuses[req.id] === 'free'
                      ? 'hover:bg-red-50'
                      : 'opacity-40 cursor-not-allowed'
                  }`}
                  title={requestStatuses[req.id] !== 'free' ? 'Cannot delete — active deal exists' : 'Delete request'}
                >
                  <Trash2 size={15} className={requestStatuses[req.id] === 'free' ? 'text-red-400' : 'text-gray-300'} />
                </button>
              </div>
            </div>

            {/* Warning banner */}
            {requestStatuses[req.id] !== 'free' && (
              <div className={`flex items-start gap-2 rounded-xl p-3 mb-3 text-xs ${
                requestStatuses[req.id] === 'in_escrow'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-yellow-50 text-yellow-700'
              }`}>
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <p>
                  {requestStatuses[req.id] === 'in_escrow'
                    ? 'This request has an active escrow payment. To cancel, both parties must agree via chat and the escrow must be refunded first.'
                    : 'This request has an accepted deal. Both parties must agree to cancel via chat before this can be deleted.'}
                </p>
              </div>
            )}

            <div className="grid grid-cols-4 gap-3">
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                <MapPin size={14} className="text-purple-400" />
                <div>
                  <p className="text-xs text-gray-400">From</p>
                  <p className="text-sm font-semibold text-gray-700">{req.from_city}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                <MapPin size={14} className="text-purple-400" />
                <div>
                  <p className="text-xs text-gray-400">To</p>
                  <p className="text-sm font-semibold text-gray-700">{req.to_city}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                <Package size={14} className="text-purple-400" />
                <div>
                  <p className="text-xs text-gray-400">Weight</p>
                  <p className="text-sm font-semibold text-gray-700">{req.weight_kg} kg</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                <DollarSign size={14} className="text-purple-400" />
                <div>
                  <p className="text-xs text-gray-400">Budget/kg</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {req.budget_per_kg ? `$${req.budget_per_kg}` : 'Flexible'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs bg-purple-50 text-purple-600 px-3 py-1 rounded-full font-medium">
                {req.category}
              </span>
              {req.needed_by && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Calendar size={12} />
                  Needed by {new Date(req.needed_by).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyRequests;