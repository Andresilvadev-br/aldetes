import { AL_IDS, AL_PROFILE_IDS } from './animeLegends';
import { ROOM_ITEM_KEYS, WALLPAPERS, FLOOR_STYLES, ROOM_PARTICLES, validateLayout, type RoomObject } from './roomBuilder';
import { z } from 'zod';

export const usernameSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[a-z0-9_.]+$/, 'Use apenas letras minúsculas, números, _ e .');

export const passwordSchema = z.string().min(8, 'Mínimo de 8 caracteres').max(128);

export const registerSchema = z.object({
  email: z.string().email().max(254),
  username: usernameSchema,
  displayName: z.string().min(1).max(32).optional(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  login: z.string().min(1).max(254), // email or username
  password: z.string().min(1).max(128),
  deviceName: z.string().max(64).optional(),
  /** "Manter conectado" (default true) */
  remember: z.boolean().optional(),
});

export const presenceStatus = z.enum(['online', 'idle', 'dnd', 'invisible']);
export type PresenceStatus = z.infer<typeof presenceStatus>;

/** Animated banner presets and profile effects (rendered client-side; all original art). */
export const BANNER_PRESETS = [
  'neon-grid', 'sakura', 'aurora', 'galaxy', 'cyber-rain', 'anime-sky', 'neon-city', 'storm', 'pixel-arcade', 'embers', 'ocean', 'void',
  // 1.0 collections (animated)
  'neon-current', 'orbital', 'chroma-wave', 'zen-dust',
  // 1.0 static gradients
  'g-dusk', 'g-mint', 'g-ember', 'g-ice', 'g-mono', 'g-berry',
  // 2.1 Identity Studio (configurable: colors, intensity, speed, reduced)
  'nebula-flow', 'cyber-rain-x', 'aurora-dream', 'liquid-chrome', 'galaxy-drift',
] as const;
export const PROFILE_EFFECTS = ['sparkles', 'snow', 'hearts', 'flames', 'lightning', 'bubbles', 'confetti', 'aura', 'cosmic-arrival', 'holographic-shift', 'electric-pulse', 'ethereal-mist', 'celestial-wings'] as const;
/** Avatar decorations: drawn AROUND the avatar (the uploaded image itself is never altered). */
export const AVATAR_DECORATIONS = ['neon-current', 'orbital', 'chroma-wave', 'zen-dust', 'halo', 'ember-ring', 'frost', 'quantum-orbit', 'plasma-crown', 'crystal-prism', 'neon-circuit', 'solar-eclipse'] as const;
/** One-shot entrance when someone opens your profile card. */
export const PROFILE_ENTRANCES = ['particles', 'lights', 'glitch', 'reveal'] as const;
export type AvatarDecoration = (typeof AVATAR_DECORATIONS)[number];
/** 2.1: whole-card profile themes (colors, background, buttons, transitions) */
export const PROFILE_THEMES = ['obsidian', 'synthwave', 'arctic-glass', 'inferno', 'eclipse'] as const;
export const NAME_EFFECTS = ['none', 'glow', 'gradient', 'shimmer'] as const;
export const BADGES = ['star', 'crown', 'bolt', 'heart', 'gamepad', 'music', 'shield', 'diamond'] as const;
export const CARD_BORDERS = ['none', 'flow', 'pulse'] as const;
/** Banner options (only some banners react to every option; the rest ignore what they don't use). */
export const bannerOptionsSchema = z.object({
  c1: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  c2: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  intensity: z.number().int().min(0).max(100).default(80),
  /** percent of the normal speed */
  speed: z.number().int().min(25).max(200).default(100),
  /** "animação reduzida": gentler, slower, fewer moving parts */
  reduced: z.boolean().default(false),
});
export type BannerOptions = z.infer<typeof bannerOptionsSchema>;
export const profileDecorSchema = z.object({
  nameEffect: z.enum(NAME_EFFECTS).default('none'),
  badge: z.enum(BADGES).nullable().default(null),
  cardBorder: z.enum(CARD_BORDERS).default('none'),
});
export type ProfileDecor = z.infer<typeof profileDecorSchema>;
export type ProfileEntrance = (typeof PROFILE_ENTRANCES)[number];

/** Profile links: https only, short, max 3 (shown on the expanded profile card). */
export const profileLinkSchema = z.object({
  label: z.string().trim().min(1).max(32),
  url: z
    .string()
    .trim()
    .max(200)
    .url()
    .refine((u) => /^https:\/\//i.test(u), 'Use um link https://'),
});
export type BannerPreset = (typeof BANNER_PRESETS)[number];
export type ProfileEffect = (typeof PROFILE_EFFECTS)[number];

export const activitySchema = z
  .object({
    type: z.enum(['playing', 'listening']),
    name: z.string().min(1).max(64),
    details: z.string().max(128).optional(),
    startedAt: z.number().int().positive(),
  })
  .nullable();
export type Activity = NonNullable<z.infer<typeof activitySchema>>;

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(32).optional(),
  bio: z.string().max(190).optional(),
  customStatus: z.string().max(128).nullable().optional(),
  status: presenceStatus.optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  allowDmsFrom: z.enum(['everyone', 'friends', 'server_members']).optional(),
  allowFriendRequests: z.boolean().optional(),
  // Anime Legends elements are stored as `al:<collectionId>` in the same fields (2.2)
  bannerPreset: z.enum([...BANNER_PRESETS, ...AL_PROFILE_IDS] as [string, ...string[]]).nullable().optional(),
  profileEffect: z.enum([...PROFILE_EFFECTS, ...AL_PROFILE_IDS] as [string, ...string[]]).nullable().optional(),
  avatarDecoration: z.enum([...AVATAR_DECORATIONS, ...AL_PROFILE_IDS] as [string, ...string[]]).nullable().optional(),
  profileEntrance: z.enum(PROFILE_ENTRANCES).nullable().optional(),
  pronouns: z.string().trim().max(40).nullable().optional(),
  profileLinks: z.array(profileLinkSchema).max(3).optional(),
  bannerOptions: bannerOptionsSchema.nullable().optional(),
  profileTheme: z.enum([...PROFILE_THEMES, ...AL_PROFILE_IDS] as [string, ...string[]]).nullable().optional(),
  profileDecor: profileDecorSchema.nullable().optional(),
});


