# VOIDHACK 2026

A cinematic single-page hackathon website with a full registration system, an email notification pipeline, and a private admin control center — all running on **React + Vite** with **Supabase** (Postgres, Auth, RLS) as the backend. No custom server.

> **24-hour hackathon · build, break, ship.** Public site + registration wizard + admin console.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Pages & Routes](#pages--routes)
- [The Public Landing Page](#the-public-landing-page)
- [Registration Wizard](#registration-wizard)
- [Authentication & Security](#authentication--security)
- [Database Schema](#database-schema)
- [Email System](#email-system)
- [Admin Control Center](#admin-control-center)
- [Directory Structure](#directory-structure)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Deployment](#deployment)

---

## Overview

VOIDHACK 2026 is an event website for a 24-hour student hackathon. It has exactly **three experiences**:

1. **Public landing page** — a rich, animated, terminal-inspired showcase of the event (hero, manifesto, problem statements, experience, countdown, timeline, prizes, people, FAQ).
2. **Registration wizard** — a guided multi-step form that collects a team (2–4 members), lets them pick a problem statement, upload a payment proof, and submit everything **atomically** to the database.
3. **Admin control center** — a password-less (Supabase Auth) console where approved emails can browse every team, verify/reject payments, send verification and rejection emails, and manage registration rounds.

There is **no backend server**. A single Supabase project provides the database, authentication, and an Edge Function for email. Row Level Security (RLS) enforces who can read and write what.

---

## Tech Stack

### Frontend
| Purpose | Library |
|---|---|
| UI framework | React 19 |
| Build tooling | Vite 8 |
| Routing | React Router 7 |
| Animations | Framer Motion, GSAP, Lenis (smooth scroll) |
| 3D effects | Three.js + React Three Fiber + Drei |
| Forms | React Hook Form + Zod |
| State | Zustand (registration store, scroll gate store) |
| Icons | Lucide React |
| Supabase client | @supabase/supabase-js 2 |
| Excel export | SheetJS (xlsx) |
| Linting | Oxlint |

### Backend (Supabase, no custom server)
| Purpose | Service |
|---|---|
| Database | PostgreSQL via Supabase (RLS enabled) |
| Auth | Supabase Auth (email + password, session managed client-side) |
| Emails | Supabase Edge Function `send-registration-email` (Deno + Nodemailer/SMTP) |
| File hosting | Cloudinary (unsigned upload of payment screenshots) |

---

## Key Features

### Public side
- **Cinematic boot sequence** — a terminal-style "access granted" gate before the site reveals itself.
- **Animated landing sections** — hero with 3D visuals, manifesto, problems arena, past-event experience, live countdown, timeline, prizes, people, FAQ, final CTA.
- **Problem statement arena** — six real challenges (FINTECH, HEALTH, CLIMATE, SECURITY, EDUCATION, LOGISTICS) fetched live from the database.
- **Registration wizard** — 5-step guided form with draft persistence (refresh-safe via `sessionStorage`).
- **Live availability** — the form reads the *active registration round* from the database (fee, capacity, seats remaining, open/closed state).

### Registration
- Team name, college, and problem statement selection.
- Configurable team size (2–4) with exactly **one lead** participant.
- Per-member validation for name, email, phone, food preference (Veg/Non-Veg).
- Cloudinary **payment proof upload** (PNG/JPG/WEBP, max 10 MB) shown on the review screen.
- **Atomic submit** through a `register_team(payload jsonb)` SECURITY DEFINER RPC — the entire team + participants + payment URL is written in one transaction, so a partial registration can never exist.
- **Idempotent resubmit** — a retry reuses the same `registration_code`, so a refresh/duplicate click never creates two teams.
- **Issued pass** on completion showing the team's registration code.

### Admin
- Supabase Auth login (email/password); authorization gated by an `admin_users` **email allowlist**.
- Overview dashboard with live stats (total teams, participants, problems, payment status counts, problem distribution, active round, recent activity).
- Teams browser — search, filter by payment status / problem / college, sort, paginate, row-expand details with all members and the payment screenshot.
- Participants browser — full list with team context, search and filters.
- Payments console — view the uploaded proof, verify / reject with a reason.
- Registration Rounds manager — create rounds with title, fee, capacity, start/end window; activate/close/reopen with a **single-active round** database invariant.
- Reports — export full-dataset Excel files.
- **Send emails** — verification and rejection emails with per-team status tracking (`pending / sent / failed`) and send counts.

---

## Architecture

```
Browser (React 19 + Vite SPA)
        │
        ├── public Supabase client ──┬── Auth (login/session)
        │                            ├── SELECT problem_statements   (public arena)
        │                            └── RPC register_team(payload)  (atomic submit)
        │
        ├── admin Supabase client ───┬── Auth (session persisted)
        │                            ├── PostgREST reads/writes      (RLS: is_admin only)
        │                            └── Edge Function invoke        (send-registration-email)
        │
        ├── Cloudinary ────────────── upload payment screenshot (unsigned preset)
        │
        └── React Router ── Public landing page · Registration wizard · Admin (#admin/*)
```

Key architectural decisions:

- **No API server.** All reads/writes go straight through the Supabase PostgREST API using the publishable key. Authorization is enforced in the **database**, not the browser.
- **Two Supabase clients.** `getSupabase()` (anonymous, no persisted session) for the public flow, and `getAdminSupabase()` (persisted admin session) for the control center.
- **One write path for registrations.** The wizard does *zero* per-step DB writes. The whole entry is submitted through a single `SECURITY DEFINER` RPC that validates everything and commits atomically.
- **RLS is the security boundary.** Anonymous clients can only read `problem_statements` and execute the submit RPC. Everything admin is read/write-gated by `public.is_admin()`.
- **Emails go through an Edge Function** because SMTP secrets must never appear in the browser bundle.

---

## Pages & Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page (single-page sections) |
| `/register` alias → `#registration` | Public | Registration wizard |
| `/admin` alias → `#admin` | Admin (Auth + allowlist) | Control center |
| `/admin/teams` → `#admin/teams` | Admin | Teams browser |
| `/admin/participants` → `#admin/participants` | Admin | Participants browser |
| `/admin/payments` → `#admin/payments` | Admin | Payment verification |
| `/admin/rounds` → `#admin/rounds` | Admin | Registration rounds |
| `/admin/problems` → `#admin/problems` | Admin | Problem statements |
| `/admin/reports` → `#admin/reports` | Admin | Excel exports |

The app is entirely **hash-based** after `/admin`. A small redirect in `App.jsx` rewrites `/admin/...` path URLs to `#admin/...` so deep links work on static hosting.

The app has three top-level phases toggled in `App.jsx`:
`landing` → `registration` → `admin`.

---

## The Public Landing Page

All sections live at `/` in order:

| Section | Component | Content |
|---|---|---|
| Boot gate | `BootSequence.jsx` | Terminal-style animated "ACCESS GRANTED" sequence on first load |
| Nav | `Navigation.jsx` | Fixed nav with register CTA |
| Hero | `Hero.jsx` | Title, tagline, CTA |
| Manifesto | `Manifesto.jsx` | Theme / message |
| Problems | `Problems.jsx` | The six challenge statements (live from DB) |
| Experience | `Experience.jsx` | Past event feel / format |
| Countdown | `Countdown.jsx` | Live countdown to the event |
| Timeline | `Timeline.jsx` | Event schedule |
| Prizes | `Prizes.jsx` | Prize tiers |
| People | `People.jsx` | Mentors / judges / organizers |
| FAQ | `FAQ.jsx` | Common questions |
| Final CTA | `FinalSequence.jsx` | Closer + register button |

The visual direction is **dark, terminal / digital-noir**. Notable pieces:

- `Cursor.jsx` — custom cursor.
- `gateStore.js` — tracks scroll progress and velocity; `prefers-reduced-motion` is honored.
- `Lenis` powers smooth scrolling globally.
- Framer Motion `AnimatePresence` cross-fades between the three app phases.

---

## Registration Wizard

A single component (`NewRegistration/Registration.jsx`) plus a Zustand store (`store/registrationStore.js`) and an orchestration hook (`hooks/useRegistration.js`).

### Steps (index 0–4, plus a completion screen)

| Step | What it collects | Gate |
|---|---|---|
| 0 | Team name, college, problem statement | All three present |
| 1 | Team size (2–4) | Integer in range |
| 2 | Participant cards (2–4) | All fields valid, exactly one lead |
| 3 | Payment proof upload | Cloudinary upload success + URL |
| 4 | Review summary + submit | Everything from steps 0–3 |
| 5 | Issued pass (registration code) | — |

### How it behaves

- **Draft persistence.** Every step change is serialized to `sessionStorage` (`vh_registration_form`). A refresh restores the exact step, team, players, selected problem, and uploaded proof URL. Each entry into the wizard starts a **new session** (old draft cleared).
- **Client + server validation.** Steps are gated by the client (`validateParticipants` / `validateEntry`); the server RPC independently re-validates every field, so the UI can never bypass rules.
- **Availability probing.** The wizard calls `public_active_round()` RPC to learn fee, seats remaining, and whether registration is open/full/closed/not-open-yet. The UI never claims registration is closed on a network error — it surfaces the real load failure.
- **Capacity is enforced server-side.** `register_team` locks the active round row, re-checks the window, counts existing teams, and refuses with `REGISTRATION FULL` when capacity is reached. Two simultaneous submissions can never overshoot capacity.

### Submit payload shape

```json
{
  "registration_code": "VH-2026-AB12CD",
  "team_name": "Team Alpha",
  "college": "Example College",
  "problem_statement_id": "uuid",
  "payment_image_url": "https://res.cloudinary.com/.../proof.png",
  "payment_status": "submitted",
  "participants": [
    {
      "full_name": "Aarav Sharma",
      "email": "aarav@example.com",
      "phone": "9876543210",
      "food_preference": "Veg",
      "role": "lead"
    }
  ]
}
```

---

## Authentication & Security

### Admin login flow
1. Admin opens the admin route → `useAdminAuth` checks for an existing Supabase session (`vh_admin_session` storage key).
2. On `/admin/login`, `adminSignIn(email, password)` calls `supabase.auth.signInWithPassword`.
3. After sign-in, `verifyIsAdmin()` runs the `public.is_admin()` RPC — true only when the JWT's email is in `public.admin_users`.
4. Non-admins see an **Access Denied** page; admins proceed to the control center.

### RLS policy summary

| Table | Anonymous | Authenticated admin |
|---|---|---|
| `problem_statements` | SELECT (public arena) | SELECT |
| `teams` | nothing (only via RPC) | SELECT, UPDATE (payment status) |
| `participants` | nothing (only via RPC) | SELECT |
| `registration_rounds` | nothing (via RPC only) | SELECT, INSERT, UPDATE, DELETE |
| `admin_users` | nothing | nothing (read by `is_admin()` SECURITY DEFINER only) |

Rules:
- Anon can `SELECT problem_statements`.
- Anon can `EXECUTE register_team(payload)` — the *only* anonymous write path, and it is a single validated transaction.
- All admin data reads/writes require `auth.role() = 'authenticated'` **and** `public.is_admin()`.
- `is_admin()` is a SECURITY DEFINER function so the allowlist table stays unreadable to all clients.
- The `ensure_single_active_round` trigger guarantees at most one active registration round.

---

## Database Schema

```
problem_statements ←── teams ←── participants
                       │
                       └── registration_rounds (FK registration_round_id)
```

### `problem_statements`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default `gen_random_uuid()` |
| track | text | FINTECH, HEALTH, CLIMATE, SECURITY, EDUCATION, LOGISTICS |
| title | text | |
| description | text | |
| difficulty | text | Beginner / Intermediate / Advanced |
| created_at | timestamptz | |

### `teams` (one row = one registration)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| registration_code | text UNIQUE | `VH-2026-XXXXXX`, idempotency key |
| team_name | text | |
| college | text | |
| problem_statement_id | uuid FK | |
| payment_status | text | pending / submitted / verified / rejected |
| payment_image_url | text | Cloudinary URL of proof |
| rejection_reason | text | set by admin on reject |
| registration_round_id | uuid FK | nullable → legacy teams render as "LEGACY" |
| registration_fee | numeric | fee snapshot at submit time |
| verification_email_status / sent_at / last_error / send_count / last_sent_to | mixed | tracking for verification email |
| rejection_email_status / sent_at / last_error / send_count / last_sent_to | mixed | tracking for rejection email |
| created_at | timestamptz | |

### `participants`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| team_id | uuid FK (cascade delete) | |
| full_name | text | |
| email | text | lowercased on submit |
| phone | text | |
| food_preference | text | Veg / Non-Veg |
| role | text | lead / member — exactly one lead per team (validated in RPC) |
| created_at | timestamptz | |

### `registration_rounds`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| title | text | |
| slug | text | |
| fee | numeric | ≥ 0 |
| capacity | integer | > 0 |
| status | text | draft / active / closed |
| starts_at / ends_at | timestamptz | registration window |
| created_at / updated_at | timestamptz | |

### Key database functions (RPCs)
| Function | Used by | Purpose |
|---|---|---|
| `register_team(payload jsonb)` | Public wizard | Round-aware atomic submit; capacity + validation + stamping |
| `public_active_round()` | Public wizard | Availability probe (fee, seats, open state) — `{}` when closed |
| `is_admin()` | Everywhere | Email allowlist check |
| `admin_round_set_status(uuid, text)` | Admin | Activate/close atomically (single-active) |
| `admin_round_delete(uuid)` | Admin | Delete a round with zero teams |

---

## Email System

Managed entirely by the **`send-registration-email`** Supabase Edge Function (Deno + Nodemailer over SMTP).

### Actions
| Action | Trigger | Behavior |
|---|---|---|
| `verify` / `reject` | Admin payment verification | Sends verification/rejection email (legacy send-only path) |
| `send_verification` | Admin "Send Email" | Re-checks payment status server-side → sends → writes tracking columns |
| `send_rejection` | Admin "Send Email" | Reads stored `rejection_reason` → sends → writes tracking columns |

### Flow of a tracked send
1. Admin clicks send on a team in the Payments / Teams console.
2. Browser invokes the Edge Function with the **admin's own JWT** in the Authorization header.
3. The function re-authenticates the caller (`auth.getUser` + `is_admin()` RPC) — **no service-role key anywhere**.
4. It loads the team + its **lead participant** email through the caller's identity (RLS-gated).
5. If action is `send_verification`/`send_rejection`, it re-checks `payment_status` against the real row (`verified` / `rejected`) — a frontend flag is never trusted.
6. Nodemailer sends the templated email (team name, registration code, status, rejection reason, payment screenshot link).
7. **Only after a successful SMTP send** are the tracking columns written (`status=sent`, `sent_at`, `send_count+1`, `last_sent_to`). SMTP failures are recorded as `failed` so the UI shows an actionable state instead of auto-resending.
8. If the tracking write fails after a successful send, the response is `{ emailSent: true, statusUpdated: false }` so the UI never blindly retries (avoids duplicates).

### Email content
- **Verification** — congratulations, what to expect (build sprint, mentors/workshops, prizes, ceremonies), registration code + Verified status.
- **Rejection** — the admin's reason, the payment screenshot link (linked, not attached — avoids spam signals), registration code + Rejected status.

### Configuration
SMTP secrets are Supabase **Edge Function secrets** (never in the browser):
```bash
supabase secrets set SMTP_HOST=... SMTP_PORT=... SMTP_USER=... SMTP_PASS=...
```
Defaults target Gmail (`smtp.gmail.com:465`) using an App Password. *Note in the code: free-Gmail bulk sends often land in spam — a verified custom domain (Resend/SendGrid + SPF/DKIM) is the reliable fix.*

---

## Admin Control Center

Route alias `/admin` (→ `#admin`). Built from `src/admin/`:

| Page | Purpose |
|---|---|
| `Overview.jsx` | Stats dashboard |
| `Teams.jsx` | Searchable/filterable team table |
| `Participants.jsx` | Participant table with team context |
| `Payments.jsx` | Payment-proof verification console |
| `Rounds.jsx` | Registration round lifecycle manager |
| `ProblemStatements.jsx` | Problem statement list + team distribution |
| `Reports.jsx` | Full-dataset Excel export |
| `AdminLogin.jsx` / `AccessDenied.jsx` | Auth gates |

Supporting pieces: `TeamDetailsDrawer`, `PaymentProofViewer`, `DataTable`, `ConfirmDialog`, `StatusBadge`, `EmailStatusCell`, `Toast`, `Toolbar`. Services wrap all PostgREST reads (`adminData.js`), auth (`adminAuth.js`), and Excel export (`adminExcel.js`).

The **only administrative write** is payment status (verify/reject + reason). Rounds and emails use dedicated RPCs / Edge Functions so invariants stay in the database.

---

## Directory Structure

```
Hackathon/
├── index.html
├── package.json
├── vite.config.js
├── .env / .env.example
├── supabase/
│   ├── config.toml
│   ├── functions/
│   │   └── send-registration-email/
│   │       ├── index.ts            # Edge Function handler (auth + orchestration)
│   │       ├── emailservice.js     # Nodemailer templates (verify / reject)
│   │       └── .env.example
│   └── migrations/                  # 10 additive SQL migrations
│       ├── ..._setup_registration_flow.sql
│       ├── ..._secure_registration_submit.sql
│       ├── ..._atomic_submit_registration.sql
│       ├── ..._admin_control_center.sql
│       ├── ..._registration_rounds.sql
│       ├── ..._round_association_trigger.sql
│       ├── ..._canonical_register_team.sql
│       ├── ..._registration_email_service.sql
│       ├── ..._verification_email_tracking.sql
│       └── ..._rejection_email_tracking.sql
└── src/
    ├── main.jsx / App.jsx          # entry + phase switching / route alias
    ├── lib/
    │   ├── supabase.js             # getSupabase() + getAdminSupabase()
    │   ├── config.js               # env validation
    │   ├── schema.js               # single source of truth for table/column names
    │   └── api.js                  # AppError + friendlyError
    ├── services/                   # registration, problem, payment, cloudinary
    ├── store/                      # registrationStore (zustand), gateStore
    ├── hooks/                      # useRegistration orchestration
    ├── data/index.js               # static event content
    ├── components/                 # landing page sections
    └── admin/                      # control center (pages, components, services, hooks)
```

---

## Environment Variables

Create `.env` in the project root (a template exists at `.env.example`):

```env
# Supabase (public / publishable values only)
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>

# Cloudinary (unsigned upload preset for payment proofs)
VITE_CLOUDINARY_CLOUD_NAME=<cloud-name>
VITE_CLOUDINARY_UPLOAD_PRESET=<unsigned-preset>
```

> Only `VITE_*` publishable values may live in the browser bundle. The Cloudinary API secret and SMTP credentials stay inside Supabase Edge Function secrets. `lib/config.js` throws a loud, readable error when a variable is missing rather than failing silently downstream.

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Create .env (see above) and start Supabase locally (DB + Edge Function)
supabase start
supabase functions serve send-registration-email  # separate terminal,
                                                  # with function secrets loaded

# 3. Run the app
npm run dev          # Vite dev server (default http://localhost:5173)

# 4. Other scripts
npm run build        # production build to dist/
npm run preview      # preview the production build
npm run lint         # oxlint
```

Apply migrations to the remote project with:

```bash
supabase db push
```

---

## Deployment

- **Frontend** → Vite static build, deployable to any static host (Vercel / Netlify). SPA fallback is handled via the `/admin` → `#admin` rewrite in `App.jsx`, so no server rewrite config is strictly required.
- **Database / Auth / Realtime** → one Supabase project. Push migrations, create admin users in **Authentication → Users**, and add their emails to `public.admin_users`.
- **Email** → deploy the Edge Function with `supabase functions deploy send-registration-email` and set SMTP secrets with `supabase secrets set`.
- **Environment** → set the same `VITE_*` variables in the hosting provider's dashboard.

---

## Security Notes & Known Limitations

- Secret keys never enter the browser bundle; the SDK only ever uses the publishable key.
- RLS is the enforcement boundary for all data access — a forged UI cannot read registration data.
- Registration relies on an **unsigned Cloudinary upload preset**. Anyone with the preset name could upload files to your Cloudinary media library; restrict the preset or move to signed uploads via an Edge Function for production hardening.
- Emails on a free Gmail account may land in spam; a verified sending domain is recommended for real event volumes.
- No rate limiting / audit log yet — added value for production.