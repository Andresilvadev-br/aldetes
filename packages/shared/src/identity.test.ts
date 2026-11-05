import { describe, expect, it } from 'vitest';
import { WORLD_TEMPLATES, studioThemeSchema, updateProfileSchema, bannerOptionsSchema } from './schemas';

describe('2.1 Identity Studio (profile)', () => {
  it('accepts the 5 new banners, frames, effects and themes', () => {
    const r = updateProfileSchema.safeParse({
      bannerPreset: 'galaxy-drift',
      avatarDecoration: 'plasma-crown',
      profileEffect: 'celestial-wings',
      profileTheme: 'eclipse',
      bannerOptions: { c1: '#ff0066', c2: null, intensity: 40, speed: 150, reduced: true },
      profileDecor: { nameEffect: 'shimmer', badge: 'crown', cardBorder: 'pulse' },
    });
    expect(r.success).toBe(true);
  });
  it('rejects out-of-range or unknown values', () => {
    expect(bannerOptionsSchema.safeParse({ c1: 'red', c2: null, intensity: 50, speed: 100, reduced: false }).success).toBe(false);
    expect(bannerOptionsSchema.safeParse({ c1: null, c2: null, intensity: 101, speed: 100, reduced: false }).success).toBe(false);
    expect(bannerOptionsSchema.safeParse({ c1: null, c2: null, intensity: 50, speed: 10, reduced: false }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ profileTheme: 'neon-hack' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ profileDecor: { nameEffect: 'blink', badge: null, cardBorder: 'none' } }).success).toBe(false);
  });
  it('keeps old profiles valid (all new fields optional)', () => {
    expect(updateProfileSchema.safeParse({ bannerPreset: 'aurora', avatarDecoration: 'orbital' }).success).toBe(true);
  });
});

describe('2.1 Worlds Studio (server)', () => {
  it('every template is a valid complete theme', () => {
    for (const [id, t] of Object.entries(WORLD_TEMPLATES)) expect(studioThemeSchema.safeParse({ ...t, template: id }).success, id).toBe(true);
  });
  it('old saved themes (without 2.1 fields) still parse, with safe defaults', () => {
    const r = studioThemeSchema.parse({ accent: '#22d3ee', scene: 'orbital' });
    expect(r.iconAnim).toBe('none');
    expect(r.ambient).toBe('none');
    expect(r.speed).toBe(100);
  });
  it('rejects unknown animations, ambients and bad colors', () => {
    expect(studioThemeSchema.safeParse({ iconAnim: 'spin' }).success).toBe(false);
    expect(studioThemeSchema.safeParse({ ambient: 'url(x)' }).success).toBe(false);
    expect(studioThemeSchema.safeParse({ sceneC1: 'blue' }).success).toBe(false);
    expect(studioThemeSchema.safeParse({ speed: 500 }).success).toBe(false);
  });
});
