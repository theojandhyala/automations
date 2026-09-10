import { describe, expect, it } from 'vitest';
import { deadsetSlideHtml, deadsetSourceFits, DEADSET_SAFE_AREA, DEADSET_PROOF_AREA, isFinishedSlidePath } from '../src/lib/deadset-slide-layout';

describe('DEADSET slide composition', () => {
  it('fills the entire frame while reserving conservative bounds for copy', () => {
    const safe = DEADSET_SAFE_AREA, proof = DEADSET_PROOF_AREA;
    expect(proof).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
    expect(safe.x + safe.width).toBeLessThanOrEqual(1080 * .8);
    expect(safe.y + safe.height).toBeLessThanOrEqual(1920 * .67);
  });
  it('does not overprint or crop a finished slide', () => {
    const html = deadsetSlideHtml({ imageUrl: 'https://media.example/approved.png', overlay: 'Enough.', role: 'feature', finished: true });
    const body = html.split('<body>')[1];
    expect(body).toContain('class="finished"');
    expect(body).not.toContain('Enough.');
    expect(body).not.toContain('Get DEADSET');
    expect(body).not.toContain('class="shade"');
    expect(html).not.toContain('object-fit:contain');
  });
  it('uses full-frame proof and a short reaction, not a boxed advert', () => {
    const html = deadsetSlideHtml({ imageUrl: 'https://media.example/capture.png', overlay: 'See the muscles each exercise targets', role: 'feature' });
    expect(html).toContain('class="proof"');
    expect(html).toContain('class="proof-copy"');
    expect(html).not.toContain('class="download"');
    expect(html).not.toContain('class="benefit"');
    expect(html).not.toContain('object-fit:contain');
    expect(html).not.toContain('bottom:190px');
  });
  it('rejects card crops and low-resolution or incorrectly sized finished exports', () => {
    expect(deadsetSourceFits(1320, 2868)).toBe(true);
    expect(deadsetSourceFits(1080, 1920, true)).toBe(true);
    expect(deadsetSourceFits(1074, 1217)).toBe(false);
    expect(deadsetSourceFits(300, 650)).toBe(false);
    expect(deadsetSourceFits(1320, 2868, true)).toBe(false);
  });
  it('places reactions in measured gaps, not over existing app labels', () => {
    for (const [featureKey, top] of [['workout_plan', 980], ['live_logger', 590]] as const) {
      const html = deadsetSlideHtml({ imageUrl: 'https://media.example/screen.png', overlay: 'No more mental notes.', role: 'feature', featureKey });
      expect(html).toContain(`top:${top}px;width:778px;max-height:64px`);
    }
  });
  it('escapes source and caption HTML', () => {
    const html = deadsetSlideHtml({ imageUrl: 'https://media.example/" onerror="alert(1)', overlay: '<img src=x onerror=alert(1)>', role: 'hook' });
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('src="x"');
    expect(html).toContain('&quot; onerror=&quot;');
  });
  it('rejects unreadable copy instead of silently clipping it', () => {
    expect(() => deadsetSlideHtml({ imageUrl: 'x', overlay: 'a'.repeat(101), role: 'feature' })).toThrow('shorten');
    expect(() => deadsetSlideHtml({ imageUrl: 'x', overlay: '', role: 'hook' })).toThrow('1–100');
  });
  it('only opts explicitly marked finished assets out of composition', () => {
    expect(isFinishedSlidePath('features/finished/deadset/muscle.png')).toBe(true);
    expect(isFinishedSlidePath('outputs/finished/reviewed.png')).toBe(true);
    expect(isFinishedSlidePath('features/deadset/muscle.png')).toBe(false);
    expect(isFinishedSlidePath('features/unfinished/muscle.png')).toBe(false);
  });
});
