-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — Public referral leaderboard (additive)
--
--   Adds ONE public read-only function:
--     get_referral_leaderboard()
--
--   • Returns ONLY the public projection: rank, name, points — as a
--     jsonb array ordered by points DESC, then created_at ASC (tertiary
--     full_name ASC so equal-points ties are never randomly ordered).
--   • Ranks are SEQUENTIAL (ROW_NUMBER): 1,2,3,4 — equal points share
--     NO rank number and no rank is ever skipped.
--   • EVERY active member appears, including points = 0.
--   • Inactive members never appear.
--   • points is read from referral_members.points (the authoritative
--     score maintained ONLY by the verification trigger). The function
--     never touches referral_rewards — that table is the one-reward-per-
--     team audit log, not the leaderboard source — and cannot reveal
--     emails, ids, referral codes, team ids or registration data.
--
--   SECURITY
--     • SECURITY DEFINER is REQUIRED: anon has NO grants at all on
--       referral_members (REVOKE ALL from anon at creation), so a
--       SECURITY INVOKER function would have nothing to read. The
--       DEFINER function is a deliberate fixed projection — no dynamic
--       SQL, no parameters, no SELECT *, no optional filters.
--     • search_path pinned to '' and every object schema-qualified.
--     • EXECUTE revoked from PUBLIC, granted to anon + authenticated
--       only (same least-privilege pattern as register_referral_member).
--     • referral_members / referral_rewards RLS + grants are UNCHANGED —
--       still admin-only reads, no public SELECT policy, no anon
--       table grants.
--
--   PERF
--     Existing indexes on referral_members are the UNIQUE(email) /
--     UNIQUE(referral_code) btree indexes (foundation migration). The
--     leaderboard set is expected to stay small and this is a trivial
--     filtered scan; a secondary (active, points DESC, created_at)
--     index would add write cost with no measurable read benefit at
--     this size, so none is added.
--
--   Does NOT touch register_team, the registration wizard, payments,
--   capacity, rounds, admin, or the hackathon leaderboard.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.get_referral_leaderboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'rank',   t.rank,
               'name',   t.name,
               'points', t.points
             )
             order by t.rank
           ),
           '[]'::jsonb
         )
    from (
           select row_number() over (
                    order by rm.points desc, rm.created_at asc, rm.full_name asc
                  )            as rank,
                  rm.full_name as name,
                  rm.points    as points
             from public.referral_members rm
            where rm.active = true
         ) t;
$$;

revoke all on function public.get_referral_leaderboard() from public;
grant execute on function public.get_referral_leaderboard() to anon, authenticated;

comment on function public.get_referral_leaderboard() is
  'HACK2PITCH 2026 public referral leaderboard. SECURITY DEFINER: returns ONLY active referral members as a jsonb array of {rank, name, points} — sequential ranks by points DESC then signup order (created_at ASC); zero-point members are included. Deliberate projection — never exposes emails, ids, referral codes, rewards, team or registration data.';

notify pgrst, 'reload schema';