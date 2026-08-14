// space.jsx / Your profile and pairing
//
// A space is who you share with. On your own it is a space of one and the app
// works exactly the same. Pairing merges two spaces into one, which is a one
// way door in practice, so this screen says what is about to happen before
// anyone taps anything.

const { useState, useEffect, useCallback } = React;

function spaceApi() {
  return window.__lifeos;
}

const COMMON_ZONES = [
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Europe/London',
  'America/New_York',
  'Asia/Kolkata',
  'Australia/Sydney',
];

function useSpace() {
  const api = spaceApi();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const next = await api?.spaces.loadSpace(true);
    setState(next ?? null);
    setLoading(false);
  }, [api]);

  useEffect(() => {
    void reload();
    return api?.spaces.subscribeSpace(() => { void reload(); });
  }, [api, reload]);

  return { state, loading, reload };
}

// ---------- Profile ----------

function ProfileCard({ profile, onSaved }) {
  const api = spaceApi();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [zone, setZone] = useState(profile?.time_zone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(profile?.display_name ?? '');
    setZone(profile?.time_zone ?? '');
  }, [profile?.user_id, profile?.display_name, profile?.time_zone]);

  const zones = [...new Set([zone, api?.time.localZone(), ...COMMON_ZONES].filter(Boolean))];

  async function save() {
    setSaving(true);
    setSaved(false);
    const ok = await api.spaces.updateMyProfile({
      display_name: name.trim(),
      time_zone: zone,
    });
    setSaving(false);
    if (ok) {
      setSaved(true);
      void api.native.tap('light');
      onSaved();
    }
  }

  return (
    <Card padding="16px" style={{ marginBottom: 16 }}>
      <SectionHeader title="You" />

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
          Name
        </span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="What should this app call you?"
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
          Time zone
        </span>
        <select value={zone} onChange={e => setZone(e.target.value)} style={inputStyle}>
          <option value="">Choose one</option>
          {zones.map(z => (
            <option key={z} value={z}>{api?.spaces.cityFor(z)} ({z})</option>
          ))}
        </select>
      </label>

      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
        Your time zone is what puts both clocks on a video note, so set it to
        where you actually are.
      </div>

      <Button size="sm" onClick={save} disabled={saving}>
        {saving ? 'Saving' : saved ? 'Saved' : 'Save'}
      </Button>
    </Card>
  );
}

// ---------- Pairing ----------

function InviteCard({ onPaired }) {
  const api = spaceApi();
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [entered, setEntered] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api?.spaces.activeInvite().then(found => {
      if (!cancelled) setInvite(found);
    });
    return () => { cancelled = true; };
  }, [api]);

  async function generate() {
    setBusy(true);
    setError('');
    const next = await api.spaces.createInvite();
    setBusy(false);
    if (next) {
      setInvite(next);
      void api.native.tap('light');
    } else {
      setError('Could not create a code. Check your connection.');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Read it out instead.');
    }
  }

  async function join() {
    setBusy(true);
    setError('');
    const result = await api.spaces.redeemInvite(entered);
    setBusy(false);
    if (result.ok) {
      void api.native.notifyHaptic('success');
      setEntered('');
      onPaired();
    } else {
      setError(result.reason);
      void api.native.notifyHaptic('error');
    }
  }

  return (
    <>
      <Card padding="16px" style={{ marginBottom: 16 }}>
        <SectionHeader title="Invite someone" />
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 14 }}>
          Give them this code. Once they enter it, the two apps become one:
          video notes, prompts, trips, budget and lists, all shared.
        </div>

        {invite ? (
          <>
            <div style={{
              fontSize: 30, fontWeight: 700, letterSpacing: '0.14em',
              textAlign: 'center', padding: '18px 10px',
              background: 'var(--sand)', borderRadius: 16,
              fontVariantNumeric: 'tabular-nums',
            }}>{invite.code}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button size="sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
              <Button size="sm" variant="ghost" onClick={generate} disabled={busy}>
                New code
              </Button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
              Works once, and expires after seven days.
            </div>
          </>
        ) : (
          <Button size="sm" onClick={generate} disabled={busy}>
            {busy ? 'Working' : 'Create a code'}
          </Button>
        )}
      </Card>

      <Card padding="16px" style={{ marginBottom: 16 }}>
        <SectionHeader title="Enter their code" />
        <div style={{
          background: 'rgba(212, 168, 83, 0.16)',
          padding: '12px 14px', borderRadius: 12,
          fontSize: 13, lineHeight: 1.5, marginBottom: 14,
        }}>
          Read this before you join. Everything you have added so far moves
          into their space and becomes visible to them, including anything you
          wrote when you were on your own. This cannot be undone by unpairing.
        </div>

        <input
          value={entered}
          onChange={e => setEntered(e.target.value.toUpperCase())}
          placeholder="ABCD2345"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          style={{
            ...inputStyle,
            fontSize: 22, letterSpacing: '0.12em', textAlign: 'center',
            fontWeight: 700, padding: '14px 12px',
          }}
        />

        {error && (
          <div style={{
            background: '#fef2f2', color: '#b91c1c',
            padding: '10px 14px', borderRadius: 12,
            fontSize: 13, marginTop: 12,
          }}>{error}</div>
        )}

        <div style={{ marginTop: 12 }}>
          <Button onClick={join} disabled={busy || entered.trim().length < 6} full>
            {busy ? 'Joining' : 'Join their space'}
          </Button>
        </div>
      </Card>
    </>
  );
}

