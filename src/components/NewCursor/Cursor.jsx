import { useEffect, useRef } from 'react';
import './Cursor.css';

export default function Cursor() {
  const cursorRef = useRef(null);
  const labelRef = useRef(null);
  const pos = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const visible = useRef(false);
  const rafId = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    if (!mq.matches) return;

    document.documentElement.classList.add('has-cursor');

    function loop() {
      pos.current.x += (target.current.x - pos.current.x) * 0.12;
      pos.current.y += (target.current.y - pos.current.y) * 0.12;

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
      }

      rafId.current = requestAnimationFrame(loop);
    }

    const onMove = (e) => {
      target.current = { x: e.clientX, y: e.clientY };
      if (!visible.current) {
        visible.current = true;
        cursorRef.current?.classList.add('vh-cursor--visible');
      }
    };

    const onEnter = () => {
      cursorRef.current?.classList.add('vh-cursor--visible');
      visible.current = true;
    };

    const onLeave = () => {
      cursorRef.current?.classList.remove('vh-cursor--visible');
      visible.current = false;
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseenter', onEnter);
    document.addEventListener('mouseleave', onLeave);

    const addHoverListeners = () => {
      document.querySelectorAll('a, button, [role="button"], .vh-interactive').forEach((el) => {
        el.addEventListener('mouseenter', () => {
          cursorRef.current?.classList.add('vh-cursor--active');
          const label = el.getAttribute('data-cursor');
          if (label && labelRef.current) {
            labelRef.current.textContent = label;
            labelRef.current.classList.add('vh-cursor-label--visible');
          }
        });
        el.addEventListener('mouseleave', () => {
          cursorRef.current?.classList.remove('vh-cursor--active');
          labelRef.current?.classList.remove('vh-cursor-label--visible');
        });
      });
    };

    addHoverListeners();
    const observer = new MutationObserver(addHoverListeners);
    observer.observe(document.body, { childList: true, subtree: true });

    rafId.current = requestAnimationFrame(loop);

    return () => {
      document.documentElement.classList.remove('has-cursor');
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseenter', onEnter);
      document.removeEventListener('mouseleave', onLeave);
      observer.disconnect();
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <>
      <div className="vh-cursor" ref={cursorRef}>
        <div className="vh-cursor-dot" />
        <div className="vh-cursor-ring" />
      </div>
      <div className="vh-cursor-label" ref={labelRef} />
    </>
  );
}
