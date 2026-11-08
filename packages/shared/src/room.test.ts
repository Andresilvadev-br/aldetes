import { describe, expect, it } from 'vitest';
import { ROOM_PRESETS, validateLayout, autoArrange, snapPosition, type RoomObject } from './roomBuilder';
import { AL_COLLECTIONS, AL_IDS } from './animeLegends';
import { spaceSceneSchema, updateProfileSchema, studioThemeSchema } from './schemas';

describe('Smart Room Builder rules', () => {
  it('all 8 starter rooms are valid layouts', () => {
    expect(Object.keys(ROOM_PRESETS)).toHaveLength(8);
    for (const [id, p] of Object.entries(ROOM_PRESETS)) expect(validateLayout(p.objects, 'center'), id).toEqual([]);
  });
  it('solid furniture cannot share space (chair inside a sofa)', () => {
    const l: RoomObject[] = [{ i: 'a', k: 'sofa', x: 30, y: 10 }, { i: 'b', k: 'gamer-chair', x: 32, y: 10 }];
    expect(validateLayout(l)).toEqual(expect.arrayContaining([expect.objectContaining({ i: 'a', why: 'collision', with: 'b' })]));
  });
  it('exceptions: rug under sofa, monitor on desk, picture on the wall', () => {
    const l: RoomObject[] = [
      { i: 'r', k: 'rug-rect', x: 30, y: 12 },
      { i: 's', k: 'sofa', x: 30, y: 10 },
      { i: 'd', k: 'desk', x: 80, y: 8 },
      { i: 'm', k: 'monitor', x: 8, y: 2, p: 'd' },
      { i: 'w', k: 'frame', x: 30, y: 25 },
    ];
    expect(validateLayout(l)).toEqual([]);
  });
  it('things that need a surface, two monitors in the same spot, outside the room, over the avatar', () => {
    expect(validateLayout([{ i: 'm', k: 'monitor', x: 50, y: 10 }])[0]?.why).toBe('surface');
    const desk: RoomObject = { i: 'd', k: 'desk', x: 20, y: 8 };
    expect(validateLayout([desk, { i: 'm', k: 'monitor', x: 8, y: 2, p: 'd' }, { i: 'n', k: 'monitor', x: 10, y: 2, p: 'd' }]).length).toBeGreaterThan(0);
    expect(validateLayout([{ i: 'a', k: 'bed', x: 95, y: 10 }])[0]?.why).toBe('bounds');
    expect(validateLayout([{ i: 'a', k: 'armchair', x: 50, y: 50 }], 'center')[0]?.why).toBe('avatar');
    expect(validateLayout([{ i: 'a', k: 'armchair', x: 50, y: 50 }], 'left')).toEqual([]);
  });
  it('auto-arrange fixes conflicts deterministically and keeps the avatar area free', () => {
    const messy: RoomObject[] = [
      { i: 'a', k: 'sofa', x: 50, y: 50 },
      { i: 'b', k: 'armchair', x: 52, y: 50 },
      { i: 'c', k: 'bed', x: 50, y: 48 },
      { i: 'd', k: 'monitor', x: 5, y: 2, p: 'zz' },
    ];
    const r1 = autoArrange(messy.map((o) => ({ ...o })));
    const r2 = autoArrange(messy.map((o) => ({ ...o })));
    expect(r1).toEqual(r2);
    expect(validateLayout(r1.objects)).toEqual([]);
    expect(r1.removed).toContain('d');
    expect(r1.moved.length).toBeGreaterThan(0);
  });
  it('snap finds the nearest valid spot', () => {
    const l: RoomObject[] = [{ i: 'a', k: 'sofa', x: 30, y: 10 }];
    const s = snapPosition(l, { i: 'b', k: 'armchair', x: 35, y: 10 }, { grid: true, smart: true, avatarPos: 'center' });
    expect(validateLayout([...l, s])).toEqual([]);
  });
  it('the server schema refuses a layout with collisions', () => {
    expect(spaceSceneSchema.safeParse({ objects: [{ i: 'a', k: 'sofa', x: 30, y: 10 }, { i: 'b', k: 'pouf', x: 30, y: 10 }] }).success).toBe(false);
    expect(spaceSceneSchema.safeParse({ preset: 'japanese', objects: ROOM_PRESETS.japanese!.objects }).success).toBe(true);
    expect(spaceSceneSchema.safeParse({ objects: [{ i: 'a', k: 'rocket', x: 3, y: 3 }] }).success).toBe(false);
    // old corners (no objects) still parse
    expect(spaceSceneSchema.safeParse({ preset: 'gamer', items: ['desk', 'chair'] }).success).toBe(true);
  });
});

describe('Anime Legends catalog', () => {
  it('27 collections, 162 named elements, all unique ids', () => {
    expect(AL_COLLECTIONS).toHaveLength(27);
    const names = AL_COLLECTIONS.flatMap((c) => Object.values(c.names));
    expect(names).toHaveLength(162);
    expect(names.every((n) => n.trim().length > 0)).toBe(true);
    expect(new Set(AL_IDS).size).toBe(27);
    expect(AL_COLLECTIONS.map((c) => c.n)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
  });
  it('profile and server accept legend elements, and refuse unknown ones', () => {
    expect(updateProfileSchema.safeParse({ bannerPreset: 'al:gojo-infinity', avatarDecoration: 'al:sukuna-king', profileEffect: 'al:nezuko-sakura', profileTheme: 'al:todoroki-dual' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ bannerPreset: 'al:not-a-legend' }).success).toBe(false);
    expect(studioThemeSchema.safeParse({ legend: 'deku-ofa', atmosphere: 'japanese-night', entrance: 'glass' }).success).toBe(true);
    expect(studioThemeSchema.safeParse({ legend: 'x' }).success).toBe(false);
  });
});