function PairedCard({ partner, onLeft }) {
  const api = spaceApi();
  const [busy, setBusy] = useState(false);

  async function leave() {
    const warning =
      'Unpair from ' + (partner?.display_name || 'them') + '?\n\n' +
      'You will start a fresh, empty space. Everything currently shared stays ' +
      'with them, including anything you added. This cannot be undone.';
    if (!window.confirm(warning)) return;

    setBusy(true);
    const ok = await api.spaces.leaveSpace();
    setBusy(false);
    if (ok) onLeft();
  }

  return (
    <Card padding="16px" style={{ marginBottom: 16 }} accent="var(--teal)">
      <SectionHeader title="Paired" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--terracotta) 0%, var(--gold) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 18, fontWeight: 700,
        }}>{(partner?.display_name || '?').slice(0, 1).toUpperCase()}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{partner?.display_name || 'Them'}</div>
          {partner?.time_zone && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {api?.spaces.cityFor(partner.time_zone)}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
        Everything in this app is shared between the two of you.
      </div>

      <Button size="sm" variant="ghost" onClick={leave} disabled={busy}>
        {busy ? 'Working' : 'Unpair'}
      </Button>
    </Card>
  );
}

// ---------- Screen ----------

function SpaceScreen({ onBack }) {
  const { state, loading, reload } = useSpace();

  return (
    <ModulePage
      title="You and your space"
      subtitle={state?.paired ? 'Paired' : 'On your own'}
      icon="Users"
      onBack={onBack}
    >
      {loading && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '20px 0' }}>Loading</div>
      )}

      {!loading && !state?.space && (
        <Card padding="16px" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Space not ready</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Your space has not finished setting up. Check your connection and try again.
          </div>
          <Button size="sm" onClick={reload}>Try again</Button>
        </Card>
      )}

      {!loading && state?.space && (
        <>
          <ProfileCard profile={state.me} onSaved={reload} />

          {state.paired
            ? <PairedCard partner={state.partner} onLeft={reload} />
            : <InviteCard onPaired={reload} />}

          <div style={{
            fontSize: 12, color: 'var(--muted)',
            lineHeight: 1.5, textAlign: 'center', marginTop: 8,
          }}>
            {state.paired
              ? 'Video notes, prompts, trips and lists are shared with them.'
              : 'The app works on your own. Pairing is optional.'}
          </div>
        </>
      )}
    </ModulePage>
  );
}

Object.assign(window, { SpaceScreen });
