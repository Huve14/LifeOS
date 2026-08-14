// trip-board.jsx — Private, offline-friendly travel planner

const { useState, useEffect, useMemo } = React;

function tripsApi() {
  return window.__lifeos;
}

function isTripPreview() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview-trip');
}

const TRIP_PREVIEW = {
  trip: {
    id: 'preview-trip', owner_id: 'visual-preview', title: 'Muscat long weekend',
    origin: 'Abu Dhabi', destination: 'Muscat', start_date: '2026-09-18', end_date: '2026-09-21',
    notes: 'Sea air, good food and an unhurried weekend together.',
    created_at: '2026-08-15T00:00:00Z', updated_at: '2026-08-15T00:00:00Z',
  },
  items: [
    ['flight', 'Etihad flight to Muscat', '2026-09-18T06:30:00Z', 860, 'AED', 'confirmed', false, 'EY 692'],
    ['hotel', 'Mutrah waterfront stay', '2026-09-18T12:00:00Z', 1450, 'AED', 'confirmed', false, 'MCT-8842'],
    ['transport', 'Airport transfer', '2026-09-18T08:30:00Z', 18, 'OMR', 'tentative', false, ''],
    ['activity', 'Sunset walk on the Corniche', '2026-09-18T14:30:00Z', 0, 'OMR', 'confirmed', false, ''],
    ['checklist', 'Check passport validity', null, null, 'AED', 'tentative', true, ''],
    ['checklist', 'Download offline map', null, null, 'AED', 'tentative', false, ''],
    ['idea', 'Breakfast at a local bakery', null, 12, 'OMR', 'tentative', false, ''],
  ].map((row, index) => ({
    id: `preview-${index}`, owner_id: 'visual-preview', trip_id: 'preview-trip', client_id: `preview-${index}`,
    category: row[0], title: row[1], starts_at: row[2], ends_at: null, cost_amount: row[3],
    cost_currency: row[4], booking_ref: row[7], status: row[5], notes: '', url: '', is_complete: row[6],
    created_at: '2026-08-15T00:00:00Z', updated_at: '2026-08-15T00:00:00Z',
  })),
};

// ---------- Store ----------

