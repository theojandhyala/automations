import { MANAGED_BRANDS, isManagedBrand, publicRelease } from './managed-brands';
import type { Artifact, Env } from '../types';
import type { RunContext } from './runner';

export const CLOUD_STUDIO_VERSION = '2026-10-06-v1';
export const CLOUD_LIMITS = { 'tiktok.generate': 2, 'tiktok.produce': 8, 'tiktok.brand-studio': 8 } as const;
export function londonDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const managedBrand = isManagedBrand;
export function parseJson<T>(value: string | null, fallback: T): T { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }

/** Atomic paid-work admission. Skipped runs are deliberately not charged to the allowance. */
export async function cloudWorkGate(ctx: RunContext): Promise<string | null> {
  const slug = ctx.automation.config.app_slug;
  const kind = ctx.automation.handler_key as keyof typeof CLOUD_LIMITS;
  if (!managedBrand(slug) || !(kind in CLOUD_LIMITS) || !ctx.env.OPERATIONS_DB) return null;
  const db = ctx.env.OPERATIONS_DB;
  const control = await db.prepare('SELECT paused FROM cloud_studio_brand_control WHERE app_slug=?').bind(slug).first<{paused:number}>();
  if (control?.paused) return 'Cloud preparation paused by owner.';
  const reserve = await db.prepare(`SELECT count(*) n FROM artifacts ar JOIN apps a ON a.id=ar.app_id
    WHERE a.slug=? AND ar.status IN ('approved','publishing') AND (ar.scheduled_for IS NULL OR ar.scheduled_for>?)`).bind(slug, new Date().toISOString()).first<{n:number}>();
  if ((reserve?.n ?? 0) >= 6) return 'Two-day approved queue is full; exact signatures are checked again before delivery.';
  if (kind === 'tiktok.generate') {
    const waiting = await db.prepare(`SELECT count(*) n FROM artifacts ar JOIN apps a ON a.id=ar.app_id WHERE a.slug=? AND ar.status='draft' AND ar.error IS NULL AND json_array_length(ar.photo_urls)=0`).bind(slug).first<{n:number}>();
    if ((waiting?.n ?? 0) >= 6) return 'Six unrendered drafts already await production; clear the bottleneck before adding more.';
  }
  const claim = await db.prepare(`INSERT OR IGNORE INTO cloud_studio_work(run_id,app_slug,kind,local_day,started_at)
    SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM cloud_studio_work WHERE app_slug=? AND kind=? AND local_day=?) < ?
    RETURNING run_id`).bind(ctx.runId, slug, kind, londonDay(), new Date().toISOString(), slug, kind, londonDay(), CLOUD_LIMITS[kind]).first();
  return claim ? null : 'Daily cloud work allowance reached. Resumes next Europe/London day; release gates remain unchanged.';
}

/** Exclude outputs and critique timestamps: re-rendering cannot reset its own retry allowance. */
export async function creativeInputHash(a: Artifact, renderer: string): Promise<string> {
  const m = a.asset_manifest;
  const input = JSON.stringify([CLOUD_STUDIO_VERSION, renderer, a.app_id, a.account_id, a.hook, a.caption, a.hashtags,
    m.app_slug, m.format, m.feature, m.slides, m.hook_visual_template, m.selected_cover, m.cover_asset_key, m.editorial_id]);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
}
export async function claimCreativeAttempt(env: Env, a: Artifact, renderer: string): Promise<boolean> {
  if (!env.OPERATIONS_DB) return true;
  return !!await env.OPERATIONS_DB.prepare(`INSERT OR IGNORE INTO cloud_studio_attempts(artifact_id,input_hash,attempted_at) VALUES(?,?,?) RETURNING artifact_id`)
    .bind(a.id, await creativeInputHash(a, renderer), new Date().toISOString()).first();
}

export function postingHealth(health: {checked_at?:string;posting_ready?:boolean;errors?:string[]}, now = Date.now()) {
  const age = now - Date.parse(health.checked_at ?? '');
  const fresh = Number.isFinite(age) && age >= 0 && age < 6 * 3600_000;
  return { ready: fresh && health.posting_ready === true, fresh, checked_at: health.checked_at ?? null,
    errors: health.errors ?? [], label: !fresh ? 'Access check stale or missing' : health.posting_ready ? 'Public posting access verified' : 'TikTok delivery blocked' };
}

