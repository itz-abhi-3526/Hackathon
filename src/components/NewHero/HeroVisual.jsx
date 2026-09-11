import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════════
   HERO VISUAL — KINETIC RED TOPOGRAPHIC FIELD
   A generative field of extremely thin red signal lines flowing
   through deep black. Behaviour: they bend, stretch, compress,
   split, and react to pointer + scroll. Purely GPU-driven —
   geometry is built once, all motion happens in the vertex shader.
   ═══════════════════════════════════════════════════════════════ */

const PLANE_W = 8.6;
const PLANE_H = 5.0;

const VERT = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uScroll;
uniform float uAmp;
uniform vec2  uPointer;
uniform float uPointerStr;

attribute vec3  aColor;
attribute float aBase;

varying vec3  vColor;
varying float vAlpha;

/* ── Ashima simplex noise (3D) ── */
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  vec3 p = position;

  /* the field drifts; scrolling accelerates its travel */
  float flow = uTime * (0.14 + uScroll * 0.62) + p.x * 0.045;

  float n1 = snoise(vec3(p.x * 0.34, p.y * 0.42, flow * 0.28));
  float n2 = snoise(vec3(p.x * 1.05, p.y * 1.10, flow * 0.95));
  float n3 = snoise(vec3(p.x * 3.10, p.y * 3.20, flow * 2.60));

  float field = n1 * 0.92 + n2 * 0.46 + n3 * 0.18;

  float amp = uAmp * (1.0 + uScroll * 1.4);

  /* undulate, stretch, and deepen */
  p.y += field * amp;
  p.x += n2 * amp * 0.32;
  p.z += field * uScroll * amp * 0.75;

  /* as you scroll, the whole material drains diagonally down-left */
  p.y += uScroll * uScroll * 0.55 * (p.x + ${PLANE_W}) * 0.32;
  p.y += uScroll * 0.14;
  p.x -= uScroll * 0.55;

  /* pointer — lines peel away from the hand */
  float pd = distance(p.xy, uPointer);
  float pop = smoothstep(2.7, 0.0, pd) * uPointerStr;
  p.y += pop * sign(p.y - uPointer.y) * 0.85;
  p.x += pop * sign(p.x - uPointer.x) * 0.4;
  p.z -= pop * 0.4;

  /* fade at every edge so the field never reads as a box */
  float fade = smoothstep(0.0, 1.2, position.x + ${PLANE_W} * 0.96);
  fade *= smoothstep(0.0, 1.2, ${PLANE_W} * 1.06 - position.x);
  fade *= smoothstep(0.0, 0.85, position.y + ${PLANE_H} * 0.92);
  fade *= smoothstep(0.0, 0.85, ${PLANE_H} * 1.02 - position.y);

  float living = 0.42 + 0.58 * (0.5 + 0.5 * n2);
  float a = aBase * fade * living;
  a = pow(a, 1.28);

  vAlpha = a;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3  vColor;