const tripStore = {
  trips: [],
  items: [],
  pending: [],
  activeTripId: null,
  status: 'idle', // idle | loading | ready | error
  error: '',
  listeners: new Set(),

  emit() {
    this.listeners.forEach(fn => { try { fn(); } catch { /* isolate listeners */ } });
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  async load() {
    const api = tripsApi();
    if (!api) return;
    if (isTripPreview()) {
      this.trips = [TRIP_PREVIEW.trip];
      this.items = TRIP_PREVIEW.items;
      this.activeTripId = TRIP_PREVIEW.trip.id;
      this.status = 'ready';
      this.error = '';
      this.emit();
      return;
    }
    if (this.status === 'idle' || this.status === 'error') this.status = 'loading';
    this.emit();
    try {
      const trips = await api.trips.loadTrips();
      this.trips = trips;
      if (!this.activeTripId || !trips.some(trip => trip.id === this.activeTripId)) {
        const upcoming = trips.find(trip => api.trips.daysUntilTrip(trip) >= -api.trips.tripLengthDays(trip));
        this.activeTripId = upcoming?.id ?? trips[0]?.id ?? null;
      }
      this.items = this.activeTripId ? await api.trips.loadItems(this.activeTripId) : [];
      this.status = 'ready';
      this.error = '';
    } catch (err) {
      this.status = 'error';
      this.error = err?.message || 'Could not load your trips';
    }
    this.emit();
  },

  async selectTrip(tripId) {
    const api = tripsApi();
    if (!api || !tripId || tripId === this.activeTripId) return;
    this.activeTripId = tripId;
    this.items = [];
    this.emit();
    try {
      this.items = await api.trips.loadItems(tripId);
      this.error = '';
    } catch (err) {
      this.error = err?.message || 'Could not load this trip';
    }
    this.emit();
  },

  setPending(entries) {
    this.pending = entries.filter(entry => entry.kind === 'trip-item');
    this.emit();
  },

  activeTrip() {
    return this.trips.find(trip => trip.id === this.activeTripId) ?? null;
  },
};

let tripsWired = false;

function wireTripStore() {
  if (tripsWired) return;
  const api = tripsApi();
  if (!api) return;
  tripsWired = true;
  if (isTripPreview()) return;
  api.trips.subscribeTrips(() => { void tripStore.load(); });
  api.outbox.subscribeOutbox(entries => tripStore.setPending(entries));
}

function useTrips() {
  const [, force] = useState(0);
  useEffect(() => {
    wireTripStore();
    const unsubscribe = tripStore.subscribe(() => force(value => value + 1));
    if (tripStore.status === 'idle') void tripStore.load();
    return unsubscribe;
  }, []);
  return tripStore;
}

// ---------- Form helpers ----------

const fieldStyle = {
  width: '100%', padding: '11px 13px', border: '1px solid var(--line)',
  borderRadius: 12, fontSize: 15, fontFamily: 'inherit',
  background: 'var(--cream)', color: 'var(--dark)', outline: 'none', boxSizing: 'border-box',
};

function Field({ label, children }) {
  return (
    <label className="trip-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function dateInput(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultTrip() {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  const end = new Date(start);
  end.setDate(end.getDate() + 3);
  return {
    title: '', origin: '', destination: '',
    start_date: dateInput(start), end_date: dateInput(end), notes: '',
  };
}

function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// ---------- Trip editor ----------

function TripSheet({ open, trip, onClose, onSaved, onDeleted }) {
  const api = tripsApi();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(trip ? {
      title: trip.title,
      origin: trip.origin,
      destination: trip.destination,
      start_date: trip.start_date,
      end_date: trip.end_date,
      notes: trip.notes,
    } : defaultTrip());
    setError('');
  }, [open, trip?.id]);

  if (!open || !form) return null;

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!form.title.trim() || !form.destination.trim()) {
      setError('Add a trip name and destination.');
      return;
    }
    if (!form.start_date || !form.end_date || form.end_date < form.start_date) {
      setError('Choose a valid start and end date.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        notes: form.notes.trim(),
      };
      const saved = trip
        ? ((await api.trips.saveTrip(trip.id, payload)) ? { ...trip, ...payload } : null)
        : await api.trips.createTrip(payload);
      if (!saved) throw new Error('The trip could not be saved.');
      await onSaved(saved);
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!trip || !window.confirm(`Delete “${trip.title}” and everything on its board?`)) return;
    setSaving(true);
    const deleted = await api.trips.deleteTrip(trip.id);
    setSaving(false);
    if (!deleted) {
      setError('Could not delete this trip. Try again.');
      return;
    }
    await onDeleted(trip.id);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={trip ? 'Trip details' : 'Plan a trip'}>
      <div className="trip-sheet-intro">
        <strong>{trip ? 'Keep the essentials accurate' : 'Start with the route and dates'}</strong>
        <span>You can add flights, stays, plans and costs next.</span>
      </div>
      <Field label="Trip name">
        <input value={form.title} onChange={event => set('title', event.target.value)} placeholder="Dubai weekend" style={fieldStyle} />
      </Field>
      <div className="trip-form-row">
        <Field label="From">
          <input value={form.origin} onChange={event => set('origin', event.target.value)} placeholder="Abu Dhabi" style={fieldStyle} />
        </Field>
        <Field label="To">
          <input value={form.destination} onChange={event => set('destination', event.target.value)} placeholder="Destination" style={fieldStyle} />
        </Field>
      </div>
      <div className="trip-form-row">
        <Field label="Start">
          <input type="date" value={form.start_date} onChange={event => set('start_date', event.target.value)} style={fieldStyle} />
        </Field>
        <Field label="End">
          <input type="date" value={form.end_date} onChange={event => set('end_date', event.target.value)} style={fieldStyle} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea value={form.notes} onChange={event => set('notes', event.target.value)} rows={3} placeholder="Who is coming, the reason for the trip, or anything worth remembering" style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
      </Field>
      {error && <div className="trip-form-error">{error}</div>}
      <div className="trip-sheet-actions">
        {trip && <Button variant="ghost" onClick={remove} disabled={saving}>Delete trip</Button>}
        <Button onClick={save} disabled={saving} full>{saving ? 'Saving…' : (trip ? 'Save changes' : 'Create trip')}</Button>
      </div>
    </Sheet>
  );
}

// ---------- Item editor ----------

