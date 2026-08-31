#!/usr/bin/env node
/**
 * bot.ts — Unified multi-profile Telegram bot
 *
 * Commands:
 *   /start    — onboarding wizard or welcome back menu
 *   /profile  — view & edit your job-search profile
 *   /matches  — run personalised job matching for your profile
 *   /find     — search jobs by keyword  (e.g. /find product designer)
 *   /saved    — list jobs you liked
 *   /applied  — list jobs you marked as applied
 *   /help     — show all commands
 *
 * Free-text messages → forwarded to agy via paseo bridge conversation
 */

import { Bot, InlineKeyboard, session } from 'grammy';
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
import { DISCIPLINES, CONTRACTS, LOCATIONS, type DisciplineKey, type ContractKey, type LocationKey } from './store/types.js';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
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

function jobCard(job: { company: string; title: string; location: string; contract: string; applyUrl: string; tailoredScore: number; id: string }): string {
  return `🔥 *${job.tailoredScore}% Match*\n🏢 *${job.company}*\n🎨 ${job.title}\n📍 ${job.location}\n🎓 ${job.contract}`;
}

function jobKeyboard(job: { id: string; applyUrl: string }): InlineKeyboard {
  return new InlineKeyboard()
    .url('🔗 Apply', job.applyUrl)
    .row()
    .text('👍 Save', `save:${job.id}`)
    .text('👎 Skip', `skip:${job.id}`)
    .text('💼 Applied', `applied:${job.id}`);
}

// ── Auth middleware ────────────────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  if (ctx.from && !isAllowed(ctx.from.id)) {
    await ctx.reply('⛔ You are not authorised to use this bot.');
    return;
  }
  return next();
});

