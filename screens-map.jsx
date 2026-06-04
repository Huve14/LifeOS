// screens-map.jsx — Abu Dhabi Map with Huve AI location guide

const { useState, useCallback, useEffect } = React;

/* ── Abu Dhabi location data ── */
const ABU_DHABI_LOCATIONS = [
  // ── Tourist & Culture ──
  {
    id: 'grand-mosque',
    name: 'Sheikh Zayed Grand Mosque',
    category: 'tourist',
    lng: 54.4806,
    lat: 24.4128,
    emoji: '🕌',
    description: 'One of the world\'s largest mosques, with 82 domes, over 1,000 columns, and the world\'s largest hand-knotted carpet.',
    tip: 'Free entry · Modest dress required (abaya provided) · Open 9AM–10PM · Visit at sunset for stunning lighting',
    huvePrompt: 'Tell Suveda about visiting Sheikh Zayed Grand Mosque in Abu Dhabi — what to expect, the best time to go, and interesting facts about the architecture.',
    address: 'Sheikh Rashid Bin Saeed St, Abu Dhabi',
  },
  {
    id: 'louvre',
    name: 'Louvre Abu Dhabi',
    category: 'tourist',
    lng: 54.3997,
    lat: 24.5332,
    emoji: '🏛️',
    description: 'A stunning "museum city" on Saadiyat Island with a breathtaking dome ceiling that creates a "rain of light" effect.',
    tip: 'Adult AED 63 · Mon–Thu 10AM–6:30PM · Fri–Sat 10AM–8:30PM · Closed Mon · Book online for discounts',
    huvePrompt: 'Tell Suveda about the Louvre Abu Dhabi — the architecture of the dome, the collection highlights, and tips for visiting.',
    address: 'Saadiyat Island, Abu Dhabi',
  },
  {
    id: 'qasr-al-watan',
    name: 'Qasr Al Watan',
    category: 'tourist',
    lng: 54.4223,
    lat: 24.4647,
    emoji: '🏛️',
    description: 'The Presidential Palace — a working palace that opens its doors to the public, featuring stunning white granite architecture.',
    tip: 'Adult AED 65 · Daily 10AM–7PM · Light show at 7:30PM · Check the Great Hall and the Spirit of Collaboration room',
    huvePrompt: 'Tell Suveda about Qasr Al Watan — what to see inside the Presidential Palace, the library, and the evening light show.',
    address: 'Al Ras Al Akhdar, Abu Dhabi',
  },
  {
    id: 'yas-island',
    name: 'Yas Island',
    category: 'tourist',
    lng: 54.6034,
    lat: 24.4942,
    emoji: '🎢',
    description: 'Entertainment hub with Ferrari World, Warner Bros World, Yas Waterworld, and the Yas Marina F1 Circuit.',
    tip: 'Ferrari World AED 315 · Warner Bros AED 295 · Yas Waterworld AED 265 · Multi-park passes available',
    huvePrompt: 'Tell Suveda about Yas Island — what parks are there, which is best for a day out, and how to get there from Al Khalifa City.',
    address: 'Yas Island, Abu Dhabi',
  },
  {
    id: 'emirates-palace',
    name: 'Emirates Palace',
    category: 'tourist',
    lng: 54.4180,
    lat: 24.4619,
    emoji: '🏨',
    description: 'Iconic 7-star hotel with gold-leaf interiors, 1 km private beach, and the famous gold-flaked cappuccino.',
    tip: 'Visit for afternoon tea or the gold cappuccino (AED 75) · Dress smart-casual · Valet parking available',
    huvePrompt: 'Tell Suveda about Emirates Palace — can non-guests visit, what\'s the famous gold cappuccino, and is it worth a visit?',
    address: 'West Corniche, Abu Dhabi',
  },
  {
    id: 'corniche',
    name: 'Abu Dhabi Corniche',
    category: 'tourist',
    lng: 54.3649,
    lat: 24.4774,
    emoji: '🌊',
    description: 'An 8-km beachfront promenade with cycle paths, cafes, playgrounds, and several public beach areas.',
    tip: 'Free access · Public beaches open 8AM–8PM · Best for sunrise walks · Bike rentals available · Great skyline views',
    huvePrompt: 'Tell Suveda about the Abu Dhabi Corniche — what to do there, the best time to visit, and why it\'s a great spot for a weekend walk.',
    address: 'Corniche Road, Abu Dhabi',
  },
  {
    id: 'al-ain',
    name: 'Al Ain Oasis',
    category: 'tourist',
    lng: 55.7377,
    lat: 24.2150,
    emoji: '🌴',
    description: 'UNESCO World Heritage site — a 1,200-hectare oasis with ancient falaj irrigation systems and over 147,000 date palms.',
    tip: 'Free entry · 90 min drive from Al Khalifa City · Great day trip · Visit Al Ain Zoo & Jebel Hafeet nearby',
    huvePrompt: 'Tell Suveda about Al Ain Oasis — how to get there, what makes it special, and why it\'s a UNESCO site. Suggest a day trip itinerary from Abu Dhabi.',
    address: 'Al Ain, Abu Dhabi Emirate',
  },
  {
    id: 'mangroves',
    name: 'Eastern Mangroves',
    category: 'tourist',
    lng: 54.3660,
    lat: 24.4338,
    emoji: '🛶',
    description: 'Protected mangrove forest with kayaking trails, boardwalks, and abundant birdlife including flamingos.',
    tip: 'Kayak rental ~AED 100–150 · Best at sunrise · Guided tours available · Free boardwalk access',
    huvePrompt: 'Tell Suveda about the Eastern Mangroves in Abu Dhabi — the kayaking experience, what wildlife she might see, and why it\'s a peaceful escape from the city.',
    address: 'Eastern Mangrove Lagoon, Abu Dhabi',
  },
  {
    id: 'heritage-village',
    name: 'Heritage Village',
    category: 'tourist',
    lng: 54.3616,
    lat: 24.4779,
    emoji: '🏘️',
    description: 'Reconstructed traditional Bedouin village with crafts, a souk, and views of the Abu Dhabi skyline.',
    tip: 'Free entry · Sat–Thu 9AM–4PM · Fri 3PM–9PM · Great for souvenir shopping · Near Marina Mall',
    huvePrompt: 'Tell Suveda about the Heritage Village in Abu Dhabi — what she can see and do there, the traditional crafts, and the photo opportunities.',
    address: 'Corniche Road, Abu Dhabi',
  },
  // ── Essential / Practical ──
  {
    id: 'auhirport',
    name: 'Abu Dhabi International Airport',
    category: 'essential',
    lng: 54.6511,
    lat: 24.4333,
    emoji: '✈️',
    description: 'Major international airport with flights to 100+ destinations. New Terminal A opened in 2024.',
    tip: 'Taxi to Al Khalifa City: ~AED 80–100 · Bus A2 connects to city · Free WiFi · Plenty of lounges',
    huvePrompt: 'Tell Suveda about arriving at Abu Dhabi Airport — what to expect at immigration, how to get to Al Khalifa City, and tips for a smooth arrival.',
    address: 'Abu Dhabi International Airport',
  },
  {
    id: 'al-khalifa-city',
    name: 'Al Khalifa City',
    category: 'essential',
    lng: 54.4113,
    lat: 24.1669,
    emoji: '🏡',
    description: 'Your new home! A quiet residential suburb ~25 min from Abu Dhabi city centre. Known for its villas, family-friendly vibe, and proximity to the airport.',
    tip: 'Nearest mall: Al Raha Mall (10 min) · Nearest mosque: walking distance · 20 min to airport · 30 min to Yas Island',
    huvePrompt: 'Tell Suveda about Al Khalifa City, Abu Dhabi — what the neighbourhood is like, nearby amenities, the community vibe, and what she should know about settling in.',
    address: 'Al Khalifa City, Abu Dhabi',
  },
  {
    id: 'cleveland-clinic',
    name: 'Cleveland Clinic Abu Dhabi',
    category: 'essential',
    lng: 54.4311,
    lat: 24.4408,
    emoji: '🏥',
    description: 'World-class hospital on Al Maryah Island with specialist care and 24/7 emergency services.',
    tip: 'Part of the US Cleveland Clinic network · Located on Al Maryah Island · Emergency: 800 2223 · Urgent care available',
    huvePrompt: 'Tell Suveda about healthcare in Abu Dhabi — how to register for a health card, hospitals near Al Khalifa City, and the quality of medical care.',
    address: 'Al Maryah Island, Abu Dhabi',
  },
  {
    id: 'ad-police',
    name: 'Abu Dhabi Police HQ',
    category: 'essential',
    lng: 54.3541,
    lat: 24.4556,
    emoji: '👮',
    description: 'For emergencies, immigration services, and vehicle-related paperwork.',
    tip: 'Emergency: 999 · Non-emergency: 800 2626 · Traffic fines & vehicle registration online via TAMM app',
    huvePrompt: 'Tell Suveda about safety and emergency services in Abu Dhabi — emergency numbers, the TAMM app, and how to get help if needed.',
    address: 'Al Dhafrah, Abu Dhabi',
  },
  {
    id: 'al-wahda-mall',
    name: 'Al Wahda Mall',
    category: 'essential',
    lng: 54.4448,
    lat: 24.4456,
    emoji: '🛍️',
    description: 'Large shopping mall with Carrefour hypermarket, food court, cinema, and Etisalat/du stores.',
    tip: 'Carrefour for groceries · Etisalat/du for SIM cards · Bus station downstairs · 25 min from Al Khalifa City',
    huvePrompt: 'Tell Suveda about shopping in Abu Dhabi — where are the best malls near Al Khalifa City, what she can buy, and tips for getting a SIM card.',
    address: 'Al Wahda, Abu Dhabi',
  },
  {
    id: 'lulu-hypermarket',
    name: 'Lulu Hypermarket (Al Khalifa)',
    category: 'essential',
    lng: 54.3986,
    lat: 24.1559,
    emoji: '🛒',
    description: 'Your go-to grocery store near Al Khalifa City. Fresh produce, household items, and international foods.',
    tip: 'Open daily 8AM–12AM · Wide selection of Indian/Asian products · Affordable prices · Delivery via Lulu app',
    huvePrompt: 'Tell Suveda about grocery shopping in Abu Dhabi — which stores near Al Khalifa City are best for different needs, delivery options, and approximate prices.',
    address: 'Al Khalifa City, Abu Dhabi',
  },
  // ── Neighbourhood ──
  {
    id: 'al-raha-mall',
    name: 'Al Raha Mall',
    category: 'neighbourhood',
    lng: 54.4421,
    lat: 24.3963,
    emoji: '🏪',
    description: 'Smaller neighbourhood mall with Spinneys supermarket, cafes, pharmacy, and food court. Closest mall to Al Khalifa City.',
    tip: 'Spinneys for premium groceries · This is your closest mall (~10 min) · Has a pharmacy & ATM · Al Fanar restaurant inside',
    huvePrompt: 'Tell Suveda about Al Raha Mall — what stores are there, how to get there from Al Khalifa City, and good spots for coffee.',
    address: 'Al Raha, Abu Dhabi',
  },
  {
    id: 'al-ain-university',
    name: 'UAE University (Al Ain)',
    category: 'neighbourhood',
    lng: 55.5427,
    lat: 24.2156,
    emoji: '🎓',
    description: 'The UAE\'s oldest and most prestigious university. Beautiful campus with libraries, sports facilities, and cultural events.',
    tip: '~45 min drive from Al Khalifa City · Public access to library · Cultural events open to public · Nice campus walks',
    huvePrompt: 'Tell Suveda about UAE University in Al Ain — can the public visit the campus, are there cultural events, and is it worth a visit?',
    address: 'Al Ain, Abu Dhabi',
  },
  {
    id: 'adneig-mosque',
    name: 'Local Mosque (Al Khalifa)',
    category: 'neighbourhood',
    lng: 54.4080,
    lat: 24.1700,
    emoji: '🕌',
    description: 'Neighbourhood mosque within walking distance from most Al Khalifa City studios. Five daily prayers and Friday sermons.',
    tip: 'Walking distance from home · Prayer times posted weekly · Women\'s section available · Friday sermon at ~12:15PM',
    huvePrompt: 'Tell Suveda about mosques in Al Khalifa City — where to find the nearest one, prayer times, and the Muslim community in the area.',
    address: 'Al Khalifa City, Abu Dhabi',
  },
  {
    id: 'al-ain-zoo',
    name: 'Al Ain Zoo',
    category: 'neighbourhood',
    lng: 55.6903,
    lat: 24.1937,
    emoji: '🦒',
    description: 'One of the largest zoos in the Middle East, home to over 4,000 animals in spacious habitats.',
    tip: 'Adult AED 63 · Daily 9AM–8PM · Safari ride (extra) · Great for families · Near Jebel Hafeet',
    huvePrompt: 'Tell Suveda about Al Ain Zoo — what animals she can see, the safari experience, and why it\'s a nice day trip from Al Khalifa City.',
    address: 'Al Ain, Abu Dhabi',
  },
  {
    id: 'marsana-al-ain',
    name: 'Al Jahili Fort',
    category: 'tourist',
    lng: 55.6980,
    lat: 24.2178,
    emoji: '🏰',
    description: 'One of the UAE\'s largest forts, built in the 1890s. Home to a museum about explorer Sir Wilfred Thesiger.',
    tip: 'Free entry · Daily 9AM–5PM · Great photo spot · Learn about Bedouin history and the Empty Quarter',
    huvePrompt: 'Tell Suveda about Al Jahili Fort in Al Ain — the history, what to see inside, and who Sir Wilfred Thesiger was.',
    address: 'Al Ain, Abu Dhabi',
  },
  // ── Al Khalifa City neighbourhood ──
  {
    id: 'choufeit-school',
    name: 'Al Choufeit School',
    category: 'neighbourhood',
    lng: 54.4331,
    lat: 24.1683,
    emoji: '🏫',
    description: 'Your school in Al Khalifa City. A modern campus serving the local community.',
    tip: 'Walking distance from most studios in Al Khalifa City A · Carpool with colleagues · Nearby bus route',
    huvePrompt: 'Tell Suveda about Al Choufeit School in Al Khalifa City, Abu Dhabi — what the campus is like, the community feel, and tips for settling in as a new teacher.',
    address: 'Al Khalifa City, Abu Dhabi',
  },
  {
    id: 'lulu-khalifa',
    name: 'Lulu Hypermarket (Al Khalifa)',
    category: 'neighbourhood',
    lng: 54.4298,
    lat: 24.1638,
    emoji: '🛒',
    description: 'The go-to grocery store for fresh produce, international foods, and household essentials. Walkable from Al Khalifa City A.',
    tip: 'Open 8AM–midnight · Fresh bread section · Halal meat · Great for spice mixes and South Asian staples',
    huvePrompt: 'Tell Suveda about Lulu Hypermarket in Al Khalifa City — what to buy there, the best times to shop, and how it compares to back home.',
    address: 'Al Khalifa City, Abu Dhabi',
  },
  {
    id: 'khalifa-park',
    name: 'Al Khalifa City Park',
    category: 'neighbourhood',
    lng: 54.4361,
    lat: 24.1652,
    emoji: '🌳',
    description: 'A small green neighbourhood park with walking paths, shaded benches, and a children\'s play area.',
    tip: 'Great for morning walks or evening breaks · Family-friendly · Free entry · Open until 10PM',
    huvePrompt: 'Tell Suveda about Al Khalifa City Park — what facilities it has, the best time to go for a walk, and the surrounding neighbourhood vibe.',
    address: 'Al Khalifa City, Abu Dhabi',
  },
  {
    id: 'khalifa-mosque',
    name: 'Sheikh Khalifa Mosque',
    category: 'neighbourhood',
    lng: 54.4305,
    lat: 24.1667,
    emoji: '🕌',
    description: 'The local mosque in Al Khalifa City, within walking distance of the school and residential areas.',
    tip: 'Walking distance from Al Choufeit School · Prayer times vary by season · Respectful dress required',
    huvePrompt: 'Tell Suveda about the local mosque in Al Khalifa City — etiquette, prayer times, and community atmosphere.',
    address: 'Al Khalifa City, Abu Dhabi',
  },
  {
    id: 'al-rahba-mall',
    name: 'Al Rahba Mall',
    category: 'neighbourhood',
    lng: 54.4682,
    lat: 24.2245,
    emoji: '🛍️',
    description: 'A small shopping centre near Al Khalifa City with a Carrefour, pharmacy, food court, and retail shops.',
    tip: '5 min drive from Al Khalifa City · Has a pharmacy, ATM, and coffee shops · Good for quick errands',
    huvePrompt: 'Tell Suveda about Al Rahba Mall — what stores are there, how to get there from Al Khalifa City, and tips for shopping locally.',
    address: 'Abu Dhabi, near Al Khalifa City',
  },
  {
    id: 'khalifa-medical',
    name: 'Khalifa City Medical Centre',
    category: 'neighbourhood',
    lng: 54.4355,
    lat: 24.1635,
    emoji: '🏥',
    description: 'A medical centre in Al Khalifa City offering GP consultations, dental, and basic lab services.',
    tip: 'Near Al Choufeit School · Walk-in or appointment · SABIS health insurance covers visits · Check hours before going',
    huvePrompt: 'Tell Suveda about the Khalifa City Medical Centre — what services are available, how to make an appointment, and what to bring.',
    address: 'Al Khalifa City, Abu Dhabi',
  },
  {
    id: 'mushrif-mall',
    name: 'Mushrif Mall',
    category: 'neighbourhood',
    lng: 54.3837,
    lat: 24.2429,
    emoji: '🛍️',
    description: 'A larger mall with VOX Cinemas, a food court, Carrefour, and international brands. 10 min drive from Al Khalifa City.',
    tip: 'Weekend family destination · Cinema with latest releases · Food court has McDonald\'s, KFC, and local options',
    huvePrompt: 'Tell Suveda about Mushrif Mall in Abu Dhabi — how far it is from Al Khalifa City, what entertainment options it has, and tips for a weekend visit.',
    address: 'Abu Dhabi, 10 min from Al Khalifa City',
  },
];

