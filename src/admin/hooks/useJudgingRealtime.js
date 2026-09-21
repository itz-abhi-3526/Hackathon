/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Shared judging realtime subscription
   Uses the existing Supabase Realtime (Postgres Changes). Subscribes to
   the shared judging tables for ONE (judging round × team) so two admins
   working the same evaluation both see every save appear live — no
   polling anywhere. RLS still gates who is allowed to read/broadcast.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { getAdminSupabase } from '../../lib/supabase.js';
import { T } from '../../lib/schema.js';

export function useJudgingRealtime({ judgingRoundId, teamId, enabled = true, onData }) {
  useEffect(() => {
    if (!enabled || !judgingRoundId || !teamId || !onData) return undefined;
    const supabase = getAdminSupabase();
    const filter = `judging_round_id=eq.${judgingRoundId} and team_id=eq.${teamId}`;
    const channel = supabase
      .channel(`judging:${judgingRoundId}:${teamId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: T.JUDGE_EVALUATIONS, filter },
        () => onData('scores')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: T.TEAM_ROUND_REMARKS, filter },
        () => onData('remark')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: T.JUDGING_ROUND_TOTALS, filter },
        () => onData('totals')
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, judgingRoundId, teamId, onData]);
}