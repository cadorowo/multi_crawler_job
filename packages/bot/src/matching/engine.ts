import * as fs from 'node:fs';
import { resolve } from 'node:path';
import type { CandidateProfile, JobItem } from '../store/types.js';
import { DISCIPLINES } from '../store/types.js';

const JOBS_FILE = resolve(process.cwd(), '../../dashboard/jobs_data.json');

function loadJobs(): JobItem[] {
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

// Map of top European tech companies to their official websites
const COMPANY_WEBSITES: Record<string, string> = {
  alea: 'https://alea.com',
  omnicomhealth: 'https://omnicomhealthgroup.com',
  remedyedgespain: 'https://remedyedge.com',
  glovo: 'https://glovoapp.com',
  typeform: 'https://typeform.com',
  travelperk: 'https://travelperk.com',
  wallapop: 'https://wallapop.com',
  bendingspoons: 'https://bendingspoons.com',
  adform: 'https://adform.com',
  cuatrecasas: 'https://cuatrecasas.com',
  cityjoboffers: 'https://cityjoboffers.com',
  coldculture: 'https://coldcultureworldwide.com',
  rituals: 'https://rituals.com',
  n26: 'https://n26.com',
  factorial: 'https://factorialhr.com',
  adevinta: 'https://adevinta.com',
  amazon: 'https://amazon.jobs',
};

export function getCompanyWebsite(companyName: string): string {
  const norm = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, url] of Object.entries(COMPANY_WEBSITES)) {
    if (norm.includes(key) || key.includes(norm)) return url;
  }
  return `https://${norm}.com`;
}

export function scoreJob(job: JobItem, profile: CandidateProfile): number {
  let score = 50;
  const disc = DISCIPLINES[profile.discipline];
  const titleLower = (job.title || '').toLowerCase();
  const descLower = (job.description || '').toLowerCase();
  const locLower = (job.location || '').toLowerCase();
  const contractLower = (job.contract || '').toLowerCase();

  // 1. Discipline & Role Alignment (+15 in title, +6 in desc)
  if (disc) {
    for (const kw of disc.keywords) {
      if (titleLower.includes(kw)) { score += 15; break; }
    }
    for (const kw of disc.keywords) {
      if (descLower.includes(kw)) { score += 6; break; }
    }
  }

  // 2. Specific Target Roles
  if (profile.targetRoles && profile.targetRoles.length > 0) {
    for (const role of profile.targetRoles) {
      if (titleLower.includes(role.toLowerCase())) { score += 10; break; }
    }
  }

  // 3. User skills match (+5 each, max +20)
  let skillBonus = 0;
  for (const skill of profile.skills) {
    if (titleLower.includes(skill.toLowerCase()) || descLower.includes(skill.toLowerCase())) {
      skillBonus = Math.min(skillBonus + 5, 20);
    }
  }
  score += skillBonus;

  // 4. City / Location matching
  const targetCities = profile.targetCities && profile.targetCities.length > 0
    ? profile.targetCities.map(c => c.toLowerCase())
    : ['milan', 'barcelona'];

  let matchedCity = false;
  for (const city of targetCities) {
    if (city === 'europe' || city === 'all') {
      score += 5;
      matchedCity = true;
      break;
    }
    if (city === 'remote' && (locLower.includes('remote') || descLower.includes('remote'))) {
      score += 15;
      matchedCity = true;
      break;
    }
    if (locLower.includes(city) || descLower.includes(city)) {
      score += 15;
      matchedCity = true;
      break;
    }
  }

  if (!matchedCity && !targetCities.includes('europe')) {
    score -= 10;
  }

  // 5. Contract match
  const wantsErasmus = profile.contractTypes.includes('erasmus');
  const wantsStage = profile.contractTypes.includes('stage_curriculare');
  const wantsConvenio = profile.contractTypes.includes('convenio');
  const wantsAny = profile.contractTypes.includes('any');

  if (wantsAny) score += 5;
  if (wantsErasmus && contractLower.includes('erasmus')) score += 10;
  if (wantsStage && (contractLower.includes('stage') || contractLower.includes('tirocinio'))) score += 10;
  if (wantsConvenio && contractLower.includes('convenio')) score += 10;

  return Math.max(0, Math.min(98, score));
}

export function getTopMatches(
  profile: CandidateProfile,
  count = 5,
  offset = 0,
): Array<JobItem & { tailoredScore: number; companyWebsite: string }> {
  const jobs = loadJobs();

  return jobs
    .filter(j => !profile.dismissedIds.includes(j.id))
    .filter(j => !profile.appliedIds.includes(j.id))
    .map(j => ({
      ...j,
      tailoredScore: scoreJob(j, profile),
      companyWebsite: job.companyWebsite || getCompanyWebsite(j.company),
    }))
    .sort((a, b) => b.tailoredScore - a.tailoredScore)
    .slice(offset, offset + count);
}

export function searchJobs(
  query: string,
  profile: CandidateProfile | null,
  count = 5,
): Array<JobItem & { tailoredScore: number; companyWebsite: string }> {
  const jobs = loadJobs();
  const q = query.toLowerCase();

  const filtered = jobs.filter(j => {
    const t = ((j.title || '') + ' ' + (j.description || '') + ' ' + (j.company || '') + ' ' + (j.location || '')).toLowerCase();
    return t.includes(q);
  });

  return filtered
    .filter(j => !profile?.dismissedIds.includes(j.id))
    .map(j => ({
      ...j,
      tailoredScore: profile ? scoreJob(j, profile) : (j.score ?? 75),
      companyWebsite: j.companyWebsite || getCompanyWebsite(j.company),
    }))
    .sort((a, b) => b.tailoredScore - a.tailoredScore)
    .slice(0, count);
}
