/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — App configuration
   All credentials come from environment variables (VITE_* are baked
   into the browser bundle by Vite — therefore only the PUBLIC/publish
   able Supabase key may ever live there). The Cloudinary API secret
   never appears in browser code; it stays inside Supabase Edge Func‐
   tions only. A missing variable raises a loud, readable error rather
   than failing silently somewhere downstream.
   ═══════════════════════════════════════════════════════════════ */

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

export const CLOUDINARY_CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? '';
export const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ?? '';

/* The live scoreboard lives on its OWN standalone website. The nav's
   LEADERBOARD button redirects there. In dev the scoreboard runs on
   http://localhost:5174 (Vite's next free port while the main site
   holds 5173). Set VITE_LEADERBOARD_URL to the real deployed URL. */
export const LEADERBOARD_URL =
  import.meta.env.VITE_LEADERBOARD_URL || 'http://localhost:5174';

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function assertSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      !SUPABASE_URL ? 'VITE_SUPABASE_URL' : null,
      !SUPABASE_PUBLISHABLE_KEY ? 'VITE_SUPABASE_PUBLISHABLE_KEY' : null,
    ]
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `VOIDHACK CONFIG ERROR — Missing Supabase environment variable${missing.includes(',') ? 's' : ''}: ${missing}. ` +
        'Add them to your .env file (see .env.example) and restart the dev server.'
    );
  }
}

export function isCloudinaryConfigured() {
  return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET);
}

export function assertCloudinaryConfigured() {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    const missing = [
      !CLOUDINARY_CLOUD_NAME ? 'VITE_CLOUDINARY_CLOUD_NAME' : null,
      !CLOUDINARY_UPLOAD_PRESET ? 'VITE_CLOUDINARY_UPLOAD_PRESET' : null,
    ]
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `VOIDHACK CONFIG ERROR — Missing Cloudinary environment variable${missing.includes(',') ? 's' : ''}: ${missing}. ` +
        'Add them to your .env file (see .env.example) and restart the dev server.'
    );
  }
}