import { database } from "@deliveryos/database/client";

/** Retention policy: downsample after 7 days, purge after 90. */
export async function runTelemetryRetention(now = new Date()) {
  if (!database) return { downsampled: 0, purged: 0 };
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);

  const stale = await database.driverLocationSnapshot.findMany({
    where: {
      observedAt: { lt: sevenDaysAgo, gte: ninetyDaysAgo },
    },
    select: {
      id: true,
      organizationId: true,
      driverId: true,
      observedAt: true,
    },
    take: 5_000,
  });
  const keepIds = new Set<string>();
  const seenBuckets = new Set<string>();
  for (const row of stale) {
    const bucket = `${row.organizationId}:${row.driverId}:${Math.floor(row.observedAt.getTime() / (5 * 60_000))}`;
    if (seenBuckets.has(bucket)) continue;
    seenBuckets.add(bucket);
    keepIds.add(row.id);
  }
  const deleteIds = stale
    .filter((row) => !keepIds.has(row.id))
    .map((row) => row.id);
  if (deleteIds.length > 0)
    await database.driverLocationSnapshot.deleteMany({
      where: { id: { in: deleteIds } },
    });

  const purged = await database.driverLocationSnapshot.deleteMany({
    where: { observedAt: { lt: ninetyDaysAgo } },
  });
  await database.idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  await database.trackingToken.updateMany({
    where: { expiresAt: { lt: now }, revokedAt: null },
    data: { revokedAt: now },
  });
  return { downsampled: deleteIds.length, purged: purged.count };
}
