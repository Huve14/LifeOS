// screens-modules.jsx — Packing, Documents, Tasks, Budget, Shopping, Housing

// ---------- Module page wrapper ----------
function ModulePage({ title, subtitle, emoji, onBack, children, action }) {
  return (
    <div className="fade-in" style={{ padding: '14px 18px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button
          onClick={onBack}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--white)', border: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: 'var(--dark)',
            boxShadow: 'var(--shadow)',
          }}
        >‹</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{emoji}</span>
            <h1 style={{ fontSize: 22 }}>{title}</h1>
          </div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ---------- PACKING ----------
function PackingScreen({ state, setState, onBack, onAsk }) {
  const [room, setRoom] = React.useState(state.packing.rooms[0].id);
  const cur = state.packing.rooms.find(r => r.id === room);

  const totalItems = state.packing.rooms.flatMap(r => r.items).length;
  const packed = state.packing.rooms.flatMap(r => r.items).filter(i => i.status === 'packed').length;

  function setItemStatus(itemId, status) {
    setState(s => ({
      ...s,
      packing: {
        ...s.packing,
        rooms: s.packing.rooms.map(r => r.id === room ? {
          ...r,
          items: r.items.map(it => it.id === itemId ? { ...it, status } : it),
        } : r),
      },
    }));
  }

  return (
    <ModulePage
      title="Packing"
      subtitle={`${packed} of ${totalItems} items packed`}
      emoji="📦"
      onBack={onBack}
      action={<Button size="sm" variant="ghost" icon="✨" onClick={() => onAsk(`What might I be forgetting in my ${cur.label.toLowerCase()}?`, `Suveda's ${cur.label} packing list: ${cur.items.map(i => i.name).join(', ')}`)}>AI</Button>}
    >
      {/* Room tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, marginBottom: 4 }}>
        {state.packing.rooms.map(r => {
          const active = r.id === room;
          const total = r.items.length;
          const done = r.items.filter(i => i.status === 'packed').length;
          return (
            <button
              key={r.id}
              onClick={() => setRoom(r.id)}
              style={{
                flexShrink: 0,
                padding: '10px 14px',
                borderRadius: 16,
                background: active ? 'var(--terracotta)' : 'var(--white)',
                color: active ? '#fff' : 'var(--dark)',
                border: `1px solid ${active ? 'transparent' : 'var(--line)'}`,
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, fontWeight: 600,
                boxShadow: active ? 'none' : 'var(--shadow)',
              }}
            >
              <span style={{ fontSize: 16 }}>{r.emoji}</span>
              {r.label}
              <span style={{
                fontSize: 11, opacity: 0.85,
                background: active ? 'rgba(255,255,255,0.25)' : 'var(--sand)',
                padding: '2px 7px', borderRadius: 999,
              }}>{done}/{total}</span>
            </button>
          );
        })}
      </div>

      {/* Item list */}
      <Card padding="6px">
        {cur.items.map((item, i) => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 12px',
            borderBottom: i < cur.items.length - 1 ? '1px solid var(--line)' : 'none',
          }}>
            <Checkbox
              checked={item.status === 'packed'}
              onChange={(c) => setItemStatus(item.id, c ? 'packed' : 'pending')}
            />
            <div style={{ flex: 1, fontSize: 14, fontWeight: 500,
              textDecoration: item.status === 'packed' ? 'line-through' : 'none',
              color: item.status === 'packed' ? 'var(--muted)' : 'var(--dark)',
            }}>
              {item.name}
            </div>
            <select
              value={item.status}
              onChange={e => setItemStatus(item.id, e.target.value)}
              style={{
                border: 'none', background: 'transparent',
                fontSize: 0, width: 0, position: 'absolute', opacity: 0, pointerEvents: 'none',
              }}
            />
            <StatusPicker status={item.status} onChange={(st) => setItemStatus(item.id, st)} />
          </div>
        ))}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Button full variant="soft" icon="＋">Add item to {cur.label}</Button>
      </div>
    </ModulePage>
  );
}

