-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — Round association fix (capacity/registered count)
--
--   ROOT CAUSE
--     Every round count — admin (ROUND_EMBED '*, teams(count)' →
--     teams.registration_round_id FK) and public (public_active_round()
--     → count(*) WHERE registration_round_id = round.id) — scopes
--     strictly to teams.registration_round_id. The deployed write path
--     (submit_registration -- the legacy 7-param RPC, signature
--     p_college, p_participants, p_payment_image_url, p_payment_status,
--     p_problem_statement_id, p_registration_code, p_team_name) has NO
--     round parameter and inserts teams WITHOUT setting
--     registration_round_id. So a successful registration exists in
--     teams but is invisible to every round-count query.
--
--     The count queries are CORRECT. The association is never created.
--
--   FIX
--     1. A BEFORE INSERT trigger on teams that fills
--        registration_round_id + registration_fee from the CURRENT
--        active round whenever an insert leaves them NULL. This runs
--        inside the original submit_registration INSERT — NO change to
--        that RPC, NO new RPC, NO register_team, NO frontend change,
--        NO payment/wizard/validation change.
--        INSERT-only on purpose: legacy teams (NULL round id) are never
--        yanked into a round if they are later updated by an admin.
--     2. A TARGETED backfill for the one registration already created
--        before this fix (BELOW, needs its registration_code from the
--        issued pass). Never run a blanket UPDATE — it would pull
--        legacy teams into this round's capacity.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Round-stamping trigger (the whole fix) ─────────────────────
create or replace function public.stamp_active_round_on_teams()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.registration_rounds%rowtype;
begin
  if new.registration_round_id is null then
    select * into v_round
      from public.registration_rounds
     where status = 'active'
     order by created_at desc, id desc
     limit 1;

    if found then
      new.registration_round_id := v_round.id;
      if new.registration_fee is null then
        new.registration_fee := v_round.fee;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_teams_stamp_active_round on public.teams;
create trigger trg_teams_stamp_active_round
  before insert on public.teams
  for each row execute function public.stamp_active_round_on_teams();

comment on function public.stamp_active_round_on_teams() is
  'BEFORE INSERT trigger on teams: when an insert does not declare a registration round, associate the team with the currently ACTIVE round and snapshot its fee. Fixes the registered/remaining capacity count for the existing submit_registration write path without changing that RPC.';

-- ── 2. Targeted backfill — the ONE registration created before the
--      fix (OPTIONAL; edit the code below to that team's actual code).
--      This is a precise one-line update by registration_code and CANNOT
--      touch legacy teams. Do NOT turn it into a blanket UPDATE. ────

-- update public.teams
--    set registration_round_id = r.id,
--        registration_fee     = r.fee
--   from public.registration_rounds r
--  where r.status = 'active'
--    and teams.registration_code = '<REPLACE_WITH_THE_TEAM_CODE_FROM_THE_ISSUED_PASS>';

-- ── 3. Verify association (run after the trigger + any backfill) ──
--     SELECT t.registration_code, t.registration_round_id, t.registration_fee,
--            r.title, r.capacity
--       FROM public.teams t
--       LEFT JOIN public.registration_rounds r ON r.id = t.registration_round_id
--      ORDER BY t.created_at DESC;