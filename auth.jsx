// auth.jsx — Real email accounts for every Life OS member.

const { useState, useCallback } = React;

function AuthScreen() {
  const [accountMode, setAccountMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [homeTown, setHomeTown] = useState('');
  const [emirate, setEmirate] = useState('Abu Dhabi');
  const [arrivedOn, setArrivedOn] = useState('');
  const [status, setStatus] = useState('just_landed');
  const [employerName, setEmployerName] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);

  const { signIn, signUp } = window.__suvedaAuth;
  const { describeSignUpOutcome } = window.__lifeos.registration;
  const registering = accountMode === 'signup';

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    setFeedback(null);
    setLoading(true);

    try {
      if (registering) {
        const result = await signUp(email.trim(), password, name.trim(), {}, {
          home_town: homeTown,
          emirate,
          arrived_on: arrivedOn,
          status,
          employer_name: employerName,
        });
        setFeedback(describeSignUpOutcome(result, email.trim()));
      } else {
        const { error: signInError } = await signIn(email.trim(), password);
        if (signInError) setFeedback({ tone: 'error', message: signInError.message });
      }
    } catch (err) {
      setFeedback({ tone: 'error', message: err?.message || 'Something went wrong' });
    } finally {
      setLoading(false);
    }
  }, [arrivedOn, describeSignUpOutcome, email, emirate, employerName, homeTown, name, password, registering, signIn, signUp, status]);

  return (
    <div className="auth-screen" style={{
      minHeight: '100%', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
      background: 'var(--cream)',
      backgroundImage: 'radial-gradient(at 20% 0%, rgba(246, 209, 16, 0.18) 0%, transparent 40%),radial-gradient(at 100% 100%, rgba(129, 206, 235, 0.22) 0%, transparent 50%)',
      color: 'var(--dark)',
    }}>
      <div className="auth-brand" style={{ textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 24, background: 'linear-gradient(135deg, var(--honey) 0%, var(--blue) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 34,
          boxShadow: '0 8px 28px -8px rgba(45, 114, 139, 0.4)',
        }}>🌴</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.5px', margin: 0 }}>Life OS</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6, fontWeight: 500 }}>
          {registering ? 'Create your private Abu Dhabi companion' : 'Sign in with your email'}
        </p>
      </div>

      <div className="auth-card" style={{
        background: 'var(--white)', borderRadius: 24, padding: '28px 24px', boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--line)', maxWidth: registering ? 560 : 400, width: '100%', margin: '0 auto',
      }}>
        <div className="onboarding-auth-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={!registering} className={!registering ? 'is-active' : ''} onClick={() => { setAccountMode('signin'); setFeedback(null); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={registering} className={registering ? 'is-active' : ''} onClick={() => { setAccountMode('signup'); setFeedback(null); }}>Register</button>
        </div>

        <form onSubmit={handleSubmit}>
          {registering && <label className="auth-profile-field"><span>Name</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Your name" required autoComplete="name" /></label>}
          <label className="auth-profile-field"><span>Email</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required autoComplete="email" /></label>
          <label className="auth-profile-field"><span>Password</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="••••••••" required minLength={6} autoComplete={registering ? 'new-password' : 'current-password'} /></label>

          {registering && <div className="auth-ai-profile-grid" style={{ marginTop: 14 }}>
            <label className="auth-profile-field"><span>SA home town</span><input value={homeTown} onChange={event => setHomeTown(event.target.value)} placeholder="e.g. Durban" required /></label>
            <label className="auth-profile-field"><span>Emirate</span><select value={emirate} onChange={event => setEmirate(event.target.value)} required><option>Abu Dhabi</option><option>Dubai</option><option>Sharjah</option><option>Ajman</option><option>Ras Al Khaimah</option><option>Fujairah</option><option>Umm Al Quwain</option></select></label>
            <label className="auth-profile-field"><span>Where are you in the journey?</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="landing_soon">Landing soon</option><option value="just_landed">Just landed</option><option value="settled">Settled in</option></select></label>
            <label className="auth-profile-field"><span>{status === 'landing_soon' ? 'Expected arrival' : 'Arrival date'} <small>optional</small></span><input type="date" value={arrivedOn} onChange={event => setArrivedOn(event.target.value)} /></label>
            <label className="auth-profile-field"><span>Employer <small>optional</small></span><input value={employerName} onChange={event => setEmployerName(event.target.value)} placeholder="Used only for your benefits" /></label>
          </div>}

          {feedback && <div role="status" aria-live="polite" className={`auth-feedback is-${feedback.tone}`}>{feedback.message}</div>}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '14px', marginTop: 18, borderRadius: 14, border: 'none',
            background: loading ? '#aaa' : 'linear-gradient(135deg, var(--honey) 0%, var(--butter) 100%)',
            color: '#17272D', fontSize: 16, fontWeight: 700, fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>{loading ? 'Processing…' : registering ? 'Create account' : 'Sign in'}</button>
        </form>
      </div>

      <div className="auth-footer" style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>Your everyday life in Abu Dhabi</div>
    </div>
  );
}

Object.assign(window, { AuthScreen });
