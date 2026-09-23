/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Attendance Scanner
   Camera QR capture of the event pass (additive attendance system).
   The pass encodes https://<site>/attendance/scan?t=<opaque token>
   (or a raw token); an admin RLS query resolves token → verified
   team + roster. The Check-In modal writes marked_at + marked_by +
   status per participant. A manual token-paste fallback covers
   camera-less check-in desks.

   DOM OWNERSHIP (library-owned island):
   React renders ONLY a stable host — `#attendance-qr-reader` — and
   never renders children inside it. html5-qrcode owns every node
   inside the host (video, canvas, shading, paused UI). Status
   overlays are SIBLINGS of the host, so React reconciliation never
   touches library-owned DOM.

   LIFECYCLE (one-shot):
   A single useEffect owns creating + starting Html5Qrcode. Its dep
   list contains NO attendance/modal/token/status state and NO inline
   callbacks — the only dependency is `attempt`, which is bumped
   EXCLUSIVELY by the explicit "RESTART CAMERA" button. Everything the
   scanner needs that can change (team resolution) is reached through
   a ref (resolveTokenRef), so the scanner stays mounted and running
   while React state changes elsewhere. StrictMode's dev double-mount
   is handled by the `cancelled` guard: the second mount stops/clears
   the first and starts fresh.

   SCAN → STOP → RESOLVE → MODAL → RESUME:
   A successful decode routes through the SAME handleResolveToken the
   manual token input uses (no second resolution implementation). Once
   the token resolves, stopScanner() halts the live instance so the QR
   is never continuously re-scanned while the CheckInModal is open;
   closing the modal calls resumeScanner() on the SAME instance (no
   effect re-run, no StrictMode start/stop churn).

   The html5-qrcode QR-decode-failure callback is intentionally a
   no-op: normal misses fire every frame and must NOT set React state.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  adminResolveAttendanceToken,
  adminSaveAttendance,
} from '../services/adminData.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader } from '../components/Page.jsx';
import CheckInModal from '../components/CheckInModal.jsx';

const READER_ID = 'attendance-qr-reader';

/* Shared scan configuration for first start AND resumed starts. */
const SCANNER_CONFIG = {
  fps: 10,
  qrbox: { width: 260, height: 260 },
};

/* Accept a raw 48-hex attendance token or any scan-URL form carrying
   it. Supported payloads: full URL, protocol-less URL, relative URL,
   bare query (?t=...), or the raw token itself. If a `t` query
   parameter exists, ONLY its value is used. The extracted value must
   be exactly 48 hexadecimal characters, else extraction fails and ''
   (the function's falsy-failure convention) is returned.
   Protocol-less / relative / query-only payloads are normalized with
   a scheme (+ host for path/query-only) PURELY to satisfy the URL
   parser — the input is never modified otherwise. */
function extractToken(decodedText) {
  const value = String(decodedText ?? '').trim();
  if (!value) return '';

  const HEX_TOKEN = /^[0-9a-f]{48}$/i;

  /* Already a raw 48-hex token → use it as-is. */
  if (HEX_TOKEN.test(value)) return value;

  /* Ensure a parseable scheme; host-only base for "/" and "?" forms. */
  const normalized = /^[a-z][a-z0-9+.-]*:/i.test(value)
    ? value
    : /^[/?]/.test(value)
      ? `https://x${value}`
      : `https://${value}`;

  try {
    const url = new URL(normalized);
    const token = (url.searchParams.get('t') ?? url.searchParams.get('token') ?? '').trim();
    return HEX_TOKEN.test(token) ? token : '';
  } catch {
    return '';
  }
}

/* Sentinel thrown by beginCamera so the UI can distinguish failures. */
class CameraStartError extends Error {}

/* Escalating camera start for ONE Html5Qrcode instance:
     1. { facingMode: 'environment' }
     2. Html5Qrcode.getCameras() → pick a back/rear camera, else [0]
     3. { facingMode: 'user' }
   getCameras() itself opens + closes a camera to enumerate devices, so
   it is ONLY reached after the first attempt failed and no stream is
   live. Every failure is logged and the LAST error is rethrown so the
   caller can render a specific message. */