type VerifyReview = (env: Env, artifact: Artifact) => Promise<boolean>;
export async function cloudStudioStatus(env: Env, verify: VerifyReview) {
  const db = env.OPERATIONS_DB;
  const brands = [];
  for (const slug of Object.keys(MANAGED_BRANDS) as Array<keyof typeof MANAGED_BRANDS>) {
    const app = await db.prepare('SELECT id,promotion_enabled FROM apps WHERE slug=?').bind(slug).first<{id:string;promotion_enabled:number}>();
    if (!app) continue;
    const handle = MANAGED_BRANDS[slug].handle;
    const release = await publicRelease(env, slug);
    const account = await db.prepare('SELECT id,handle,status,health FROM tiktok_accounts WHERE app_id=? AND handle IN (?,?)').bind(app.id, handle, '@'+handle).first<{id:string;health:string;handle:string;status:string}>();
    const control = await db.prepare('SELECT paused,updated_at FROM cloud_studio_brand_control WHERE app_slug=?').bind(slug).first();
    const raw = await db.prepare(`SELECT * FROM artifacts WHERE app_id=? AND account_id=? AND status IN ('draft','approved','publishing') ORDER BY created_at DESC LIMIT 200`).bind(app.id, account?.id ?? '').all<Record<string,unknown>>();
    const posts = raw.results.map(row => ({...row, photo_urls:parseJson(row.photo_urls as string, []), hashtags:parseJson(row.hashtags as string, []), asset_manifest:parseJson(row.asset_manifest as string, {}), stages:parseJson(row.stages as string, {})} as unknown as Artifact));
    const approved = posts.filter(p => p.status === 'approved' && (!p.scheduled_for || Date.parse(p.scheduled_for) > Date.now()));
    let reviewed = 0;
    for (const post of approved) if (await verify(env, post)) reviewed++;
    const health = postingHealth(parseJson(account?.health ?? null, {}));
    const jobs = await db.prepare(`SELECT id,handler_key,enabled,status,last_run_at,next_run_at,current_task FROM automations WHERE app_id=? AND handler_key IN ('tiktok.generate','tiktok.produce','tiktok.brand-studio') AND enabled=1`).bind(app.id).all();
    const usage = await db.prepare('SELECT kind,count(*) runs FROM cloud_studio_work WHERE app_slug=? AND local_day=? GROUP BY kind').bind(slug,londonDay()).all();
    const holds = posts.filter(p => p.error || (p.asset_manifest.visual_review as {pass?:boolean})?.pass === false);
    const slots = posts.filter(p => p.scheduled_for && Date.parse(p.scheduled_for)>Date.now() && ['approved','publishing'].includes(p.status)).sort((a,b)=>a.scheduled_for!.localeCompare(b.scheduled_for!));
    brands.push({slug,handle,release,paused:!!control?.paused,promotion_enabled:!!app.promotion_enabled,health,
      reviewed, target:6, awaiting_review:posts.filter(p=>p.status==='draft'&&p.photo_urls.length&&!p.error).length,
      quality_holds:holds.length, sampled:posts.length, sample_limit:200, jobs:jobs.results, usage:usage.results,
      ready: release.available && reviewed>=6 && health.ready && !!app.promotion_enabled && !control?.paused,
      upcoming:slots.map(p=>({id:p.id,hook:p.hook,at:p.scheduled_for,status:p.status})),
      previews:posts.slice(0,6).map(p=>({id:p.id,hook:p.hook,status:p.status,error:p.error,photos:p.photo_urls,review:(p.asset_manifest.visual_review as {pass?:boolean})?.pass ?? null})),
      blockers:[...new Set(holds.map(p=>p.error || ((p.asset_manifest.visual_review as {blockers?:string[]})?.blockers ?? []).join(' ')))].filter(Boolean).slice(0,5)});
  }
  return {version:CLOUD_STUDIO_VERSION,at:new Date().toISOString(),day:londonDay(),limits:CLOUD_LIMITS,brands};
}

/** Called only after the API's existing owner authentication. Never exposes tokens. */
export async function handleCloudStudio(req: Request, env: Env, verify: VerifyReview): Promise<Response> {
  const json = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if (req.method==='GET') return json(await cloudStudioStatus(env,verify));
  if (req.method!=='POST') return json({error:'Method not allowed'},405);
  if (req.headers.get('Origin')!==new URL(req.url).origin) return json({error:'Same-origin request required'},403);
  if (!req.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'JSON required'},415);
  const body = await req.json() as {app?:string;action?:string};
  if (!managedBrand(body.app) || !['pause','resume'].includes(body.action ?? '')) return json({error:'Choose a managed brand and pause/resume'},400);
  const paused = body.action==='pause';
  await env.OPERATIONS_DB.batch([
    env.OPERATIONS_DB.prepare('UPDATE cloud_studio_brand_control SET paused=?,updated_at=? WHERE app_slug=?').bind(Number(paused),new Date().toISOString(),body.app),
    env.OPERATIONS_DB.prepare('UPDATE apps SET promotion_enabled=? WHERE slug=?').bind(Number(!paused),body.app),
  ]);
  return json({app:body.app,paused,note:'In-flight TikTok submissions cannot be recalled. Existing exact-review requirements and daily allowances remain in force.'});
}
