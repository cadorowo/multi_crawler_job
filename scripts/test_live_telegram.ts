import { Bot, InlineKeyboard } from 'grammy';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

const bot = new Bot(token || 'dummy-token-for-initialization');

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is required to run the live Telegram test.');
}

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log(' 🚀 TELEGRAM BOT LIVE TEST LISTENER');
console.log(' Bot: @Yourbarcelonabot (Gus)');
console.log(' Direct URL: https://t.me/Yourbarcelonabot');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

// Listen for /start or any message
bot.on('message:text', async (ctx) => {
  const user = ctx.from;
  const text = ctx.message.text;

  console.log(`\n📩 [Message Received] From: ${user.first_name} (@${user.username || 'no_username'}) | ID: ${user.id}`);
  console.log(`   Content: "${text}"`);

  // Build Interactive Test Internship Card
  const keyboard = new InlineKeyboard()
    .text('📋 Deep Breakdown', 'test:deep_breakdown')
    .url('🔗 Apply Directly', 'https://job-boards.greenhouse.io/omnicomhealth/jobs/5207339008')
    .row()
    .text('👍 Relevant', 'test:like')
    .text('👎 Irrelevant', 'test:dislike')
    .text('💼 Mark Applied', 'test:applied');

  const cardMessage = `🔥 *NEW INTERNSHIP MATCH | 95% Match*

🏢 *Company:* Omnicom Health Group (Barcelona Hub)
🎨 *Role:* Graphic Designer & Digital UI - Internship
📍 *Location:* Barcelona, ES
🎓 *Contract:* 🇪🇺 Erasmus+ Traineeship Agreement / Convenio
🌐 *Language:* English-first international team
🛠 *Tools:* Figma, UI Design, Design Systems, Adobe Suite

💡 *Why it fits your PoliTo Profile:*
Direct alignment with your Politecnico di Torino UX/UI design & visual prototyping coursework. The Barcelona hub explicitly accepts the Erasmus+ Learning Agreement.

_Tap a button below to test the interactive controls:_`;

  await ctx.reply(cardMessage, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });

  console.log('   ✅ Sent interactive test card with inline buttons to user!');
});

// Listen for button clicks (Callback Queries)
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const user = ctx.from;

  console.log(`\n⚡ [Button Clicked] ${data} by ${user.first_name} (ID: ${user.id})`);

  if (data === 'test:deep_breakdown') {
    await ctx.answerCallbackQuery({ text: 'Opening Deep Breakdown...' });

    const breakdownText = `🔍 *Deep Match Analysis | Omnicom Health (Barcelona)*

📊 *Score Breakdown:*
• *Design & UI Skills:* 98% (Figma, Visual Systems, Wireframing)
• *Contract Compatibility:* 100% (Erasmus+ Traineeship Verified)
• *Location:* 100% (Barcelona City Center)
• *Language:* 95% (English Working Environment)

🎯 *Recommended Action:*
Submit your application with your design portfolio highlighting web UI prototypes and design tokens.`;

    const backKeyboard = new InlineKeyboard()
      .url('🔗 Apply on Greenhouse', 'https://job-boards.greenhouse.io/omnicomhealth/jobs/5207339008')
      .row()
      .text('💼 Mark Applied', 'test:applied');

    await ctx.reply(breakdownText, {
      parse_mode: 'Markdown',
      reply_markup: backKeyboard,
    });
  } else if (data === 'test:like') {
    await ctx.answerCallbackQuery({ text: '👍 Saved to your favorites! AI will boost similar roles.' });
    await ctx.reply('👍 *Feedback Saved!* The AI matcher will prioritize similar UX/UI internship postings in Barcelona.', { parse_mode: 'Markdown' });
  } else if (data === 'test:dislike') {
    await ctx.answerCallbackQuery({ text: '👎 Dismissed. AI will reduce similar roles.' });
    await ctx.reply('👎 *Dismissed.* The AI matcher has updated your negative preferences.', { parse_mode: 'Markdown' });
  } else if (data === 'test:applied') {
    await ctx.answerCallbackQuery({ text: '💼 Marked as Applied! Good luck!' });
    await ctx.reply('🎉 *Application Recorded!* Added to your active tracker in `/my_applications`.', { parse_mode: 'Markdown' });
  }
});

// Start listening
bot.start({
  onStart: (botInfo) => {
    console.log(`🤖 Bot @${botInfo.username} is LIVE and waiting for your message on Telegram!`);
    console.log(`👉 Open https://t.me/${botInfo.username} and send "/start" or any text now.\n`);
  },
});
