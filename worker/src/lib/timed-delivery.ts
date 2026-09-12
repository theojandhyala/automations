import { signState, verifyState } from './auth';
import { ownerApprovalReceipt } from './owner-approval';
import type { Artifact, Env } from '../types';

// Explicit bookings expire rather than silently replaying on another day.
export const DELIVERY_GRACE_MS = 6 * 60 * 60 * 1000;
interface DeliveryBooking { artifact_id: string; receipt: string; at: string; exp: number }

export function deliveryPaused(artifact: Artifact): boolean {
  return ['cancelled', 'failed'].includes(artifact.stages?.delivery?.state ?? '');
}

export async function timedDeliveryStage(env: Env, artifact: Artifact, at: string) {
  return { state: 'scheduled', at, note: await signState({
    artifact_id: artifact.id, receipt: await ownerApprovalReceipt(artifact), at,
    exp: Date.parse(at) + DELIVERY_GRACE_MS,
  }, env.TOKEN_ENCRYPTION_KEY) };
}

/** An owner booking is distinct from an ordinary earliest-time restriction. */
export async function timedDeliveryError(env: Env, artifact: Artifact, now = Date.now()): Promise<string | null> {
  const stage = artifact.stages?.delivery;
  if (stage?.state !== 'scheduled' || !stage.note || !stage.at) return 'No exact-time delivery booking.';
  const booking = await verifyState<DeliveryBooking>(stage.note, env.TOKEN_ENCRYPTION_KEY);
  if (!booking || !Number.isFinite(booking.exp) || booking.exp < now) return 'Delivery booking expired or has an invalid signature; schedule it again.';
  if (booking.artifact_id !== artifact.id || booking.at !== stage.at
    || booking.receipt !== await ownerApprovalReceipt(artifact)) return 'The booked post changed; review and schedule its exact content again.';
  if (!Number.isFinite(Date.parse(booking.at)) || Date.parse(booking.at) > now) return 'Delivery booking is not due yet.';
  return null;
}
