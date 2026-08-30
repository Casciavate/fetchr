import React from 'react';
import {
  Package, Smartphone, Shirt, Sparkles, UtensilsCrossed, BookOpen,
  Gamepad2, Pill, Gem, Dumbbell, Home, FileText, Plane,
} from 'lucide-react';

// Ported verbatim from the Claude Design "fetchr" design system
// (components/tickets/CargoTag.jsx) — see CargoTag.prompt.md there for the
// canonical usage example. The only adaptation: that system resolves icons
// through a shared `Icon` name-lookup component this app doesn't have, so
// icon names resolve through this small local map instead of importing one.
// Do not alter the markup/styles below without updating the source design
// project to match.
const ICONS = {
  Package, Smartphone, Shirt, Sparkles, UtensilsCrossed, BookOpen,
  Gamepad2, Pill, Gem, Dumbbell, Home, FileText, Plane,
};
const Icon = ({ name, size, color, style }) => {
  const Cmp = ICONS[name] || Package;
  return <Cmp size={size} color={color} style={style} />;
};

export function CargoTag({
  itemName, category, categoryIcon = 'Package', from, to, neededBy, spend,
  spendNote = 'Estimate · set by matched flight', state = 'default', interactive = false,
  style, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => interactive && setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', paddingTop: 14, ...style }} {...rest}>
      <div style={{
        width: 48, height: 22, margin: '0 0 -1px 20px', background: 'var(--surface-inverse)',
        borderRadius: 'var(--radius-md) var(--radius-md) 0 0', position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', background: 'var(--ground)',
          border: '1px solid var(--border-perf)',
        }} />
      </div>
      <div style={{
        position: 'relative', background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid ' + (hover ? 'var(--border-strong)' : 'var(--border)'),
        borderLeft: state === 'yours' ? '3px solid var(--signal)' : undefined,
        outline: '1px dashed var(--border-perf)', outlineOffset: -6,
        boxShadow: 'var(--elev-0)', overflow: 'hidden',
        transition: 'border-color var(--dur-fast) var(--ease-standard)',
      }}>
        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div>
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)',
              fontWeight: 500, fontSize: 'var(--text-overline)', letterSpacing: 'var(--ls-overline)',
              textTransform: 'uppercase', color: 'var(--ink-subtle)' }}>
              <Icon name={categoryIcon} size={12} /> {category}
            </p>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-title-s)',
              color: 'var(--ink)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' }}>{itemName}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 'var(--space-2)', alignItems: 'center',
            borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--text-code-l)',
                letterSpacing: 'var(--ls-code-xl)', color: 'var(--ink)' }}>{from.code}</p>
              {from.city && <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-muted)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from.city}</p>}
            </div>
            <Icon name="Plane" size={14} color="var(--ink-400)" style={{ transform: 'rotate(90deg)' }} />
            <div style={{ minWidth: 0, textAlign: 'right' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--text-code-l)',
                letterSpacing: 'var(--ls-code-xl)', color: 'var(--ink)' }}>{to.code}</p>
              {to.city && <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-muted)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to.city}</p>}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 'var(--space-3)' }}>
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 'var(--text-overline)',
                letterSpacing: 'var(--ls-overline)', textTransform: 'uppercase', color: 'var(--ink-subtle)' }}>Needed by</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-num-m)', color: 'var(--ink)', marginTop: 2 }}>{neededBy}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 'var(--text-overline)',
                letterSpacing: 'var(--ls-overline)', textTransform: 'uppercase', color: 'var(--ink-subtle)' }}>Potential spend</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--text-num-l)',
                letterSpacing: 'var(--ls-num-l)', color: 'var(--ink)', marginTop: 2 }}>{spend}</p>
            </div>
          </div>
          {spendNote && <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-subtle)', marginTop: -6, textAlign: 'right' }}>{spendNote}</p>}
        </div>
      </div>
    </div>
  );
}

export default CargoTag;
