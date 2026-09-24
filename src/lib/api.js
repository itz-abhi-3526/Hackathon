/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Shared errors
   The registration flow talks to Supabase directly through the public
   publishable key (RLS: the only anonymous surface is the register_team
   RPC — problem_statements is private until the hackathon). There are
   no Edge Functions and no service secrets anywhere in the browser.
   ═══════════════════════════════════════════════════════════════ */

export class AppError extends Error {
  constructor(message, code = 'APP_ERROR', payload = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.payload = payload;
  }
}

export function friendlyError(err) {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'SOMETHING WENT WRONG — Please try again.';
}