import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { BaseAdapter } from '../base.js';
import type {
  AdapterFetchResult,
  AtsProvider,
  CompanyAdapterTarget,
  FetchJobsOptions,
  NormalizedJobPayload,
  NormalizedSalary,
} from '../types.js';

export interface AtsScrapersRecord {
  global_id?: string;
  ats_id?: string;
  url?: string;
  apply_url?: string;
  title?: string;
  company?: string;
  location?: string;
  is_remote?: boolean;
  employment_type?: string;
  department?: string;
  description?: string;
  posted_at?: string;
  salary_summary?: string;
  salary_currency?: string;
  salary_min?: number;
  salary_max?: number;
  salary_period?: string;
  language?: string;
  ats_type?: string;
  [key: string]: unknown;
}

/** Adapter over the locally checked-out `ats_scraper` project and its hosted dataset. */
export class AtsScrapersAdapter extends BaseAdapter {
  readonly provider: AtsProvider = 'ats_scrapers';

  private readonly bridgePath = resolve(process.cwd(), 'scripts/search_ats_scraper.py');
  private readonly workspace =
    process.env.ATS_SCRAPER_ROOT ||
    '/Users/cadowo/Library/Mobile Documents/com~apple~CloudDocs/Documents/projects/vibes/ats_scraper';

  async fetchJobs(target: CompanyAdapterTarget, options?: FetchJobsOptions): Promise<AdapterFetchResult> {
    const startedAt = Date.now();
    const query = target.atsIdentifier || 'intern';
    const limit = options?.limit || 25;
    const location = target.atsApiEndpoint || process.env.ATS_SCRAPER_LOCATION;
    const records = await this.search(query, limit, location);

    return {
      company: target,
      jobs: records.map((record) => this.normalizeJob(record, target)),
      rawCount: records.length,
      fetchedAt: new Date(),
      durationMs: Date.now() - startedAt,
    };
  }

  normalizeJob(raw: AtsScrapersRecord, target: CompanyAdapterTarget): NormalizedJobPayload {
    const title = raw.title?.trim() || 'Untitled role';
    const url = String(raw.apply_url || raw.url || '');
    if (!url) throw new Error(`ats-scrapers result has no apply URL for ${title}`);
    const externalId = String(raw.global_id || raw.ats_id || createHash('sha256').update(url).digest('hex'));
    const locationRaw = raw.location || (raw.is_remote ? 'Remote' : 'Unknown location');
    const workplaceType = raw.is_remote ? 'remote' : this.detectWorkplaceType(locationRaw, title);
    const descriptionText = this.htmlToPlainText(raw.description || '');
    const salary: NormalizedSalary | undefined = raw.salary_summary || raw.salary_min || raw.salary_max
      ? {
          raw: raw.salary_summary,
          currency: raw.salary_currency,
          min: raw.salary_min,
          max: raw.salary_max,
          period: raw.salary_period?.toLowerCase() === 'month' ? 'monthly' : 'yearly',
          isPaid: true,
        }
      : undefined;

    return {
      externalId,
      title,
      url,
      canonicalUrl: String(raw.url || url),
      alternateUrls: [],
      locationRaw,
      normalizedLocation: locationRaw,
      isBarcelona: this.detectBarcelona(locationRaw, workplaceType, false),
      workplaceType,
      jobType: this.detectJobType(title, descriptionText, raw.employment_type),
      department: raw.department || raw.company || target.companyName,
      descriptionHtml: raw.description,
      descriptionText,
      salary,
      postedAt: raw.posted_at ? new Date(raw.posted_at) : undefined,
      rawPayload: raw,
    };
  }

  private search(query: string, limit: number, location?: string): Promise<AtsScrapersRecord[]> {
    return new Promise((resolveSearch, reject) => {
      const args = ['run', '--directory', this.workspace, 'python', this.bridgePath, '--query', query, '--limit', String(limit)];
      if (location) args.push('--location', location);
      // Query one source by default: a cross-source snapshot is multi-gigabyte.
      const source = process.env.ATS_SCRAPER_ATS || 'greenhouse';
      if (source) args.push('--ats', source);
      if (process.env.ATS_SCRAPER_REMOTE_ONLY === 'true') args.push('--remote');
      const child = spawn('uv', args);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => (stdout += data.toString()));
      child.stderr.on('data', (data) => (stderr += data.toString()));
      child.on('error', (error) => reject(new Error(`Unable to run ats-scrapers bridge: ${error.message}`)));
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(`ats-scrapers bridge exited ${code}: ${stderr}`));
        try {
          const parsed = JSON.parse(stdout.trim() || '[]');
          resolveSearch(Array.isArray(parsed) ? parsed : []);
        } catch (error: any) {
          reject(new Error(`Invalid ats-scrapers JSON: ${error.message}`));
        }
      });
    });
  }
}
