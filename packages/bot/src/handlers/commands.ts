import { type Context } from 'grammy';
import { db, users, jobs, companies, userJobInteractions, eq, and, desc, count } from '@bcn-intern-bot/db';

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

  const rolesText = profile.targetRoles.map((r) => `• ${r}`).join('\n');
  const skillsText = profile.skills.join(', ');
  const locationsText = profile.preferredLocations.join(', ');
  const threshold = Math.round((preferences?.minScoreThreshold ?? 0.65) * 100);

  const message = `👤 *Your Candidate Profile:*

*Name:* ${user.fullName || 'Candidate'}
*Remote Preference:* ${profile.remotePreference.toUpperCase()}
*Locations:* ${locationsText}
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
    const company = job.company?.name || 'Barcelona Tech';
    const date = app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : 'Recently';

    text += `✅ *${job.title}*\n🏢 *${company}* | 📅 Applied: ${date}\n🔗 [View Posting](${job.url})\n\n`;
  }

  await ctx.reply(text, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
}

export async function handleStats(ctx: Context): Promise<void> {
  const [totalCompaniesRes] = await db.select({ value: count() }).from(companies);
  const [totalJobsRes] = await db.select({ value: count() }).from(jobs);
  const [totalInteractionsRes] = await db.select({ value: count() }).from(userJobInteractions);

  const statsMessage = `📊 *Barcelona Internship Discovery Bot — System Statistics*

🏢 *Monitored Companies:* ${totalCompaniesRes?.value ?? 0}
📦 *Total Job Postings Indexed:* ${totalJobsRes?.value ?? 0}
🎯 *Candidate Matches Evaluated:* ${totalInteractionsRes?.value ?? 0}
⏱ *Crawl Frequency:* Every 2.5 hours
🌐 *ATS Coverage:* Greenhouse, Lever, Ashby, Teamtailor, Factorial, Workable`;

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
      location: 'Barcelona, Spain',
      isBarcelonaHq: true,
      hasBarcelonaOffice: true,
      tier: 2,
    });

    await ctx.reply(
      `✅ *Successfully registered company:* **${name}** (${slug}) on **${atsProvider}**!\nIt will be included in the next crawl cycle.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err: any) {
    await ctx.reply(`❌ Failed to add company: ${err.message}`);
  }
}
