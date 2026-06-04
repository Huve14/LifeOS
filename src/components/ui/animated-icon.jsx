import { animate, svg } from 'animejs';
import * as Icons from 'lucide-react';

const { useRef, useEffect } = React;

function AnimatedIcon({ name, size = 22, style, ...props }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const svgElements = ref.current.querySelectorAll('svg path, svg circle, svg polyline, svg rect');
    svgElements.forEach(el => el.classList.add('line'));
    const anim = animate(svg.createDrawable('.line'), {
      draw: ['0 0.05', '0.05 1'],
      ease: 'inOutQuad',
      duration: 1000,
      loop: true,
      alternate: true,
    });
    return () => anim?.kill();
  }, [name, size]);

  const IconComponent = Icons[name];
  if (!IconComponent) return <span style={{ fontSize: size }}>?</span>;

  return (
    <span ref={ref} style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', ...style }}>
      <IconComponent size={size} {...props} />
    </span>
  );
}

function AnimatedNavContainer({ children, style }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const svgElements = ref.current.querySelectorAll('svg path, svg circle, svg polyline, svg rect');
    svgElements.forEach(el => el.classList.add('nav-line'));
    const anim = animate(svg.createDrawable('.nav-line'), {
      draw: ['0 0.05', '0.05 1'],
      ease: 'inOutQuad',
      duration: 1000,
      loop: true,
      alternate: true,
    });
    return () => anim?.kill();
  }, []);

  return <div ref={ref} style={style}>{children}</div>;
}

Object.assign(window, { AnimatedIcon, AnimatedNavContainer });
