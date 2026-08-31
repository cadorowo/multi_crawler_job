import { Bot } from 'grammy';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { authMiddleware } from './middleware/auth.js';
import { handleStart } from './handlers/start.js';
import { handleCvUpload } from './handlers/cv.js';
import { handleActionCallback } from './handlers/actions.js';
import {
  handleAddCompany,
  handleMatches,
  handleMyApplications,
  handleProfile,
  handleSearch,
  handleSetup,
  handleStats,
} from './handlers/commands.js';
import { paseoBridge } from './paseo_bridge.js';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN || 'dummy-token-for-initialization';

export const JOBFINDER_COMMANDS = [
  { command: 'start', description: 'Create or open your JobFinder profile' },
  { command: 'setup', description: 'Set roles, locations and preferences' },
  { command: 'matches', description: 'View your personalized matches' },
  { command: 'search', description: 'Search the live JobFinder index' },
  { command: 'profile', description: 'View your job-search profile' },
  { command: 'my_applications', description: 'Track submitted applications' },
  { command: 'stats', description: 'View JobFinder indexing statistics' },
  { command: 'help', description: 'Show the JobFinder guide' },
] as const;

export function createJobFinderBot(): Bot {
  const app = new Bot(token);

  app.catch((err) => {
    console.error(`[JobFinder] Error in update ${err.ctx.update.update_id}:`, err.error);
  });

  app.use(authMiddleware);

  app.command('start', handleStart);
  app.command('help', handleStart);
  app.command('profile', handleProfile);
  app.command('setup', handleSetup);
  app.command('matches', handleMatches);
  app.command('search', handleSearch);
  app.command('my_applications', handleMyApplications);
  app.command('stats', handleStats);
  app.command('add_company', handleAddCompany);

  app.on(':document', handleCvUpload);
  app.on('callback_query:data', handleActionCallback);

  // Natural-language requests are handled by Paseo/AGY, while all state changes
  // continue to pass through the database-backed JobFinder handlers.
  app.on('message:text', async (ctx) => {
    const message = ctx.message.text.trim();
    if (!message || message.startsWith('/')) return;

    await ctx.reply('⚡ *Paseo sta analizzando la tua richiesta...*', { parse_mode: 'Markdown' });

    try {
      const answer = await paseoBridge.run({
        prompt: `You are Paseo, the intelligence bridge for JobFinder. Help the user with internship and job discovery only. Do not claim that you changed their profile, saved a job, or applied anywhere unless JobFinder confirms it through an application command. Reply in concise Telegram-friendly Italian or in the user's language.\n\nUser request: ${message}`,
      });
      // Plain text prevents AGY output from breaking Telegram Markdown parsing.
      await ctx.reply(answer.slice(0, 4096));
    } catch (error: any) {
      await ctx.reply(`❌ Paseo non è disponibile in questo momento: ${error.message}`);
    }
  });

  return app;
}

export const bot = createJobFinderBot();