function ItemSheet({ open, trip, item, onClose }) {
  const api = tripsApi();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      category: item?.category ?? 'idea',
      title: item?.title ?? '',
      startsAt: toLocalInput(item?.starts_at),
      endsAt: toLocalInput(item?.ends_at),
      cost: item?.cost_amount === null || item?.cost_amount === undefined ? '' : String(item.cost_amount),
      currency: item?.cost_currency ?? 'AED',
      bookingRef: item?.booking_ref ?? '',
      status: item?.status ?? 'tentative',
      notes: item?.notes ?? '',
      url: item?.url ?? '',
      isComplete: item?.is_complete ?? false,
    });
    setError('');
  }, [open, item?.client_id]);

  if (!open || !form || !trip) return null;

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!form.title.trim()) {
      setError('Give this item a clear name.');
      return;
    }
    const cost = form.cost.trim() === '' ? null : Number(form.cost);
    if (cost !== null && (Number.isNaN(cost) || cost < 0)) {
      setError('Cost needs to be a positive number, or left empty.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.trips.queueTripItem(trip.id, item?.client_id ?? api.trips.newItemClientId(), {
        category: form.category,
        title: form.title.trim(),
        starts_at: fromLocalInput(form.startsAt),
        ends_at: fromLocalInput(form.endsAt),
        cost_amount: cost,
        cost_currency: form.currency,
        booking_ref: form.bookingRef.trim(),
        status: form.status,
        notes: form.notes.trim(),
        url: form.url.trim(),
        is_complete: form.category === 'checklist' ? form.isComplete : false,
      });
      void api.native.tap('light');
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not save this item.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!item || !window.confirm('Remove this from the trip?')) return;
    setSaving(true);
    await api.trips.queueTripItemDelete(item);
    setSaving(false);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={item ? 'Edit trip item' : 'Add to your trip'}>
      <Field label="Type">
        <div className="trip-category-pills">
          {api.trips.CATEGORIES.map(category => (
            <Pill key={category.id} active={form.category === category.id} onClick={() => set('category', category.id)}>{category.label}</Pill>
          ))}
        </div>
      </Field>
      <Field label="Name">
        <input value={form.title} onChange={event => set('title', event.target.value)} placeholder={form.category === 'checklist' ? 'Check passport validity' : 'Flight, hotel, activity…'} style={fieldStyle} />
      </Field>
      {form.category === 'checklist' ? (
        <label className="trip-check-toggle">
          <input type="checkbox" checked={form.isComplete} onChange={event => set('isComplete', event.target.checked)} />
          <span>Already completed</span>
        </label>
      ) : (
        <Field label="Status">
          <div className="trip-category-pills">
            <Pill active={form.status === 'confirmed'} onClick={() => set('status', 'confirmed')} color="var(--teal)">Confirmed</Pill>
            <Pill active={form.status === 'tentative'} onClick={() => set('status', 'tentative')} color="var(--gold)">Tentative</Pill>
          </div>
        </Field>
      )}
      <div className="trip-form-row">
        <Field label="Starts">
          <input type="datetime-local" value={form.startsAt} onChange={event => set('startsAt', event.target.value)} style={fieldStyle} />
        </Field>
        <Field label="Ends">
          <input type="datetime-local" value={form.endsAt} onChange={event => set('endsAt', event.target.value)} style={fieldStyle} />
        </Field>
      </div>
      <div className="trip-form-row trip-form-row-cost">
        <Field label="Cost">
          <input value={form.cost} onChange={event => set('cost', event.target.value)} inputMode="decimal" placeholder="0" style={fieldStyle} />
        </Field>
        <Field label="Currency">
          <select value={form.currency} onChange={event => set('currency', event.target.value)} style={fieldStyle}>
            {api.trips.CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Booking reference">
        <input value={form.bookingRef} onChange={event => set('bookingRef', event.target.value)} placeholder="Optional" style={fieldStyle} />
      </Field>
      <Field label="Link">
        <input value={form.url} onChange={event => set('url', event.target.value)} inputMode="url" placeholder="Optional booking or map link" style={fieldStyle} />
      </Field>
      <Field label="Notes">
        <textarea value={form.notes} onChange={event => set('notes', event.target.value)} rows={3} placeholder="Terminal, address, cancellation notes…" style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
      </Field>
      {error && <div className="trip-form-error">{error}</div>}
      <div className="trip-sheet-actions">
        {item && <Button variant="ghost" onClick={remove} disabled={saving}>Remove</Button>}
        <Button onClick={save} disabled={saving} full>{saving ? 'Saving…' : 'Save item'}</Button>
      </div>
    </Sheet>
  );
}

// ---------- Board pieces ----------

const CATEGORY_EMOJI = {
  flight: '✈️', hotel: '🛏️', transport: '🚕', booking: '🎟️',
  activity: '📍', checklist: '✓', idea: '💡',
};

