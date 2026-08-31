import { BaseAdapter } from '../base.js';
import {
  type AtsProvider,
  type CompanyAdapterTarget,
  type FetchJobsOptions,
  type AdapterFetchResult,
  type NormalizedJobPayload,
} from '../types.js';

export interface LeverPostingRaw {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  categories?: {
    commitment?: string;
    department?: string;
    location?: string;
    team?: string;
    allLocations?: string[];
  };
  description?: string;
  descriptionPlain?: string;
  workplaceType?: string;
  createdAt?: number;
  lists?: Array<{
    text: string;
    content: string;
  }>;
  additional?: string;
  additionalPlain?: string;
}

export class LeverAdapter extends BaseAdapter {
  readonly provider: AtsProvider = 'lever';

  async fetchJobs(
    target: CompanyAdapterTarget,
    options?: FetchJobsOptions
  ): Promise<AdapterFetchResult> {
    const startTime = Date.now();
    const token = target.atsIdentifier;
    const url =
      target.atsApiEndpoint || `https://api.lever.co/v0/postings/${token}?mode=json`;

    const data = await this.fetchWithRetry<LeverPostingRaw[]>(url, {
      headers: options?.headers,
    });

    const rawJobs = Array.isArray(data) ? data : [];
    const normalizedJobs = rawJobs.map((raw) => this.normalizeJob(raw, target));

    return {
      company: target,
      jobs: normalizedJobs,
      rawCount: rawJobs.length,
      fetchedAt: new Date(),
      durationMs: Date.now() - startTime,
    };
  }

  normalizeJob(raw: LeverPostingRaw, target: CompanyAdapterTarget): NormalizedJobPayload {
    const externalId = raw.id;
    const title = raw.text?.trim() || 'Untitled Role';
    const url = raw.hostedUrl || `https://jobs.lever.co/${target.atsIdentifier}/${raw.id}`;
    const applyUrl = raw.applyUrl;

    const allLocations = raw.categories?.allLocations || [];
    const mainLocation = raw.categories?.location;
    const locationRaw =
      allLocations.length > 0
        ? allLocations.join(', ')
        : mainLocation || undefined;

    const rawWorkplace = raw.workplaceType || raw.categories?.commitment;
    const workplaceType = this.detectWorkplaceType(locationRaw, title, rawWorkplace);
    const isBarcelona = this.detectBarcelona(locationRaw, workplaceType, target.isBarcelonaHq);
    const jobType = this.detectJobType(
      title,
      raw.descriptionPlain,
      raw.categories?.commitment
    );

    const descriptionHtml = [raw.description, raw.additional].filter(Boolean).join('\n\n');
    let descriptionText = raw.descriptionPlain || this.htmlToPlainText(raw.description);
    if (raw.additionalPlain) {
      descriptionText += `\n\n${raw.additionalPlain}`;
    }

    // Append list items (requirements, responsibilities)
    if (Array.isArray(raw.lists)) {
      const listsText = raw.lists
        .map((l) => `${l.text}:\n${this.htmlToPlainText(l.content)}`)
        .join('\n\n');
      if (listsText) {
        descriptionText += `\n\n${listsText}`;
      }
    }

    const department = raw.categories?.team || raw.categories?.department;
    const postedAt = raw.createdAt ? new Date(raw.createdAt) : undefined;
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
