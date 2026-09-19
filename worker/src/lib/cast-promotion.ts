import { CAST_BRAND_DATA_URL, CAST_BRAND_SHA256 } from './cast-brand';

export const CAST_PROMOTION_VERSION = 'cast-branded-proof-2026-09-13-v1';
export function castPromotionPlan(editorialId: string): { featureKey: 'catch_log' | 'records'; heading: string } {
  if (editorialId === 'trip-debrief') return { featureKey: 'records', heading: 'Your catches. Your personal bests.' };
  if (editorialId === 'one-trip-five-decisions') return { featureKey: 'catch_log', heading: 'Give every catch a record.' };
  return { featureKey: 'catch_log', heading: 'Keep the catch. Keep the details.' };
}

/** Metadata is provenance only; the independent image critic must still inspect the pixels. */
export function castPromotionEvidenceBlocker(manifest: Record<string, unknown>): string | null {
  const production = manifest.production as { feature_asset?: { id?: string; source_kind?: string; composition?: string }; brand_asset?: { sha256?: string } } | undefined;
  if (!production?.feature_asset?.id || production.feature_asset.source_kind !== 'owner_upload' || production.feature_asset.composition !== 'app_screen')
    return 'Cast promotion requires registered genuine app evidence for independent source comparison.';
  if (production.brand_asset?.sha256 !== CAST_BRAND_SHA256)
    return 'Cast promotion requires the exact official logo, with its source hash recorded.';
  return null;
}

export function castPromotionHtml(input: { imageUrl: string; proofUrl: string; heading: string }): string {
  const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  if (!input.heading.trim() || input.heading.length > 70 || !input.proofUrl) throw new Error('Cast promotion needs concise copy and genuine app proof.');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#03131c;color:#f2fbfa;font-family:Arial,Helvetica,sans-serif}
.background{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.tint{position:absolute;inset:0;background:linear-gradient(180deg,#03131cf0 0%,#03131ced 70%,#03131c99 100%)}
.accent{position:absolute;left:0;right:0;bottom:0;height:440px;background:linear-gradient(145deg,transparent 25%,#0bcda433 26%,#0bcda407 100%)}
.centered{position:absolute;left:170px;width:740px;text-align:center}
.masthead{top:260px;height:140px;display:flex;justify-content:center;align-items:center;gap:24px}
.mark{width:120px;height:120px;object-fit:contain;border-radius:24px}.name{text-align:left}.name strong{display:block;font-size:94px;line-height:1;letter-spacing:3px}.name span{display:block;font-size:24px;letter-spacing:2px;margin-top:8px;color:#b9d9d9}
h1{top:420px;margin:0;font-size:58px;line-height:1.05;max-height:122px;font-weight:800;white-space:pre-line}
.proof{top:550px;left:200px;width:680px;height:740px;overflow:hidden;border:2px solid #12cfa666;border-radius:22px;background:#020b10;box-shadow:0 18px 50px #0008}.proof img{display:block;width:100%;height:auto}
.example{top:1308px;font-size:26px;line-height:1.2;margin:0;color:#d0e5e4}
.cta{top:1358px;height:72px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:#12cfa6;color:#03251f;font-size:32px;font-weight:800}
</style></head><body><img class="background" src="${esc(input.imageUrl)}"><div class="tint"></div><div class="accent"></div><div class="centered masthead"><img class="mark" alt="Official Cast logo" src="${CAST_BRAND_DATA_URL}"><div class="name"><strong>CAST</strong><span>FISHING COMPANION</span></div></div><h1 class="centered">${esc(input.heading)}</h1><div class="centered proof"><img alt="Actual Cast app screen" src="${esc(input.proofUrl)}"></div><p class="centered example">Actual Cast app · example data</p><div class="centered cta">Find Cast on the App Store</div></body></html>`;
}
