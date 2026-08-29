import React from 'react';
import { BadgeCheck, AlertCircle } from 'lucide-react';

// Verification badge, docs/BRAND.md §7.10 — never icon-only, never a
// colour below full ID verification.
const VerificationBadge = ({ verified }) => verified ? (
  <span className="inline-flex items-center gap-1 bg-success-tint text-success rounded-sm px-1.5 py-0.5 text-overline uppercase font-mono"
    aria-label="Identity verified">
    <BadgeCheck size={12} /> ID verified
  </span>
) : (
  <span className="inline-flex items-center gap-1 text-ink-400 text-overline uppercase font-mono"
    aria-label="Identity not verified">
    <AlertCircle size={12} /> Not verified
  </span>
);

export default VerificationBadge;
