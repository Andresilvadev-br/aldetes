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
export const BANNER_PRESETS = ['neon-grid', 'sakura', 'aurora', 'galaxy', 'cyber-rain', 'anime-sky', 'neon-city', 'storm', 'pixel-arcade', 'embers', 'ocean', 'void'] as const;
export const PROFILE_EFFECTS = ['sparkles', 'snow', 'hearts', 'flames', 'lightning', 'bubbles', 'confetti', 'aura'] as const;
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
});

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
