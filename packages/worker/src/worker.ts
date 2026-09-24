import PgBoss from 'pg-boss';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { logger, notifyAdmin } from './logger.js';
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
    await this.boss.work('match-and-notify', async () => {
      logger.info('[Worker] Executing job: match-and-notify');
      await runMatchAndNotify();
    });

    await this.boss.work('detect-stale', async () => {
      logger.info('[Worker] Executing job: detect-stale');
      await runDetectStale();
    });

    // Searches are triggered directly by `/search`; no recurring crawler runs.
    // Keep stale-record cleanup on a modest schedule.
    await this.boss.schedule('detect-stale', '0 */6 * * *', {});
    logger.info('⏰ Scheduled recurring job: detect-stale (every 6 hours)');
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
