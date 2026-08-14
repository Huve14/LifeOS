// auth.jsx — Login / Sign Up screen

const { useState, useCallback } = React;

function AuthScreen() {
  const [mode, setMode] = useState('name'); // name | email
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn, signUp } = window.__suvedaAuth;

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'name') {
        const n = name.trim() || 'Member';
        const autoEmail = `${n.toLowerCase().replace(/\s+/g, '.')}@lifeos.local`;
        // Try sign in first
        const { error: signInError } = await signIn(autoEmail, password);
        if (signInError) {
          // Account doesn't exist — sign up
          const { data, error: signUpError } = await signUp(autoEmail, password, n);
          if (signUpError) {
            setError(signUpError.message);
          } else if (!data?.session) {
            setError('Account created! Try signing in again.');
          }
        }
      } else {
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          setError(signInError.message);
        }
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong');
    }

    setLoading(false);
  }, [mode, email, password, name, signIn, signUp]);

  return (
    <div
      className="auth-screen"
      style={{
        minHeight: '100%', width: '100%',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
        background: 'var(--cream)',
        backgroundImage:
          'radial-gradient(at 20% 0%, rgba(246, 209, 16, 0.18) 0%, transparent 40%),' +
          'radial-gradient(at 100% 100%, rgba(129, 206, 235, 0.22) 0%, transparent 50%)',
        color: 'var(--dark)',
      }}
    >
      {/* Brand */}
      <div className="auth-brand" style={{ textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 24,
          background: 'linear-gradient(135deg, var(--honey) 0%, var(--blue) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: 34,
          boxShadow: '0 8px 28px -8px rgba(45, 114, 139, 0.4)',
        }}>🌴</div>
        <h1 style={{
          fontSize: 30, fontWeight: 700, fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          letterSpacing: '-0.5px', margin: 0,
        }}>Life OS</h1>
        <p style={{
          fontSize: 14, color: 'var(--muted)', marginTop: 6, fontWeight: 500,
        }}>
          {mode === 'name' ? 'Enter your name and create a password' : 'Sign in with email'}
        </p>
      </div>

      {/* Card */}
      <div className="auth-card" style={{
        background: 'var(--white)',
        borderRadius: 24, padding: '28px 24px',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--line)',
        maxWidth: 400, width: '100%', margin: '0 auto',
      }}>
        <form onSubmit={handleSubmit}>
          {mode === 'name' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block', fontSize: 12, fontWeight: 600,
                color: 'var(--muted)', marginBottom: 6,
              }}>Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                required
                autoFocus
                style={{
                  width: '100%', padding: '12px 14px',
                  border: '1px solid var(--line)', borderRadius: 12,
                  fontSize: 15, fontFamily: 'inherit',
                  background: 'var(--cream)',
                  color: 'var(--dark)',
                  outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--terracotta)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--line)'; }}
              />
            </div>
          )}

          {mode === 'email' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block', fontSize: 12, fontWeight: 600,
                color: 'var(--muted)', marginBottom: 6,
              }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  width: '100%', padding: '12px 14px',
                  border: '1px solid var(--line)', borderRadius: 12,
                  fontSize: 15, fontFamily: 'inherit',
                  background: 'var(--cream)',
                  color: 'var(--dark)',
                  outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--terracotta)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--line)'; }}
              />
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: 'var(--muted)', marginBottom: 6,
            }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              style={{
                width: '100%', padding: '12px 14px',
                border: '1px solid var(--line)', borderRadius: 12,
                fontSize: 15, fontFamily: 'inherit',
                background: 'var(--cream)',
                color: 'var(--dark)',
                outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--terracotta)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--line)'; }}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', color: '#b91c1c',
              padding: '10px 14px', borderRadius: 12,
              fontSize: 13, fontWeight: 500, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px',
              borderRadius: 14, border: 'none',
              background: loading
                ? '#aaa'
                : 'linear-gradient(135deg, var(--honey) 0%, var(--butter) 100%)',
              color: '#17272D', fontSize: 16, fontWeight: 700,
              fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 4px 14px -4px rgba(45, 114, 139, 0.4)',
            }}
          >
            {loading ? 'Processing…' : 'Start'}
          </button>
        </form>

        {/* Toggle to email sign in */}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => { setMode(m => m === 'name' ? 'email' : 'name'); setError(''); }}
            style={{
              background: 'none', border: 'none',
              fontSize: 13, color: 'var(--muted)',
              fontWeight: 500, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {mode === 'name'
              ? <>Use email instead <span style={{color:'var(--terracotta)',fontWeight:700}}>→</span></>
              : <>Use name instead <span style={{color:'var(--terracotta)',fontWeight:700}}>→</span></>
            }
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="auth-footer" style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
        Your everyday life in Abu Dhabi
      </div>
    </div>
  );
}

Object.assign(window, { AuthScreen });
