import { z } from 'zod';

export type AtsProvider =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'teamtailor'
  | 'factorial'
  | 'workable'
  | 'smartrecruiters'
  | 'ats_scrapers'
  | 'recruitee'
  | 'personio'
  | 'workday'
  | 'custom'
  | 'other';

export type WorkplaceType = 'remote' | 'hybrid' | 'onsite' | 'unknown';

export type JobType =
  | 'internship'
  | 'working_student'
  | 'graduate'
  | 'junior'
  | 'entry_level'
  | 'trainee'
  | 'unknown';

export interface NormalizedSalary {
  raw?: string;
  currency?: string;
  min?: number;
  max?: number;
  period?: 'hourly' | 'monthly' | 'yearly';
  isPaid?: boolean;
}

export const normalizedJobPayloadSchema = z.object({
  externalId: z.string(),
  title: z.string().min(1),
  url: z.string().url(),
  canonicalUrl: z.string().url().optional(),
  alternateUrls: z.array(z.string().url()).default([]),
  locationRaw: z.string().optional(),
  normalizedLocation: z.string().default('Unknown location'),
  // Legacy compatibility field. Matching uses normalizedLocation and user preferences.
  isBarcelona: z.boolean().default(false),
  workplaceType: z.enum(['remote', 'hybrid', 'onsite', 'unknown']).default('unknown'),
  jobType: z
    .enum(['internship', 'working_student', 'graduate', 'junior', 'entry_level', 'trainee', 'unknown'])
    .default('internship'),
  department: z.string().optional(),
  descriptionHtml: z.string().optional(),
  descriptionText: z.string().default(''),
  salary: z
    .object({
      raw: z.string().optional(),
      currency: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      period: z.enum(['hourly', 'monthly', 'yearly']).optional(),
      isPaid: z.boolean().optional(),
    })
    .optional(),
  postedAt: z.date().optional(),
  expiresAt: z.date().optional(),
  rawPayload: z.record(z.unknown()).default({}),
});

export type NormalizedJobPayload = z.infer<typeof normalizedJobPayloadSchema>;

export interface CompanyAdapterTarget {
  companyId?: string;
  companyName: string;
  companySlug: string;
  atsProvider: AtsProvider;
  atsIdentifier: string; // Token, slug, or board identifier in ATS
  atsApiEndpoint?: string;
  /** Source key in the ats-scrapers hosted dataset, e.g. greenhouse or lever. */
  atsDatasetSource?: string;
  isBarcelonaHq?: boolean;
}

export interface FetchJobsOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  limit?: number;
}

export interface AdapterFetchResult {
  company: CompanyAdapterTarget;
  jobs: NormalizedJobPayload[];
  rawCount: number;
  fetchedAt: Date;
  durationMs: number;
}
