import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSupabase } from '../../lib/supabase.js';
import { assertSupabaseConfigured } from '../../lib/config.js';
import ReferralLeaderboard from '../ReferralLeaderboard/ReferralLeaderboard.jsx';
import './Referrals.css';

const EASE = [0.16, 1, 0.3, 1];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* The two views of the referral hub. Both live on /referrals, so the tab
   switch never changes the URL. `index` is the printed step number. */
const TABS = [
  { id: 'referral', label: 'MY REFERRAL', index: '01' },
  { id: 'leaderboard', label: 'LEADERBOARD', index: '02' },
];

/* The program told as a vertical story beside the form. Explanatory UI
   only — static copy, no business logic lives here. */
const STEPS = [
  {
    index: '01',
    title: 'SHARE',
    body: 'Send your referral code to the teams you want to see building at HACK2PITCH.',
  },
  {
    index: '02',
    title: 'THEY REGISTER',
    body: 'They enter your code during registration.',
  },
  {
    index: '03',
    title: 'THEY GET VERIFIED',
    body: 'Once their team is verified, you receive 1 referral point.',
  },
];

/* Full-width brand mark used in the top bar. */
function Brand({ homeUrl }) {
  return (
    <a className="rfl__brand" href={homeUrl}>
      HACK<span>.</span>PITCH<span>26</span>
    </a>
  );
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => legacyCopy(text)
    );
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function SignupForm({ onSuccess }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = 'Enter your full name.';
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const next = validate();
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      assertSupabaseConfigured();
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('register_referral_member', {
        p_full_name: name.trim(),
        p_email: email.trim(),
      });

      if (error) {
        setFormError('The referral program is unavailable right now. Please try again.');
        return;
      }

      const result = data;
      if (result?.success && result?.referral_member) {
        onSuccess(result.referral_member);
        return;
      }
      if (result?.code === 'ALREADY_REGISTERED') {
        setErrors({ email: result.message || 'Already registered.' });
        return;
      }
      if (result?.code) {
        setFormError(result.message || 'We could not complete your signup. Please try again.');
        return;
      }
      setFormError('We could not complete your signup. Please try again.');
    } catch {
      setFormError('Enter your details above and join the program.');
    } finally {
      setBusy(false);
    }
  };

  const handleBlur = (field) => {
    const next = validate();
    if (next[field] !== errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: next[field] }));
    }
  };

  return (
    <motion.div
      className="rfl__claim"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: EASE }}
    >
      <p className="rfl__overline">MY REFERRAL</p>

      <h2 className="rfl__claim-title">
        <span>CLAIM</span>
        <span>YOUR</span>
        <span className="rfl__red">CODE.</span>
      </h2>

      <p className="rfl__claim-lede">
        Your personal HACK2PITCH referral code gives teams a direct route into
        the arena.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="rfl__fields">
          <label className="rfl__field">
            <span className="rfl__label">FULL NAME</span>
            <input
              className={`rfl__input${errors.name ? ' rfl__input--invalid' : ''}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => handleBlur('name')}
              placeholder="Alex Johnson"
              autoComplete="name"
              disabled={busy}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <span className="rfl__field-error">{errors.name}</span>}
          </label>

          <label className="rfl__field">
            <span className="rfl__label">EMAIL ADDRESS</span>
            <input
              className={`rfl__input${errors.email ? ' rfl__input--invalid' : ''}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => handleBlur('email')}
              placeholder="alex@example.com"
              autoComplete="email"
              disabled={busy}
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <span className="rfl__field-error">{errors.email}</span>}
          </label>
        </div>

        {formError && (
          <p className="rfl__form-error" role="alert">
            {formError}
          </p>
        )}

        <button className="rfl__cta" type="submit" disabled={busy}>
          <span>{busy ? 'GENERATING…' : 'GENERATE MY REFERRAL CODE'}</span>
          <span className="rfl__cta-arrow" aria-hidden="true">
            →
          </span>
        </button>

        <p className="rfl__fineprint">
          NO ACCOUNT REQUIRED — YOUR CODE IS ALL YOU NEED TO START REFERRING.
        </p>
      </form>
    </motion.div>
  );
}

