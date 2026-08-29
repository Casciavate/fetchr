import React, { useRef, useState } from 'react';

// Horizontal swipeable stack of boarding-pass cards — native scroll-snap
// (no drag-physics to reimplement). Each card is ~88% width so the next
// one peeks, reading as a stacked deck; a dot pager tracks position.
// Renders the single card with no carousel chrome when there's only one.
const CardStack = ({ items, renderItem, keyFn }) => {
  const scrollRef = useRef(null);
  const [active, setActive] = useState(0);

  if (!items || items.length === 0) return null;
  if (items.length === 1) return <>{renderItem(items[0], 0)}</>;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div>
      <div ref={scrollRef} onScroll={onScroll}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4 no-scrollbar">
        {items.map((item, i) => (
          <div key={keyFn ? keyFn(item, i) : i} className="snap-center shrink-0 w-[88%]">
            {renderItem(item, i)}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-3">
        {items.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-4 bg-ink-900' : 'w-1.5 bg-ink-200'}`} />
        ))}
      </div>
    </div>
  );
};

export default CardStack;
