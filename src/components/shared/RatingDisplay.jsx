import React from 'react';
import { Star } from 'lucide-react';

// Rating display, docs/BRAND.md §7.11 — one star, never five, red below
// 3.0, low-review-count qualifier instead of a bare unearned score.
// `qualifier` differs by context (a traveller counterpart on a match vs.
// your own overall standing on Profile) — pass it explicitly.
const RatingDisplay = ({ rating, totalReviews = 0, size = 14, qualifier = 'New member', onClick }) => {
  if (!rating || rating <= 0) {
    return <span className="text-micro text-ink-subtle">No ratings yet</span>;
  }
  const lowRep = totalReviews < 3;
  const content = (
    <>
      <Star size={size} className="text-ink-900 fill-ink-900" />
      <span className={`font-mono text-num-m font-semibold ${rating < 3 ? 'text-danger' : 'text-ink-900'}`}>
        {rating.toFixed(1)}
      </span>
      <span className={`text-micro ${onClick ? 'underline underline-offset-2' : ''} text-ink-subtle`}>({totalReviews})</span>
      {lowRep && <span className="text-micro text-ink-subtle">· {qualifier}</span>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:opacity-70 transition">
      {content}
    </button>
  ) : (
    <span className="inline-flex items-center gap-1">{content}</span>
  );
};

export default RatingDisplay;
