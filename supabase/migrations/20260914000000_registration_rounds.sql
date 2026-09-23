-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — Dynamic registration rounds (additive)
--   (sits ON TOP of the live database — it does NOT redefine
--    submit_registration, does NOT drop/recreate/rename ANY existing
--    table — INCLUDING public.registration_rounds, which ALREADY
--    EXISTS in Supabase — and does NOT touch RLS on teams /
--    participants / problem_statements.)
--
--   WHAT IT ADDS
--     1. registration_rounds reconciliation — the table ALREADY exists
--        (id, title, slug, fee, capacity, status, starts_at, ends_at,
--        created_at, updated_at). This migration never recreates it;
--        it only adds any MISSING optional column (slug); it never adds
--        a description column — the feature has no description field —
--        so both legacy and fresh databases work identically. RLS is
--        enabled and the public NEVER reads this table directly —
--        availability flows through the public_active_round() helper
--        below (minimum info only).
--     2. teams.registration_round_id     — nullable FK → the round a
--        team registered under. NULL = LEGACY registration (already
--        safe: old teams keep working and render as "LEGACY").
--     3. teams.registration_fee          — numeric snapshot of the fee
--        charged for THAT team. Never recomputed from later rounds.
--     4. register_team(jsonb)            — NEW SECURITY DEFINER RPC:
--        the ONLY round-aware write path. Resolves the active round,
--        validates its window, locks the round row (serializing
--        concurrent registrations), counts teams in it, refuses when
--        full (auto-closing the round), then DELEGATES the actual
--        validated team + participants insert to the EXISTING 7-param
--        submit_registration RPC (untouched) and stamps the team with
--        registration_round_id + registration_fee. All inside ONE
--        transaction — capacity can never be overrun by two users
--        registering at the same time. Capacity counts TEAMS, never
--        participants.
--     5. public_active_round()           — SECURITY DEFINER public
--        helper returning ONLY {id,title,fee,capacity,
--        starts_at,ends_at,status,registered,remaining,open} for the
--        active round (or {} when registration is closed).
--     6. Admin round helpers             — admin_round_set_status()
--        (activate/close/reopen, single-active guaranteed),
--        admin_round_delete() (refuses rounds that have teams).
--     7. Single-active trigger           — the database itself never
--        allows two rounds to be 'active' at once.
--
--   SECURITY
--     • registration_rounds: RLS ON. Only authenticated + is_admin()
--       may read/write it. Anon has NO table access.
--     • Registering still requires the payment proof + validated crew
--       (delegated to the existing submit_registration).
--     • No service-role keys, no public table writes.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. registration_rounds reconciliation (NEVER create a second one) ──
--    The table already exists in Supabase. Guarded create (fresh DBs
--    only) then additive column reconciliation for existing installs.
do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'registration_rounds'
  ) then
    create table public.registration_rounds (
      id          uuid primary key default gen_random_uuid(),
      title       text not null,
      slug        text,
      fee         numeric(10,2) not null default 0 check (fee >= 0),
      capacity    integer not null check (capacity > 0),
      status      text not null default 'draft'
                  check (status in ('draft', 'active', 'closed')),
      starts_at   timestamptz,
      ends_at     timestamptz,
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now()
    );
  end if;
end $$;

-- Any columns a pre-existing table may be missing — additive only.
alter table public.registration_rounds add column if not exists slug text;

alter table public.registration_rounds enable row level security;
create index if not exists registration_rounds_status_idx
  on public.registration_rounds (status);

-- ── 2. teams: round + fee snapshot (nullable → legacy safe) ───────
alter table public.teams add column if not exists
  registration_round_id uuid references public.registration_rounds(id);
alter table public.teams add column if not exists
  registration_fee numeric(10,2);
create index if not exists teams_registration_round_id_idx
  on public.teams (registration_round_id);

