// trip-board.jsx / Shared trip board
//
// A trip, then everything hanging off it: flights, stays, bookings, ideas.
// Both of us edit the same board, so every write is optimistic and queued, and
// rows the other person changes arrive over realtime.

const { useState, useEffect, useMemo } = React;

function tripsApi() {
  return window.__lifeos;
}

// ---------- Store ----------

const tripStore = {
  trips: [],
  items: [],
  pending: [],
  activeTripId: null,
  status: 'idle', // idle | loading | ready | denied | error
  error: '',
  listeners: new Set(),

  emit() {
    this.listeners.forEach(fn => { try { fn(); } catch { /* keep going */ } });
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  async load() {
    const api = tripsApi();
    if (!api) return;
    if (this.status === 'idle') this.status = 'loading';
    this.emit();

    try {
      const ready = await api.spaces.hasSpace();
      if (!ready) {
        this.status = 'denied';
        this.emit();
        return;
      }

      const trips = await api.trips.loadTrips();
      this.trips = trips;
      if (!this.activeTripId || !trips.some(t => t.id === this.activeTripId)) {
        this.activeTripId = trips[0]?.id ?? null;
      }
      this.items = this.activeTripId ? await api.trips.loadItems(this.activeTripId) : [];
      this.status = 'ready';
      this.error = '';
    } catch (err) {
      this.status = 'error';
      this.error = err?.message || 'Could not load the trip';
    }
    this.emit();
  },

  setPending(entries) {
    this.pending = entries.filter(e => e.kind === 'trip-item');
    this.emit();
  },

  activeTrip() {
    return this.trips.find(t => t.id === this.activeTripId) ?? null;
  },
};

let tripsWired = false;

function wireTripStore() {
  if (tripsWired) return;
  const api = tripsApi();
  if (!api) return;
  tripsWired = true;

  api.trips.subscribeTrips(() => { void tripStore.load(); });
  api.outbox.subscribeOutbox(entries => tripStore.setPending(entries));
}

function useTrips() {
  const [, force] = useState(0);

  useEffect(() => {
    wireTripStore();
    const unsub = tripStore.subscribe(() => force(n => n + 1));
    if (tripStore.status === 'idle') void tripStore.load();
    return unsub;
  }, []);

  return tripStore;
}

// ---------- Form fields ----------

const fieldStyle = {
  width: '100%', padding: '11px 13px',
  border: '1px solid var(--line)', borderRadius: 12,
  fontSize: 15, fontFamily: 'inherit',
  background: 'var(--cream)', color: 'var(--dark)',
  outline: 'none', boxSizing: 'border-box',
};

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{
        display: 'block', fontSize: 12, fontWeight: 600,
        color: 'var(--muted)', marginBottom: 6,
      }}>{label}</span>
      {children}
    </label>
  );
}

