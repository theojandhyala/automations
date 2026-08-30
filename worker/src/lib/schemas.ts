import { z } from 'zod';
import { isValidCron } from './cron';

/**
 * Runtime schemas for everything crossing the API boundary. Previously request
 * bodies were cast with `as`, which is a compile-time fiction -- a malformed
 * body reached PostgREST and failed there, or worse, wrote a shape the
 * dashboard could not read back.
 */

const cron = z
  .string()
  .trim()
  .refine((v) => isValidCron(v), 'must be a valid 5-field cron expression');

const uuid = z.string().uuid();
const jsonObject = z.record(z.unknown());
const httpsUrl = z.string().url().refine((value) => value.startsWith('https://'), 'must use https');
const tiktokPrivacy = z.enum([
  'PUBLIC_TO_EVERYONE',
  'FOLLOWER_OF_CREATOR',
  'MUTUAL_FOLLOW_FRIENDS',
  'SELF_ONLY',
]);

export const createAutomationSchema = z.object({
  handler_key: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullish(),
  app_id: uuid.nullish(),
  cron: cron.nullish(),
  enabled: z.boolean().default(false),
  config: jsonObject.default({}),
  icon: z.string().max(32).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  kind: z.enum(['app', 'system']).optional(),
});

export const updateAutomationSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullable(),
    app_id: uuid.nullable(),
    cron: cron.nullable(),
    enabled: z.boolean(),
    config: jsonObject,
    icon: z.string().max(32),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'no fields to update');

export const updateArtifactSchema = z
  .object({
    status: z.enum(['draft', 'approved', 'rejected']),
    hook: z.string().max(300).nullable(),
    caption: z.string().max(2200).nullable(),
    script: z.string().max(20000).nullable(),
    shot_notes: z.string().max(5000).nullable(),
    hashtags: z.array(z.string().max(60)).max(10),
    video_url: z.string().url().nullable(),
    photo_urls: z.array(httpsUrl).max(35),
    media_type: z.enum(['video', 'photo']),
    asset_manifest: jsonObject,
    account_id: uuid.nullable(),
    scheduled_for: z.string().datetime({ offset: true }).nullable(),
    tiktok_privacy_level: tiktokPrivacy.nullable(),
    disable_comment: z.boolean(),
    auto_add_music: z.boolean(),
    brand_organic_toggle: z.boolean(),
    brand_content_toggle: z.boolean(),
    is_aigc: z.boolean(),
    posting_consent: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'no fields to update');

export const createAccountSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .transform((v) => v.replace(/^@/, ''))
    .refine((v) => /^[A-Za-z0-9._]+$/.test(v), 'handle may only contain letters, numbers, dots and underscores'),
  app_id: uuid.nullish(),
  daily_post_limit: z.number().int().min(1).max(10).default(2),
});

export const updateAccountSchema = z
  .object({
    display_name: z.string().max(120).nullable(),
    app_id: uuid.nullable(),
    daily_post_limit: z.number().int().min(1).max(10),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'no fields to update');

export const pexelsKeySchema = z.object({
  api_key: z.string().trim().min(16).max(500),
});

export const appStoreCredentialsSchema = z.object({
  issuer_id: z.string().trim().uuid(),
  key_id: z.string().trim().regex(/^[A-Z0-9]{10}$/, 'must be the 10-character Apple Key ID'),
  private_key: z.string().trim()
    .min(100)
    .max(10000)
    .refine(
      (value) => value.includes('-----BEGIN PRIVATE KEY-----') && value.includes('-----END PRIVATE KEY-----'),
      'must be the contents of the App Store Connect .p8 private key',
    ),
});

export const appStoreCustomCodePreviewSchema = z.object({
  apple_app_id: z.string().trim().min(1).max(80),
  app_name: z.string().trim().min(1).max(160),
  subscription_id: z.string().trim().min(1).max(120),
  subscription_name: z.string().trim().min(1).max(160),
  offer_code_id: z.string().trim().min(1).max(120),
  offer_name: z.string().trim().min(1).max(160),
  custom_code: z.string().trim().toUpperCase()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9]+$/, 'may only contain letters and numbers'),
  redemption_limit: z.number().int().min(1).max(25000),
  expiration_date: z.string().date().nullable(),
});

export const appStoreCustomCodeConfirmSchema = z.object({
  confirmed: z.literal(true),
});

export const promotionMissionSchema = z.object({
  app_slug: z.string().trim().min(1).max(80),
  account_id: uuid.nullable().default(null),
  goal: z.enum(['downloads', 'feature_discovery', 'trust', 'engagement']),
  audience: z.enum(['new_lifters', 'consistent_lifters', 'serious_gym', 'general_fitness']),
  angle: z.enum(['relatable', 'problem_solution', 'proof', 'routine']),
  content_format: z.enum(['photo_carousel', 'video_brief']),
  draft_count: z.number().int().min(1).max(6),
  feature_rotation: z.array(z.enum([
    'muscle_diagram',
    'training_heatmap',
    'pr_wall',
    'progression_board',
    'workout_plan',
    'live_logger',
  ])).max(6).default([]),
  auto_produce: z.boolean().default(true),
});

/** Per-handler config schemas, checked when an automation's config is saved. */
export const handlerConfigSchemas: Record<string, z.ZodTypeAny> = {
  'system.heartbeat': z.object({}).passthrough(),
  'tiktok.generate': z.object({
    app_slug: z.string().min(1),
    count: z.number().int().min(1).max(10).default(3),
    account_id: uuid.nullish(),
    extra_context: z.string().max(2000).nullish(),
    content_format: z.enum(['video', 'photo_carousel']).optional(),
    source_policy: z.literal('licensed_real_only').optional(),
    feature_rotation: z.array(z.string().min(1).max(80)).max(20).optional(),
    creative_brief: z.object({
      goal: z.string().max(120),
      audience: z.string().max(120),
      angle: z.string().max(120),
      hypothesis: z.string().max(500),
    }).optional(),
  }),
  'tiktok.publish': z.object({
    max_per_run: z.number().int().min(1).max(10).default(3),
  }),
  'tiktok.produce': z.object({
    app_slug: z.string().min(1).default('deadset'),
    max_per_run: z.number().int().min(1).max(5).default(2),
  }),
  'tiktok.reconcile': z.object({}).passthrough(),
  'analytics.sync': z.object({
    lookback_posts: z.number().int().min(1).max(100).default(20),
  }).passthrough(),
  'report.daily': z.object({
    timezone_note: z.string().max(200).optional(),
  }).passthrough(),
  'pipeline.audit': z.object({
    stuck_after_hours: z.number().int().min(1).max(720).default(48),
  }).passthrough(),
};

export class ValidationError extends Error {
  constructor(message: string, readonly issues: unknown) {
    super(message);
  }
}

/** Parses a request body, raising ValidationError with readable field paths. */
export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError('body must be valid JSON', null);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') ?? '';
    throw new ValidationError(
      path ? `${path}: ${first?.message}` : (first?.message ?? 'invalid body'),
      parsed.error.issues,
    );
  }
  return parsed.data;
}

/** Validates an automation's config against its handler's schema. */
export function validateConfig(handlerKey: string, config: unknown): Record<string, unknown> {
  const schema = handlerConfigSchemas[handlerKey];
  if (!schema) return (config ?? {}) as Record<string, unknown>;

  const parsed = schema.safeParse(config ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') ?? '';
    throw new ValidationError(
      `config.${path || '(root)'}: ${first?.message ?? 'invalid'}`,
      parsed.error.issues,
    );
  }
  return parsed.data as Record<string, unknown>;
}
