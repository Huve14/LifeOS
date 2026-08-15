export const HOME_SECTION_IDS = [
  'overview',
  'priorities',
  'connection',
  'snapshots',
  'games',
  'settling',
  'wellbeing',
  'assistant',
  'tools',
] as const;

export const QUICK_NAV_IDS = [
  'map',
  'community',
  'shopping',
  'docs',
  'budget',
  'call',
  'notes',
  'games',
  'trip',
  'habits',
  'people',
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];
export type QuickNavId = (typeof QUICK_NAV_IDS)[number];
export type PaletteId = 'honey' | 'oasis' | 'sunset' | 'lavender';
export type ColorMode = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';
export type CornerStyle = 'soft' | 'round' | 'square';
export type MotionStyle = 'full' | 'gentle' | 'reduced';
export type TextSize = 'standard' | 'large';

const LEGACY_HOME_SECTION_ORDER: HomeSectionId[] = [
  'priorities', 'connection', 'overview', 'snapshots', 'games',
  'settling', 'wellbeing', 'assistant', 'tools',
];

export type LifeOSPreferences = {
  palette: PaletteId;
  colorMode: ColorMode;
  density: Density;
  cornerStyle: CornerStyle;
  motion: MotionStyle;
  textSize: TextSize;
  highContrast: boolean;
  glassEffects: boolean;
  haptics: boolean;
  homeOrder: HomeSectionId[];
  hiddenHomeSections: HomeSectionId[];
  quickNav: QuickNavId[];
  activePreset: string;
};

export const DEFAULT_PREFERENCES: LifeOSPreferences = {
  palette: 'honey',
  colorMode: 'light',
  density: 'comfortable',
  cornerStyle: 'round',
  motion: 'full',
  textSize: 'standard',
  highContrast: false,
  glassEffects: true,
  haptics: true,
  homeOrder: [...HOME_SECTION_IDS],
  hiddenHomeSections: [],
  quickNav: ['map', 'budget', 'shopping'],
  activePreset: 'everything',
};

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function uniqueAllowed<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(item => typeof item === 'string' && allowed.includes(item as T)))] as T[];
}

export function preparePreferences(value: unknown): LifeOSPreferences {
  const input = value && typeof value === 'object' ? value as Partial<LifeOSPreferences> : {};
  const savedOrder = uniqueAllowed<HomeSectionId>(input.homeOrder, HOME_SECTION_IDS);
  const usesLegacyDefault = savedOrder.length === LEGACY_HOME_SECTION_ORDER.length
    && LEGACY_HOME_SECTION_ORDER.every((sectionId, index) => savedOrder[index] === sectionId);
  const ordered = usesLegacyDefault ? [...HOME_SECTION_IDS] : savedOrder;
  const homeOrder = [...ordered, ...HOME_SECTION_IDS.filter(id => !ordered.includes(id))];
  const hiddenHomeSections = uniqueAllowed<HomeSectionId>(input.hiddenHomeSections, HOME_SECTION_IDS);
  const storedNav = uniqueAllowed<QuickNavId>(input.quickNav, QUICK_NAV_IDS).slice(0, 3);
  const isLegacyDefault = storedNav.length === 3
    && (
      (storedNav[0] === 'map' && storedNav[1] === 'docs' && storedNav[2] === 'budget')
      || (storedNav[0] === 'notes' && storedNav[1] === 'map' && storedNav[2] === 'budget')
      || (storedNav[0] === 'map' && storedNav[1] === 'community' && storedNav[2] === 'shopping')
    );
  const selectedNav = isLegacyDefault ? [...DEFAULT_PREFERENCES.quickNav] : storedNav;
  const quickNav = [
    ...selectedNav,
    ...DEFAULT_PREFERENCES.quickNav.filter(id => !selectedNav.includes(id)),
    ...QUICK_NAV_IDS.filter(id => !selectedNav.includes(id)),
  ].slice(0, 3) as QuickNavId[];

  return {
    palette: oneOf(input.palette, ['honey', 'oasis', 'sunset', 'lavender'], DEFAULT_PREFERENCES.palette),
    colorMode: oneOf(input.colorMode, ['light', 'dark', 'system'], DEFAULT_PREFERENCES.colorMode),
    density: oneOf(input.density, ['comfortable', 'compact'], DEFAULT_PREFERENCES.density),
    cornerStyle: oneOf(input.cornerStyle, ['soft', 'round', 'square'], DEFAULT_PREFERENCES.cornerStyle),
    motion: oneOf(input.motion, ['full', 'gentle', 'reduced'], DEFAULT_PREFERENCES.motion),
    textSize: oneOf(input.textSize, ['standard', 'large'], DEFAULT_PREFERENCES.textSize),
    highContrast: input.highContrast === true,
    glassEffects: input.glassEffects !== false,
    haptics: input.haptics !== false,
    homeOrder,
    hiddenHomeSections,
    quickNav,
    activePreset: typeof input.activePreset === 'string' ? input.activePreset : DEFAULT_PREFERENCES.activePreset,
  };
}

