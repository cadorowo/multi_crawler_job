import { BaseAdapter } from '../base.js';
import {
  type AtsProvider,
  type CompanyAdapterTarget,
  type FetchJobsOptions,
  type AdapterFetchResult,
  type NormalizedJobPayload,
} from '../types.js';

export interface WorkableJobRaw {
  id?: string | number;
  shortcode?: string;
  title: string;
  url?: string;
  application_url?: string;
  department?: string;
  city?: string;
  country?: string;
  state?: string;
  telecommuting?: boolean;
  workplace?: string;
  employment_type?: string;
  published_on?: string;
  description?: string;
  requirements?: string;
  benefits?: string;
}

export interface WorkableWidgetResponse {
  name?: string;
  description?: string;
  jobs?: WorkableJobRaw[];
  results?: WorkableJobRaw[];
}

export class WorkableAdapter extends BaseAdapter {
  readonly provider: AtsProvider = 'workable';

  async fetchJobs(
    target: CompanyAdapterTarget,
    options?: FetchJobsOptions
  ): Promise<AdapterFetchResult> {
    const startTime = Date.now();
    const token = target.atsIdentifier;
    const url =
      target.atsApiEndpoint ||
      `https://apply.workable.com/api/v1/widget/accounts/${token}`;

    const data = await this.fetchWithRetry<WorkableWidgetResponse | WorkableJobRaw[]>(
      url,
      {
        headers: options?.headers,
      }
    );

    let rawJobs: WorkableJobRaw[] = [];
    if (Array.isArray(data)) {
      rawJobs = data;
    } else if (data && Array.isArray(data.jobs)) {
      rawJobs = data.jobs;
    } else if (data && Array.isArray(data.results)) {
      rawJobs = data.results;
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

  normalizeJob(raw: WorkableJobRaw, target: CompanyAdapterTarget): NormalizedJobPayload {
    const externalId = String(raw.shortcode || raw.id || raw.title);
    const title = raw.title?.trim() || 'Untitled Role';
    const url =
      raw.url ||
      `https://apply.workable.com/${target.atsIdentifier}/j/${externalId}/`;
    const applyUrl = raw.application_url;

    const locationParts = [raw.city, raw.state, raw.country].filter(Boolean);
    const locationRaw = locationParts.length > 0 ? locationParts.join(', ') : undefined;

    let workplaceType = this.detectWorkplaceType(locationRaw, title, raw.workplace);
    if (raw.telecommuting) {
      workplaceType = 'remote';
    }

    const isBarcelona = this.detectBarcelona(locationRaw, workplaceType, target.isBarcelonaHq);
    const jobType = this.detectJobType(title, raw.description, raw.employment_type);

    const descriptionParts = [raw.description, raw.requirements, raw.benefits].filter(Boolean);
    const descriptionHtml = descriptionParts.join('\n\n');
    const descriptionText = this.htmlToPlainText(descriptionHtml);

    const department = raw.department;
    const postedAt = raw.published_on ? new Date(raw.published_on) : undefined;
    const salary = this.extractSalary(descriptionText);

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
      descriptionHtml: descriptionHtml || undefined,
      descriptionText,
      salary,
      postedAt,
      rawPayload: raw as unknown as Record<string, unknown>,
    };
  }
}
