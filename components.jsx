// components.jsx — Shared UI primitives for Life OS

const STATUS = {
  packed:   { bg: 'var(--blue)',       fg: '#17272D', label: 'Packed'  },
  toBuy:    { bg: 'var(--honey)',      fg: '#17272D', label: 'To Buy' },
  missing:  { bg: '#A84242',           fg: '#fff', label: 'Missing' },
  done:     { bg: 'var(--blue)',       fg: '#17272D', label: 'Done'    },
  pending:  { bg: 'var(--butter)',     fg: '#17272D', label: 'Pending' },
  inProgress: { bg: 'var(--honey)',    fg: '#17272D', label: 'In progress' },
};

function Badge({ status, children, size = 'md' }) {
  const s = STATUS[status] || { bg: 'var(--sand)', fg: 'var(--dark)', label: children };
  const fontSize = size === 'sm' ? 11 : 12;
  const pad = size === 'sm' ? '3px 8px' : '5px 11px';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: s.bg, color: s.fg,
      padding: pad, borderRadius: 999,
      fontSize, fontWeight: 600, letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
    }}>
      {children || s.label}
    </span>
  );
}

function Button({ variant = 'primary', children, onClick, full, icon, size = 'md', disabled, type = 'button' }) {
  const variants = {
    primary: { bg: 'var(--honey)',      fg: '#17272D', border: 'transparent' },
    teal:    { bg: 'var(--blue)',       fg: '#17272D', border: 'transparent' },
    gold:    { bg: 'var(--butter)',     fg: '#17272D', border: 'transparent' },
    ghost:   { bg: 'transparent',       fg: 'var(--dark)', border: 'var(--line)' },
    soft:    { bg: 'var(--sand)',       fg: 'var(--dark)', border: 'transparent' },
    glass:   { bg: 'rgba(255,255,255,0.15)', fg: '#fff', border: 'rgba(255,255,255,0.3)' },
  };
  const v = variants[variant];
  const sizes = {
    sm: { p: '8px 14px', fs: 13 },
    md: { p: '12px 22px', fs: 14 },
    lg: { p: '16px 28px', fs: 15 },
  };
  const sz = sizes[size];
  const isGlass = variant === 'glass';
  return (
    <button
      type={type}
      disabled={disabled}
      className="ui-button"
      onClick={disabled ? undefined : onClick}
      style={{
        background: v.bg, color: v.fg,
        border: `1px solid ${v.border}`,
        padding: sz.p, borderRadius: 999,
        fontSize: sz.fs, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: full ? '100%' : 'auto',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: isGlass ? '0 8px 32px rgba(0,0,0,0.12)' : (variant === 'primary' || variant === 'teal' ? '0 4px 12px -4px rgba(45,114,139,0.35)' : 'none'),
        backdropFilter: isGlass ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: isGlass ? 'blur(12px)' : 'none',
      }}
    >
      {icon && <span style={{ fontSize: sz.fs + 2 }}>{icon}</span>}
      {children}
    </button>
  );
}

function Card({ children, padding, style = {}, onClick, accent }) {
  const p = padding ?? 'var(--pad)';
  return (
    <div
      className="ui-card"
      onClick={onClick}
      style={{
        background: 'var(--white)',
        borderRadius: 'var(--radius)',
        padding: p,
        boxShadow: 'var(--shadow)',
        border: '1px solid var(--line)',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {accent && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 3, background: accent,
        }} />
      )}
      {children}
    </div>
  );
}

function ProgressBar({ value, total, style = 'bar', color, height = 8, showLabel = false }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  const fillColor = color || 'var(--gold)';

  if (style === 'circle') {
    const r = 36, c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;
    return (
      <div style={{ position: 'relative', width: 88, height: 88 }}>
        <svg width="88" height="88" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={r} fill="none" stroke="var(--sand)" strokeWidth="8" />
          <circle
            cx="44" cy="44" r={r} fill="none"
            stroke={fillColor} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset}
            transform="rotate(-90 44 44)"
            style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontWeight: 700, fontSize: 22, color: 'var(--dark)' }}>{pct}%</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: -2 }}>{value}/{total}</div>
        </div>
      </div>
    );
  }

  if (style === 'segmented') {
    const segs = Math.max(total, 1);
    return (
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: segs }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height,
            background: i < value ? fillColor : 'var(--sand)',
            borderRadius: 2,
          }} />
        ))}
      </div>
    );
  }

  // Default bar
  return (
    <div>
      <div style={{
        height, background: 'var(--sand)',
        borderRadius: 999, overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: fillColor,
          borderRadius: 999,
          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
          <span>{value} of {total}</span>
          <span style={{ fontWeight: 600, color: 'var(--dark)' }}>{pct}%</span>
        </div>
      )}
    </div>
  );
}