/* ---------------- Server Studio ---------------- */
export const SERVER_SCENES = ['aurora', 'galaxy', 'neon-grid', 'ocean', 'embers', 'neon-current', 'orbital', 'chroma-wave', 'zen-dust', 'neon-skyline', 'cosmic-horizon', 'digital-matrix', 'dreamscape', 'energy-core'] as const;
export const SERVER_ICON_ANIMS = ['none', 'orbit-glow', 'crystal-shine', 'pulse-beacon', 'neon-trace', 'hologram'] as const;
export const SERVER_AMBIENTS = ['none', 'ambient-particles', 'aurora-background', 'reactive-glow', 'digital-atmosphere', 'starlight'] as const;
export const SERVER_ATMOSPHERES = ['none', 'cyber-city', 'celestial', 'japanese-night', 'luxury', 'mystic'] as const;
export const SERVER_ENTRANCES_22 = ['cinematic', 'holographic', 'icon-expand', 'particle-reveal', 'glass'] as const;
const snowflake = z.string().regex(/^[0-9]{1,24}$/);
export const showcaseSchema = z.object({
  enabled: z.boolean().default(false),
  /** recommended channels (ids of this server; unknown ids are simply not shown) */
  channels: z.array(snowflake).max(4).default([]),
  highlights: z.array(z.object({ title: z.string().trim().min(1).max(60), body: z.string().trim().max(200).default(''), channelId: snowflake.nullable().default(null) })).max(3).default([]),
  events: z.array(z.object({ title: z.string().trim().min(1).max(80), at: z.string().datetime(), channelId: snowflake.nullable().default(null) })).max(5).default([]),
});
export type Showcase = z.infer<typeof showcaseSchema>;
export const studioThemeSchema = z.object({
  /** Essencial */
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  /** Alive: animated scene behind the header/cover (null = static banner/accent) */
  scene: z.enum(SERVER_SCENES).nullable().default(null),
  lighting: z.enum(['soft', 'vivid', 'dim']).default('soft'),
  texture: z.enum(['none', 'grain', 'grid', 'dots']).default('none'),
  bannerPosition: z.enum(['top', 'center', 'bottom']).default('center'),
  iconPosition: z.enum(['left', 'center']).default('left'),
  /** Alive: hover effect on the server icon in the rail */
  hover: z.enum(['none', 'lift', 'glow', 'tilt']).default('lift'),
  /** Signature */
  iconFrame: z.enum(['none', 'ring', 'neon', 'orbital']).default('none'),
  separator: z.enum(['line', 'glow', 'dots']).default('line'),
  entrance: z.enum(['none', 'sweep', 'bloom', 'glitch', ...SERVER_ENTRANCES_22]).default('none'),
  welcome: z
    .object({ enabled: z.boolean().default(false), title: z.string().trim().max(60).default(''), body: z.string().trim().max(240).default('') })
    .default({ enabled: false, title: '', body: '' }),
  /** 2.0 Worlds: which ready-made template it started from (informative), surfaces and effect intensity */
  template: z.enum(['neon', 'minimal', 'aurora', 'cosmic', 'studio', 'arcade', 'cyber-district', 'royal-obsidian', 'celestial', 'crimson-pulse', 'crystal-dimension']).nullable().default(null),
  /** 2.1 Worlds Studio: banner colors/speed, animated icon, ambient effect and decorations */
  sceneC1: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  sceneC2: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  speed: z.number().int().min(25).max(200).default(100),
  iconAnim: z.enum(SERVER_ICON_ANIMS).default('none'),
  ambient: z.enum(SERVER_AMBIENTS).default('none'),
  emblem: z.enum(BADGES).nullable().default(null),
  nameEffect: z.enum(NAME_EFFECTS).default('none'),
  cardBorder: z.enum(CARD_BORDERS).default('none'),
  presentation: z.enum(['none', 'nebula', 'grid', 'waves']).default('none'),
  surface: z.enum(['default', 'deep', 'tinted']).default('default'),
  /** 0–100: how strong scenes/textures/entrances are (the person's own motion settings still win) */
  intensity: z.number().int().min(0).max(100).default(70),
  /** 2.2 Server Worlds: Anime Legends identity (cover + ambience of that collection) */
  legend: z.enum(AL_IDS).nullable().default(null),
  /** 2.2 atmosphere: lighting, background and details across header + channel list */
  atmosphere: z.enum(SERVER_ATMOSPHERES).default('none'),
  /** 2.2 Server Showcase (Vitrine) */
  showcase: showcaseSchema.default({ enabled: false, channels: [], highlights: [], events: [] }),
});
export type StudioTheme = z.infer<typeof studioThemeSchema>;
export const DEFAULT_STUDIO: StudioTheme = studioThemeSchema.parse({});
/** 2.0 Worlds templates: declarative presets (data only — never CSS/JS from users). All editable afterwards. */
export const WORLD_TEMPLATES: Record<NonNullable<StudioTheme['template']>, Partial<StudioTheme>> = {
  neon: { accent: '#ff2d78', scene: 'neon-current', lighting: 'vivid', texture: 'grid', hover: 'glow', iconFrame: 'neon', separator: 'glow', entrance: 'glitch', surface: 'deep', intensity: 80 },
  minimal: { accent: '#8b5cf6', scene: null, lighting: 'soft', texture: 'none', hover: 'lift', iconFrame: 'none', separator: 'line', entrance: 'none', surface: 'default', intensity: 40 },
  aurora: { accent: '#22d3ee', scene: 'aurora', lighting: 'soft', texture: 'grain', hover: 'glow', iconFrame: 'ring', separator: 'glow', entrance: 'bloom', surface: 'tinted', intensity: 70 },
  cosmic: { accent: '#a855f7', scene: 'galaxy', lighting: 'dim', texture: 'dots', hover: 'tilt', iconFrame: 'orbital', separator: 'dots', entrance: 'sweep', surface: 'deep', intensity: 75 },
  studio: { accent: '#f59e0b', scene: 'zen-dust', lighting: 'soft', texture: 'grain', hover: 'lift', iconFrame: 'ring', separator: 'line', entrance: 'sweep', surface: 'tinted', intensity: 55 },
  arcade: { accent: '#22c55e', scene: 'neon-grid', lighting: 'vivid', texture: 'grid', hover: 'tilt', iconFrame: 'neon', separator: 'dots', entrance: 'glitch', surface: 'deep', intensity: 85 },
  // 2.1 complete server themes
  'cyber-district': { accent: '#22d3ee', scene: 'neon-skyline', lighting: 'vivid', texture: 'grid', hover: 'glow', iconFrame: 'neon', separator: 'glow', entrance: 'glitch', surface: 'deep', intensity: 80, iconAnim: 'neon-trace', ambient: 'digital-atmosphere', nameEffect: 'glow', cardBorder: 'flow', presentation: 'grid' },
  'royal-obsidian': { accent: '#eab308', scene: 'energy-core', sceneC1: '#eab308', sceneC2: '#78350f', lighting: 'dim', texture: 'grain', hover: 'lift', iconFrame: 'ring', separator: 'line', entrance: 'sweep', surface: 'deep', intensity: 60, iconAnim: 'crystal-shine', ambient: 'ambient-particles', emblem: 'crown', nameEffect: 'gradient', cardBorder: 'pulse', presentation: 'none' },
  celestial: { accent: '#60a5fa', scene: 'cosmic-horizon', lighting: 'soft', texture: 'dots', hover: 'glow', iconFrame: 'orbital', separator: 'dots', entrance: 'bloom', surface: 'tinted', intensity: 70, iconAnim: 'orbit-glow', ambient: 'starlight', emblem: 'star', nameEffect: 'shimmer', cardBorder: 'flow', presentation: 'nebula' },
  'crimson-pulse': { accent: '#e11d48', scene: 'energy-core', sceneC1: '#e11d48', sceneC2: '#4c0519', lighting: 'vivid', texture: 'none', hover: 'tilt', iconFrame: 'neon', separator: 'glow', entrance: 'glitch', surface: 'deep', intensity: 85, iconAnim: 'pulse-beacon', ambient: 'reactive-glow', emblem: 'bolt', nameEffect: 'glow', cardBorder: 'pulse', presentation: 'waves' },
  'crystal-dimension': { accent: '#a5f3fc', scene: 'dreamscape', sceneC1: '#a5f3fc', sceneC2: '#c4b5fd', lighting: 'soft', texture: 'grain', hover: 'glow', iconFrame: 'ring', separator: 'line', entrance: 'bloom', surface: 'tinted', intensity: 65, iconAnim: 'hologram', ambient: 'aurora-background', emblem: 'diamond', nameEffect: 'shimmer', cardBorder: 'flow', presentation: 'waves' },
};

