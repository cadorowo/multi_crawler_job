import { type Context } from 'grammy';
import { db, jobs, companies, userJobInteractions, users, eq, and } from '@bcn-intern-bot/db';
import { createAlertCard, createDeepBreakdownCard } from '../cards.js';

export async function handleActionCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const [action, jobId] = data.split(':');
  if (!action || !jobId) return;

  const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
  if (!telegramId) return;

  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });

  if (!user) {
    await ctx.answerCallbackQuery({ text: 'User profile not found. Please send /start.' });
    return;
  }

  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, jobId),
    with: {
      company: true,
    },
  });

  if (!job) {
    await ctx.answerCallbackQuery({ text: 'Job posting no longer exists.' });
    return;
  }

  const interaction = await db.query.userJobInteractions.findFirst({
    where: and(
      eq(userJobInteractions.userId, user.id),
      eq(userJobInteractions.jobId, job.id)
    ),
  });

  switch (action) {
    case 'deep_breakdown': {
      await ctx.answerCallbackQuery();
      const analysis = interaction?.matchAnalysis;

      const { text, keyboard } = createDeepBreakdownCard({
        jobId: job.id,
        title: job.title,
        companyName: job.company?.name || 'Unknown company',
        location: job.normalizedLocation || 'Unknown location',
        score: Math.round((interaction?.matchScore ?? 0.75) * 100),
        domainFit: job.department || 'Tech & Design',
        isUniversity: true,
        acceptsErasmus: true,
        language: job.languages?.[0] || 'English',
        matchingTools: analysis?.matchingSkills || job.skills || [],
        missingTools: analysis?.missingSkills || [],
        keyTasks: analysis?.pros?.length ? analysis.pros : job.requirements || [],
        fitReasoning:
          analysis?.recommendationExplanation ||
          job.summary ||
          'Great role aligning with your skillset and target profile.',
        companyDistrict: job.company?.location || 'Unknown location',
        companyTier: job.company?.tier || 1,
        salaryRaw: job.salary?.raw,
        applyUrl: job.url,
        isApplied: interaction?.status === 'applied',
      });

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
      break;
    }

    case 'back_to_summary': {
      await ctx.answerCallbackQuery();
      const { text, keyboard } = createAlertCard({
        jobId: job.id,
        title: job.title,
        companyName: job.company?.name || 'Unknown company',
        location: job.normalizedLocation || 'Unknown location',
        workplaceType: job.workplaceType || 'hybrid',
        score: Math.round((interaction?.matchScore ?? 0.75) * 100),
        domainFit: job.department || 'Tech & Design',
        isUniversity: true,
        acceptsErasmus: true,
        language: job.languages?.[0] || 'English',
        keyTasks: job.requirements || [],
        matchingTools: job.skills || [],
        summary: job.summary || 'Relevant internship opportunity matching your profile.',
        applyUrl: job.url,
        isApplied: interaction?.status === 'applied',
        appliedDate: interaction?.appliedAt ? new Date(interaction.appliedAt).toLocaleDateString() : undefined,
      });

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
      break;
    }

    case 'applied': {
      const now = new Date();

      if (interaction) {
        await db
          .update(userJobInteractions)
          .set({
            status: 'applied',
            appliedAt: now,
            updatedAt: now,
          })
          .where(eq(userJobInteractions.id, interaction.id));
      } else {
        await db.insert(userJobInteractions).values({
          userId: user.id,
          jobId: job.id,
          status: 'applied',
          appliedAt: now,
        });
      }

      await ctx.answerCallbackQuery({
        text: '🎉 Application recorded! View in /my_applications.',
        show_alert: true,
      });

      // Update Card to show Applied status
      const { text, keyboard } = createAlertCard({
        jobId: job.id,
        title: job.title,
        companyName: job.company?.name || 'Unknown company',
        location: job.normalizedLocation || 'Unknown location',
        workplaceType: job.workplaceType || 'hybrid',
        score: Math.round((interaction?.matchScore ?? 0.75) * 100),
        domainFit: job.department || 'Tech & Design',
        isUniversity: true,
        acceptsErasmus: true,
        language: job.languages?.[0] || 'English',
        keyTasks: job.requirements || [],
        matchingTools: job.skills || [],
        summary: job.summary || 'Relevant internship opportunity matching your profile.',
        applyUrl: job.url,
        isApplied: true,
        appliedDate: now.toLocaleDateString(),
      });

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
      break;
    }

    case 'thumbs_up': {
      if (interaction) {
        await db
          .update(userJobInteractions)
          .set({
            userFeedback: 'thumbs_up',
            updatedAt: new Date(),
          })
          .where(eq(userJobInteractions.id, interaction.id));
      }
      await ctx.answerCallbackQuery({
        text: '👍 Thanks! We will prioritize similar roles.',
      });
      break;
    }

    case 'thumbs_down': {
      if (interaction) {
        await db
          .update(userJobInteractions)
          .set({
            userFeedback: 'thumbs_down',
            status: 'dismissed',
            updatedAt: new Date(),
          })
          .where(eq(userJobInteractions.id, interaction.id));
      }
      await ctx.answerCallbackQuery({
        text: '👎 Noted! We will recalibrate future matches.',
      });
      break;
    }

    case 'dismiss': {
      if (interaction) {
        await db
          .update(userJobInteractions)
          .set({
            status: 'dismissed',
            updatedAt: new Date(),
          })
          .where(eq(userJobInteractions.id, interaction.id));
      }
      await ctx.answerCallbackQuery({ text: 'Card dismissed.' });
      try {
        await ctx.deleteMessage();
      } catch {
        // Ignore if already deleted
      }
      break;
    }

    case 'applied_info': {
      await ctx.answerCallbackQuery({
        text: `You applied to this role on ${interaction?.appliedAt ? new Date(interaction.appliedAt).toLocaleDateString() : 'recent date'}.`,
        show_alert: true,
      });
      break;
    }

    default:
      await ctx.answerCallbackQuery();
  }
}
