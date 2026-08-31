import pino from 'pino';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const logLevel = process.env.LOG_LEVEL || 'info';
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
const botToken = process.env.TELEGRAM_BOT_TOKEN;

export const logger = pino({
  level: logLevel,
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

/**
 * Forwards critical alerts, rate limit warnings, or fatal exceptions directly to Telegram Admin Chat
 */
export async function notifyAdmin(
  message: string,
  level: 'error' | 'warn' | 'info' = 'error'
): Promise<void> {
  const emoji = level === 'error' ? '🚨 [ERROR]' : level === 'warn' ? '⚠️ [WARN]' : 'ℹ️ [INFO]';
  const fullText = `${emoji} *JobFinder Alert*\n\n${message}`;

  if (!botToken || !adminChatId) {
    logger.debug({ msg: 'Admin notification skipped (no botToken/adminChatId)', text: message });
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: fullText,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err: any) {
    logger.error({ err, msg: 'Failed to send Telegram admin notification' });
  }
}
