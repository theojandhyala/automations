import { describe, expect, it } from 'vitest';
import { recentCreativeFeedback } from '../src/lib/creative-feedback';

describe('creative feedback source precedence', () => {
  it('learns an owner rejection even when the critic previously passed', () => {
    expect(recentCreativeFeedback([{ hook: 'old post', asset_manifest: {
      visual_review: { pass: true },
      owner_rejection: { source: 'owner_message', reason: 'The photo looks staged; the product page looks cheap.' },
    } }])).toEqual([{ hook: 'old post', source: 'owner', defects: ['The photo looks staged; the product page looks cheap.'] }]);
  });
  it('keeps agent inspection distinct from owner requirements and model findings', () => {
    const feedback = recentCreativeFeedback([
      { asset_manifest: { native_visual_review: { result: 'fail', reviewer: 'agent', notes: 'The face is covered by text.' }, visual_review: { pass: true } } },
      { asset_manifest: { visual_review: { pass: false, blockers: ['Possible small text.'] } } },
      { asset_manifest: { visual_review: { pass: true } } },
    ]);
    expect(feedback.map(f => f.source)).toEqual(['agent', 'model']);
    expect(feedback[0]?.defects).toEqual(['The face is covered by text.']);
  });
});
