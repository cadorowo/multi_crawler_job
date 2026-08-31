#!/usr/bin/env node
/**
 * bot.ts — Multi-Profile & Deep Alignment Telegram Bot
 *
 * Commands:
 *   /start    — Interactive Alignment Onboarding Wizard (City -> Track -> Contract -> Culture)
 *   /align    — Diagnostic search alignment check-in & parameter recalibration
 *   /matches  — Get your top personalized job matches (with Company Website + Apply URLs)
 *   /find     — Search jobs by keyword (e.g. /find marketing in milan)
 *   /profile  — View & edit your active search alignment
 *   /saved    — List saved roles
 *   /applied  — Track applied jobs
 *   /help     — Show command directory
 *
 * Free-text messages -> Forwarded to Paseo AGY Bridge with persistent context
 */

import { Bot, InlineKeyboard } from 'grammy';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';

import {
  getProfile,
  saveProfile,
  createProfile,
  markApplied,
  markSaved,
  markDismissed,
} from './store/profileStore.js';
import { getTopMatches, searchJobs } from './matching/engine.js';
import {
  DISCIPLINES,
  CONTRACTS,
  CITIES,
  type DisciplineKey,
  type ContractKey,
  type CityKey,
} from './store/types.js';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8565693353:AAFw7xw2RuweoMVb047-gIjxxCrcDA_5w_s';
const ALLOWED_IDS = (process.env.ALLOWED_TELEGRAM_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const AGY_BIN = 'agy';
const WORKSPACE = resolve(process.cwd(), '../../');
const CONV_ID_FILE = resolve(process.cwd(), '.bridge_conversation_id');
const execAsync = promisify(exec);

const bot = new Bot(TOKEN);

// ── Helpers ────────────────────────────────────────────────────────────────────

function isAllowed(userId: number): boolean {
  return ALLOWED_IDS.length === 0 || ALLOWED_IDS.includes(String(userId));
}

function loadConvId(): string | null {
  try { return fs.readFileSync(CONV_ID_FILE, 'utf-8').trim() || null; } catch { return null; }
}

function formatJobCard(job: {
  id: string;
  company: string;
  companyWebsite?: string;
  title: string;
  location: string;
  contract: string;
  applyUrl: string;
  tailoredScore: number;
  tools?: string[];
  description?: string;
}): string {
  const toolsStr = job.tools && job.tools.length > 0 ? job.tools.join(', ') : 'International Team, English-First';
  const websiteLine = job.companyWebsite ? `\n🌐 *Company Website:* ${job.companyWebsite}` : '';

  return `🔥 *TOP MATCH | ${job.tailoredScore}% Match*

🏢 *Company:* ${job.company}${websiteLine}
🎨 *Role:* ${job.title}
📍 *Location:* ${job.location}
🎓 *Contract:* ${job.contract}
🛠 *Stack / Focus:* ${toolsStr}

💡 *Why it fits your profile:*
Direct alignment with your target track, location preference, and university agreement eligibility.

🔗 *Direct Apply Link:* ${job.applyUrl}`;
}

function buildJobKeyboard(job: { id: string; applyUrl: string; companyWebsite?: string }): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (job.companyWebsite) {
    kb.url('🌐 Website', job.companyWebsite);
  }
  kb.url('🔗 Apply Portal', job.applyUrl);
  kb.row()
    .text('👍 Save', `save:${job.id}`)
    .text('👎 Skip', `skip:${job.id}`)
    .text('💼 Applied', `applied:${job.id}`);
  return kb;
}

// ── Auth middleware ────────────────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  if (ctx.from && !isAllowed(ctx.from.id)) {
    await ctx.reply('⛔ You are not authorised to use this bot.');
    return;
  }
  return next();
});

// ── /start (Interactive Alignment Onboarding) ──────────────────────────────────