async function beginCamera(inst, config, onScan, onScanFail) {
  console.log('[Scanner] starting camera...');
  let lastError = null;

  try {
    console.log('[Scanner] start attempt 1/3: facingMode=environment');
    await inst.start({ facingMode: 'environment' }, config, onScan, onScanFail);
    console.log('[Scanner] camera started (environment)');
    return;
  } catch (err) {
    lastError = err;
    console.warn('[Scanner] camera start failed (environment):', err);
  }

  try {
    console.log('[Scanner] enumerating cameras...');
    const cameras = await Html5Qrcode.getCameras();
    console.log('[Scanner] cameras:', cameras);
    if (!cameras || cameras.length === 0) {
      throw new CameraStartError('NO_CAMERA_DETECTED');
    }
    const preferred =
      cameras.find((c) => /back|rear/i.test(String(c.label ?? ''))) ??
      cameras[0];
    console.log('[Scanner] start attempt 2/3: deviceId=', preferred.id, preferred.label ?? '');
    await inst.start({ deviceId: { exact: preferred.id } }, config, onScan, onScanFail);
    console.log('[Scanner] camera started (deviceId)');
    return;
  } catch (err) {
    lastError = err;
    if (err instanceof CameraStartError) throw err;
    console.warn('[Scanner] camera start failed (deviceId):', err);
  }

  try {
    console.log('[Scanner] start attempt 3/3: facingMode=user');
    await inst.start({ facingMode: 'user' }, config, onScan, onScanFail);
    console.log('[Scanner] camera started (user)');
    return;
  } catch (err) {
    lastError = err;
  }

  console.error('[Scanner] camera start failed:', lastError);
  throw new CameraStartError(
    lastError?.name ?? String(lastError?.message ?? lastError ?? 'CAMERA_START_FAILED')
  );
}

/* Specific, operator-facing message per camera failure mode. */
function cameraErrorMessage(err) {
  const raw = String(
    err instanceof CameraStartError ? err.message : err?.message ?? err ?? ''
  );
  const lower = raw.toLowerCase();
  if (/notallowed|permissiondenied|permission|denied/i.test(lower)) {
    return 'CAMERA ACCESS WAS BLOCKED — ALLOW CAMERA ACCESS FOR THIS SITE AND RELOAD';
  }
  if (raw === 'NO_CAMERA_DETECTED' || /requesteddevicenotfound|notfounderror|no camera|could not start video source/i.test(lower)) {
    return 'NO CAMERA DETECTED — USE THE MANUAL ATTENDANCE TOKEN';
  }
  if (/notreadable|in use|trackstart/i.test(lower)) {
    return 'CAMERA IS IN USE BY ANOTHER APP — CLOSE IT AND RETRY';
  }
  if (/secure context|localhost|mediaDevices|mediadevices not/i.test(lower)) {
    return 'CAMERA API UNAVAILABLE — THIS PAGE MUST BE OPENED ON HTTPS OR LOCALHOST';
  }
  return 'CAMERA UNAVAILABLE — ALLOW CAMERA ACCESS OR PASTE THE PASS TOKEN BELOW';
}