function Checkbox({ checked, onChange, color }) {
  const c = color || 'var(--teal)';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange?.(!checked); }}
      style={{
        width: 24, height: 24, borderRadius: 8,
        background: checked ? c : 'transparent',
        border: `2px solid ${checked ? c : 'var(--line)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        color: '#fff', fontSize: 14, fontWeight: 700,
      }}
    >
      {checked && '✓'}
    </button>
  );
}

function SectionHeader({ title, action, icon }) {
  return (
    <div className="ui-section-header" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 10, marginTop: 6,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        {title}
      </h3>
      {action}
    </div>
  );
}

function EmptyState({ emoji, title, body, action }) {
  return (
    <div className="ui-empty-state" style={{
      textAlign: 'center', padding: '36px 20px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    }}>
      <div style={{ fontSize: 56, marginBottom: 6 }}>{emoji}</div>
      <h3 style={{ fontSize: 18 }}>{title}</h3>
      <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 260, lineHeight: 1.5 }}>{body}</div>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

function Pill({ children, active, onClick, color }) {
  const activeColor = color || 'var(--honey)';
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px',
        borderRadius: 999,
        background: active ? activeColor : 'transparent',
        color: active ? (color ? '#fff' : '#17272D') : 'var(--muted)',
        border: `1px solid ${active ? 'transparent' : 'var(--line)'}`,
        fontSize: 13, fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// Tab bar with blue-ink active text + honey underline
function TabBar({ tabs, active, onChange, scrollable = false }) {
  return (
    <div className={`ui-tab-bar${scrollable ? ' is-scrollable' : ''}`} style={{
      display: 'flex', gap: 4,
      overflowX: 'auto',
      borderBottom: '1px solid var(--line)',
      padding: '0 4px',
    }}>
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          className="ui-tab"
          onClick={() => onChange(t.id)}
          style={{
            position: 'relative',
            padding: '12px 14px',
            color: active === t.id ? 'var(--terracotta)' : 'var(--muted)',
            fontWeight: active === t.id ? 700 : 500,
            fontSize: 14,
            whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {t.icon && <span style={{ fontSize: 15 }}>{t.icon}</span>}
          {t.label}
          {active === t.id && (
            <div style={{
              position: 'absolute', bottom: -1, left: 8, right: 8,
              height: 3, background: 'var(--gold)',
              borderRadius: 2,
            }} />
          )}
        </button>
      ))}
    </div>
  );
}

function Sheet({ open, onClose, title, children, height }) {
  if (!open) return null;
  return (
    <div
      className="ui-sheet-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(30, 30, 30, 0.4)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'fade-in 0.2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="ui-sheet-panel slide-up"
        style={{
          width: '100%',
          background: 'var(--cream)',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          padding: '14px 18px calc(20px + env(safe-area-inset-bottom, 0px))',
          height: height === 'auto' ? undefined : (height || 'min(86dvh, 760px)'),
          maxHeight: 'calc(100dvh - 16px)',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -24px 48px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{
          width: 36, height: 4, background: 'var(--line)',
          borderRadius: 2, margin: '0 auto 14px',
        }} />
        {title && <h2 style={{ fontSize: 22, marginBottom: 14 }}>{title}</h2>}
        <div className="ui-sheet-content" style={{ flex: height === 'auto' ? undefined : 1, minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      className="ui-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(30, 30, 30, 0.4)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fade-in 0.15s ease',
      }}
    >
      <div
        className="ui-modal-panel"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--white)',
          borderRadius: 'var(--radius)',
          padding: 24,
          width: 'min(400px, calc(100vw - 32px))',
          maxHeight: '80dvh',
          overflowY: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
        }}
      >
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
            <button onClick={onClose} style={{ fontSize: 20, color: 'var(--muted)' }}>✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function PrivatePhoto({ value, alt = '', ...props }) {
  const [src, setSrc] = React.useState(() => (
    /^https?:\/\//i.test(value || '') && !(value || '').includes('/memory-photos/') ? value : ''
  ));

  React.useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSrc('');
      return undefined;
    }
    if (/^https?:\/\//i.test(value) && !value.includes('/memory-photos/')) {
      setSrc(value);
      return undefined;
    }
    void window.__suvedaPhotos?.signedUrl(value).then(url => {
      if (!cancelled) setSrc(url || '');
    });
    return () => { cancelled = true; };
  }, [value]);

  return <img {...props} src={src} alt={alt} />;
}

function PrivateMemoryPhotoGrid({ values = [], ...props }) {
  const [images, setImages] = React.useState([]);

  React.useEffect(() => {
    let cancelled = false;
    void Promise.all(values.map(async value => {
      if (/^https?:\/\//i.test(value || '') && !(value || '').includes('/memory-photos/')) {
        return value;
      }
      return window.__suvedaPhotos?.signedUrl(value) ?? null;
    })).then(resolved => {
      if (!cancelled) setImages(resolved.filter(Boolean));
    });
    return () => { cancelled = true; };
  }, [values]);

  return <MemoryPhotoGrid {...props} images={images} />;
}

// Confetti for celebrations
function Confetti({ active }) {
  if (!active) return null;
  const colors = ['#F6D110', '#FFF9C7', '#81CEEB', '#E6F2F4'];
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      overflow: 'hidden', zIndex: 200,
    }}>
      {Array.from({ length: 50 }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.6;
        const dur = 2 + Math.random() * 1.5;
        const size = 6 + Math.random() * 8;
        const color = colors[i % colors.length];
        const round = Math.random() > 0.5;
        return (
          <div key={i} style={{
            position: 'absolute', top: -20, left: `${left}%`,
            width: size, height: size * (round ? 1 : 0.4),
            background: color,
            borderRadius: round ? '50%' : 2,
            animation: `fall ${dur}s ${delay}s ease-out forwards`,
          }} />
        );
      })}
    </div>
  );
}

Object.assign(window, {
  Badge, Button, Card, ProgressBar, Checkbox, SectionHeader,
  EmptyState, Pill, TabBar, Sheet, Modal, PrivatePhoto, PrivateMemoryPhotoGrid, Confetti, STATUS,
});
