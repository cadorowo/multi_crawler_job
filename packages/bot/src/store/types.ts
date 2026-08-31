export type DisciplineKey =
  | 'ux_ui'
  | 'graphic'
  | 'marketing'
  | 'engineering'
  | 'data'
  | 'ai_ml'
  | 'finance'
  | 'operations';

export type ContractKey = 'erasmus' | 'convenio' | 'any';

export type LocationKey = 'barcelona' | 'spain' | 'europe';

export interface CandidateProfile {
  telegramId: number;
  telegramUsername: string;
  firstName: string;

  // Job search preferences
  discipline: DisciplineKey;
  university: string;
  country: string;
  contractTypes: ContractKey[];
  skills: string[];
  targetLocation: LocationKey;
  language: string;

  // Interaction history
  appliedIds: string[];
  savedIds: string[];
  dismissedIds: string[];

  // CV ingestion
  cvRawText?: string;
  cvExtractedSkills?: string[];
  cvExtractedUniversity?: string;
  cvFileName?: string;
  cvUploadedAt?: string;

  createdAt: string;
  updatedAt: string;
}

export interface JobItem {
  id: string;
  company: string;
  title: string;
  location: string;
  ats: string;
  contract: string;
  applyUrl: string;
  source?: string;
  score?: number;
  tools?: string[];
  description?: string;
}

export const DISCIPLINES: Record<DisciplineKey, { label: string; emoji: string; keywords: string[] }> = {
  ux_ui: {
    label: 'UX/UI & Product Design',
    emoji: '🎨',
    keywords: ['ux', 'ui', 'user experience', 'product design', 'interaction', 'figma', 'interface', 'wireframe', 'prototype'],
  },
  graphic: {
    label: 'Graphic & Visual Design',
    emoji: '🖼️',
    keywords: ['graphic', 'visual', 'brand', 'motion', 'illustrat', 'creative', 'art director', 'adobe', 'diseño'],
  },
  marketing: {
    label: 'Digital Marketing & Growth',
    emoji: '📣',
    keywords: ['marketing', 'seo', 'social media', 'growth', 'content', 'digital', 'paid', 'campaign', 'analytics'],
  },
  engineering: {
    label: 'Software Engineering',
    emoji: '💻',
    keywords: ['software', 'engineer', 'developer', 'frontend', 'backend', 'fullstack', 'react', 'typescript', 'python'],
  },
  data: {
    label: 'Data & Analytics',
    emoji: '📊',
    keywords: ['data analyst', 'bi', 'data science', 'sql', 'tableau', 'power bi', 'analytics', 'reporting'],
  },
  ai_ml: {
    label: 'AI & Machine Learning',
    emoji: '🤖',
    keywords: ['ai', 'machine learning', 'nlp', 'mlops', 'deep learning', 'llm', 'pytorch', 'tensorflow'],
  },
  finance: {
    label: 'Finance & Business',
    emoji: '💰',
    keywords: ['finance', 'accounting', 'investment', 'm&a', 'venture', 'financial analyst', 'treasury', 'controlling'],
  },
  operations: {
    label: 'Operations & HR',
    emoji: '⚙️',
    keywords: ['operations', 'hr', 'human resources', 'recruiter', 'talent', 'people', 'office manager', 'admin'],
  },
};

export const CONTRACTS: Record<ContractKey, { label: string; emoji: string }> = {
  erasmus: { label: 'Erasmus+ Traineeship', emoji: '🇪🇺' },
  convenio: { label: 'Convenio de Prácticas', emoji: '🇪🇸' },
  any: { label: 'Any Contract', emoji: '🔓' },
};

export const LOCATIONS: Record<LocationKey, { label: string; emoji: string }> = {
  barcelona: { label: 'Barcelona Only', emoji: '📌' },
  spain: { label: 'Anywhere in Spain', emoji: '🇪🇸' },
  europe: { label: 'All of Europe', emoji: '🌍' },
};
