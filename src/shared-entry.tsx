// shared-entry.tsx — Standalone entry for the shared shopping list page
import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  loadShoppingItems,
  claimShoppingItem,
  unclaimShoppingItem,
  subscribeShoppingItems,
  validateShareToken,
} from './supabase';

const SHOPPER_NAME_KEY = 'suveda:shopper-name';

function loadSavedName() {
  try { return localStorage.getItem(SHOPPER_NAME_KEY) || ''; } catch { return ''; }
}
function saveName(n: string) {
  try { localStorage.setItem(SHOPPER_NAME_KEY, n); } catch { /* */ }
}

type View = 'list' | 'dashboard';

function SharedList({ token }: { token: string }) {
  const [items, setItems] = React.useState<any[]>([]);
  const [valid, setValid] = React.useState<boolean | null>(null);
  const [error] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [shopperName, setShopperName] = React.useState(loadSavedName);
  const [showNameInput, setShowNameInput] = React.useState(false);
  const [view, setView] = React.useState<View>('dashboard');

  React.useEffect(() => {
    let cancelled = false;
    async function init() {
      const ok = await validateShareToken(token);
      if (cancelled) return;
      setValid(ok);
      if (ok) {
        const data = await loadShoppingItems();
        if (!cancelled) setItems(data);
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [token]);

  React.useEffect(() => {
    if (valid !== true) return;
    const unsub = subscribeShoppingItems((updated) => setItems(updated));
    return unsub;
  }, [valid]);

  const handleClaim = React.useCallback(async (itemId: string, currentSupplier: string) => {
    if (!shopperName.trim()) {
      setShowNameInput(true);
      return;
    }
    if (currentSupplier === shopperName.trim()) {
      await unclaimShoppingItem(itemId);
    } else {
      await claimShoppingItem(itemId, shopperName.trim());
    }
  }, [shopperName]);

  const handleSetName = React.useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const name = (e.target as HTMLFormElement).elements.namedItem('name') as HTMLInputElement;
    if (name.value.trim()) {
      setShopperName(name.value.trim());
      saveName(name.value.trim());
      setShowNameInput(false);
    }
  }, []);

  const categories: Record<string, any[]> = {};
  for (const item of items) {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push(item);
  }

  const totalPrice = items.reduce((t, i) => t + (i.price || 0), 0);
  const claimedCount = items.filter(i => i.supplied_by).length;

  if (loading) {
    return React.createElement('div', {
      style: { minHeight: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)', color: 'var(--muted)', fontSize: 14, fontWeight: 500 }
    }, 'Loading…');
  }

  if (valid === false) {
    return React.createElement('div', {
      style: { minHeight: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: 'var(--cream)', color: 'var(--muted)', padding: 40, textAlign: 'center' }
    }, [
      React.createElement('span', { key: 'icon', style: { fontSize: 48 } }, '🔒'),
      React.createElement('h2', { key: 'h', style: { fontSize: 18, color: 'var(--dark)', margin: 0 } }, 'Invalid or expired link'),
      React.createElement('p', { key: 'p', style: { fontSize: 13, margin: 0 } }, 'Ask Suveda for a fresh share link.'),
    ]);
  }

  return React.createElement('div', {
    style: { minHeight: '100%', width: '100%', background: 'var(--cream)', backgroundImage: 'radial-gradient(at 20% 0%, rgba(212, 168, 83, 0.08) 0%, transparent 40%),radial-gradient(at 100% 100%, rgba(196, 113, 74, 0.06) 0%, transparent 50%)', color: 'var(--dark)', paddingBottom: 40 }
  }, [
    // Header
    React.createElement('div', {
      key: 'header', style: { padding: '24px 18px 20px', background: 'linear-gradient(135deg, var(--terracotta) 0%, #b85a32 100%)', color: '#fff', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }
    }, [
      React.createElement('div', { key: 'h-inner', style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 } }, [
        React.createElement('svg', { key: 'logo', viewBox: '0 0 200 170', width: 32, height: 32, style: { flexShrink: 0 } }, [
          React.createElement('circle', { key: 'sun', cx: 150, cy: 46, r: 19, fill: '#FAF7F2', opacity: 0.9 }),
          React.createElement('g', { key: 'coin1' }, React.createElement('rect', { x: 67, y: 110, width: 66, height: 9, fill: '#B9851F' }), React.createElement('ellipse', { cx: 100, cy: 119, rx: 33, ry: 10.5, fill: '#B9851F' }), React.createElement('ellipse', { cx: 100, cy: 110, rx: 33, ry: 10.5, fill: '#FAF7F2', opacity: 0.9 })),
          React.createElement('g', { key: 'coin2' }, React.createElement('rect', { x: 67, y: 96, width: 66, height: 9, fill: '#B9851F' }), React.createElement('ellipse', { cx: 100, cy: 105, rx: 33, ry: 10.5, fill: '#B9851F' }), React.createElement('ellipse', { cx: 100, cy: 96, rx: 33, ry: 10.5, fill: '#FAF7F2', opacity: 0.9 })),
          React.createElement('g', { key: 'coin3' }, React.createElement('rect', { x: 67, y: 82, width: 66, height: 9, fill: '#B9851F' }), React.createElement('ellipse', { cx: 100, cy: 91, rx: 33, ry: 10.5, fill: '#B9851F' }), React.createElement('ellipse', { cx: 100, cy: 82, rx: 33, ry: 10.5, fill: '#FAF7F2', opacity: 0.9 })),
          React.createElement('path', { key: 'wave', d: 'M0 150 C 30 132 60 134 80 142 C 96 148 112 150 128 144 C 150 136 168 138 200 132 L 200 170 L 0 170 Z', fill: '#1E524F', opacity: 0.4 }),
        ]),
        React.createElement('h1', { key: 'title', style: { fontSize: 24, margin: 0, fontWeight: 700 } }, 'Shopping List'),
      ]),
      React.createElement('div', { key: 'meta', style: { fontSize: 13, opacity: 0.85 } }, `${items.length} items · ~${totalPrice.toLocaleString()} ZAR${claimedCount > 0 ? ` · ${claimedCount} claimed` : ''}`),
      React.createElement('div', { key: 'name-row', style: { marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 } }, [
        React.createElement('span', { key: 'label', style: { fontSize: 13, opacity: 0.85 } }, 'You are:'),
        shopperName
          ? React.createElement('button', { key: 'btn', onClick: () => setShowNameInput(true), style: { background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 999, padding: '6px 14px', color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' } }, `${shopperName} ✏️`)
          : React.createElement('button', { key: 'btn', onClick: () => setShowNameInput(true), style: { background: 'rgba(255,255,255,0.2)', border: '1px dashed rgba(255,255,255,0.4)', borderRadius: 999, padding: '6px 14px', color: '#fff', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' } }, 'Set your name'),
      ]),
      showNameInput && React.createElement('form', { key: 'name-form', onSubmit: handleSetName, style: { marginTop: 10 } }, [
        React.createElement('div', { key: 'row', style: { display: 'flex', gap: 8 } }, [
          React.createElement('input', { key: 'input', name: 'name', defaultValue: shopperName, placeholder: 'Your name', autoFocus: true, style: { flex: 1, padding: '10px 14px', borderRadius: 12, border: 'none', fontSize: 15, fontFamily: 'inherit', background: 'rgba(255,255,255,0.9)', color: '#333', outline: 'none' } }),
          React.createElement('button', { key: 'btn', type: 'submit', style: { padding: '10px 18px', borderRadius: 12, border: 'none', background: '#fff', color: 'var(--terracotta)', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' } }, 'Save'),
        ]),
      ]),

      // Tabs
      React.createElement('div', { key: 'tabs', style: { display: 'flex', gap: 4, marginTop: 14 } }, [
        React.createElement('button', {
          key: 'tab-dash', onClick: () => setView('dashboard'),
          style: {
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            background: view === 'dashboard' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
            color: '#fff', transition: 'all 0.15s',
          }
        }, '📊 Progress'),
        React.createElement('button', {
          key: 'tab-list', onClick: () => setView('list'),
          style: {
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            background: view === 'list' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
            color: '#fff', transition: 'all 0.15s',
          }
        }, '📋 Full List'),
      ]),
    ]),

    // Body
    React.createElement('div', { key: 'body', style: { padding: '16px 14px' } }, [
      error && React.createElement('div', { key: 'err', style: { background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, marginBottom: 12 } }, error),

      view === 'dashboard'
        ? React.createElement(React.Fragment, null, DashboardView(items, totalPrice))
        : React.createElement(React.Fragment, null, ListView(categories, shopperName, handleClaim)),

      items.length === 0 && React.createElement('div', { key: 'empty', style: { textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 14 } }, 'No items yet'),
    ]),

    // Footer
    React.createElement('div', { key: 'footer', style: { textAlign: 'center', fontSize: 12, color: 'var(--muted)', padding: '0 18px' } }, 'Suveda · Moving to Abu Dhabi 🌴'),
  ]);
}

function ListView(categories: Record<string, any[]>, shopperName: string, handleClaim: (id: string, sb: string) => void) {
  return Object.entries(categories).map(([cat, catItems]) =>
    React.createElement('div', { key: cat, style: { marginBottom: 20 } }, [
      React.createElement('h3', { key: 'h', style: { fontSize: 15, fontWeight: 700, fontFamily: 'DM Sans', margin: '0 0 8px 4px', color: 'var(--muted)' } }, cat),
      React.createElement('div', { key: 'items', style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        catItems.map((item: any) => ItemCard(item, shopperName, handleClaim))
      ),
    ])
  );
}

function DashboardView(items: any[], totalPrice: number) {
  const claimed = items.filter(i => i.supplied_by);
  const unclaimed = items.filter(i => !i.supplied_by);
  const pct = items.length ? Math.round((claimed.length / items.length) * 100) : 0;
  const claimedPrice = claimed.reduce((t, i) => t + (i.price || 0), 0);
  const unclaimedPrice = unclaimed.reduce((t, i) => t + (i.price || 0), 0);

  // By person
  const byPerson: Record<string, any[]> = {};
  for (const item of claimed) {
    if (!byPerson[item.supplied_by]) byPerson[item.supplied_by] = [];
    byPerson[item.supplied_by].push(item);
  }

  // By category
  const catStats: Record<string, { total: number; claimed: number; price: number }> = {};
  for (const item of items) {
    if (!catStats[item.category]) catStats[item.category] = { total: 0, claimed: 0, price: 0 };
    catStats[item.category].total++;
    catStats[item.category].price += item.price || 0;
    if (item.supplied_by) catStats[item.category].claimed++;
  }

  const card = (content: React.ReactNode, key: string, extraStyle = {}) =>
    React.createElement('div', { key, style: { background: 'var(--white)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--shadow)', marginBottom: 14, ...extraStyle } }, content);

  const statBox = (label: string, value: string | number, sub: string, color: string) =>
    React.createElement('div', { key: label, style: { flex: 1, textAlign: 'center' } }, [
      React.createElement('div', { key: 'v', style: { fontSize: 26, fontWeight: 700, color } }, value),
      React.createElement('div', { key: 'l', style: { fontSize: 12, color: 'var(--muted)', marginTop: 2 } }, label),
      sub ? React.createElement('div', { key: 's', style: { fontSize: 11, color: 'var(--muted)', opacity: 0.6 } }, sub) : null,
    ]);

  const progressBar = (pct: number, color = 'var(--terracotta)', bg = 'var(--cream)') =>
    React.createElement('div', { style: { height: 8, borderRadius: 4, background: bg, overflow: 'hidden', marginBottom: 4 } }, [
      React.createElement('div', { style: { height: '100%', width: `${pct}%`, borderRadius: 4, background: `linear-gradient(90deg, ${color}, ${color}dd)`, transition: 'width 0.4s ease' } }),
    ]);

  return [
    // Stats row
    card(
      React.createElement('div', { style: { display: 'flex', gap: 8 } }, [
        statBox('Total', items.length, `~${totalPrice.toLocaleString()} ZAR`, 'var(--dark)'),
        statBox('Claimed', claimed.length, `~${claimedPrice.toLocaleString()} ZAR`, '#66bb6a'),
        statBox('Needed', unclaimed.length, `~${unclaimedPrice.toLocaleString()} ZAR`, 'var(--terracotta)'),
      ]),
      'stats'
    ),

    // Overall progress
    card([
      React.createElement('div', { key: 'row', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } }, [
        React.createElement('span', { style: { fontSize: 14, fontWeight: 600 } }, 'Overall Progress'),
        React.createElement('span', { style: { fontSize: 14, fontWeight: 700, color: 'var(--terracotta)' } }, `${pct}%`),
      ]),
      progressBar(pct),
      React.createElement('div', { key: 'legend', style: { display: 'flex', gap: 14, marginTop: 6, fontSize: 12, color: 'var(--muted)' } }, [
        React.createElement('span', null, `🟢 ${claimed.length} claimed`),
        React.createElement('span', null, `🟤 ${unclaimed.length} to go`),
      ]),
    ], 'progress', undefined),

    // Category breakdown
    card([
      React.createElement('div', { key: 'title', style: { fontSize: 14, fontWeight: 600, marginBottom: 12 } }, 'By Category'),
      ...Object.entries(catStats).map(([cat, st]) =>
        React.createElement('div', { key: cat, style: { marginBottom: 10 } }, [
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 } }, [
            React.createElement('span', { style: { fontWeight: 500 } }, cat),
            React.createElement('span', { style: { color: 'var(--muted)' } }, `${st.claimed}/${st.total}  ·  ${st.price.toLocaleString()} ZAR`),
          ]),
          progressBar(st.total ? (st.claimed / st.total) * 100 : 0, st.claimed === st.total ? '#66bb6a' : 'var(--teal)'),
        ])
      ),
    ], 'categories', undefined),

    // Who's getting what
    ...(claimed.length > 0 ? [card([
      React.createElement('div', { key: 'title', style: { fontSize: 14, fontWeight: 600, marginBottom: 12 } }, "Who's Getting What"),
      ...Object.entries(byPerson).map(([person, personItems]) =>
        React.createElement('div', { key: person, style: { marginBottom: 8 } }, [
          React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--terracotta)', marginBottom: 4 } }, `👤 ${person} (${personItems.length} items, ~${personItems.reduce((t,i) => t + (i.price||0), 0).toLocaleString()} ZAR)`),
          React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
            personItems.map((item: any) =>
              React.createElement('span', { key: item.id, style: { background: 'var(--cream)', padding: '3px 10px', borderRadius: 999, fontSize: 12, color: 'var(--dark)' } }, item.item)
            )
          ),
        ])
      ),
    ], 'who', undefined)] : []),

    // Still needed
    ...(unclaimed.length > 0 ? [card([
      React.createElement('div', { key: 'title', style: { fontSize: 14, fontWeight: 600, marginBottom: 10 } }, 'Still Needed'),
      ...unclaimed.slice(0, 30).map((item: any) =>
        React.createElement('div', { key: item.id, style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 } }, [
          React.createElement('span', { style: { fontWeight: 500 } }, item.item),
          React.createElement('span', { style: { color: 'var(--muted)' } }, [item.quantity, item.price > 0 ? ` · ${item.price} ZAR` : null].filter(Boolean).join('')),
        ])
      ),
      unclaimed.length > 30 && React.createElement('div', { key: 'more', style: { textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 8 } }, `+${unclaimed.length - 30} more`),
    ], 'needed', undefined)] : []),
  ];
}

function ItemCard(item: any, shopperName: string, onClaim: (id: string, supplied_by: string) => void) {
  const isMine = item.supplied_by && item.supplied_by === shopperName;
  const claimed = !!item.supplied_by;

  return React.createElement('div', {
    key: item.id,
    onClick: () => onClaim(item.id, item.supplied_by),
    style: {
      background: claimed ? (isMine ? '#e8f5e9' : '#f5f5f5') : 'var(--white)',
      border: claimed ? (isMine ? '1.5px solid #66bb6a' : '1px solid var(--line)') : '1px solid var(--line)',
      borderRadius: 14, padding: '12px 14px', cursor: 'pointer',
      transition: 'all 0.15s', userSelect: 'none', WebkitTapHighlightColor: 'transparent',
    }
  }, [
    React.createElement('div', { key: 'row', style: { display: 'flex', alignItems: 'center', gap: 10 } }, [
      React.createElement('div', { key: 'status', style: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, background: claimed ? (isMine ? '#66bb6a' : '#e0e0e0') : 'var(--cream)', color: claimed ? '#fff' : 'var(--muted)', border: claimed ? 'none' : '1px solid var(--line)' } }, claimed ? '✓' : '+'),
      React.createElement('div', { key: 'info', style: { flex: 1, minWidth: 0 } }, [
        React.createElement('div', { key: 'name', style: { fontSize: 15, fontWeight: 600 } }, item.item),
        React.createElement('div', { key: 'detail', style: { display: 'flex', gap: 6, fontSize: 12, color: 'var(--muted)', marginTop: 3, flexWrap: 'wrap' } }, [
          item.quantity && React.createElement('span', { key: 'qty', style: { fontWeight: 600 } }, item.quantity),
          item.price > 0 && React.createElement('span', { key: 'price' }, `${item.price} ZAR`),
          item.note && React.createElement('span', { key: 'note' }, `· ${item.note}`),
        ]),
      ]),
      claimed
        ? React.createElement('div', { key: 'badge', style: { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: isMine ? '#66bb6a' : '#e0e0e0', color: isMine ? '#fff' : 'var(--muted)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' } }, [item.supplied_by, isMine && React.createElement('span', { key: 'x', style: { fontSize: 10, marginLeft: 2 } }, '✕')])
        : React.createElement('div', { key: 'badge', style: { padding: '4px 10px', borderRadius: 999, border: '1px solid var(--terracotta)', color: 'var(--terracotta)', fontSize: 12, fontWeight: 600 } }, 'Claim'),
    ]),
  ]);
}

// --- Bootstrap ---
const token = window.location.pathname.match(/\/s\/(.+)/)?.[1] || window.location.hash.replace('#', '');
const root = document.getElementById('root')!;

if (!token) {
  root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8A8A8A;font-size:14px;text-align:center;padding:40px"><div><h2 style="font-size:18px;color:#1E1E1E;margin-bottom:8px">Missing link</h2><p style="margin:0">Ask Suveda for a valid shopping list link.</p></div></div>';
} else {
  createRoot(root).render(React.createElement(SharedList, { token }));
}
