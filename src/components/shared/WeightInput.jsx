import React from 'react';
import { Minus, Plus, Weight } from 'lucide-react';

// Weight stepper, docs/BRAND.md §7.6 — clamps rather than rejects, always
// renders one decimal ("3.0 kg", never "3 kg"), never 0 or negative.
const WeightInput = ({ label, value, onChange, min = 0.5, max = 50, step = 0.5, helper }) => {
  const num = parseFloat(value) || min;
  const clamp = v => Math.min(max, Math.max(min, v));
  const set = v => onChange(clamp(Math.round(v / step) * step).toFixed(1));

  return (
    <div>
      {label && <label className="block text-label text-content-muted mb-1.5 uppercase">{label}</label>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => set(num - step)} disabled={num <= min}
          aria-label="Decrease weight"
          className="w-11 h-11 flex-shrink-0 rounded-md border border-line-strong bg-surface-sunken
            flex items-center justify-center hover:border-ink-900 transition disabled:opacity-40 disabled:cursor-not-allowed">
          <Minus size={16} className="text-ink-700" />
        </button>
        <div className="flex-1 h-11 rounded-md border border-line-strong bg-surface-sunken
          flex items-center justify-center gap-1.5">
          <Weight size={14} className="text-ink-400" />
          <span className="font-mono text-num-l font-semibold text-ink-900">{num.toFixed(1)}</span>
          <span className="text-body-s text-ink-muted">kg</span>
        </div>
        <button type="button" onClick={() => set(num + step)} disabled={num >= max}
          aria-label="Increase weight"
          className="w-11 h-11 flex-shrink-0 rounded-md border border-line-strong bg-surface-sunken
            flex items-center justify-center hover:border-ink-900 transition disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus size={16} className="text-ink-700" />
        </button>
      </div>
      {helper && <p className="text-micro text-ink-subtle mt-1.5">{helper}</p>}
    </div>
  );
};

export default WeightInput;