function StatusPicker({ status, onChange }) {
  const opts = ['packed', 'toBuy', 'missing', 'pending'];
  const next = (cur) => {
    const i = opts.indexOf(cur);
    return opts[(i + 1) % opts.length];
  };
  if (status === 'pending' || !status) {
    return (
      <button
        onClick={() => onChange(next(status || 'pending'))}
        style={{
          fontSize: 11, color: 'var(--muted)', fontWeight: 600,
          padding: '4px 8px', border: '1px dashed var(--line)', borderRadius: 999,
        }}
      >set</button>
    );
  }
  return (
    <button onClick={() => onChange(next(status))}>
      <Badge status={status} size="sm" />
    </button>
  );
}

// ---------- DOCUMENTS ----------
function DocumentsScreen({ state, setState, onBack, onAsk }) {
  const done = state.documents.filter(d => d.status === 'done').length;

  function toggle(id) {
    setState(s => ({
      ...s,
      documents: s.documents.map(d => d.id === id ? { ...d, status: d.status === 'done' ? 'pending' : 'done' } : d),
    }));
  }

  return (
    <ModulePage
      title="Documents"
      subtitle={`${done} of ${state.documents.length} sorted`}
      emoji="📑"
      onBack={onBack}
      action={<Button size="sm" variant="ghost" icon="✨" onClick={() => onAsk('What documents do I need to enter UAE on an employment visa?', 'Suveda is moving from her home country to Abu Dhabi on a UAE employment visa.')}>AI</Button>}
    >
      <ProgressBar value={done} total={state.documents.length} color="var(--teal)" height={8} showLabel />

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.documents.map(doc => (
          <Card key={doc.id} padding="14px 16px" onClick={() => toggle(doc.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14,
                background: doc.status === 'done' ? 'var(--teal)' : 'var(--sand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
                filter: doc.status === 'done' ? 'grayscale(0.3) brightness(1.4)' : 'none',
              }}>{doc.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700,
                  textDecoration: doc.status === 'done' ? 'line-through' : 'none',
                  color: doc.status === 'done' ? 'var(--muted)' : 'var(--dark)',
                }}>{doc.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{doc.note}</div>
              </div>
              <Badge status={doc.status} size="sm" />
            </div>
          </Card>
        ))}
      </div>
    </ModulePage>
  );
}