/** datetime-local wants a local wall clock string, not an ISO instant. */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
    });
    setError('');
    // Keyed on the id rather than the object. The store hands out fresh item
    // objects on every reload, and realtime reloads while the other person is
    // editing, so depending on identity would wipe whatever is half typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.client_id]);

  if (!open || !form) return null;

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.title.trim()) {
      setError('Give it a name so it is recognisable on the board.');
      return;
    }
    const cost = form.cost.trim() === '' ? null : Number(form.cost);
    if (cost !== null && Number.isNaN(cost)) {
      setError('Cost needs to be a number, or left empty.');
      return;
    }

    setSaving(true);
    try {
      await api.trips.queueTripItem(
        trip.id,
        item?.client_id ?? api.trips.newItemClientId(),
        {
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
        },
      );
      void api.native.tap('light');
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not save this');
    }
    setSaving(false);
  }

  async function remove() {
    if (!item) return;
    if (!window.confirm('Remove this from the board?')) return;
    setSaving(true);
    await api.trips.queueTripItemDelete(item);
    setSaving(false);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={item ? 'Edit' : 'Add to the trip'}>
      <Field label="Type">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {api.trips.CATEGORIES.map(c => (
            <Pill
              key={c.id}
              active={form.category === c.id}
              onClick={() => set('category', c.id)}
            >{c.label}</Pill>
          ))}
        </div>
      </Field>

      <Field label="Name">
        <input
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="Etihad EY 611"
          style={fieldStyle}
        />
      </Field>

      <Field label="Status">
        <div style={{ display: 'flex', gap: 6 }}>
          <Pill active={form.status === 'confirmed'} onClick={() => set('status', 'confirmed')} color="var(--teal)">
            Confirmed
          </Pill>
          <Pill active={form.status === 'tentative'} onClick={() => set('status', 'tentative')} color="var(--gold)">
            Tentative
          </Pill>
        </div>
      </Field>

      <Field label="Starts">
        <input
          type="datetime-local"
          value={form.startsAt}
          onChange={e => set('startsAt', e.target.value)}
          style={fieldStyle}
        />
      </Field>

      <Field label="Ends">
        <input
          type="datetime-local"
          value={form.endsAt}
          onChange={e => set('endsAt', e.target.value)}
          style={fieldStyle}
        />
      </Field>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 2 }}>
          <Field label="Cost">
            <input
              value={form.cost}
              onChange={e => set('cost', e.target.value)}
              inputMode="decimal"
              placeholder="0"
              style={fieldStyle}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Currency">
            <select
              value={form.currency}
              onChange={e => set('currency', e.target.value)}
              style={fieldStyle}
            >
              {api.trips.CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <Field label="Booking reference">
        <input
          value={form.bookingRef}
          onChange={e => set('bookingRef', e.target.value)}
          placeholder="Optional"
          style={fieldStyle}
        />
      </Field>

      <Field label="Link">
        <input
          value={form.url}
          onChange={e => set('url', e.target.value)}
          inputMode="url"
          placeholder="Optional"
          style={fieldStyle}
        />
      </Field>

      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={3}
          placeholder="Optional"
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </Field>

      {error && (
        <div style={{
          background: '#fef2f2', color: '#b91c1c',
          padding: '10px 14px', borderRadius: 12,
          fontSize: 13, marginBottom: 12,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, paddingBottom: 8 }}>
        {item && (
          <Button variant="ghost" onClick={remove} disabled={saving}>Remove</Button>
        )}
        <Button onClick={save} disabled={saving} full>
          {saving ? 'Saving' : 'Save'}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------- Trip editor ----------

function TripSheet({ open, trip, onClose }) {
  const api = tripsApi();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !trip) return;
    setForm({
      title: trip.title,
      origin: trip.origin,
      destination: trip.destination,
      start_date: trip.start_date,
      end_date: trip.end_date,
      notes: trip.notes,
    });
    setError('');
    // Same reason as the item sheet: keyed on the id, not the object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trip?.id]);

  if (!open || !form) return null;

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.title.trim()) {
      setError('The trip needs a name.');
      return;
    }
    if (form.end_date < form.start_date) {
      setError('The end date is before the start date.');
      return;
    }
    setSaving(true);
    const ok = await api.trips.saveTrip(trip.id, {
      ...form,
      title: form.title.trim(),
    });
    setSaving(false);
    if (ok) onClose();
    else setError('Could not save. Check your connection and try again.');
  }

  return (
    <Sheet open={open} onClose={onClose} title="Trip details">
      <Field label="Name">
        <input value={form.title} onChange={e => set('title', e.target.value)} style={fieldStyle} />
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="From">
            <input value={form.origin} onChange={e => set('origin', e.target.value)} style={fieldStyle} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="To">
            <input value={form.destination} onChange={e => set('destination', e.target.value)} style={fieldStyle} />
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Start">
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} style={fieldStyle} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="End">
            <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} style={fieldStyle} />
          </Field>
        </div>
      </div>
      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={3}
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </Field>

      {error && (
        <div style={{
          background: '#fef2f2', color: '#b91c1c',
          padding: '10px 14px', borderRadius: 12,
          fontSize: 13, marginBottom: 12,
        }}>{error}</div>
      )}

      <Button onClick={save} disabled={saving} full>{saving ? 'Saving' : 'Save'}</Button>
    </Sheet>
  );
}

