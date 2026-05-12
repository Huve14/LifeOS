export function IOSStatusBar({ dark = false, time = '9:41' }: any) {
  const c = dark ? '#fff' : '#000';
  return (
    <div style={{ display: 'flex', gap: 154, alignItems: 'center', justifyContent: 'center', padding: '21px 24px 19px', boxSizing: 'border-box', position: 'relative', zIndex: 20, width: '100%' }}>
      <div style={{ flex: 1, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 1.5 }}>
        <span style={{ fontFamily: '-apple-system, "SF Pro", system-ui', fontWeight: 700, fontSize: 17, lineHeight: '22px', color: c }}>{time}</span>
      </div>
      <div style={{ flex: 1, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: 1, paddingRight: 1 }}>
        <svg width="19" height="12" viewBox="0 0 19 12">
          <rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill={c}/>
          <rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill={c}/>
          <rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill={c}/>
          <rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill={c}/>
        </svg>
      </div>
    </div>
  );
}

export function IOSDevice({ children, title }: any) {
  return (
    <div style={{ width: 390, maxWidth: '100%', borderRadius: 28, overflow: 'hidden', position: 'relative', background: '#F2F2F7', boxShadow: '0 40px 80px rgba(0,0,0,0.12)', fontFamily: '-apple-system, system-ui, sans-serif' }}>
      <div style={{ position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)', width: 126, height: 37, borderRadius: 24, background: '#000', zIndex: 50 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <IOSStatusBar />
      </div>
      <div style={{ paddingTop: 62 }}>{title && <div style={{ padding: '0 16px', fontSize: 28, fontWeight: 700 }}>{title}</div>}</div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

export default IOSDevice;
