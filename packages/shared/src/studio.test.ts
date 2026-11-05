import { describe, expect, it } from 'vitest';
import { DEFAULT_STUDIO, studioLevel, studioThemeSchema, updateProfileSchema } from './schemas';

describe('Server Studio theme', () => {
  it('defaults are the plain (Essencial) look', () => {
    expect(studioThemeSchema.parse({})).toEqual(DEFAULT_STUDIO);
    expect(studioLevel(DEFAULT_STUDIO)).toBe('essencial');
  });
  it('levels follow what is used', () => {
    expect(studioLevel({ ...DEFAULT_STUDIO, accent: '#ff2d78' })).toBe('essencial');
    expect(studioLevel({ ...DEFAULT_STUDIO, scene: 'orbital' })).toBe('alive');
    expect(studioLevel({ ...DEFAULT_STUDIO, scene: 'orbital', entrance: 'sweep' })).toBe('signature');
    expect(studioLevel({ ...DEFAULT_STUDIO, welcome: { enabled: true, title: 'Oi', body: '' } })).toBe('signature');
  });
  it('rejects unknown values and markup', () => {
    expect(studioThemeSchema.safeParse({ scene: '<script>' }).success).toBe(false);
    expect(studioThemeSchema.safeParse({ accent: 'red; background:url(x)' }).success).toBe(false);
    expect(studioThemeSchema.safeParse({ welcome: { enabled: true, title: 'x'.repeat(61), body: '' } }).success).toBe(false);
  });
});

describe('profile links', () => {
  it('only https, max 3', () => {
    expect(updateProfileSchema.safeParse({ profileLinks: [{ label: 'Site', url: 'https://example.com' }] }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ profileLinks: [{ label: 'x', url: 'javascript:alert(1)' }] }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ profileLinks: [{ label: 'x', url: 'http://example.com' }] }).success).toBe(false);
    const four = Array.from({ length: 4 }, (_, i) => ({ label: `l${i}`, url: `https://e${i}.com` }));
    expect(updateProfileSchema.safeParse({ profileLinks: four }).success).toBe(false);
  });
  it('decorations and entrances are a closed list', () => {
    expect(updateProfileSchema.safeParse({ avatarDecoration: 'orbital', profileEntrance: 'glitch' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ avatarDecoration: 'anything' }).success).toBe(false);
  });
});
