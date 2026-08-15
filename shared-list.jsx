// shared-list.jsx — Mobile-optimised shared shopping list with live claiming

const { useState, useEffect, useCallback } = React;

const SHOPPER_NAME_KEY = 'lifeos:shopper-name';

function loadSavedName() {
  try { return localStorage.getItem(SHOPPER_NAME_KEY) || ''; } catch { return ''; }
}
function saveName(n) {
  try { localStorage.setItem(SHOPPER_NAME_KEY, n); } catch { /* */ }
}

function SharedList({ token }) {
  const [items, setItems] = useState([]);
  const [valid, setValid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shopperName, setShopperName] = useState(loadSavedName);
  const [showNameInput, setShowNameInput] = useState(false);

  const { load, claim, unclaim, subscribe, validateShareToken } = window.__suvedaShopping;

  // Validate token & load initial data
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const ok = await validateShareToken(token);
      if (cancelled) return;
      setValid(ok);
      if (ok) {
        const data = await load(token);
        if (!cancelled) setItems(data);
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [token, load, validateShareToken]);

  // Subscribe to real-time changes
  useEffect(() => {
    if (valid !== true) return;
    const unsub = subscribe((updated) => setItems(updated), token);
    return unsub;
  }, [valid, subscribe]);

  const handleClaim = useCallback(async (itemId, currentSupplier) => {
    if (!shopperName.trim()) {
      setShowNameInput(true);
      return;
    }
    if (currentSupplier === shopperName.trim()) {
      await unclaim(itemId, token);
    } else {
      await claim(itemId, shopperName.trim(), token);
    }
  }, [shopperName, claim, unclaim, token]);

  const handleSetName = useCallback((e) => {
    e.preventDefault();
    const name = e.target.elements.name.value.trim();
    if (name) {
      setShopperName(name);
      saveName(name);
      setShowNameInput(false);
    }
  }, []);

  // Group by category
  const categories = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const totalPrice = items.reduce((t, i) => t + (i.price || 0), 0);
  const claimedCount = items.filter(i => i.supplied_by).length;

  if (loading) {
    return (
      <div style={{
        minHeight: '100%', width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--cream)', color: 'var(--muted)',
        fontSize: 14, fontWeight: 500,
      }}>Loading…</div>
    );
  }

  if (valid === false) {
    return (
      <div style={{
        minHeight: '100%', width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12,
        background: 'var(--cream)', color: 'var(--muted)',
        padding: 40, textAlign: 'center',
      }}>
        <span style={{ fontSize: 48 }}>🔒</span>
        <h2 style={{ fontSize: 18, color: 'var(--dark)', margin: 0 }}>Invalid or expired link</h2>
        <p style={{ fontSize: 13, margin: 0 }}>Ask the list owner for a fresh share link.</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100%', width: '100%',
      background: 'var(--cream)',
      backgroundImage:
        'radial-gradient(at 20% 0%, rgba(246, 209, 16, 0.16) 0%, transparent 40%),' +
        'radial-gradient(at 100% 100%, rgba(129, 206, 235, 0.20) 0%, transparent 50%)',
      color: 'var(--dark)',
      paddingBottom: 40,
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 18px 20px',
        background: 'linear-gradient(135deg, var(--honey) 0%, var(--butter) 100%)',
        color: '#17272D',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 28 }}>🛍️</span>
          <h1 style={{ fontSize: 24, margin: 0, fontWeight: 700 }}>Shopping List</h1>
        </div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          {items.length} items · ~{totalPrice.toLocaleString()} ZAR
          {claimedCount > 0 && ` · ${claimedCount} claimed`}
        </div>
        {/* Name toggle */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, opacity: 0.85 }}>You are:</span>
          {shopperName ? (
            <button
              onClick={() => { setShowNameInput(true); }}
              style={{
                background: 'rgba(23,39,45,0.10)', border: 'none',
                borderRadius: 999, padding: '6px 14px',
                color: '#17272D', fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >{shopperName} ✏️</button>
          ) : (
            <button
              onClick={() => setShowNameInput(true)}
              style={{
                background: 'rgba(23,39,45,0.08)', border: '1px dashed rgba(23,39,45,0.3)',
                borderRadius: 999, padding: '6px 14px',
                color: '#17272D', fontSize: 13, fontWeight: 500,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >Set your name</button>
          )}
        </div>
        {/* Name input */}
        {showNameInput && (
          <form onSubmit={handleSetName} style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                name="name"
                defaultValue={shopperName}
                placeholder="Your name"
                autoFocus
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 12,
                  border: 'none', fontSize: 15, fontFamily: 'inherit',
                  background: 'rgba(255,255,255,0.9)', color: '#333',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '10px 18px', borderRadius: 12,
                  border: 'none', background: '#fff',
                  color: 'var(--terracotta)', fontWeight: 700,
                  fontSize: 14, fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >Save</button>
            </div>
          </form>
        )}
      </div>

      {/* Items grouped by category */}
      <div style={{ padding: '16px 14px' }}>
        {Object.entries(categories).map(([cat, catItems]) => (
          <div key={cat} style={{ marginBottom: 20 }}>
            <h3 style={{
              fontSize: 15, fontWeight: 700, fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
              margin: '0 0 8px 4px', color: 'var(--muted)',
            }}>{cat}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {catItems.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  shopperName={shopperName}
                  onClaim={handleClaim}
                />
              ))}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 14 }}>
            No items yet
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', padding: '0 18px' }}>
        Life OS · Shared shopping list
      </div>
    </div>
  );
}

function ItemCard({ item, shopperName, onClaim }) {
  const isMine = item.supplied_by && item.supplied_by === shopperName;
  const claimed = !!item.supplied_by;

  return (
    <div
      onClick={() => onClaim(item.id, item.supplied_by)}
      style={{
        background: claimed ? (isMine ? '#e8f5e9' : '#f5f5f5') : 'var(--white)',
        border: claimed
          ? (isMine ? '1.5px solid #66bb6a' : '1px solid var(--line)')
          : '1px solid var(--line)',
        borderRadius: 14,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Status icon */}
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0,
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
        {/* Supplier badge */}
        {claimed ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 999,
            background: isMine ? '#66bb6a' : '#e0e0e0',
            color: isMine ? '#fff' : 'var(--muted)',
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {item.supplied_by}
            {isMine && <span style={{ fontSize: 10, marginLeft: 2 }}>✕</span>}
          </div>
        ) : (
          <div style={{
            padding: '4px 10px', borderRadius: 999,
            border: '1px solid var(--terracotta)',
            color: 'var(--terracotta)',
            fontSize: 12, fontWeight: 600,
          }}>
            Claim
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { SharedList });
