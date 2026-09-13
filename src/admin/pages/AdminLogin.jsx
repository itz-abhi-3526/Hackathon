/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Admin login
   Supabase-Auth password sign-in. Unauthenticated visitors to any
   #admin route land here. No admin link exists anywhere on the
   public site — the control center is reachable only via /admin.
   ═══════════════════════════════════════════════════════════════ */

import { useState } from 'react';

export default function AdminLogin({ signIn, busy, error, onViewSite }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!busy) signIn(email, password);
  };

  return (
    <div className="cpa-login">
      <div className="cpa-login__card">
        <button type="button" className="cpa-login__back" onClick={onViewSite}>← BACK TO SITE</button>
        <div className="cpa-login__mark" aria-hidden="true">V/</div>
        <p className="cpa-login__eyebrow">VOIDHACK 2026 / OPS PLATFORM</p>
        <h1 className="cpa-login__title">ADMIN ACCESS</h1>
        <p className="cpa-login__sub">Restricted. The server verifies your identity against the admin allowlist.</p>

        <form className="cpa-login__form" onSubmit={submit}>
          <label className="cpa-login__label" htmlFor="cpa-email">EMAIL</label>
          <input
            id="cpa-email"
            className="cpa-login__input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            required
          />
          <label className="cpa-login__label" htmlFor="cpa-pass">PASSWORD</label>
          <input
            id="cpa-pass"
            className="cpa-login__input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="cpa-login__error">{error}</p>}
          <button type="submit" className="cpa-login__submit" disabled={busy}>
            {busy ? 'AUTHENTICATING…' : 'SIGN IN'}
          </button>
        </form>

        <p className="cpa-login__note">SESSION PERSISTS — You will stay signed in across visits until you sign out.</p>
      </div>
      <div className="cpa-login__foot">© 2026 VOIDHACK. AUTHORIZED PERSONNEL ONLY.</div>
    </div>
  );
}