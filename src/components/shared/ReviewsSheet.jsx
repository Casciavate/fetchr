import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import BottomSheet from './BottomSheet';
import EmptyState from './EmptyState';
import { RowSkeleton } from './Skeleton';

// All reviews for one user — the same query Profile.jsx's own
// fetchReceivedReviews runs, parameterized so any boarding-pass screen
// can open it for whichever person the reader tapped.
const ReviewsSheet = ({ userId, userName, onClose }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey(full_name)')
        .eq('reviewee_id', userId)
        .order('created_at', { ascending: false });
      if (active) { setReviews(data || []); setLoading(false); }
    })();
    return () => { active = false; };
  }, [userId]);

  return (
    <BottomSheet title={userName ? `Reviews · ${userName}` : 'Reviews'} onClose={onClose}
      footer={<button onClick={onClose} className="w-full btn-secondary">Close</button>}>
      <div className="p-5 space-y-3">
        {loading ? (
          <><RowSkeleton /><RowSkeleton /></>
        ) : reviews.length === 0 ? (
          <EmptyState icon={Star} title="No reviews yet" compact />
        ) : reviews.map(r => (
          <div key={r.id} className="bg-surface-sunken border border-line rounded-md p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-body-s font-semibold text-ink-900">{r.reviewer?.full_name || 'User'}</p>
              <span className="inline-flex items-center gap-1">
                <Star size={12} className="text-ink-900 fill-ink-900" />
                <span className="font-mono text-label font-semibold text-ink-900">{r.rating.toFixed(1)}</span>
              </span>
            </div>
            <p className="text-micro text-content-subtle mb-1">
              {new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
            {r.comment && <p className="text-body-s text-content-muted italic">"{r.comment}"</p>}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
};

export default ReviewsSheet;
