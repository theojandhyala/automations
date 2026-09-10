export const DEADSET_SAFE_AREA = { x: 86, y: 300, width: 778, height: 970 } as const;
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
  // Measured against the genuine screens in the proof library: use empty gaps,
  // never the existing set values or readiness labels beneath them.
  const proofCopyTop = input.featureKey === 'workout_plan' ? 980 : input.featureKey === 'live_logger' ? 590 : 1120;
  const body = finished
    ? `<img class="finished" src="${escape(imageUrl)}" alt="Owner-reviewed finished slide">`
    : isHook
      ? `<img class="hook-photo" src="${escape(imageUrl)}" alt=""><div class="shade"></div><h1 class="hook-copy">${escape(overlay)}</h1>`
      : `<img class="proof" src="${escape(imageUrl)}" alt="Actual DEADSET screen"><h1 class="proof-copy">${escape(overlay)}</h1>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#08090b;color:#fff;font-family:Arial,Helvetica,sans-serif}
.finished{display:block;width:1080px;height:1920px;object-fit:cover}
.hook-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 43%}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,#0002,#0001 45%,#0006)}
.hook-copy{position:absolute;left:86px;top:350px;width:778px;max-height:500px;margin:0;font-size:68px;line-height:1.12;text-align:center;text-shadow:0 3px 7px #000;-webkit-text-stroke:3px #000;paint-order:stroke fill;overflow-wrap:break-word}
.proof{position:absolute;inset:0;display:block;width:1080px;height:1920px;object-fit:cover;object-position:center center}
.proof-copy{position:absolute;left:86px;top:${proofCopyTop}px;width:778px;max-height:${input.featureKey === 'workout_plan' || input.featureKey === 'live_logger' ? 64 : 150}px;margin:0;text-align:center;font-size:52px;font-weight:700;line-height:1.12;text-shadow:0 3px 7px #000;-webkit-text-stroke:4px #000;paint-order:stroke fill;overflow-wrap:break-word}
</style></head><body>${body}</body></html>`;
}