/** Which level a theme needs: Essencial (color/icon/static banner) · Alive (animated) · Signature (cover, entrance, frames). */
export function studioLevel(t: StudioTheme): 'essencial' | 'alive' | 'signature' {
  if (t.entrance !== 'none' || t.iconFrame !== 'none' || t.welcome.enabled || t.separator !== 'line') return 'signature';
  if (t.scene || t.hover !== 'lift') return 'alive';
  return 'essencial';
}

export const channelType = z.enum(['text', 'voice', 'announcement', 'forum', 'category']);
export type ChannelType = z.infer<typeof channelType>;

export const createServerSchema = z.object({
  name: z.string().min(2).max(100),
  isPublic: z.boolean().optional(),
});

export const updateServerSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  isPublic: z.boolean().optional(),
  rulesChannelId: z.string().nullable().optional(),
  welcomeChannelId: z.string().nullable().optional(),
});

export const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: channelType,
  parentId: z.string().nullable().optional(),
  topic: z.string().max(1024).optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  topic: z.string().max(1024).nullable().optional(),
  parentId: z.string().nullable().optional(),
  slowmodeSeconds: z.number().int().min(0).max(21600).optional(),
});

export const reorderChannelsSchema = z.object({
  items: z
    .array(z.object({ id: z.string(), position: z.number().int().min(0), parentId: z.string().nullable() }))
    .max(500),
});

