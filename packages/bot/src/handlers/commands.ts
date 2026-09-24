import { type Context } from 'grammy';
import { db, users, jobs, companies, userJobInteractions, eq, and, desc, count, ilike, or } from '@bcn-intern-bot/db';
import { searchOnDemand } from '../services/on-demand-search.js';

export async function handleProfile(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
  if (!telegramId) return;

  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });

  if (!user) {
    await ctx.reply('⚠️ Profile not found. Please upload your CV (PDF) or type /start.');
    return;
  }

  const profile = user.profile;
  const preferences = user.preferences;

  const rolesText = profile.targetRoles.map((r) => `• ${r}`).join('\n') || '• Not configured';
  const skillsText = profile.skills.join(', ') || 'Not configured';
  const locationsText = profile.preferredLocations.join(', ') || 'Any location';
  const contractsText = profile.contractTypes?.join(', ') || 'Any contract';
  const threshold = Math.round((preferences?.minScoreThreshold ?? 0.65) * 100);

  const message = `👤 *Your Candidate Profile:*

*Name:* ${user.fullName || 'Candidate'}
*Remote Preference:* ${profile.remotePreference.toUpperCase()}
*Locations:* ${locationsText}
*Contracts:* ${contractsText}
*Min Match Score:* ${threshold}%

🎯 *Target Roles:*
${rolesText}

🛠 *Skills & Tools:*
${skillsText}

💡 *AI Bio / Summary:*
_${profile.bio || 'Not provided'}_

---
_To update your skills or target roles, simply send an updated CV (PDF) to this chat._`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
}

