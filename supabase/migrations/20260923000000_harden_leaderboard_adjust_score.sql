-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Harden leaderboard score adjustment (additive)
--   Replaces leaderboard_adjust_score so no call path can ever:
--     • produce a negative score  (clamp floor at 0, as before)
--     • overflow the INTEGER column (bigint math, clamp ceiling)
--   The admin allowlist gate is unchanged — this only hardens the
--   numeric path end-to-end.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;

create or replace function public.leaderboard_adjust_score(p_id uuid, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current integer;
  v_result bigint;
begin
  if not public.is_admin() then
    raise exception 'ACCESS DENIED.' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'INVALID SCORE ADJUSTMENT.' using errcode = '23514';
  end if;

  update public.leaderboard
     set score = least(
           2147483647,
           greatest(0, score::bigint + p_delta::bigint)
         )
   where id = p_id
  returning score into v_current;

  if not found then
    raise exception 'LEADERBOARD TEAM NOT FOUND.' using errcode = '23503';
  end if;

  return v_current;
end;
$$;

revoke all on function public.leaderboard_adjust_score(uuid, integer) from public;
grant execute on function public.leaderboard_adjust_score(uuid, integer) to authenticated;

comment on function public.leaderboard_adjust_score(uuid, integer) is
  'Admin-only, atomic score adjustment for the leaderboard +/− controls. Clamps the score to [0, 2147483647] and returns the new value.';

notify pgrst, 'reload schema';

commit;