export const sendMessageSchema = z.object({
  content: z.string().max(4000).default(''),
  nonce: z.string().max(64).optional(),
  replyToId: z.string().optional(),
  attachmentIds: z.array(z.string()).max(10).optional(),
});

export const editMessageSchema = z.object({ content: z.string().min(1).max(4000) });

export const createInviteSchema = z.object({
  maxAgeSeconds: z.number().int().min(0).max(60 * 60 * 24 * 30).default(60 * 60 * 24 * 7), // 0 = never
  maxUses: z.number().int().min(0).max(1000).default(0), // 0 = unlimited
});

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  permissions: z.string().regex(/^\d+$/).optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
});

export const updateRoleSchema = createRoleSchema.partial().extend({ position: z.number().int().min(1).optional() });

/* ---------------- Spaces (2.0): each person's own corner in the call ---------------- */
/** Five ready-made 2.5D scenes. Everything is drawn by the app from these ids (no uploaded art, nothing remote). */
export const SPACE_PRESETS = ['gamer', 'cozy', 'lounge', 'studio', 'minimal', 'office', 'japanese', 'anime', 'luxury'] as const;
/** Furniture/details each scene can show (the renderer ignores ids a preset doesn't use). Max 6 per corner. */
export const SPACE_ITEMS = ['desk', 'monitors', 'chair', 'bed', 'sofa', 'plant', 'shelf', 'lamp', 'neon', 'window', 'rug', 'speaker', 'easel', 'cat', 'posters'] as const;
const objId = z.string().regex(/^[a-z0-9]{1,8}$/);
export const roomObjectSchema = z.object({
  i: objId,
  k: z.enum(ROOM_ITEM_KEYS),
  x: z.number().min(-10).max(110),
  y: z.number().min(-10).max(70),
  r: z.number().int().min(0).max(3).optional(),
  p: objId.optional(),
});
export const spaceSceneSchema = z
  .object({
    preset: z.enum(SPACE_PRESETS).default('minimal'),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8b5cf6'),
    lighting: z.enum(['day', 'night', 'neon', 'warm']).default('night'),
    /** wall/background variant of the preset */
    backdrop: z.enum(['a', 'b', 'c']).default('a'),
    items: z.array(z.enum(SPACE_ITEMS)).max(6).default([]),
    /** tiny looping details (monitor glow, lamp flicker…) — always off in Econômico/Reduzido, under load or off screen */
    animated: z.boolean().default(true),
    avatarPos: z.enum(['left', 'center', 'right']).default('center'),
    /** 2.2 Smart Room Builder: free furniture layout (when present it replaces `items`) */
    objects: z.array(roomObjectSchema).max(48).optional(),
    wall: z.enum(WALLPAPERS).optional(),
    floor: z.enum(FLOOR_STYLES).optional(),
    particles: z.enum(ROOM_PARTICLES).default('none'),
    /** Anime Legends ambience (that collection's Spaces element) */
    ambiance: z.enum(AL_IDS).nullable().default(null),
  })
  .superRefine((s, ctx) => {
    if (!s.objects) return;
    if (new Set(s.objects.map((o) => o.i)).size !== s.objects.length) ctx.addIssue({ code: 'custom', message: 'ids repetidos' });
    const bad = validateLayout(s.objects as RoomObject[], s.avatarPos);
    if (bad.length) ctx.addIssue({ code: 'custom', message: `posição inválida (${bad[0]!.why})`, path: ['objects'] });
  });
