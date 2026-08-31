import type { CreativePlaybook } from './creative-playbooks';

export interface CreativeArtifactSignal {
  id: string;
  hook: string | null;
  status: string;
  asset_manifest: Record<string, unknown>;
  published_at: string | null;
}

export interface CreativeMetricSignal {
  artifact_id: string | null;
  captured_at: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export interface FeatureDecision {
  feature: string;
  reason: string;
  score: number;
  published_samples: number;
  latest_views: number | null;
  latest_engagements: number | null;
}

export interface CreativePlan {
  mode: 'performance_informed' | 'learning';
  decisions: FeatureDecision[];
  measured_posts: number;
  analysis_window: number;
}

function manifestFeature(artifact: CreativeArtifactSignal): string | null {
  const feature = artifact.asset_manifest.feature;
  return typeof feature === 'string' ? feature : null;
}

/**
 * Chooses the next verified feature mix from real post results when available,
 * while reserving space for under-tested and recently unused product proof.
 */
export function planCreativeFeatures(
  playbook: CreativePlaybook,
  allowedFeatures: string[],
  artifacts: CreativeArtifactSignal[],
  metrics: CreativeMetricSignal[],
  count: number,
): CreativePlan {
  const allowed = allowedFeatures.filter((feature) => feature in playbook.features);
  const latestMetric = new Map<string, CreativeMetricSignal>();
  for (const metric of [...metrics].sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at))) {
    if (metric.artifact_id && !latestMetric.has(metric.artifact_id)) latestMetric.set(metric.artifact_id, metric);
  }

  const recentPosition = new Map<string, number>();
  artifacts.slice(0, 16).forEach((artifact, index) => {
    const feature = manifestFeature(artifact);
    if (feature && !recentPosition.has(feature)) recentPosition.set(feature, index);
  });

  const candidates = allowed.map((feature) => {
    const matching = artifacts.filter((artifact) => artifact.status === 'published' && manifestFeature(artifact) === feature);
    const measured = matching
      .map((artifact) => latestMetric.get(artifact.id))
      .filter((metric): metric is CreativeMetricSignal => Boolean(metric));
    const views = measured.reduce((sum, metric) => sum + Math.max(metric.views ?? 0, 0), 0);
    const engagements = measured.reduce(
      (sum, metric) => sum + Math.max(metric.likes ?? 0, 0) + Math.max(metric.comments ?? 0, 0) * 4 + Math.max(metric.shares ?? 0, 0) * 6,
      0,
    );
    const engagementRate = views > 0 ? engagements / views : 0;
    const performance = measured.length ? Math.log10(views + 10) + Math.min(engagementRate * 18, 4) : 0;
    const exploration = 2.5 / (1 + matching.length);
    const recencyIndex = recentPosition.get(feature);
    const freshness = recencyIndex === undefined ? 2 : Math.min(recencyIndex / 8, 2);
    return {
      feature,
      score: performance + exploration + freshness,
      published_samples: matching.length,
      latest_views: measured.length ? views : null,
      latest_engagements: measured.length ? engagements : null,
      reason: measured.length
        ? `performance signal from ${measured.length} published post${measured.length === 1 ? '' : 's'}; balanced with freshness`
        : matching.length
          ? 'published result is waiting for analytics; keep testing without over-repeating it'
          : 'exploration slot for verified product proof with no published result yet',
    };
  }).sort((a, b) => b.score - a.score || a.feature.localeCompare(b.feature));

  const decisions: FeatureDecision[] = [];
  for (let index = 0; index < count && candidates.length; index += 1) {
    decisions.push({ ...candidates[index % candidates.length]! });
  }
  return {
    mode: metrics.some((metric) => metric.artifact_id !== null) ? 'performance_informed' : 'learning',
    decisions,
    measured_posts: latestMetric.size,
    analysis_window: artifacts.length,
  };
}
