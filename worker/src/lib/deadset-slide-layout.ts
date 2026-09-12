export const DEADSET_SAFE_AREA = { x: 162, y: 250, width: 756, height: 1180 } as const;
// Safe bounds apply to added copy, not to the photograph or product canvas.
export const DEADSET_PROOF_AREA = { x: 0, y: 0, width: 1080, height: 1920 } as const;

/** Reject landscape/card crops rather than enlarging them until UI disappears. */
export function deadsetSourceFits(width: number, height: number, finished = false): boolean {
  if (width < 600 || height < 1000) return false;
  const ratio = width / height;
  return finished ? Math.abs(ratio - 9 / 16) < .005 : ratio >= .44 && ratio <= .58;
}

function escape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

/** Finished, owner-reviewed exports explicitly opt out of all overprinting. */
export function isFinishedSlidePath(path: string): boolean {
  return /^(?:features|outputs)\/finished\//.test(path);
}

export function deadsetSlideHtml(input: {
  imageUrl: string; overlay: string; role: 'hook' | 'feature'; finished?: boolean; featureKey?: string;
}): string {
  const { imageUrl, overlay, role, finished } = input;
  if (!finished && (!overlay.trim() || overlay.length > 100)) {
    throw new Error('DEADSET slide copy must contain 1–100 characters; shorten it before rendering.');
  }
  const isHook = role === 'hook';
  // Crops are tied to exact first-party captures, never inferred from a feature name.
  const focusedLogger = !finished && !isHook && input.featureKey === 'live_logger'
    && imageUrl.endsWith('/fcb7b786-5459-4edb-b575-7d9932fe7edb.png');
  const focusedPlan = !finished && !isHook && input.featureKey === 'workout_plan'
    && imageUrl.endsWith('/b8570478-36b1-49fa-8cdf-c90341bad79f.png');
  const body = finished
    ? `<img class="finished" src="${escape(imageUrl)}" alt="Owner-reviewed finished slide">`
    : isHook
      ? `<img class="hook-photo" src="${escape(imageUrl)}" alt=""><div class="shade"></div><h1 class="hook-copy centered">${escape(overlay)}</h1>`
      : `<div class="proof-viewport centered ${focusedLogger ? 'logger' : focusedPlan ? 'plan' : 'whole'}"><img src="${escape(imageUrl)}" alt="Actual DEADSET app, example screen"></div><img class="brand-lockup centered" src="https://automations.theojandhyala.workers.dev/brand/deadset-lockup.png" alt="DEADSET — Forge Your Body"><h1 class="proof-copy centered">${escape(overlay)}</h1><p class="example centered">Actual Deadset app · example screen</p><p class="cta centered">Find Deadset on the App Store</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#08090b;color:#fff;font-family:Arial,Helvetica,sans-serif}
.finished{display:block;width:1080px;height:1920px;object-fit:cover}
.hook-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 43%}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,#0002,#0001 45%,#0006)}
.hook-copy{position:absolute;left:162px;top:350px;width:756px;max-height:500px;margin:0;font-size:68px;line-height:1.12;text-align:center;text-shadow:0 3px 7px #000;-webkit-text-stroke:3px #000;paint-order:stroke fill;overflow-wrap:break-word}
.brand-lockup{position:absolute;left:340px;top:250px;width:400px;height:auto}
.proof-viewport{position:absolute;left:162px;top:590px;width:756px;height:732px;overflow:hidden}
.proof-viewport img{display:block;position:absolute;width:756px;height:auto;left:0}
.logger img{top:-427px}.plan{top:650px;height:590px}.plan img{top:-262px}
.whole img{width:100%;height:100%;object-fit:contain}
.proof-copy{position:absolute;left:162px;top:450px;width:756px;max-height:116px;margin:0;text-align:center;font-size:52px;font-weight:700;line-height:1.1;color:#f5f5f0;overflow-wrap:break-word}
.example,.cta{position:absolute;left:162px;width:756px;margin:0;text-align:center}
.example{top:1333px;font-size:27px;line-height:1.1;color:#aaa}
.cta{top:1380px;font-size:39px;line-height:1.2;color:#f5f5f0;font-weight:700}
</style></head><body>${body}</body></html>`;
}
