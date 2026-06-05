import { motion, useScroll, useTransform, useMotionTemplate, useReducedMotion } from 'framer-motion';

const { useRef, useMemo, useState, useEffect } = React;

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

  // Fade via opacity — never go black, smooth enter/exit
  const opacity = useTransform(p, [0, 0.18, 0.82, 1], [0, 1, 1, 0]);

  // Gentle vertical slide — reduced from 100% to 40%
  const y = useTransform(p, [0, 0.5, 1], ['40%', '0%', '-40%']);

  // Subtle perspective tilt — reduced from 70° to 22°
  const rotateX = useTransform(p, [0, 0.5, 1], [maxTilt, 0, -maxTilt]);

  // Small horizontal drift — reduced from 40% to 10%
  const x = useTransform(p, [0, 0.5, 1], [`${sign * 10}%`, '0%', `${sign * -10}%`]);

  // Slight scale pulse — photo grows as it centres
  const scale = useTransform(p, [0, 0.5, 1], [0.88, 1, 0.88]);

  // Gentle tilt in plane — reduced from 5° to 3°
  const rotate = useTransform(p, [0, 0.5, 1], [-sign * 3, 0, sign * 3]);

  // Blur only at extreme edges (not throughout the scroll)
  const blur = useTransform(p, [0, 0.15, 0.85, 1], [maxBlur, 0, 0, maxBlur]);
  const filter = useMotionTemplate`blur(${blur}px)`;

  // Inner parallax — background shifts subtly as card scrolls, no scale distortion
  const innerY = useTransform(p, [0, 1], ['-10%', '10%']);

  if (reduce) {
    return (
      <figure ref={ref} style={{ margin: 0, borderRadius: rounded, overflow: 'hidden' }}>
        <div style={{
          width: '100%', aspectRatio, overflow: 'hidden', borderRadius: rounded,
          backgroundSize: 'cover', backgroundPosition: 'center',
          backgroundImage: `url("${src}")`,
        }} />
      </figure>
    );
  }

  return (
    <motion.figure
      ref={ref}
      style={{ margin: 0, perspective, willChange: 'auto' }}
    >
      <motion.div
        style={{
          position: 'relative', width: '100%', overflow: 'hidden',
          aspectRatio, borderRadius: rounded,
          opacity, y, x, scale, rotate, rotateX, filter,
          willChange: 'transform, opacity',
          transformOrigin: 'center center',
        }}
      >
        {/* Inner div sized larger to allow parallax without white edges */}
        <motion.div
          style={{
            position: 'absolute',
            top: '-12%', left: 0, right: 0, bottom: '-12%',
            backgroundSize: 'cover', backgroundPosition: 'center',
            backgroundImage: `url("${src}")`,
            y: innerY,
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
  maxTilt = 22,
  maxBlur = 5,
  rounded = '12px',
  className,
}) {
  const [cycles, setCycles] = useState(2);
  const sentinelRef = useRef(null);
  const wrapperRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [containerReady, setContainerReady] = useState(false);
  const imageCount = images.length || FALLBACK_IMAGES.length;

  useEffect(() => {
    const parent = getScrollParent(wrapperRef.current) ?? document.getElementById('root');
    if (parent) scrollContainerRef.current = parent;
    setContainerReady(true);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setCycles(c => Math.min(c + 1, 5)); // add 1 at a time, cap at 5
        }
      },
      { rootMargin: '500px 0px 500px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Stable keys: key is `cycleIndex-imageIndex` so adding cycles never remounts existing tiles
  const items = useMemo(
    () => images.length > 0
      ? Array.from({ length: cycles }, (_, c) => images.map((src, i) => ({ src, key: `${c}-${i}` }))).flat()
      : FALLBACK_IMAGES.map((src, i) => ({ src, key: `0-${i}` })),
    [cycles, images],
  );

  const config = useMemo(
    () => ({ aspectRatio, perspective, maxTilt, maxBlur, rounded }),
    [aspectRatio, perspective, maxTilt, maxBlur, rounded],
  );

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      {containerReady && (
        <div style={{
          margin: '0 auto', width: '100%',
          maxWidth,
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap,
          padding: '0 24px',
          paddingTop: '12vh', paddingBottom: '12vh',
          marginTop: '8vh', marginBottom: '8vh',
        }}>
          {items.map(({ src, key }, i) => (
            <Tile
              key={key}
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
