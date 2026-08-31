import { db, jobs, eq, and, sql, lt } from '@bcn-intern-bot/db';
import { logger } from '../logger.js';

export async function runDetectStale(): Promise<{
  expiredCount: number;
}> {
  logger.info('🧹 Running Detect Stale Jobs cleanup...');

  // Jobs that were not seen for more than 10 hours (approx 4 crawl cycles of 2.5h)
  const staleThreshold = new Date(Date.now() - 10 * 60 * 60 * 1000);

  const staleJobs = await db.query.jobs.findMany({
    where: and(
      eq(jobs.status, 'active'),
      lt(jobs.lastSeenAt, staleThreshold)
    ),
  });

  if (staleJobs.length === 0) {
    logger.info('No stale jobs found.');
    return { expiredCount: 0 };
  }

  logger.info({ count: staleJobs.length }, 'Found active jobs missing from recent crawls, marking as expired...');

  for (const job of staleJobs) {
    await db
      .update(jobs)
      .set({
        status: 'expired',
        expiresAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id));
  }

  logger.info({ expiredCount: staleJobs.length }, '✅ Stale job expiration complete.');
  return { expiredCount: staleJobs.length };
}
