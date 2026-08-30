import React from 'react';

// Barcode strip, docs/BRAND.md §7.7 item 5 / Assumptions #8 — decorative
// today, encodes match id + route + date as text only (no scanner reads
// this yet; it's specified so a real handover code can replace it later
// without a redesign). Shared so every place a boarding pass/deal ticket
// is shown (issued or completed) renders the identical strip — this used
// to be copy-pasted per screen and Dashboard's hero ticket had none at all.
const Barcode = ({ deal }) => {
  const ref = deal.id.slice(0, 6).toUpperCase();
  const route = `${deal.flight?.from_code || '???'}${deal.flight?.to_code || '???'}`;
  const ddmmyy = deal.flight?.flight_date
    ? new Date(deal.flight.flight_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '')
    : '------';
  // Real boarding-pass barcodes (Code128-style) are packed with many thin
  // bars of varying width, not a handful of thick blocks. Deterministic
  // per deal id so the same deal always renders the same pattern.
  const code = ref + route + ddmmyy;
  const bars = Array.from({ length: 70 }, (_, i) => (code.charCodeAt(i % code.length) % 2) + 1);
  return (
    <div className="pt-4 mt-1 -mx-2">
      <div className="perf mb-3 mx-2" />
      <div className="h-[22px] flex items-stretch gap-px px-2" aria-hidden="true">
        {bars.map((w, i) => (
          <div key={i} className="bg-ink-900" style={{ flex: w, opacity: 0.82 }} />
        ))}
      </div>
      <p className="mt-1.5 text-center font-mono text-overline text-content-muted tracking-[0.28em]">
        {ref}·{route}·{ddmmyy}
      </p>
    </div>
  );
};

export default Barcode;
