import { type Context } from 'grammy';
import { db, users, eq } from '@bcn-intern-bot/db';

export async function handleStart(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
  const username = ctx.from?.username || ctx.from?.first_name || 'Candidate';

  if (telegramId) {
    try {
      // Ensure user record exists in database
      const existing = await db.query.users.findFirst({
        where: eq(users.telegramId, telegramId),
      });

      if (!existing) {
        await db.insert(users).values({
          telegramId,
          telegramUsername: ctx.from?.username,
          telegramChatId: ctx.chat?.id ? String(ctx.chat.id) : telegramId,
          fullName: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || username,
          isActive: true,
        });
      }
    } catch (err) {
      console.log(`[TelegramBot] Notice: DB is currently offline or unreachable (${(err as any)?.message}). Proceeding in lightweight memory mode.`);
    }
  }

  const welcomeMessage = `👋 *Hola ${username}! Welcome to Barcelona Internship Discovery Bot* 🚀

This bot constantly monitors *35+ top Barcelona tech scaleups, unicorns, and creative design studios* (Typeform, Glovo, TravelPerk, Factorial, Wallapop, Adevinta, Coverflex, Belvo, and more) across Greenhouse, Lever, Ashby, Teamtailor, Factorial, and Workable.

---

### 🌟 *How to get started:*
1. 📄 *Upload your CV (PDF):* Simply send your CV directly to this chat. Our AI will extract your skills, tools (Figma, React, TypeScript), and target roles.
2. 🎯 *Automatic AI Matching:* You'll receive real-time alerts whenever a relevant internship (Score ≥ 60%) is posted in Barcelona.
3. 💼 *Application Tracking:* Use inline buttons to save or mark jobs as applied.

---

### 🛠 *Available Commands:*
• /profile - View and customize your target roles and skills
• /my_applications - Track active job applications and interviews
• /stats - View database and crawling statistics
• /help - Display this guide again`;

  await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
}
