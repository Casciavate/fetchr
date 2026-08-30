import React, { useRef, useState, useEffect } from 'react';

// Horizontal swipeable stack of boarding-pass cards — native scroll-snap
// (no drag-physics to reimplement). Each card is ~88% width so the next
// one peeks, reading as a stacked deck; a dot pager tracks position.
// Renders the single card with no carousel chrome when there's only one.
// `onActiveChange(item, index)` fires whenever the centered card changes
// (swipe, or a click on a peeking card scrolling it into view) — lets a
// parent keep some other section of the page in sync with the selection.
const CardStack = ({ items, renderItem, keyFn, onActiveChange }) => {
  const scrollRef = useRef(null);
  const [active, setActive] = useState(0);
  const soleKey = items && items.length === 1 ? (keyFn ? keyFn(items[0], 0) : 0) : null;

  // Single-item case still needs to report itself as "active" once, so a
  // parent driving a synced section below doesn't have to special-case it.
  useEffect(() => {
    if (soleKey !== null) onActiveChange?.(items[0], 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soleKey]);

  // Multi-item case: report card 0 as active on first mount too, before
  // any scroll/click has happened.
  const firstKey = items && items.length > 1 ? (keyFn ? keyFn(items[0], 0) : items[0]) : null;
  useEffect(() => {
    if (firstKey !== null) { setActive(0); onActiveChange?.(items[0], 0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey]);

  if (!items || items.length === 0) return null;
  if (items.length === 1) return <>{renderItem(items[0], 0)}</>;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setActive(i);
    onActiveChange?.(items[i], i);
  };

  const selectCard = (i) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    setActive(i);
    onActiveChange?.(items[i], i);
  };

  return (
    <div>
      <div ref={scrollRef} onScroll={onScroll}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4 no-scrollbar">
        {items.map((item, i) => (
          <div key={keyFn ? keyFn(item, i) : i}
            onClick={() => { if (i !== active) selectCard(i); }}
            className="snap-center shrink-0 w-[88%]">
            {renderItem(item, i)}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-3">
        {items.map((_, i) => (
          <button key={i} onClick={() => selectCard(i)} aria-label={`Go to card ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${i === active ? 'w-4 bg-ink-900' : 'w-1.5 bg-ink-200'}`} />
        ))}
      </div>
    </div>
  );
};

export default CardStack;