export type SpaceScene = z.infer<typeof spaceSceneSchema>;
export const DEFAULT_SPACE: SpaceScene = spaceSceneSchema.parse({});

/* ---------------- Together (2.0): collaboration tools inside a call ---------------- */
export const TOGETHER_KINDS = ['poll', 'timer', 'notes', 'board', 'roll'] as const;
export type TogetherKind = (typeof TOGETHER_KINDS)[number];
const cleanText = (max: number) => z.string().max(max).transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''));
export const togetherCreateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('poll'),
    question: cleanText(200).pipe(z.string().trim().min(1)),
    options: z.array(cleanText(80).pipe(z.string().trim().min(1))).min(2).max(8),
    /** seconds until it closes by itself (null = until someone closes it) */
    durationSec: z.number().int().min(30).max(86400).nullable().default(null),
  }),
  z.object({ kind: z.literal('timer'), label: cleanText(60).default('Foco'), minutes: z.number().int().min(1).max(180).default(25) }),
  z.object({ kind: z.literal('notes'), title: cleanText(60).default('Notas') }),
  z.object({ kind: z.literal('board'), title: cleanText(60).default('Quadro') }),
  /** 2.2 small activity: dice or "who goes first" draw among the people in the call (server-side randomness) */
  z.object({ kind: z.literal('roll'), title: cleanText(60).default('Sorteio'), mode: z.enum(['dice', 'people']).default('dice'), sides: z.union([z.literal(6), z.literal(20), z.literal(100)]).default(6) }),
]);
export type TogetherCreate = z.infer<typeof togetherCreateSchema>;

const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const togetherOpSchema = z.object({
  /** client-generated id: replays after a reconnect are ignored (no duplicated actions) */
  opId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
  baseVersion: z.number().int().min(0).optional(),
  op: z.discriminatedUnion('type', [
    z.object({ type: z.literal('vote'), option: z.number().int().min(0).max(7) }),
    z.object({ type: z.literal('unvote') }),
    z.object({ type: z.literal('timer'), action: z.enum(['start', 'pause', 'reset']), minutes: z.number().int().min(1).max(180).optional() }),
    z.object({ type: z.literal('replace'), text: cleanText(20000) }),
    z.object({ type: z.literal('stroke'), id: z.string().min(4).max(40), tool: z.enum(['pen', 'marker']), color, width: z.number().min(1).max(24), points: z.array(point).min(1).max(800) }),
    z.object({ type: z.literal('text'), id: z.string().min(4).max(40), color, x: z.number().min(0).max(1), y: z.number().min(0).max(1), text: cleanText(200).pipe(z.string().trim().min(1)) }),
    z.object({ type: z.literal('erase'), ids: z.array(z.string().max(40)).min(1).max(200) }),
    z.object({ type: z.literal('clear') }),
    z.object({ type: z.literal('roll') }),
  ]),
});
export type TogetherOp = z.infer<typeof togetherOpSchema>['op'];
