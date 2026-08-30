import type { Env } from '../types';

const MODEL = 'claude-sonnet-5';

/**
 * One-shot JSON completion. Used to draft hooks and captions; kept deliberately
 * small so a generation run stays inside the Worker's CPU budget.
 */
export async function completeJson<T>(
  env: Env,
  opts: { system: string; prompt: string; maxTokens?: number },
): Promise<T> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    }),
  });

  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const text = json.content.find((b) => b.type === 'text')?.text ?? '';

  // Models sometimes wrap JSON in prose or a fence; take the outermost object.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`no JSON object in model output: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1)) as T;
}
