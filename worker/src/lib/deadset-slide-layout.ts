export const DEADSET_SAFE_AREA = { x: 86, y: 300, width: 778, height: 970 } as const;
export const DEADSET_PROOF_AREA = { x: 86, y: 510, width: 778, height: 610 } as const;

function escape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

/** Finished, owner-reviewed exports explicitly opt out of all overprinting. */
export function isFinishedSlidePath(path: string): boolean {
  return /^(?:features|outputs)\/finished\//.test(path);
}

export function deadsetSlideHtml(input: {
  imageUrl: string; overlay: string; role: 'hook' | 'feature'; finished?: boolean;
}): string {
  const { imageUrl, overlay, role, finished } = input;
  if (!finished && (!overlay.trim() || overlay.length > 100)) {
    throw new Error('DEADSET slide copy must contain 1–100 characters; shorten it before rendering.');
  }
  const isHook = role === 'hook';
  const body = finished
    ? `<img class="finished" src="${escape(imageUrl)}" alt="Owner-reviewed finished slide">`
    : isHook
      ? `<img class="hook-photo" src="${escape(imageUrl)}" alt=""><div class="shade"></div><h1 class="hook-copy">${escape(overlay)}</h1>`
      : `<div class="brand">DEAD<span>SET</span></div><h1 class="benefit">${escape(overlay)}</h1><div class="proof"><img src="${escape(imageUrl)}" alt="DEADSET feature"></div><div class="download">Get DEADSET on the App Store <span>→</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#08090b;color:#fff;font-family:Arial,Helvetica,sans-serif}
.finished{display:block;width:1080px;height:1920px;object-fit:contain}
.hook-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 43%}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,#0002,#0001 45%,#0006)}
.hook-copy{position:absolute;left:86px;top:350px;width:778px;max-height:500px;margin:0;font-size:68px;line-height:1.12;text-align:center;text-shadow:0 3px 7px #000;-webkit-text-stroke:3px #000;paint-order:stroke fill;overflow-wrap:break-word}
.brand{position:absolute;left:86px;top:300px;font-size:36px;font-weight:900;font-style:italic}.brand span{color:#f04438}
.benefit{position:absolute;left:86px;top:363px;width:778px;margin:0;font-size:48px;line-height:1.12;max-height:140px;overflow-wrap:break-word}
.proof{position:absolute;left:86px;top:510px;width:778px;height:610px;background:#101216;border:1px solid #303238;border-radius:24px;overflow:hidden}
.proof img{display:block;width:100%;height:100%;object-fit:contain}
.download{position:absolute;left:86px;top:1160px;width:778px;height:100px;border-radius:18px;background:#f04438;display:flex;align-items:center;justify-content:space-between;padding:0 30px;font-size:36px;font-weight:800}
</style></head><body>${body}</body></html>`;
}
