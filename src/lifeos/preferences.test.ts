import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  HOME_SECTION_IDS,
  applyLifeMode,
  moveHomeSection,
  preparePreferences,
  setQuickNavSlot,
} from './preferences';

describe('Life OS preferences', () => {
  it('repairs invalid or partial saved preferences', () => {
    const result = preparePreferences({
      palette: 'not-a-palette',
      homeOrder: ['games', 'games', 'missing'],
      quickNav: ['call', 'call', 'missing'],
      glassEffects: false,
    });

    expect(result.palette).toBe(DEFAULT_PREFERENCES.palette);
    expect(result.homeOrder[0]).toBe('games');
    expect(result.homeOrder).toHaveLength(HOME_SECTION_IDS.length);
    expect(new Set(result.homeOrder).size).toBe(HOME_SECTION_IDS.length);
    expect(result.quickNav).toHaveLength(3);
    expect(new Set(result.quickNav).size).toBe(3);
    expect(result.glassEffects).toBe(false);
  });

  it('moves home sections without losing any sections', () => {
    const moved = moveHomeSection(DEFAULT_PREFERENCES, 'connection', -1);
    expect(moved.slice(0, 3)).toEqual(['overview', 'connection', 'priorities']);
    expect(new Set(moved).size).toBe(HOME_SECTION_IDS.length);
  });

  it('moves the richer overview above priorities for accounts using the old default order', () => {
    const migrated = preparePreferences({
      homeOrder: ['priorities', 'connection', 'overview', 'snapshots', 'games', 'settling', 'wellbeing', 'assistant', 'tools'],
    });
    expect(migrated.homeOrder.slice(0, 3)).toEqual(['overview', 'priorities', 'connection']);
  });

  it('swaps duplicate dock choices instead of removing a slot', () => {
    const next = setQuickNavSlot(DEFAULT_PREFERENCES, 0, 'shopping');
    expect(next).toEqual(['shopping', 'community', 'map']);
  });

  it('moves accounts on the old default dock to Map, Community, Shop & Save', () => {
    const migrated = preparePreferences({ quickNav: ['map', 'docs', 'budget'] });
    expect(migrated.quickNav).toEqual(['map', 'community', 'shopping']);
  });

  it('applies a life mode while keeping a complete preference object', () => {
    const calm = applyLifeMode(DEFAULT_PREFERENCES, 'calm');
    expect(calm.activePreset).toBe('calm');
    expect(calm.quickNav).toEqual(['notes', 'call', 'habits']);
    expect(calm.hiddenHomeSections).toContain('games');
  });
});
