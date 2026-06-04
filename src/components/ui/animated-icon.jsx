import { animate, svg } from 'animejs';
import * as Icons from 'lucide-react';

const { useRef, useCallback } = React;

let _uid = 0;

function AnimatedIcon({ name, size = 22, style, ...props }) {
  const uidRef = useRef(`ai-${++_uid}`);
  const animRef = useRef(null);
  const ref = useRef(null);

  const startAnim = useCallback(() => {
    if (animRef.current) return;
    const el = ref.current;
    if (!el) return;
    try {
      const svgElements = el.querySelectorAll('svg path, svg circle, svg polyline, svg rect');
      if (svgElements.length === 0) return;
      const uid = uidRef.current;
      svgElements.forEach(node => node.classList.add(uid));
      animRef.current = animate(svg.createDrawable(`.${uid}`), {
        draw: ['0 0.05', '0.05 1'],
        ease: 'inOutQuad',
        duration: 1000,
        loop: true,
        alternate: true,
      });
    } catch (e) {
      console.warn('AnimatedIcon:', e);
    }
  }, []);

  const stopAnim = useCallback(() => {
    try {
      if (animRef.current) {
        animRef.current.kill();
        animRef.current = null;
      }
      if (ref.current) {
        ref.current.querySelectorAll(`.${uidRef.current}`).forEach(node => node.classList.remove(uidRef.current));
      }
    } catch (e) { /* cleanup */ }
  }, []);

  const IconComponent = Icons[name];
  if (!IconComponent) return React.createElement('span', { style: { fontSize: size } }, '?');

  return React.createElement(
    'span',
    {
      ref,
      onMouseEnter: startAnim,
      onMouseLeave: stopAnim,
      onTouchStart: startAnim,
      onTouchEnd: stopAnim,
      style: {
        display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle',
        cursor: 'pointer', ...style,
      },
    },
    React.createElement(IconComponent, { size, ...props }),
  );
}

Object.assign(window, { AnimatedIcon });
