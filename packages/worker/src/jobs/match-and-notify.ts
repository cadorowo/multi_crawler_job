import { db, users, jobs, userJobInteractions, eq, and, sql } from '@bcn-intern-bot/db';
import { getMatcher, type JobExtractionResult } from '@bcn-intern-bot/llm';
import { bot, createAlertCard } from '@bcn-intern-bot/bot';
import { logger } from '../logger.js';

export async function runMatchAndNotify(): Promise<{
  usersEvaluated: number;
  notificationsSent: number;
}> {
  logger.info('🎯 Starting Match & Notify job for all active candidates...');

  const activeUsers = await db.query.users.findMany({
    where: eq(users.isActive, true),
  });

  logger.info({ userCount: activeUsers.length }, 'Found active candidates');

  const matcher = getMatcher();
  let notificationsSent = 0;

  for (const user of activeUsers) {
    const candidateProfile = user.profile;
    const candidateEmbedding = user.embedding ? (user.embedding as number[]) : undefined;
    const chatId = user.telegramChatId || user.telegramId;

    if (!chatId) continue;

    // Find active jobs not yet notified to this user
    const unnotifiedJobs = await db.query.jobs.findMany({
      where: and(
        eq(jobs.status, 'active'),
        eq(jobs.isBarcelona, true),
        // Filter out jobs where user already has an interaction with status in ('notified', 'viewed', 'saved', 'applied', 'dismissed')
        sql`NOT EXISTS (
          SELECT 1 FROM ${userJobInteractions}
          WHERE ${userJobInteractions.userId} = ${user.id}
            AND ${userJobInteractions.jobId} = ${jobs.id}
            AND ${userJobInteractions.status} IN ('notified', 'viewed', 'saved', 'applied', 'dismissed')
        )`
      ),
      with: {
        company: true,
      },
      limit: 25,
    });

    logger.info(
      { user: user.fullName || user.telegramUsername, unnotifiedCount: unnotifiedJobs.length },
      'Evaluating unnotified jobs for candidate'
    );

    for (const job of unnotifiedJobs) {
      const extraction: JobExtractionResult = {
        is_university_internship: true,
        accepts_erasmus_traineeship: true,
        working_language: (job.languages?.[0]?.toLowerCase() as any) || 'english',
        domain_fit: (job.department?.toLowerCase() as any) || 'ux_ui_design',
        required_tools: job.skills || [],
        key_tasks_summary: job.requirements || [],
        fit_reasoning: job.summary || 'Exciting internship position matching your tech stack.',
        calculated_fit_score: 80,
      };

      const jobEmbedding = job.embedding ? (job.embedding as number[]) : undefined;

      const matchResult = matcher.calculateMatchScore({
        job: {
          id: job.id,
          title: job.title,
          companyName: job.company?.name || 'Barcelona Tech',
          companyTier: job.company?.tier || 2,
          url: job.url,
          locationRaw: job.normalizedLocation || job.locationRaw || 'Barcelona, Spain',
          isBarcelona: job.isBarcelona,
          workplaceType: job.workplaceType || 'hybrid',
          descriptionText: job.descriptionText,
        },
        extraction,
        candidate: {
          targetRoles: candidateProfile.targetRoles,
          skills: candidateProfile.skills,
          tools: candidateProfile.skills,
          requiresConvenio: user.preferences?.hardFilters?.mustBeInBarcelona,
          englishOnly: false,
        },
        candidateEmbedding,
        jobEmbedding,
      });

      if (matchResult.shouldNotify) {
        logger.info(
          { job: job.title, company: job.company?.name, score: matchResult.overallScore },
          'Match score exceeds notification threshold! Sending Telegram Alert Card...'
        );

        try {
          const { text, keyboard } = createAlertCard({
            jobId: job.id,
            title: job.title,
            companyName: job.company?.name || 'Barcelona Tech',
            location: job.normalizedLocation || 'Barcelona, Spain',
            workplaceType: job.workplaceType || 'hybrid',
            score: matchResult.overallScore,
            domainFit: matchResult.domainFit,
            isUniversity: extraction.is_university_internship,
            acceptsErasmus: extraction.accepts_erasmus_traineeship,
            language: extraction.working_language,
            keyTasks: extraction.key_tasks_summary,
            matchingTools: matchResult.matchingTools,
            summary: extraction.fit_reasoning,
            applyUrl: job.url,
            isApplied: false,
          });

          await bot.api.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          });

          notificationsSent++;

          // Record interaction in database
          await db.insert(userJobInteractions).values({
            userId: user.id,
            jobId: job.id,
            matchScore: matchResult.overallScore / 100,
            semanticScore: matchResult.semanticSimilarity,
            deterministicScore: (matchResult.userPreferenceBoost + 20) / 40,
            matchReasons: matchResult.matchingTools,
            matchAnalysis: {
              overallScore: matchResult.overallScore / 100,
              semanticSimilarity: matchResult.semanticSimilarity,
              deterministicScore: (matchResult.userPreferenceBoost + 20) / 40,
              matchingSkills: matchResult.matchingTools,
              missingSkills: matchResult.missingTools,
              pros: extraction.key_tasks_summary,
              cons: [],
              recommendationExplanation: extraction.fit_reasoning,
            },
            status: 'notified',
            notifiedAt: new Date(),
          });

          // Small delay to prevent Telegram flood limits (30 msgs/sec max)
          await new Promise((r) => setTimeout(r, 250));
        } catch (sendErr: any) {
          logger.error(
            { chatId, job: job.title, err: sendErr.message },
            'Failed to dispatch Telegram message card'
          );
        }
      }
    }
  }

  logger.info({ notificationsSent }, '🎉 Match & Notify cycle completed.');

  return {
    usersEvaluated: activeUsers.length,
    notificationsSent,
  };
}
