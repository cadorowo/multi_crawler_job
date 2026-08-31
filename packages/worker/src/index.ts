import { workerService } from './worker.js';
import { logger } from './logger.js';

export * from './worker.js';
export * from './logger.js';
export * from './jobs/crawl-all.js';
export * from './jobs/match-and-notify.js';
export * from './jobs/detect-stale.js';

async function main() {
  logger.info('🚀 Launching Barcelona Internship Discovery Worker Service...');

  const handleShutdown = async (signal: string) => {
    logger.info(`\n🛑 Received ${signal}. Shutting down worker...`);
    await workerService.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  await workerService.start();
}

if (import.meta.url.endsWith(process.argv[1] ?? '')) {
  main().catch((err) => {
    logger.error({ err }, 'Fatal error in worker service');
    process.exit(1);
  });
}
