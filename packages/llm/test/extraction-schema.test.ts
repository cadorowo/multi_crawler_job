import { describe, it, expect } from 'vitest';
import {
  jobExtractionSchema,
  candidateExtractionSchema,
  type JobExtractionResult,
} from '../src/types.js';

describe('JobExtractionSchema & CandidateExtractionSchema Validation', () => {
  it('validates a complete, valid job extraction payload', () => {
    const validJobData = {
      is_university_internship: true,
      accepts_erasmus_traineeship: true,
      working_language: 'english',
      domain_fit: 'ux_ui_design',
      required_tools: ['Figma', 'Framer', 'Design Tokens', 'Tailwind CSS'],
      key_tasks_summary: [
        'Design responsive web user interfaces in Figma',
        'Maintain and expand component design system',
        'Collaborate closely with frontend engineers',
      ],
      fit_reasoning:
        'Outstanding UX/UI internship with international team in Barcelona working in English.',
      calculated_fit_score: 92,
    };

    const parsed = jobExtractionSchema.parse(validJobData);
    expect(parsed.domain_fit).toBe('ux_ui_design');
    expect(parsed.calculated_fit_score).toBe(92);
    expect(parsed.required_tools).toContain('Figma');
    expect(parsed.is_university_internship).toBe(true);
  });

  it('rejects invalid domain_fit enum values', () => {
    const invalidJobData = {
      is_university_internship: true,
      accepts_erasmus_traineeship: false,
      working_language: 'spanish',
      domain_fit: 'crypto_trading', // Invalid domain
      required_tools: [],
      key_tasks_summary: [],
      fit_reasoning: 'Invalid domain test',
      calculated_fit_score: 50,
    };

    expect(() => jobExtractionSchema.parse(invalidJobData)).toThrow();
  });

  it('validates candidate extraction schema', () => {
    const candidateData = {
      fullName: 'Alex River',
      currentStatus: 'Undergraduate Computer Science Student',
      targetRoles: ['Frontend Intern', 'UX Engineer Intern'],
      primarySkills: ['TypeScript', 'React', 'HTML/CSS', 'Python'],
      designTools: ['Figma', 'Framer'],
      developmentTools: ['VS Code', 'Git', 'Docker'],
      languages: [
        { language: 'English', proficiency: 'fluent' as const },
        { language: 'Spanish', proficiency: 'native' as const },
      ],
      education: [
        {
          degree: 'BSc in Software Engineering',
          institution: 'Universitat Politècnica de Catalunya',
          graduationYear: 2026,
        },
      ],
      erasmusEligible: true,
      summary: 'Design-minded frontend engineering student.',
    };

    const parsed = candidateExtractionSchema.parse(candidateData);
    expect(parsed.fullName).toBe('Alex River');
    expect(parsed.primarySkills).toContain('TypeScript');
    expect(parsed.erasmusEligible).toBe(true);
  });
});
