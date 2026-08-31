import { describe, it, expect } from 'vitest';
import { MatcherService, type MatcherInput } from '../src/matcher.js';
import { type JobExtractionResult } from '../src/types.js';

describe('MatcherService - Hybrid Ranking & Score Calculator', () => {
  const matcher = MatcherService.getInstance();

  const mockCandidate = {
    targetRoles: ['UX/UI Design Intern', 'Frontend Engineering Intern'],
    skills: ['TypeScript', 'React', 'HTML/CSS', 'Tailwind'],
    tools: ['Figma', 'Framer'],
    requiresConvenio: true,
    englishOnly: false,
  };

  it('calculates a high composite score and triggers shouldNotify for a top match', () => {
    const extraction: JobExtractionResult = {
      is_university_internship: true,
      accepts_erasmus_traineeship: true,
      working_language: 'english',
      domain_fit: 'ux_ui_design',
      required_tools: ['Figma', 'React', 'Design Systems'],
      key_tasks_summary: [
        'Design responsive prototypes in Figma',
        'Help build reusable UI components',
      ],
      fit_reasoning: 'Perfect alignment with candidate design and frontend skills in Barcelona.',
      calculated_fit_score: 90,
    };

    const input: MatcherInput = {
      job: {
        title: 'Product Design & UI Intern',
        companyName: 'Typeform',
        companyTier: 1,
        url: 'https://careers.typeform.com/jobs/1234',
        locationRaw: 'Barcelona, Spain',
        isBarcelona: true,
        workplaceType: 'hybrid',
        descriptionText: 'Join Typeform as a design intern...',
      },
      extraction,
      candidate: mockCandidate,
      candidateEmbedding: [1, 0, 0, 0],
      jobEmbedding: [0.95, 0.05, 0, 0], // High cosine similarity
    };

    const result = matcher.calculateMatchScore(input);

    expect(result.overallScore).toBeGreaterThanOrEqual(80);
    expect(result.isHardFilterPassed).toBe(true);
    expect(result.shouldNotify).toBe(true);
    expect(result.matchingTools).toContain('Figma');
    expect(result.matchingTools).toContain('React');
    expect(result.telegramCardSummary).toContain('Typeform');
    expect(result.telegramCardSummary).toContain('Match Score:');
  });

  it('disqualifies a role outside Barcelona despite a high LLM fit score', () => {
    const extraction: JobExtractionResult = {
      is_university_internship: true,
      accepts_erasmus_traineeship: false,
      working_language: 'english',
      domain_fit: 'ux_ui_design',
      required_tools: ['Figma'],
      key_tasks_summary: ['Design mobile interfaces'],
      fit_reasoning: 'Great design role located in London.',
      calculated_fit_score: 85,
    };

    const input: MatcherInput = {
      job: {
        title: 'Design Intern',
        companyName: 'London Studio',
        companyTier: 2,
        url: 'https://careers.london.com/jobs/567',
        locationRaw: 'London, United Kingdom',
        isBarcelona: false, // Not Barcelona
        workplaceType: 'onsite',
        descriptionText: 'Must be present in our London office.',
      },
      extraction,
      candidate: mockCandidate,
    };

    const result = matcher.calculateMatchScore(input);

    expect(result.isHardFilterPassed).toBe(false);
    expect(result.shouldNotify).toBe(false);
    expect(result.disqualificationReason).toContain('Location is not in Barcelona');
  });

  it('disqualifies when candidate requires university agreement but role does not support it', () => {
    const extraction: JobExtractionResult = {
      is_university_internship: false, // No student agreement
      accepts_erasmus_traineeship: false,
      working_language: 'english',
      domain_fit: 'other_tech',
      required_tools: ['Python'],
      key_tasks_summary: ['Regular junior employment'],
      fit_reasoning: 'Requires standard permanent employment contract.',
      calculated_fit_score: 70,
    };

    const input: MatcherInput = {
      job: {
        title: 'Junior Developer',
        companyName: 'Bcn Startup',
        companyTier: 2,
        url: 'https://careers.bcn.com/jobs/999',
        locationRaw: 'Barcelona, Spain',
        isBarcelona: true,
        workplaceType: 'hybrid',
        descriptionText: 'Regular employment.',
      },
      extraction,
      candidate: { ...mockCandidate, requiresConvenio: true },
    };

    const result = matcher.calculateMatchScore(input);

    expect(result.isHardFilterPassed).toBe(false);
    expect(result.shouldNotify).toBe(false);
    expect(result.disqualificationReason).toContain('convenio');
  });

  it('does not notify when overall score is below the 60 threshold', () => {
    const extraction: JobExtractionResult = {
      is_university_internship: true,
      accepts_erasmus_traineeship: true,
      working_language: 'english',
      domain_fit: 'other_tech',
      required_tools: ['C++', 'Embedded Linux'],
      key_tasks_summary: ['Low-level firmware testing'],
      fit_reasoning: 'Low relevance to web/design candidate.',
      calculated_fit_score: 30,
    };

    const input: MatcherInput = {
      job: {
        title: 'Firmware Testing Intern',
        companyName: 'Hardware Co',
        companyTier: 3,
        url: 'https://careers.hardware.com/jobs/111',
        locationRaw: 'Barcelona, Spain',
        isBarcelona: true,
        workplaceType: 'onsite',
        descriptionText: 'Firmware testing internship...',
      },
      extraction,
      candidate: mockCandidate,
      candidateEmbedding: [1, 0, 0, 0],
      jobEmbedding: [0.1, 0.9, 0, 0], // Low similarity
    };

    const result = matcher.calculateMatchScore(input);

    expect(result.overallScore).toBeLessThan(60);
    expect(result.shouldNotify).toBe(false);
  });
});
