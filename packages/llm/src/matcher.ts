import {
  type JobExtractionResult,
  type MatchScoreResult,
} from './types.js';
import { EmbedderService } from './embedder.js';

export interface MatcherInput {
  job: {
    id?: string;
    title: string;
    companyName: string;
    companyTier?: number;
    url: string;
    locationRaw?: string;
    isBarcelona: boolean;
    workplaceType?: string;
    descriptionText: string;
  };
  extraction: JobExtractionResult;
  candidate: {
    targetRoles: string[];
    skills: string[];
    tools: string[];
    requiresConvenio?: boolean;
    englishOnly?: boolean;
  };
  candidateEmbedding?: number[];
  jobEmbedding?: number[];
}

export class MatcherService {
  private static instance: MatcherService;

  public static getInstance(): MatcherService {
    if (!MatcherService.instance) {
      MatcherService.instance = new MatcherService();
    }
    return MatcherService.instance;
  }

  /**
   * Calculates the hybrid composite match score combining:
   * - Semantic Vector Similarity (40%)
   * - LLM Fit Score (40%)
   * - Domain & Profile Preference Boost (20%)
   */
  public calculateMatchScore(input: MatcherInput): MatchScoreResult {
    const { job, extraction, candidate, candidateEmbedding, jobEmbedding } = input;

    // 1. Vector Semantic Score (40%)
    let semanticSimilarity = 0.7; // default baseline if embeddings not available
    if (candidateEmbedding && jobEmbedding) {
      semanticSimilarity = EmbedderService.cosineSimilarity(candidateEmbedding, jobEmbedding);
    }
    const vectorComponent = Math.min(40, Math.max(0, semanticSimilarity * 40));

    // 2. LLM Fit Score (40%)
    const llmScoreRaw = extraction.calculated_fit_score || 50;
    const llmComponent = Math.min(40, Math.max(0, (llmScoreRaw / 100) * 40));

    // 3. User Preference & Domain Boost (20%)
    let preferenceBoost = 0;

    // Domain Boost
    switch (extraction.domain_fit) {
      case 'ux_ui_design':
      case 'ai_design':
        preferenceBoost += 10;
        break;
      case 'automation_website_design':
        preferenceBoost += 8;
        break;
      case 'other_tech':
        preferenceBoost += 5;
        break;
      case 'unrelated':
        preferenceBoost -= 20;
        break;
    }

    // Company Tier Boost
    const tier = job.companyTier || 2;
    if (tier === 1) {
      preferenceBoost += 5;
    } else if (tier === 2) {
      preferenceBoost += 3;
    } else {
      preferenceBoost += 1;
    }

    // Tool Overlap Analysis
    const jobTools = (extraction.required_tools || []).map((t) => t.toLowerCase());
    const candidateTools = candidate.tools.map((t) => t.toLowerCase());
    const matchingTools: string[] = [];
    const missingTools: string[] = [];

    for (const tool of extraction.required_tools || []) {
      const toolLower = tool.toLowerCase();
      if (
        candidateTools.some((ct) => toolLower.includes(ct) || ct.includes(toolLower)) ||
        candidate.skills.some((s) => toolLower.includes(s.toLowerCase()))
      ) {
        matchingTools.push(tool);
      } else {
        missingTools.push(tool);
      }
    }

    if (matchingTools.length > 0) {
      preferenceBoost += Math.min(5, matchingTools.length * 1.5);
    }

    const preferenceComponent = Math.min(20, Math.max(0, preferenceBoost));

    // Total Score calculation
    const rawTotal = vectorComponent + llmComponent + preferenceComponent;
    const overallScore = Math.min(100, Math.max(0, Math.round(rawTotal)));

    // Hard Filter Evaluation
    let isHardFilterPassed = true;
    let disqualificationReason: string | undefined;

    if (!job.isBarcelona) {
      isHardFilterPassed = false;
      disqualificationReason = 'Location is not in Barcelona metropolitan area or remote Spain.';
    } else if (extraction.domain_fit === 'unrelated') {
      isHardFilterPassed = false;
      disqualificationReason = 'Domain classified as completely unrelated.';
    } else if (candidate.requiresConvenio && !extraction.is_university_internship) {
      isHardFilterPassed = false;
      disqualificationReason = 'Candidate requires university agreement (convenio) but role does not accommodate students.';
    } else if (candidate.englishOnly && extraction.working_language === 'other') {
      isHardFilterPassed = false;
      disqualificationReason = 'Working language is incompatible with English requirements.';
    }

    const shouldNotify = overallScore >= 60 && isHardFilterPassed;

    // Build Telegram Card
    const telegramCardSummary = this.formatTelegramCard({
      jobTitle: job.title,
      companyName: job.companyName,
      location: job.locationRaw || 'Barcelona, Spain',
      workplaceType: job.workplaceType || 'hybrid',
      jobUrl: job.url,
      overallScore,
      domainFit: extraction.domain_fit,
      keyTasks: extraction.key_tasks_summary,
      matchingTools,
      missingTools,
      isUniversity: extraction.is_university_internship,
      acceptsErasmus: extraction.accepts_erasmus_traineeship,
      language: extraction.working_language,
      reasoning: extraction.fit_reasoning,
    });

    return {
      overallScore,
      semanticSimilarity,
      llmFitScore: llmScoreRaw,
      userPreferenceBoost: Math.round(preferenceBoost),
      isHardFilterPassed,
      disqualificationReason,
      shouldNotify,
      domainFit: extraction.domain_fit,
      matchingTools,
      missingTools,
      matchReasoning: extraction.fit_reasoning,
      telegramCardSummary,
    };
  }

  /**
   * Formats a match into a clear Telegram message card.
   */
  public formatTelegramCard(card: {
    jobTitle: string;
    companyName: string;
    location: string;
    workplaceType: string;
    jobUrl: string;
    overallScore: number;
    domainFit: string;
    keyTasks: string[];
    matchingTools: string[];
    missingTools: string[];
    isUniversity: boolean;
    acceptsErasmus: boolean;
    language: string;
    reasoning: string;
  }): string {
    const scoreEmoji = card.overallScore >= 80 ? '🔥' : card.overallScore >= 65 ? '✨' : '💡';
    const domainLabel = card.domainFit.replace(/_/g, ' ').toUpperCase();

    const tasksBullets = card.keyTasks.map((t) => `• ${t}`).join('\n');
    const matchingToolsText =
      card.matchingTools.length > 0 ? card.matchingTools.join(', ') : 'General tech skills';
    const uniBadge = card.isUniversity ? '🎓 University Agreement / Convenio' : '💼 Direct Internship';
    const erasmusBadge = card.acceptsErasmus ? '🇪🇺 Erasmus+ Friendly' : '';

    return `${scoreEmoji} *${card.jobTitle}*
🏢 *${card.companyName}* | 📍 _${card.location}_ (${card.workplaceType})
🎯 *Match Score:* ${card.overallScore}% (${domainLabel})

${uniBadge} ${erasmusBadge ? `| ${erasmusBadge}` : ''}
🗣 *Language:* ${card.language.toUpperCase()}

📋 *Key Responsibilities:*
${tasksBullets}

🛠 *Matching Tools:* ${matchingToolsText}
💬 *Why it fits:* ${card.reasoning}

🔗 [Apply on Company Careers](${card.jobUrl})`;
  }
}

export function getMatcher(): MatcherService {
  return MatcherService.getInstance();
}
