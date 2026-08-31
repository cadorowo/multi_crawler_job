import { pgTable, uuid, text, timestamp, jsonb, doublePrecision, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { z } from 'zod';
import { users } from './users.js';
import { jobs } from './jobs.js';
import { interactionStatusEnum, userFeedbackEnum } from './enums.js';

export const matchAnalysisSchema = z.object({
  overallScore: z.number().min(0).max(1),
  semanticSimilarity: z.number().min(0).max(1),
  deterministicScore: z.number().min(0).max(1),
  matchingSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  recommendationExplanation: z.string(),
  suggestedCoverLetterPoints: z.array(z.string()).optional(),
});

export type MatchAnalysis = z.infer<typeof matchAnalysisSchema>;

export const userJobInteractions = pgTable('user_job_interactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  matchScore: doublePrecision('match_score').notNull().default(0.0), // 0.00 to 1.00
  semanticScore: doublePrecision('semantic_score'),
  deterministicScore: doublePrecision('deterministic_score'),
  matchReasons: jsonb('match_reasons').$type<string[]>().notNull().default([]),
  matchAnalysis: jsonb('match_analysis').$type<MatchAnalysis>(),
  status: interactionStatusEnum('status').notNull().default('discovered'),
  userNotes: text('user_notes'),
  userFeedback: userFeedbackEnum('user_feedback'),
  feedbackText: text('feedback_text'),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  interactedAt: timestamp('interacted_at', { withTimezone: true }),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('user_job_interactions_user_job_unique').on(table.userId, table.jobId),
  index('user_job_interactions_user_id_idx').on(table.userId),
  index('user_job_interactions_job_id_idx').on(table.jobId),
  index('user_job_interactions_status_idx').on(table.status),
  index('user_job_interactions_match_score_idx').on(table.matchScore),
]);

export type UserJobInteraction = InferSelectModel<typeof userJobInteractions>;
export type NewUserJobInteraction = InferInsertModel<typeof userJobInteractions>;
