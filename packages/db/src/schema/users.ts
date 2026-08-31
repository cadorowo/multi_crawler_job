import { pgTable, uuid, text, boolean, timestamp, jsonb, vector, index } from 'drizzle-orm/pg-core';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { z } from 'zod';

export const userProfileSchema = z.object({
  targetRoles: z.array(z.string()).default([
    'Software Engineering Intern',
    'Frontend Intern',
    'Full Stack Intern',
    'AI/ML Intern',
    'Product Design Intern',
    'Data Science Intern',
  ]),
  skills: z.array(z.string()).default(['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Python']),
  languages: z.array(z.string()).default(['English', 'Spanish']),
  preferredLocations: z.array(z.string()).default(['Barcelona', 'Sant Cugat', 'Remote']),
  remotePreference: z.enum(['remote', 'hybrid', 'onsite', 'any']).default('hybrid'),
  maxCommuteMinutes: z.number().optional(),
  educationLevel: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  graduationYear: z.number().optional(),
  visaRequired: z.boolean().default(false),
  portfolioUrl: z.string().url().optional().or(z.literal('')),
  githubUrl: z.string().url().optional().or(z.literal('')),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  bio: z.string().optional(),
  resumeRawText: z.string().optional(),
});

export type UserProfileData = z.infer<typeof userProfileSchema>;

export const userPreferencesSchema = z.object({
  notificationFrequency: z.enum(['instant', 'daily_digest', 'weekly']).default('instant'),
  minScoreThreshold: z.number().min(0).max(1).default(0.65),
  telegramNotificationsEnabled: z.boolean().default(true),
  quietHoursStart: z.string().optional(), // e.g. "22:00"
  quietHoursEnd: z.string().optional(), // e.g. "08:00"
  hardFilters: z.object({
    requiredKeywords: z.array(z.string()).optional(),
    excludedKeywords: z.array(z.string()).optional(),
    excludedCompanyIds: z.array(z.string()).optional(),
    mustBeInBarcelona: z.boolean().default(true),
    maxCommuteMinutes: z.number().optional(),
    requirePaidOnly: z.boolean().default(false),
  }).default({
    mustBeInBarcelona: true,
    requirePaidOnly: false,
  }),
});

export type UserPreferencesData = z.infer<typeof userPreferencesSchema>;

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  telegramId: text('telegram_id').notNull().unique(),
  telegramUsername: text('telegram_username'),
  telegramChatId: text('telegram_chat_id'),
  fullName: text('full_name'),
  email: text('email'),
  profile: jsonb('profile').$type<UserProfileData>().notNull().default({
    targetRoles: [
      'Software Engineering Intern',
      'Frontend Intern',
      'Full Stack Intern',
      'AI/ML Intern',
      'Product Design Intern',
      'Data Science Intern',
    ],
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Python'],
    languages: ['English', 'Spanish'],
    preferredLocations: ['Barcelona', 'Sant Cugat', 'Remote'],
    remotePreference: 'hybrid',
    visaRequired: false,
  }),
  preferences: jsonb('preferences').$type<UserPreferencesData>().notNull().default({
    notificationFrequency: 'instant',
    minScoreThreshold: 0.65,
    telegramNotificationsEnabled: true,
    hardFilters: {
      mustBeInBarcelona: true,
      requirePaidOnly: false,
    },
  }),
  embedding: vector('embedding', { dimensions: 1536 }),
  isActive: boolean('is_active').notNull().default(true),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('users_telegram_id_idx').on(table.telegramId),
  index('users_is_active_idx').on(table.isActive),
]);

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
