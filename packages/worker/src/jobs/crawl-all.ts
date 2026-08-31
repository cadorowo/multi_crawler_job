import { createHash } from 'node:crypto';
import { db, companies, jobs, eq } from '@bcn-intern-bot/db';
import { getAdapter, JobSpyAdapter } from '@bcn-intern-bot/adapters';
import { getBouncer, getEmbedder, EmbedderService } from '@bcn-intern-bot/llm';
import { logger, notifyAdmin } from '../logger.js';
import type PgBoss from 'pg-boss';

const JOBSPY_SEARCH_QUERIES = [
  'UX UI Design Intern',
  'Product Design Intern',
  'Software Engineer Intern',
  'Frontend Intern',
  'AI Engineering Intern',
];

export async function runCrawlAll(boss?: PgBoss): Promise<{
  totalCompanies: number;
  totalFetched: number;
  totalIndexed: number;
  errors: number;
}> {
  logger.info('🚀 Starting Master Ingestion Crawl for all active Barcelona companies & Aggregators...');

  const activeCompanies = await db.query.companies.findMany({
    where: eq(companies.isActive, true),
  });

  logger.info({ count: activeCompanies.length }, 'Found active companies to crawl');

  let totalFetched = 0;
  let totalIndexed = 0;
  let totalErrors = 0;

  const bouncer = getBouncer();
  const embedder = getEmbedder();

  // 1. Crawl Direct Company ATS Systems
  for (const company of activeCompanies) {
    logger.info({ company: company.name, provider: company.atsProvider }, 'Crawling company ATS...');

    try {
      const adapter = getAdapter(company.atsProvider as any);
      const result = await adapter.fetchJobs({
        companyId: company.id,
        companyName: company.name,
        companySlug: company.slug,
        atsProvider: company.atsProvider as any,
        atsIdentifier: company.atsIdentifier || company.slug,
        atsApiEndpoint: company.atsApiEndpoint || undefined,
        isBarcelonaHq: company.isBarcelonaHq,
      });

      totalFetched += result.rawCount;
      logger.info(
        { company: company.name, fetched: result.jobs.length, rawCount: result.rawCount },
        'Fetched jobs successfully'
      );

      for (const normalized of result.jobs) {
        // Compute SHA-256 fingerprint for deduplication
        const fingerprintInput = `${company.id}:${normalized.title.toLowerCase().trim()}:${normalized.normalizedLocation || 'Barcelona, Spain'}`;
        const fingerprint = createHash('sha256').update(fingerprintInput).digest('hex');

        // Check 2-Pass Bouncer
        const bouncerResult = await bouncer.evaluateJob({
          title: normalized.title,
          companyName: company.name,
          location: normalized.normalizedLocation || normalized.locationRaw || 'Barcelona, Spain',
          descriptionText: normalized.descriptionText,
        });

        if (!bouncerResult.passed) {
          logger.debug(
            { title: normalized.title, reason: bouncerResult.rejectionReason },
            'Job rejected by Bouncer'
          );
          continue;
        }

        // Job approved! Generate vector embedding for hybrid search
        let embedding: number[] | undefined;
        try {
          const embeddingText = EmbedderService.buildJobEmbeddingInput({
            title: normalized.title,
            companyName: company.name,
            department: normalized.department,
            location: normalized.normalizedLocation,
            descriptionText: normalized.descriptionText,
            requiredTools: bouncerResult.extraction?.required_tools,
          });

          embedding = await embedder.embedText(embeddingText);
        } catch (embErr: any) {
          logger.warn(
            { title: normalized.title, err: embErr.message },
            'Failed to generate vector embedding, inserting without embedding'
          );
        }

        // Upsert into jobs table
        const now = new Date();
        await db
          .insert(jobs)
          .values({
            companyId: company.id,
            externalId: normalized.externalId,
            fingerprint,
            title: normalized.title,
            normalizedTitle: normalized.title,
            url: normalized.url,
            canonicalUrl: normalized.canonicalUrl || normalized.url,
            alternateUrls: normalized.alternateUrls || [],
            locationRaw: normalized.locationRaw,
            normalizedLocation: normalized.normalizedLocation,
            isBarcelona: normalized.isBarcelona,
            workplaceType: normalized.workplaceType as any,
            jobType: normalized.jobType as any,
            department: normalized.department,
            descriptionHtml: normalized.descriptionHtml,
            descriptionText: normalized.descriptionText,
            summary: bouncerResult.extraction?.fit_reasoning || normalized.title,
            requirements: bouncerResult.extraction?.key_tasks_summary || [],
            skills: bouncerResult.extraction?.required_tools || [],
            languages: bouncerResult.extraction?.working_language
              ? [bouncerResult.extraction.working_language]
              : ['English'],
            salary: normalized.salary || {},
            rawPayload: normalized.rawPayload || {},
            embedding: embedding,
            status: 'active',
            postedAt: normalized.postedAt || now,
            firstSeenAt: now,
            lastSeenAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: jobs.fingerprint,
            set: {
              url: normalized.url,
              status: 'active',
              lastSeenAt: now,
              updatedAt: now,
              ...(embedding ? { embedding } : {}),
            },
          });

        totalIndexed++;
      }

      // Update company crawl status
      await db
        .update(companies)
        .set({
          lastScrapedAt: new Date(),
          scrapeErrorCount: 0,
          lastScrapeError: null,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, company.id));
    } catch (err: any) {
      totalErrors++;
      logger.error(
        { company: company.name, provider: company.atsProvider, err: err.message },
        'Error crawling company'
      );

      const errorCount = (company.scrapeErrorCount || 0) + 1;
      await db
        .update(companies)
        .set({
          scrapeErrorCount: errorCount,
          lastScrapeError: err.message,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, company.id));

      if (errorCount >= 3) {
        await notifyAdmin(
          `Company *${company.name}* (${company.slug}) on ATS *${company.atsProvider}* has failed 3 consecutive crawls.\nError: \`${err.message}\``,
          'warn'
        );
      }
    }
  }

  // 2. Secondary Aggregator Run: JobSpy (LinkedIn, Indeed, Glassdoor)
  logger.info('🔍 Running secondary JobSpy aggregator crawl across Barcelona queries...');
  try {
    const jobSpyAdapter = new JobSpyAdapter();

    // Ensure an aggregator fallback company exists for external jobs
    let aggregatorCompany = await db.query.companies.findFirst({
      where: eq(companies.slug, 'jobspy-aggregator'),
    });

    if (!aggregatorCompany) {
      const [newCompany] = await db
        .insert(companies)
        .values({
          name: 'Aggregator Postings',
          slug: 'jobspy-aggregator',
          atsProvider: 'jobspy' as any,
          atsIdentifier: 'jobspy',
          location: 'Barcelona, Spain',
          isBarcelonaHq: true,
          hasBarcelonaOffice: true,
          tier: 3,
        })
        .returning();
      aggregatorCompany = newCompany;
    }

    if (aggregatorCompany) {
      for (const query of JOBSPY_SEARCH_QUERIES) {
        logger.info({ query }, 'Executing JobSpy search...');
        const result = await jobSpyAdapter.fetchJobs(
          {
            companyId: aggregatorCompany.id,
            companyName: 'Barcelona Aggregator',
            companySlug: 'jobspy-aggregator',
            atsProvider: 'jobspy',
            atsIdentifier: query,
            isBarcelonaHq: true,
          },
          { limit: 15 }
        );

        totalFetched += result.rawCount;

        for (const normalized of result.jobs) {
          const rawCompany = (normalized.rawPayload?.company as string) || 'Barcelona Tech Startup';
          const fingerprintInput = `jobspy:${rawCompany.toLowerCase()}:${normalized.title.toLowerCase().trim()}:${normalized.normalizedLocation}`;
          const fingerprint = createHash('sha256').update(fingerprintInput).digest('hex');

          const bouncerResult = await bouncer.evaluateJob({
            title: normalized.title,
            companyName: rawCompany,
            location: normalized.normalizedLocation || 'Barcelona, Spain',
            descriptionText: normalized.descriptionText,
          });

          if (!bouncerResult.passed) continue;

          let embedding: number[] | undefined;
          try {
            const embeddingText = EmbedderService.buildJobEmbeddingInput({
              title: normalized.title,
              companyName: rawCompany,
              department: normalized.department,
              location: normalized.normalizedLocation,
              descriptionText: normalized.descriptionText,
              requiredTools: bouncerResult.extraction?.required_tools,
            });
            embedding = await embedder.embedText(embeddingText);
          } catch {
            // ignore
          }

          const now = new Date();
          await db
            .insert(jobs)
            .values({
              companyId: aggregatorCompany.id,
              externalId: normalized.externalId,
              fingerprint,
              title: normalized.title,
              normalizedTitle: normalized.title,
              url: normalized.url,
              canonicalUrl: normalized.canonicalUrl || normalized.url,
              alternateUrls: normalized.alternateUrls || [],
              locationRaw: normalized.locationRaw,
              normalizedLocation: normalized.normalizedLocation,
              isBarcelona: normalized.isBarcelona,
              workplaceType: normalized.workplaceType as any,
              jobType: normalized.jobType as any,
              department: rawCompany,
              descriptionHtml: normalized.descriptionHtml,
              descriptionText: normalized.descriptionText,
              summary: bouncerResult.extraction?.fit_reasoning || normalized.title,
              requirements: bouncerResult.extraction?.key_tasks_summary || [],
              skills: bouncerResult.extraction?.required_tools || [],
              languages: bouncerResult.extraction?.working_language
                ? [bouncerResult.extraction.working_language]
                : ['English'],
              salary: normalized.salary || {},
              rawPayload: normalized.rawPayload || {},
              embedding: embedding,
              status: 'active',
              postedAt: normalized.postedAt || now,
              firstSeenAt: now,
              lastSeenAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: jobs.fingerprint,
              set: {
                url: normalized.url,
                status: 'active',
                lastSeenAt: now,
                updatedAt: now,
                ...(embedding ? { embedding } : {}),
              },
            });

          totalIndexed++;
        }
      }
    }
  } catch (aggErr: any) {
    logger.warn({ err: aggErr.message }, 'JobSpy aggregator search skipped / errored');
  }

  logger.info(
    { totalCompanies: activeCompanies.length, totalFetched, totalIndexed, totalErrors },
    '🎉 Ingestion crawl cycle finished!'
  );

  // Enqueue matching and notification job
  if (boss) {
    logger.info('Enqueuing match-and-notify background job in pg-boss...');
    await boss.send('match-and-notify', { trigger: 'crawl-all-finished' });
  }

  return {
    totalCompanies: activeCompanies.length,
    totalFetched,
    totalIndexed,
    errors: totalErrors,
  };
}