function SuccessCard({ member }) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const code = member.referral_code;
  const shareUrl = `${window.location.origin}/register?ref=${encodeURIComponent(code)}`;
  const shareText = `Join HACK2PITCH 2026 through my referral code ${code}. Register at ${shareUrl}`;

  const handleCopy = async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'HACK2PITCH 2026 Referral', text: shareText });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    const ok = await copyToClipboard(shareText);
    if (ok) {
      setShared(true);
      setTimeout(() => setShared(false), 2400);
    }
  };

  return (
    <motion.div
      className="rfl__reveal"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: EASE }}
    >
      <p className="rfl__overline">YOUR CODE IS LIVE.</p>
      <p className="rfl__reveal-name">
        {member.full_name} — YOU&rsquo;RE A HACK2PITCH 2026 REFERRER.
      </p>

      {/* The code is treated as a pass, not a field: off-white block,
          oversized monospace, perforated tear line. */}
      <div className="rfl__pass">
        <div className="rfl__pass-head">
          <span>HACK2PITCH 2026</span>
          <span>REFERRAL CODE</span>
        </div>
        <p className="rfl__pass-code">{code}</p>
        <div className="rfl__pass-perf" aria-hidden="true" />
        <div className="rfl__pass-foot">
          <span>ENTER THIS CODE AT REGISTRATION</span>
        </div>
      </div>

      <div className="rfl__actions">
        <button className="rfl__btn rfl__btn--primary" type="button" onClick={handleCopy}>
          <span>{copied ? 'COPIED' : 'COPY CODE'}</span>
          <span className="rfl__cta-arrow" aria-hidden="true">
            →
          </span>
        </button>
        <button className="rfl__btn" type="button" onClick={handleShare}>
          {shared ? 'MESSAGE COPIED' : 'SHARE'}
        </button>
      </div>

      <p className="rfl__reveal-cry">
        SHARE IT.
        <br />
        BRING THEM IN.
        <br />
        <span className="rfl__red">CLIMB THE BOARD.</span>
      </p>
    </motion.div>
  );
}

