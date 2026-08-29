import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import AirportSearch from './AirportSearch';

// Route picker, docs/BRAND.md §7.4 — From/To in one bordered block with a
// swap control between them. The swap button sits in its own row with a
// negative margin rather than being absolutely positioned, so it can't
// collide with either field's open results dropdown.
const RoutePicker = ({ from, to, onFromChange, onToChange, onSwap, fromLabel = 'From', toLabel = 'To' }) => (
  <div className="border border-line-strong rounded-lg p-3 bg-surface space-y-1">
    <AirportSearch label={fromLabel} value={from} onChange={onFromChange}
      placeholder="Search city, airport or code..." />
    <div className="flex justify-end -my-1 relative z-10">
      <button type="button" onClick={onSwap} aria-label="Swap origin and destination"
        className="w-9 h-9 rounded-full bg-surface border border-line-strong flex items-center justify-center
          hover:border-ink-900 hover:bg-surface-sunken transition shadow-elev-1">
        <ArrowUpDown size={16} className="text-ink-700" />
      </button>
    </div>
    <AirportSearch label={toLabel} value={to} onChange={onToChange}
      placeholder="Search city, airport or code..." />
  </div>
);

export default RoutePicker;
