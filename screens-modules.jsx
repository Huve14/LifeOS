// screens-modules.jsx — Packing, Documents, Tasks, Budget, Shopping, Housing

// ---------- Module page wrapper ----------
function ModulePage({ title, subtitle, emoji, icon, onBack, children, action }) {
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
            {icon ? (
              <AnimatedIcon name={icon} size={20} style={{ color: 'var(--terracotta)' }} />
            ) : (
              <span style={{ fontSize: 20 }}>{emoji}</span>
            )}
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

let _id = 0;
function uid() { return `id_${++_id}_${Date.now()}`; }
const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--line)',
  borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
  background: 'var(--cream)', outline: 'none',
  boxSizing: 'border-box',
};

// ---------- PACKING (inspired by Things 3) ----------
function PackingScreen({ state, setState, onBack, onAsk }) {
  const rooms = state.packing?.rooms || [];
  const [room, setRoom] = React.useState(rooms[0]?.id || '');
  const cur = rooms.find(r => r.id === room);
  const totalItems = rooms.flatMap(r => r.items || []).length;
  const packed = rooms.flatMap(r => r.items || []).filter(i => i.status === 'packed').length;
  const pct = totalItems > 0 ? Math.round((packed / totalItems) * 100) : 0;
  const inputRef = React.useRef(null);

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

  function cycleStatus(cur) {
    const order = ['pending', 'packed', 'toBuy', 'missing'];
    return order[(order.indexOf(cur || 'pending') + 1) % order.length];
  }

  function addPackingItem() {
    const name = newItem.trim();
    if (!name) return;
    setState(s => ({
      ...s,
      packing: {
        ...s.packing,
        rooms: s.packing.rooms.map(r => r.id === room ? {
          ...r,
          items: [...r.items, { id: uid(), name, status: 'pending' }],
        } : r),
      },
    }));
    setNewItem('');
    setAdding(false);
  }

  function removePackingItem(itemId) {
    setState(s => ({
      ...s,
      packing: {
        ...s.packing,
        rooms: s.packing.rooms.map(r => r.id === room ? {
          ...r,
          items: r.items.filter(it => it.id !== itemId),
        } : r),
      },
    }));
  }

  React.useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  return (
    <ModulePage
      title="Packing"
      subtitle={`${packed} of ${totalItems} · ${pct}%`}
      icon="Package"
      onBack={onBack}
      action={<Button size="sm" variant="ghost" icon="✨" onClick={() => onAsk(`What might I be forgetting in my ${cur?.label.toLowerCase()}?`, `Suveda's ${cur?.label} packing list: ${cur?.items.map(i => i.name).join(', ')}`)}>AI</Button>}
    >
      {/* Room tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, marginBottom: 4 }}>
        {state.packing.rooms.map(r => {
          const active = r.id === room;
          const done = r.items.filter(i => i.status === 'packed').length;
          const total = r.items.length;
          const rpct = Math.round((done / total) * 100);
          return (
            <button
              key={r.id}
              onClick={() => setRoom(r.id)}
              style={{
                flexShrink: 0, padding: '10px 14px', borderRadius: 16,
                background: active ? 'var(--terracotta)' : 'var(--white)',
                color: active ? '#fff' : 'var(--dark)',
                border: `1px solid ${active ? 'transparent' : 'var(--line)'}`,
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                boxShadow: active ? '0 4px 12px rgba(196,113,74,0.3)' : 'var(--shadow)',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{r.emoji}</span>
              {r.label}
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: active ? 'rgba(255,255,255,0.25)' : 'var(--sand)',
                padding: '2px 7px', borderRadius: 999,
              }}>{rpct > 0 ? `${rpct}%` : `${done}/${total}`}</span>
            </button>
          );
        })}
      </div>

      {/* Item list */}
      <Card padding="4px">
        {cur?.items.map((item, i) => {
          const isPacked = item.status === 'packed';
          const statusColors = { packed: '#66bb6a', toBuy: 'var(--gold)', missing: 'var(--terracotta)', pending: 'var(--muted)' };
          const statusLabels = { packed: '✓ Packed', toBuy: '🛒 Buy', missing: '❓ Missing', pending: '○ Pending' };
          const bg = isPacked ? '#f0faf0' : 'transparent';
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', margin: '2px 0',
              borderRadius: 10, background: bg,
              transition: 'background 0.15s',
            }}>
              <button
                onClick={() => setItemStatus(item.id, isPacked ? 'pending' : 'packed')}
                style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: isPacked ? '#66bb6a' : 'var(--cream)',
                  border: isPacked ? 'none' : '1.5px solid var(--line)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >{isPacked ? '✓' : ''}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 500,
                  textDecoration: isPacked ? 'line-through' : 'none',
                  color: isPacked ? 'var(--muted)' : 'var(--dark)',
                }}>{item.name}</div>
              </div>
              <button
                onClick={() => setItemStatus(item.id, cycleStatus(item.status))}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px',
                  borderRadius: 999, border: 'none', fontFamily: 'inherit', cursor: 'pointer',
                  background: `${statusColors[item.status || 'pending']}18`,
                  color: statusColors[item.status || 'pending'],
                }}
              >{statusLabels[item.status || 'pending']}</button>
              <button
                onClick={() => removePackingItem(item.id)}
                style={{
                  fontSize: 14, padding: '4px', border: 'none',
                  background: 'none', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit',
                  opacity: 0.4,
                }}
              >✕</button>
            </div>
          );
        })}
        {adding && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPackingItem()}
              placeholder="Item name..."
              style={{
                flex: 1, padding: '8px 10px', border: '1px solid var(--line)',
                borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
                background: 'var(--cream)', outline: 'none',
              }}
            />
            <Button size="sm" onClick={addPackingItem}>Add</Button>
            <button onClick={() => { setAdding(false); setNewItem(''); }} style={{
              fontSize: 18, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit',
            }}>✕</button>
          </div>
        )}
      </Card>

      {/* Overall room progress bar */}
      <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--white)', borderRadius: 14, boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>{cur?.label}</span>
          <span style={{ color: 'var(--muted)' }}>{cur?.items.filter(i => i.status === 'packed').length} / {cur?.items.length} done</span>
        </div>
        <ProgressBar value={cur?.items.filter(i => i.status === 'packed').length || 0} total={cur?.items.length || 1} color="var(--terracotta)" height={6} />
      </div>

      <div style={{ marginTop: 12 }}>
        <Button full variant="soft" icon="＋" onClick={() => setAdding(true)}>Add item</Button>
      </div>
    </ModulePage>
  );
}

// ---------- DOCUMENTS (inspired by Notion) ----------
const DOC_PHASES = [
  { id: 'predeparture', label: 'Before you fly', color: 'var(--gold)' },
  { id: 'arrival', label: 'First 30 days', color: 'var(--teal)' },
  { id: 'settle', label: 'Settle in', color: 'var(--terracotta)' },
];

const DOC_PHASE_MAP = {
  passport: 'predeparture', attest: 'predeparture',
  medical: 'arrival', eid: 'arrival',
  license: 'arrival',
};