export async function handleSetup(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
  if (!telegramId) return;

  const user = await db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
  if (!user) {
    await ctx.reply('⚠️ Prima invia /start per creare il tuo profilo JobFinder.');
    return;
  }

  const raw = typeof ctx.match === 'string' ? ctx.match.trim() : '';
  const segments = raw.split('|').map((segment) => segment.trim());
  if (segments.length < 2 || !segments[0] || !segments[1]) {
    await ctx.reply(
      '⚙️ *Formato setup:*\n`/setup <ruoli> | <località> | <modalità> | <contratti> | <lingue>`\n\n*Esempio:*\n`/setup product design intern | Milano, Berlino, Remote | hybrid | Erasmus+, Convenio | Italiano, English`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const list = (value: string | undefined) =>
    (value || '').split(',').map((item) => item.trim()).filter(Boolean);
  const remotePreference = ['remote', 'hybrid', 'onsite', 'any'].includes((segments[2] || '').toLowerCase())
    ? (segments[2]!.toLowerCase() as 'remote' | 'hybrid' | 'onsite' | 'any')
    : user.profile.remotePreference;

  const nextProfile = {
    ...user.profile,
    targetRoles: list(segments[0]),
    preferredLocations: list(segments[1]),
    remotePreference,
    contractTypes: list(segments[3]),
    languages: list(segments[4]),
  };

  await db.update(users).set({ profile: nextProfile, updatedAt: new Date() }).where(eq(users.id, user.id));

  await ctx.reply(
    `✅ *Profilo JobFinder aggiornato*\n\n🎯 *Ruoli:* ${nextProfile.targetRoles.join(', ')}\n📍 *Località:* ${nextProfile.preferredLocations.join(', ')}\n🏢 *Modalità:* ${nextProfile.remotePreference}\n🎓 *Contratti:* ${nextProfile.contractTypes.join(', ') || 'Any'}\n🌐 *Lingue:* ${nextProfile.languages.join(', ') || 'Not specified'}\n\n💡 Invia il CV in PDF per aggiungere skill e una sintesi professionale.`,
    { parse_mode: 'Markdown' }
  );
}

export async function handleSearch(ctx: Context): Promise<void> {
  const query = typeof ctx.match === 'string' ? ctx.match.trim() : '';
  if (!query) {
    await ctx.reply(
      '🔍 *Formato ricerca:*\n`/search <ruolo, skill o località>`\n\n*Esempi:*\n• `/search product design intern`\n• `/search marketing Milano`\n• `/search remote data analyst`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await ctx.reply('🔎 *Cerco ora su più fonti ATS…*', { parse_mode: 'Markdown' });
  let results;
  try {
    results = await searchOnDemand(query);
  } catch (error) {
    console.error('[JobFinder] On-demand search failed', error);
    await ctx.reply('⚠️ La ricerca sulle fonti ATS non è disponibile in questo momento. Riprova tra poco.');
    return;
  }

  if (results.length === 0) {
    await ctx.reply(`🔍 Nessuna opportunità attiva trovata per *${query}*. Prova termini più brevi o una località diversa.`, {
      parse_mode: 'Markdown',
    });
    return;
  }

  const uniqueResults = Array.from(new Map(results.map((job) => [job.url, job])).values()).slice(0, 8);
  const lines = uniqueResults.map((job, index) => {
    return `${index + 1}. *${job.company}* — ${job.title}\n📍 ${job.location}\n🔗 ${job.url}`;
  });

  await ctx.reply(`🔍 *${uniqueResults.length} risultati da più fonti per "${query}"*\n\n${lines.join('\n\n')}`, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
  });
}

export async function handleMatches(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
  if (!telegramId) return;

  const user = await db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
  if (!user) {
    await ctx.reply('⚠️ Prima invia /start per creare il tuo profilo JobFinder.');
    return;
  }

  const matches = await db.query.userJobInteractions.findMany({
    where: and(eq(userJobInteractions.userId, user.id), eq(userJobInteractions.status, 'notified')),
    with: { job: { with: { company: true } } },
    orderBy: [desc(userJobInteractions.matchScore)],
    limit: 5,
  });

  if (matches.length === 0) {
    await ctx.reply(
      '🎯 *Nessun match pronto al momento.*\n\nConfigura il profilo con `/setup`, carica il CV se vuoi, e JobFinder ti notificherà le nuove opportunità compatibili.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const lines = matches.map((interaction, index) => {
    const job = interaction.job;
    const company = job.company?.name || 'Unknown company';
    const score = Math.round(interaction.matchScore * 100);
    return `${index + 1}. *${score}%* — *${company}* — ${job.title}\n📍 ${job.normalizedLocation || job.locationRaw || 'Unknown location'}\n🔗 ${job.url}`;
  });

  await ctx.reply(`🎯 *I tuoi match JobFinder*\n\n${lines.join('\n\n')}`, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
  });
}

export async function handleMyApplications(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
  if (!telegramId) return;

  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });

  if (!user) {
    await ctx.reply('⚠️ Profile not found. Please type /start.');
    return;
  }

  const applications = await db.query.userJobInteractions.findMany({
    where: and(
      eq(userJobInteractions.userId, user.id),
      eq(userJobInteractions.status, 'applied')
    ),
    with: {
      job: {
        with: {
          company: true,
        },
      },
    },
    orderBy: [desc(userJobInteractions.appliedAt)],
    limit: 20,
  });

  if (applications.length === 0) {
    await ctx.reply(
      '💼 *No Applications Tracked Yet*\n\nWhen you see a job alert, click *[💼 Mark Applied]* to track your application status here.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  let text = `💼 *Your Tracked Applications (${applications.length}):*\n\n`;

  for (const app of applications) {
    const job = app.job;
    const company = job.company?.name || 'Unknown company';
    const date = app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : 'Recently';

    text += `✅ *${job.title}*\n🏢 *${company}* | 📅 Applied: ${date}\n🔗 [View Posting](${job.url})\n\n`;
  }

  await ctx.reply(text, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
}

export async function handleStats(ctx: Context): Promise<void> {
  const [totalCompaniesRes] = await db.select({ value: count() }).from(companies);
  const [totalJobsRes] = await db.select({ value: count() }).from(jobs);
  const [totalInteractionsRes] = await db.select({ value: count() }).from(userJobInteractions);

  const statsMessage = `📊 *JobFinder — System Statistics*

🏢 *Monitored Companies:* ${totalCompaniesRes?.value ?? 0}
📦 *Total Job Postings Indexed:* ${totalJobsRes?.value ?? 0}
🎯 *Candidate Matches Evaluated:* ${totalInteractionsRes?.value ?? 0}
⏱ *Ricerca:* solo su richiesta utente
🌐 *ATS Coverage:* fonti configurate in ATS Scrapers`;

  await ctx.reply(statsMessage, { parse_mode: 'Markdown' });
}

export async function handleAddCompany(ctx: Context): Promise<void> {
  const text = ctx.message?.text?.trim() || '';
  const parts = text.split(/\s+/).slice(1);

  if (parts.length < 3) {
    await ctx.reply(
      'ℹ️ *Usage:* `/add_company <name> <slug> <ats_provider>`\n\n*Providers:* `greenhouse`, `lever`, `ashby`, `teamtailor`, `factorial`, `workable`\n*Example:* `/add_company Typeform typeform greenhouse`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const [name, slug, atsProvider] = parts;
  const validProviders = [
    'greenhouse',
    'lever',
    'ashby',
    'teamtailor',
    'factorial',
    'workable',
    'smartrecruiters',
    'custom',
    'other',
  ];

  if (!validProviders.includes(atsProvider!.toLowerCase())) {
    await ctx.reply(
      `❌ Invalid ATS provider "${atsProvider}". Must be one of: ${validProviders.join(', ')}`
    );
    return;
  }

  try {
    await db.insert(companies).values({
      name: name!,
      slug: slug!.toLowerCase(),
      atsProvider: atsProvider!.toLowerCase() as any,
      atsIdentifier: slug!.toLowerCase(),
      location: 'Unknown location',
      isBarcelonaHq: false,
      hasBarcelonaOffice: false,
      tier: 2,
    });

    await ctx.reply(
      `✅ *Successfully registered company:* **${name}** (${slug}) on **${atsProvider}**!\nSarà interrogata solo in una ricerca esplicita.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err: any) {
    await ctx.reply(`❌ Failed to add company: ${err.message}`);
  }
}
