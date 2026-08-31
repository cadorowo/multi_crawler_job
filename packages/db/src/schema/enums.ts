import { pgEnum } from 'drizzle-orm/pg-core';

export const atsProviderEnum = pgEnum('ats_provider', [
  'greenhouse',
  'lever',
  'ashby',
  'teamtailor',
  'factorial',
  'workable',
  'smartrecruiters',
  'recruitee',
  'personio',
  'workday',
  'custom',
  'other',
]);

export const workplaceTypeEnum = pgEnum('workplace_type', [
  'remote',
  'hybrid',
  'onsite',
  'unknown',
]);

export const jobTypeEnum = pgEnum('job_type', [
  'internship',
  'working_student',
  'graduate',
  'junior',
  'entry_level',
  'trainee',
  'unknown',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'active',
  'expired',
  'deleted',
  'draft',
  'archived',
]);

export const interactionStatusEnum = pgEnum('interaction_status', [
  'discovered',
  'notified',
  'viewed',
  'saved',
  'applied',
  'interviewing',
  'offered',
  'rejected',
  'dismissed',
]);

export const userFeedbackEnum = pgEnum('user_feedback', [
  'thumbs_up',
  'thumbs_down',
  'irrelevant_role',
  'irrelevant_location',
  'underqualified',
  'overqualified',
  'not_interested_company',
  'salary_too_low',
]);

export type AtsProvider = (typeof atsProviderEnum.enumValues)[number];
export type WorkplaceType = (typeof workplaceTypeEnum.enumValues)[number];
export type JobType = (typeof jobTypeEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type InteractionStatus = (typeof interactionStatusEnum.enumValues)[number];
export type UserFeedback = (typeof userFeedbackEnum.enumValues)[number];
