import { describe, it, expect } from 'vitest';
import { parseBillingOverview, billingKeySchema } from '../src/lib/hq-billing';
const metric = { id: 'active_trials', name: 'Active trials', description: 'Current trials', unit: '#', period: 'P0D', value: 0, last_updated_at: 1789000000000 };
describe('RevenueCat reporting contract', () => {
  it('preserves real zero values and provider freshness without inventing history', () => {
    const result = parseBillingOverview({ currency: 'GBP', metrics: [metric] }, 'cast', '2026-09-10T20:00:00Z');
    expect(result.project_id).toBe('proj574142f9');
    expect(result.metrics[0]).toEqual(metric);
    expect(result.days).toEqual([]);
  });
  it('rejects wrong currencies and missing numeric values instead of labelling them GBP or zero', () => {
    expect(() => parseBillingOverview({ currency: 'USD', metrics: [metric] }, 'deadset')).toThrow();
    expect(() => parseBillingOverview({ currency: 'GBP', metrics: [{ ...metric, value: null }] }, 'deadset')).toThrow();
    expect(billingKeySchema.safeParse({ key: 'appl_public-key' }).success).toBe(false);
  });
});
