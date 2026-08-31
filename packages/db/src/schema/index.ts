import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { companies } from './companies.js';
import { jobs } from './jobs.js';
import { userJobInteractions } from './user-job-interactions.js';

// Re-export all schema tables and enums
export * from './enums.js';
export * from './users.js';
export * from './companies.js';
export * from './jobs.js';
export * from './user-job-interactions.js';

// Drizzle Relations
export const usersRelations = relations(users, ({ many }) => ({
  interactions: many(userJobInteractions),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  company: one(companies, {
    fields: [jobs.companyId],
    references: [companies.id],
  }),
  interactions: many(userJobInteractions),
}));

export const userJobInteractionsRelations = relations(userJobInteractions, ({ one }) => ({
  user: one(users, {
    fields: [userJobInteractions.userId],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [userJobInteractions.jobId],
    references: [jobs.id],
  }),
}));
