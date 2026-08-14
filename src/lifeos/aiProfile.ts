export type AIResponseStyle = 'warm_practical' | 'direct' | 'concise' | 'detailed';
export type DailyRhythm = 'early_bird' | 'flexible' | 'night_owl';

export type AIProfile = {
  home_base: string;
  priorities: string;
  interests: string;
  response_style: AIResponseStyle;
  daily_rhythm: DailyRhythm;
  notes: string;
};

const RESPONSE_STYLES = new Set<AIResponseStyle>(['warm_practical', 'direct', 'concise', 'detailed']);
const DAILY_RHYTHMS = new Set<DailyRhythm>(['early_bird', 'flexible', 'night_owl']);

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return Array.from(value, character => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? ' ' : character;
  }).join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function prepareAIProfile(value: unknown): AIProfile {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const responseStyle = cleanText(source.response_style, 32) as AIResponseStyle;
  const dailyRhythm = cleanText(source.daily_rhythm, 32) as DailyRhythm;

  return {
    home_base: cleanText(source.home_base, 120),
    priorities: cleanText(source.priorities, 500),
    interests: cleanText(source.interests, 500),
    response_style: RESPONSE_STYLES.has(responseStyle) ? responseStyle : 'warm_practical',
    daily_rhythm: DAILY_RHYTHMS.has(dailyRhythm) ? dailyRhythm : 'flexible',
    notes: cleanText(source.notes, 700),
  };
}

const RESPONSE_STYLE_LABELS: Record<AIResponseStyle, string> = {
  warm_practical: 'Warm and practical',
  direct: 'Direct and action-focused',
  concise: 'Brief and concise',
  detailed: 'Detailed with explanations',
};

const DAILY_RHYTHM_LABELS: Record<DailyRhythm, string> = {
  early_bird: 'Usually most active in the morning',
  flexible: 'Has a flexible daily rhythm',
  night_owl: 'Usually most active later in the day',
};

export function buildPersonalContext(value: unknown): string {
  const profile = prepareAIProfile(value);
  const details = [
    profile.home_base ? `Home base: ${profile.home_base}` : '',
    profile.priorities ? `Current priorities: ${profile.priorities}` : '',
    profile.interests ? `Interests: ${profile.interests}` : '',
    `Preferred response style: ${RESPONSE_STYLE_LABELS[profile.response_style]}`,
    `Daily rhythm: ${DAILY_RHYTHM_LABELS[profile.daily_rhythm]}`,
    profile.notes ? `Other useful context: ${profile.notes}` : '',
  ].filter(Boolean);

  return details.join('; ');
}