export default function ReferralsPage({ homeUrl = '/' }) {
  const [member, setMember] = useState(null);
  const [tab, setTab] = useState('referral');
  /* The board is mounted the first time it is opened and then kept mounted,
     so the RPC runs once and toggling back never refetches it. */
  const [boardMounted, setBoardMounted] = useState(false);

  const selectTab = (id) => {
    setTab(id);
    if (id === 'leaderboard') setBoardMounted(true);
  };

  const handleTabKeyDown = (event) => {
    const delta =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const jump = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : null;
    if (delta === 0 && jump === null) return;
    event.preventDefault();
    const current = TABS.findIndex((t) => t.id === tab);
    const next =
      jump !== null
        ? jump
        : (current + delta + TABS.length) % TABS.length;
    const target = TABS[next];
    selectTab(target.id);
    event.currentTarget.parentElement
      ?.querySelectorAll('.rfl__tab')
      ?.[next]?.focus();
  };

  return (
    <div className="rfl">
      {/* Quiet atmosphere behind the typography: a near-black base, a red
          light from the top right, thin construction lines, film grain and
          one oversized brand word. Nothing here carries information. */}
      <div className="rfl__atmos" aria-hidden="true">
        <div className="rfl__atmos-glow" />
        <div className="rfl__atmos-grid" />
        <div className="rfl__atmos-grain" />
      </div>
      <span className="rfl__atmos-mark" aria-hidden="true">
        H2P
      </span>

      <header className="rfl__bar">
        <div className="rfl__bar-inner">
          <Brand homeUrl={homeUrl} />
          <a className="rfl__back" href={homeUrl}>
            ← BACK TO EVENT
          </a>
        </div>
      </header>

      <main className="rfl__inner">
        {/* ── Poster ── */}
        <section className="rfl__hero">
          <div className="rfl__hero-copy">
            <motion.p
              className="rfl__overline"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.6, ease: EASE }}
            >
              THE REFERRAL PROGRAM
            </motion.p>

            <motion.h1
              className="rfl__title"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.75, ease: EASE }}
            >
              <span>BRING</span>
              <span>THE CREW.</span>
              <span className="rfl__red">BUILD</span>
              <span className="rfl__red">THE RANK.</span>
            </motion.h1>

            <motion.p
              className="rfl__hero-lede"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22, duration: 0.7, ease: EASE }}
            >
              You know people who should be building at HACK2PITCH. Bring them
              in. Your verified referrals move you up the board.
            </motion.p>
          </div>

          {/* Typography as the visual object, cropped by the viewport. */}
          <div className="rfl__poster" aria-hidden="true">
            <span className="rfl__poster-num">01</span>
            <span className="rfl__poster-rule" />
            <span className="rfl__poster-word">REFERRAL</span>
            <span className="rfl__poster-year">/ 2026</span>
          </div>
        </section>

        {/* ── The one rule that matters, stated once ── */}
        <section className="rfl__truth">
          <h2 className="rfl__truth-line">
            <span className="rfl__truth-num">1</span>
            <span className="rfl__truth-word">VERIFIED TEAM</span>
            <span className="rfl__truth-eq">=</span>
            <span className="rfl__truth-num">1</span>
            <span className="rfl__truth-word">REFERRAL POINT</span>
          </h2>
          <p className="rfl__truth-note">
            Points are awarded only after a team you referred is{' '}
            <em>verified</em> by the organisers — not at registration.
          </p>
        </section>

        {/* ── View switch ── */}
        <nav
          className="rfl__tabs"
          role="tablist"
          aria-label="Referral views"
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`rfl-tab-${t.id}`}
                aria-selected={active}
                aria-controls={`rfl-view-${t.id}`}
                tabIndex={active ? 0 : -1}
                className={`rfl__tab${active ? ' rfl__tab--active' : ''}`}
                onClick={() => selectTab(t.id)}
              >
                <span className="rfl__tab-idx" aria-hidden="true">
                  {t.index}
                </span>
                <span className="rfl__tab-label">{t.label}</span>
              </button>
            );
          })}
        </nav>

        <section
          className={`rfl__panel rfl__panel--split${
            tab === 'referral' ? ' rfl__panel--active' : ' rfl__panel--hidden'
          }`}
          id="rfl-view-referral"
          role="tabpanel"
          aria-labelledby="rfl-tab-referral"
        >
          <div className="rfl__panel-main">
            <AnimatePresence mode="wait">
              {member ? (
                <SuccessCard key="success" member={member} />
              ) : (
                <SignupForm key="form" onSuccess={setMember} />
              )}
            </AnimatePresence>
          </div>

          <aside className="rfl__story">
            <p className="rfl__overline">HOW IT WORKS</p>
            <ol className="rfl__story-list">
              {STEPS.map((s) => (
                <li className="rfl__story-item" key={s.index}>
                  <span className="rfl__story-idx" aria-hidden="true">
                    {s.index}
                  </span>
                  <div className="rfl__story-body">
                    <h3 className="rfl__story-title">{s.title}</h3>
                    <p className="rfl__story-text">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </section>

        {boardMounted && (
          <section
            className={`rfl__panel rfl__panel--board${
              tab === 'leaderboard' ? ' rfl__panel--active' : ' rfl__panel--hidden'
            }`}
            id="rfl-view-leaderboard"
            role="tabpanel"
            aria-labelledby="rfl-tab-leaderboard"
          >
            <header className="rfl__board-head">
              <p className="rfl__overline">THE BOARD</p>
              <h2 className="rfl__board-title">
                WHO&rsquo;S
                <br />
                MOVING
                <br />
                <span className="rfl__red">UP?</span>
              </h2>
              <p className="rfl__board-lede">
                Every verified team changes the table.
              </p>
            </header>

            <ReferralLeaderboard
              embedded
              homeUrl={homeUrl}
              onJoinReferrals={() => selectTab('referral')}
            />
          </section>
        )}

        {/* ── Close ── */}
        <section className="rfl__closing">
          <h2 className="rfl__closing-title">
            BRING THE CREW.
            <br />
            <span className="rfl__red">BUILD THE RANK.</span>
          </h2>
          <a className="rfl__closing-back" href={homeUrl}>
            ← BACK TO HACK2PITCH 2026
          </a>
        </section>
      </main>
    </div>
  );
}