// ---------- TASKS / TIMELINE ----------
function TasksScreen({ state, setState, onBack }) {
  const groups = ['90+ days', '60 days', '30 days', '14 days', '7 days', 'Move day', 'After'];
  const grouped = groups.map(g => ({
    when: g,
    items: state.tasks.filter(t => t.when === g),
  }));
  const days = daysUntil(state.moveDate);

  function toggle(id) {
    setState(s => ({
      ...s,
      tasks: s.tasks.map(t => t.id === id ? { ...t, status: t.status === 'done' ? 'pending' : 'done' } : t),
    }));
  }

  return (
    <ModulePage
      title="Timeline"
      subtitle={`${days} days to wheels up`}
      emoji="🗓️"
      onBack={onBack}
    >
      {/* Spine timeline */}
      <div style={{ position: 'relative', paddingLeft: 28 }}>
        <div style={{
          position: 'absolute', left: 13, top: 8, bottom: 8,
          width: 2, background: 'var(--line)',
        }} />
        {grouped.map((group, gi) => {
          const allDone = group.items.length > 0 && group.items.every(t => t.status === 'done');
          const anyDone = group.items.some(t => t.status === 'done');
          return (
            <div key={group.when} style={{ marginBottom: 18, position: 'relative' }}>
              <div style={{
                position: 'absolute', left: -22, top: 4,
                width: 16, height: 16, borderRadius: '50%',
                background: allDone ? 'var(--teal)' : (anyDone ? 'var(--gold)' : 'var(--white)'),
                border: `3px solid ${allDone ? 'var(--teal)' : (anyDone ? 'var(--gold)' : 'var(--line)')}`,
                boxShadow: '0 0 0 4px var(--cream)',
              }} />
              <div style={{
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
                color: 'var(--terracotta)', marginBottom: 8,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>{group.when}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.items.map(t => (
                  <Card key={t.id} padding="12px 14px" onClick={() => toggle(t.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Checkbox checked={t.status === 'done'} onChange={() => toggle(t.id)} />
                      <div style={{ flex: 1, fontSize: 14, fontWeight: 500,
                        textDecoration: t.status === 'done' ? 'line-through' : 'none',
                        color: t.status === 'done' ? 'var(--muted)' : 'var(--dark)',
                      }}>{t.text}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ModulePage>
  );
}

// ---------- BUDGET ----------
function BudgetScreen({ state, setState, onBack }) {
  const totalPlanned = state.budget.categories.reduce((a, c) => a + c.planned, 0);
  const totalSpent   = state.budget.categories.reduce((a, c) => a + c.spent, 0);
  const fx = state.budget.fxToUSD;

  function tweak(catId, delta) {
    setState(s => ({
      ...s,
      budget: {
        ...s.budget,
        categories: s.budget.categories.map(c =>
          c.id === catId ? { ...c, spent: Math.max(0, Math.min(c.planned, c.spent + delta)) } : c
        ),
      },
    }));
  }

  return (
    <ModulePage
      title="Budget"
      subtitle="AED · ~USD"
      emoji="💰"
      onBack={onBack}
    >
      {/* Total card */}
      <Card padding="20px" style={{ background: 'linear-gradient(135deg, var(--teal) 0%, #1e524f 100%)', color: '#fff', border: 'none' }}>
        <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Spent so far</div>
        <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 36, lineHeight: 1, marginTop: 4 }}>
          {totalSpent.toLocaleString()}
          <span style={{ fontSize: 16, opacity: 0.7, marginLeft: 6, fontWeight: 600 }}>AED</span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          of {totalPlanned.toLocaleString()} AED · ~${Math.round(totalPlanned * fx).toLocaleString()} USD
        </div>
        <div style={{ marginTop: 14 }}>
          <ProgressBar value={totalSpent} total={totalPlanned} color="var(--gold)" height={8} />
        </div>
      </Card>

      {/* Categories */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.budget.categories.map(c => {
          const pct = Math.round((c.spent / c.planned) * 100);
          const over = c.spent >= c.planned;
          return (
            <Card key={c.id} padding="14px 16px">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 12,
                  background: 'var(--sand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0,
                }}>{c.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700 }}>{c.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: over ? 'var(--terracotta)' : 'var(--dark)' }}>
                      {c.spent.toLocaleString()}<span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}> / {c.planned.toLocaleString()}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: 7 }}>
                    <ProgressBar value={c.spent} total={c.planned} color={over ? 'var(--terracotta)' : 'var(--gold)'} height={6} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => tweak(c.id, -100)} style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'var(--sand)', fontSize: 16, fontWeight: 700, color: 'var(--muted)',
                }}>−</button>
                <button onClick={() => tweak(c.id, 100)} style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'var(--terracotta)', color: '#fff', fontSize: 16, fontWeight: 700,
                }}>＋</button>
              </div>
            </Card>
          );
        })}
      </div>
    </ModulePage>
  );
}

