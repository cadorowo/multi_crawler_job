import { createHash } from 'node:crypto';
import { db, companies, jobs, eq } from '@bcn-intern-bot/db';
import { AtsScrapersAdapter, getAdapter } from '@bcn-intern-bot/adapters';
import { getBouncer, getEmbedder, EmbedderService } from '@bcn-intern-bot/llm';
import { logger, notifyAdmin } from '../logger.js';
import type PgBoss from 'pg-boss';

const ATS_SCRAPERS_SEARCH_QUERIES = [
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
  logger.info('🚀 Starting JobFinder ingestion crawl for all active companies and aggregators...');

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
        const fingerprintInput = `${company.id}:${normalized.title.toLowerCase().trim()}:${normalized.normalizedLocation || 'Unknown location'}`;
        const fingerprint = createHash('sha256').update(fingerprintInput).digest('hex');

        // Check 2-Pass Bouncer
        const bouncerResult = await bouncer.evaluateJob({
          title: normalized.title,
          companyName: company.name,
          location: normalized.normalizedLocation || normalized.locationRaw || 'Unknown location',
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
            classification: bouncerResult.extraction
              ? {
                  isUniversityInternship: bouncerResult.extraction.is_university_internship,
                  acceptsErasmusTraineeship: bouncerResult.extraction.accepts_erasmus_traineeship,
                  workingLanguage: bouncerResult.extraction.working_language,
                  domainFit: bouncerResult.extraction.domain_fit,
                  requiredTools: bouncerResult.extraction.required_tools,
                  keyTasks: bouncerResult.extraction.key_tasks_summary,
                  fitReasoning: bouncerResult.extraction.fit_reasoning,
                  calculatedFitScore: bouncerResult.extraction.calculated_fit_score,
                }
              : { requiredTools: [], keyTasks: [] },
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
              summary: bouncerResult.extraction?.fit_reasoning || normalized.title,
              requirements: bouncerResult.extraction?.key_tasks_summary || [],
              skills: bouncerResult.extraction?.required_tools || [],
              classification: bouncerResult.extraction
                ? {
                    isUniversityInternship: bouncerResult.extraction.is_university_internship,
                    acceptsErasmusTraineeship: bouncerResult.extraction.accepts_erasmus_traineeship,
                    workingLanguage: bouncerResult.extraction.working_language,
                    domainFit: bouncerResult.extraction.domain_fit,
                    requiredTools: bouncerResult.extraction.required_tools,
                    keyTasks: bouncerResult.extraction.key_tasks_summary,
                    fitReasoning: bouncerResult.extraction.fit_reasoning,
                    calculatedFitScore: bouncerResult.extraction.calculated_fit_score,
                  }
                : { requiredTools: [], keyTasks: [] },
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

  // 2. Secondary source: local ats-scrapers dataset and its supported ATS feeds.
  logger.info('🔍 Searching the local ats-scrapers dataset across configured global queries...');
  try {
    const atsScrapersAdapter = new AtsScrapersAdapter();

    // Ensure an aggregator fallback company exists for external jobs
    let aggregatorCompany = await db.query.companies.findFirst({
      where: eq(companies.slug, 'ats-scrapers-dataset'),
    });

    if (!aggregatorCompany) {
      const [newCompany] = await db
        .insert(companies)
        .values({
          name: 'ats-scrapers Dataset',
          slug: 'ats-scrapers-dataset',
          atsProvider: 'ats_scrapers' as any,
          atsIdentifier: 'ats_scrapers',
          location: process.env.ATS_SCRAPER_LOCATION || 'Remote',
          isBarcelonaHq: false,
          hasBarcelonaOffice: false,
          tier: 3,
        })
        .returning();
      aggregatorCompany = newCompany;
    }

    if (aggregatorCompany) {
      for (const query of ATS_SCRAPERS_SEARCH_QUERIES) {
        logger.info({ query }, 'Executing ats-scrapers search...');
        const result = await atsScrapersAdapter.fetchJobs(
          {
            companyId: aggregatorCompany.id,
            companyName: 'ats-scrapers Dataset',
            companySlug: 'ats-scrapers-dataset',
            atsProvider: 'ats_scrapers',
            atsIdentifier: query,
            atsApiEndpoint: process.env.ATS_SCRAPER_LOCATION,
            isBarcelonaHq: false,
          },
          { limit: 15 }
        );

        totalFetched += result.rawCount;

        for (const normalized of result.jobs) {
          const rawCompany = (normalized.rawPayload?.company as string) || 'Unknown company';
          const fingerprintInput = `ats-scrapers:${rawCompany.toLowerCase()}:${normalized.title.toLowerCase().trim()}:${normalized.normalizedLocation}`;
          const fingerprint = createHash('sha256').update(fingerprintInput).digest('hex');

          const bouncerResult = await bouncer.evaluateJob({
            title: normalized.title,
            companyName: rawCompany,
            location: normalized.normalizedLocation || 'Unknown location',
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
              classification: bouncerResult.extraction
                ? {
                    isUniversityInternship: bouncerResult.extraction.is_university_internship,
                    acceptsErasmusTraineeship: bouncerResult.extraction.accepts_erasmus_traineeship,
                    workingLanguage: bouncerResult.extraction.working_language,
                    domainFit: bouncerResult.extraction.domain_fit,
                    requiredTools: bouncerResult.extraction.required_tools,
                    keyTasks: bouncerResult.extraction.key_tasks_summary,
                    fitReasoning: bouncerResult.extraction.fit_reasoning,
                    calculatedFitScore: bouncerResult.extraction.calculated_fit_score,
                  }
                : { requiredTools: [], keyTasks: [] },
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
                summary: bouncerResult.extraction?.fit_reasoning || normalized.title,
                requirements: bouncerResult.extraction?.key_tasks_summary || [],
                skills: bouncerResult.extraction?.required_tools || [],
                classification: bouncerResult.extraction
                  ? {
                      isUniversityInternship: bouncerResult.extraction.is_university_internship,
                      acceptsErasmusTraineeship: bouncerResult.extraction.accepts_erasmus_traineeship,
                      workingLanguage: bouncerResult.extraction.working_language,
                      domainFit: bouncerResult.extraction.domain_fit,
                      requiredTools: bouncerResult.extraction.required_tools,
                      keyTasks: bouncerResult.extraction.key_tasks_summary,
                      fitReasoning: bouncerResult.extraction.fit_reasoning,
                      calculatedFitScore: bouncerResult.extraction.calculated_fit_score,
                    }
                  : { requiredTools: [], keyTasks: [] },
              },
            });

          totalIndexed++;
        }
      }
    }
  } catch (aggErr: any) {
    logger.warn({ err: aggErr.message }, 'ats-scrapers dataset search skipped / errored');
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
