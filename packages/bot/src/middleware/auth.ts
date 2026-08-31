import { type Context, type NextFunction } from 'grammy';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const allowedIdsRaw = process.env.ALLOWED_TELEGRAM_IDS || '';
const allowedTelegramIds = new Set<string>(
  allowedIdsRaw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);

// Optional invite secret token from env
const inviteSecret = process.env.INVITE_SECRET;

export async function authMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
  if (!telegramId) {
    return;
  }

  // Check if user is in whitelist
  if (allowedTelegramIds.size === 0 || allowedTelegramIds.has(telegramId)) {
    return next();
  }

  // Check if message is an invite token command: /invite <token>
  const text = ctx.message?.text?.trim() || '';
  if (inviteSecret && text.startsWith('/invite')) {
    const parts = text.split(/\s+/);
    const token = parts[1];

    if (token === inviteSecret) {
      allowedTelegramIds.add(telegramId);
      await ctx.reply(
        '🎉 *Access Granted!* You have been added to the authorized users list.\n\nSend /start to configure your profile or upload your CV (PDF) to begin matching.',
        { parse_mode: 'Markdown' }
      );
      return;
    } else {
      await ctx.reply('❌ Invalid invite token. Please check the secret code.');
      return;
    }
  }

  // User is not authorized
  await ctx.reply(
    `🔒 *Access Restricted*\n\nJobFinder is currently private.\nYour Telegram ID: \`${telegramId}\`\n\nIf you have an invite code, type:\n\`/invite <secret_code>\``,
    { parse_mode: 'Markdown' }
  );
}