/* ── Category filters ── */
const CATEGORIES = [
  { id: 'all', label: 'All', emoji: '🗺️' },
  { id: 'tourist', label: 'Tourist', emoji: '📸' },
  { id: 'essential', label: 'Essentials', emoji: '📍' },
  { id: 'neighbourhood', label: 'Neighbourhood', emoji: '🏘️' },
];

const CATEGORY_COLORS = {
  tourist: 'var(--terracotta)',
  essential: 'var(--teal)',
  neighbourhood: 'var(--gold)',
};

/* ── Map Screen ── */
function MapScreen({ state, setState, onBack }) {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [huveReply, setHuveReply] = useState('');
  const [huveLoading, setHuveLoading] = useState(false);

  const filtered = filter === 'all'
    ? ABU_DHABI_LOCATIONS
    : ABU_DHABI_LOCATIONS.filter(l => l.category === filter);

  /* Center map on a location when selected */
  useEffect(() => {
    if (!selected || !window.__mapLibreMap) return;
    const m = window.__mapLibreMap;
    m.flyTo({ center: [selected.lng, selected.lat], zoom: 14, duration: 800 });
  }, [selected]);

  /* Re-center map when filter changes */
  useEffect(() => {
    if (!window.__mapLibreMap) return;
    const m = window.__mapLibreMap;
    if (filter === 'neighbourhood') {
      m.flyTo({ center: [54.43, 24.18], zoom: 11, duration: 500 });
    } else if (filter === 'tourist') {
      m.flyTo({ center: [54.43, 24.45], zoom: 10, duration: 500 });
    } else if (filter === 'essential') {
      m.flyTo({ center: [54.43, 24.35], zoom: 10, duration: 500 });
    } else {
      m.flyTo({ center: [54.3773, 24.4539], zoom: 9.5, duration: 500 });
    }
  }, [filter]);

  /* Ask Huve about a location */
  const askHuveAbout = useCallback(async (loc) => {
    setHuveLoading(true);
    setHuveReply('');
    try {
      const reply = await window.askHuve(loc.huvePrompt, `Suveda is exploring Abu Dhabi. She's interested in ${loc.name} (${loc.description}).`);
      setHuveReply(reply);
    } catch {
      setHuveReply('Huve\'s having a moment — try again in a sec! 🌵');
    } finally {
      setHuveLoading(false);
    }
  }, []);

  /* Marker color by category */
  function markerColor(loc) {
    return CATEGORY_COLORS[loc.category] || 'var(--terracotta)';
  }

  /* Close popup */
  const closePopup = useCallback(() => {
    setSelected(null);
    setHuveReply('');
  }, []);

  const days = daysUntil(state.moveDate);

  return (
    <ModulePage
      title="Abu Dhabi Guide"
      subtitle={`${days} days · ${filtered.length} places`}
      icon="Map"
      onBack={onBack}
      action={
        <Button size="sm" variant="ghost" icon="✨" onClick={() => {
          const best = ABU_DHABI_LOCATIONS.find(l => l.id === 'louvre' || l.id === 'grand-mosque');
          if (best) setSelected(best);
        }}>Suggest</Button>
      }
    >
      {/* Welcome card */}
      {!selected && (
        <div style={{
          padding: '16px 18px', borderRadius: 20, marginBottom: 14,
          background: 'linear-gradient(135deg, var(--gold)25, var(--terracotta)15)',
          border: '1px solid var(--line)',
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>🌵</div>
          <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
            Welcome to Abu Dhabi!
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            Tap any pin to learn about the place. Ask <strong>Huve</strong> for interesting facts and tips about each location.
          </div>
        </div>
      )}

      {/* Category filter pills */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto',
        paddingBottom: 4, WebkitOverflowScrolling: 'touch',
      }}>
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => { setFilter(c.id); setSelected(null); setHuveReply(''); }}
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 999,
              border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              background: filter === c.id ? CATEGORY_COLORS[c.id] || 'var(--terracotta)' : 'var(--white)',
              color: filter === c.id ? '#fff' : 'var(--dark)',
              boxShadow: filter === c.id ? `0 2px 8px ${CATEGORY_COLORS[c.id]}44` : 'var(--shadow)',
            }}
          >{c.emoji} {c.label}</button>
        ))}
      </div>

      {/* Map container */}
      <div style={{
        borderRadius: 20, overflow: 'hidden',
        boxShadow: 'var(--shadow)',
        border: '1px solid var(--line)',
        height: 400, position: 'relative',
        marginBottom: 12,
      }}>
        <MapLibreMap>
          {filtered.map(loc => (
            <MapMarker
              key={loc.id}
              longitude={loc.lng}
              latitude={loc.lat}
              color={markerColor(loc)}
              onClick={() => setSelected(loc)}
            >
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                background: markerColor(loc),
                border: '2px solid #fff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                cursor: 'pointer',
                transition: 'transform 0.15s',
              }}
                onMouseEnter={e => e.target.style.transform = 'scale(1.3)'}
                onMouseLeave={e => e.target.style.transform = 'scale(1)'}
              />
            </MapMarker>
          ))}
          <MapControls showZoom showLocate />
        </MapLibreMap>
      </div>

      {/* Selected location popup card */}
      {selected && (
        <div className="fade-in" style={{
          borderRadius: 20, background: 'var(--white)',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          marginBottom: 12,
        }}>
          {/* Header */}
          <div style={{
            padding: '18px 20px 14px',
            borderBottom: '1px solid var(--line)',
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: `${CATEGORY_COLORS[selected.category]}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, flexShrink: 0,
            }}>{selected.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 16, fontWeight: 700,
                    lineHeight: 1.2,
                  }}>{selected.name}</div>
                  <div style={{
                    fontSize: 11, color: 'var(--muted)', marginTop: 3,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span style={{
                      background: `${CATEGORY_COLORS[selected.category]}22`,
                      color: CATEGORY_COLORS[selected.category],
                      padding: '2px 8px', borderRadius: 999,
                      fontWeight: 600,
                    }}>{CATEGORIES.find(c => c.id === selected.category)?.label || selected.category}</span>
                    <span>·</span>
                    <span>{selected.address}</span>
                  </div>
                </div>
                <button
                  onClick={closePopup}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: 'none', background: 'var(--sand)',
                    fontSize: 14, cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--muted)', fontFamily: 'inherit',
                  }}
                >✕</button>
              </div>
            </div>
          </div>

          {/* Description */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--dark)' }}>
              {selected.description}
            </div>
            <div style={{
              marginTop: 10, padding: '10px 14px',
              background: 'var(--cream)',
              borderRadius: 12, fontSize: 12, color: 'var(--muted)',
              lineHeight: 1.5,
            }}>
              <span style={{ fontWeight: 700 }}>💡 Tips: </span>
              {selected.tip}
            </div>
          </div>

          {/* Ask Huve */}
          <div style={{
            padding: '14px 20px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <button
              onClick={() => askHuveAbout(selected)}
              disabled={huveLoading}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: 12,
                border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                cursor: huveLoading ? 'default' : 'pointer',
                background: huveLoading
                  ? 'var(--sand)'
                  : 'linear-gradient(135deg, var(--terracotta) 0%, var(--gold) 100%)',
                color: huveLoading ? 'var(--muted)' : '#fff',
                boxShadow: huveLoading
                  ? 'none'
                  : '0 4px 12px rgba(196,113,74,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {huveLoading ? (
                <>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid var(--muted)',
                    borderTopColor: 'transparent',
                    animation: 'spin 0.6s linear infinite',
                    display: 'inline-block',
                  }} />
                  Huve is thinking…
                </>
              ) : (
                <>
                  <span>🌵</span>
                  Ask Huve about {selected.name.split(' ')[0]}
                </>
              )}
            </button>
            <a
              href={`https://www.google.com/maps/search/${encodeURIComponent(selected.name + ' Abu Dhabi')}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: 40, height: 40, borderRadius: 12,
                border: '1px solid var(--line)', background: 'var(--white)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none', color: 'var(--dark)', fontSize: 18,
                flexShrink: 0,
              }}
            >🔗</a>
          </div>

          {/* Huve reply */}
          {huveReply && (
            <div className="fade-in" style={{
              padding: '14px 20px 18px',
              borderTop: '1px solid var(--line)',
              background: 'var(--cream)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
              }}>
                <span style={{ fontSize: 20 }}>🌵</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--terracotta)' }}>Huve says</span>
              </div>
              <div style={{
                fontSize: 13, lineHeight: 1.6, color: 'var(--dark)',
                whiteSpace: 'pre-wrap',
              }}>{huveReply}</div>
            </div>
          )}
        </div>
      )}

      {/* Quick list view */}
      {!selected && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          paddingBottom: 20,
        }}>
          {filtered.map(loc => (
            <button
              key={loc.id}
              onClick={() => setSelected(loc)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 14,
                background: 'var(--white)',
                border: '1px solid var(--line)',
                cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', fontSize: 13,
                transition: 'all 0.15s',
                boxShadow: 'var(--shadow)',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = CATEGORY_COLORS[loc.category] || 'var(--terracotta)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: `${CATEGORY_COLORS[loc.category]}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0,
              }}>{loc.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{loc.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                  {loc.category === 'tourist' ? '📸 ' : loc.category === 'essential' ? '📍 ' : '🏘️ '}
                  {loc.address}
                </div>
              </div>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>›</span>
            </button>
          ))}
        </div>
      )}
    </ModulePage>
  );
}

Object.assign(window, { MapScreen });
