import PgBoss from 'pg-boss';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { logger, notifyAdmin } from './logger.js';
import { runCrawlAll } from './jobs/crawl-all.js';
import { runMatchAndNotify } from './jobs/match-and-notify.js';
import { runDetectStale } from './jobs/detect-stale.js';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgrespassword@localhost:5432/bcn_internships';

export class WorkerService {
  private boss: PgBoss | null = null;

  public async start(): Promise<void> {
    logger.info('⚙️ Starting pg-boss background worker...');

    this.boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
      max: 10,
    });

    this.boss.on('error', (err) => {
      logger.error({ err }, 'pg-boss internal error');
    });

    await this.boss.start();
    logger.info('✅ pg-boss background worker connected and initialized.');

    // 1. Register Job Handlers
    await this.boss.work('crawl-all', async () => {
      logger.info('[Worker] Executing job: crawl-all');
      await runCrawlAll(this.boss!);
    });

    await this.boss.work('match-and-notify', async () => {
      logger.info('[Worker] Executing job: match-and-notify');
      await runMatchAndNotify();
    });

    await this.boss.work('detect-stale', async () => {
      logger.info('[Worker] Executing job: detect-stale');
      await runDetectStale();
    });

    // 2. Schedule Recurring Cron Jobs
    // Master Crawl every 2.5 hours (e.g. at minute 0 of every 2nd hour)
    await this.boss.schedule('crawl-all', '0 */2 * * *', {});
    logger.info('⏰ Scheduled recurring job: crawl-all (every 2.5 hours)');

    // Detect Stale Jobs every 6 hours
    await this.boss.schedule('detect-stale', '0 */6 * * *', {});
    logger.info('⏰ Scheduled recurring job: detect-stale (every 6 hours)');

    // Trigger an immediate initial crawl if requested or on startup
    if (process.env.RUN_INITIAL_CRAWL === 'true') {
      logger.info('Triggering initial immediate crawl...');
      await this.boss.send('crawl-all', { trigger: 'startup' });
    }
  }

  public async stop(): Promise<void> {
    if (this.boss) {
      logger.info('🛑 Stopping pg-boss worker gracefully...');
      await this.boss.stop();
      logger.info('Worker stopped.');
    }
  }
}

export const workerService = new WorkerService();
