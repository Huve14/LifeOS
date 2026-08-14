import { useState, useEffect } from 'react';
import IOSDevice from './IOSFrame';
import { samplePacking } from '../data';

type PackingItem = {
  id: string;
  name: string;
  category: string;
  checked: boolean;
};

type PackingListProps = {
  items: PackingItem[];
  onToggle: (id: string) => void;
};

export function PackingList({ items, onToggle }: PackingListProps) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', background: 'white' }}>
      {items.map(it => (
        <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="checkbox" checked={it.checked} onChange={() => onToggle(it.id)} />
            <div style={{ fontSize: 16 }}>{it.name}</div>
          </label>
          <div style={{ color: '#777' }}>{it.category}</div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [items, setItems] = useState<PackingItem[]>(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem('suveda-packing'); } catch { /* safe */ }
    if (raw) {
      try { return JSON.parse(raw) as PackingItem[]; } catch { /* safe */ }
    }
    return samplePacking.map(i => ({ ...i }));
  });

  useEffect(() => {
    try { localStorage.setItem('suveda-packing', JSON.stringify(items)); } catch { /* safe */ }
  }, [items]);

  function toggle(id: string) {
    setItems(prev => prev.map(p => p.id === id ? { ...p, checked: !p.checked } : p));
  }

  const readyCount = items.filter(i => i.checked).length;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
      <IOSDevice title="LifeOS">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>Packing</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{readyCount}/{items.length} ready</div>
        </div>
        <PackingList items={items} onToggle={toggle} />
      </IOSDevice>
    </div>
  );
}