// ── /start ────────────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const user = ctx.from!;
  const profile = getProfile(user.id);

  if (profile) {
    const disc = DISCIPLINES[profile.discipline];
    const menu = new InlineKeyboard()
      .text('🎯 My Matches', 'cmd:matches')
      .text('⚙️ My Profile', 'cmd:profile')
      .row()
      .text('🔍 Search Jobs', 'cmd:search')
      .text('📋 Applied', 'cmd:applied');

    await ctx.reply(
      `👋 Welcome back, *${profile.firstName}*!\n\n` +
      `${disc.emoji} *Discipline:* ${disc.label}\n` +
      `📍 *Looking in:* ${LOCATIONS[profile.targetLocation].label}\n` +
      `🎓 *Contract:* ${profile.contractTypes.map(c => CONTRACTS[c].label).join(' / ')}\n\n` +
      `What do you want to do?`,
      { parse_mode: 'Markdown', reply_markup: menu }
    );
    return;
  }

  // New user — start onboarding
  const keyboard = new InlineKeyboard();
  const discKeys = Object.keys(DISCIPLINES) as DisciplineKey[];
  discKeys.forEach((key, i) => {
    const d = DISCIPLINES[key];
    keyboard.text(`${d.emoji} ${d.label}`, `onboard:disc:${key}`);
    if (i % 2 === 1) keyboard.row();
  });

  await ctx.reply(
    `👋 *Hola ${user.first_name}! Welcome to Barcelona Internship Radar* 🚀\n\n` +
    `I match real internship listings from 423+ verified Barcelona & European companies directly to your profile.\n\n` +
    `*Let\'s set up your search profile in 3 steps.*\n\n` +
    `👇 *What\'s your main discipline?*`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

// ── /help ─────────────────────────────────────────────────────────────────────

bot.command('help', async (ctx) => {
  await ctx.reply(
    `*Available Commands:*\n\n` +
    `/start — Set up or view your profile\n` +
    `/matches — Get your top personalised job matches\n` +
    `/find <keyword> — Search by keyword (e.g. \`/find product designer\`)\n` +
    `/profile — View & edit your job-search profile\n` +
    `/saved — Jobs you liked\n` +
    `/applied — Jobs you marked as applied\n` +
    `/help — This message\n\n` +
    `💬 Or just *type anything* — I\'ll pass it to the AI agent!`,
    { parse_mode: 'Markdown' }
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

  await ctx.reply(`🔍 Finding your top matches for *${DISCIPLINES[profile.discipline].label}*...`, { parse_mode: 'Markdown' });

  const matches = getTopMatches(profile, 3);
  if (matches.length === 0) {
    await ctx.reply('No matches found. Try widening your location or contract preferences with /profile');
    return;
  }

  for (const job of matches) {
    await ctx.reply(jobCard(job), {
      parse_mode: 'Markdown',
      reply_markup: jobKeyboard(job),
    });
  }

  await ctx.reply('Want to see more? Use /matches again or try /find <keyword>.', {
    reply_markup: new InlineKeyboard().text('5 More Matches →', 'cmd:more'),
  });
});

// ── /find ─────────────────────────────────────────────────────────────────────

bot.command('find', async (ctx) => {
  const user = ctx.from!;
  const query = ctx.match?.trim();

  if (!query) {
    await ctx.reply('Usage: /find <keyword>\nExample: /find product designer\nExample: /find marketing intern barcelona');
    return;
  }

  const profile = getProfile(user.id);
  await ctx.reply(`🔍 Searching for "*${query}*"...`, { parse_mode: 'Markdown' });

  const results = searchJobs(query, profile, 5);
  if (results.length === 0) {
    await ctx.reply(`No results for "${query}". Try a different keyword.`);
    return;
  }

  await ctx.reply(`Found ${results.length} results for "${query}":`);
  for (const job of results) {
    await ctx.reply(jobCard(job), {
      parse_mode: 'Markdown',
      reply_markup: jobKeyboard(job),
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
  const loc = LOCATIONS[profile.targetLocation];

  const keyboard = new InlineKeyboard()
    .text('🎯 Change Discipline', 'edit:discipline')
    .row()
    .text('📍 Change Location', 'edit:location')
    .text('🎓 Change Contract', 'edit:contract')
    .row()
    .text('🛠️ Edit Skills', 'edit:skills');

  await ctx.reply(
    `*Your Profile:*\n\n` +
    `👤 *Name:* ${profile.firstName}\n` +
    `🎯 *Discipline:* ${disc.emoji} ${disc.label}\n` +
    `📍 *Location:* ${loc.emoji} ${loc.label}\n` +
    `🎓 *Contract:* ${profile.contractTypes.map(c => `${CONTRACTS[c].emoji} ${CONTRACTS[c].label}`).join(', ')}\n` +
    `🛠️ *Skills:* ${profile.skills.length > 0 ? profile.skills.join(', ') : 'None set'}\n` +
    `🎓 *University:* ${profile.university || 'Not set'}\n\n` +
    `📊 *Activity:*\n` +
    `  • ${profile.savedIds.length} saved\n` +
    `  • ${profile.appliedIds.length} applied\n` +
    `  • ${profile.dismissedIds.length} skipped`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

// ── /saved ────────────────────────────────────────────────────────────────────

bot.command('saved', async (ctx) => {
  const user = ctx.from!;
  const profile = getProfile(user.id);

  if (!profile || profile.savedIds.length === 0) {
    await ctx.reply('No saved jobs yet. Use 👍 on a match to save it!');
    return;
  }

  await ctx.reply(`📋 *Your Saved Jobs (${profile.savedIds.length}):*`, { parse_mode: 'Markdown' });
  const jobs = searchJobs('', profile, 100);
  const saved = jobs.filter(j => profile.savedIds.includes(j.id)).slice(0, 5);

  for (const job of saved) {
    await ctx.reply(jobCard(job), {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().url('🔗 Apply', job.applyUrl),
    });
  }
});

// ── /applied ──────────────────────────────────────────────────────────────────

bot.command('applied', async (ctx) => {
  const user = ctx.from!;
  const profile = getProfile(user.id);

  if (!profile || profile.appliedIds.length === 0) {
    await ctx.reply('No applied jobs yet. Use 💼 on a match to mark it!');
    return;
  }

  await ctx.reply(
    `💼 *You\'ve applied to ${profile.appliedIds.length} job(s).*\n\nKeep going — consistency is key! 🚀`,
    { parse_mode: 'Markdown' }
  );
});

// ── Onboarding callbacks ───────────────────────────────────────────────────────

bot.callbackQuery(/^onboard:disc:(.+)$/, async (ctx) => {
  const user = ctx.from;
  const disc = ctx.match[1] as DisciplineKey;
  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard()
    .text('🇪🇺 Erasmus+ Traineeship', `onboard:contract:${disc}:erasmus`)
    .row()
    .text('🇪🇸 Convenio de Prácticas', `onboard:contract:${disc}:convenio`)
    .row()
    .text('🔓 Any Contract Type', `onboard:contract:${disc}:any`);

  await ctx.editMessageText(
    `${DISCIPLINES[disc].emoji} *${DISCIPLINES[disc].label}* — great choice!\n\n🎓 *What type of internship contract do you need?*`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

bot.callbackQuery(/^onboard:contract:(.+):(.+)$/, async (ctx) => {
  const user = ctx.from;
  const disc = ctx.match[1] as DisciplineKey;
  const contract = ctx.match[2] as ContractKey;
  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard()
    .text('📌 Barcelona Only', `onboard:loc:${disc}:${contract}:barcelona`)
    .row()
    .text('🇪🇸 Anywhere in Spain', `onboard:loc:${disc}:${contract}:spain`)
    .row()
    .text('🌍 All of Europe', `onboard:loc:${disc}:${contract}:europe`);

  await ctx.editMessageText(
    `${CONTRACTS[contract].emoji} *${CONTRACTS[contract].label}* — noted!\n\n📍 *Where are you looking?*`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

bot.callbackQuery(/^onboard:loc:(.+):(.+):(.+)$/, async (ctx) => {
  const user = ctx.from;
  const disc = ctx.match[1] as DisciplineKey;
  const contract = ctx.match[2] as ContractKey;
  const loc = ctx.match[3] as LocationKey;
  await ctx.answerCallbackQuery();

  // Save profile
  const profile = createProfile(
    user.id,
    user.username ?? '',
    user.first_name,
    disc,
    [contract],
    loc,
  );
  saveProfile(profile);

  const d = DISCIPLINES[disc];
  const c = CONTRACTS[contract];
  const l = LOCATIONS[loc];

  await ctx.editMessageText(
    `✅ *Profile Created!*\n\n` +
    `👤 *Name:* ${user.first_name}\n` +
    `${d.emoji} *Discipline:* ${d.label}\n` +
    `${c.emoji} *Contract:* ${c.label}\n` +
    `${l.emoji} *Location:* ${l.label}\n\n` +
    `Ready to find your internship? 🚀`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('🎯 Find My Matches Now!', 'cmd:matches')
        .row()
        .text('✏️ Edit Profile', 'cmd:profile'),
    }
  );
});

// ── Button callbacks (save / skip / applied / menu) ───────────────────────────

bot.callbackQuery(/^save:(.+)$/, async (ctx) => {
  markSaved(ctx.from.id, ctx.match[1]);
  await ctx.answerCallbackQuery({ text: '👍 Saved!' });
});

bot.callbackQuery(/^skip:(.+)$/, async (ctx) => {
  markDismissed(ctx.from.id, ctx.match[1]);
  await ctx.answerCallbackQuery({ text: '👎 Skipped' });
});

bot.callbackQuery(/^applied:(.+)$/, async (ctx) => {
  markApplied(ctx.from.id, ctx.match[1]);
  await ctx.answerCallbackQuery({ text: '💼 Marked as Applied! Good luck!' });
});

bot.callbackQuery('cmd:matches', async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = getProfile(ctx.from.id);
  if (!profile) { await ctx.reply('Run /start first!'); return; }
  const matches = getTopMatches(profile, 3);
  for (const job of matches) {
    await ctx.reply(jobCard(job), { parse_mode: 'Markdown', reply_markup: jobKeyboard(job) });
  }
});

bot.callbackQuery('cmd:more', async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = getProfile(ctx.from.id);
  if (!profile) return;
  const matches = getTopMatches(profile, 5, 5);
  for (const job of matches) {
    await ctx.reply(jobCard(job), { parse_mode: 'Markdown', reply_markup: jobKeyboard(job) });
  }
});

bot.callbackQuery('cmd:profile', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.message = ctx.callbackQuery.message as any;
  const profile = getProfile(ctx.from.id);
  if (!profile) { await ctx.reply('Run /start first!'); return; }
  const disc = DISCIPLINES[profile.discipline];
  const loc = LOCATIONS[profile.targetLocation];
  await ctx.reply(
    `*Your Profile:*\n${disc.emoji} ${disc.label}\n📍 ${loc.label}\n🎓 ${profile.contractTypes.map(c => CONTRACTS[c].label).join(', ')}\n🛠️ ${profile.skills.join(', ') || 'No skills set'}`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('🎯 Re-run Onboarding', 'cmd:reonboard')
        .text('🎯 Find Matches', 'cmd:matches'),
    }
  );
});

bot.callbackQuery('cmd:reonboard', async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard();
  const discKeys = Object.keys(DISCIPLINES) as DisciplineKey[];
  discKeys.forEach((key, i) => {
    const d = DISCIPLINES[key];
    keyboard.text(`${d.emoji} ${d.label}`, `onboard:disc:${key}`);
    if (i % 2 === 1) keyboard.row();
  });
  await ctx.reply('👇 Choose your discipline:', { reply_markup: keyboard });
});

// Edit profile callbacks
bot.callbackQuery('edit:discipline', async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard();
  (Object.keys(DISCIPLINES) as DisciplineKey[]).forEach((key, i) => {
    const d = DISCIPLINES[key];
    keyboard.text(`${d.emoji} ${d.label}`, `set:disc:${key}`);
    if (i % 2 === 1) keyboard.row();
  });
  await ctx.reply('Choose new discipline:', { reply_markup: keyboard });
});

bot.callbackQuery(/^set:disc:(.+)$/, async (ctx) => {
  const disc = ctx.match[1] as DisciplineKey;
  const profile = getProfile(ctx.from.id);
  if (profile) { profile.discipline = disc; saveProfile(profile); }
  await ctx.answerCallbackQuery({ text: `Discipline updated to ${DISCIPLINES[disc].label}!` });
});

bot.callbackQuery('edit:location', async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .text('📌 Barcelona Only', 'set:loc:barcelona').row()
    .text('🇪🇸 Anywhere in Spain', 'set:loc:spain').row()
    .text('🌍 All of Europe', 'set:loc:europe');
  await ctx.reply('Choose new location preference:', { reply_markup: keyboard });
});

bot.callbackQuery(/^set:loc:(.+)$/, async (ctx) => {
  const loc = ctx.match[1] as LocationKey;
  const profile = getProfile(ctx.from.id);
  if (profile) { profile.targetLocation = loc; saveProfile(profile); }
  await ctx.answerCallbackQuery({ text: `Location updated to ${LOCATIONS[loc].label}!` });
});

bot.callbackQuery('edit:contract', async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .text('🇪🇺 Erasmus+ Traineeship', 'set:contract:erasmus').row()
    .text('🇪🇸 Convenio de Prácticas', 'set:contract:convenio').row()
    .text('🔓 Any Contract', 'set:contract:any');
  await ctx.reply('Choose contract preference:', { reply_markup: keyboard });
});

bot.callbackQuery(/^set:contract:(.+)$/, async (ctx) => {
  const contract = ctx.match[1] as ContractKey;
  const profile = getProfile(ctx.from.id);
  if (profile) { profile.contractTypes = [contract]; saveProfile(profile); }
  await ctx.answerCallbackQuery({ text: `Contract updated!` });
});

bot.callbackQuery('edit:skills', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('Type your skills separated by commas:\nExample: Figma, Python, Excel, Design Systems');
});

// ── Free-text → AGY bridge ────────────────────────────────────────────────────

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return; // handled by commands

  const convId = loadConvId();
  const convFlag = convId ? `--conversation ${convId}` : '--continue';
  const safePrompt = text.replace(/'/g, "'\\''");
  const cmd = `${AGY_BIN} --print '${safePrompt}' ${convFlag} --dangerously-skip-permissions`;

  await ctx.reply('⚡ Thinking...');

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

// ── Register commands with BotFather ─────────────────────────────────────────

bot.api.setMyCommands([
  { command: 'start', description: 'Set up or view your profile' },
  { command: 'matches', description: 'Get your personalised job matches' },
  { command: 'find', description: 'Search jobs by keyword' },
  { command: 'profile', description: 'View & edit your job-search profile' },
  { command: 'saved', description: 'Jobs you liked' },
  { command: 'applied', description: 'Jobs you marked as applied' },
  { command: 'help', description: 'Show all commands' },
]);

// ── Start ─────────────────────────────────────────────────────────────────────

bot.start({
  onStart: (info) => {
    console.log(`\n🤖 @${info.username} is LIVE`);
    console.log(`📁 Workspace: ${WORKSPACE}`);
    console.log(`🧠 Bridge conv: ${loadConvId() ?? 'none (set up bridge first)'}`);
    console.log(`👥 Allowed IDs: ${ALLOWED_IDS.join(', ') || 'all'}`);
    console.log(`\n✅ Commands: /start /matches /find /profile /saved /applied /help\n`);
  },
});
