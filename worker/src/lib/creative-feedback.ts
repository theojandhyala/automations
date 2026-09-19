type RecentCreative = { hook?: string | null; asset_manifest: Record<string, unknown> };
export type CreativeFeedback = { hook?: string | null; source: 'owner' | 'agent' | 'model'; defects: string[] };

/** Owner corrections must survive an earlier passing model critique. */
export function recentCreativeFeedback(recent: RecentCreative[]): CreativeFeedback[] {
  return recent.flatMap((artifact): CreativeFeedback[] => {
    const manifest = artifact.asset_manifest;
    const owner = manifest.owner_rejection as { source?: string; reason?: string } | undefined;
    const native = manifest.native_visual_review as { result?: string; reviewer?: string; notes?: string } | undefined;
    const model = manifest.visual_review as { pass?: boolean; blockers?: string[] } | undefined;
    if (owner?.source === 'owner_message' && typeof owner.reason === 'string' && owner.reason.trim()) {
      return [{ hook: artifact.hook, source: 'owner', defects: [owner.reason.slice(0, 1600)] }];
    }
    if (native?.result === 'fail' && ['owner', 'agent'].includes(native.reviewer ?? '') && typeof native.notes === 'string') {
      return [{ hook: artifact.hook, source: native.reviewer as 'owner' | 'agent', defects: [native.notes.slice(0, 1600)] }];
    }
    return model?.pass === false ? [{ hook: artifact.hook, source: 'model', defects: (model.blockers ?? []).filter(v => typeof v === 'string').slice(0, 8) }] : [];
  }).slice(0, 8);
}
