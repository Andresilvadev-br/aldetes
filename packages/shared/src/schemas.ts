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
] as const;
export const PROFILE_EFFECTS = ['sparkles', 'snow', 'hearts', 'flames', 'lightning', 'bubbles', 'confetti', 'aura'] as const;
/** Avatar decorations: drawn AROUND the avatar (the uploaded image itself is never altered). */
export const AVATAR_DECORATIONS = ['neon-current', 'orbital', 'chroma-wave', 'zen-dust', 'halo', 'ember-ring', 'frost'] as const;
/** One-shot entrance when someone opens your profile card. */
export const PROFILE_ENTRANCES = ['particles', 'lights', 'glitch', 'reveal'] as const;
export type AvatarDecoration = (typeof AVATAR_DECORATIONS)[number];
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
  bannerPreset: z.enum(BANNER_PRESETS).nullable().optional(),
  profileEffect: z.enum(PROFILE_EFFECTS).nullable().optional(),
  avatarDecoration: z.enum(AVATAR_DECORATIONS).nullable().optional(),
  profileEntrance: z.enum(PROFILE_ENTRANCES).nullable().optional(),
  pronouns: z.string().trim().max(40).nullable().optional(),
  profileLinks: z.array(profileLinkSchema).max(3).optional(),
});


/* ---------------- Server Studio ---------------- */
export const SERVER_SCENES = ['aurora', 'galaxy', 'neon-grid', 'ocean', 'embers', 'neon-current', 'orbital', 'chroma-wave', 'zen-dust'] as const;
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
  entrance: z.enum(['none', 'sweep', 'bloom', 'glitch']).default('none'),
  welcome: z
    .object({ enabled: z.boolean().default(false), title: z.string().trim().max(60).default(''), body: z.string().trim().max(240).default('') })
    .default({ enabled: false, title: '', body: '' }),
});
export type StudioTheme = z.infer<typeof studioThemeSchema>;
export const DEFAULT_STUDIO: StudioTheme = studioThemeSchema.parse({});
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
export const SPACE_PRESETS = ['gamer', 'cozy', 'lounge', 'studio', 'minimal'] as const;
/** Furniture/details each scene can show (the renderer ignores ids a preset doesn't use). Max 6 per corner. */
export const SPACE_ITEMS = ['desk', 'monitors', 'chair', 'bed', 'sofa', 'plant', 'shelf', 'lamp', 'neon', 'window', 'rug', 'speaker', 'easel', 'cat', 'posters'] as const;
export const spaceSceneSchema = z.object({
  preset: z.enum(SPACE_PRESETS).default('minimal'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8b5cf6'),
  lighting: z.enum(['day', 'night', 'neon', 'warm']).default('night'),
  /** wall/background variant of the preset */
  backdrop: z.enum(['a', 'b', 'c']).default('a'),
  items: z.array(z.enum(SPACE_ITEMS)).max(6).default([]),
  /** tiny looping details (monitor glow, lamp flicker…) — always off in Econômico/Reduzido, under load or off screen */
  animated: z.boolean().default(true),
  avatarPos: z.enum(['left', 'center', 'right']).default('center'),
});
export type SpaceScene = z.infer<typeof spaceSceneSchema>;
export const DEFAULT_SPACE: SpaceScene = spaceSceneSchema.parse({});
