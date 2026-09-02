import puppeteer from '@cloudflare/puppeteer';
import type { Env } from '../types';

const WIDTH = 1080;
const HEIGHT = 1920;
export const CAPTION_RENDERER_VERSION = 'tiktok-classic-v2';

export interface SlideInput {
  imageUrl: string;
  overlay: string;
  role: 'hook' | 'feature';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function slideHtml({ imageUrl, overlay, role }: SlideInput): string {
  const hook = role === 'hook';
  const fontSize = hook
    ? overlay.length > 80 ? 62 : overlay.length > 52 ? 66 : 72
    : overlay.length > 60 ? 52 : 60;
  const imageFit = hook ? 'cover' : 'contain';
  const position = hook ? 'center 43%' : 'center center';
  const overlayPosition = hook
    ? 'top:22%;left:74px;right:74px;'
    : 'bottom:190px;left:70px;right:70px;';
  const shadeClass = hook ? 'shade' : 'feature-shade';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:InterTikTok;font-style:normal;font-weight:600;font-display:block;src:url('https://rsms.me/inter/font-files/Inter-SemiBold.woff2?v=4.1') format('woff2')}
*{box-sizing:border-box}html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#06070a}
body{font-family:InterTikTok,"Avenir Next","Helvetica Neue",Arial,sans-serif;color:#fff}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:${imageFit};object-position:${position};background:#06070a}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.05) 46%,rgba(0,0,0,.24))}
.feature-shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 66%,rgba(0,0,0,.35))}
.copy{position:absolute;${overlayPosition}text-align:center;font-size:${fontSize}px;font-weight:600;line-height:1.12;letter-spacing:-.5px;color:#fff;-webkit-text-fill-color:#fff;-webkit-text-stroke:5px #000;paint-order:stroke fill;text-shadow:0 2px 0 #000,0 3px 7px rgba(0,0,0,.42);overflow-wrap:anywhere;text-rendering:geometricPrecision;-webkit-font-smoothing:antialiased}
</style></head><body><img class="photo" src="${escapeHtml(imageUrl)}"><div class="${shadeClass}"></div><div class="copy">${escapeHtml(overlay)}</div></body></html>`;
}

type BrowserEndpoint = Parameters<typeof puppeteer.launch>[0];
type CloudflareBrowser = Awaited<ReturnType<typeof puppeteer.launch>>;
export type SlideRendererSession = CloudflareBrowser;

export interface BrowserCapacity {
  available: boolean;
  active_sessions: number;
  idle_sessions: number;
  allowed_browser_acquisitions: number;
  retry_after_ms: number;
  message: string;
}

export async function browserCapacity(env: Env): Promise<BrowserCapacity> {
  const endpoint = env.BROWSER as unknown as BrowserEndpoint;
  try {
    const [limits, sessions] = await Promise.all([
      puppeteer.limits(endpoint),
      puppeteer.sessions(endpoint),
    ]);
    const idleSessions = sessions.filter((session) => !session.connectionId).length;
    const retryAfter = Math.max(0, limits.timeUntilNextAllowedBrowserAcquisition || 0);
    const available = idleSessions > 0 || limits.allowedBrowserAcquisitions > 0;
    return {
      available,
      active_sessions: limits.activeSessions.length,
      idle_sessions: idleSessions,
      allowed_browser_acquisitions: limits.allowedBrowserAcquisitions,
      retry_after_ms: retryAfter,
      message: available
        ? idleSessions > 0
          ? 'Paid renderer ready; an idle session is available.'
          : 'Paid renderer ready.'
        : retryAfter > 0
          ? `Renderer capacity resets in about ${Math.max(1, Math.ceil(retryAfter / 60_000))} minute(s).`
          : 'Renderer capacity is currently unavailable.',
    };
  } catch (error) {
    return {
      available: false,
      active_sessions: 0,
      idle_sessions: 0,
      allowed_browser_acquisitions: 0,
      retry_after_ms: 0,
      message: error instanceof Error ? error.message : 'Renderer capacity could not be checked.',
    };
  }
}

async function acquireBrowser(endpoint: BrowserEndpoint): Promise<CloudflareBrowser> {
  return puppeteer.launch(endpoint);
}

export function openSlideRenderer(env: Env): Promise<SlideRendererSession> {
  return acquireBrowser(env.BROWSER as unknown as BrowserEndpoint);
}

export async function closeSlideRenderer(browser: SlideRendererSession): Promise<void> {
  await browser.close().catch(() => undefined);
}

async function renderPage(page: Awaited<ReturnType<CloudflareBrowser['newPage']>>, input: SlideInput): Promise<Uint8Array> {
  await page.setContent(slideHtml(input), { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.evaluate('document.fonts.ready');
  await page.waitForFunction(
    'Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0)',
    { timeout: 20_000 },
  );
  const bytes = await page.screenshot({
    type: 'jpeg',
    // TikTok recompresses uploads. This keeps 1080×1920 text and app proof
    // crisp while making the five-account daily volume storage-safe.
    quality: 94,
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    captureBeyondViewport: false,
  });
  return new Uint8Array(bytes);
}

/** Renders both TikTok slides inside one bounded Browser Run session. */
export async function renderCarouselSlides(
  env: Env,
  hook: SlideInput,
  feature: SlideInput,
  session?: SlideRendererSession,
): Promise<[Uint8Array, Uint8Array]> {
  let browser: CloudflareBrowser | null = session ?? null;
  const ownsBrowser = !session;
  try {
    browser ??= await openSlideRenderer(env);
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
      const hookBytes = await renderPage(page, hook);
      const featureBytes = await renderPage(page, feature);
      return [hookBytes, featureBytes];
    } finally {
      await page.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/allowance (?:resets|is exhausted)/i.test(message)) throw error;
    if (/browser time limit exceeded for today/i.test(message)) {
      throw new Error('Cloudflare has not attached this Worker to the paid Browser Run allowance yet. This exact draft will retry automatically.');
    }
    if (message.includes('429') || /rate limit/i.test(message)) {
      throw new Error('The paid slide renderer is temporarily busy. This exact draft is safe and will retry automatically.');
    }
    throw error;
  } finally {
    if (ownsBrowser && browser) await closeSlideRenderer(browser);
  }
}
