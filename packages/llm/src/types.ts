import { z } from 'zod';

export const jobExtractionSchema = z.object({
  is_university_internship: z
    .boolean()
    .describe(
      'True if this role requires or accommodates a university agreement / convenio de prácticas / active student status'
    ),
  accepts_erasmus_traineeship: z
    .boolean()
    .describe(
      'True if Erasmus+ traineeship / European student traineeships are acceptable or feasible'
    ),
  working_language: z
    .enum(['english', 'spanish', 'catalan', 'bilingual', 'other'])
    .describe('Primary working language expected'),
  domain_fit: z
    .enum([
      'ux_ui_design',
      'automation_website_design',
      'ai_design',
      'other_tech',
      'unrelated',
    ])
    .describe('Domain classification of the role'),
  required_tools: z
    .array(z.string())
    .default([])
    .describe(
      'Key design, development, and AI tools required (e.g. Figma, Framer, React, TypeScript, Python, etc.)'
    ),
  key_tasks_summary: z
    .array(z.string())
    .max(5)
    .default([])
    .describe('3 to 5 concise bullet points summarizing the core responsibilities'),
  fit_reasoning: z
    .string()
    .describe(
      'Clear reasoning explaining why this job fits or does not fit a design/engineering student candidate in Barcelona'
    ),
  calculated_fit_score: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Score from 0-100 indicating relevance and quality for the target candidate profile'
    ),
});

export type JobExtractionResult = z.infer<typeof jobExtractionSchema>;

export const candidateExtractionSchema = z.object({
  fullName: z.string().optional(),
  currentStatus: z.string().describe('e.g. University student, recent graduate'),
  targetRoles: z.array(z.string()).default([]),
  primarySkills: z.array(z.string()).default([]),
  designTools: z.array(z.string()).default([]),
  developmentTools: z.array(z.string()).default([]),
  languages: z
    .array(
      z.object({
        language: z.string(),
        proficiency: z.enum(['native', 'fluent', 'working_proficiency', 'basic']),
      })
    )
    .default([]),
  education: z
    .array(
      z.object({
        degree: z.string(),
        institution: z.string(),
        graduationYear: z.number().optional(),
      })
    )
    .default([]),
  erasmusEligible: z.boolean().default(true),
  summary: z.string(),
});

export type CandidateExtractionResult = z.infer<typeof candidateExtractionSchema>;

export interface MatchScoreResult {
  overallScore: number; // 0 - 100
  semanticSimilarity: number; // 0.0 - 1.0 (cosine similarity)
  llmFitScore: number; // 0 - 100
  userPreferenceBoost: number; // -20 to +20
  isHardFilterPassed: boolean;
  disqualificationReason?: string;
  shouldNotify: boolean; // overallScore >= 60 && isHardFilterPassed
  domainFit:
    | 'ux_ui_design'
    | 'automation_website_design'
    | 'ai_design'
    | 'other_tech'
    | 'unrelated';
  matchingTools: string[];
  missingTools: string[];
  matchReasoning: string;
  telegramCardSummary: string;
}

export interface BouncerPreFilterResult {
  passed: boolean;
  matchedKeywords: string[];
  negativeKeywords: string[];
  reason: string;
}

export interface BouncerResult {
  passed: boolean;
  stage: 'pass1_regex' | 'pass2_llm';
  preFilter: BouncerPreFilterResult;
  extraction?: JobExtractionResult;
  rejectionReason?: string;
}
