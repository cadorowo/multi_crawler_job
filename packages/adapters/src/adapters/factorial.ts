import { BaseAdapter } from '../base.js';
import {
  type AtsProvider,
  type CompanyAdapterTarget,
  type FetchJobsOptions,
  type AdapterFetchResult,
  type NormalizedJobPayload,
} from '../types.js';

export interface FactorialJobRaw {
  id: string | number;
  title: string;
  location?: string;
  city?: string;
  country?: string;
  contract_type?: string;
  workplace?: string;
  description?: string;
  url?: string;
  published_at?: string;
  created_at?: string;
  department?: string;
  team?: {
    name?: string;
  };
}

export interface FactorialApiResponse {
  data?: FactorialJobRaw[];
}

export class FactorialAdapter extends BaseAdapter {
  readonly provider: AtsProvider = 'factorial';

  async fetchJobs(
    target: CompanyAdapterTarget,
    options?: FetchJobsOptions
  ): Promise<AdapterFetchResult> {
    const startTime = Date.now();
    const token = target.atsIdentifier;
    const url =
      target.atsApiEndpoint ||
      `https://api.factorialhr.com/api/v1/ats/job_postings?company=${token}`;

    const data = await this.fetchWithRetry<FactorialApiResponse | FactorialJobRaw[]>(url, {
      headers: options?.headers,
    });

    let rawJobs: FactorialJobRaw[] = [];
    if (Array.isArray(data)) {
      rawJobs = data;
    } else if (data && Array.isArray(data.data)) {
      rawJobs = data.data;
    }

    const normalizedJobs = rawJobs.map((raw) => this.normalizeJob(raw, target));

    return {
      company: target,
      jobs: normalizedJobs,
      rawCount: rawJobs.length,
      fetchedAt: new Date(),
      durationMs: Date.now() - startTime,
    };
  }

  normalizeJob(raw: FactorialJobRaw, target: CompanyAdapterTarget): NormalizedJobPayload {
    const externalId = String(raw.id);
    const title = raw.title?.trim() || 'Untitled Role';
    const url =
      raw.url ||
      `https://${target.atsIdentifier}.factorialhr.com/job_postings/${raw.id}`;

    const locationParts = [raw.city, raw.country].filter(Boolean);
    const locationRaw = raw.location || (locationParts.length > 0 ? locationParts.join(', ') : undefined);

    const workplaceType = this.detectWorkplaceType(locationRaw, title, raw.workplace);
    const isBarcelona = this.detectBarcelona(locationRaw, workplaceType, target.isBarcelonaHq);
    const jobType = this.detectJobType(title, raw.description, raw.contract_type);

    const descriptionHtml = raw.description || '';
    const descriptionText = this.htmlToPlainText(descriptionHtml);
    const department = raw.department || raw.team?.name;

    const dateStr = raw.published_at || raw.created_at;
    const postedAt = dateStr ? new Date(dateStr) : undefined;
    const salary = this.extractSalary(descriptionText);

    return {
      externalId,
      title,
      url,
      canonicalUrl: url,
      alternateUrls: [],
      locationRaw,
      normalizedLocation: isBarcelona ? 'Barcelona, Spain' : (locationRaw || 'Unknown Location'),
      isBarcelona,
      workplaceType,
      jobType,
      department,
      descriptionHtml: descriptionHtml || undefined,
      descriptionText,
      salary,
      postedAt,
      rawPayload: raw as unknown as Record<string, unknown>,
    };
  }
}