bot.command('start', async (ctx) => {
  const user = ctx.from!;
  const profile = getProfile(user.id);

  if (profile) {
    const disc = DISCIPLINES[profile.discipline];
    const citiesStr = profile.targetCities?.join(', ') || 'Milan, Barcelona';

    const menu = new InlineKeyboard()
      .text('🎯 Find Matches', 'cmd:matches')
      .text('⚖️ Recalibrate / Align', 'cmd:align')
      .row()
      .text('🔍 Search Jobs', 'cmd:search_hint')
      .text('⚙️ Profile', 'cmd:profile')
      .row()
      .text('📋 Saved Jobs', 'cmd:saved')
      .text('💼 Applied', 'cmd:applied');

    await ctx.reply(
      `👋 *Welcome back, ${profile.firstName}!*

🎯 *Active Search Profile:*
• *Track:* ${disc?.emoji || '🎨'} ${disc?.label || profile.discipline}
• *Target Cities:* 📍 ${citiesStr}
• *Contract:* 🎓 ${profile.contractTypes.map(c => CONTRACTS[c]?.label || c).join(', ')}
• *Culture:* ${profile.environment === 'startup' ? '⚡ Early-Stage Startup' : '🏢 Scaleup / Enterprise'}

Tap below to discover new matches or recalibrate your search alignment:`,
      { parse_mode: 'Markdown', reply_markup: menu }
    );
    return;
  }

  // Brand new user — launch Alignment Onboarding Step 1: City Selection
  const keyboard = new InlineKeyboard()
    .text('🇮🇹 Milan', 'align:city:milan')
    .text('🇪🇸 Barcelona', 'align:city:barcelona')
    .row()
    .text('🇬🇧 London', 'align:city:london')
    .text('🇩🇪 Berlin', 'align:city:berlin')
    .row()
    .text('🇳🇱 Amsterdam', 'align:city:amsterdam')
    .text('🇫🇷 Paris', 'align:city:paris')
    .row()
    .text('🇪🇸 Madrid', 'align:city:madrid')
    .text('🏠 100% Remote', 'align:city:remote')
    .row()
    .text('🌍 All Europe (Any City)', 'align:city:europe');

  await ctx.reply(
    `👋 *Hola ${user.first_name}! Welcome to Global Internship Discovery* 🚀

Let's set up your **Search Alignment** in 3 quick steps so every match hits 95%+ precision.

---
📍 *Step 1/3: Where do you want to work?*
Choose your primary target city:`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

// ── /align (Diagnostic Alignment Command) ──────────────────────────────────────

bot.command('align', async (ctx) => {
  const user = ctx.from!;
  const profile = getProfile(user.id);

  if (!profile) {
    await ctx.reply('Please initialize your profile first with /start!');
    return;
  }

  const disc = DISCIPLINES[profile.discipline];
  const citiesStr = profile.targetCities?.join(', ') || 'Milan, Barcelona';

  const alignKeyboard = new InlineKeyboard()
    .text('📍 Change Cities', 'align:re_city')
    .text('🎯 Change Track', 'align:re_track')
    .row()
    .text('🎓 Change Contract', 'align:re_contract')
    .text('⚡ Culture / Scale', 'align:re_culture')
    .row()
    .text('🔥 Re-Run Matches Now', 'cmd:matches');

  await ctx.reply(
    `⚖️ *Search Alignment Diagnostic*

📊 *Current Active Configuration:*
• *Target Track:* ${disc?.emoji || '🎯'} ${disc?.label || profile.discipline}
• *Target Cities:* 📍 ${citiesStr}
• *Contract Framework:* 🎓 ${profile.contractTypes.map(c => CONTRACTS[c]?.label || c).join(', ')}
• *Company Scale:* ${profile.environment === 'startup' ? '⚡ High-Speed Startup' : '🏢 Structured Scaleup / Any'}

💡 *What would you like to recalibrate?*`,
    { parse_mode: 'Markdown', reply_markup: alignKeyboard }
  );
});

// ── /matches ──────────────────────────────────────────────────────────────────

bot.command('matches', async (ctx) => {
  const user = ctx.from!;
  const profile = getProfile(user.id);

  if (!profile) {
    await ctx.reply('Please set up your profile first with /start');
    return;
  }

  const disc = DISCIPLINES[profile.discipline];
  const citiesStr = profile.targetCities?.join(', ') || 'your target cities';

  await ctx.reply(`🔍 *Generating top matches for ${disc?.label || 'your profile'} in ${citiesStr}...*`, {
    parse_mode: 'Markdown',
  });

  const matches = getTopMatches(profile, 3);
  if (matches.length === 0) {
    await ctx.reply('No direct matches found. Try broadening your location with /align!');
    return;
  }

  for (const job of matches) {
    await ctx.reply(formatJobCard(job), {
      parse_mode: 'Markdown',
      reply_markup: buildJobKeyboard(job),
    });
  }

  await ctx.reply('💡 Want to refine your results? Tap /align or search specifically with `/find <role> in <city>`.', {
    reply_markup: new InlineKeyboard().text('5 More Matches →', 'cmd:more'),
  });
});

// ── /find <query> ─────────────────────────────────────────────────────────────

bot.command('find', async (ctx) => {
  const user = ctx.from!;
  const query = ctx.match?.trim();

  if (!query) {
    await ctx.reply(
      `🔍 *Search Format:*
\`/find <role> in <city>\`

*Examples:*
• \`/find marketing in milan\`
• \`/find product designer in barcelona\`
• \`/find software intern remote\`
• \`/find data analyst in london\``,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const profile = getProfile(user.id);
  await ctx.reply(`🔍 *Searching for "${query}" across European ATS feeds...*`, { parse_mode: 'Markdown' });

  const results = searchJobs(query, profile, 4);
  if (results.length === 0) {
    await ctx.reply(`No direct listings found for "${query}". Try /align to adjust filters or broaden your search keyword.`);
    return;
  }

  await ctx.reply(`🔍 *Found ${results.length} Matches for "${query}":*`, { parse_mode: 'Markdown' });

  for (const job of results) {
    await ctx.reply(formatJobCard(job), {
      parse_mode: 'Markdown',
      reply_markup: buildJobKeyboard(job),
    });
  }
});

// ── /profile ──────────────────────────────────────────────────────────────────

bot.command('profile', async (ctx) => {
  const user = ctx.from!;
  const profile = getProfile(user.id);

  if (!profile) {
    await ctx.reply('No profile found. Run /start to create one!');
    return;
  }

  const disc = DISCIPLINES[profile.discipline];
  const citiesStr = profile.targetCities?.join(', ') || 'Milan, Barcelona';

  const keyboard = new InlineKeyboard()
    .text('⚖️ Recalibrate Search', 'cmd:align')
    .text('🎯 Find Matches', 'cmd:matches')
    .row()
    .text('📋 Saved Roles', 'cmd:saved')
    .text('💼 Applied', 'cmd:applied');

  await ctx.reply(
    `👤 *Your Job Search Profile:*

🎯 *Discipline:* ${disc?.emoji || '🎨'} ${disc?.label || profile.discipline}
📍 *Target Locations:* ${citiesStr}
🎓 *Contract:* ${profile.contractTypes.map(c => CONTRACTS[c]?.label || c).join(', ')}
🛠 *Skills:* ${profile.skills.length > 0 ? profile.skills.join(', ') : 'Standard Toolchain'}
⚡ *Culture:* ${profile.environment === 'startup' ? 'Startup' : 'Scaleup / Enterprise'}

📊 *Activity:*
• *Saved:* ${profile.savedIds.length} roles
• *Applied:* ${profile.appliedIds.length} roles
• *Dismissed:* ${profile.dismissedIds.length} roles`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

// ── /saved & /applied & /help ─────────────────────────────────────────────────

bot.command('saved', async (ctx) => {
  const user = ctx.from!;
  const profile = getProfile(user.id);

  if (!profile || profile.savedIds.length === 0) {
    await ctx.reply('No saved jobs yet. Tap 👍 on any match card to save it!');
    return;
  }

  await ctx.reply(`📋 *Your Saved Roles (${profile.savedIds.length}):*`, { parse_mode: 'Markdown' });
  const jobs = searchJobs('', profile, 100);
  const saved = jobs.filter(j => profile.savedIds.includes(j.id)).slice(0, 4);

  for (const job of saved) {
    await ctx.reply(formatJobCard(job), {
      parse_mode: 'Markdown',
      reply_markup: buildJobKeyboard(job),
    });
  }
});

bot.command('applied', async (ctx) => {
  const user = ctx.from!;
  const profile = getProfile(user.id);

  if (!profile || profile.appliedIds.length === 0) {
    await ctx.reply('No applied jobs tracked yet. Tap 💼 on a card when you submit an application!');
    return;
  }

  await ctx.reply(
    `💼 *Application Tracker*

You have applied to *${profile.appliedIds.length}* role(s).
All applied roles are automatically excluded from your new recommendations. Good luck! 🚀`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `🤖 *Barcelona & European Internship Discovery Bot*

*Commands:*
/start — Launch the Alignment Onboarding Wizard
/align — Diagnostic check-in & recalibrate your search
/matches — View your top personalized matches
/find \`<role> in <city>\` — Search by custom position & location
/profile — View your profile & statistics
/saved — List saved/bookmarked jobs
/applied — Application status tracker
/help — Command directory

💬 *Free Text:* You can also type natural language questions (e.g. *"What are top design agencies in Milan?"*) and the AI Agent will assist you!`,
    { parse_mode: 'Markdown' }
  );
});

// ── Alignment Onboarding Callback Handlers ─────────────────────────────────────

// Step 1 -> Step 2: City -> Track
bot.callbackQuery(/^align:city:(.+)$/, async (ctx) => {
  const cityKey = ctx.match[1] as CityKey;
  const cityName = CITIES[cityKey]?.city || 'Milan';
  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard();
  const discKeys = Object.keys(DISCIPLINES) as DisciplineKey[];
  discKeys.forEach((key, i) => {
    const d = DISCIPLINES[key];
    keyboard.text(`${d.emoji} ${d.label}`, `align:track:${cityKey}:${key}`);
    if (i % 2 === 1) keyboard.row();
  });

  await ctx.editMessageText(
    `📍 *Location:* ${CITIES[cityKey]?.emoji || '📍'} *${cityName}* — selected!

---
🎯 *Step 2/3: What is your primary discipline or role track?*`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

// Step 2 -> Step 3: Track -> Contract
bot.callbackQuery(/^align:track:(.+):(.+)$/, async (ctx) => {
  const cityKey = ctx.match[1] as CityKey;
  const disc = ctx.match[2] as DisciplineKey;
  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard()
    .text('🇪🇺 Erasmus+ Traineeship', `align:done:${cityKey}:${disc}:erasmus`)
    .row()
    .text('🇮🇹 Stage Curriculare (IT)', `align:done:${cityKey}:${disc}:stage_curriculare`)
    .row()
    .text('🇪🇸 Convenio de Prácticas (ES)', `align:done:${cityKey}:${disc}:convenio`)
    .row()
    .text('🔓 Any Contract / Direct Placement', `align:done:${cityKey}:${disc}:any`);

  await ctx.editMessageText(
    `${DISCIPLINES[disc]?.emoji || '🎨'} *${DISCIPLINES[disc]?.label || disc}* — noted!

---
🎓 *Step 3/3: What is your university or legal contract framework?*`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

// Step 3 -> Completion
bot.callbackQuery(/^align:done:(.+):(.+):(.+)$/, async (ctx) => {
  const user = ctx.from;
  const cityKey = ctx.match[1] as CityKey;
  const disc = ctx.match[2] as DisciplineKey;
  const contract = ctx.match[3] as ContractKey;
  const cityName = CITIES[cityKey]?.city || 'Milan';

  await ctx.answerCallbackQuery();

  // Save / Update profile
  const profile = createProfile(
    user.id,
    user.username || '',
    user.first_name,
    disc,
    [contract],
    [cityName],
    [],
    [],
    '',
    '',
    'English',
    'any'
  );
  saveProfile(profile);

  const d = DISCIPLINES[disc];
  const c = CONTRACTS[contract];

  await ctx.editMessageText(
    `✅ *Search Alignment Completed Successfully!*

📊 *Active Candidate Profile:*
• *Target Location:* ${CITIES[cityKey]?.emoji || '📍'} ${cityName}
• *Target Track:* ${d?.emoji || '🎯'} ${d?.label}
• *Contract Framework:* ${c?.emoji || '🎓'} ${c?.label}
• *Language:* English-first international environment

Ready to discover your matches? 🚀`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('🔥 Discover Top Matches Now', 'cmd:matches')
        .row()
        .text('⚖️ Recalibrate / Align', 'cmd:align'),
    }
  );
});

// Alignment Sub-Menus (Recalibrate)
bot.callbackQuery('align:re_city', async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .text('🇮🇹 Milan', 'set:city:Milan').text('🇪🇸 Barcelona', 'set:city:Barcelona').row()
    .text('🇬🇧 London', 'set:city:London').text('🇩🇪 Berlin', 'set:city:Berlin').row()
    .text('🇳🇱 Amsterdam', 'set:city:Amsterdam').text('🇫🇷 Paris', 'set:city:Paris').row()
    .text('🏠 100% Remote', 'set:city:Remote').text('🌍 All Europe', 'set:city:Europe');

  await ctx.reply('📍 *Select your new primary target city:*', { parse_mode: 'Markdown', reply_markup: keyboard });
});

bot.callbackQuery(/^set:city:(.+)$/, async (ctx) => {
  const city = ctx.match[1];
  const profile = getProfile(ctx.from.id);
  if (profile) {
    profile.targetCities = [city];
    saveProfile(profile);
  }
  await ctx.answerCallbackQuery({ text: `📍 Location updated to ${city}!` });
  await ctx.reply(`✅ Target location updated to *${city}*. Tap /matches to view updated opportunities!`, {
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard().text('🔥 Find Matches', 'cmd:matches'),
  });
});

bot.callbackQuery('align:re_track', async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard();
  (Object.keys(DISCIPLINES) as DisciplineKey[]).forEach((key, i) => {
    const d = DISCIPLINES[key];
    keyboard.text(`${d.emoji} ${d.label}`, `set:track:${key}`);
    if (i % 2 === 1) keyboard.row();
  });
  await ctx.reply('🎯 *Select your new target track:*', { parse_mode: 'Markdown', reply_markup: keyboard });
});

bot.callbackQuery(/^set:track:(.+)$/, async (ctx) => {
  const disc = ctx.match[1] as DisciplineKey;
  const profile = getProfile(ctx.from.id);
  if (profile) {
    profile.discipline = disc;
    saveProfile(profile);
  }
  await ctx.answerCallbackQuery({ text: `🎯 Track updated to ${DISCIPLINES[disc]?.label}!` });
  await ctx.reply(`✅ Discipline updated to *${DISCIPLINES[disc]?.label}*. Tap /matches to view refreshed recommendations!`, {
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard().text('🔥 Find Matches', 'cmd:matches'),
  });
});

bot.callbackQuery('align:re_contract', async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .text('🇪🇺 Erasmus+ Traineeship', 'set:contract:erasmus').row()
    .text('🇮🇹 Stage Curriculare', 'set:contract:stage_curriculare').row()
    .text('🇪🇸 Convenio de Prácticas', 'set:contract:convenio').row()
    .text('🔓 Any / Placement', 'set:contract:any');

  await ctx.reply('🎓 *Select your contract requirement:*', { parse_mode: 'Markdown', reply_markup: keyboard });
});

bot.callbackQuery(/^set:contract:(.+)$/, async (ctx) => {
  const contract = ctx.match[1] as ContractKey;
  const profile = getProfile(ctx.from.id);
  if (profile) {
    profile.contractTypes = [contract];
    saveProfile(profile);
  }
  await ctx.answerCallbackQuery({ text: `🎓 Contract updated!` });
  await ctx.reply(`✅ Contract preference updated. Tap /matches to see updated listings!`, {
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard().text('🔥 Find Matches', 'cmd:matches'),
  });
});

// ── General Button Actions (Save, Skip, Applied, Matches) ───────────────────────

bot.callbackQuery(/^save:(.+)$/, async (ctx) => {
  markSaved(ctx.from.id, ctx.match[1]);
  await ctx.answerCallbackQuery({ text: '👍 Saved to bookmarks!' });
});

bot.callbackQuery(/^skip:(.+)$/, async (ctx) => {
  markDismissed(ctx.from.id, ctx.match[1]);
  await ctx.answerCallbackQuery({ text: '👎 Dismissed from future feeds' });
});

bot.callbackQuery(/^applied:(.+)$/, async (ctx) => {
  markApplied(ctx.from.id, ctx.match[1]);
  await ctx.answerCallbackQuery({ text: '💼 Marked as Applied! Good luck!' });
});

bot.callbackQuery('cmd:matches', async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = getProfile(ctx.from.id);
  if (!profile) {
    await ctx.reply('Run /start to align your profile first!');
    return;
  }
  const matches = getTopMatches(profile, 3);
  for (const job of matches) {
    await ctx.reply(formatJobCard(job), {
      parse_mode: 'Markdown',
      reply_markup: buildJobKeyboard(job),
    });
  }
});

bot.callbackQuery('cmd:more', async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = getProfile(ctx.from.id);
  if (!profile) return;
  const matches = getTopMatches(profile, 4, 3);
  for (const job of matches) {
    await ctx.reply(formatJobCard(job), {
      parse_mode: 'Markdown',
      reply_markup: buildJobKeyboard(job),
    });
  }
});

bot.callbackQuery('cmd:align', async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = getProfile(ctx.from.id);
  if (!profile) {
    await ctx.reply('Run /start to begin onboarding!');
    return;
  }
  const disc = DISCIPLINES[profile.discipline];
  const citiesStr = profile.targetCities?.join(', ') || 'Milan, Barcelona';

  const alignKeyboard = new InlineKeyboard()
    .text('📍 Change Cities', 'align:re_city')
    .text('🎯 Change Track', 'align:re_track')
    .row()
    .text('🎓 Change Contract', 'align:re_contract')
    .row()
    .text('🔥 Re-Run Matches Now', 'cmd:matches');

  await ctx.reply(
    `⚖️ *Search Alignment Diagnostic*

• *Track:* ${disc?.emoji || '🎯'} ${disc?.label || profile.discipline}
• *Target Cities:* 📍 ${citiesStr}
• *Contract:* 🎓 ${profile.contractTypes.map(c => CONTRACTS[c]?.label || c).join(', ')}

💡 *Select an item to recalibrate:*`,
    { parse_mode: 'Markdown', reply_markup: alignKeyboard }
  );
});

bot.callbackQuery('cmd:profile', async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = getProfile(ctx.from.id);
  if (!profile) { await ctx.reply('Run /start first!'); return; }
  const disc = DISCIPLINES[profile.discipline];
  const citiesStr = profile.targetCities?.join(', ') || 'Milan, Barcelona';

  await ctx.reply(
    `👤 *Your Search Profile:*

🎯 *Discipline:* ${disc?.emoji || '🎨'} ${disc?.label || profile.discipline}
📍 *Cities:* ${citiesStr}
🎓 *Contract:* ${profile.contractTypes.map(c => CONTRACTS[c]?.label || c).join(', ')}

📊 *Activity:*
• *Saved:* ${profile.savedIds.length}
• *Applied:* ${profile.appliedIds.length}
• *Dismissed:* ${profile.dismissedIds.length}`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('⚖️ Recalibrate / Align', 'cmd:align')
        .text('🔥 Find Matches', 'cmd:matches'),
    }
  );
});

bot.callbackQuery('cmd:saved', async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = getProfile(ctx.from.id);
  if (!profile || profile.savedIds.length === 0) {
    await ctx.reply('No saved jobs yet. Tap 👍 on any card to save it!');
    return;
  }
  const jobs = searchJobs('', profile, 100);
  const saved = jobs.filter(j => profile.savedIds.includes(j.id)).slice(0, 3);
  for (const job of saved) {
    await ctx.reply(formatJobCard(job), {
      parse_mode: 'Markdown',
      reply_markup: buildJobKeyboard(job),
    });
  }
});

bot.callbackQuery('cmd:applied', async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = getProfile(ctx.from.id);
  if (!profile || profile.appliedIds.length === 0) {
    await ctx.reply('No applied jobs tracked yet. Tap 💼 on a card when you submit an application!');
    return;
  }
  await ctx.reply(`💼 You have applied to *${profile.appliedIds.length}* job(s)!`, { parse_mode: 'Markdown' });
});

bot.callbackQuery('cmd:search_hint', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `🔍 *How to search:*
Type: \`/find <role> in <city>\`

*Examples:*
• \`/find growth marketing in milan\`
• \`/find product designer in barcelona\`
• \`/find software intern remote\``,
    { parse_mode: 'Markdown' }
  );
});

// ── Free-Text Natural Language -> Paseo AGY Bridge ─────────────────────────────

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  const convId = loadConvId();
  const convFlag = convId ? `--conversation ${convId}` : '--continue';
  const safePrompt = text.replace(/'/g, "'\\''");
  const cmd = `${AGY_BIN} --print '${safePrompt}' ${convFlag} --dangerously-skip-permissions`;

  await ctx.reply('⚡ *Analyzing query and searching opportunities...*', { parse_mode: 'Markdown' });

  try {
    const { stdout } = await execAsync(cmd, {
      cwd: WORKSPACE,
      timeout: 5 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    const reply = (stdout || '').trim() || '_(no response)_';
    await ctx.reply(reply.slice(0, 4096));
  } catch (e: any) {
    const partial = (e.stdout || '').trim();
    await ctx.reply(partial || `Error: ${e.message}`);
  }
});

// ── Register Commands with BotFather ──────────────────────────────────────────

bot.api.setMyCommands([
  { command: 'start', description: 'Interactive Search Alignment Onboarding' },
  { command: 'align', description: 'Recalibrate / align search parameters' },
  { command: 'matches', description: 'Get top personalized internship matches' },
  { command: 'find', description: 'Search by keyword (e.g. /find marketing in milan)' },
  { command: 'profile', description: 'View your profile and alignment' },
  { command: 'saved', description: 'List saved / bookmarked roles' },
  { command: 'applied', description: 'Application tracker' },
  { command: 'help', description: 'Command directory' },
]);

// ── Start Listener ────────────────────────────────────────────────────────────

bot.start({
  onStart: (info) => {
    console.log(`\n🤖 @${info.username} is LIVE with Deep Alignment Onboarding!`);
    console.log(`📁 Workspace: ${WORKSPACE}`);
    console.log(`🧠 Bridge conversation: ${loadConvId() ?? 'none'}`);
    console.log(`👥 Allowed Telegram IDs: ${ALLOWED_IDS.join(', ') || 'all'}`);
    console.log(`✅ Commands: /start /align /matches /find /profile /saved /applied /help\n`);
  },
});