varying float vAlpha;
void main(){
  gl_FragColor = vec4(vColor * vAlpha, vAlpha);
}
`;

const RED = new THREE.Color(0xE81605);
const RED_LIGHT = new THREE.Color(0xFF2B16);
const WHITE_WARM = new THREE.Color(0xF2F0ED);

export default function HeroVisual({ progressRef, reduced }) {
  const hostRef = useRef(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const testCtx =
      document.createElement('canvas').getContext('webgl2') ||
      document.createElement('canvas').getContext('webgl');
    if (!testCtx) {
      setFallback(true);
      return;
    }

    const mqSmall = window.matchMedia('(max-width: 768px)');
    const mqFine = window.matchMedia('(pointer: fine)');
    const isSmall = mqSmall.matches;
    const pointerOk = mqFine.matches && !isSmall;

    const lines = isSmall ? 36 : 78;
    const segs = isSmall ? 56 : 96;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 1.75));
    renderer.setSize(host.clientWidth || 1, host.clientHeight || 1, false);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.pointerEvents = 'none';

    /* Graceful degradation: if a GPU/driver rejects the shader (this
       shows up as "Vertex shader is not compiled" in the console), tear
       down and swap to the CSS fallback instead of leaving a blank hero. */
    let dispose = () => {};
    renderer.debug.onShaderError = () => {
      dispose();
      setFallback(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      dispose();
      setFallback(true);
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      (host.clientWidth || 1) / (host.clientHeight || 1),
      0.1,
      100
    );
    camera.position.set(0, 0, 7);

    const group = new THREE.Group();
    group.rotation.x = -0.34;
    group.rotation.y = 0.16;
    group.rotation.z = -0.02;
    scene.add(group);

    /* ── geometry: one line set, built once ── */
    const build = () => {
      const vertPairs = lines * (segs - 1);
      const positions = new Float32Array(vertPairs * 2 * 3);
      const colors = new Float32Array(vertPairs * 2 * 3);
      const bases = new Float32Array(vertPairs * 2);

      let v = 0;
      for (let l = 0; l < lines; l++) {
        const yTop = PLANE_H * 0.92;
        const yy = -yTop + (2 * yTop * l) / (lines - 1);
        const yp =
          Math.sin(l * 0.83) * 0.38 + Math.sin(l * 2.37) * 0.22 + ((l % 7) - 3) * 0.09;
        const y = yy + yp;

        /* staggered starts — the field bleeds, never boxes */
        const x0 = -PLANE_W * 0.98 - (l % 5) * 1.12;
        const x1 = PLANE_W * 1.06;

        const isWhite = l % 9 === 3;
        const isBright = l % 23 === 5;
        const tint = Math.sin(l * 0.7) * 0.5 + 0.5;

        const c = isWhite ? WHITE_WARM : RED.clone().lerp(RED_LIGHT, tint);
        const center = Math.max(0, 1 - Math.abs(y) / PLANE_H);
        let a =
          0.1 + 0.3 * center + 0.12 * (1 + Math.sin(l * 0.618)) + (isBright ? 0.08 : 0);
        a = Math.min(0.62, Math.max(0.12, a));

        for (let s = 0; s < segs - 1; s++) {
          const t0 = s / (segs - 1);
          const t1 = (s + 1) / (segs - 1);
          for (let k = 0; k < 2; k++) {
            const t = k === 0 ? t0 : t1;
            positions[v * 3] = x0 + (x1 - x0) * t;
            positions[v * 3 + 1] = y;
            positions[v * 3 + 2] = ((l % 7) - 3) * 0.035;
            colors[v * 3] = c.r;
            colors[v * 3 + 1] = c.g;
            colors[v * 3 + 2] = c.b;
            bases[v] = a;
            v++;
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('aBase', new THREE.BufferAttribute(bases, 1));
      return geo;
    };

    const geometry = build();

    /* ── material: everything moves in the shader ── */
    const uniforms = {
      uTime: { value: reduced ? 1.5 : 0 },
      uScroll: { value: 0 },
      uAmp: { value: 0.42 },
      uPointer: { value: new THREE.Vector2(99, 99) },
      uPointerStr: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    const field = new THREE.LineSegments(geometry, material);
    field.frustumCulled = false;
    group.add(field);

    /* ── response targets ── */
    const ptrTarget = new THREE.Vector2(99, 99);
    const ptrCur = new THREE.Vector2(99, 99);
    let ptrActive = false;
    let scrollCur = 0;

    const mapToPlane = (cx, cy) => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      return new THREE.Vector2(
        (cx / w - 0.5) * 12.5,
        -(cy / h - 0.5) * 7.4
      );
    };

    const onMove = (e) => {
      if (!pointerOk || reduced) return;
      ptrTarget.copy(mapToPlane(e.clientX, e.clientY));
      ptrActive = true;
    };
    const onLeave = () => {
      ptrActive = false;
    };

    /* ── responsive rebuild (kept cheap) ── */
    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }, 120);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerout', onLeave, { passive: true });
    document.addEventListener('visibilitychange', onLeave, { passive: true });

    /* ── loop ── */
    /* `alive` gates the entire loop. dispose() flips it first so a
       frame that is currently executing (or the next scheduled frame)
       can never touch a disposed renderer/program — the onShaderError
       and contextlost callbacks call dispose() from inside tick, so
       without this the loop would re-arm itself and keep drawing with
       deleted objects. */
    let raf = 0;
    let alive = true;
    let last = performance.now();
    const tick = (now) => {
      if (!alive) return;
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      /* pause while the tab is hidden — RAF already stops, dt does not leak */
      if (!document.hidden) {
        const scrollT = Math.min(1, Math.max(0, progressRef.current ?? 0));
        const k = 1 - Math.exp(-dt * 5.5);
        scrollCur += (scrollT - scrollCur) * k;

        ptrCur.lerp(ptrTarget, 1 - Math.exp(-dt * 4.5));
        uniforms.uPointerStr.value = ptrActive ? 1 : 0;

        uniforms.uTime.value += dt * 0.9;
        uniforms.uScroll.value = scrollCur;

        if (alive) renderer.render(scene, camera);
      }
      if (alive) raf = requestAnimationFrame(tick);
    };

    if (reduced) {
      if (alive) renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(tick);
    }

    dispose = () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerout', onLeave);
      document.removeEventListener('visibilitychange', onLeave);
      geometry.dispose();
      material.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };

    return dispose;
  }, [progressRef, reduced]);

  if (fallback) {
    return <div className="hero__visual hero__visual--css" aria-hidden="true" />;
  }

  return <div ref={hostRef} className="hero__visual" aria-hidden="true" />;
}