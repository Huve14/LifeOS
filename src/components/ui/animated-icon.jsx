import { animate, svg } from 'animejs';
import * as Icons from 'lucide-react';

const { useRef, useEffect, useState } = React;

let _uid = 0;

function AnimatedIcon({ name, size = 22, style, ...props }) {
  const ref = useRef(null);
  const [uid] = useState(() => `ai-${++_uid}`);
  const animRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    try {
      const svgElements = el.querySelectorAll('svg path, svg circle, svg polyline, svg rect');
      if (svgElements.length === 0) return;

      svgElements.forEach(node => node.classList.add(uid));
      const anim = animate(svg.createDrawable(`.${uid}`), {
        draw: ['0 0.05', '0.05 1'],
        ease: 'inOutQuad',
        duration: 1000,
        loop: true,
        alternate: true,
      });
      animRef.current = anim;
    } catch (e) {
      console.warn('AnimatedIcon:', e);
    }

    return () => {
      try {
        animRef.current?.kill();
        animRef.current = null;
        el.querySelectorAll(`.${uid}`).forEach(node => node.classList.remove(uid));
      } catch (e) { /* cleanup */ }
    };
  }, [name, size, uid]);

  const IconComponent = Icons[name];
  if (!IconComponent) return React.createElement('span', { style: { fontSize: size } }, '?');

  return React.createElement(
    'span',
    { ref, style: { display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', ...style } },
    React.createElement(IconComponent, { size, ...props }),
  );
}

Object.assign(window, { AnimatedIcon });
