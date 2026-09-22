-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Attendance system (ADDITIVE)
--   (additive on top of 20260912000000_atomic_submit_registration.sql
--    + 20260913000000_admin_control_center.sql)
--
--   What this migration adds / guarantees:
--     1. public.attendance       — one row per participant of every
--                                  VERIFIED team. Rows are created the
--                                  moment a team becomes verified and
--                                  never for pending/submitted/rejected
--                                  teams. `status` is 'present'/'absent'
--                                  (default 'absent'); marked_at /
--                                  marked_by record the check-in.
--     2. teams.attendance_token  — opaque, unique, non-sequential
--                                  token stamped automatically when a
--                                  team is verified. The QR encodes
--                                  https://<site>/attendance/scan?t=<token>
--                                  and resolves server-side. It is
--                                  never exposed to anon.
--     3. RLS on attendance       — admin-only reads/writes, enforced by
--                                  the existing public.is_admin() gate.
--                                  No anonymous or participant access.
--     4. Realtime                — attendance is added to the
--                                  supabase_realtime publication so the
--                                  admin dashboard updates LIVE.
--     5. Storage                 — an 'attendance-qr' PUBLIC bucket for
--                                  the server-generated QR PNGs
--                                  (attendance-qr/{team_id}.png). Only
--                                  admins may insert/update objects; the
--                                  public URL serves the image to the
--                                  email client (never the frontend).
--
--   Backfill: teams already verified BEFORE this migration gets a token
--   + one attendance row per participant (ON CONFLICT DO NOTHING).
--
--   Registration / payment / verification / email / admin are all
--   untouched. This file is SAFE TO RE-RUN and changes no existing row.
--   Run in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. attendance table ──────────────────────────────────────────

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  status text not null default 'absent' check (status in ('present', 'absent')),
  marked_at timestamptz,
  marked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, participant_id)
);

create index if not exists attendance_team_id_idx
  on public.attendance (team_id);
create index if not exists attendance_participant_id_idx
  on public.attendance (participant_id);
create index if not exists attendance_status_idx
  on public.attendance (status);
create index if not exists attendance_marked_at_idx
  on public.attendance (marked_at desc);

-- ── 2. teams.attendance_token (opaque, unique, non-sequential) ───

alter table public.teams
  add column if not exists attendance_token text;

create unique index if not exists teams_attendance_token_key
  on public.teams (attendance_token)
  where attendance_token is not null;

comment on column public.teams.attendance_token is
  'Opaque non-sequential token for the check-in QR. Stamped automatically when a team is verified; null for unverified teams.';

-- ── 3. Row Level Security on attendance (admins only) ────────────

alter table public.attendance enable row level security;

drop policy if exists "attendance_admin_select" on public.attendance;
create policy "attendance_admin_select"
  on public.attendance for select
  using (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "attendance_admin_insert" on public.attendance;
create policy "attendance_admin_insert"
  on public.attendance for insert
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "attendance_admin_update" on public.attendance;
create policy "attendance_admin_update"
  on public.attendance for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

-- No delete policy: attendance history is intentionally preserved.

-- ── 4. Automatic token + row initialization on verification ──────
--    REGISTRATION SETS payment_status; only an ADMIN verifying the
--    payment (teams.payment_status → 'verified') crosses this line.
--    Both helpers are idempotent so a re-verify never double-creates.

create or replace function public.ensure_attendance_token()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.payment_status = 'verified' and new.attendance_token is null then
    new.attendance_token := encode(extensions.gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$$;

create or replace function public.ensure_attendance_rows()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.payment_status = 'verified' then
    insert into public.attendance (team_id, participant_id, status)
    select new.id, p.id, 'absent'
      from public.participants p
     where p.team_id = new.id
    on conflict (team_id, participant_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists teams_stamp_attendance_token on public.teams;
create trigger teams_stamp_attendance_token
  before update of payment_status on public.teams
  for each row
  when (new.payment_status = 'verified')
  execute function public.ensure_attendance_token();

drop trigger if exists teams_init_attendance_rows on public.teams;
create trigger teams_init_attendance_rows
  after update of payment_status on public.teams
  for each row
  when (new.payment_status = 'verified')
  execute function public.ensure_attendance_rows();

-- ── 5. Backfill for teams verified before this migration ─────────

update public.teams
   set attendance_token = encode(extensions.gen_random_bytes(24), 'hex')
 where payment_status = 'verified'
   and attendance_token is null;

insert into public.attendance (team_id, participant_id, status)
select t.id, p.id, 'absent'
  from public.teams t
  join public.participants p on p.team_id = t.id
 where t.payment_status = 'verified'
on conflict (team_id, participant_id) do nothing;

-- ── 6. Realtime (live dashboard) ────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance'
  ) then
    alter publication supabase_realtime add table public.attendance;
  end if;
end $$;

-- ── 7. Storage: attendance-qr bucket for the server QR PNGs ──────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-qr',
  'attendance-qr',
  true,
  524288,
  array['image/png']
)
on conflict (id) do update set public = true;

-- Only admins may write QR objects; the public bucket URL serves the
-- image to the verification email (normal HTTPS <img>).

drop policy if exists "attendance_qr_admin_insert" on storage.objects;
create policy "attendance_qr_admin_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'attendance-qr'
    and auth.role() = 'authenticated'
    and public.is_admin()
  );

drop policy if exists "attendance_qr_admin_update" on storage.objects;
create policy "attendance_qr_admin_update"
  on storage.objects for update
  using (
    bucket_id = 'attendance-qr'
    and auth.role() = 'authenticated'
    and public.is_admin()
  )
  with check (
    bucket_id = 'attendance-qr'
    and auth.role() = 'authenticated'
    and public.is_admin()
  );

-- Public read so the emailed QR <img> loads for the participant without
-- any auth — names are opaque {team_id}.png UUID paths only.
drop policy if exists "attendance_qr_public_select" on storage.objects;
create policy "attendance_qr_public_select"
  on storage.objects for select
  using (bucket_id = 'attendance-qr');