export default function Scanner() {
  const { push } = useToast();

  /* Ref-stable lifecycle + callbacks. The scanner effect reads only
     refs, so React state churn can never re-run camera init. */
  const scannerRef = useRef(null);
  const readerRef = useRef(null);
  const resolvingRef = useRef(false);
  const modalOpenRef = useRef(false);
  const resolvedTokenRef = useRef('');
  const tokenRef = useRef('');
  const resolveTokenRef = useRef(null);

  /* attempt is bumped ONLY by the explicit RESTART CAMERA button. */
  const [attempt, setAttempt] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(true);
  const [fatalError, setFatalError] = useState('');
  const [team, setTeam] = useState(null);
  const [saving, setSaving] = useState(false);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState('');

  /* Scan handlers are built from refs only, so they are safe to hand to
     the first start AND to a resumed start without ever tying a
     changing callback identity to the scanner effect's deps. */
  const buildHandlers = () => ({
    onScan: (decodedText) => {
      /* DEBUG: capture the exact decoded payload before any parsing. */
      console.log('[Scanner] RAW QR PAYLOAD:', decodedText);
      console.log('[Scanner] RAW QR LENGTH:', decodedText?.length);
      const token = extractToken(decodedText);
      console.log('[Scanner] EXTRACTED TOKEN:', token);
      console.log('[Scanner] EXTRACTED TOKEN LENGTH:', token?.length);
      resolveTokenRef.current?.(decodedText);
    },
    onScanFail: (_message) => {
      /* normal QR decode misses fire every frame — NOT an error.
         Must not set React state. */
    },
  });

  /* Explicit stop after a successful decode/resolve so html5-qrcode
     never re-scans the same QR while the CheckInModal is open. */
  const stopScanner = useCallback(async () => {
    const active = scannerRef.current;
    if (!active || !active.isScanning) return;
    console.log('[Scanner] STOP (after resolve)');
    setScanning(false);
    try {
      await active.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  /* Resume the SAME instance (no new Html5Qrcode, no effect re-run)
     once the operator closes the modal. Falls back through the same
     camera escalation path used at first start. */
  const resumeScanner = useCallback(async () => {
    const active = scannerRef.current;
    if (!active || active.isScanning) return;
    console.log('[Scanner] resume scanning');
    setStarting(true);
    setFatalError('');
    const { onScan, onScanFail } = buildHandlers();
    try {
      await beginCamera(active, SCANNER_CONFIG, onScan, onScanFail);
      console.log('[Scanner] CAMERA RUNNING (resumed)');
      setStarting(false);
      setScanning(true);
    } catch (error) {
      console.error('[Scanner] resume failed:', error);
      setStarting(false);
      setScanning(false);
      setFatalError(cameraErrorMessage(error));
    }
  }, []);

  /* Single shared token-resolution path — the QR success callback and
     the manual RESOLVE button both go through here. Accepts a raw
     token or a scan URL. Opens the exact same CheckInModal. */
  const handleResolveToken = useCallback(
    async (input) => {
      const token = extractToken(input);
      if (!token) {
        setManualError('ENTER AN ATTENDANCE TOKEN.');
        return;
      }
      if (resolvingRef.current) return;
      if (modalOpenRef.current && resolvedTokenRef.current === token) return;

      resolvingRef.current = true;
      setManualError('');
      console.log('[Scanner] resolving token');
      try {
        const resolved = await adminResolveAttendanceToken(token);
        console.log('[Scanner] team resolved:', resolved?.teamName);
        tokenRef.current = token;
        resolvedTokenRef.current = token;
        modalOpenRef.current = true;
        setTeam(resolved);
        void stopScanner();
      } catch (err) {
        console.error('[Scanner] token resolution failed:', err);
        const msg = err?.message ?? '';
        setManualError(
          /INVALID ATTENDANCE QR|MISSING/i.test(msg)
            ? 'ATTENDANCE TOKEN NOT FOUND.'
            : 'COULD NOT RESOLVE THIS ATTENDANCE TOKEN.'
        );
        push(msg || 'INVALID ATTENDANCE QR', 'error');
      } finally {
        resolvingRef.current = false;
      }
    },
    [push, stopScanner]
  );

  /* Keep html5-qrcode calling the CURRENT resolver without letting a
     changing callback identity touch the scanner effect's deps. */
  resolveTokenRef.current = handleResolveToken;

  /* ─────────────────────────── SCANNER ───────────────────────────
     ONE effect creates + starts the scanner. Deps: `attempt` only.
     Never re-runs on modal/team/token/status/attendance changes. */
  useEffect(() => {
    let cancelled = false;
    let scanner = null;

    console.log('[Scanner] MOUNT');
    console.log('[Scanner] container:', readerRef.current);

    async function initScanner() {
      if (!readerRef.current) {
        console.error('[Scanner] container not ready');
        if (!cancelled) {
          setStarting(false);
          setFatalError('SCANNER CONTAINER NOT READY — RELOAD THE PAGE');
        }
        return;
      }

      console.log('[Scanner] INIT');
      scanner = new Html5Qrcode(READER_ID);
      scannerRef.current = scanner;

      const { onScan, onScanFail } = buildHandlers();

      try {
        await beginCamera(scanner, SCANNER_CONFIG, onScan, onScanFail);

        if (cancelled) {
          try {
            await scanner.stop();
          } catch {
            /* already stopped */
          }
          try {
            scanner.clear();
          } catch {
            /* nothing to clear */
          }
          return;
        }

        console.log('[Scanner] CAMERA RUNNING');
        setStarting(false);
        setScanning(true);
      } catch (error) {
        if (!cancelled) {
          console.error('[Scanner] CAMERA ERROR', error);
          setStarting(false);
          setScanning(false);
          setFatalError(cameraErrorMessage(error));
        }
      }
    }

    initScanner();

    return () => {
      cancelled = true;
      const activeScanner = scannerRef.current;
      if (!activeScanner) return;
      console.log('[Scanner] COMPONENT UNMOUNT -> STOP');
      (async () => {
        if (activeScanner.isScanning) {
          console.log('[Scanner] STOP');
          try {
            await activeScanner.stop();
          } catch {
            /* already stopped */
          }
        }
        try {
          activeScanner.clear();
        } catch {
          /* nothing to clear */
        }
        console.log('[Scanner] CLEAR');
        if (scannerRef.current === activeScanner) {
          scannerRef.current = null;
        }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const restartScanner = () => {
    setFatalError('');
    setStarting(true);
    setManualError('');
    setAttempt((a) => a + 1);
  };

  const closeModal = () => {
    modalOpenRef.current = false;
    resolvedTokenRef.current = '';
    setTeam(null);
    void resumeScanner();
  };

  const save = async (roster) => {
    setSaving(true);
    try {
      const { updated } = await adminSaveAttendance(team.id, roster);
      push(`ATTENDANCE UPDATED (${updated} MEMBERS)`, 'success');
      const refreshed = await adminResolveAttendanceToken(tokenRef.current);
      setTeam(refreshed);
    } catch (err) {
      push(err?.message || 'ATTENDANCE COULD NOT BE SAVED', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="ENTRY / CHECK-IN"
        title="ATTENDANCE SCANNER"
        meta="POINT CAMERA AT THE EVENT PASS QR CODE ON THE EMAIL"
        actions={
          !scanning && !starting ? (
            <button type="button" className="cpa-btn cpa-btn--solid cpa-btn--sm" onClick={restartScanner}>
              ▶ RESTART CAMERA
            </button>
          ) : (
            <span className="cpa-live">
              <span className="cpa-live__dot" aria-hidden="true" />
              LIVE SCANNING
            </span>
          )
        }
      />

      <div className="cpa-scanner">
        <div className="cpa-scanner__cam">
          <div ref={readerRef} id={READER_ID} className="cpa-scanner__reader" />
          {(!scanning || starting) && (
            <div className="cpa-scanner__cam-state">
              {starting
                ? 'INITIALIZING CAMERA…'
                : fatalError
                  ? fatalError
                  : 'SCANNER PAUSED'}
            </div>
          )}
        </div>

        <div className="cpa-scanner__side">
          <div className="cpa-scanner__hint">
            <strong>HOW ENTRY WORKS</strong>
            <br />
            OPEN THE VERIFICATION EMAIL → YOUR EVENT PASS (BLACK SECTION)
            <br />
            SCAN THE QR → TEAM RESOLVES IN <strong style={{ color: '#8fe0a6' }}>LIVE</strong>
            <br />
            MARK MEMBERS PRESENT → SAVE ATTENDANCE
          </div>

          <div className="cpa-scanner__hint">
            <strong>MANUAL TOKEN</strong> — NO CAMERA? PASTE THE TOKEN.
          </div>
          <div className="cpa-toolbar">
            <input
              className="cpa-field__input cpa-scanner__manual"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="ATTENDANCE TOKEN"
              spellCheck={false}
            />
            <button
              type="button"
              className="cpa-btn cpa-btn--outline cpa-btn--sm"
              onClick={() => handleResolveToken(manual)}
              disabled={!manual.trim() || resolvingRef.current}
            >
              RESOLVE →
            </button>
          </div>
          {manualError && (
            <div className="cpa-scanner__error-band" style={{ marginTop: 12 }}>
              {manualError}
            </div>
          )}
        </div>
      </div>

      {team && (
        <CheckInModal
          team={team}
          saving={saving}
          onSave={save}
          onClose={closeModal}
        />
      )}
    </>
  );
}