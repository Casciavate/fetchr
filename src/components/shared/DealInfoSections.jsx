import React from 'react';
import { Plane, Package, ShoppingBag, MapPin, Phone } from 'lucide-react';
import { resolvedIsPurchase } from '../../lib/fees';

// Shared read-only "what is this deal" content — route, item (incl. photo),
// Shop & Ship purchase details, handover contact — used by both Matches'
// inline "View deal details" panel and Chat's "Deal Info" modal so the two
// can never show a different set of fields for the same match. Pricing is
// deliberately NOT included here: each caller's financials section differs
// (Matches hides the other party's fee; Chat's has an amend-mode), so that
// stays owned by the caller.
export const DealInfoSections = ({ match }) => (
  <>
    {/* Route */}
    <div className="bg-surface-sunken rounded-lg p-4 border border-line">
      <p className="font-mono text-overline uppercase text-content-muted mb-3 flex items-center gap-1.5">
        <Plane size={13} /> Flight route
      </p>
      <div className="grid grid-cols-2 gap-3 text-body-s">
        <div>
          <p className="text-micro text-content-subtle mb-0.5">From</p>
          <p className="font-semibold text-ink-900">{match.flight?.from_city} ({match.flight?.from_code})</p>
        </div>
        <div>
          <p className="text-micro text-content-subtle mb-0.5">To</p>
          <p className="font-semibold text-ink-900">{match.flight?.to_city} ({match.flight?.to_code})</p>
        </div>
        <div>
          <p className="text-micro text-content-subtle mb-0.5">Airline</p>
          <p className="font-medium text-content">{match.flight?.airline}</p>
        </div>
        <div>
          <p className="text-micro text-content-subtle mb-0.5">Date</p>
          <p className="font-mono font-medium text-content">
            {match.flight?.flight_date
              ? new Date(match.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—'}
          </p>
        </div>
      </div>
    </div>

    {/* Item */}
    <div className="bg-surface-sunken rounded-lg p-4 border border-line">
      <p className="font-mono text-overline uppercase text-content-muted mb-3 flex items-center gap-1.5">
        <Package size={13} /> Shipment details
      </p>
      {match.request?.item_photo_url && (
        <div className="rounded-md overflow-hidden border border-line mb-3 bg-surface">
          <img src={match.request.item_photo_url} alt={match.request?.item_name}
            className="w-full max-h-56 object-contain" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-body-s">
        <div>
          <p className="text-micro text-content-subtle mb-0.5">Item</p>
          <p className="font-semibold text-ink-900">{match.request?.item_name}</p>
        </div>
        <div>
          <p className="text-micro text-content-subtle mb-0.5">Category</p>
          <p className="font-medium text-content">{match.request?.category}</p>
        </div>
        <div>
          <p className="text-micro text-content-subtle mb-0.5">Weight</p>
          <p className="font-mono font-semibold text-ink-900">{match.agreed_weight_kg || match.request?.weight_kg} kg</p>
        </div>
        {match.luggage_type && (
          <div>
            <p className="text-micro text-content-subtle mb-0.5">Luggage allowance</p>
            <p className="font-medium text-content">{match.luggage_type === 'carry_on' ? 'Hand luggage' : 'Check-in luggage'}</p>
          </div>
        )}
        {match.request?.item_dimensions && (
          <div>
            <p className="text-micro text-content-subtle mb-0.5">Dimensions</p>
            <p className="font-medium text-content">{match.request.item_dimensions}</p>
          </div>
        )}
      </div>
      {match.request?.description && (
        <div className="mt-3 pt-3 border-t border-line">
          <p className="text-micro text-content-subtle mb-1">Description</p>
          <p className="text-body-s text-content-muted">{match.request.description}</p>
        </div>
      )}
    </div>

    {/* Shop & Ship */}
    {resolvedIsPurchase(match) && (
      <div className="bg-info-50 rounded-lg p-4 border border-line">
        <p className="font-mono text-overline uppercase text-info-500 mb-3 flex items-center gap-1.5">
          <ShoppingBag size={13} /> Shop & Ship details
        </p>
        <div className="space-y-2 text-body-s">
          {match.request?.purchase_store && (
            <div className="flex items-start gap-2">
              <MapPin size={13} className="text-info-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-micro text-content-subtle">Store</p>
                <p className="font-medium text-content">{match.request.purchase_store}</p>
              </div>
            </div>
          )}
          {match.request?.purchase_price && (
            <div className="flex justify-between">
              <span className="text-content-muted">Item purchase price</span>
              <span className="font-mono font-semibold text-ink-900">${parseFloat(match.request.purchase_price).toFixed(2)}</span>
            </div>
          )}
          {match.request?.purchase_url && (
            <div>
              <p className="text-micro text-content-subtle mb-0.5">Product link</p>
              <a href={match.request.purchase_url} target="_blank" rel="noreferrer"
                className="text-micro text-info-500 underline break-all">{match.request.purchase_url}</a>
            </div>
          )}
          {match.request?.purchase_details && (
            <div>
              <p className="text-micro text-content-subtle mb-0.5">Specifications</p>
              <p className="text-micro text-content-muted">{match.request.purchase_details}</p>
            </div>
          )}
        </div>
      </div>
    )}

    {/* Handover details */}
    {(match.flight?.handover_location_departure || match.flight?.handover_location_arrival || match.request?.trusted_person_name) && (
      <div className="bg-surface-sunken rounded-lg p-4 border border-line">
        <p className="font-mono text-overline uppercase text-content-muted mb-3 flex items-center gap-1.5">
          <MapPin size={13} /> Handover details
        </p>
        <div className="space-y-2 text-body-s">
          {match.flight?.handover_location_departure && (
            <div>
              <p className="text-micro text-content-subtle">Departure handover</p>
              <p className="font-medium text-content">{match.flight.handover_location_departure}</p>
            </div>
          )}
          {match.flight?.handover_location_arrival && (
            <div>
              <p className="text-micro text-content-subtle">Arrival handover</p>
              <p className="font-medium text-content">{match.flight.handover_location_arrival}</p>
            </div>
          )}
          {match.request?.trusted_person_name && (
            <div className="pt-2 border-t border-line space-y-1">
              <p className="font-mono text-overline uppercase text-content-muted">Handover contact</p>
              <p className="text-body-s font-semibold text-ink-900">{match.request.trusted_person_name}</p>
              {match.request.trusted_person_phone && (
                <p className="text-micro text-content-muted flex items-center gap-1">
                  <Phone size={11} /> {match.request.trusted_person_phone}
                </p>
              )}
              {match.request.trusted_person_location && (
                <p className="text-micro text-content-muted flex items-center gap-1">
                  <MapPin size={11} /> {match.request.trusted_person_location}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )}
  </>
);

export default DealInfoSections;
