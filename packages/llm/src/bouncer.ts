import {
  type BouncerPreFilterResult,
  type BouncerResult,
  type JobExtractionResult,
  jobExtractionSchema,
} from './types.js';
import { getLlmClient, LlmClient } from './client.js';

export class BouncerService {
  private static instance: BouncerService;
  private readonly llmClient: LlmClient;

  // Pass 1: Positive internship and student keyword regexes
  private readonly POSITIVE_PATTERNS = [
    /\bintern\b/i,
    /\binternship\b/i,
    /\binterns\b/i,
    /\bbeca\b/i,
    /\bbecas\b/i,
    /\bbecari[oa]s?\b/i,
    /\bpr[áa]cticas?\b/i,
    /\bconvenio\b/i,
    /\btrainee\b/i,
    /\btraineeship\b/i,
    /\bworking\s+student\b/i,
    /\bwerkstudent\b/i,
    /\btirocini[oa]s?\b/i,
    /\bstagiaires?\b/i,
    /\b(stage\s+curriculare|stage\s+extracurriculare|contrat\s+de\s+stage)\b/i,
    /\bestudiante\b/i,
    /\bstudent\b/i,
    /\bgraduate\s+program\b/i,
    /\bdual\s+study\b/i,
  ];

  // Pass 1: Strict senior disqualifier regexes
  private readonly NEGATIVE_PATTERNS = [
    /\bsenior\b/i,
    /\blead\b/i,
    /\bprincipal\b/i,
    /\bdirector\b/i,
    /\bhead\s+of\b/i,
    /\bvice\s+president\b/i,
    /\bvp\b/i,
    /\bstaff\s+engineer\b/i,
    /\bmanager\b/i,
    /\barchitect\b/i,
    /\bhead\b/i,
  ];

  constructor(llmClient?: LlmClient) {
    this.llmClient = llmClient || getLlmClient();
  }

  public static getInstance(): BouncerService {
    if (!BouncerService.instance) {
      BouncerService.instance = new BouncerService();
    }
    return BouncerService.instance;
  }

  /**
   * Pass 1: Fast deterministic regex pre-filter.
   * Evaluates if a posting qualifies as an internship / junior / student role.
   */
  public runPass1Regex(title: string, descriptionText = ''): BouncerPreFilterResult {
    const titleClean = title.trim();
    const fullText = `${titleClean} ${descriptionText.slice(0, 2000)}`;

    const matchedPositive: string[] = [];
    const matchedNegative: string[] = [];
    const matchedPositiveInTitle: string[] = [];

    for (const pattern of this.POSITIVE_PATTERNS) {
      if (pattern.test(titleClean)) {
        matchedPositiveInTitle.push(pattern.source);
        matchedPositive.push(pattern.source);
      } else if (pattern.test(fullText)) {
        matchedPositive.push(pattern.source);
      }
    }

    for (const pattern of this.NEGATIVE_PATTERNS) {
      if (pattern.test(titleClean)) {
        matchedNegative.push(pattern.source);
      }
    }

    const hasSeniorTitle = matchedNegative.length > 0;
    const hasInternTitle = matchedPositiveInTitle.length > 0;
    const hasInternAnywhere = matchedPositive.length > 0;

    // If the title contains Senior/Director/Head/Manager, only allow if the TITLE explicitly contains intern
    if (hasSeniorTitle && !hasInternTitle) {
      return {
        passed: false,
        matchedKeywords: matchedPositive,
        negativeKeywords: matchedNegative,
        reason: `Disqualified: Senior/Management title [${matchedNegative.join(', ')}]`,
      };
    }

    if (!hasInternAnywhere) {
      return {
        passed: false,
        matchedKeywords: [],
        negativeKeywords: matchedNegative,
        reason: 'No internship or student keywords matched in title or description.',
      };
    }

    return {
      passed: true,
      matchedKeywords: matchedPositive,
      negativeKeywords: matchedNegative,
      reason: `Matched positive internship keywords: [${matchedPositive.join(', ')}]`,
    };
  }

  /**
   * Pass 2: Structured LLM extraction and deep eligibility verification.
   */
  public async runPass2Llm(job: {
    title: string;
    companyName?: string;
    location?: string;
    descriptionText: string;
  }): Promise<JobExtractionResult> {
    const systemPrompt = `You are an expert recruiter specializing in university internships and junior opportunities worldwide.
Your role is to analyze the provided job posting and extract structured facts with high precision.

    Extraction Rules:
1. is_university_internship: true if explicitly mentioned or suitable for active students / requires university enrollment.
2. accepts_erasmus_traineeship: true if European students / Erasmus+ grant holders can apply or work in English/hybrid setup.
3. working_language: classify as english, spanish, catalan, bilingual, or other.
    4. domain_fit: classify as ux_ui_design, automation_website_design, ai_design, other_tech, engineering, data_ai, marketing, finance, operations, business, or unrelated.
5. required_tools: list specific technologies and design tools found (Figma, Framer, React, TypeScript, Python, Node, Next.js, etc.).
6. key_tasks_summary: 3 to 5 clear, concise bullet points summarizing actual responsibilities.
7. fit_reasoning: 2-3 sentences explaining why this role is or isn't a great match for a tech/design intern.
    8. calculated_fit_score: integer from 0 to 100 representing internship relevance and evidence quality, not a claim of compatibility with an unknown user.`;

    const userPrompt = `Job Title: ${job.title}
Company: ${job.companyName || 'Unknown'}
Location: ${job.location || 'Unknown location'}

Description:
${job.descriptionText.slice(0, 5000)}`;

    return this.llmClient.generateStructuredOutput(
      jobExtractionSchema,
      systemPrompt,
      userPrompt,
      { temperature: 0.1 }
    );
  }

  /**
   * Complete 2-Pass Bouncer execution.
   */
  public async evaluateJob(job: {
    title: string;
    companyName?: string;
    location?: string;
    descriptionText: string;
  }): Promise<BouncerResult> {
    // Pass 1: Regex Pre-filter
    const preFilter = this.runPass1Regex(job.title, job.descriptionText);
    if (!preFilter.passed) {
      return {
        passed: false,
        stage: 'pass1_regex',
        preFilter,
        rejectionReason: preFilter.reason,
      };
    }

    // Pass 2: Structured LLM Extraction
    try {
      const extraction = await this.runPass2Llm(job);

      const isUnrelated = extraction.domain_fit === 'unrelated';
      const isLowFit = extraction.calculated_fit_score < 35;

      if (isUnrelated || isLowFit) {
        return {
          passed: false,
          stage: 'pass2_llm',
          preFilter,
          extraction,
          rejectionReason: `LLM classified role as ${extraction.domain_fit} with low fit score (${extraction.calculated_fit_score}/100): ${extraction.fit_reasoning}`,
        };
      }

      return {
        passed: true,
        stage: 'pass2_llm',
        preFilter,
        extraction,
      };
    } catch (err: any) {
      console.error('[BouncerService] Pass 2 LLM extraction failed:', err);
      // If LLM fails, we allow Pass 1 result with a fallback
      return {
        passed: true,
        stage: 'pass1_regex',
        preFilter,
        rejectionReason: `LLM evaluation error: ${err.message}`,
      };
    }
  }
}

export function getBouncer(): BouncerService {
  return BouncerService.getInstance();
}