function DocumentsScreen({ state, setState, onBack, onAsk }) {
  const [filter, setFilter] = React.useState('all');
  const [showAdd, setShowAdd] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newNote, setNewNote] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [newFileUrl, setNewFileUrl] = React.useState('');
  const [newFileName, setNewFileName] = React.useState('');
  const fileRef = React.useRef(null);
  const done = state.documents.filter(d => d.status === 'done').length;

  function toggle(id) {
    setState(s => ({
      ...s,
      documents: s.documents.map(d => d.id === id ? { ...d, status: d.status === 'done' ? 'pending' : 'done' } : d),
    }));
  }

  function deleteDoc(id) {
    setState(s => ({ ...s, documents: s.documents.filter(d => d.id !== id) }));
  }

  async function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await window.__suvedaPhotos?.upload(file);
      if (url) { setNewFileUrl(url); setNewFileName(file.name); }
    } catch (err) { console.warn('Upload failed:', err); }
    setUploading(false);
  }

  function addDoc() {
    if (!newName.trim()) return;
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setState(s => ({
      ...s,
      documents: [...s.documents, { id, name: newName.trim(), status: 'pending', emoji: '📄', note: newNote.trim() || '', fileUrl: newFileUrl, fileName: newFileName }],
    }));
    setNewName(''); setNewNote(''); setNewFileUrl(''); setNewFileName(''); setShowAdd(false);
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid var(--line)',
    borderRadius: 10, fontSize: 14, fontFamily: 'inherit',
    background: 'var(--white)', color: 'var(--dark)', boxSizing: 'border-box',
  };

  const grouped = DOC_PHASES.map(phase => ({
    ...phase,
    items: state.documents.filter(d => (DOC_PHASE_MAP[d.id] || 'predeparture') === phase.id),
  }));

  const filtered = filter === 'all'
    ? grouped
    : grouped.map(g => ({ ...g, items: g.items.filter(d => d.status === filter) }));

  return (
    <ModulePage
      title="Documents"
      subtitle={`${done} of ${state.documents.length} sorted`}
      icon="FileText"
      onBack={onBack}
      action={
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="sm" variant="ghost" icon="✨" onClick={() => onAsk('What documents do I need to enter UAE on an employment visa?')}>AI</Button>
        </div>
      }
    >
      <Card padding="18px" style={{ background: 'linear-gradient(135deg, var(--teal) 0%, #1e524f 100%)', color: '#fff', border: 'none', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>Document readiness</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 28, fontWeight: 800, marginTop: 2 }}>{Math.round((done / state.documents.length) * 100)}%</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.8 }}>
            <div>{done} done</div>
            <div>{state.documents.length - done} remaining</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <ProgressBar value={done} total={state.documents.length} color="var(--gold)" height={8} />
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
        {[
          { id: 'all', label: `All ${state.documents.length}`, color: 'var(--dark)' },
          { id: 'pending', label: 'To do', color: 'var(--muted)' },
          { id: 'done', label: 'Done', color: '#66bb6a' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '8px 14px', borderRadius: 999, border: 'none',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: filter === f.id ? f.color : 'var(--white)',
            color: filter === f.id ? '#fff' : 'var(--dark)',
            boxShadow: filter === f.id ? 'none' : 'var(--shadow)',
            transition: 'all 0.15s',
          }}>{f.label}</button>
        ))}
      </div>

      {filtered.map(phase => {
        if (phase.items.length === 0) return null;
        return (
          <div key={phase.id} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 4 }}>
              <div style={{ width: 3, height: 18, borderRadius: 2, background: phase.color }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{phase.label}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {phase.items.filter(d => d.status === 'done').length}/{phase.items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {phase.items.map(doc => {
                const isDone = doc.status === 'done';
                const hasNote = !!doc.note;
                const isCustom = doc.id.startsWith('custom-');
                return (
                  <Card key={doc.id} padding="12px 14px" onClick={() => toggle(doc.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: isDone ? 'var(--teal)' : 'var(--sand)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20, flexShrink: 0,
                        filter: isDone ? 'grayscale(0.2) brightness(1.3)' : 'none',
                        transition: 'all 0.15s',
                      }}>{doc.emoji}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700,
                          textDecoration: isDone ? 'line-through' : 'none',
                          color: isDone ? 'var(--muted)' : 'var(--dark)',
                        }}>{doc.name}</div>
                        {hasNote && !isDone && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{doc.note}</div>}
                        {doc.fileUrl && !isDone && <div style={{ fontSize: 11, color: 'var(--terracotta)', marginTop: 2 }}>📎 {doc.fileName || 'Attached'}</div>}
                      </div>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                        background: isDone ? '#66bb6a' : 'var(--cream)',
                        border: isDone ? 'none' : '1.5px solid var(--line)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 11, fontWeight: 700,
                      }}>{isDone ? '✓' : ''}</div>
                      {isCustom && !isDone && (
                        <button onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }} style={{
                          width: 28, height: 28, borderRadius: 8, border: 'none',
                          background: 'var(--cream)', color: 'var(--muted)',
                          fontSize: 14, cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>✕</button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      <button onClick={() => setShowAdd(true)} style={{
        width: '100%', padding: 14, marginTop: 8,
        borderRadius: 16, border: '2px dashed var(--line)',
        background: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
        color: 'var(--muted)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 6,
      }}>＋ Add document</button>

      {showAdd && (
        <Modal visible onClose={() => { setShowAdd(false); setNewFileUrl(''); setUploading(false); }}>
          <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Add document</h2>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Marriage certificate" style={inputStyle} />
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginTop: 14, marginBottom: 4 }}>Note (optional)</label>
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Any details…" rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginTop: 14, marginBottom: 4 }}>File (optional — PDF or image)</label>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" onChange={onFileChange} style={{ fontSize: 12, color: 'var(--muted)', width: '100%' }} />
            {uploading && <div style={{ fontSize: 12, color: 'var(--terracotta)', marginTop: 6 }}>Uploading…</div>}
            {newFileUrl && <div style={{ fontSize: 12, color: '#66bb6a', marginTop: 6 }}>✓ File attached</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <Button full variant="ghost" onClick={() => { setShowAdd(false); setNewFileUrl(''); setUploading(false); }}>Cancel</Button>
              <Button full onClick={addDoc} disabled={!newName.trim()}>Add</Button>
            </div>
          </div>
        </Modal>
      )}
    </ModulePage>
  );
}

// ---------- TASKS / TIMELINE (inspired by Linear) ----------
function TasksScreen({ state, setState, onBack }) {
  const groups = ['90+ days', '60 days', '30 days', '14 days', '7 days', 'Move day', 'After'];
  const [adding, setAdding] = React.useState(false);
  const [newTask, setNewTask] = React.useState('');
  const [newWhen, setNewWhen] = React.useState(groups[0]);
  const [view, setView] = React.useState('calendar');
  const GlassCalendar = React.useMemo(() => {
    try { return window.GlassCalendar; } catch { return null; }
  }, [view]);
  const grouped = groups.map(g => ({
    when: g,
    items: state.tasks.filter(t => t.when === g),
  }));
  const days = daysUntil(state.moveDate);
  const allDone = state.tasks.filter(t => t.status === 'done').length;
  const moveDate = new Date(state.moveDate + 'T00:00:00');

  const tasksWithDates = React.useMemo(() => {
    const now = new Date(); now.setHours(0,0,0,0);
    return state.tasks.map(t => {
      let date = null;
      if (t.when === 'Move day') date = new Date(moveDate);
      else if (t.when === 'After') date = null;
      else {
        const num = parseInt(t.when);
        if (!isNaN(num)) {
          date = new Date(now);
          date.setDate(date.getDate() + num);
        }
      }
      return { ...t, date };
    });
  }, [state.tasks, moveDate]);

  function toggle(id) {
    setState(s => ({
      ...s,
      tasks: s.tasks.map(t => t.id === id ? { ...t, status: t.status === 'done' ? 'pending' : 'done' } : t),
    }));
  }

  function addTask() {
    const text = newTask.trim();
    if (!text) return;
    setState(s => ({
      ...s,
      tasks: [...s.tasks, { id: uid(), text, status: 'pending', when: newWhen }],
    }));
    setNewTask('');
    setAdding(false);
  }

  function removeTask(id) {
    setState(s => ({
      ...s,
      tasks: s.tasks.filter(t => t.id !== id),
    }));
  }

  return (
    <ModulePage
      title="Timeline"
      subtitle={`${days} days · ${allDone} of ${state.tasks.length} done`}
      icon="CalendarDays"
      onBack={onBack}
      action={
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="ghost" icon={view === 'calendar' ? '📋' : '📅'} onClick={() => setView(v => v === 'calendar' ? 'list' : 'calendar')}>
            {view === 'calendar' ? 'List' : 'Calendar'}
          </Button>
          <Button size="sm" variant="ghost" icon="＋" onClick={() => setAdding(true)}>Add</Button>
        </div>
      }
    >
      {view === 'calendar' && GlassCalendar ? (
        <div>
          <GlassCalendar
            tasks={tasksWithDates}
            selectedDate={new Date()}
          />
        </div>
      ) : (
        <>
          {/* Countdown hero */}
          <Card padding="18px" style={{
            background: 'linear-gradient(135deg, var(--gold) 0%, #c49a3a 100%)', color: '#fff', border: 'none', marginBottom: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>Countdown</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 36, fontWeight: 800, marginTop: 2 }}>
                  {days}<span style={{ fontSize: 16, fontWeight: 600, opacity: 0.85, marginLeft: 4 }}>days</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 22, fontWeight: 700 }}>{allDone}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>tasks done</div>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <ProgressBar value={allDone} total={state.tasks.length} color="#fff" height={6} />
            </div>
          </Card>

          {/* Timeline spine */}
          <div style={{ position: 'relative', paddingLeft: 28 }}>
            <div style={{
              position: 'absolute', left: 13, top: 8, bottom: 8,
              width: 2, background: 'var(--line)',
            }} />
            {grouped.map((group, gi) => {
              if (group.items.length === 0) return null;
              const groupDone = group.items.filter(t => t.status === 'done').length;
              const allGroupDone = groupDone === group.items.length;
              const anyDone = groupDone > 0;
              const daysNum = parseInt(group.when);
              const urgency = !isNaN(daysNum) && daysNum <= days ? 'overdue' : (anyDone ? 'progress' : 'pending');
              return (
                <div key={group.when} style={{ marginBottom: 18, position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: -22, top: 4,
                    width: 16, height: 16, borderRadius: '50%',
                    background: allGroupDone ? '#66bb6a' : (anyDone ? 'var(--gold)' : 'var(--white)'),
                    border: `3px solid ${allGroupDone ? '#66bb6a' : (anyDone ? 'var(--gold)' : 'var(--line)')}`,
                    boxShadow: '0 0 0 4px var(--cream)',
                    zIndex: 1,
                  }} />
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                  }}>
                    <span style={{
                      fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
                      color: allGroupDone ? '#66bb6a' : 'var(--terracotta)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {group.when}
                      {allGroupDone && <span style={{ fontSize: 11, color: '#66bb6a' }}>✓ All done</span>}
                    </span>
                    {urgency === 'overdue' && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--terracotta)', background: 'var(--terracotta)15', padding: '2px 8px', borderRadius: 999 }}>OVERDUE</span>
                    )}
                    {allGroupDone && <span style={{ fontSize: 14 }}>🎯</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {group.items.map(t => {
                      const isDone = t.status === 'done';
                      return (
                        <div
                          key={t.id}
                          onClick={() => toggle(t.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderRadius: 10,
                            background: isDone ? '#f0faf0' : 'var(--white)',
                            border: `1px solid ${isDone ? '#d4edd4' : 'var(--line)'}`,
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                        >
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: isDone ? '#66bb6a' : 'var(--cream)',
                            border: isDone ? 'none' : '1.5px solid var(--line)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 10, fontWeight: 700,
                          }}>{isDone ? '✓' : ''}</div>
                          <div style={{
                            flex: 1, fontSize: 13, fontWeight: 500,
                            textDecoration: isDone ? 'line-through' : 'none',
                            color: isDone ? 'var(--muted)' : 'var(--dark)',
                          }}>{t.text}</div>
                          {!isDone && (
                            <div style={{
                              width: 4, height: 4, borderRadius: '50%',
                              background: urgency === 'overdue' ? 'var(--terracotta)' : 'var(--muted)',
                              flexShrink: 0, opacity: 0.4,
                            }} />
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); removeTask(t.id); }}
                            style={{
                              fontSize: 12, padding: '2px', border: 'none',
                              background: 'none', cursor: 'pointer', color: 'var(--muted)',
                              fontFamily: 'inherit', opacity: 0.4,
                            }}
                          >✕</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {adding && (
            <Card padding="14px" style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTask()}
                  placeholder="Task description..."
                  style={{
                    flex: 1, padding: '8px 10px', border: '1px solid var(--line)',
                    borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
                    background: 'var(--cream)', outline: 'none',
                  }}
                />
                <Button size="sm" onClick={addTask}>Add</Button>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {groups.map(g => (
                  <Pill key={g} active={newWhen === g} onClick={() => setNewWhen(g)}>{g}</Pill>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </ModulePage>
  );
}

// ---------- BUDGET (inspired by YNAB / Monzo / Copilot) ----------
const MONTHLY_BUDGET = window.MONTHLY_BUDGET;

function BudgetScreen({ state, setState, onBack }) {
  const [tab, setTab] = React.useState('monthly');
  const monthly = state.budget.monthly || MONTHLY_BUDGET;
  const income = state.budget.monthlyIncome || 8800;
  const totalFixed = monthly.filter(c => c.fixed).reduce((a, c) => a + (c.planned || 0), 0);
  const totalSpentMonthly = monthly.reduce((a, c) => a + (c.spent || 0), 0);
  const totalPlannedMonthly = monthly.reduce((a, c) => a + (c.planned || 0), 0);
  const remainingMonthly = income - totalSpentMonthly;
  const savingsPct = Math.round(((monthly.find(c => c.id === 'savings')?.planned || 1500) / income) * 100);

  const [showZAR, setShowZAR] = React.useState(false);
  const [addingMonthly, setAddingMonthly] = React.useState(false);
  const [addingMove, setAddingMove] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState('');
  const [newEmoji, setNewEmoji] = React.useState('📋');
  const [newPlanned, setNewPlanned] = React.useState('');
  const [newFixed, setNewFixed] = React.useState(false);
  const FX = 4.5;
  const cur = showZAR ? 'ZAR' : 'AED';
  const conv = (v) => showZAR ? Math.round(v * FX) : v;
  const totalPlanned = state.budget.categories.reduce((a, c) => a + c.planned, 0);
  const totalSpent = state.budget.categories.reduce((a, c) => a + c.spent, 0);
  const fx = state.budget.fxToUSD || 0.272;

  function addMonthlyCategory() {
    const label = newLabel.trim();
    if (!label) return;
    setState(s => ({
      ...s,
      budget: {
        ...s.budget,
        monthly: [...(s.budget.monthly || MONTHLY_BUDGET), {
          id: uid(), label, emoji: newEmoji, planned: parseInt(newPlanned) || 0, spent: 0, fixed: newFixed,
        }],
      },
    }));
    setNewLabel(''); setNewPlanned(''); setNewEmoji('📋'); setNewFixed(false); setAddingMonthly(false);
  }

  function removeMonthlyCategory(id) {
    setState(s => ({
      ...s,
      budget: { ...s.budget, monthly: (s.budget.monthly || MONTHLY_BUDGET).filter(c => c.id !== id) },
    }));
  }

  function addMoveCategory() {
    const label = newLabel.trim();
    if (!label) return;
    setState(s => ({
      ...s,
      budget: {
        ...s.budget,
        categories: [...s.budget.categories, {
          id: uid(), label, emoji: newEmoji, planned: parseInt(newPlanned) || 0, spent: 0,
        }],
      },
    }));
    setNewLabel(''); setNewPlanned(''); setNewEmoji('📋'); setAddingMove(false);
  }

  function removeMoveCategory(id) {
    setState(s => ({
      ...s,
      budget: { ...s.budget, categories: s.budget.categories.filter(c => c.id !== id) },
    }));
  }

  function tweakMonthly(catId, delta) {
    setState(s => {
      const cats = (s.budget.monthly || MONTHLY_BUDGET).map(c =>
        c.id === catId ? { ...c, spent: Math.max(0, Math.min(c.planned || Infinity, (c.spent || 0) + delta)) } : c
      );
      return { ...s, budget: { ...s.budget, monthly: cats } };
    });
  }

  function tweakMove(catId, delta) {
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

  const ringSvg = (pct, color) => {
    const r = 40, circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    return (
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--cream)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round" transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
    );
  };

  const catRow = (c, tweakFn, onRemove) => {
    const pct = c.planned > 0 ? Math.round(((c.spent || 0) / c.planned) * 100) : 0;
    const over = c.spent >= c.planned;
    const remaining = (c.planned || 0) - (c.spent || 0);
    return (
      <div key={c.id} style={{
        background: 'var(--white)', borderRadius: 16, padding: '14px 16px',
        boxShadow: 'var(--shadow)', marginBottom: 10,
        border: over ? '1px solid #fecaca' : '1px solid var(--line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--sand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>{c.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700 }}>{c.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: over ? 'var(--terracotta)' : 'var(--dark)' }}>
                  {conv(c.spent || 0).toLocaleString()}
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}> / {conv(c.planned).toLocaleString()}</span>
                </div>
                {onRemove && (
                  <button onClick={e => { e.stopPropagation(); onRemove(c.id); }} style={{
                    fontSize: 12, padding: '2px', border: 'none', background: 'none',
                    cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit', opacity: 0.4,
                  }}>✕</button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {remaining > 0 ? `${conv(remaining).toLocaleString()} ${cur} left` : 'Fully spent'}
              {c.fixed && ' · Fixed'}
            </div>
            <div style={{ marginTop: 6 }}>
              <ProgressBar value={c.spent || 0} total={c.planned || 1} color={over ? 'var(--terracotta)' : 'var(--gold)'} height={6} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => tweakFn(c.id, -100)} style={{
            width: 28, height: 28, borderRadius: 8, border: 'none',
            background: 'var(--sand)', fontSize: 16, fontWeight: 700, color: 'var(--muted)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>−</button>
          <button onClick={() => tweakFn(c.id, 100)} style={{
            width: 28, height: 28, borderRadius: 8, border: 'none',
            background: 'var(--terracotta)', color: '#fff', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>＋</button>
        </div>
      </div>
    );
  };

  const addForm = (onSubmit) => (
    <Card padding="14px" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={newEmoji} onChange={e => setNewEmoji(e.target.value)} placeholder="Emoji" style={{...inputStyle, width: 50, textAlign: 'center'}} />
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Category name" style={{...inputStyle, flex: 1}} onKeyDown={e => e.key === 'Enter' && onSubmit()} />
        <input value={newPlanned} onChange={e => setNewPlanned(e.target.value)} placeholder="Amount" type="number" style={{...inputStyle, width: 80}} onKeyDown={e => e.key === 'Enter' && onSubmit()} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Pill active={newFixed} onClick={() => setNewFixed(v => !v)}>Fixed</Pill>
        <Button size="sm" onClick={onSubmit}>Add</Button>
        <Button size="sm" variant="ghost" onClick={() => { setAddingMonthly(false); setAddingMove(false); }}>Cancel</Button>
      </div>
    </Card>
  );

  return (
    <ModulePage
      title="Budget"
      subtitle={tab === 'monthly' ? `${conv(income).toLocaleString()} ${cur} / mo` : `${conv(totalPlanned).toLocaleString()} ${cur}`}
      icon="Wallet"
      onBack={onBack}
    >
      <div style={{ display: 'flex', gap: 4, background: 'var(--sand)', borderRadius: 12, padding: 3, marginBottom: 8 }}>
        {[
          { id: 'monthly', label: `📆 Monthly · ${conv(income).toLocaleString()} ${cur}` },
          { id: 'move', label: `✈️ Move · ${conv(totalPlanned).toLocaleString()} ${cur}` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: tab === t.id ? 'var(--white)' : 'transparent',
              color: tab === t.id ? 'var(--dark)' : 'var(--muted)',
              boxShadow: tab === t.id ? 'var(--shadow)' : 'none',
              transition: 'all 0.15s',
            }}
          >{t.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => setShowZAR(v => !v)} style={{
          padding: '6px 14px', borderRadius: 8, border: '1px solid var(--line)',
          background: 'var(--white)', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', color: showZAR ? 'var(--terracotta)' : 'var(--teal)',
        }}>
          {showZAR ? '🇿🇦 ZAR' : '🇦🇪 AED'} · tap to swap
        </button>
      </div>

      {tab === 'monthly' ? (
        <>
          <Card padding="14px" style={{ background: 'var(--teal)', color: '#fff', border: 'none', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9, marginBottom: 2 }}>SABIS covers</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>
              Housing (Rent), Health Insurance, Transport — all handled by your employer. The categories below are your personal spending.
            </div>
          </Card>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 18 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {ringSvg(Math.round((totalSpentMonthly / income) * 100), 'var(--teal)')}
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 18, fontWeight: 800, color: 'var(--dark)' }}>{conv(income).toLocaleString()}</div>
                <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{cur}</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Monthly income</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 22, fontWeight: 800, color: 'var(--teal)', marginTop: 2 }}>{conv(income).toLocaleString()} {cur}</div>
              {!showZAR && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                ≈ {(income * 4.5).toLocaleString()} ZAR · {(income * 0.27).toLocaleString()} USD
              </div>}
              {showZAR && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                ≈ {Math.round(income).toLocaleString()} AED · {(income * 0.27).toLocaleString()} USD
              </div>}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
                <div><span style={{ fontWeight: 700 }}>Fixed:</span> {conv(totalFixed).toLocaleString()} {cur}</div>
                <div><span style={{ fontWeight: 700 }}>Left:</span> <span style={{ color: remainingMonthly > 0 ? '#66bb6a' : 'var(--terracotta)' }}>{conv(remainingMonthly).toLocaleString()} {cur}</span></div>
              </div>
            </div>
          </div>

          {monthly.map(c => catRow(c, tweakMonthly, removeMonthlyCategory))}

          {addingMonthly && addForm(addMonthlyCategory)}
          <div style={{ marginTop: 14 }}>
            <Button full variant="soft" icon="＋" onClick={() => { setAddingMonthly(true); setAddingMove(false); }}>Add category</Button>
          </div>
        </>
      ) : (
        <>
          <Card padding="20px" style={{ background: 'linear-gradient(135deg, var(--teal) 0%, #1e524f 100%)', color: '#fff', border: 'none', marginBottom: 16 }}>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Move checklist</div>
            <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 36, lineHeight: 1, marginTop: 4 }}>
              {conv(totalSpent).toLocaleString()}
              <span style={{ fontSize: 16, opacity: 0.7, marginLeft: 6, fontWeight: 600 }}>{cur}</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
              of {conv(totalPlanned).toLocaleString()} {cur}
            </div>
            <div style={{ marginTop: 14 }}>
              <ProgressBar value={totalSpent} total={totalPlanned} color="var(--gold)" height={8} />
            </div>
          </Card>

          {state.budget.categories.map(c => {
            const isSABIS = ['visa', 'deposit'].includes(c.id);
            const isDefault = ['shipping', 'visa', 'deposit', 'buffer'].includes(c.id);
            return (
              <div key={c.id} style={{
                background: 'var(--white)', borderRadius: 16, padding: '14px 16px',
                boxShadow: 'var(--shadow)', marginBottom: 10,
                border: isSABIS ? '1px solid var(--teal)' : '1px solid var(--line)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: isSABIS ? 'var(--teal)' : 'var(--sand)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                  }}>
                    {isSABIS ? '✅' : c.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div>
                        <span style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700 }}>{c.label}</span>
                        {isSABIS && (
                          <span style={{
                            marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px',
                            borderRadius: 999, background: 'var(--teal)', color: '#fff',
                          }}>SABIS</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isSABIS ? 'var(--teal)' : 'var(--dark)' }}>
                          {conv(c.planned).toLocaleString()} {cur}
                        </div>
                        {!isDefault && (
                          <button onClick={() => removeMoveCategory(c.id)} style={{
                            fontSize: 12, padding: '2px', border: 'none', background: 'none',
                            cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit', opacity: 0.4,
                          }}>✕</button>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {isSABIS ? 'Covered by SABIS' : `${conv(c.spent).toLocaleString()} ${cur} spent`}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <ProgressBar value={isSABIS ? c.planned : (c.spent || 0)} total={c.planned || 1} color={isSABIS ? 'var(--teal)' : 'var(--gold)'} height={6} />
                    </div>
                  </div>
                </div>
                {!isSABIS && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => tweakMove(c.id, -100)} style={{
                      width: 28, height: 28, borderRadius: 8, border: 'none',
                      background: 'var(--sand)', fontSize: 16, fontWeight: 700, color: 'var(--muted)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>−</button>
                    <button onClick={() => tweakMove(c.id, 100)} style={{
                      width: 28, height: 28, borderRadius: 8, border: 'none',
                      background: 'var(--terracotta)', color: '#fff', fontSize: 16, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>＋</button>
                  </div>
                )}
              </div>
            );
          })}

          {addingMove && addForm(addMoveCategory)}
          <div style={{ marginTop: 14 }}>
            <Button full variant="soft" icon="＋" onClick={() => { setAddingMove(true); setAddingMonthly(false); }}>Add move item</Button>
          </div>
        </>
      )}
    </ModulePage>
  );
}

// ---------- SHOPPING / TO BUY ----------
function ShoppingScreen({ state, setState, onBack, onAsk }) {
  const [filter, setFilter] = React.useState('all');
  const [shareLink, setShareLink] = React.useState('');
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newCat, setNewCat] = React.useState('Essentials');
  const [newPrice, setNewPrice] = React.useState('');
  const cats = ['all', ...new Set(state.shopping.map(s => s.cat))];
  const list = filter === 'all' ? state.shopping : state.shopping.filter(s => s.cat === filter);
  const total = state.shopping.reduce((a, s) => a + (s.price || 0), 0);

  function toggle(id) {
    setState(s => ({
      ...s,
      shopping: s.shopping.map(it => it.id === id ? { ...it, status: it.status === 'packed' ? 'toBuy' : 'packed' } : it),
    }));
  }

  function addShoppingItem() {
    const name = newName.trim();
    if (!name) return;
    setState(s => ({
      ...s,
      shopping: [...s.shopping, {
        id: uid(), name, cat: newCat, price: parseInt(newPrice) || 0, status: 'toBuy',
      }],
    }));
    setNewName(''); setNewPrice(''); setAdding(false);
  }

  function removeShoppingItem(id) {
    setState(s => ({
      ...s,
      shopping: s.shopping.filter(it => it.id !== id),
    }));
  }

  async function handleShare() {
    const token = await window.__suvedaShopping.generateShareToken('Family Share');
    if (token) {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const url = isLocal
        ? `${window.location.origin}/shared.html#${token}`
        : `${window.location.origin}/s/${token}`;
      setShareLink(url);
      try {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } catch {}
    }
  }

  return (
    <ModulePage
      title="To buy"
      subtitle={`${state.shopping.length} items · ~${total} ZAR`}
      icon="ShoppingCart"
      onBack={onBack}
      action={<div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="ghost" icon="🔗" onClick={handleShare}>
          {linkCopied ? 'Copied!' : 'Share'}
        </Button>
        <Button size="sm" variant="ghost" icon="✨" onClick={() => onAsk('What are 5 small things to buy in Abu Dhabi for my new apartment?', 'Suveda is setting up a studio in Al Khalifa City.')}>AI</Button>
      </div>}
    >
      {shareLink && (
        <div style={{
          padding: '10px 14px', borderRadius: 12, marginBottom: 14,
          background: 'var(--sand)', fontSize: 12, color: 'var(--muted)',
          wordBreak: 'break-all', border: '1px solid var(--line)',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--dark)', marginBottom: 4 }}>🔗 Shared link</div>
          {shareLink}
        </div>
      )}

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
                  {item.price && <><span>·</span><span>{item.price} ZAR</span></>}
                </div>
              </div>
              {item.status !== 'packed' && <Badge status={item.status} size="sm" />}
              {item.status === 'packed' && <span style={{ fontSize: 16 }}>✅</span>}
              <button
                onClick={e => { e.stopPropagation(); removeShoppingItem(item.id); }}
                style={{
                  fontSize: 14, padding: '2px', border: 'none',
                  background: 'none', cursor: 'pointer', color: 'var(--muted)',
                  fontFamily: 'inherit', opacity: 0.4,
                }}
              >✕</button>
            </div>
          </Card>
        ))}
      </div>

      {adding && (
        <Card padding="14px" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addShoppingItem()}
              placeholder="Item name..."
              style={{
                flex: 1, padding: '8px 10px', border: '1px solid var(--line)',
                borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
                background: 'var(--cream)', outline: 'none',
              }}
            />
            <input
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
              placeholder="Price"
              type="number"
              style={{
                width: 80, padding: '8px 10px', border: '1px solid var(--line)',
                borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
                background: 'var(--cream)', outline: 'none',
              }}
            />
            <Button size="sm" onClick={addShoppingItem}>Add</Button>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['Essentials', 'Kitchen', 'Tech', 'Furniture', 'Decor'].map(c => (
              <Pill key={c} active={newCat === c} onClick={() => setNewCat(c)}>{c}</Pill>
            ))}
          </div>
        </Card>
      )}

      <div style={{ marginTop: 14 }}>
        <Button full variant="soft" icon="＋" onClick={() => setAdding(true)}>Add something</Button>
      </div>
    </ModulePage>
  );
}

// ---------- APARTMENT DECORATION (was Housing) ----------
function HousingScreen({ state, setState, onBack, onAsk }) {
  const rooms = state.housing?.rooms || [
    { id: 'living', label: 'Living Room', emoji: '🛋️', photos: [], tips: '' },
    { id: 'bedroom', label: 'Bedroom', emoji: '🛏️', photos: [], tips: '' },
    { id: 'kitchen', label: 'Kitchen', emoji: '🍳', photos: [], tips: '' },
    { id: 'bathroom', label: 'Bathroom', emoji: '🚿', photos: [], tips: '' },
    { id: 'balcony', label: 'Balcony / Entry', emoji: '🌿', photos: [], tips: '' },
  ];
  const [activeRoom, setActiveRoom] = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const [aiTips, setAiTips] = React.useState({});
  const [loadingTips, setLoadingTips] = React.useState({});
  const fileRef = React.useRef(null);

  function getRooms() {
    return state.housing?.rooms || rooms;
  }

  function setRooms(newRooms) {
    setState(s => ({ ...s, housing: { ...(s.housing || {}), rooms: newRooms } }));
  }

  async function handleRoomUpload(roomId, files) {
    if (!files || !files.length) return;
    setUploading(true);
    const urls = [];
    for (const file of files) {
      try {
        const url = await window.__suvedaPhotos?.upload(file);
        if (url) urls.push(url);
      } catch {}
    }
    if (urls.length > 0) {
      setRooms(getRooms().map(r =>
        r.id === roomId ? { ...r, photos: [...r.photos, ...urls] } : r
      ));
    }
    setUploading(false);
  }

  function removeRoomPhoto(roomId, photoUrl) {
    setRooms(getRooms().map(r =>
      r.id === roomId ? { ...r, photos: r.photos.filter(p => p !== photoUrl) } : r
    ));
  }

  async function getDecorationTips(room) {
    setLoadingTips(t => ({ ...t, [room.id]: true }));
    const photoContext = room.photos.length > 0 ? `Photos of the ${room.label}: ${room.photos.join(', ')}` : '';
    const prompt = `I'm setting up my ${room.label} in Al Khalifa City, Abu Dhabi. Give me 3 practical decoration tips for a ${room.photos.length > 0 ? 'room (see attached photos)' : 'studio apartment'}. Focus on affordable, easy-to-find items in UAE (IKEA, Dragon Mart, online). Keep each tip to 1 sentence.`;
    try {
      const tips = await askHuve(prompt, photoContext);
      setRooms(getRooms().map(r =>
        r.id === room.id ? { ...r, tips } : r
      ));
      setAiTips(t => ({ ...t, [room.id]: tips }));
    } catch {}
    setLoadingTips(t => ({ ...t, [room.id]: false }));
  }

  return (
    <ModulePage
      title="Apartment Decor"
      subtitle="SABIS provides housing — make it yours"
      icon="Building2"
      onBack={onBack}
    >
      {/* SABIS info card */}
      <Card padding="16px" style={{ background: 'var(--teal)', color: '#fff', border: 'none', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 32 }}>✅</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Housing covered by SABIS</div>
            <div style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.4 }}>
              Your employer provides accommodation in Al Khalifa City. Use this space to plan how you'll decorate and personalise it.
            </div>
          </div>
        </div>
      </Card>

      {/* Room grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {getRooms().map(room => (
          <button
            key={room.id}
            onClick={() => setActiveRoom(room)}
            style={{
              padding: '20px 12px', borderRadius: 16, border: '2px solid var(--line)',
              background: activeRoom?.id === room.id ? 'var(--sand)' : 'var(--white)',
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
              transition: 'all 0.15s',
              position: 'relative',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 6 }}>{room.emoji}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{room.label}</div>
            {room.photos.length > 0 && (
              <div style={{
                position: 'absolute', top: 8, right: 8,
                background: 'var(--terracotta)', color: '#fff',
                fontSize: 10, fontWeight: 700, padding: '2px 6px',
                borderRadius: 999,
              }}>{room.photos.length}</div>
            )}
          </button>
        ))}
      </div>

      {/* Active room detail */}
      {activeRoom && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <SectionHeader title={`${activeRoom.emoji} ${activeRoom.label}`} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="ghost" icon="📸" onClick={() => fileRef.current?.click()}>
                {uploading ? '...' : 'Add photo'}
              </Button>
              <Button size="sm" variant="teal" icon="✨" onClick={() => getDecorationTips(activeRoom)} disabled={loadingTips[activeRoom.id]}>
                {loadingTips[activeRoom.id] ? '...' : 'AI tips'}
              </Button>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => { handleRoomUpload(activeRoom.id, e.target.files); e.target.value = ''; }}
          />

          {/* Room photos */}
          {activeRoom.photos.length > 0 ? (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
              marginBottom: 14,
            }}>
              {activeRoom.photos.map((url, i) => (
                <div key={i} style={{
                  position: 'relative', aspectRatio: '1',
                  borderRadius: 12, overflow: 'hidden',
                  background: 'var(--sand)',
                }}>
                  <img src={url} alt={`${activeRoom.label} ${i}`} style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                  }} />
                  <button
                    onClick={() => removeRoomPhoto(activeRoom.id, url)}
                    style={{
                      position: 'absolute', top: 4, right: 4, width: 20, height: 20,
                      borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)',
                      color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                padding: '24px', borderRadius: 16, border: '2px dashed var(--line)',
                textAlign: 'center', cursor: 'pointer', marginBottom: 14,
                background: 'var(--cream)',
              }}
            >
              <div style={{ fontSize: 24, color: 'var(--muted)' }}>📸</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Tap to add photos of this room</div>
            </div>
          )}

          {/* AI decoration tips */}
          {(aiTips[activeRoom.id] || loadingTips[activeRoom.id]) && (
            <Card padding="14px" style={{ background: 'var(--sand)', border: 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                {loadingTips[activeRoom.id] ? 'Getting tips...' : `${activeRoom.emoji} Decoration tips`}
              </div>
              {loadingTips[activeRoom.id] ? (
                <div style={{ display: 'flex', gap: 4, padding: '12px 0' }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{
                      width: 7, height: 7, borderRadius: '50%', background: 'var(--muted)',
                      animation: `pop 0.6s ${i * 0.15}s infinite alternate`,
                    }} />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--dark)' }}>
                  {aiTips[activeRoom.id]}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {!activeRoom && (
        <div style={{
          padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13,
        }}>
          Tap a room above to add photos and get AI decoration tips
        </div>
      )}
    </ModulePage>
  );
}

// ---------- MEMORY LANE (Goodbye module) ----------
function MemoryScreen({ state, setState, onBack }) {
  const lastTimes = state.memories?.lastTimes || [];
  const goodbyes = state.memories?.goodbyes || [];
  const photos = state.memories?.photos || [];
  const ltDone = lastTimes.filter(m => m.done).length;
  const gbDone = goodbyes.filter(g => g.done).length;
  const [uploading, setUploading] = React.useState(false);
  const [showPhotos, setShowPhotos] = React.useState(false);
  const fileRef = React.useRef(null);

  function toggle(id, field) {
    setState(s => ({
      ...s,
      memories: {
        ...s.memories,
        [field]: (s.memories?.[field] || []).map(m =>
          m.id === id ? { ...m, done: !m.done } : m
        ),
      },
    }));
  }

  async function handleUpload(files) {
    if (!files || !files.length) return;
    setUploading(true);
    const urls = [];
    for (const file of files) {
      try {
        const url = await window.__suvedaPhotos?.upload(file);
        if (url) urls.push({ id: uid(), url, caption: '', createdAt: Date.now() });
      } catch {}
    }
    if (urls.length > 0) {
      setState(s => ({
        ...s,
        memories: {
          ...s.memories,
          photos: [...(s.memories?.photos || []), ...urls],
        },
      }));
    }
    setUploading(false);
  }

  function removePhoto(id) {
    setState(s => ({
      ...s,
      memories: {
        ...s.memories,
        photos: (s.memories?.photos || []).filter(p => p.id !== id),
      },
    }));
  }

  function updateCaption(id, caption) {
    setState(s => ({
      ...s,
      memories: {
        ...s.memories,
        photos: (s.memories?.photos || []).map(p => p.id === id ? { ...p, caption } : p),
      },
    }));
  }

  return (
    <ModulePage
      title="Memory Lane"
      subtitle={`${photos.length} photos · ${ltDone + gbDone} memories`}
      icon="Camera"
      onBack={onBack}
      action={
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="ghost" icon="📸" onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Add photo'}
          </Button>
        </div>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => { handleUpload(e.target.files); e.target.value = ''; }}
      />

      {/* Photo gallery */}
      {photos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <SectionHeader title={`📸 Photos  · ${photos.length}`} />
            <button
              onClick={() => setShowPhotos(v => !v)}
              style={{
                fontSize: 12, fontWeight: 600, color: 'var(--terracotta)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', padding: '4px 12px',
              }}
            >{showPhotos ? 'Collapse ↑' : 'Animate grid ↓'}</button>
          </div>
          {showPhotos ? (
            <MemoryPhotoGrid images={photos.map(p => p.url)} />
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))', gap: 6,
            }}>
              {photos.map(p => (
                <div key={p.id} style={{
                  position: 'relative', aspectRatio: '1',
                  borderRadius: 12, overflow: 'hidden',
                  background: 'var(--sand)',
                  cursor: 'pointer',
                }}
                  onClick={() => setShowPhotos(true)}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <img src={p.url} alt={p.caption || 'Memory'} style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                  }} />
                </div>
              ))}
              {/* Add more button */}
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  aspectRatio: '1', borderRadius: 12,
                  border: '2px dashed var(--line)',
                  background: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, color: 'var(--muted)', fontFamily: 'inherit',
                }}
              >＋</button>
            </div>
          )}
        </div>
      )}

      {/* Upload prompt when no photos */}
      {photos.length === 0 && (
        <div style={{
          marginBottom: 20, padding: '30px 20px',
          background: 'var(--white)',
          borderRadius: 20, border: '2px dashed var(--line)',
          textAlign: 'center',
          cursor: 'pointer',
        }}
          onClick={() => fileRef.current?.click()}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>📸</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
            Upload your memories
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            Photos of your favourite spots, the chai shop, the park bench, your neighbourhood.<br />
            <span style={{ fontWeight: 600, color: 'var(--terracotta)' }}>Tap to add photos</span>
          </div>
        </div>
      )}

      {/* Photo upload bar (shown when user has selected files) */}
      {uploading && (
        <div style={{
          padding: '12px 16px', borderRadius: 12,
          background: 'var(--sand)', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            border: '2px solid var(--terracotta)',
            borderTopColor: 'transparent',
            animation: 'spin 0.6s linear infinite',
          }} />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Uploading photos…</span>
        </div>
      )}

      {/* One last time */}
      <div style={{ marginBottom: 20, padding: '18px 20px', background: 'linear-gradient(135deg, var(--gold)20, var(--terracotta)15)', borderRadius: 20, border: '1px solid var(--line)' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🌅</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>One last time</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Leaving a place is also about honouring what you're saying goodbye to. Tick these off before you fly.
        </div>
      </div>

      <SectionHeader title={`Last times  · ${ltDone}/${lastTimes.length}`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        {lastTimes.map(m => {
          const done = m.done;
          return (
            <div key={m.id} onClick={() => toggle(m.id, 'lastTimes')} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 12,
              background: done ? '#f0faf0' : 'var(--white)',
              border: `1px solid ${done ? '#d4edd4' : 'var(--line)'}`,
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: done ? '#66bb6a' : 'var(--cream)',
                border: done ? 'none' : '1.5px solid var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 11, fontWeight: 700,
              }}>{done ? '✓' : ''}</div>
              <div style={{
                flex: 1, fontSize: 14, fontWeight: 500,
                textDecoration: done ? 'line-through' : 'none',
                color: done ? 'var(--muted)' : 'var(--dark)',
              }}>{m.text}</div>
              <span style={{ fontSize: 18, opacity: done ? 0.3 : 0.5 }}>💛</span>
              <button onClick={e => { e.stopPropagation(); setState(s => ({...s, memories: {...s.memories, lastTimes: (s.memories?.lastTimes||[]).filter(x => x.id !== m.id)}})); }} style={{fontSize:12,padding:'2px',border:'none',background:'none',cursor:'pointer',color:'var(--muted)',fontFamily:'inherit',opacity:0.4}}>✕</button>
            </div>
          );
        })}
      </div>

      <SectionHeader title={`Goodbyes  · ${gbDone}/${goodbyes.length}`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {goodbyes.map(g => {
          const done = g.done;
          return (
            <Card key={g.id} padding="12px 14px" onClick={() => toggle(g.id, 'goodbyes')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: done ? '#66bb6a' : 'var(--sand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>{done ? '💚' : '👋'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    textDecoration: done ? 'line-through' : 'none',
                    color: done ? 'var(--muted)' : 'var(--dark)',
                  }}>{g.name}</div>
                  {g.note && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{g.note}</div>}
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: done ? '#66bb6a' : 'var(--cream)',
                  border: done ? 'none' : '1.5px solid var(--line)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 10, fontWeight: 700,
                }}>{done ? '✓' : ''}</div>
                <button onClick={e => { e.stopPropagation(); setState(s => ({...s, memories: {...s.memories, goodbyes: (s.memories?.goodbyes||[]).filter(x => x.id !== g.id)}})); }} style={{fontSize:12,padding:'2px',border:'none',background:'none',cursor:'pointer',color:'var(--muted)',fontFamily:'inherit',opacity:0.4}}>✕</button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Upload link at bottom */}
      <div style={{ marginTop: 16 }}>
        <Button full variant="soft" icon="📸" onClick={() => fileRef.current?.click()}>
          Upload photos & memories
        </Button>
      </div>
    </ModulePage>
  );
}

// ---------- HABIT TRACKER ----------
function HabitsScreen({ state, setState, onBack }) {
  const habits = state.habits || [];
  const today = new Date().toISOString().slice(0, 10);
  const doneToday = habits.filter(h => h.lastDone === today).length;
  const totalStreak = habits.reduce((a, h) => a + (h.streak || 0), 0);

  function checkIn(id) {
    setState(s => ({
      ...s,
      habits: (s.habits || []).map(h => {
        if (h.id !== id) return h;
        const already = h.lastDone === today;
        const newStreak = already ? h.streak - 1 : (h.streak || 0) + 1;
        return {
          ...h,
          streak: Math.max(0, newStreak),
          lastDone: already ? '' : today,
        };
      }),
    }));
  }

  return (
    <ModulePage
      title="Habits"
      subtitle={`${doneToday}/${habits.length} today · ${totalStreak} total streak`}
      icon="Target"
      onBack={onBack}
    >
      {/* Streak summary */}
      <Card padding="18px" style={{
        background: 'linear-gradient(135deg, var(--teal) 0%, #1e524f 100%)',
        color: '#fff', border: 'none', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>Today's progress</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 32, fontWeight: 800, marginTop: 2 }}>
              {doneToday}<span style={{ fontSize: 16, fontWeight: 600, opacity: 0.85, marginLeft: 4 }}>/{habits.length}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 22, fontWeight: 700 }}>🔥 {totalStreak}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>total streak days</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <ProgressBar value={doneToday} total={habits.length} color="var(--gold)" height={8} />
        </div>
      </Card>

      {/* Habit list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {habits.map(h => {
          const done = h.lastDone === today;
          return (
            <Card key={h.id} padding="14px 16px" onClick={() => checkIn(h.id)} accent={done ? 'var(--teal)' : undefined}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: done ? 'var(--teal)' : 'var(--sand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, flexShrink: 0,
                }}>{h.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    color: done ? 'var(--muted)' : 'var(--dark)',
                    textDecoration: done ? 'line-through' : 'none',
                  }}>{h.name}</div>
                  <div style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    <span>🔥 {h.streak || 0} day{(h.streak || 0) !== 1 ? 's' : ''}</span>
                    {done && <span style={{ color: 'var(--teal)', fontWeight: 600 }}>✓ Done</span>}
                    {!done && h.lastDone && h.lastDone !== today && (
                      <span>Last: {new Date(h.lastDone).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <Checkbox checked={done} onChange={() => checkIn(h.id)} color="var(--teal)" />
              </div>
            </Card>
          );
        })}
      </div>

      {habits.length === 0 && (
        <EmptyState
          emoji="🎯"
          title="No habits yet"
          body="Daily habits will appear here once you set them up."
        />
      )}
    </ModulePage>
  );
}

// ---------- PEOPLE & CONTACTS ----------
function ContactsScreen({ state, setState, onBack }) {
  const contacts = state.contacts || [];
  const blankForm = { name: '', role: '', phone: '', email: '', note: '' };
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({...blankForm});

  function update(id, field, value) {
    setState(s => ({
      ...s,
      contacts: (s.contacts || []).map(c => c.id === id ? { ...c, [field]: value } : c),
    }));
  }

  function addContact() {
    if (!form.name.trim()) return;
    setState(s => ({
      ...s,
      contacts: [...(s.contacts || []), {
        id: uid(),
        name: form.name.trim(),
        role: form.role || 'Friend',
        phone: form.phone,
        email: form.email,
        note: form.note,
      }],
    }));
    setForm({...blankForm});
    setShowForm(false);
  }

  function removeContact(id) {
    setState(s => ({
      ...s,
      contacts: (s.contacts || []).filter(c => c.id !== id),
    }));
  }

  return (
    <ModulePage
      title="People"
      subtitle={`${contacts.length} contacts`}
      icon="Users"
      onBack={onBack}
    >
      <div style={{ marginBottom: 18, padding: '16px 18px', background: 'var(--white)', borderRadius: 16, boxShadow: 'var(--shadow)', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>
          🤝 Moving is better with people in your corner.<br />
          <span style={{ fontWeight: 600, color: 'var(--dark)' }}>Here's who matters in this move.</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {contacts.map(c => (
          <Card key={c.id} padding="16px">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--teal), var(--gold))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: 'DM Sans',
              }}>{c.name.charAt(0)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 15, fontWeight: 700 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--terracotta)', fontWeight: 600, marginTop: 1 }}>{c.role}</div>
                  </div>
                  <button
                    onClick={() => removeContact(c.id)}
                    style={{
                      fontSize: 14, padding: '2px', border: 'none',
                      background: 'none', cursor: 'pointer', color: 'var(--muted)',
                      fontFamily: 'inherit', opacity: 0.4,
                    }}
                  >✕</button>
                </div>
                <input
                  value={c.phone || ''}
                  onChange={e => update(c.id, 'phone', e.target.value)}
                  placeholder="Phone"
                  style={{
                    marginTop: 6, width: '100%', padding: '8px 10px',
                    border: '1px solid var(--line)', borderRadius: 8,
                    fontSize: 13, fontFamily: 'inherit', background: 'var(--cream)',
                    color: 'var(--dark)', outline: 'none',
                  }}
                />
                <input
                  value={c.email || ''}
                  onChange={e => update(c.id, 'email', e.target.value)}
                  placeholder="Email"
                  style={{
                    marginTop: 4, width: '100%', padding: '8px 10px',
                    border: '1px solid var(--line)', borderRadius: 8,
                    fontSize: 13, fontFamily: 'inherit', background: 'var(--cream)',
                    color: 'var(--dark)', outline: 'none',
                  }}
                />
                {c.note && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>💡 {c.note}</div>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add contact">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Name *" style={inputStyle} />
          <input value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} placeholder="Role (e.g. Friend, Agent)" style={inputStyle} />
          <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="Phone" style={inputStyle} />
          <input value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="Email" style={inputStyle} />
          <input value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))} placeholder="Note" style={inputStyle} />
          <Button full onClick={addContact}>Add contact</Button>
        </div>
      </Modal>

      <div style={{ marginTop: 14 }}>
        <Button full variant="soft" icon="＋" onClick={() => setShowForm(true)}>Add contact</Button>
      </div>
    </ModulePage>
  );
}

Object.assign(window, {
  ModulePage, PackingScreen, DocumentsScreen, TasksScreen, BudgetScreen, ShoppingScreen, HousingScreen,
  MemoryScreen, HabitsScreen, ContactsScreen, uid,
});
