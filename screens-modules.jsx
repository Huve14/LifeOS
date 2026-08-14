// screens-modules.jsx — Packing, Documents, Tasks, Budget, Shopping, Housing

// ---------- Module page wrapper ----------
function ModulePage({ title, subtitle, emoji, icon, onBack, children, action }) {
  return (
    <main className="module-page fade-in">
      <header className="module-page-header">
        <button
          onClick={onBack}
          className="module-page-back"
          type="button"
          aria-label="Back to home"
          style={{
            background: 'var(--white)', border: '1px solid var(--line)',
            fontSize: 16, fontWeight: 700, color: 'var(--dark)',
            boxShadow: 'var(--shadow)',
          }}
        >‹</button>
        <div className="module-page-heading">
          <div className="module-page-title-row">
            {icon ? (
              <AnimatedIcon name={icon} size={20} style={{ color: 'var(--terracotta)' }} />
            ) : (
              <span style={{ fontSize: 20 }}>{emoji}</span>
            )}
            <h1>{title}</h1>
          </div>
          {subtitle && <div className="module-page-subtitle">{subtitle}</div>}
        </div>
        {action && <div className="module-page-action">{action}</div>}
      </header>
      <div className="module-page-content">{children}</div>
    </main>
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
  const [adding, setAdding] = React.useState(false);
  const [newItem, setNewItem] = React.useState('');
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
        rooms: (s.packing?.rooms || []).map(r => r.id === room ? {
          ...r,
          items: (r.items || []).map(it => it.id === itemId ? { ...it, status } : it),
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
        rooms: (s.packing?.rooms || []).map(r => r.id === room ? {
          ...r,
          items: [...(r.items || []), { id: uid(), name, status: 'pending' }],
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
        rooms: (s.packing?.rooms || []).map(r => r.id === room ? {
          ...r,
          items: (r.items || []).filter(it => it.id !== itemId),
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
      action={<Button size="sm" variant="ghost" icon="✨" onClick={() => onAsk(`What might I be forgetting in my ${cur?.label?.toLowerCase()}?`, `My ${cur?.label} packing list: ${(cur?.items || []).map(i => i.name).join(', ')}`)}>AI help</Button>}
    >
      {/* Room tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, marginBottom: 4 }}>
        {(state.packing?.rooms || []).map(r => {
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
                background: active ? 'var(--honey)' : 'var(--white)',
                color: active ? '#17272D' : 'var(--dark)',
                border: `1px solid ${active ? 'transparent' : 'var(--line)'}`,
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                boxShadow: active ? '0 4px 12px rgba(45,114,139,0.3)' : 'var(--shadow)',
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
        {cur?.items?.map((item, i) => {
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
          <span style={{ color: 'var(--muted)' }}>{cur?.items?.filter(i => i.status === 'packed').length || 0} / {cur?.items?.length || 0} done</span>
        </div>
        <ProgressBar value={cur?.items?.filter(i => i.status === 'packed').length || 0} total={cur?.items?.length || 1} color="var(--terracotta)" height={6} />
      </div>

      <div style={{ marginTop: 12 }}>
        <Button full variant="soft" icon="＋" onClick={() => setAdding(true)}>Add item</Button>
      </div>
    </ModulePage>
  );
}

// ---------- DOCUMENTS (inspired by Notion) ----------
const DOC_PHASES = [
  { id: 'identity', label: 'Identity & residency', color: 'var(--gold)' },
  { id: 'health', label: 'Health & home', color: 'var(--teal)' },
  { id: 'records', label: 'Work & records', color: 'var(--terracotta)' },
  { id: 'personal', label: 'My documents', color: 'var(--blue-ink)' },
];

const DOC_PHASE_MAP = {
  passport: 'identity', eid: 'identity', license: 'identity',
  medical: 'health', attest: 'records',
};

function DocumentsScreen({ state, setState, onBack, onAsk }) {
  const [filter, setFilter] = React.useState('all');
  const [showAdd, setShowAdd] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newNote, setNewNote] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [uploadError, setUploadError] = React.useState('');
  const [openingId, setOpeningId] = React.useState('');
  const fileRef = React.useRef(null);
  const documents = state.documents || [];
  const done = documents.filter(d => d.status === 'done').length;

  function toggle(id) {
    setState(s => ({
      ...s,
      documents: (s.documents || []).map(d => d.id === id ? { ...d, status: d.status === 'done' ? 'pending' : 'done' } : d),
    }));
  }

  async function deleteDoc(doc) {
    if (doc.filePath) await window.__suvedaDocuments?.del(doc.filePath);
    else if (doc.fileUrl) await window.__suvedaPhotos?.del(doc.fileUrl);
    setState(s => ({ ...s, documents: (s.documents || []).filter(d => d.id !== doc.id) }));
  }

  function resetAddForm() {
    setNewName('');
    setNewNote('');
    setSelectedFile(null);
    setUploadError('');
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function closeAdd() {
    if (uploading) return;
    setShowAdd(false);
    resetAddForm();
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadError('');
    if (!newName.trim()) setNewName(file.name.replace(/\.[^.]+$/, ''));
  }

  async function addDoc() {
    if (!newName.trim()) return;
    setUploading(true);
    setUploadError('');

    let filePath = '';
    if (selectedFile) {
      try {
        filePath = await window.__suvedaDocuments?.upload(selectedFile) || '';
      } catch (error) {
        console.warn('Document upload failed:', error);
      }
      if (!filePath) {
        setUploading(false);
        setUploadError('Upload failed. Check your connection and try again.');
        return;
      }
    }

    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setState(s => ({
      ...s,
      documents: [...(s.documents || []), {
        id,
        name: newName.trim(),
        status: 'pending',
        emoji: '📄',
        note: newNote.trim(),
        filePath,
        fileName: selectedFile?.name || '',
      }],
    }));
    setShowAdd(false);
    resetAddForm();
  }

  async function openDocument(doc, event) {
    event.stopPropagation();
    setOpeningId(doc.id);
    try {
      const url = doc.filePath
        ? await window.__suvedaDocuments?.signedUrl(doc.filePath)
        : await window.__suvedaPhotos?.signedUrl(doc.fileUrl);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else setUploadError('This file could not be opened. Please try again.');
    } finally {
      setOpeningId('');
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid var(--line)',
    borderRadius: 10, fontSize: 14, fontFamily: 'inherit',
    background: 'var(--white)', color: 'var(--dark)', boxSizing: 'border-box',
  };

  const grouped = DOC_PHASES.map(phase => ({
    ...phase,
    items: documents.filter(d => (DOC_PHASE_MAP[d.id] || 'personal') === phase.id),
  }));

  const filtered = filter === 'all'
    ? grouped
    : grouped.map(g => ({ ...g, items: g.items.filter(d => d.status === filter) }));

  return (
    <ModulePage
      title="Documents"
      subtitle={`${done} of ${documents.length} organised`}
      icon="FileText"
      onBack={onBack}
      action={<Button size="sm" variant="ghost" icon="✨" onClick={() => onAsk('Help me organise the documents I use for everyday life in the UAE. Point me to official sources for any legal or residency requirements.')}>AI help</Button>}
    >
      <Card padding="18px" style={{ background: 'linear-gradient(135deg, var(--blue-ink) 0%, #2D829F 100%)', color: '#fff', border: 'none', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>Private document vault</div>
            <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 28, fontWeight: 800, marginTop: 2 }}>{documents.length > 0 ? Math.round((done / documents.length) * 100) : 0}%</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.8 }}>
            <div>{done} done</div>
            <div>{documents.length - done} to organise</div>
            <div style={{ marginTop: 3 }}>Only your signed-in account can open files</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <ProgressBar value={done} total={documents.length} color="var(--gold)" height={8} />
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
        {[
          { id: 'all', label: `All ${documents.length}`, color: 'var(--dark)' },
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
                          fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 14, fontWeight: 700,
                          textDecoration: isDone ? 'line-through' : 'none',
                          color: isDone ? 'var(--muted)' : 'var(--dark)',
                        }}>{doc.name}</div>
                        {hasNote && !isDone && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{doc.note}</div>}
                        {(doc.filePath || doc.fileUrl) && (
                          <button
                            onClick={event => openDocument(doc, event)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5,
                              padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                              color: 'var(--terracotta)', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                            }}
                          >📎 {openingId === doc.id ? 'Opening…' : (doc.fileName || 'Open attachment')}</button>
                        )}
                      </div>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                        background: isDone ? '#66bb6a' : 'var(--cream)',
                        border: isDone ? 'none' : '1.5px solid var(--line)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 11, fontWeight: 700,
                      }}>{isDone ? '✓' : ''}</div>
                      {isCustom && !isDone && (
                        <button aria-label={`Delete ${doc.name}`} onClick={e => { e.stopPropagation(); void deleteDoc(doc); }} style={{
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
      }}>＋ Upload or add document</button>

      {showAdd && (
        <Modal open={showAdd} onClose={closeAdd}>
          <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Add document</h2>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Document name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Health insurance card" style={inputStyle} />
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginTop: 14, marginBottom: 4 }}>Note (optional)</label>
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Any details…" rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginTop: 14, marginBottom: 4 }}>Private file (PDF, Word, or image)</label>
            <div className={`document-file-picker${selectedFile ? ' has-file' : ''}`}>
              <input
                ref={fileRef}
                id="document-private-file"
                className="document-file-input"
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                onChange={onFileChange}
                tabIndex={-1}
              />
              <button
                type="button"
                className="document-file-button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <span className="document-file-button-icon" aria-hidden="true">↑</span>
                <span>{selectedFile ? 'Choose a different file' : 'Choose private file'}</span>
              </button>
              <div className="document-file-status" aria-live="polite">
                <strong>{selectedFile ? selectedFile.name : 'No file selected'}</strong>
                <small>
                  {selectedFile
                    ? `${Math.max(0.01, selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready to upload`
                    : 'PDF, Word, PNG, JPG or WebP'}
                </small>
              </div>
            </div>
            {uploading && <div style={{ fontSize: 12, color: 'var(--terracotta)', marginTop: 6 }}>Uploading securely…</div>}
            {uploadError && <div role="alert" style={{ fontSize: 12, color: 'var(--terracotta)', marginTop: 6 }}>{uploadError}</div>}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.45 }}>Files are stored privately and opened with a short-lived secure link.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <Button full variant="ghost" onClick={closeAdd} disabled={uploading}>Cancel</Button>
              <Button full onClick={addDoc} disabled={!newName.trim() || uploading}>{uploading ? 'Uploading…' : (selectedFile ? 'Upload document' : 'Add reference')}</Button>
            </div>
          </div>
        </Modal>
      )}
    </ModulePage>
  );
}

// ---------- TASKS / TIMELINE ----------
function taskDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function taskDateFromKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function taskGroupForDate(value) {
  const date = taskDateFromKey(value);
  if (!date) return 'Ongoing';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAway = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (daysAway <= 0) return 'Today';
  if (daysAway <= 7) return 'This week';
  if (daysAway <= 31) return 'This month';
  return 'Ongoing';
}

function displayTaskDate(value) {
  const date = taskDateFromKey(value);
  if (!date) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function TasksScreen({ state, setState, onBack }) {
  const CalendarComponent = window.GlassCalendar;
  const groups = ['Today', 'This week', 'This month', 'Ongoing'];
  const tasks = state.tasks || [];
  const today = React.useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const [adding, setAdding] = React.useState(false);
  const [newTask, setNewTask] = React.useState('');
  const [newDueDate, setNewDueDate] = React.useState(() => taskDateKey(new Date()));
  const [newTime, setNewTime] = React.useState('');
  const [newPriority, setNewPriority] = React.useState('normal');
  const [selectedDate, setSelectedDate] = React.useState(() => new Date());
  const [view, setView] = React.useState('calendar');
  const [taskFeedback, setTaskFeedback] = React.useState('');
  const taskInputRef = React.useRef(null);
  const composerRef = React.useRef(null);

  const grouped = React.useMemo(() => groups.map(group => ({
    when: group,
    items: tasks.filter(task => (task.dueDate ? taskGroupForDate(task.dueDate) : task.when) === group),
  })), [tasks]);
  const allDone = tasks.filter(task => task.status === 'done').length;

  const tasksWithDates = React.useMemo(() => tasks.map(task => {
    const explicitDate = taskDateFromKey(task.dueDate);
    if (explicitDate) return { ...task, date: explicitDate };
    const date = new Date(today);
    if (task.when === 'This week') date.setDate(date.getDate() + 7);
    else if (task.when === 'This month') date.setDate(date.getDate() + 30);
    else if (task.when !== 'Today') return { ...task, date: null };
    return { ...task, date };
  }), [tasks, today]);

  function openComposer(date = selectedDate) {
    const nextDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    setSelectedDate(nextDate);
    setNewDueDate(taskDateKey(nextDate));
    setAdding(true);
    setTaskFeedback('');
    window.requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      taskInputRef.current?.focus({ preventScroll: true });
    });
  }

  function toggle(id) {
    setState(current => ({
      ...current,
      tasks: (current.tasks || []).map(task => task.id === id
        ? { ...task, status: task.status === 'done' ? 'pending' : 'done' }
        : task),
    }));
  }

  function addTask(event) {
    event?.preventDefault?.();
    const text = newTask.trim();
    const dueDate = taskDateFromKey(newDueDate);
    if (!text) {
      setTaskFeedback('Add a task name first.');
      taskInputRef.current?.focus();
      return;
    }
    if (!dueDate) {
      setTaskFeedback('Choose a valid date.');
      return;
    }
    const id = uid();
    setState(current => ({
      ...current,
      tasks: [...(current.tasks || []), {
        id,
        text: text.slice(0, 160),
        status: 'pending',
        when: taskGroupForDate(newDueDate),
        dueDate: newDueDate,
        time: newTime,
        priority: newPriority,
      }],
    }));
    setSelectedDate(dueDate);
    setNewTask('');
    setNewTime('');
    setNewPriority('normal');
    setAdding(false);
    setTaskFeedback('Added to your calendar.');
    setView('calendar');
  }

  function removeTask(id) {
    setState(current => ({
      ...current,
      tasks: (current.tasks || []).filter(task => task.id !== id),
    }));
  }

  const taskComposer = (
    <section ref={composerRef} className="task-composer" aria-labelledby="task-composer-title">
      <div className="task-composer-heading">
        <div>
          <div className="task-composer-kicker">NEW TASK</div>
          <h2 id="task-composer-title">Add something to your calendar</h2>
          <p>Choose a day and it will appear in the month overview above.</p>
        </div>
        <div className="task-composer-date-chip">{displayTaskDate(newDueDate) || 'Choose date'}</div>
      </div>
      <form onSubmit={addTask} className="task-composer-form">
        <label className="task-field task-field-title">
          <span>Task</span>
          <input
            ref={taskInputRef}
            value={newTask}
            maxLength={160}
            onChange={event => {
              setNewTask(event.target.value);
              if (taskFeedback) setTaskFeedback('');
            }}
            placeholder="What needs to get done?"
            autoComplete="off"
          />
        </label>
        <label className="task-field">
          <span>Date</span>
          <input
            type="date"
            value={newDueDate}
            onChange={event => {
              setNewDueDate(event.target.value);
              const nextDate = taskDateFromKey(event.target.value);
              if (nextDate) setSelectedDate(nextDate);
            }}
            onInput={event => {
              setNewDueDate(event.currentTarget.value);
              const nextDate = taskDateFromKey(event.currentTarget.value);
              if (nextDate) setSelectedDate(nextDate);
            }}
          />
        </label>
        <label className="task-field">
          <span>Time <small>optional</small></span>
          <input
            type="time"
            value={newTime}
            onChange={event => setNewTime(event.target.value)}
            onInput={event => setNewTime(event.currentTarget.value)}
          />
        </label>
        <label className="task-field">
          <span>Priority</span>
          <select value={newPriority} onChange={event => setNewPriority(event.target.value)}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </label>
        <button type="submit" className="task-add-submit" disabled={!newTask.trim()}>
          <span aria-hidden="true">＋</span>
          Add task
        </button>
      </form>
      <div className="task-composer-footer">
        <span className={taskFeedback === 'Added to your calendar.' ? 'task-feedback-success' : ''} role="status" aria-live="polite">
          {taskFeedback || 'Your tasks sync privately with your Life OS account.'}
        </span>
        {view === 'list' && adding ? (
          <button type="button" onClick={() => setAdding(false)}>Cancel</button>
        ) : null}
      </div>
    </section>
  );

  return (
    <ModulePage
      title="Life admin"
      subtitle={`${allDone} of ${tasks.length} complete`}
      icon="CalendarDays"
      onBack={onBack}
      action={
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="ghost" icon={view === 'calendar' ? '📋' : '📅'} onClick={() => setView(current => current === 'calendar' ? 'list' : 'calendar')}>
            {view === 'calendar' ? 'List' : 'Calendar'}
          </Button>
          <Button size="sm" variant="ghost" icon="＋" onClick={() => openComposer(selectedDate)}>Add</Button>
        </div>
      }
    >
      {view === 'calendar' ? (
        <>
          {CalendarComponent ? (
            <CalendarComponent
              tasks={tasksWithDates}
              selectedDate={selectedDate}
              onDateSelect={date => {
                setSelectedDate(date);
                setNewDueDate(taskDateKey(date));
                setTaskFeedback('');
              }}
              onAddTask={openComposer}
              onToggleTask={toggle}
              onDeleteTask={removeTask}
            />
          ) : <div style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>Loading calendar...</div>}
          {taskComposer}
        </>
      ) : (
        <>
          <Card padding="18px" style={{
            background: 'linear-gradient(135deg, var(--honey) 0%, var(--butter) 100%)', color: '#17272D', border: 'none', marginBottom: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>Everyday progress</div>
                <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 36, fontWeight: 800, marginTop: 2 }}>
                  {tasks.length > 0 ? Math.round((allDone / tasks.length) * 100) : 0}<span style={{ fontSize: 16, fontWeight: 600, opacity: 0.85, marginLeft: 4 }}>%</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 22, fontWeight: 700 }}>{allDone}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>tasks done</div>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <ProgressBar value={allDone} total={tasks.length} color="var(--blue-ink)" height={6} />
            </div>
          </Card>

          <div style={{ position: 'relative', paddingLeft: 28 }}>
            <div style={{
              position: 'absolute', left: 13, top: 8, bottom: 8,
              width: 2, background: 'var(--line)',
            }} />
            {grouped.map(group => {
              if (group.items.length === 0) return null;
              const groupDone = group.items.filter(task => task.status === 'done').length;
              const allGroupDone = groupDone === group.items.length;
              const anyDone = groupDone > 0;
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 13, fontWeight: 700,
                      color: allGroupDone ? '#66bb6a' : 'var(--terracotta)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {group.when}
                      {allGroupDone && <span style={{ fontSize: 11, color: '#66bb6a' }}>✓ All done</span>}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {group.items.map(task => {
                      const isDone = task.status === 'done';
                      const dateLabel = displayTaskDate(task.dueDate);
                      return (
                        <div key={task.id} className="task-list-row" data-done={isDone ? 'true' : 'false'}>
                          <button
                            type="button"
                            onClick={() => toggle(task.id)}
                            className="task-list-toggle"
                            aria-label={isDone ? `Mark ${task.text} incomplete` : `Mark ${task.text} complete`}
                          >{isDone ? '✓' : ''}</button>
                          <div className="task-list-copy">
                            <div>{task.text}</div>
                            {dateLabel || task.time ? (
                              <small>{dateLabel}{dateLabel && task.time ? ' · ' : ''}{task.time || ''}</small>
                            ) : null}
                          </div>
                          {task.priority === 'high' ? <span className="task-priority">High</span> : null}
                          <button
                            type="button"
                            onClick={() => removeTask(task.id)}
                            className="task-list-delete"
                            aria-label={`Delete ${task.text}`}
                          >✕</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {adding ? taskComposer : (
            <button type="button" className="task-list-add" onClick={() => openComposer(selectedDate)}>
              ＋ Add another task
            </button>
          )}
        </>
      )}
    </ModulePage>
  );
}

// ---------- BUDGET (inspired by YNAB / Monzo / Copilot) ----------
const MONTHLY_BUDGET = window.MONTHLY_BUDGET;

function LegacyBudgetScreen({ state, setState, onBack }) {
  const [tab, setTab] = React.useState('overview');
  const monthly = state.budget.monthly || MONTHLY_BUDGET;
  const income = state.budget.monthlyIncome || 8800;
  const totalFixed = monthly.filter(c => c.fixed).reduce((a, c) => a + (c.planned || 0), 0);
  const totalSpentMonthly = monthly.reduce((a, c) => a + (c.spent || 0), 0);
  const totalPlannedMonthly = monthly.reduce((a, c) => a + (c.planned || 0), 0);
  const remainingMonthly = income - totalSpentMonthly;
  const savingsCat = monthly.find(c => c.id === 'savings');
  const savingsPlanned = savingsCat?.planned || 1500;
  const savingsPct = Math.round((savingsPlanned / income) * 100);

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
  const cats = state.budget?.categories || [];
  const totalMovePlanned = cats.reduce((a, c) => a + (c.planned || 0), 0);
  const totalMoveSpent = cats.reduce((a, c) => a + (c.spent || 0), 0);
  const movePct = totalMovePlanned > 0 ? Math.round((totalMoveSpent / totalMovePlanned) * 100) : 0;

  const spentPct = income > 0 ? Math.round((totalSpentMonthly / income) * 100) : 0;
  const remainingPct = income > 0 ? Math.round(((income - totalSpentMonthly) / income) * 100) : 0;
  const totalBudgeted = monthly.reduce((a, c) => a + (c.planned || 0), 0);
  const unallocated = income - totalBudgeted;
  const healthScore = (() => {
    if (totalSpentMonthly > income) return { label: 'Over budget', color: 'var(--terracotta)', pct: 25 };
    if (savingsPct >= 15) return { label: 'Great', color: '#66bb6a', pct: 90 };
    if (savingsPct >= 10) return { label: 'Good', color: 'var(--gold)', pct: 70 };
    return { label: 'Low savings', color: 'var(--terracotta)', pct: 40 };
  })();

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
        categories: [...(s.budget?.categories || []), {
          id: uid(), label, emoji: newEmoji, planned: parseInt(newPlanned) || 0, spent: 0,
        }],
      },
    }));
    setNewLabel(''); setNewPlanned(''); setNewEmoji('📋'); setAddingMove(false);
  }

  function removeMoveCategory(id) {
    setState(s => ({
      ...s,
      budget: { ...s.budget, categories: (s.budget?.categories || []).filter(c => c.id !== id) },
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
        categories: (s.budget?.categories || []).map(c =>
          c.id === catId ? { ...c, spent: Math.max(0, Math.min(c.planned, c.spent + delta)) } : c
        ),
      },
    }));
  }

  function getTopCategories(limit) {
    return [...monthly].sort((a, b) => b.planned - a.planned).slice(0, limit);
  }

  const ringSvg = (pct, color, size = 100) => {
    const r = size === 100 ? 40 : 32;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    return (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--cream)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round" transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
    );
  };

  const metricCard = (label, value, sub, accent) => (
    <div style={{
      flex: 1, background: accent || 'var(--white)', borderRadius: 16, padding: '14px 16px',
      boxShadow: 'var(--shadow)', border: '1px solid var(--line)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 20, fontWeight: 800, color: 'var(--dark)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const sectionTitle = (text) => (
    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)', marginTop: 18, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--terracotta)' }} />
      {text}
    </div>
  );

  const catRow = (c, tweakFn, onRemove) => {
    const pct = c.planned > 0 ? Math.round(((c.spent || 0) / c.planned) * 100) : 0;
    const over = c.spent >= c.planned && c.planned > 0;
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
              <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 14, fontWeight: 700 }}>{c.label}</div>
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
            background: 'var(--honey)', color: '#17272D', fontSize: 16, fontWeight: 700,
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

  const overviewContent = (
    <>
      {/* Hero income card */}
      <div style={{
        background: 'linear-gradient(135deg, var(--blue-ink) 0%, #2D829F 100%)', borderRadius: 20,
        padding: '20px 22px', marginBottom: 14, color: '#fff',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Monthly income</div>
        <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontWeight: 800, fontSize: 36, lineHeight: 1.1, marginTop: 2 }}>
          {conv(income).toLocaleString()}
          <span style={{ fontSize: 16, opacity: 0.7, marginLeft: 6, fontWeight: 600 }}>{cur}</span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
          SABIS salary {(income * 4.5).toLocaleString()} ZAR
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 14px', flex: 1 }}>
            <div style={{ opacity: 0.7 }}>Spent</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{conv(totalSpentMonthly).toLocaleString()} {cur}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 14px', flex: 1 }}>
            <div style={{ opacity: 0.7 }}>Remaining</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: remainingMonthly > 0 ? '#a5d6a7' : '#ef9a9a' }}>
              {conv(remainingMonthly).toLocaleString()} {cur}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 14px', flex: 1 }}>
            <div style={{ opacity: 0.7 }}>Savings</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{savingsPct}%</div>
          </div>
        </div>
      </div>

      {/* Health score row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        <div style={{
          flex: 1, background: 'var(--white)', borderRadius: 16, padding: 16,
          boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: 14,
        }}>
          {ringSvg(healthScore.pct, healthScore.color, 80)}
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Budget health</div>
            <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 18, fontWeight: 800, color: healthScore.color }}>{healthScore.label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{spentPct}% spent</div>
          </div>
        </div>
        <div style={{
          flex: 1, background: 'var(--white)', borderRadius: 16, padding: 16,
          boxShadow: 'var(--shadow)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Move progress</div>
          <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 22, fontWeight: 800, color: 'var(--terracotta)', marginTop: 2 }}>
            {movePct}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {conv(totalMoveSpent).toLocaleString()} / {conv(totalMovePlanned).toLocaleString()} {cur}
          </div>
        </div>
      </div>

      {/* Monthly breakdown */}
      {sectionTitle('Monthly overview')}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {metricCard('Budgeted', `${conv(totalBudgeted).toLocaleString()} ${cur}`, `${monthly.length} categories`)}
        {metricCard('Spent', `${conv(totalSpentMonthly).toLocaleString()} ${cur}`, `${spentPct}% of income`)}
        {metricCard('Remaining', `${conv(remainingMonthly).toLocaleString()} ${cur}`,
          unallocated > 0 ? `${conv(unallocated).toLocaleString()} ${cur} unallocated` : undefined,
          remainingMonthly > 0 ? undefined : '#fef2f2')}
      </div>

      {/* Savings & move combined */}
      {sectionTitle('At a glance')}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {metricCard('Annual income', `${conv(income * 12).toLocaleString()} ${cur}`, `${(income * 12 * 4.5).toLocaleString()} ZAR`)}
        {metricCard('Annual savings', `${conv(savingsPlanned * 12).toLocaleString()} ${cur}`, `${savingsPct}% rate`)}
        {metricCard('Move total', `${conv(totalMovePlanned).toLocaleString()} ${cur}`, `${cats.length} items`)}
      </div>

      {/* Top categories */}
      {monthly.length > 0 && sectionTitle('Top monthly categories')}
      {getTopCategories(4).map(c => (
        <div key={c.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'var(--white)', borderRadius: 12,
          boxShadow: 'var(--shadow)', marginBottom: 6, border: '1px solid var(--line)',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
          }}>{c.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 13, fontWeight: 600 }}>{c.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: (c.spent || 0) > c.planned ? 'var(--terracotta)' : 'var(--dark)' }}>
                {conv(c.spent || 0).toLocaleString()}
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}> / {conv(c.planned).toLocaleString()}</span>
              </span>
            </div>
            <div style={{ marginTop: 4 }}>
              <ProgressBar value={c.spent || 0} total={c.planned || 1} color="var(--teal)" height={4} />
            </div>
          </div>
        </div>
      ))}

      {/* Quick actions */}
      {sectionTitle('Quick actions')}
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <button onClick={() => { setTab('monthly'); setAddingMonthly(true); }} style={{
          flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid var(--line)',
          background: 'var(--white)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          color: 'var(--dark)',
        }}>＋ Monthly category</button>
        <button onClick={() => { setTab('move'); setAddingMove(true); }} style={{
          flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid var(--line)',
          background: 'var(--white)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          color: 'var(--dark)',
        }}>＋ Move item</button>
        <button onClick={() => setShowZAR(v => !v)} style={{
          padding: '10px 14px', borderRadius: 12, border: '1px solid var(--line)',
          background: 'var(--white)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          color: showZAR ? 'var(--terracotta)' : 'var(--teal)',
        }}>{showZAR ? '🇿🇦' : '🇦🇪'}</button>
      </div>

      {/* SABIS info */}
      <Card padding="14px" style={{ background: 'var(--sand)', border: '1px solid var(--line)', marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 4 }}>🏫 SABIS covers</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
          Housing (Rent), Health Insurance, Transport — all handled by your employer.
        </div>
      </Card>
    </>
  );

  const monthlyContent = (
    <>
      <Card padding="14px" style={{ background: 'var(--blue)', color: '#17272D', border: 'none', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9, marginBottom: 2 }}>SABIS covers</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>
          Housing (Rent), Health Insurance, Transport — all handled by your employer.
        </div>
      </Card>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 18 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {ringSvg(spentPct, 'var(--teal)')}
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--dark)' }}>{conv(income).toLocaleString()}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{cur}</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Monthly income</div>
          <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 22, fontWeight: 800, color: 'var(--teal)', marginTop: 2 }}>{conv(income).toLocaleString()} {cur}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            ≈ {(income * 4.5).toLocaleString()} ZAR · {(income * 0.27).toLocaleString()} USD
          </div>
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
  );

  const moveContent = (
    <>
      <Card padding="20px" style={{ background: 'linear-gradient(135deg, var(--blue-ink) 0%, #2D829F 100%)', color: '#fff', border: 'none', marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Move checklist</div>
        <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontWeight: 800, fontSize: 36, lineHeight: 1, marginTop: 4 }}>
          {conv(totalMoveSpent).toLocaleString()}
          <span style={{ fontSize: 16, opacity: 0.7, marginLeft: 6, fontWeight: 600 }}>{cur}</span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          of {conv(totalMovePlanned).toLocaleString()} {cur}
        </div>
        <div style={{ marginTop: 14 }}>
          <ProgressBar value={totalMoveSpent} total={totalMovePlanned} color="var(--gold)" height={8} />
        </div>
      </Card>

      {cats.map(c => {
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
                    <span style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 14, fontWeight: 700 }}>{c.label}</span>
                    {isSABIS && (
                      <span style={{
                        marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 999, background: 'var(--blue)', color: '#17272D',
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
                  background: 'var(--honey)', color: '#17272D', fontSize: 16, fontWeight: 700,
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
  );

  const tabLabels = [
    { id: 'overview', label: `📊 Overview` },
    { id: 'monthly', label: `📆 Monthly · ${conv(income).toLocaleString()} ${cur}` },
    { id: 'move', label: `✈️ Move · ${conv(totalMovePlanned).toLocaleString()} ${cur}` },
  ];

  return (
    <ModulePage
      title="Budget"
      subtitle={tab === 'overview' ? `Income ${conv(income).toLocaleString()} ${cur}/mo · ${savingsPct}% saved` : ''}
      icon="Wallet"
      onBack={onBack}
    >
      <div style={{ display: 'flex', gap: 3, background: 'var(--sand)', borderRadius: 12, padding: 3, marginBottom: 14, overflow: 'auto' }}>
        {tabLabels.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 6px', borderRadius: 10, border: 'none',
              fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              background: tab === t.id ? 'var(--white)' : 'transparent',
              color: tab === t.id ? 'var(--dark)' : 'var(--muted)',
              boxShadow: tab === t.id ? 'var(--shadow)' : 'none',
              transition: 'all 0.15s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && overviewContent}
      {tab === 'monthly' && monthlyContent}
      {tab === 'move' && moveContent}
    </ModulePage>
  );
}

// ---------- ABU DHABI BUDGET ----------
// A calm, manual-first plan: every dirham has a job, everyday spending has a
// safe pace, and irregular costs build up as rollover funds.
function BudgetScreen({ state, setState, onBack }) {
  const api = window.__lifeos?.budget;
  const budget = state.budget || {};
  const monthly = budget.monthly || MONTHLY_BUDGET;
  const income = Number(budget.monthlyIncome) || 8800;
  const transactions = budget.transactions || [];
  const currentTransactions = transactions.filter(transaction => {
    const date = new Date(transaction.date);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  const summary = api?.summarizeBudget?.(monthly, income) || {
    planned: monthly.reduce((sum, item) => sum + (item.planned || 0), 0),
    tracked: monthly.reduce((sum, item) => sum + (item.spent || 0), 0),
    leftToAssign: income - monthly.reduce((sum, item) => sum + (item.planned || 0), 0),
    savingsPlanned: 0, savingsTracked: 0, savingsRate: 0,
    flexibleRemaining: 0, safePerDay: 0, daysRemaining: 1,
  };
  const [tab, setTab] = React.useState('today');
  const [showExpense, setShowExpense] = React.useState(false);
  const [expenseAmount, setExpenseAmount] = React.useState('');
  const [expenseCategory, setExpenseCategory] = React.useState(monthly.find(item => item.bucket !== 'covered')?.id || 'groceries');
  const [expenseNote, setExpenseNote] = React.useState('');
  const [draft, setDraft] = React.useState(null);
  const [incomeDraft, setIncomeDraft] = React.useState(String(income));

  const money = value => `${Math.round(Number(value) || 0).toLocaleString()} AED`;
  const bucketMeta = {
    essentials: { label: 'Essentials', detail: 'The practical basics', color: 'var(--blue)' },
    lifestyle: { label: 'Life & joy', detail: 'Flexible spending without guilt', color: 'var(--honey)' },
    future: { label: 'Future you', detail: 'Savings and sinking funds', color: '#BDE2D0' },
    covered: { label: 'Employer covered', detail: 'Benefits that protect this plan', color: 'var(--butter)' },
  };
  const activeCategories = monthly.filter(item => item.bucket !== 'covered' && !item.coveredByEmployer);
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date());

  function patchBudget(patch) {
    setState(current => ({ ...current, budget: { ...current.budget, ...patch } }));
  }

  function setIncome(value) {
    patchBudget({ monthlyIncome: Math.max(0, Number(value) || 0) });
  }

  function recordExpense() {
    const amount = Math.round((Number(expenseAmount) || 0) * 100) / 100;
    if (amount <= 0 || !expenseCategory) return;
    const transaction = {
      id: uid(), categoryId: expenseCategory, amount,
      note: expenseNote.trim(), date: new Date().toISOString(),
    };
    setState(current => ({
      ...current,
      budget: {
        ...current.budget,
        monthly: (current.budget.monthly || MONTHLY_BUDGET).map(category =>
          category.id === expenseCategory ? { ...category, spent: (category.spent || 0) + amount } : category
        ),
        transactions: [transaction, ...(current.budget.transactions || [])].slice(0, 200),
      },
    }));
    setExpenseAmount(''); setExpenseNote(''); setShowExpense(false);
  }

  function removeTransaction(transaction) {
    setState(current => ({
      ...current,
      budget: {
        ...current.budget,
        monthly: (current.budget.monthly || MONTHLY_BUDGET).map(category =>
          category.id === transaction.categoryId
            ? { ...category, spent: Math.max(0, (category.spent || 0) - transaction.amount) }
            : category
        ),
        transactions: (current.budget.transactions || []).filter(item => item.id !== transaction.id),
      },
    }));
  }

  function openCategory(category) {
    setDraft({ ...category, isNew: false });
  }

  function newCategory() {
    setDraft({ id: uid(), label: '', emoji: '📌', planned: 0, spent: 0, bucket: 'lifestyle', note: '', rollover: false, fixed: false, isNew: true });
  }

  function saveCategory() {
    if (!draft?.label?.trim()) return;
    const clean = {
      ...draft,
      label: draft.label.trim(),
      planned: Math.max(0, Number(draft.planned) || 0),
      spent: Math.max(0, Number(draft.spent) || 0),
    };
    delete clean.isNew;
    const next = draft.isNew ? [...monthly, clean] : monthly.map(item => item.id === clean.id ? clean : item);
    patchBudget({ monthly: next });
    setDraft(null);
  }

  function deleteCategory() {
    if (!draft || draft.isNew) return setDraft(null);
    patchBudget({
      monthly: monthly.filter(item => item.id !== draft.id),
      transactions: transactions.filter(item => item.categoryId !== draft.id),
    });
    setDraft(null);
  }

  function resetPlan() {
    if (!window.confirm('Reset the targets to the Abu Dhabi starter plan? Your recent activity will be cleared.')) return;
    const now = new Date();
    patchBudget({ version: 4, period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, monthly: api?.createAbuDhabiBudget?.() || MONTHLY_BUDGET, transactions: [] });
  }

  const allocationWidth = Math.min(100, income > 0 ? (summary.planned / income) * 100 : 0);
  const flexibleUsed = activeCategories
    .filter(item => item.bucket === 'lifestyle' || (!item.fixed && item.bucket === 'essentials'))
    .reduce((sum, item) => sum + (item.spent || 0), 0);
  const flexiblePlan = activeCategories
    .filter(item => item.bucket === 'lifestyle' || (!item.fixed && item.bucket === 'essentials'))
    .reduce((sum, item) => sum + (item.planned || 0) + (item.rolloverBalance || 0), 0);
  const upcomingBills = activeCategories
    .filter(item => item.dueDay)
    .map(item => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let due = new Date(now.getFullYear(), now.getMonth(), Math.min(item.dueDay, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()));
      if (due < today) due = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(item.dueDay, new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()));
      return { ...item, due };
    })
    .sort((a, b) => a.due - b.due)
    .slice(0, 3);

  const expenseForm = showExpense && (
    <Card padding="18px" style={{ marginBottom: 14, border: '2px solid var(--honey)' }}>
      <div className="budget-form-title">Log money in seconds</div>
      <div className="budget-expense-grid">
        <label className="budget-field">
          <span>Amount (AED)</span>
          <input aria-label="Amount (AED)" autoFocus type="number" inputMode="decimal" min="0" value={expenseAmount} onChange={event => setExpenseAmount(event.target.value)} placeholder="0" />
        </label>
        <label className="budget-field budget-field-wide">
          <span>Category</span>
          <select aria-label="Category" value={expenseCategory} onChange={event => setExpenseCategory(event.target.value)}>
            {activeCategories.map(category => <option key={category.id} value={category.id}>{category.emoji} {category.label}</option>)}
          </select>
        </label>
        <label className="budget-field budget-field-wide">
          <span>Note (optional)</span>
          <input aria-label="Note (optional)" value={expenseNote} onChange={event => setExpenseNote(event.target.value)} placeholder="Lunch, top-up, transfer…" onKeyDown={event => event.key === 'Enter' && recordExpense()} />
        </label>
      </div>
      <div className="budget-form-actions">
        <Button onClick={recordExpense} disabled={!Number(expenseAmount)}>Save</Button>
        <Button variant="ghost" onClick={() => setShowExpense(false)}>Cancel</Button>
      </div>
    </Card>
  );

  const categoryEditor = draft && (
    <div className="budget-editor-backdrop" onClick={() => setDraft(null)}>
      <div className="budget-editor" onClick={event => event.stopPropagation()}>
        <div className="budget-editor-head">
          <div>
            <div className="budget-kicker">{draft.isNew ? 'New category' : 'Edit plan'}</div>
            <h2>{draft.isNew ? 'Add a money job' : draft.label}</h2>
          </div>
          <button className="budget-close" onClick={() => setDraft(null)} aria-label="Close">×</button>
        </div>
        <div className="budget-editor-grid">
          <label className="budget-field budget-emoji-field"><span>Emoji</span><input value={draft.emoji} onChange={event => setDraft({ ...draft, emoji: event.target.value })} /></label>
          <label className="budget-field budget-field-wide"><span>Name</span><input value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} placeholder="Category name" /></label>
          <label className="budget-field"><span>Monthly target</span><input type="number" min="0" value={draft.planned} onChange={event => setDraft({ ...draft, planned: event.target.value })} /></label>
          <label className="budget-field"><span>{draft.bucket === 'future' ? 'Saved so far' : 'Spent so far'}</span><input type="number" min="0" value={draft.spent} onChange={event => setDraft({ ...draft, spent: event.target.value })} /></label>
          <label className="budget-field"><span>Group</span><select value={draft.bucket} onChange={event => setDraft({ ...draft, bucket: event.target.value, coveredByEmployer: event.target.value === 'covered' })}>{Object.entries(bucketMeta).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select></label>
          <label className="budget-field"><span>Due day (optional)</span><input type="number" min="1" max="31" value={draft.dueDay || ''} onChange={event => setDraft({ ...draft, dueDay: Number(event.target.value) || undefined })} /></label>
          <label className="budget-field budget-field-full"><span>Helpful note</span><input value={draft.note || ''} onChange={event => setDraft({ ...draft, note: event.target.value })} placeholder="What this amount is for" /></label>
        </div>
        <label className="budget-toggle"><input type="checkbox" checked={Boolean(draft.rollover)} onChange={event => setDraft({ ...draft, rollover: event.target.checked })} /><span><strong>Roll leftover money forward</strong><small>Useful for travel, annual costs and other sinking funds.</small></span></label>
        <div className="budget-editor-actions">
          <Button onClick={saveCategory}>{draft.isNew ? 'Add category' : 'Save changes'}</Button>
          {!draft.isNew && <Button variant="ghost" onClick={deleteCategory}>Delete</Button>}
        </div>
      </div>
    </div>
  );

  const todayContent = (
    <>
      <section className="budget-hero">
        <div className="budget-kicker">{monthName} · Abu Dhabi</div>
        <div className="budget-hero-grid">
          <div>
            <div className="budget-safe-label">Safe pace for everyday spending</div>
            <div className="budget-safe-number">{money(summary.safePerDay)}<span> / day</span></div>
            <p>{money(summary.flexibleRemaining)} remains across groceries, personal spending and fun for the next {summary.daysRemaining} days.</p>
          </div>
          <button className="budget-log-button" onClick={() => setShowExpense(true)}><span>＋</span> Log spending</button>
        </div>
      </section>

      {expenseForm}

      <div className="budget-metrics">
        <div className="budget-metric"><span>Left to assign</span><strong className={summary.leftToAssign < 0 ? 'budget-negative' : ''}>{summary.leftToAssign === 0 ? 'Balanced ✓' : money(summary.leftToAssign)}</strong><small>{summary.leftToAssign === 0 ? 'Every dirham has a job' : summary.leftToAssign > 0 ? 'Give this money a job' : 'Targets exceed income'}</small></div>
        <div className="budget-metric"><span>Future you</span><strong>{money(summary.savingsPlanned)}</strong><small>{summary.savingsRate}% of monthly income</small></div>
        <div className="budget-metric"><span>Tracked</span><strong>{money(summary.tracked)}</strong><small>{currentTransactions.length} entries this month</small></div>
      </div>

      <Card padding="18px" style={{ marginBottom: 14 }}>
        <div className="budget-card-head"><div><div className="budget-kicker">Monthly flow</div><h3>{money(income)} in, {money(summary.planned)} planned</h3></div><label className="budget-income"><span>Edit income</span><input aria-label="Monthly income" type="number" min="0" value={incomeDraft} onChange={event => setIncomeDraft(event.target.value)} onBlur={() => { setIncome(incomeDraft); setIncomeDraft(String(Math.max(0, Number(incomeDraft) || 0))); }} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} /></label></div>
        <div className="budget-allocation"><div style={{ width: `${allocationWidth}%` }} /></div>
        <div className="budget-flow-labels"><span>{Math.round(allocationWidth)}% assigned</span><span>{money(Math.abs(summary.leftToAssign))} {summary.leftToAssign >= 0 ? 'free' : 'over'}</span></div>
      </Card>

      <div className="budget-two-col">
        <Card padding="18px">
          <div className="budget-card-head"><div><div className="budget-kicker">This month</div><h3>Flexible spending</h3></div><strong>{money(Math.max(0, flexiblePlan - flexibleUsed))}</strong></div>
          <ProgressBar value={flexibleUsed} total={flexiblePlan || 1} color="var(--honey)" height={10} />
          <div className="budget-flow-labels"><span>{money(flexibleUsed)} used</span><span>{money(flexiblePlan)} limit</span></div>
        </Card>
        <Card padding="18px">
          <div className="budget-card-head"><div><div className="budget-kicker">Protection</div><h3>Employer benefits</h3></div><strong>{monthly.filter(item => item.coveredByEmployer).length}</strong></div>
          <p className="budget-card-copy">Housing, medical cover and work transport are kept outside the spendable plan. Tap any item in Plan if that changes.</p>
        </Card>
      </div>

      <Card padding="18px" style={{ marginTop: 14 }}>
        <div className="budget-card-head"><div><div className="budget-kicker">Coming up</div><h3>Bills & automatic transfers</h3></div><span className="budget-research-badge">Monthly</span></div>
        <div className="budget-upcoming-list">
          {upcomingBills.map(item => (
            <button key={item.id} className="budget-upcoming" onClick={() => openCategory(item)}>
              <span className="budget-category-icon">{item.emoji}</span>
              <span className="budget-category-copy"><strong>{item.label}</strong><small>{new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short' }).format(item.due)}</small></span>
              <strong>{money(item.planned)}</strong>
              <span className="budget-chevron">›</span>
            </button>
          ))}
        </div>
      </Card>

      <Card padding="18px" style={{ marginTop: 14 }}>
        <div className="budget-card-head"><div><div className="budget-kicker">Why these targets</div><h3>Grounded in Abu Dhabi life</h3></div><span className="budget-research-badge">2026 check</span></div>
        <div className="budget-evidence-grid">
          <div><strong>1,200 AED</strong><span>groceries gives room above a lean market basket</span></div>
          <div><strong>600 AED</strong><span>dining fits regular 30 AED casual meals and coffee</span></div>
          <div><strong>300 AED</strong><span>extra transport covers a 95 AED bus pass plus taxis</span></div>
          <div><strong>150 AED</strong><span>Wi-Fi assumes a shared entry home plan</span></div>
        </div>
        <p className="budget-disclaimer">These are editable starter targets, not fixed rules. After one month, adjust them to match her real receipts.</p>
      </Card>
    </>
  );

  const planContent = (
    <>
      <div className="budget-plan-head">
        <div><div className="budget-kicker">Zero-based plan</div><h2>{summary.leftToAssign === 0 ? `All ${money(income)} has a purpose` : `${money(Math.abs(summary.leftToAssign))} ${summary.leftToAssign > 0 ? 'still to assign' : 'over income'}`}</h2></div>
        <div className="budget-plan-actions"><Button size="sm" onClick={newCategory}>＋ Add</Button><Button size="sm" variant="ghost" onClick={resetPlan}>Reset plan</Button></div>
      </div>
      {Object.entries(bucketMeta).map(([bucketId, meta]) => {
        const items = monthly.filter(item => (item.bucket || 'lifestyle') === bucketId);
        if (!items.length) return null;
        const total = items.reduce((sum, item) => sum + (item.planned || 0), 0);
        return (
          <section className="budget-group" key={bucketId}>
            <div className="budget-group-head"><div><span className="budget-group-dot" style={{ background: meta.color }} /> <strong>{meta.label}</strong><small>{meta.detail}</small></div><b>{bucketId === 'covered' ? 'Included' : money(total)}</b></div>
            <div className="budget-category-list">
              {items.map(category => {
                const available = (category.planned || 0) + (category.rolloverBalance || 0);
                const remaining = available - (category.spent || 0);
                const isFuture = category.bucket === 'future';
                const over = remaining < 0;
                return (
                  <button className="budget-category" key={category.id} onClick={() => openCategory(category)}>
                    <span className="budget-category-icon">{category.emoji}</span>
                    <span className="budget-category-copy"><strong>{category.label}</strong><small>{category.coveredByEmployer ? category.note : `${isFuture ? 'Saved this month' : 'Used'} ${money(category.spent || 0)}${isFuture && category.savedTotal ? ` · ${money(category.savedTotal)} built before this month` : ''}${category.note ? ` · ${category.note}` : ''}`}</small></span>
                    <span className="budget-category-money"><strong>{category.coveredByEmployer ? 'Covered' : money(category.planned)}</strong><small className={over ? 'budget-negative' : ''}>{category.coveredByEmployer ? 'SABIS' : over ? `${money(Math.abs(remaining))} over` : `${money(remaining)} left`}{category.rolloverBalance ? ` · ${money(category.rolloverBalance)} rolled in` : category.rollover ? ' · rolls' : ''}</small></span>
                    <span className="budget-chevron">›</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );

  const activityContent = (
    <>
      <div className="budget-plan-head"><div><div className="budget-kicker">Activity</div><h2>What changed this month</h2></div><Button size="sm" onClick={() => setShowExpense(true)}>＋ Log</Button></div>
      {expenseForm}
      {currentTransactions.length === 0 ? (
        <Card padding="28px" style={{ textAlign: 'center' }}><div style={{ fontSize: 34 }}>🧾</div><h3 style={{ marginTop: 8 }}>Nothing logged yet</h3><p className="budget-card-copy">Use “Log spending” after a purchase or savings transfer. It takes only an amount and a category.</p></Card>
      ) : (
        <div className="budget-activity-list">
          {currentTransactions.map(transaction => {
            const category = monthly.find(item => item.id === transaction.categoryId);
            return (
              <div className="budget-activity" key={transaction.id}>
                <span className="budget-category-icon">{category?.emoji || '📌'}</span>
                <span className="budget-category-copy"><strong>{transaction.note || category?.label || 'Budget entry'}</strong><small>{category?.label} · {new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(transaction.date))}</small></span>
                <strong>{money(transaction.amount)}</strong>
                <button className="budget-remove" onClick={() => removeTransaction(transaction)} aria-label="Remove entry">×</button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const tabs = [{ id: 'today', label: 'Today' }, { id: 'plan', label: 'Plan' }, { id: 'activity', label: 'Activity' }];
  return (
    <ModulePage title="Budget" subtitle={`${monthName} · ${summary.savingsRate}% planned for the future`} icon="Wallet" onBack={onBack}>
      <div className="budget-tabs">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
      {tab === 'today' && todayContent}
      {tab === 'plan' && planContent}
      {tab === 'activity' && activityContent}
      {categoryEditor}
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
  const items = state.shopping || [];
  const cats = ['all', ...new Set(items.map(s => s.cat))];
  const list = filter === 'all' ? items : items.filter(s => s.cat === filter);
  const total = items.reduce((a, s) => a + (s.price || 0), 0);

  function toggle(id) {
    setState(s => ({
      ...s,
      shopping: (s.shopping || []).map(it => it.id === id ? { ...it, status: it.status === 'packed' ? 'toBuy' : 'packed' } : it),
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
      subtitle={`${items.length} items · ~${total} ZAR`}
      icon="ShoppingCart"
      onBack={onBack}
      action={<div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="ghost" icon="🔗" onClick={handleShare}>
          {linkCopied ? 'Copied!' : 'Share'}
        </Button>
        <Button size="sm" variant="ghost" icon="✨" onClick={() => onAsk('What are 5 useful things to buy for my home in Abu Dhabi?', 'Setting up and maintaining a home in the UAE.')}>AI help</Button>
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
                  {item.price != null && <><span>·</span><span>{item.price} ZAR</span></>}
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
    setLoadingTips(current => ({ ...current, [room.id]: true }));
    const photoContext = room.photos.length > 0 ? `Photos of the ${room.label}: ${room.photos.join(', ')}` : '';
    const prompt = `I'm setting up my ${room.label}. Give me 3 practical decoration tips for a ${room.photos.length > 0 ? 'room using the attached photos' : 'small apartment'}. Focus on affordable items that are easy to find in Abu Dhabi. Keep each tip to one sentence.`;
    try {
      const tips = await askHuve(prompt, photoContext);
      setRooms(getRooms().map(item => item.id === room.id ? { ...item, tips } : item));
      setAiTips(current => ({ ...current, [room.id]: tips }));
    } catch {
      onAsk(prompt, photoContext);
    } finally {
      setLoadingTips(current => ({ ...current, [room.id]: false }));
    }
  }

  return (
    <ModulePage
      title="Apartment Decor"
      subtitle="SABIS provides housing — make it yours"
      icon="Building2"
      onBack={onBack}
    >
      {/* SABIS info card */}
      <Card padding="16px" style={{ background: 'var(--blue)', color: '#17272D', border: 'none', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 32 }}>✅</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Housing covered by SABIS</div>
            <div style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.4 }}>
              Plan how you will set up and personalise each room.
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
                background: 'var(--honey)', color: '#17272D',
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
                {loadingTips[activeRoom.id] ? 'Thinking…' : 'AI tips'}
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
                  <PrivatePhoto value={url} alt={`${activeRoom.label} ${i}`} style={{
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

          {(aiTips[activeRoom.id] || loadingTips[activeRoom.id]) && (
            <Card padding="14px" style={{ background: 'var(--sand)', border: 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                {loadingTips[activeRoom.id] ? 'Your AI is thinking…' : `${activeRoom.emoji} AI decoration tips`}
              </div>
              {loadingTips[activeRoom.id] ? (
                <div style={{ display: 'flex', gap: 4, padding: '12px 0' }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--muted)', animation: `pop 0.6s ${i * 0.15}s infinite alternate` }} />)}
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--dark)' }}>{aiTips[activeRoom.id]}</div>
              )}
            </Card>
          )}

        </div>
      )}

      {!activeRoom && (
        <div style={{
          padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13,
        }}>
          Tap a room above to add photos and get AI decoration ideas
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
  const photoValues = React.useMemo(() => photos.map(photo => photo.url), [photos]);
  const ltDone = lastTimes.filter(m => m.done).length;
  const gbDone = goodbyes.filter(g => g.done).length;
  const [uploading, setUploading] = React.useState(false);
  const [showPhotos, setShowPhotos] = React.useState(false);
  const [showFilmReel, setShowFilmReel] = React.useState(false);
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
            <PrivateMemoryPhotoGrid values={photoValues} />
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
                  <PrivatePhoto value={p.url} alt={p.caption || 'Memory'} style={{
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
          <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
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
      <div style={{ marginBottom: 20, padding: '18px 20px', background: 'linear-gradient(135deg, color-mix(in srgb, var(--honey) 20%, var(--white)), color-mix(in srgb, var(--blue) 15%, var(--white)))', borderRadius: 20, border: '1px solid var(--line)' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🌅</div>
        <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>One last time</div>
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
        const curStreak = h.streak || 0;
        const newStreak = already ? Math.max(0, curStreak - 1) : curStreak + 1;
        return {
          ...h,
          streak: newStreak,
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
        background: 'linear-gradient(135deg, var(--blue-ink) 0%, #2D829F 100%)',
        color: '#fff', border: 'none', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>Today's progress</div>
            <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 32, fontWeight: 800, marginTop: 2 }}>
              {doneToday}<span style={{ fontSize: 16, fontWeight: 600, opacity: 0.85, marginLeft: 4 }}>/{habits.length}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 22, fontWeight: 700 }}>🔥 {totalStreak}</div>
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
                background: 'linear-gradient(135deg, var(--blue), var(--honey))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#17272D', fontSize: 18, fontWeight: 700, fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
              }}>{c.name.charAt(0)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 15, fontWeight: 700 }}>{c.name}</div>
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