// ---------- Item card ----------

function ItemCard({ item, onEdit }) {
  const api = tripsApi();
  const confirmed = item.status === 'confirmed';

  return (
    <Card
      padding="14px"
      onClick={() => onEdit(item)}
      style={{ marginBottom: 10, opacity: item.pending ? 0.75 : 1 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{item.title}</div>

          {item.starts_at && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
              {api.time.formatDualClock(item.starts_at)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
            <Badge status={confirmed ? 'done' : 'pending'} size="sm">
              {confirmed ? 'Confirmed' : 'Tentative'}
            </Badge>
            {item.cost_amount !== null && item.cost_amount !== undefined && (
              <Badge size="sm">{api.trips.formatCost(Number(item.cost_amount), item.cost_currency)}</Badge>
            )}
            {item.pending && <Badge size="sm">Saving</Badge>}
          </div>

          {item.booking_ref && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Ref {item.booking_ref}
            </div>
          )}

          {item.notes && (
            <div style={{ fontSize: 13, lineHeight: 1.45, marginTop: 8, color: 'var(--dark)' }}>
              {item.notes}
            </div>
          )}

          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                display: 'inline-block', marginTop: 8, fontSize: 12,
                color: 'var(--terracotta)', fontWeight: 600,
              }}
            >Open link</a>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------- Screen ----------

function TripBoardScreen({ onBack }) {
  const api = tripsApi();
  const store = useTrips();
  const [grouping, setGrouping] = useState('category'); // category | date
  const [editing, setEditing] = useState(null); // { item } or { item: null }
  const [tripOpen, setTripOpen] = useState(false);
  const [online, setOnline] = useState(() => api?.net.isOnline() ?? true);

  useEffect(() => api?.net.onNetworkChange(setOnline), [api]);

  const trip = store.activeTrip();

  // Server rows with locally queued edits laid over the top, so an edit shows
  // straight away instead of flickering back while the write is in flight.
  const items = useMemo(() => {
    if (!api) return store.items;
    const mine = store.pending.filter(e => e.meta.tripId === store.activeTripId);
    return api.trips.mergePending(store.items, mine);
  }, [api, store.items, store.pending, store.activeTripId]);

  const totals = useMemo(
    () => api?.trips.tripTotals(items) ?? { confirmed: {}, tentative: {}, currencies: [] },
    [api, items],
  );

  const groups = useMemo(
    () => (grouping === 'category'
      ? api?.trips.groupByCategory(items) ?? []
      : [{ id: 'all', label: 'By date', icon: null, items: api?.trips.sortItems(items) ?? [] }]),
    [api, items, grouping],
  );

  const failed = store.pending.filter(e => e.status === 'failed');

  return (
    <ModulePage
      title="Trip board"
      subtitle={trip ? `${trip.origin} to ${trip.destination}` : 'No trip yet'}
      icon="Luggage"
      onBack={onBack}
      action={trip ? <Button size="sm" onClick={() => setEditing({ item: null })}>Add</Button> : null}
    >
      {!online && (
        <div style={{
          background: 'var(--sand)', color: 'var(--dark)',
          padding: '10px 14px', borderRadius: 12,
          fontSize: 13, marginBottom: 14,
        }}>
          You are offline. Changes are saved here and sent when you are back.
        </div>
      )}

      {failed.length > 0 && (
        <Card padding="14px" style={{ marginBottom: 14 }} accent="var(--terracotta)">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
            {failed.length === 1 ? 'One change did not send' : `${failed.length} changes did not send`}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
            {failed[0].lastError || 'The connection dropped.'} They are saved on this device.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => failed.forEach(e => api.sync.retryEntry(e.id))}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => failed.forEach(e => api.sync.discardEntry(e.id))}>
              Discard
            </Button>
          </div>
        </Card>
      )}

      {store.status === 'denied' && (
        <EmptyState
          emoji="⏳"
          title="Still setting up"
          body="Your space has not finished loading. Check your connection and try again."
        />
      )}

      {store.status === 'error' && (
        <Card padding="16px" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Could not load the trip</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{store.error}</div>
          <Button size="sm" onClick={() => tripStore.load()}>Try again</Button>
        </Card>
      )}

      {store.status === 'loading' && !trip && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '20px 0' }}>Loading</div>
      )}

      {store.status === 'ready' && !trip && (
        <EmptyState
          emoji="🧳"
          title="No trip yet"
          body="Run the trip migration to seed the October trip, or add one from the database."
        />
      )}

      {trip && (
        <>
          <Card padding="16px" style={{ marginBottom: 16 }} onClick={() => setTripOpen(true)}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{trip.title}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>
              {formatTripRange(trip)} · {api.trips.tripLengthDays(trip)} days
            </div>
            {countdownLabel(api, trip) && (
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--terracotta)', marginTop: 8 }}>
                {countdownLabel(api, trip)}
              </div>
            )}
            {trip.notes && (
              <div style={{ fontSize: 13, color: 'var(--dark)', marginTop: 10, lineHeight: 1.5 }}>
                {trip.notes}
              </div>
            )}

            {totals.currencies.length > 0 && (
              <div style={{
                display: 'flex', gap: 16, flexWrap: 'wrap',
                marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)',
              }}>
                {totals.currencies.map(currency => (
                  <div key={currency}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                      {currency}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                      {api.trips.formatCost(totals.confirmed[currency] ?? 0, currency)}
                    </div>
                    {totals.tentative[currency] > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        plus {api.trips.formatCost(totals.tentative[currency], currency)} tentative
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            <Pill active={grouping === 'category'} onClick={() => setGrouping('category')}>
              By category
            </Pill>
            <Pill active={grouping === 'date'} onClick={() => setGrouping('date')}>
              By date
            </Pill>
          </div>

          {items.length === 0 && (
            <EmptyState
              emoji="✈️"
              title="Nothing on the board"
              body="Add the flights first, then stays, then whatever either of us wants to do."
              action={<Button onClick={() => setEditing({ item: null })}>Add the first thing</Button>}
            />
          )}

          {groups.map(group => (
            <div key={group.id} style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                margin: '6px 0 10px',
              }}>{group.label}</div>
              {group.items.map(item => (
                <ItemCard
                  key={item.client_id}
                  item={item}
                  onEdit={next => setEditing({ item: next })}
                />
              ))}
            </div>
          ))}
        </>
      )}

      <ItemSheet
        open={editing !== null}
        trip={trip}
        item={editing?.item ?? null}
        onClose={() => setEditing(null)}
      />
      <TripSheet open={tripOpen} trip={trip} onClose={() => setTripOpen(false)} />
    </ModulePage>
  );
}

function formatTripRange(trip) {
  const opts = { day: 'numeric', month: 'short' };
  const start = new Date(`${trip.start_date}T00:00:00Z`);
  const end = new Date(`${trip.end_date}T00:00:00Z`);
  const fmt = d => new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(d);
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'UTC' }).format(end);
  return `${fmt(start)} to ${fmt(end)} ${year}`;
}

function countdownLabel(api, trip) {
  const days = api.trips.daysUntilTrip(trip);
  if (days > 1) return `${days} days to go`;
  if (days === 1) return 'Tomorrow';
  if (days === 0) return 'Today';
  const length = api.trips.tripLengthDays(trip);
  if (days > -length) return 'Happening now';
  return null;
}

Object.assign(window, { TripBoardScreen });
