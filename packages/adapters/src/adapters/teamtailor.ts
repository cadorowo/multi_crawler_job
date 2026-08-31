import { BaseAdapter } from '../base.js';
import {
  type AtsProvider,
  type CompanyAdapterTarget,
  type FetchJobsOptions,
  type AdapterFetchResult,
  type NormalizedJobPayload,
} from '../types.js';

export interface TeamtailorJobJsonApi {
  id: string;
  type: string;
  attributes: {
    title?: string;
    body?: string;
    pitch?: string;
    'created-at'?: string;
    'updated-at'?: string;
    'remote-status'?: string;
    'locations-text'?: string;
    city?: string;
    country?: string;
    department?: string;
  };
  links?: {
    'careersite-job-url'?: string;
  };
}

export interface TeamtailorFlatJob {
  id: string | number;
  title: string;
  url?: string;
  body?: string;
  pitch?: string;
  city?: string;
  country?: string;
  remote_status?: string;
  created_at?: string;
  department?: string;
}

export type TeamtailorRawItem = TeamtailorJobJsonApi | TeamtailorFlatJob;

export interface TeamtailorResponse {
  data?: TeamtailorJobJsonApi[];
  jobs?: TeamtailorFlatJob[];
}

export class TeamtailorAdapter extends BaseAdapter {
  readonly provider: AtsProvider = 'teamtailor';

  async fetchJobs(
    target: CompanyAdapterTarget,
    options?: FetchJobsOptions
  ): Promise<AdapterFetchResult> {
    const startTime = Date.now();
    const token = target.atsIdentifier;
    
    // Support custom endpoint or standard feeds
    const url =
      target.atsApiEndpoint ||
      `https://${token}.teamtailor.com/jobs.json`;

    const data = await this.fetchWithRetry<TeamtailorResponse | TeamtailorRawItem[]>(url, {
      headers: options?.headers,
    });

    let rawJobs: TeamtailorRawItem[] = [];
    if (Array.isArray(data)) {
      rawJobs = data;
    } else if (data && Array.isArray((data as TeamtailorResponse).data)) {
      rawJobs = (data as TeamtailorResponse).data!;
    } else if (data && Array.isArray((data as TeamtailorResponse).jobs)) {
      rawJobs = (data as TeamtailorResponse).jobs!;
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

  normalizeJob(raw: TeamtailorRawItem, target: CompanyAdapterTarget): NormalizedJobPayload {
    const isJsonApi = 'attributes' in raw;

    let externalId: string;
    let title: string;
    let url: string;
    let bodyHtml: string | undefined;
    let locationRaw: string | undefined;
    let rawRemote: string | undefined;
    let createdAtStr: string | undefined;
    let department: string | undefined;

    if (isJsonApi) {
      const jsonApi = raw as TeamtailorJobJsonApi;
      externalId = String(jsonApi.id);
      title = jsonApi.attributes.title?.trim() || 'Untitled Role';
      url =
        jsonApi.links?.['careersite-job-url'] ||
        `https://${target.atsIdentifier}.teamtailor.com/jobs/${jsonApi.id}`;
      bodyHtml = jsonApi.attributes.body;
      locationRaw =
        jsonApi.attributes['locations-text'] ||
        [jsonApi.attributes.city, jsonApi.attributes.country].filter(Boolean).join(', ') ||
        undefined;
      rawRemote = jsonApi.attributes['remote-status'];
      createdAtStr = jsonApi.attributes['created-at'];
      department = jsonApi.attributes.department;
    } else {
      const flat = raw as TeamtailorFlatJob;
      externalId = String(flat.id);
      title = flat.title?.trim() || 'Untitled Role';
      url =
        flat.url ||
        `https://${target.atsIdentifier}.teamtailor.com/jobs/${flat.id}`;
      bodyHtml = flat.body;
      locationRaw = [flat.city, flat.country].filter(Boolean).join(', ') || undefined;
      rawRemote = flat.remote_status;
      createdAtStr = flat.created_at;
      department = flat.department;
    }

    const workplaceType = this.detectWorkplaceType(locationRaw, title, rawRemote);
    const isBarcelona = this.detectBarcelona(locationRaw, workplaceType, target.isBarcelonaHq);
    const jobType = this.detectJobType(title, bodyHtml);

    const descriptionHtml = bodyHtml || '';
    const descriptionText = this.htmlToPlainText(descriptionHtml);
    const postedAt = createdAtStr ? new Date(createdAtStr) : undefined;
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
