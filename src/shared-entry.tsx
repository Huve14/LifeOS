/* eslint-disable react-refresh/only-export-components, @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import {
  loadShoppingItems,
  claimShoppingItem,
  unclaimShoppingItem,
  subscribeShoppingItems,
  validateShareToken,
} from './supabase';

const SHOPPER_NAME_KEY = 'lifeos:shopper-name';

function loadSavedName() {
  try { return localStorage.getItem(SHOPPER_NAME_KEY) || ''; } catch { return ''; }
}
function saveName(n: string) {
  try { localStorage.setItem(SHOPPER_NAME_KEY, n); } catch { /* */ }
}

type View = 'list' | 'dashboard';

function Logo() {
  return (
    <svg viewBox="0 0 200 170" width={32} height={32} style={{ flexShrink: 0 }}>
      <circle cx={150} cy={46} r={19} fill="#FFF9C7" opacity={0.95} />
      <g><rect x={67} y={110} width={66} height={9} fill="#F6D110" /><ellipse cx={100} cy={119} rx={33} ry={10.5} fill="#F6D110" /><ellipse cx={100} cy={110} rx={33} ry={10.5} fill="#FFF9C7" opacity={0.95} /></g>
      <g><rect x={67} y={96} width={66} height={9} fill="#F6D110" /><ellipse cx={100} cy={105} rx={33} ry={10.5} fill="#F6D110" /><ellipse cx={100} cy={96} rx={33} ry={10.5} fill="#FFF9C7" opacity={0.95} /></g>
      <g><rect x={67} y={82} width={66} height={9} fill="#F6D110" /><ellipse cx={100} cy={91} rx={33} ry={10.5} fill="#F6D110" /><ellipse cx={100} cy={82} rx={33} ry={10.5} fill="#FFF9C7" opacity={0.95} /></g>
      <path d="M0 150 C 30 132 60 134 80 142 C 96 148 112 150 128 144 C 150 136 168 138 200 132 L 200 170 L 0 170 Z" fill="#81CEEB" opacity={0.72} />
    </svg>
  );
}

function ItemCard({ item, shopperName, onClaim }: { item: any; shopperName: string; onClaim: (id: string, supplied_by: string) => void }) {
  const isMine = item.supplied_by === shopperName;
  const claimed = !!item.supplied_by;
  const handleClick = () => onClaim(item.id, item.supplied_by);

  return (
    <div
      onClick={handleClick}
      style={{
        background: claimed ? (isMine ? '#e8f5e9' : '#f5f5f5') : 'var(--white)',
        border: claimed ? (isMine ? '1.5px solid #66bb6a' : '1px solid var(--line)') : '1px solid var(--line)',
        borderRadius: 14, padding: '12px 14px', cursor: 'pointer',
        transition: 'all 0.15s', userSelect: 'none', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 14, flexShrink: 0,
          background: claimed ? (isMine ? '#66bb6a' : '#e0e0e0') : 'var(--cream)',
          color: claimed ? '#fff' : 'var(--muted)',
          border: claimed ? 'none' : '1px solid var(--line)',
        }}>
          {claimed ? '✓' : '+'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{item.item}</div>
          <div style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--muted)', marginTop: 3, flexWrap: 'wrap' }}>
            {item.quantity && <span style={{ fontWeight: 600 }}>{item.quantity}</span>}
            {item.price > 0 && <span>{item.price} ZAR</span>}
            {item.note && <span>· {item.note}</span>}
          </div>
        </div>
        {claimed ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999,
            background: isMine ? '#66bb6a' : '#e0e0e0', color: isMine ? '#fff' : 'var(--muted)',
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {item.supplied_by}
            {isMine && <span style={{ fontSize: 10, marginLeft: 2 }}>✕</span>}
          </div>
        ) : (
          <div style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--terracotta)', color: 'var(--terracotta)', fontSize: 12, fontWeight: 600 }}>
            Claim
          </div>
        )}
      </div>
    </div>
  );
}

function progressBar(pct: number, color = 'var(--terracotta)', bg = 'var(--cream)') {
  return (
    <div style={{ height: 8, borderRadius: 4, background: bg, overflow: 'hidden', marginBottom: 4 }}>
      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: `linear-gradient(90deg, ${color}, ${color}dd)`, transition: 'width 0.4s ease' }} />
    </div>
  );
}

