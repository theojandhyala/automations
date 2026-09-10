import { describe, expect, it } from 'vitest';
import { deadsetSlideHtml, DEADSET_SAFE_AREA, DEADSET_PROOF_AREA, isFinishedSlidePath } from '../src/lib/deadset-slide-layout';

describe('DEADSET slide composition', () => {
  it('keeps the proof rectangle inside the conservative TikTok safe area', () => {
    const safe = DEADSET_SAFE_AREA, proof = DEADSET_PROOF_AREA;
    expect(proof.x).toBeGreaterThanOrEqual(safe.x);
    expect(proof.y).toBeGreaterThanOrEqual(safe.y);
    expect(proof.x + proof.width).toBeLessThanOrEqual(safe.x + safe.width);
    expect(proof.y + proof.height).toBeLessThanOrEqual(safe.y + safe.height);
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
    expect(html).toContain('object-fit:contain');
  });
  it('keeps screenshot proof separate from the benefit and CTA', () => {
    const html = deadsetSlideHtml({ imageUrl: 'https://media.example/capture.png', overlay: 'See the muscles each exercise targets', role: 'feature' });
    expect(html).toContain('class="proof"><img');
    expect(html).toContain('class="benefit"');
    expect(html).toContain('class="download"');
    expect(html).not.toContain('bottom:190px');
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