function ItemCard({ item, onEdit, onToggle }) {
  const api = tripsApi();
  const checklist = item.category === 'checklist';
  const done = checklist ? item.is_complete : item.status === 'confirmed';
  return (
    <article className={`trip-item-card${done ? ' is-done' : ''}${item.pending ? ' is-pending' : ''}`} onClick={() => onEdit(item)}>
      <button
        type="button"
        className={`trip-item-state${done ? ' is-done' : ''}`}
        aria-label={checklist ? (done ? 'Mark incomplete' : 'Mark complete') : 'Edit item'}
        onClick={event => {
          event.stopPropagation();
          if (checklist) void onToggle(item);
          else onEdit(item);
        }}
      >{checklist && done ? '✓' : CATEGORY_EMOJI[item.category]}</button>
      <div className="trip-item-main">
        <div className="trip-item-title">{item.title}</div>
        {item.starts_at && <div className="trip-item-time">{api.time.formatDualClock(item.starts_at)}</div>}
        <div className="trip-item-meta">
          {!checklist && <Badge status={done ? 'done' : 'pending'} size="sm">{done ? 'Confirmed' : 'Tentative'}</Badge>}
          {checklist && !done && <Badge status="pending" size="sm">To do</Badge>}
          {item.cost_amount !== null && item.cost_amount !== undefined && <Badge size="sm">{api.trips.formatCost(Number(item.cost_amount), item.cost_currency)}</Badge>}
          {item.pending && <Badge size="sm">Syncing</Badge>}
        </div>
        {item.booking_ref && <div className="trip-item-detail">Reference · {item.booking_ref}</div>}
        {item.notes && <div className="trip-item-notes">{item.notes}</div>}
        {item.url && <a href={item.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} className="trip-item-link">Open link ↗</a>}
      </div>
      <span className="trip-item-chevron">›</span>
    </article>
  );
}

function TripEmpty({ onCreate }) {
  return (
    <section className="trip-empty">
      <div className="trip-empty-art" aria-hidden="true">
        <span className="trip-empty-sun" />
        <span className="trip-empty-plane">✈</span>
        <span className="trip-empty-path" />
      </div>
      <div className="trip-eyebrow">YOUR NEXT ADVENTURE</div>
      <h2>Everything for the trip, in one calm place.</h2>
      <p>Save the route, flight and hotel details, plans, booking references, costs and the little things you must remember.</p>
      <Button onClick={onCreate} size="lg">Plan your first trip</Button>
      <div className="trip-empty-features">
        <span>✈️ Itinerary</span><span>✓ Checklist</span><span>◷ Offline access</span>
      </div>
    </section>
  );
}