function DashboardView({ items, totalPrice }: { items: any[]; totalPrice: number }) {
  const claimed = items.filter(i => i.supplied_by);
  const unclaimed = items.filter(i => !i.supplied_by);
  const pct = items.length ? Math.round((claimed.length / items.length) * 100) : 0;
  const claimedPrice = claimed.reduce((t, i) => t + (i.price || 0), 0);
  const unclaimedPrice = unclaimed.reduce((t, i) => t + (i.price || 0), 0);

  const byPerson: Record<string, any[]> = {};
  for (const item of claimed) {
    if (!byPerson[item.supplied_by]) byPerson[item.supplied_by] = [];
    byPerson[item.supplied_by].push(item);
  }

  const catStats: Record<string, { total: number; claimed: number; price: number }> = {};
  for (const item of items) {
    if (!catStats[item.category]) catStats[item.category] = { total: 0, claimed: 0, price: 0 };
    catStats[item.category].total++;
    catStats[item.category].price += item.price || 0;
    if (item.supplied_by) catStats[item.category].claimed++;
  }

  function statBox(label: string, value: string | number, sub: string, color: string) {
    return (
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
        {sub ? <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.6 }}>{sub}</div> : null}
      </div>
    );
  }

  return (
    <>
      <div style={{ background: 'var(--white)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--shadow)', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {statBox('Total', items.length, `~${totalPrice.toLocaleString()} ZAR`, 'var(--dark)')}
          {statBox('Claimed', claimed.length, `~${claimedPrice.toLocaleString()} ZAR`, '#66bb6a')}
          {statBox('Needed', unclaimed.length, `~${unclaimedPrice.toLocaleString()} ZAR`, 'var(--terracotta)')}
        </div>
      </div>

      <div style={{ background: 'var(--white)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--shadow)', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Overall Progress</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--terracotta)' }}>{pct}%</span>
        </div>
        {progressBar(pct)}
        <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span>🟢 {claimed.length} claimed</span>
          <span>🟤 {unclaimed.length} to go</span>
        </div>
      </div>

      <div style={{ background: 'var(--white)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--shadow)', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>By Category</div>
        {Object.entries(catStats).map(([cat, st]) => (
          <div key={cat} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ fontWeight: 500 }}>{cat}</span>
              <span style={{ color: 'var(--muted)' }}>{st.claimed}/{st.total} · {st.price.toLocaleString()} ZAR</span>
            </div>
            {progressBar(st.total ? (st.claimed / st.total) * 100 : 0, st.claimed === st.total ? '#66bb6a' : 'var(--teal)')}
          </div>
        ))}
      </div>

      {claimed.length > 0 && (
        <div style={{ background: 'var(--white)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--shadow)', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Who's Getting What</div>
          {Object.entries(byPerson).map(([person, personItems]) => (
            <div key={person} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--terracotta)', marginBottom: 4 }}>
                👤 {person} ({personItems.length} items, ~{personItems.reduce((t, i) => t + (i.price || 0), 0).toLocaleString()} ZAR)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {personItems.map((item: any) => (
                  <span key={item.id} style={{ background: 'var(--cream)', padding: '3px 10px', borderRadius: 999, fontSize: 12, color: 'var(--dark)' }}>{item.item}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {unclaimed.length > 0 && (
        <div style={{ background: 'var(--white)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--shadow)', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Still Needed</div>
          {unclaimed.slice(0, 30).map((item: any) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <span style={{ fontWeight: 500 }}>{item.item}</span>
              <span style={{ color: 'var(--muted)' }}>{[item.quantity, item.price > 0 ? `${item.price} ZAR` : null].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
          {unclaimed.length > 30 && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>+{unclaimed.length - 30} more</div>
          )}
        </div>
      )}
    </>
  );
}

function ListView({ categories, shopperName, handleClaim }: { categories: Record<string, any[]>; shopperName: string; handleClaim: (id: string, sb: string) => void }) {
  return (
    <>
      {Object.entries(categories).map(([cat, catItems]) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: 'DM Sans', margin: '0 0 8px 4px', color: 'var(--muted)' }}>{cat}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {catItems.map((item: any) => (
              <ItemCard key={item.id} item={item} shopperName={shopperName} onClaim={handleClaim} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function SharedList({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [valid, setValid] = useState<boolean | null>(null);
  const [error] = useState('');
  const [loading, setLoading] = useState(true);
  const [shopperName, setShopperName] = useState(loadSavedName);
  const [showNameInput, setShowNameInput] = useState(false);
  const [view, setView] = useState<View>('dashboard');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const ok = await validateShareToken(token);
      if (cancelled) return;
      setValid(ok);
      if (ok) {
        const data = await loadShoppingItems(token);
        if (!cancelled) setItems(data);
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (valid !== true) return;
    const unsub = subscribeShoppingItems((updated) => setItems(updated), token);
    return unsub;
  }, [token, valid]);

  const handleClaim = useCallback(async (itemId: string, currentSupplier: string) => {
    if (!shopperName.trim()) {
      setShowNameInput(true);
      return;
    }
    if (currentSupplier === shopperName.trim()) {
      await unclaimShoppingItem(itemId, token);
    } else {
      await claimShoppingItem(itemId, shopperName.trim(), token);
    }
  }, [shopperName, token]);

  const handleSetName = useCallback((e: React.FormEvent) => {
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
    return (
      <div style={{
        minHeight: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--cream)', color: 'var(--muted)', fontSize: 14, fontWeight: 500,
      }}>
        Loading…
      </div>
    );
  }

  if (valid === false) {
    return (
      <div style={{
        minHeight: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, background: 'var(--cream)', color: 'var(--muted)', padding: 40, textAlign: 'center',
      }}>
        <span style={{ fontSize: 48 }}>🔒</span>
        <h2 style={{ fontSize: 18, color: 'var(--dark)', margin: 0 }}>Invalid or expired link</h2>
        <p style={{ fontSize: 13, margin: 0 }}>Ask for a fresh share link.</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100%', width: '100%', background: 'var(--cream)',
      backgroundImage: 'radial-gradient(at 20% 0%, rgba(246, 209, 16, 0.16) 0%, transparent 40%),radial-gradient(at 100% 100%, rgba(129, 206, 235, 0.20) 0%, transparent 50%)',
      color: 'var(--dark)', paddingBottom: 40,
    }}>
      <div style={{ padding: '24px 18px 20px', background: 'linear-gradient(135deg, var(--honey) 0%, var(--butter) 100%)', color: '#17272D', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Logo />
          <h1 style={{ fontSize: 24, margin: 0, fontWeight: 700 }}>Shopping List</h1>
        </div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          {items.length} items · ~{totalPrice.toLocaleString()} ZAR{claimedCount > 0 ? ` · ${claimedCount} claimed` : ''}
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, opacity: 0.85 }}>You are:</span>
          {shopperName ? (
            <button onClick={() => setShowNameInput(true)} style={{ background: 'rgba(23,39,45,0.10)', border: 'none', borderRadius: 999, padding: '6px 14px', color: '#17272D', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
              {shopperName} ✏️
            </button>
          ) : (
            <button onClick={() => setShowNameInput(true)} style={{ background: 'rgba(23,39,45,0.08)', border: '1px dashed rgba(23,39,45,0.3)', borderRadius: 999, padding: '6px 14px', color: '#17272D', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>
              Set your name
            </button>
          )}
        </div>
        {showNameInput && (
          <form onSubmit={handleSetName} style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input name="name" defaultValue={shopperName} placeholder="Your name" autoFocus style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: 'none', fontSize: 15, fontFamily: 'inherit', background: 'rgba(255,255,255,0.9)', color: '#333', outline: 'none' }} />
              <button type="submit" style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: '#fff', color: 'var(--terracotta)', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>Save</button>
            </div>
          </form>
        )}
        <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
          <button onClick={() => setView('dashboard')} style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            background: view === 'dashboard' ? 'rgba(23,39,45,0.15)' : 'rgba(23,39,45,0.06)',
            color: '#17272D', transition: 'all 0.15s',
          }}>📊 Progress</button>
          <button onClick={() => setView('list')} style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            background: view === 'list' ? 'rgba(23,39,45,0.15)' : 'rgba(23,39,45,0.06)',
            color: '#17272D', transition: 'all 0.15s',
          }}>📋 Full List</button>
        </div>
      </div>

      <div style={{ padding: '16px 14px' }}>
        {error && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{error}</div>
        )}
        {view === 'dashboard' ? (
          <DashboardView items={items} totalPrice={totalPrice} />
        ) : (
          <ListView categories={categories} shopperName={shopperName} handleClaim={handleClaim} />
        )}
        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 14 }}>No items yet</div>
        )}
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', padding: '0 18px' }}>
        Shared list
      </div>
    </div>
  );
}

const token = window.location.pathname.match(/\/s\/(.+)/)?.[1] || window.location.hash.replace('#', '');
const root = document.getElementById('root')!;

if (!token) {
  root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8A8A8A;font-size:14px;text-align:center;padding:40px"><div><h2 style="font-size:18px;color:#1E1E1E;margin-bottom:8px">Missing link</h2><p style="margin:0">Ask for a valid shopping list link.</p></div></div>';
} else {
  createRoot(root).render(<SharedList token={token} />);
}
