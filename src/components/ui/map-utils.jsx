import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createPortal } from 'react-dom';

// Map utility / lightweight MapLibre GL wrapper for the legacy modules
// Uses inline styles to match the existing codebase (no Tailwind dependency)

const { useEffect, useRef, useState, useMemo } = React;

/* ── Theme detection (matches app's [data-dark] attr) ── */
function useMapTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.getAttribute('data-dark') === 'true' ||
      document.querySelector('.app')?.getAttribute('data-dark') === 'true';
  });

  useEffect(() => {
    const el = document.querySelector('.app');
    if (!el) return;
    const obs = new MutationObserver(() => {
      setDark(el.getAttribute('data-dark') === 'true');
    });
    obs.observe(el, { attributes: true, attributeFilter: ['data-dark'] });
    return () => obs.disconnect();
  }, []);

  return dark;
}

const STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

/* ── Map component ── */
function MapLibreMap({
  center = [54.3773, 24.4539],
  zoom = 10,
  style: customStyle,
  children,
  className,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const dark = useMapTheme();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: customStyle || (dark ? STYLES.dark : STYLES.light),
      center,
      zoom,
      attributionControl: { compact: true },
    });

    map.on('load', () => setLoaded(true));
    mapRef.current = map;
    window.__mapLibreMap = map;

    return () => {
      window.__mapLibreMap = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* Switch style on theme change */
  useEffect(() => {
    if (!mapRef.current || customStyle) return;
    const style = dark ? STYLES.dark : STYLES.light;
    const cur = mapRef.current.getStyle()?.name || '';
    if (style.includes('dark') && cur.includes('dark')) return;
    if (!style.includes('dark') && !cur.includes('dark')) return;
    mapRef.current.setStyle(style);
  }, [dark, customStyle]);

  const ctx = useMemo(() => ({ map: mapRef, loaded }), [loaded]);

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {children && loaded && (
        <MapContextProvider ctx={ctx}>{children}</MapContextProvider>
      )}
    </div>
  );
}

/* ── Context for child components ── */
const MapCtx = React.createContext(null);
function MapContextProvider({ ctx, children }) {
  return React.createElement(MapCtx.Provider, { value: ctx }, children);
}
function useMapCtx() {
  const c = React.useContext(MapCtx);
  if (!c) throw new Error('useMapCtx must be used inside MapLibreMap');
  return c;
}

/* ── Marker ── */
function MapMarker({ longitude, latitude, children, onClick }) {
  const { map } = useMapCtx();
  const markerRef = useRef(null);

  useEffect(() => {
    if (!map.current) return;
    const el = document.createElement('div');
    el.style.cursor = 'pointer';
    if (onClick) el.addEventListener('click', onClick);

    const m = new maplibregl.Marker({ element: el })
      .setLngLat([longitude, latitude])
      .addTo(map.current);

    markerRef.current = m;
    return () => {
      m.remove();
      markerRef.current = null;
      if (onClick) el.removeEventListener('click', onClick);
    };
  }, [longitude, latitude, map]);

  return markerRef.current
    ? createPortal(children, markerRef.current.getElement())
    : null;
}

/* ── Popup ── */
function MapPopup({ longitude, latitude, children, onClose }) {
  const { map, loaded } = useMapCtx();
  const popupRef = useRef(null);
  const containerRef = useRef(document.createElement('div'));

  useEffect(() => {
    if (!map.current || !loaded) return;

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '320px',
    })
      .setLngLat([longitude, latitude])
      .setDOMContent(containerRef.current)
      .addTo(map.current);

    if (onClose) popup.on('close', onClose);
    popupRef.current = popup;

    return () => {
      popup.remove();
      popupRef.current = null;
    };
  }, [longitude, latitude, map, loaded]);

  const content = (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      color: 'var(--dark)',
      fontSize: 13,
    }}>
      {children}
    </div>
  );

  return createPortal(content, containerRef.current);
}

/* ── Navigation controls ── */
function MapControls({
  showZoom = true,
  showLocate = false,
}) {
  const { map, loaded } = useMapCtx();

  const zoomIn = () => map.current?.zoomTo(Math.min(map.current.getZoom() + 1, 22), { duration: 300 });
  const zoomOut = () => map.current?.zoomTo(Math.max(map.current.getZoom() - 1, 0), { duration: 300 });
  const locate = () => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(pos => {
      map.current?.flyTo({
        center: [pos.coords.longitude, pos.coords.latitude],
        zoom: 14,
        duration: 1500,
      });
    });
  };

  if (!loaded) return null;

  const btn = {
    width: 36, height: 36, border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontFamily: 'inherit',
    background: 'var(--white)', color: 'var(--dark)',
  };
  const groupStyle = {
    position: 'absolute', bottom: 20, right: 10, zIndex: 10,
    display: 'flex', flexDirection: 'column',
    borderRadius: 8, overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  };

  return (
    <div style={groupStyle}>
      {showZoom && (
        <>
          <button onClick={zoomIn} style={{ ...btn, borderBottom: '1px solid var(--line)' }} aria-label="Zoom in">＋</button>
          <button onClick={zoomOut} style={btn} aria-label="Zoom out">−</button>
        </>
      )}
      {showLocate && (
        <button onClick={locate} style={{ ...btn, borderTop: showZoom ? '1px solid var(--line)' : 'none' }} aria-label="Find me">◎</button>
      )}
    </div>
  );
}

Object.assign(window, {
  MapLibreMap,
  MapMarker,
  MapPopup,
  MapControls,
});
