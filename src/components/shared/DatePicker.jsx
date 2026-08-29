import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

// Date picker, docs/BRAND.md §7.5 — trigger reads like a formatted date
// (mono), panel is a month grid with past dates disabled rather than
// hidden. Replaces the native <input type="date"> used in AddFlight/
// NewRequest, which couldn't match the design system's own styling.
const fmt = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DatePicker = ({ label, value, onChange, min, helper }) => {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => (value ? new Date(`${value}T00:00:00`) : new Date()));
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const minDate = min ? new Date(`${min}T00:00:00`) : null;
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))];

  const select = (d) => { onChange(toISO(d)); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      {label && <label className="block text-label text-content-muted mb-1.5 uppercase">{label}</label>}
      <button type="button" onClick={() => setOpen(o => !o)}
        className="input-field pl-9 relative text-left flex items-center">
        <CalendarIcon size={15} className="absolute left-3.5 text-ink-400 pointer-events-none" />
        <span className={`font-mono ${selected ? 'text-ink-900' : 'text-ink-400'}`}>
          {selected ? fmt(selected) : 'Select date'}
        </span>
      </button>
      {open && (
        <div className="absolute z-tooltip mt-1 w-72 bg-surface border border-line rounded-lg shadow-elev-2 p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-sunken">
              <ChevronLeft size={16} />
            </button>
            <p className="font-display font-semibold text-body-s text-ink-900">
              {viewMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </p>
            <button type="button" onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-sunken">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="w-9 h-6 flex items-center justify-center text-micro text-ink-subtle font-mono">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="w-9 h-9" />;
              const disabled = minDate && d < minDate;
              const isSelected = selected && d.toDateString() === selected.toDateString();
              return (
                <button key={i} type="button" disabled={disabled} onClick={() => select(d)}
                  className={`w-9 h-9 rounded-sm text-body-s font-mono flex items-center justify-center transition
                    ${isSelected ? 'bg-brand text-white font-semibold'
                      : disabled ? 'text-ink-200 cursor-not-allowed'
                        : 'text-ink-900 hover:bg-surface-sunken'}`}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {helper && <p className="text-micro text-ink-subtle mt-1.5">{helper}</p>}
    </div>
  );
};

export default DatePicker;
