import { pgTable, uuid, text, boolean, timestamp, jsonb, index, vector } from 'drizzle-orm/pg-core';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { z } from 'zod';
import { companies } from './companies.js';
import { jobStatusEnum, jobTypeEnum, workplaceTypeEnum } from './enums.js';

export const jobSalarySchema = z.object({
  raw: z.string().optional(),
  currency: z.string().optional(), // EUR, USD, etc.
  min: z.number().optional(),
  max: z.number().optional(),
  period: z.enum(['hourly', 'monthly', 'yearly']).optional(),
  isPaid: z.boolean().optional(),
});

export type JobSalary = z.infer<typeof jobSalarySchema>;

export const jobClassificationSchema = z.object({
  isUniversityInternship: z.boolean().optional(),
  acceptsErasmusTraineeship: z.boolean().optional(),
  workingLanguage: z.string().optional(),
  domainFit: z.string().optional(),
  requiredTools: z.array(z.string()).default([]),
  keyTasks: z.array(z.string()).default([]),
  fitReasoning: z.string().optional(),
  calculatedFitScore: z.number().min(0).max(100).optional(),
});

export type JobClassification = z.infer<typeof jobClassificationSchema>;

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  externalId: text('external_id'),
  fingerprint: text('fingerprint').notNull().unique(), // SHA-256 hash for deduplication
  title: text('title').notNull(),
  normalizedTitle: text('normalized_title'),
  url: text('url').notNull(),
  canonicalUrl: text('canonical_url'),
  alternateUrls: jsonb('alternate_urls').$type<string[]>().notNull().default([]),
  locationRaw: text('location_raw'),
  normalizedLocation: text('normalized_location').default('Barcelona, Spain'),
  isBarcelona: boolean('is_barcelona').notNull().default(true),
  workplaceType: workplaceTypeEnum('workplace_type').notNull().default('unknown'),
  jobType: jobTypeEnum('job_type').notNull().default('internship'),
  department: text('department'),
  descriptionHtml: text('description_html'),
  descriptionText: text('description_text').notNull(),
  summary: text('summary'), // AI-generated bullet summary
  requirements: jsonb('requirements').$type<string[]>().notNull().default([]),
  skills: jsonb('skills').$type<string[]>().notNull().default([]),
  languages: jsonb('languages').$type<string[]>().notNull().default([]),
  salary: jsonb('salary').$type<JobSalary>().notNull().default({}),
  classification: jsonb('classification')
    .$type<JobClassification>()
    .notNull()
    .default({ requiredTools: [], keyTasks: [] }),
  rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull().default({}),
  embedding: vector('embedding', { dimensions: 1536 }),
  status: jobStatusEnum('status').notNull().default('active'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('jobs_company_id_idx').on(table.companyId),
  index('jobs_fingerprint_idx').on(table.fingerprint),
  index('jobs_status_idx').on(table.status),
  index('jobs_job_type_idx').on(table.jobType),
  index('jobs_is_barcelona_idx').on(table.isBarcelona),
  index('jobs_first_seen_at_idx').on(table.firstSeenAt),
  index('jobs_embedding_hnsw_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
]);

export type Job = InferSelectModel<typeof jobs>;
export type NewJob = InferInsertModel<typeof jobs>;
