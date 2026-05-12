// loading-globe.jsx — Monochrome spinning globe with real-ish country outlines + whirl effect
// 200x200, no text, centered on off-white.

function SpinningGlobe() {
  return (
    <div style={{
      width: 200, height: 200,
      background: '#FAF7F2',
      borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      {/* Whirl rings */}
      <svg width="200" height="200" viewBox="0 0 200 200" style={{
        position: 'absolute', inset: 0,
      }}>
        <defs>
          <linearGradient id="whirl" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#1E1E1E" stopOpacity="0" />
            <stop offset="60%"  stopColor="#1E1E1E" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1E1E1E" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="whirl2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#1E1E1E" stopOpacity="0" />
            <stop offset="70%"  stopColor="#1E1E1E" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#1E1E1E" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* Outer whirl arcs */}
        <g style={{ transformOrigin: '100px 100px', animation: 'globe-whirl 1.6s linear infinite' }}>
          <circle cx="100" cy="100" r="94"
            fill="none" stroke="url(#whirl)" strokeWidth="1.5"
            strokeDasharray="120 470" strokeLinecap="round" />
          <circle cx="100" cy="100" r="94"
            fill="none" stroke="url(#whirl)" strokeWidth="1.5"
            strokeDasharray="60 530" strokeDashoffset="-300" strokeLinecap="round" />
        </g>
        <g style={{ transformOrigin: '100px 100px', animation: 'globe-whirl-rev 2.4s linear infinite' }}>
          <circle cx="100" cy="100" r="88"
            fill="none" stroke="url(#whirl2)" strokeWidth="1"
            strokeDasharray="40 480" strokeLinecap="round" />
          <circle cx="100" cy="100" r="88"
            fill="none" stroke="url(#whirl2)" strokeWidth="1"
            strokeDasharray="20 500" strokeDashoffset="-220" strokeLinecap="round" />
        </g>

        {/* Faint dust trail */}
        <g style={{ transformOrigin: '100px 100px', animation: 'globe-whirl 3.2s linear infinite', opacity: 0.4 }}>
          {[0, 60, 130, 200, 270, 320].map((deg, i) => (
            <circle key={i} cx={100 + Math.cos(deg * Math.PI / 180) * 98}
                            cy={100 + Math.sin(deg * Math.PI / 180) * 98}
                            r={1.5 - (i % 3) * 0.3} fill="#1E1E1E" />
          ))}
        </g>
      </svg>

      {/* Globe sphere */}
      <div style={{
        width: 150, height: 150,
        borderRadius: '50%',
        position: 'relative',
        overflow: 'hidden',
        border: '2px solid #1E1E1E',
        background: '#FAF7F2',
      }}>
        {/* Latitude/longitude grid (static) */}
        <svg width="150" height="150" viewBox="0 0 150 150" style={{ position: 'absolute', inset: 0 }}>
          <g fill="none" stroke="#1E1E1E" strokeOpacity="0.18" strokeWidth="0.7">
            {/* longitude curves */}
            <ellipse cx="75" cy="75" rx="73" ry="73" />
            <ellipse cx="75" cy="75" rx="55" ry="73" />
            <ellipse cx="75" cy="75" rx="30" ry="73" />
            <ellipse cx="75" cy="75" rx="6"  ry="73" />
            {/* latitudes */}
            <line x1="2"  y1="75" x2="148" y2="75" />
            <line x1="14" y1="40" x2="136" y2="40" />
            <line x1="14" y1="110" x2="136" y2="110" />
            <line x1="32" y1="20" x2="118" y2="20" />
            <line x1="32" y1="130" x2="118" y2="130" />
          </g>
        </svg>

        {/* Spinning country band */}
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: '300%', height: '100%',
          animation: 'globe-spin 6s linear infinite',
        }}>
          {/* Two copies side-by-side for seamless loop */}
          {[0, 1].map(i => (
            <svg key={i}
              width="50%" height="100%" viewBox="0 0 360 180"
              preserveAspectRatio="none"
              style={{ display: 'block', float: 'left' }}
            >
              {/* Simplified continent outlines as a stylized world map (equirectangular).
                  Path coords are land masses — Africa, Europe, Asia, Americas, Australia. */}
              <g fill="#1E1E1E" fillOpacity="0.78">
                {/* North America */}
                <path d="M28,40 L48,32 L72,30 L88,38 L96,52 L92,68 L78,82 L66,88 L52,90 L40,82 L34,72 L26,62 Z" />
                <path d="M50,92 L62,94 L70,102 L66,110 L56,108 L48,100 Z" />
                {/* Greenland */}
                <path d="M104,22 L118,24 L120,38 L110,46 L100,40 L98,28 Z" />
                {/* South America */}
                <path d="M82,108 L92,108 L98,118 L96,134 L88,148 L82,158 L74,154 L72,140 L74,124 Z" />
                {/* Europe */}
                <path d="M158,42 L176,40 L188,46 L186,56 L172,62 L160,58 L154,50 Z" />
                {/* UK */}
                <path d="M150,46 L156,44 L156,54 L150,58 L146,52 Z" />
                {/* Africa */}
                <path d="M168,72 L188,68 L200,78 L204,96 L198,116 L188,134 L176,140 L166,132 L160,114 L162,94 Z" />
                <path d="M186,140 L194,136 L194,148 L186,150 Z" />
                {/* Middle East */}
                <path d="M202,72 L218,68 L228,76 L226,86 L214,90 L204,84 Z" />
                {/* India */}
                <path d="M236,82 L246,80 L252,90 L250,104 L242,114 L236,108 L232,94 Z" />
                {/* Asia / Russia */}
                <path d="M196,32 L240,28 L280,30 L308,38 L312,52 L296,60 L268,62 L240,60 L210,56 L196,46 Z" />
                {/* SE Asia */}
                <path d="M276,82 L292,80 L302,90 L296,102 L284,100 L274,92 Z" />
                {/* Indonesia (islands) */}
                <ellipse cx="290" cy="108" rx="10" ry="3" />
                <ellipse cx="306" cy="112" rx="8"  ry="2.5" />
                <ellipse cx="276" cy="110" rx="6"  ry="2" />
                {/* Japan */}
                <path d="M318,58 L324,56 L326,64 L322,70 L318,66 Z" />
                {/* Australia */}
                <path d="M298,128 L322,126 L334,134 L332,148 L318,154 L302,150 L294,140 Z" />
                {/* New Zealand */}
                <path d="M344,150 L350,148 L352,158 L346,160 Z" />
                {/* Antarctica strip */}
                <path d="M0,170 L360,170 L360,178 L0,178 Z" fillOpacity="0.5" />
                {/* Tiny scattered islands */}
                <circle cx="118" cy="106" r="1.5" />
                <circle cx="124" cy="112" r="1.2" />
                <circle cx="334" cy="98"  r="1.3" />
                <circle cx="346" cy="104" r="1" />
                <circle cx="38"  cy="98"  r="1.2" />
              </g>
            </svg>
          ))}
        </div>

        {/* Sphere shading (subtle vignette) */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'radial-gradient(circle at 32% 32%, rgba(255,255,255,0.6) 0%, transparent 38%), radial-gradient(circle at 70% 70%, rgba(30,30,30,0.18) 0%, transparent 55%)',
          pointerEvents: 'none',
        }} />
      </div>

      <style>{`
        @keyframes globe-spin {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes globe-whirl {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes globe-whirl-rev {
          from { transform: rotate(360deg); }
          to   { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

Object.assign(window, { SpinningGlobe });
