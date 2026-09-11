import { useState, useEffect } from 'react';
import { useScroll, useTransform } from 'framer-motion';

export function useMousePosition() {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  return position;
}

export function useScrollDirection() {
  const [direction, setDirection] = useState('up');
  const [prevScroll, setPrevScroll] = useState(0);

  useEffect(() => {
    const handler = () => {
      const scroll = window.scrollY;
      setDirection(scroll > prevScroll ? 'down' : 'up');
      setPrevScroll(scroll);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [prevScroll]);

  return direction;
}

export function useCountdown(targetDate) {
  const [time, setTime] = useState(calculateTimeLeft(targetDate));

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(calculateTimeLeft(targetDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return time;
}

function calculateTimeLeft(targetDate) {
  const diff = new Date(targetDate) - new Date();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / 1000 / 60) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export function useInView(ref, options = {}) {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (options.once) observer.unobserve(entry.target);
        } else if (!options.once) {
          setIsInView(false);
        }
      },
      { threshold: options.threshold || 0.1, ...options }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, options.threshold, options.once]);

  return isInView;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export function useParallax(ref, { depth = 24 } = {}) {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const from = reduced ? '0%' : `${depth}%`;
  const to = reduced ? '0%' : `${-depth}%`;
  const y = useTransform(scrollYProgress, [0, 1], [from, to]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], reduced ? [1, 1, 1] : [1.06, 1, 1.06]);
  return { y, scale, scrollYProgress };
}

export function useZoneStage(ref) {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const yBg = useTransform(scrollYProgress, [0, 1], reduced ? ['0%', '0%'] : ['5%', '-12%']);
  const yMid = useTransform(scrollYProgress, [0, 1], reduced ? ['0%', '0%'] : ['2%', '-6%']);
  const yFg = useTransform(scrollYProgress, [0, 1], reduced ? ['0%', '0%'] : ['-10%', '10%']);
  const fade = useTransform(scrollYProgress, [0, 0.14, 0.86, 1], [0.2, 1, 1, 0.2]);
  return { yBg, yMid, yFg, fade };
}