function groupByDay(items) {
  const sorted = tripsApi().trips.sortItems(items);
  const groups = new Map();
  sorted.forEach(item => {
    const key = item.starts_at ? item.starts_at.slice(0, 10) : 'later';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()].map(([id, rows]) => ({
    id,
    label: id === 'later' ? 'Unscheduled' : new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${id}T12:00:00`)),
    items: rows,
  }));
}

function formatTripRange(trip) {
  const format = value => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'UTC' }).format(new Date(`${trip.end_date}T00:00:00Z`));
  return `${format(trip.start_date)} – ${format(trip.end_date)} ${year}`;
}

function countdownLabel(api, trip) {
  const days = api.trips.daysUntilTrip(trip);
  if (days > 1) return `${days} days to go`;
  if (days === 1) return 'Tomorrow';
  if (days === 0) return 'Starts today';
  if (days > -api.trips.tripLengthDays(trip)) return 'You are there now';
  return 'Trip complete';
}

const STARTER_CHECKLIST = [
  ['Passport and ID', 'Check validity and keep a secure copy'],
  ['Travel insurance', 'Save the policy and emergency number'],
  ['Online check-in', 'Add a reminder when it opens'],
  ['Airport transfer', 'Plan both ends of the journey'],
];

// ---------- Screen ----------

function TripBoardScreen({ onBack }) {
  const api = tripsApi();
  const store = useTrips();
  const [grouping, setGrouping] = useState('category');
  const [editing, setEditing] = useState(null);
  const [tripSheet, setTripSheet] = useState(null); // null | new | edit
  const [online, setOnline] = useState(() => api?.net.isOnline() ?? true);

  useEffect(() => api?.net.onNetworkChange(setOnline), [api]);

  const trip = store.activeTrip();
  const items = useMemo(() => {
    if (!api) return store.items;
    const pending = store.pending.filter(entry => entry.meta.tripId === store.activeTripId);
    return api.trips.mergePending(store.items, pending);
  }, [api, store.items, store.pending, store.activeTripId]);
  const totals = useMemo(() => api?.trips.tripTotals(items) ?? { confirmed: {}, tentative: {}, currencies: [] }, [api, items]);
  const progress = useMemo(() => api?.trips.tripProgress(items) ?? { done: 0, total: 0, percent: 0 }, [api, items]);
  const groups = useMemo(() => grouping === 'category' ? (api?.trips.groupByCategory(items) ?? []) : groupByDay(items), [api, items, grouping]);
  const failed = store.pending.filter(entry => entry.status === 'failed');
  const checklist = items.filter(item => item.category === 'checklist');
  const confirmed = items.filter(item => item.category !== 'checklist' && item.status === 'confirmed').length;

  async function saveTrip(saved) {
    store.activeTripId = saved.id;
    await store.load();
  }

  async function deleteTrip() {
    store.activeTripId = null;
    await store.load();
  }

  async function toggleChecklist(item) {
    await api.trips.queueTripItem(item.trip_id, item.client_id, {
      ...api.trips.toRow(item),
      is_complete: !item.is_complete,
    });
    void api.native.tap('light');
  }

  async function addStarter(title, notes) {
    if (!trip) return;
    await api.trips.queueTripItem(trip.id, api.trips.newItemClientId(), {
      category: 'checklist', title, starts_at: null, ends_at: null,
      cost_amount: null, cost_currency: 'AED', booking_ref: '', status: 'tentative',
      notes, url: '', is_complete: false,
    });
  }

  return (
    <ModulePage
      title="Trip board"
      subtitle={trip ? `${trip.origin || 'Home'} to ${trip.destination}` : 'Plan, book and remember'}
      icon="Luggage"
      onBack={onBack}
      action={<Button size="sm" onClick={() => trip ? setEditing({ item: null }) : setTripSheet('new')}>{trip ? 'Add item' : 'Plan trip'}</Button>}
    >
      <div className="trip-board">
        {!online && <div className="trip-offline">◷ Offline — changes stay safely on this device and sync when you reconnect.</div>}

        {failed.length > 0 && (
          <section className="trip-sync-error">
            <div><strong>{failed.length === 1 ? 'One change needs another try' : `${failed.length} changes need another try`}</strong><span>{failed[0].lastError || 'The connection dropped. Nothing has been lost.'}</span></div>
            <div className="trip-sync-actions">
              <Button size="sm" onClick={() => failed.forEach(entry => api.sync.retryEntry(entry.id))}>Try again</Button>
              <Button size="sm" variant="ghost" onClick={() => failed.forEach(entry => api.sync.discardEntry(entry.id))}>Discard</Button>
            </div>
          </section>
        )}

        {store.status === 'error' && (
          <section className="trip-load-error">
            <div><strong>Your trip board could not load</strong><span>{store.error}</span></div>
            <Button size="sm" onClick={() => tripStore.load()}>Try again</Button>
          </section>
        )}

        {store.status === 'loading' && !trip && <div className="trip-loading"><span />Loading your trips…</div>}
        {store.status === 'ready' && !trip && <TripEmpty onCreate={() => setTripSheet('new')} />}

        {trip && (
          <>
            {store.trips.length > 1 && (
              <div className="trip-switcher-row">
                <label htmlFor="trip-switcher">Viewing</label>
                <select id="trip-switcher" value={trip.id} onChange={event => void store.selectTrip(event.target.value)}>
                  {store.trips.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
                </select>
                <button type="button" onClick={() => setTripSheet('new')}>＋ New trip</button>
              </div>
            )}

            <section className="trip-hero">
              <div className="trip-hero-sun" aria-hidden="true" />
              <div className="trip-hero-content">
                <div className="trip-hero-topline"><span>{countdownLabel(api, trip)}</span><button type="button" onClick={() => setTripSheet('edit')}>Edit details</button></div>
                <h2>{trip.title}</h2>
                <div className="trip-route"><strong>{trip.origin || 'Home'}</strong><span>→</span><strong>{trip.destination}</strong></div>
                <div className="trip-date-line">{formatTripRange(trip)} · {api.trips.tripLengthDays(trip)} days</div>
                {trip.notes && <p>{trip.notes}</p>}
              </div>
              <div className="trip-progress-card">
                <div className="trip-progress-heading"><span>Trip readiness</span><strong>{progress.percent}%</strong></div>
                <div className="trip-progress-track"><span style={{ width: `${progress.percent}%` }} /></div>
                <div className="trip-progress-caption">{progress.total ? `${progress.done} of ${progress.total} essentials ready` : 'Add bookings or checklist items to begin'}</div>
              </div>
            </section>

            <section className="trip-snapshot" aria-label="Trip overview">
              <div><span className="trip-snapshot-icon">✓</span><span><strong>{confirmed}</strong><small>Confirmed</small></span></div>
              <div><span className="trip-snapshot-icon">☑</span><span><strong>{checklist.filter(item => item.is_complete).length}/{checklist.length}</strong><small>Checklist</small></span></div>
              <div><span className="trip-snapshot-icon">◷</span><span><strong>{items.filter(item => item.starts_at).length}</strong><small>Scheduled</small></span></div>
              <div><span className="trip-snapshot-icon">{totals.currencies[0] || 'AED'}</span><span><strong>{totals.currencies.length ? api.trips.formatCost(totals.confirmed[totals.currencies[0]] ?? 0, totals.currencies[0]).replace(`${totals.currencies[0]} `, '') : '0'}</strong><small>Confirmed spend</small></span></div>
            </section>

            {totals.currencies.length > 1 && (
              <section className="trip-costs">
                <div><span className="trip-eyebrow">TRIP COSTS</span><h3>Kept separate by currency</h3></div>
                <div className="trip-cost-list">
                  {totals.currencies.map(currency => (
                    <div key={currency}><strong>{api.trips.formatCost(totals.confirmed[currency] ?? 0, currency)}</strong>{totals.tentative[currency] > 0 && <span>+ {api.trips.formatCost(totals.tentative[currency], currency)} tentative</span>}</div>
                  ))}
                </div>
              </section>
            )}

            <div className="trip-board-toolbar">
              <div><span className="trip-eyebrow">YOUR PLAN</span><h3>Itinerary & essentials</h3></div>
              <div className="trip-view-toggle">
                <button type="button" className={grouping === 'category' ? 'is-active' : ''} onClick={() => setGrouping('category')}>Categories</button>
                <button type="button" className={grouping === 'date' ? 'is-active' : ''} onClick={() => setGrouping('date')}>Timeline</button>
              </div>
            </div>

            {items.length === 0 && (
              <section className="trip-items-empty">
                <span>✈️</span><div><h3>Build the trip in a useful order</h3><p>Add transport and a stay first, then plans, costs and things to remember.</p></div>
                <Button onClick={() => setEditing({ item: null })}>Add the first item</Button>
              </section>
            )}

            <div className="trip-groups">
              {groups.map(group => (
                <section key={group.id} className="trip-group">
                  <div className="trip-group-heading"><span>{CATEGORY_EMOJI[group.id] || '◷'}</span><h3>{group.label}</h3><small>{group.items.length}</small></div>
                  <div className="trip-group-items">
                    {group.items.map(item => <ItemCard key={item.client_id} item={item} onEdit={next => setEditing({ item: next })} onToggle={toggleChecklist} />)}
                  </div>
                </section>
              ))}
            </div>

            {checklist.length === 0 && (
              <section className="trip-starter-checklist">
                <div className="trip-starter-heading"><div><span className="trip-eyebrow">SMART START</span><h3>Travel checklist</h3></div><span>Add only what you need</span></div>
                <div className="trip-starter-grid">
                  {STARTER_CHECKLIST.map(([title, notes]) => (
                    <button key={title} type="button" onClick={() => void addStarter(title, notes)}><span>＋</span><div><strong>{title}</strong><small>{notes}</small></div></button>
                  ))}
                </div>
              </section>
            )}

            {store.trips.length === 1 && <button type="button" className="trip-new-link" onClick={() => setTripSheet('new')}>＋ Plan another trip</button>}
          </>
        )}
      </div>

      <ItemSheet open={editing !== null} trip={trip} item={editing?.item ?? null} onClose={() => setEditing(null)} />
      <TripSheet
        open={tripSheet !== null}
        trip={tripSheet === 'edit' ? trip : null}
        onClose={() => setTripSheet(null)}
        onSaved={saveTrip}
        onDeleted={deleteTrip}
      />
    </ModulePage>
  );
}

Object.assign(window, { TripBoardScreen });
