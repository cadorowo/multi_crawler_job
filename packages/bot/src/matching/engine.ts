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

export function scoreJob(job: JobItem, profile: CandidateProfile): number {
  let score = 50;
  const disc = DISCIPLINES[profile.discipline];
  const titleLower = (job.title || '').toLowerCase();
  const descLower = (job.description || '').toLowerCase();
  const locLower = (job.location || '').toLowerCase();
  const contractLower = (job.contract || '').toLowerCase();

  // 1. Discipline keyword match in title (+15) or description (+6)
  for (const kw of disc.keywords) {
    if (titleLower.includes(kw)) { score += 15; break; }
  }
  for (const kw of disc.keywords) {
    if (descLower.includes(kw)) { score += 6; break; }
  }

  // 2. User skills match (+5 each, max +20)
  let skillBonus = 0;
  for (const skill of profile.skills) {
    if (titleLower.includes(skill.toLowerCase()) || descLower.includes(skill.toLowerCase())) {
      skillBonus = Math.min(skillBonus + 5, 20);
    }
  }
  score += skillBonus;

  // 3. Location preference
  if (profile.targetLocation === 'barcelona') {
    if (locLower.includes('barcelona')) score += 15;
    else score -= 20; // penalise non-Barcelona heavily
  } else if (profile.targetLocation === 'spain') {
    if (locLower.includes('barcelona') || locLower.includes('spain') || locLower.includes('madrid')) score += 10;
  } else {
    score += 5; // europe — mild boost for anything
  }

  // 4. Contract match
  const wantsErasmus = profile.contractTypes.includes('erasmus');
  const wantsConvenio = profile.contractTypes.includes('convenio');
  const wantsAny = profile.contractTypes.includes('any');
  if (wantsAny) score += 3;
  if (wantsErasmus && contractLower.includes('erasmus')) score += 10;
  if (wantsConvenio && contractLower.includes('convenio')) score += 10;

  return Math.max(0, Math.min(98, score));
}

export function getTopMatches(
  profile: CandidateProfile,
  count = 5,
  offset = 0,
): Array<JobItem & { tailoredScore: number }> {
  const jobs = loadJobs();

  return jobs
    .filter(j => !profile.dismissedIds.includes(j.id))
    .filter(j => !profile.appliedIds.includes(j.id))
    .map(j => ({ ...j, tailoredScore: scoreJob(j, profile) }))
    .sort((a, b) => b.tailoredScore - a.tailoredScore)
    .slice(offset, offset + count);
}

export function searchJobs(
  query: string,
  profile: CandidateProfile | null,
  count = 5,
): Array<JobItem & { tailoredScore: number }> {
  const jobs = loadJobs();
  const q = query.toLowerCase();

  const filtered = jobs.filter(j => {
    const t = ((j.title || '') + ' ' + (j.description || '') + ' ' + (j.company || '')).toLowerCase();
    return t.includes(q);
  });

  if (!profile) {
    return filtered.slice(0, count).map(j => ({ ...j, tailoredScore: j.score ?? 70 }));
  }

  return filtered
    .filter(j => !profile.dismissedIds.includes(j.id))
    .map(j => ({ ...j, tailoredScore: scoreJob(j, profile) }))
    .sort((a, b) => b.tailoredScore - a.tailoredScore)
    .slice(0, count);
}
