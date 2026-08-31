import { pgTable, uuid, text, boolean, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { z } from 'zod';
import { atsProviderEnum } from './enums.js';

export const companyMetadataSchema = z.object({
  description: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  sizeRange: z.string().optional(), // e.g. "50-200", "500-1000"
  fundingStage: z.string().optional(), // e.g. "Series B", "Public", "Bootstrapped"
  glassdoorRating: z.number().optional(),
  techStack: z.array(z.string()).optional(),
  perks: z.array(z.string()).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type CompanyMetadata = z.infer<typeof companyMetadataSchema>;

export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  website: text('website'),
  careersUrl: text('careers_url'),
  atsProvider: atsProviderEnum('ats_provider').notNull().default('other'),
  atsIdentifier: text('ats_identifier'), // Board token / slug in ATS API
  atsApiEndpoint: text('ats_api_endpoint'),
  location: text('location').notNull().default('Barcelona, Spain'),
  isBarcelonaHq: boolean('is_barcelona_hq').notNull().default(false),
  hasBarcelonaOffice: boolean('has_barcelona_office').notNull().default(true),
  industry: text('industry'),
  tier: integer('tier').notNull().default(1), // 1 = Tier 1 / Priority, 2 = Tier 2, 3 = Tier 3
  metadata: jsonb('metadata').$type<CompanyMetadata>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  lastScrapedAt: timestamp('last_scraped_at', { withTimezone: true }),
  scrapeErrorCount: integer('scrape_error_count').notNull().default(0),
  lastScrapeError: text('last_scrape_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('companies_slug_idx').on(table.slug),
  index('companies_ats_provider_idx').on(table.atsProvider),
  index('companies_tier_idx').on(table.tier),
  index('companies_is_active_idx').on(table.isActive),
]);

export type Company = InferSelectModel<typeof companies>;
export type NewCompany = InferInsertModel<typeof companies>;
