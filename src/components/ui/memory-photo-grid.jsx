import { motion, useScroll, useTransform, useMotionTemplate, useReducedMotion, cubicBezier } from 'framer-motion';

const { useRef, useMemo, useState, useEffect } = React;

const easeIntoFocus = cubicBezier(0.22, 1, 0.36, 1);
const easeOutOfFocus = cubicBezier(0, 0, 0.58, 1);
const focusEase = [easeIntoFocus, easeOutOfFocus];

/* Default placeholder images (Unsplash Abu Dhabi / travel) */
const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1577484905238-d1e22b7b85e0?w=600&h=800&fit=crop',
  'https://images.unsplash.com/photo-1593079831268-3381b0db4a77?w=600&h=800&fit=crop',
  'https://images.unsplash.com/photo-1577421853525-2fc6ca6a1af2?w=600&h=800&fit=crop',
  'https://images.unsplash.com/photo-1580674684081-7617fbf3d745?w=600&h=800&fit=crop',
  'https://images.unsplash.com/photo-1569949381669-ecf31ae8f613?w=600&h=800&fit=crop',
  'https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=600&h=800&fit=crop',
  'https://images.unsplash.com/photo-1574182245530-967d9b3831af?w=600&h=800&fit=crop',
  'https://images.unsplash.com/photo-1580651315530-69c8e0026377?w=600&h=800&fit=crop',
];

function getScrollParent(el) {
  if (!el || el === document.body || el === document.documentElement) return null;
  const { overflow, overflowY } = window.getComputedStyle(el);
  if (/auto|scroll/.test(overflow + overflowY) && el.scrollHeight > el.clientHeight) return el;
  return getScrollParent(el.parentElement);
}

function Tile({ src, side, aspectRatio, maxBlur, maxTilt, perspective, rounded, scrollContainer }) {
  const ref = useRef(null);
  const { scrollYProgress: p } = useScroll({
    target: ref,
    container: scrollContainer,
    offset: ['start end', 'end start'],
  });

  const reduce = useReducedMotion();
  const sign = side === 'L' ? -1 : 1;

  const blur = useTransform(p, [0, 0.5, 1], [maxBlur, 0, maxBlur], { ease: focusEase });
  const bright = useTransform(p, [0, 0.5, 1], [0, 1, 0], { ease: focusEase });
  const contrast = useTransform(p, [0, 0.5, 1], [4, 1, 4], { ease: focusEase });
  const ty = useTransform(p, [0, 0.5, 1], ['100%', '0%', '-100%'], { ease: focusEase });
  const tz = useTransform(p, [0, 0.5, 1], [300, 0, 300], { ease: focusEase });
  const rx = useTransform(p, [0, 0.5, 1], [maxTilt, 0, -maxTilt], { ease: focusEase });
  const tx = useTransform(p, [0, 0.5, 1], [`${sign * 40}%`, '0%', `${sign * 40}%`], { ease: focusEase });
  const rot = useTransform(p, [0, 0.5, 1], [-sign * 5, 0, sign * 5], { ease: focusEase });
  const sk = useTransform(p, [0, 0.5, 1], [sign * 20, 0, -sign * 20], { ease: focusEase });
  const innerSY = useTransform(p, [0, 0.5, 1], [1.8, 1, 1.8], { ease: focusEase });
  const filter = useMotionTemplate`blur(${blur}px) brightness(${bright}) contrast(${contrast})`;

  if (reduce) {
    return (
      <figure ref={ref} style={{ position: 'relative', zIndex: 10, margin: 0 }}>
        <div style={{ width: '100%', overflow: 'hidden', aspectRatio, borderRadius: rounded }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundSize: 'cover', backgroundPosition: 'center',
            backgroundImage: `url("${src}")`,
          }} />
        </div>
      </figure>
    );
  }

  return (
    <motion.figure
      ref={ref}
      style={{ position: 'relative', zIndex: 10, margin: 0, perspective, willChange: 'transform' }}
    >
      <motion.div
        style={{
          position: 'relative', width: '100%', overflow: 'hidden',
          willChange: 'filter, transform',
          aspectRatio, borderRadius: rounded,
          filter, x: tx, y: ty, z: tz, rotate: rot, rotateX: rx, skewX: sk,
        }}
      >
        <motion.div
          style={{
            position: 'absolute', inset: 0,
            backgroundSize: 'cover', backgroundPosition: 'center',
            backgroundImage: `url("${src}")`,
            scaleY: innerSY,
            backfaceVisibility: 'hidden',
            willChange: 'transform',
          }}
        />
      </motion.div>
    </motion.figure>
  );
}

function MemoryPhotoGrid({
  images = FALLBACK_IMAGES,
  aspectRatio = '3/4',
  maxWidth = 512,
  gap = 24,
  perspective = 900,
  maxTilt = 70,
  maxBlur = 8,
  rounded = '6px',
  className,
}) {
  const [cycles, setCycles] = useState(3);
  const sentinelRef = useRef(null);
  const wrapperRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [containerReady, setContainerReady] = useState(false);

  // Find the actual scrollable ancestor (#root has overflow-y: auto, not window)
  useEffect(() => {
    const parent = getScrollParent(wrapperRef.current) ?? document.getElementById('root');
    if (parent) scrollContainerRef.current = parent;
    setContainerReady(true);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) setCycles(c => c + 2); },
      { rootMargin: '1500px 0px 1500px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const items = useMemo(
    () => images.length > 0
      ? Array.from({ length: cycles }, () => images).flat()
      : FALLBACK_IMAGES,
    [cycles, images],
  );

  const config = useMemo(
    () => ({ aspectRatio, perspective, maxTilt, maxBlur, rounded }),
    [aspectRatio, perspective, maxTilt, maxBlur, rounded],
  );

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', ...(className ? {} : {}) }}>
      {containerReady && (
        <div style={{
          margin: '0 auto', width: '100%',
          maxWidth: maxWidth,
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: gap,
          padding: '0 24px',
          paddingTop: '20vh', paddingBottom: '20vh',
          marginTop: '20vh', marginBottom: '10vh',
        }}>
          {items.map((src, i) => (
            <Tile
              key={`${i}-${src}`}
              src={typeof src === 'string' ? src : (src.url || src.src || '')}
              side={i % 2 === 0 ? 'L' : 'R'}
              scrollContainer={scrollContainerRef}
              {...config}
            />
          ))}
        </div>
      )}
      <div ref={sentinelRef} style={{ height: 1, width: '100%' }} aria-hidden />
    </div>
  );
}

Object.assign(window, { MemoryPhotoGrid });
