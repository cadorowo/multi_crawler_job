import { BaseAdapter } from '../base.js';
import {
  type AtsProvider,
  type CompanyAdapterTarget,
  type FetchJobsOptions,
  type AdapterFetchResult,
  type NormalizedJobPayload,
  type NormalizedSalary,
} from '../types.js';

export interface AshbyJobRaw {
  id: string;
  title: string;
  department?: string;
  location?: string;
  isRemote?: boolean;
  jobUrl: string;
  applyUrl?: string;
  employmentType?: string;
  publishedAt?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  secondaryLocations?: Array<{
    location?: string;
  }>;
  compensation?: {
    compensationTierSummary?: string;
    targetCompensation?: {
      minValue?: number;
      maxValue?: number;
      currency?: string;
      interval?: string;
    };
  };
}

export interface AshbyApiResponse {
  apiVersion?: string;
  jobs: AshbyJobRaw[];
}

export class AshbyAdapter extends BaseAdapter {
  readonly provider: AtsProvider = 'ashby';

  async fetchJobs(
    target: CompanyAdapterTarget,
    options?: FetchJobsOptions
  ): Promise<AdapterFetchResult> {
    const startTime = Date.now();
    const token = target.atsIdentifier;
    const url =
      target.atsApiEndpoint ||
      `https://api.ashbyhq.com/posting-api/job-board/${token}`;

    const data = await this.fetchWithRetry<AshbyApiResponse>(url, {
      headers: options?.headers,
    });

    const rawJobs = Array.isArray(data?.jobs) ? data.jobs : [];
    const normalizedJobs = rawJobs.map((raw) => this.normalizeJob(raw, target));

    return {
      company: target,
      jobs: normalizedJobs,
      rawCount: rawJobs.length,
      fetchedAt: new Date(),
      durationMs: Date.now() - startTime,
    };
  }

  normalizeJob(raw: AshbyJobRaw, target: CompanyAdapterTarget): NormalizedJobPayload {
    const externalId = raw.id;
    const title = raw.title?.trim() || 'Untitled Role';
    const url = raw.jobUrl || `https://jobs.ashbyhq.com/${target.atsIdentifier}/${raw.id}`;
    const applyUrl = raw.applyUrl;

    // Collect all locations
    const secondary = raw.secondaryLocations?.map((s) => s.location).filter(Boolean) || [];
    const locationRaw = [raw.location, ...secondary].filter(Boolean).join(', ') || undefined;

    let workplaceType = this.detectWorkplaceType(locationRaw, title);
    if (raw.isRemote) {
      workplaceType = 'remote';
    }

    const isBarcelona = this.detectBarcelona(locationRaw, workplaceType, target.isBarcelonaHq);
    const jobType = this.detectJobType(title, raw.descriptionPlain, raw.employmentType);

    const descriptionHtml = raw.descriptionHtml;
    const descriptionText =
      raw.descriptionPlain || this.htmlToPlainText(raw.descriptionHtml);
    const department = raw.department;

    const postedAt = raw.publishedAt ? new Date(raw.publishedAt) : undefined;

    let salary: NormalizedSalary | undefined;
    if (raw.compensation?.targetCompensation) {
      const comp = raw.compensation.targetCompensation;
      salary = {
        raw: raw.compensation.compensationTierSummary,
        currency: comp.currency || 'EUR',
        min: comp.minValue,
        max: comp.maxValue,
        period:
          comp.interval?.toLowerCase() === 'yearly'
            ? 'yearly'
            : comp.interval?.toLowerCase() === 'monthly'
            ? 'monthly'
            : 'yearly',
        isPaid: true,
      };
    } else {
      salary = this.extractSalary(descriptionText);
    }

    return {
      externalId,
      title,
      url,
      canonicalUrl: url,
      alternateUrls: applyUrl ? [applyUrl] : [],
      locationRaw,
      normalizedLocation: isBarcelona ? 'Barcelona, Spain' : (locationRaw || 'Unknown Location'),
      isBarcelona,
      workplaceType,
      jobType,
      department,
      descriptionHtml,
      descriptionText,
      salary,
      postedAt,
      rawPayload: raw as unknown as Record<string, unknown>,
    };
  }
}
