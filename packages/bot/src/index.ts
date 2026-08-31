import { bot } from './bot.js';

export * from './bot.js';
export * from './cards.js';

async function main() {
  console.log('🤖 Starting Barcelona Internship Discovery Telegram Bot...');

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN is missing. Please set it in your .env file.');
    process.exit(1);
  }

  // Graceful shutdown handlers
  const handleShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Stopping bot...`);
    await bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  await bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Bot @${botInfo.username} is running and listening for updates.`);
    },
  });
}

if (import.meta.url.endsWith(process.argv[1] ?? '')) {
  main().catch((err) => {
    console.error('Fatal error starting bot:', err);
    process.exit(1);
  });
}
