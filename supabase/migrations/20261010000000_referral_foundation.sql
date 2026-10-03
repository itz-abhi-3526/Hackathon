-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — Referral foundation (additive)
--
--   WHAT IT ADDS
--     1. referral_members  — standalone referral participants
--        (the registration system is ANONYMOUS and has no public
--         user/profile table, so this table follows the existing
--         judges-profile model — it does NOT reference auth.users).
--     2. referral_rewards  — one row per team that was VERIFIED
--        under the EXISTING admin verification lifecycle. The
--        UNIQUE(team_id) constraint is the database-level guarantee
--        that ONE VERIFIED TEAM = AT MOST ONE REFERRAL REWARD.
--     3. teams.referral_code (nullable FK) — NULL keeps today's
--        non-referral registration behaving exactly as it does now.
--     4. award_referral_reward() AFTER UPDATE trigger on teams —
--        fires only when payment_status CHANGES to 'verified' (the
--        existing production verification state), awarding exactly
--        1 point, idempotently. No reward on submit / no reward on
--        payment upload / no reward on reject.
--
--   SECURITY
--     • RLS ON for both tables; ONLY the admin allowlist (is_admin())
--       may read them. NO anon/authenticated INSERT/UPDATE/DELETE
--       policies exist — the browser can NEVER write points or
--       rewards directly.
--     • Table grants to `anon` are revoked (defense in depth, same
--       convention as registration_rounds). `authenticated` keeps its
--       row-level grants but has zero write policies, and reads are
--       gated to admins by RLS.
--     • The trigger is SECURITY DEFINER with search_path pinned to ''
--       and every object schema-qualified.
--
--   NOT IN THIS STEP (later, separate approvals):
--     referral signup / code-generation RPC, register_team optional
--     referral_code parameter, public referral leaderboard / lookup.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. referral_members ──────────────────────────────────────────
create table if not exists public.referral_members (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  email         text not null
                check (email = lower(email)),
  referral_code text not null
                check (referral_code = upper(referral_code)),
  points        integer not null default 0
                check (points >= 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint referral_members_email_key unique (email),
  constraint referral_members_referral_code_key unique (referral_code)
);

-- ── 2. referral_rewards ─────────────────────────────────────────
create table if not exists public.referral_rewards (
  id                  uuid primary key default gen_random_uuid(),
  referral_member_id  uuid not null
                      references public.referral_members(id),
  team_id             uuid not null
                      references public.teams(id),
  points_awarded      integer not null default 1,
  created_at          timestamptz not null default now(),
  constraint referral_rewards_team_id_key unique (team_id)
);

create index if not exists referral_rewards_member_id_idx
  on public.referral_rewards (referral_member_id);

-- ── 3. teams.referral_code (nullable FK; NULL = non-referral) ────
alter table public.teams add column if not exists referral_code text;

-- Guarded FK add so a re-run never double-creates the constraint
-- (same guarded pattern used by the registration_rounds migration).
do $$
begin
  if not exists (
    select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.contype = 'f'
       and c.conrelid = 'public.teams'::regclass
       and a.attname = 'referral_code'
       and c.confrelid = 'public.referral_members'::regclass
  ) and exists (
    select 1 from pg_attribute
     where attrelid = 'public.teams'::regclass
       and attname = 'referral_code'
       and not attisdropped
  ) then
    alter table public.teams
      add constraint teams_referral_code_fkey
      foreign key (referral_code)
      references public.referral_members(referral_code);
  end if;
end $$;

create index if not exists teams_referral_code_idx
  on public.teams (referral_code);

-- ── 4. RLS / grants ─────────────────────────────────────────────
alter table public.referral_members enable row level security;
alter table public.referral_rewards enable row level security;

-- Admin-only reads. NO insert/update/delete policies are created on
-- either table: all writes must flow through SECURITY DEFINER
-- functions (the reward trigger here; the future signup RPC). This is
-- what makes browser-side point increments impossible.
drop policy if exists "referral_members_admin_select" on public.referral_members;
create policy "referral_members_admin_select"
  on public.referral_members for select
  using (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "referral_rewards_admin_select" on public.referral_rewards;
create policy "referral_rewards_admin_select"
  on public.referral_rewards for select
  using (auth.role() = 'authenticated' and public.is_admin());

-- Defense in depth: the Supabase Data API grants `anon` on new tables
-- by default. Strip them (same convention as registration_rounds) so
-- no anon path can ever reach these tables, RLS or not.
revoke all on table public.referral_members from anon;
revoke all on table public.referral_rewards from anon;

-- ── 5. Reward trigger ───────────────────────────────────────────
-- Fires on the EXISTING verification lifecycle:
--   teams.payment_status CHANGES TO 'verified'
-- (it does NOT fire on team creation, submission, or rejection —
--   those transitions never have payment_status = 'verified').
create or replace function public.award_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_reward_id uuid;
begin
  -- Non-referral teams: same as today, no reward, no side effects.
  if new.referral_code is null then
    return null;
  end if;

  -- Resolve the member. If the code no longer resolves, exit quietly —
  -- verification must NEVER be rolled back by the referral trigger.
  select id into v_member_id
    from public.referral_members
   where referral_code = new.referral_code
   limit 1;

  if not found then
    return null;
  end if;

  -- Exactly one reward per team, guarded by UNIQUE(team_id). A
  -- re-verify (verified → rejected → verified) conflicts and inserts
  -- NOTHING, so the member's points are never incremented twice.
  insert into public.referral_rewards
    (referral_member_id, team_id, points_awarded)
  values
    (v_member_id, new.id, 1)
  on conflict (team_id) do nothing
  returning id into v_reward_id;

  -- Only bump points when a reward row was actually CREATED.
  if v_reward_id is not null then
    update public.referral_members
       set points = points + 1,
           updated_at = now()
     where id = v_member_id;
  end if;

  return null;
end;
$$;

-- Trigger-only function: remove any public EXECUTE so it can never be
-- invoked through the Data API.
revoke all on function public.award_referral_reward() from public;

drop trigger if exists trg_teams_award_referral_reward on public.teams;
create trigger trg_teams_award_referral_reward
  after update of payment_status on public.teams
  for each row
  when (new.payment_status = 'verified')
  execute function public.award_referral_reward();

notify pgrst, 'reload schema';