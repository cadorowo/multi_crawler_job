import { createHash } from 'node:crypto';
import { AtsScrapersAdapter, type NormalizedJobPayload } from '@bcn-intern-bot/adapters';
import { companies, db, eq, jobs } from '@bcn-intern-bot/db';

const DEFAULT_SOURCES = ['greenhouse', 'lever', 'ashby', 'workday'];
const RESULTS_PER_SOURCE = 10;

export interface OnDemandSearchResult {
  title: string;
  company: string;
  location: string;
  url: string;
}

function sources(): string[] {
  const configured = process.env.ATS_SCRAPER_SOURCES?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured?.length ? [...new Set(configured)] : DEFAULT_SOURCES;
}

async function sourceCompany(source: string) {
  const slug = `ats-scrapers-${source}`;
  const existing = await db.query.companies.findFirst({ where: eq(companies.slug, slug) });
  if (existing) return existing;
  const [created] = await db.insert(companies).values({
    name: `ats-scrapers: ${source}`,
    slug,
    atsProvider: 'ats_scrapers',
    atsIdentifier: source,
    location: 'Global',
    isBarcelonaHq: false,
    hasBarcelonaOffice: false,
    tier: 3,
  }).returning();
  if (!created) throw new Error(`Unable to create ATS source record for ${source}`);
  return created;
}

async function saveJob(companyId: string, source: string, job: NormalizedJobPayload): Promise<void> {
  const fingerprint = createHash('sha256')
    .update(`ats-scrapers:${source}:${job.externalId}:${job.url}`)
    .digest('hex');
  const now = new Date();
  await db.insert(jobs).values({
    companyId,
    externalId: job.externalId,
    fingerprint,
    title: job.title,
    normalizedTitle: job.title,
    url: job.url,
    canonicalUrl: job.canonicalUrl || job.url,
    alternateUrls: job.alternateUrls || [],
    locationRaw: job.locationRaw,
    normalizedLocation: job.normalizedLocation,
    isBarcelona: job.isBarcelona,
    workplaceType: job.workplaceType,
    jobType: job.jobType,
    department: job.department,
    descriptionHtml: job.descriptionHtml,
    descriptionText: job.descriptionText,
    summary: job.title,
    requirements: [],
    skills: [],
    languages: [],
    salary: job.salary || {},
    classification: { requiredTools: [], keyTasks: [] },
    rawPayload: job.rawPayload || {},
    status: 'active',
    postedAt: job.postedAt || now,
    firstSeenAt: now,
    lastSeenAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: jobs.fingerprint,
    set: { url: job.url, status: 'active', lastSeenAt: now, updatedAt: now },
  });
}

/** Search multiple ATS dataset slices only after an explicit user request. */
export async function searchOnDemand(query: string): Promise<OnDemandSearchResult[]> {
  const adapter = new AtsScrapersAdapter();
  const location = process.env.ATS_SCRAPER_LOCATION || undefined;
  const searches = await Promise.allSettled(sources().map(async (source) => {
    const company = await sourceCompany(source);
    const response = await adapter.fetchJobs({
      companyId: company.id,
      companyName: company.name,
      companySlug: company.slug,
      atsProvider: 'ats_scrapers',
      atsIdentifier: query,
      atsApiEndpoint: location,
      atsDatasetSource: source,
      isBarcelonaHq: false,
    }, { limit: RESULTS_PER_SOURCE });
    await Promise.all(response.jobs.map((job) => saveJob(company.id, source, job)));
    return response.jobs.map((job) => ({
      title: job.title,
      company: String(job.rawPayload?.company || company.name),
      location: job.normalizedLocation || job.locationRaw || 'Unknown location',
      url: job.url,
    }));
  }));

  return searches.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
}
