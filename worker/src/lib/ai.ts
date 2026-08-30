import type { Env } from '../types';

// Small, fast and covered by the Workers AI free allocation. On a Free plan,
// Cloudflare rejects calls after the daily allowance instead of billing overage.
const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ideas: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          hook: { type: 'string' },
          caption: { type: 'string' },
          hashtags: {
            type: 'array',
            minItems: 3,
            maxItems: 5,
            items: { type: 'string' },
          },
          shot_notes: { type: 'string' },
        },
        required: ['hook', 'caption', 'hashtags', 'shot_notes'],
      },
    },
  },
  required: ['ideas'],
} as const;

/** One-shot structured completion through the in-process Workers AI binding. */
export async function completeJson<T>(
  env: Env,
  opts: { system: string; prompt: string; maxTokens?: number },
): Promise<T> {
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.prompt },
    ],
    max_tokens: opts.maxTokens ?? 1600,
    temperature: 0.7,
    response_format: {
      type: 'json_schema',
      json_schema: JSON_SCHEMA,
    },
  });

  // JSON mode may return an already-parsed object, while non-JSON responses
  // use the documented string field. Accept both runtime shapes.
  const payload = result.response ?? result;
  if (typeof payload === 'object' && payload !== null) return payload as T;
  if (typeof payload !== 'string' || !payload) {
    throw new Error('Workers AI returned no structured response');
  }

  try {
    return JSON.parse(payload) as T;
  } catch {
    throw new Error(`Workers AI returned invalid JSON: ${payload.slice(0, 200)}`);
  }
}
