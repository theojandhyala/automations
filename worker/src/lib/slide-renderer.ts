import puppeteer from '@cloudflare/puppeteer';
import type { Env } from '../types';

const WIDTH = 1080;
const HEIGHT = 1920;

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
    ? overlay.length > 80 ? 68 : overlay.length > 52 ? 78 : 90
    : overlay.length > 60 ? 54 : 64;
  const imageFit = hook ? 'cover' : 'contain';
  const position = hook ? 'center 43%' : 'center center';
  const overlayPosition = hook
    ? 'top:27%;left:70px;right:70px;'
    : 'bottom:150px;left:64px;right:64px;';
  const shadeClass = hook ? 'shade' : 'feature-shade';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#06070a}
body{font-family:Arial,Helvetica,sans-serif;color:#fff}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:${imageFit};object-position:${position};background:#06070a}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.05) 46%,rgba(0,0,0,.24))}
.feature-shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 66%,rgba(0,0,0,.35))}
.copy{position:absolute;${overlayPosition}text-align:center;font-size:${fontSize}px;font-weight:900;line-height:1.08;letter-spacing:-2px;color:#fff;text-shadow:-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,4px 4px 0 #000,0 6px 12px rgba(0,0,0,.55);overflow-wrap:anywhere}
</style></head><body><img class="photo" src="${escapeHtml(imageUrl)}"><div class="${shadeClass}"></div><div class="copy">${escapeHtml(overlay)}</div></body></html>`;
}

type BrowserEndpoint = Parameters<typeof puppeteer.launch>[0];
type CloudflareBrowser = Awaited<ReturnType<typeof puppeteer.launch>>;

export interface BrowserCapacity {
  available: boolean;
  active_sessions: number;
  idle_sessions: number;
  allowed_browser_acquisitions: number;
  retry_after_ms: number;
  message: string;
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

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
          ? 'Reusable renderer ready.'
          : 'Renderer slot ready; the daily free allowance is checked when rendering starts.'
        : retryAfter > 0
          ? `Renderer capacity resets in about ${Math.max(1, Math.ceil(retryAfter / 60_000))} minute(s).`
          : 'The free renderer allowance is currently exhausted.',
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
  const sessions = await puppeteer.sessions(endpoint);
  for (const session of sessions) {
    if (session.connectionId) continue;
    try {
      return await puppeteer.connect(endpoint, session.sessionId);
    } catch {
      // Another request may have claimed it between listing and connecting.
    }
  }

  // Browser Run allows one new browser acquisition every 20 seconds on the
  // free plan. A scheduled Worker has enough wall time to absorb that small
  // cooldown instead of failing a perfectly good draft and waiting a minute
  // for the next dispatcher pass.
  const limits = await puppeteer.limits(endpoint);
  if (limits.allowedBrowserAcquisitions === 0) {
    const retryAfter = Math.max(0, limits.timeUntilNextAllowedBrowserAcquisition || 0);
    if (retryAfter > 0 && retryAfter <= 25_000) {
      await wait(retryAfter + 250);
    } else {
      const minutes = retryAfter > 0 ? Math.max(1, Math.ceil(retryAfter / 60_000)) : null;
      throw new Error(minutes
        ? `The free slide renderer allowance resets in about ${minutes} minute(s). This exact draft will retry automatically.`
        : 'The free slide renderer allowance is exhausted. This exact draft will retry automatically.');
    }
  }
  return puppeteer.launch(endpoint);
}

async function renderPage(page: Awaited<ReturnType<CloudflareBrowser['newPage']>>, input: SlideInput): Promise<Uint8Array> {
  await page.setContent(slideHtml(input), { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction(
    'Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0)',
    { timeout: 20_000 },
  );
  const bytes = await page.screenshot({
    type: 'jpeg',
    quality: 92,
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    captureBeyondViewport: false,
  });
  return new Uint8Array(bytes);
}

/** Renders both TikTok slides inside one reusable Browser Run session. */
export async function renderCarouselSlides(
  env: Env,
  hook: SlideInput,
  feature: SlideInput,
): Promise<[Uint8Array, Uint8Array]> {
  let browser: CloudflareBrowser | null = null;
  try {
    const endpoint = env.BROWSER as unknown as BrowserEndpoint;
    browser = await acquireBrowser(endpoint);
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
      throw new Error('Cloudflare’s free 10-minute slide-rendering allowance is used for today. This exact draft will retry after the daily reset.');
    }
    if (message.includes('429') || /rate limit/i.test(message)) {
      throw new Error('The free slide renderer is busy. This exact draft is safe and will retry automatically.');
    }
    throw error;
  } finally {
    // Disconnect rather than closing so the next Cast/Deadset run can reuse the
    // same free-plan session instead of hitting the new-browser burst limit.
    browser?.disconnect();
  }
}
