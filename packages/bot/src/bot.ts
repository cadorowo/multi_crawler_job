import { Bot } from 'grammy';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { authMiddleware } from './middleware/auth.js';
import { handleStart } from './handlers/start.js';
import { handleCvUpload } from './handlers/cv.js';
import { handleActionCallback } from './handlers/actions.js';
import {
  handleProfile,
  handleMyApplications,
  handleStats,
  handleAddCompany,
} from './handlers/commands.js';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN is not set in environment variables.');
}

export function createBot(): Bot {
  const bot = new Bot(token || 'dummy-token-for-initialization');

  // Error handling
  bot.catch((err) => {
    console.error(`[TelegramBot] Error in update ${err.ctx.update.update_id}:`, err.error);
  });

  // Whitelist authorization middleware
  bot.use(authMiddleware);

  // Command Handlers
  bot.command('start', handleStart);
  bot.command('help', handleStart);
  bot.command('profile', handleProfile);
  bot.command('my_applications', handleMyApplications);
  bot.command('stats', handleStats);
  bot.command('add_company', handleAddCompany);

  // CV Upload Handler (PDF)
  bot.on(':document', handleCvUpload);

  // Inline Keyboard Actions
  bot.on('callback_query:data', handleActionCallback);

  return bot;
}

export const bot = createBot();
