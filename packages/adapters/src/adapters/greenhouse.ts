import { BaseAdapter } from '../base.js';
import {
  type AtsProvider,
  type CompanyAdapterTarget,
  type FetchJobsOptions,
  type AdapterFetchResult,
  type NormalizedJobPayload,
} from '../types.js';

export interface GreenhouseJobRaw {
  id: number;
  title: string;
  absolute_url: string;
  internal_job_id?: number;
  updated_at?: string;
  location?: {
    name?: string;
  };
  departments?: Array<{
    id: number;
    name: string;
  }>;
  offices?: Array<{
    id: number;
    name: string;
    location?: string;
  }>;
  content?: string;
  metadata?: Array<{
    id: number;
    name: string;
    value_type: string;
    value: any;
  }>;
}

export interface GreenhouseApiResponse {
  jobs: GreenhouseJobRaw[];
}

export class GreenhouseAdapter extends BaseAdapter {
  readonly provider: AtsProvider = 'greenhouse';

  async fetchJobs(
    target: CompanyAdapterTarget,
    options?: FetchJobsOptions
  ): Promise<AdapterFetchResult> {
    const startTime = Date.now();
    const token = target.atsIdentifier;
    const url =
      target.atsApiEndpoint ||
      `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;

    const data = await this.fetchWithRetry<GreenhouseApiResponse>(url, {
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

  normalizeJob(raw: GreenhouseJobRaw, target: CompanyAdapterTarget): NormalizedJobPayload {
    const externalId = String(raw.id);
    const title = raw.title?.trim() || 'Untitled Role';
    const url = raw.absolute_url || `https://boards.greenhouse.io/${target.atsIdentifier}/jobs/${raw.id}`;
    
    // Extract location
    const officeLocations = raw.offices?.map((o) => o.name || o.location).filter(Boolean) || [];
    const locationRaw = raw.location?.name || officeLocations.join(', ') || undefined;

    const workplaceType = this.detectWorkplaceType(locationRaw, title);
    const isBarcelona = this.detectBarcelona(locationRaw, workplaceType, target.isBarcelonaHq);
    const jobType = this.detectJobType(title, raw.content);

    const descriptionHtml = raw.content || '';
    const descriptionText = this.htmlToPlainText(descriptionHtml);
    const department = raw.departments?.[0]?.name;

    const postedAt = raw.updated_at ? new Date(raw.updated_at) : undefined;
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
      descriptionHtml,
      descriptionText,
      salary,
      postedAt,
      rawPayload: raw as unknown as Record<string, unknown>,
    };
  }
}