export const LIFE_MODE_PRESETS: Record<string, Partial<LifeOSPreferences>> = {
  calm: {
    palette: 'honey',
    density: 'comfortable',
    motion: 'gentle',
    hiddenHomeSections: ['overview', 'snapshots', 'games', 'settling', 'tools'],
    homeOrder: ['overview', 'priorities', 'wellbeing', 'connection', 'snapshots', 'games', 'settling', 'tools'],
    quickNav: ['notes', 'call', 'habits'],
    activePreset: 'calm',
  },
  explorer: {
    palette: 'oasis',
    density: 'comfortable',
    motion: 'full',
    hiddenHomeSections: [],
    homeOrder: ['settling', 'snapshots', 'overview', 'priorities', 'tools', 'connection', 'wellbeing', 'games'],
    quickNav: ['map', 'trip', 'notes'],
    activePreset: 'explorer',
  },
  connected: {
    palette: 'sunset',
    density: 'comfortable',
    motion: 'gentle',
    hiddenHomeSections: ['overview', 'settling'],
    homeOrder: ['connection', 'games', 'wellbeing', 'overview', 'priorities', 'snapshots', 'tools', 'settling'],
    quickNav: ['call', 'games', 'notes'],
    activePreset: 'connected',
  },
  everything: {
    ...DEFAULT_PREFERENCES,
    homeOrder: [...HOME_SECTION_IDS],
    hiddenHomeSections: [],
    quickNav: ['map', 'budget', 'shopping'],
    activePreset: 'everything',
  },
};

export function applyLifeMode(current: unknown, presetId: string): LifeOSPreferences {
  const preset = LIFE_MODE_PRESETS[presetId] || LIFE_MODE_PRESETS.everything;
  return preparePreferences({ ...preparePreferences(current), ...preset });
}

export function moveHomeSection(
  current: unknown,
  sectionId: HomeSectionId,
  direction: -1 | 1,
): HomeSectionId[] {
  const order = preparePreferences(current).homeOrder;
  const index = order.indexOf(sectionId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return order;
  const next = [...order];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export function setQuickNavSlot(current: unknown, slot: number, itemId: QuickNavId): QuickNavId[] {
  const quickNav = [...preparePreferences(current).quickNav];
  const target = Math.max(0, Math.min(2, slot));
  const duplicate = quickNav.indexOf(itemId);
  if (duplicate >= 0 && duplicate !== target) {
    [quickNav[target], quickNav[duplicate]] = [quickNav[duplicate], quickNav[target]];
  } else {
    quickNav[target] = itemId;
  }
  return quickNav;
}

type ThemeTokens = Record<string, string>;

const LIGHT_THEMES: Record<PaletteId, ThemeTokens> = {
  honey: {},
  oasis: {
    '--honey': '#D8E86E', '--butter': '#F4F8D9', '--sky': '#E7F6F3', '--blue': '#79D2C5',
    '--honey-ink': '#536400', '--blue-ink': '#126B64', '--cream': '#E7F6F3', '--sand': '#F4F8D9',
    '--terracotta': '#536400', '--teal': '#126B64', '--gold': '#D8E86E', '--line': '#BDE3DC',
  },
  sunset: {
    '--honey': '#FFB95F', '--butter': '#FFF0DD', '--sky': '#FFF7F1', '--blue': '#F2AAA3',
    '--honey-ink': '#8C4B00', '--blue-ink': '#8B3D46', '--cream': '#FFF7F1', '--sand': '#FFF0DD',
    '--terracotta': '#A3483E', '--teal': '#8B3D46', '--gold': '#FFB95F', '--line': '#F0D2CA',
  },
  lavender: {
    '--honey': '#C7ADF5', '--butter': '#F2ECFF', '--sky': '#EEF7FB', '--blue': '#94D7ED',
    '--honey-ink': '#5B3C8E', '--blue-ink': '#286A83', '--cream': '#EEF7FB', '--sand': '#F2ECFF',
    '--terracotta': '#664493', '--teal': '#286A83', '--gold': '#C7ADF5', '--line': '#D6D7EC',
  },
};

const DARK_THEMES: Record<PaletteId, ThemeTokens> = {
  honey: {
    '--sand': '#293A35', '--cream': '#10242D', '--white': '#18313D', '--dark': '#FFF9C7',
    '--muted': '#B6CFD7', '--line': '#375762', '--terracotta': '#F6D110', '--teal': '#81CEEB', '--gold': '#F6D110',
  },
  oasis: {
    '--honey': '#D8E86E', '--butter': '#293A35', '--sky': '#102B2C', '--blue': '#79D2C5',
    '--honey-ink': '#E5F590', '--blue-ink': '#91E7DB', '--sand': '#293A35', '--cream': '#102B2C',
    '--white': '#183A3B', '--dark': '#F4F8D9', '--muted': '#B7D4CF', '--line': '#345B58',
    '--terracotta': '#D8E86E', '--teal': '#91E7DB', '--gold': '#D8E86E',
  },
  sunset: {
    '--honey': '#FFB95F', '--butter': '#432D31', '--sky': '#251D29', '--blue': '#F2AAA3',
    '--honey-ink': '#FFD09A', '--blue-ink': '#FFC0B9', '--sand': '#432D31', '--cream': '#251D29',
    '--white': '#392A34', '--dark': '#FFF0DD', '--muted': '#D8BCC0', '--line': '#65434A',
    '--terracotta': '#FFB95F', '--teal': '#F2AAA3', '--gold': '#FFB95F',
  },
  lavender: {
    '--honey': '#C7ADF5', '--butter': '#342D47', '--sky': '#1F2636', '--blue': '#94D7ED',
    '--honey-ink': '#DDCAFF', '--blue-ink': '#B6E9FA', '--sand': '#342D47', '--cream': '#1F2636',
    '--white': '#2B3345', '--dark': '#F2ECFF', '--muted': '#C3C8DB', '--line': '#4C556C',
    '--terracotta': '#C7ADF5', '--teal': '#94D7ED', '--gold': '#C7ADF5',
  },
};

export function getThemeTokens(palette: PaletteId, dark: boolean): ThemeTokens {
  return dark ? DARK_THEMES[palette] : LIGHT_THEMES[palette];
}
