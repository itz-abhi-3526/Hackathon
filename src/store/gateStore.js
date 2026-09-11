import { create } from 'zustand';

const useGateStore = create((set, get) => ({
  progress: 0,
  velocity: 0,
  pointer: { x: 0, y: 0 },
  granted: false,
  reducedMotion: false,

  setProgress: (progress, velocity) => {
    const reduced = get().reducedMotion;
    set({ progress: reduced ? 0.5 : progress, velocity });
  },

  setPointer: (x, y) => set({ pointer: { x, y } }),
  setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
  grantAccess: () => set({ granted: true }),
  revokeAccess: () => set({ granted: false }),
}));

export function subscribeScroll() {
  let raf = 0;
  let lastY = window.scrollY;
  let lastT = performance.now();
  let velocity = 0;

  const update = () => {
    const now = performance.now();
    const dt = Math.max(now - lastT, 1);
    const dy = window.scrollY - lastY;
    const instant = dy / dt;
    velocity += (instant - velocity) * 0.12;
    velocity = Math.max(-6, Math.min(6, velocity));

    const max = window.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;

    lastY = window.scrollY;
    lastT = now;

    useGateStore.getState().setProgress(progress, velocity);
    raf = 0;
  };

  const request = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  request();

  return () => {
    window.removeEventListener('scroll', request);
    window.removeEventListener('resize', request);
    if (raf) cancelAnimationFrame(raf);
  };
}

export default useGateStore;