-- If the column pre-existed without a foreign key (e.g. added by hand),
-- postgres would not enforce referential integrity or advertise the
-- relationship to PostgREST (which powers the admin's teams(count)
-- embed). This guarantees the FK exists exactly once, no duplicates.
do $$
begin
  if not exists (
    select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.contype = 'f'
       and c.conrelid = 'public.teams'::regclass
       and a.attname = 'registration_round_id'
       and c.confrelid = 'public.registration_rounds'::regclass
  ) and exists (
    select 1 from pg_attribute
     where attrelid = 'public.teams'::regclass
       and attname = 'registration_round_id'
       and not attisdropped
  ) then
    alter table public.teams
      add constraint teams_registration_round_id_fkey
      foreign key (registration_round_id)
      references public.registration_rounds(id);
  end if;
end $$;

-- ── 3. RLS on registration_rounds (admins only; public via RPC) ──
drop policy if exists "rounds_admin_select" on public.registration_rounds;
create policy "rounds_admin_select"
  on public.registration_rounds for select
  using (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "rounds_admin_insert" on public.registration_rounds;
create policy "rounds_admin_insert"
  on public.registration_rounds for insert
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "rounds_admin_update" on public.registration_rounds;
create policy "rounds_admin_update"
  on public.registration_rounds for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "rounds_admin_delete" on public.registration_rounds;
create policy "rounds_admin_delete"
  on public.registration_rounds for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- The public NEVER reads/writes this table directly: the only anonymous
-- surface is the public_active_round() RPC (read) and register_team (the
-- validated write). The Supabase dashboard hands INSERT/UPDATE/DELETE/
-- SELECT grants to `anon` by default — strip them so no anon path can
-- ever reach the table, even with RLS accidentally misconfigured later.
revoke all on table public.registration_rounds from anon;

-- ── 4. Single-active invariant (last line of defense) ─────────────
create or replace function public.ensure_single_active_round()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' then
    update public.registration_rounds
       set status = 'closed', updated_at = now()
     where status = 'active' and id <> new.id;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_registration_rounds_single_active
  on public.registration_rounds;
create trigger trg_registration_rounds_single_active
  before insert or update on public.registration_rounds
  for each row execute function public.ensure_single_active_round();

-- ── 5. Public availability helper ─────────────────────────────────
--    Returns the ACTIVE round with live registered/remaining counts.
--    {} when there is no active round. This is the ONLY public view.
create or replace function public.public_active_round()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_round      public.registration_rounds%rowtype;
  v_registered integer := 0;
  v_now        timestamptz := now();
begin
  select * into v_round
    from public.registration_rounds
   where status = 'active'
   order by created_at desc, id desc
   limit 1;

  if not found then
    return '{}'::jsonb;
  end if;

  select count(*) into v_registered
    from public.teams
   where registration_round_id = v_round.id;

  return jsonb_build_object(
    'id',        v_round.id,
    'title',     v_round.title,
    'fee',       v_round.fee,
    'capacity',  v_round.capacity,
    'status',    v_round.status,
    'starts_at', v_round.starts_at,
    'ends_at',   v_round.ends_at,
    'registered', v_registered,
    'remaining', greatest(v_round.capacity - v_registered, 0),
    'open',
      v_round.status = 'active'
      and v_registered < v_round.capacity
      and (v_round.starts_at is null or v_round.starts_at <= v_now)
      and (v_round.ends_at is null or v_round.ends_at > v_now)
  );
end;
$$;

revoke all on function public.public_active_round() from public;
grant execute on function public.public_active_round() to anon, authenticated;

comment on function public.public_active_round() is
  'Public read of the current active registration round + live availability. Returns {} when registration is closed.';

-- ── 6. Admin round control helpers (SECURITY DEFINER) ─────────────
--    activate / close / reopen with the single-active rule applied
--    atomically; delete refuses a round that already collected teams.
create or replace function public.admin_round_set_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'ACCESS DENIED.' using errcode = '42501';
  end if;

  if p_status not in ('draft', 'active', 'closed') then
    raise exception 'INVALID ROUND STATUS.' using errcode = '23514';
  end if;

  if p_status = 'active' then
    -- close every other active round first, then activate (atomic)
    update public.registration_rounds
       set status = 'closed', updated_at = now()
     where status = 'active' and id <> p_id;
  end if;

  update public.registration_rounds
     set status = p_status, updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'ROUND NOT FOUND.' using errcode = '23503';
  end if;
end;
$$;

create or replace function public.admin_round_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'ACCESS DENIED.' using errcode = '42501';
  end if;

  if exists (select 1 from public.teams where registration_round_id = p_id) then
    raise exception 'ROUND HAS REGISTERED TEAMS AND CANNOT BE DELETED.' using errcode = '23503';
  end if;
  delete from public.registration_rounds where id = p_id;
  if not found then
    raise exception 'ROUND NOT FOUND.' using errcode = '23503';
  end if;
end;
$$;

revoke all on function public.admin_round_set_status(uuid, text) from public;
revoke all on function public.admin_round_delete(uuid) from public;
grant execute on function public.admin_round_set_status(uuid, text) to authenticated;
grant execute on function public.admin_round_delete(uuid) to authenticated;

comment on function public.admin_round_set_status(uuid, text) is
  'Admin round lifecycle: sets draft/active/closed atomically. Activating any round auto-closes the previous active one.';

comment on function public.admin_round_delete(uuid) is
  'Admin round delete — allowed only for rounds with zero registered teams.';

-- ── 7. register_team — the round-aware atomic submit (NEW) ────────
--    Capacity is enforced HERE, in the database, in the same
--    transaction that inserts the team. The existing submit_registration
--    RPC is left untouched and is only DELEGATED to for the validated
--    insert. A row lock on the round serializes concurrent registrations,
--    so 49/50 cannot become 51/50.
create or replace function public.register_team(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round         public.registration_rounds%rowtype;
  v_round_id      uuid;
  v_now           timestamptz := now();
  v_code          text := nullif(btrim(coalesce(payload->>'registration_code', '')), '');
  v_team_id       uuid;
  v_client_round  uuid;
  v_registered    integer := 0;
  v_status        text := coalesce(nullif(btrim(coalesce(payload->>'payment_status', '')), ''), 'submitted');
  v_ps_text       text := nullif(btrim(coalesce(payload->>'problem_statement_id', '')), '');
  v_ps            uuid;
  v_result        jsonb;
begin
  /* ── Resolve the active round (the only round that can accept). ── */
  if btrim(coalesce(payload->>'registration_round_id', '')) <> '' then
    begin
      v_client_round := (payload->>'registration_round_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID REGISTRATION ROUND.' using errcode = '23503';
    end;
  end if;

  select * into v_round
    from public.registration_rounds
   where status = 'active'
   order by created_at desc, id desc
   limit 1;

  if not found then
    raise exception 'REGISTRATION CLOSED.' using errcode = '23514';
  end if;

  v_round_id := v_round.id;

  -- the fee shown to the browser must match the ACTIVE round; a stale
  -- form (round switched by the admin) must never be charged the old fee
  if v_client_round is not null and v_client_round <> v_round_id then
    raise exception 'REGISTRATION ROUND CHANGED — RELOAD THE PAGE.' using errcode = '23514';
  end if;

  /* ── Serialize concurrent registrations on the round row. ──
       Any second submit blocks here until the first commits, then sees
       the fresh team count below. This is the anti-race lock. */
  perform 1
    from public.registration_rounds
   where id = v_round_id
     for update;

  -- re-verify after the lock: still active? inside the window?
  select starts_at, ends_at, capacity, status
    into v_round.starts_at, v_round.ends_at, v_round.capacity, v_round.status
    from public.registration_rounds
   where id = v_round_id;

  if v_round.status <> 'active' then
    raise exception 'REGISTRATION CLOSED.' using errcode = '23514';
  end if;
  if v_round.starts_at is not null and v_round.starts_at > v_now then
    raise exception 'REGISTRATION NOT OPEN YET.' using errcode = '23514';
  end if;
  if v_round.ends_at is not null and v_round.ends_at <= v_now then
    raise exception 'REGISTRATION CLOSED.' using errcode = '23514';
  end if;

  /* ── Problem statement sanity (parity with submit_registration). ── */
  if v_ps_text is not null then
    begin
      v_ps := v_ps_text::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID PROBLEM STATEMENT.' using errcode = '23503';
    end;
    perform 1 from public.problem_statements where id = v_ps;
    if not found then
      raise exception 'INVALID PROBLEM STATEMENT.' using errcode = '23503';
    end if;
  end if;

  /* ── Idempotent retries must NOT consume new capacity. ──
       The wizard reserves a registration_code before the first submit,
       and resends it on retry, so the same code means the same team.
       Only a genuinely NEW team is counted against capacity. */
  if v_code is not null then
    select id into v_team_id from public.teams where registration_code = v_code limit 1;
  end if;
  if v_team_id is null
     and nullif(btrim(coalesce(payload->>'team_id', '')), '') is not null
  then
    begin
      v_team_id := (payload->>'team_id')::uuid;
    exception when invalid_text_representation then
      v_team_id := null;
    end;
  end if;

  if v_team_id is null then
    select count(*) into v_registered
      from public.teams
     where registration_round_id = v_round_id;

    if v_registered >= v_round.capacity then
      update public.registration_rounds
         set status = 'closed', updated_at = v_now
       where id = v_round_id;
      raise exception 'REGISTRATION FULL.' using errcode = '23514';
    end if;
  end if;

  /* ── Delegate the validated insert to the untouched RPC. ── */
  if v_ps is null then
    v_result := public.submit_registration(
      p_registration_code   := v_code,
      p_team_name           := nullif(btrim(coalesce(payload->>'team_name', '')), ''),
      p_college             := nullif(btrim(coalesce(payload->>'college', '')), ''),
      p_problem_statement_id := null,
      p_payment_status      := v_status,
      p_payment_image_url   := nullif(btrim(coalesce(payload->>'payment_image_url', '')), ''),
      p_participants        := coalesce(payload->'participants', '[]'::jsonb)
    );
  else
    v_result := public.submit_registration(
      p_registration_code   := v_code,
      p_team_name           := nullif(btrim(coalesce(payload->>'team_name', '')), ''),
      p_college             := nullif(btrim(coalesce(payload->>'college', '')), ''),
      p_problem_statement_id := v_ps,
      p_payment_status      := v_status,
      p_payment_image_url   := nullif(btrim(coalesce(payload->>'payment_image_url', '')), ''),
      p_participants        := coalesce(payload->'participants', '[]'::jsonb)
    );
  end if;

  /* ── Read back the team, stamp its round + fee snapshot. ── */
  if v_code is not null then
    select id into v_team_id from public.teams where registration_code = v_code limit 1;
  else
    -- defensive: no code (client always sends one) — fall back to team_id
    declare
      v_tid uuid;
    begin
      v_tid := nullif((payload->>'team_id'), '')::uuid;
      select id, registration_code into v_team_id, v_code
        from public.teams
       where id = v_tid
       order by created_at desc
       limit 1;
    exception when invalid_text_representation then
      v_team_id := null;
    end;
  end if;

  if v_team_id is null then
    raise exception 'REGISTRATION COULD NOT BE COMPLETED.' using errcode = '23514';
  end if;

  update public.teams
     set registration_round_id = v_round_id,
         registration_fee = v_round.fee
   where id = v_team_id;

  /* ── Capacity reached → the round becomes CLOSED automatically. ── */
  select count(*) into v_registered
    from public.teams
   where registration_round_id = v_round_id;

  if v_registered >= v_round.capacity then
    update public.registration_rounds
       set status = 'closed', updated_at = now()
     where id = v_round_id;
  end if;

  return jsonb_build_object(
    'team_id',              v_team_id,
    'registration_code',    v_code,
    'payment_status',       v_status,
    'submitted_at',         now(),
    'registration_round_id', v_round_id,
    'registration_fee',     v_round.fee,
    'round_title',          v_round.title
  );
end;
$$;

revoke all on function public.register_team(jsonb) from public;
grant execute on function public.register_team(jsonb) to anon, authenticated;

comment on function public.register_team(jsonb) is
  'Round-aware atomic registration submit. Resolves the active round, enforces dates + team capacity with a row lock (race-safe), then delegates the validated team + crew insert to the existing submit_registration RPC and stamps registration_round_id + registration_fee. Auto-closes the round at capacity.';