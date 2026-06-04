import { animate, svg } from 'animejs';
import * as Icons from 'lucide-react';

const { useRef, useEffect } = React;

let _uid = 0;

function AnimatedIcon({ name, size = 22, play, style, ...props }) {
  const uidRef = useRef(`ai-${++_uid}`);
  const ref = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (play == null || play === 0 || !ref.current) return;
    const el = ref.current;
    let cancelled = false;
    try {
      const svgElements = el.querySelectorAll('svg path, svg circle, svg polyline, svg rect');
      if (svgElements.length === 0) return;
      const uid = uidRef.current;
      svgElements.forEach(node => node.classList.add(uid));
      animate(svg.createDrawable(`.${uid}`), {
        draw: ['0 0.05', '0.05 1'],
        ease: 'inOutQuad',
        duration: 800,
      });
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!cancelled) {
          svgElements.forEach(node => node.classList.remove(uid));
        }
      }, 900);
    } catch (e) { console.warn('AnimatedIcon:', e); }
    return () => { cancelled = true; };
  }, [play]);

  const IconComponent = Icons[name];
  if (!IconComponent) return React.createElement('span', { style: { fontSize: size } }, '?');

  return React.createElement(
    'span',
    { ref, style: { display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', ...style } },
    React.createElement(IconComponent, { size, ...props }),
  );
}

Object.assign(window, { AnimatedIcon });
