/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Enable Supabase Realtime for the leaderboard
   Additive: adds the public leaderboard to the supabase_realtime
   publication so admin writes stream to the public scoreboard.
   RLS still governs what the subscriber may read (anon SELECT).
   ═══════════════════════════════════════════════════════════════ */

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_publication_tables
    WHERE  pubname  = 'supabase_realtime'
      AND  schemaname = 'public'
      AND  tablename  = 'leaderboard'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.leaderboard;
  END IF;
END $$;