// ---------- SHOPPING / TO BUY ----------
function ShoppingScreen({ state, setState, onBack, onAsk }) {
  const [filter, setFilter] = React.useState('all');
  const cats = ['all', ...new Set(state.shopping.map(s => s.cat))];
  const list = filter === 'all' ? state.shopping : state.shopping.filter(s => s.cat === filter);
  const total = state.shopping.reduce((a, s) => a + (s.price || 0), 0);

  function toggle(id) {
    setState(s => ({
      ...s,
      shopping: s.shopping.map(it => it.id === id ? { ...it, status: it.status === 'packed' ? 'toBuy' : 'packed' } : it),
    }));
  }

  return (
    <ModulePage
      title="To buy"
      subtitle={`${state.shopping.length} items · ~${total} AED`}
      emoji="🛍️"
      onBack={onBack}
      action={<Button size="sm" variant="ghost" icon="✨" onClick={() => onAsk('What are 5 small things to buy in Abu Dhabi for my new apartment?', 'Suveda is setting up a studio in Al Khalifa City.')}>AI</Button>}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
        {cats.map(c => (
          <Pill key={c} active={filter === c} onClick={() => setFilter(c)}>
            {c === 'all' ? 'All' : c}
          </Pill>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map(item => (
          <Card key={item.id} padding="14px 16px" onClick={() => toggle(item.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Checkbox checked={item.status === 'packed'} onChange={() => toggle(item.id)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600,
                  textDecoration: item.status === 'packed' ? 'line-through' : 'none',
                  color: item.status === 'packed' ? 'var(--muted)' : 'var(--dark)',
                }}>{item.name}</div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                  <span>{item.cat}</span>
                  {item.price && <><span>·</span><span>{item.price} AED</span></>}
                </div>
              </div>
              {item.status !== 'packed' && <Badge status={item.status} size="sm" />}
              {item.status === 'packed' && <span style={{ fontSize: 16 }}>✅</span>}
            </div>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <Button full variant="soft" icon="＋">Add something</Button>
      </div>
    </ModulePage>
  );
}

// ---------- HOUSING ----------
function HousingScreen({ state, setState, onBack, onAsk }) {
  const statusColors = {
    shortlisted: 'var(--teal)',
    viewing:     'var(--gold)',
    considering: 'var(--muted)',
  };

  return (
    <ModulePage
      title="Housing"
      subtitle="Al Khalifa City · 3 saved"
      emoji="🏠"
      onBack={onBack}
      action={<Button size="sm" variant="ghost" icon="✨" onClick={() => onAsk('What should I look for when renting in Al Khalifa City, Abu Dhabi?')}>AI</Button>}
    >
      {/* Search criteria */}
      <Card padding="16px" style={{ background: 'var(--sand)', border: 'none' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Looking for</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {['Studio – 1BR', 'Al Khalifa City', '< 5,500 AED', 'Furnished ok', 'Near mosque'].map(t => (
            <span key={t} style={{
              background: 'var(--white)', padding: '5px 11px',
              borderRadius: 999, fontSize: 12, fontWeight: 500, color: 'var(--dark)',
              border: '1px solid var(--line)',
            }}>{t}</span>
          ))}
        </div>
      </Card>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {state.housing.map(h => (
          <Card key={h.id} padding="0" style={{ overflow: 'hidden' }}>
            {/* Photo placeholder */}
            <div style={{
              height: 110,
              background: `linear-gradient(135deg, var(--sand) 0%, ${statusColors[h.status]}22 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              <div style={{ fontSize: 48, opacity: 0.4 }}>🏢</div>
              <div style={{ position: 'absolute', top: 10, right: 10 }}>
                <span style={{
                  background: statusColors[h.status], color: '#fff',
                  fontSize: 11, fontWeight: 600, padding: '4px 10px',
                  borderRadius: 999, textTransform: 'capitalize',
                }}>{h.status}</span>
              </div>
              <div style={{ position: 'absolute', bottom: 10, left: 12, color: 'var(--dark)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{h.area} · {h.size}</div>
              </div>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <h3 style={{ fontSize: 15, lineHeight: 1.3 }}>{h.name}</h3>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 16, color: 'var(--terracotta)', whiteSpace: 'nowrap' }}>
                  {h.rent.toLocaleString()}<span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}> /mo</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700, marginBottom: 4 }}>👍 Pros</div>
                  {h.pros.map(p => (
                    <div key={p} style={{ fontSize: 12, color: 'var(--dark)', lineHeight: 1.5 }}>• {p}</div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--terracotta)', fontWeight: 700, marginBottom: 4 }}>👎 Cons</div>
                  {h.cons.map(p => (
                    <div key={p} style={{ fontSize: 12, color: 'var(--dark)', lineHeight: 1.5 }}>• {p}</div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <Button full variant="soft" icon="＋">Save another listing</Button>
      </div>
    </ModulePage>
  );
}

Object.assign(window, {
  PackingScreen, DocumentsScreen, TasksScreen, BudgetScreen, ShoppingScreen, HousingScreen,
});
