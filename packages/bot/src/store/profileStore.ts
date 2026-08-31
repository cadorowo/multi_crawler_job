import * as fs from 'node:fs';
import { resolve } from 'node:path';
import type { CandidateProfile, DisciplineKey, ContractKey } from './types.js';

const PROFILES_FILE = resolve(process.cwd(), 'src/store/profiles.json');

function readAll(): Record<string, CandidateProfile> {
  try {
    return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, CandidateProfile>) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getProfile(telegramId: number): CandidateProfile | null {
  const all = readAll();
  return all[String(telegramId)] ?? null;
}

export function saveProfile(profile: CandidateProfile): void {
  const all = readAll();
  profile.updatedAt = new Date().toISOString();
  all[String(profile.telegramId)] = profile;
  writeAll(all);
}

export function createProfile(
  telegramId: number,
  telegramUsername: string,
  firstName: string,
  discipline: DisciplineKey,
  contractTypes: ContractKey[],
  targetCities: string[] = ['Milan', 'Barcelona'],
  targetRoles: string[] = [],
  skills: string[] = [],
  university = '',
  country = '',
  language = 'English',
  environment: 'startup' | 'scaleup' | 'any' = 'any',
): CandidateProfile {
  const now = new Date().toISOString();
  return {
    telegramId,
    telegramUsername,
    firstName,
    discipline,
    targetCities,
    targetRoles,
    university,
    country,
    contractTypes,
    skills,
    language,
    environment,
    appliedIds: [],
    savedIds: [],
    dismissedIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateProfile(telegramId: number, patch: Partial<CandidateProfile>): CandidateProfile | null {
  const profile = getProfile(telegramId);
  if (!profile) return null;
  const updated = { ...profile, ...patch, updatedAt: new Date().toISOString() };
  saveProfile(updated);
  return updated;
}

export function markApplied(telegramId: number, jobId: string) {
  const p = getProfile(telegramId);
  if (!p) return;
  if (!p.appliedIds.includes(jobId)) p.appliedIds.push(jobId);
  saveProfile(p);
}

export function markSaved(telegramId: number, jobId: string) {
  const p = getProfile(telegramId);
  if (!p) return;
  if (!p.savedIds.includes(jobId)) p.savedIds.push(jobId);
  saveProfile(p);
}

export function markDismissed(telegramId: number, jobId: string) {
  const p = getProfile(telegramId);
  if (!p) return;
  if (!p.dismissedIds.includes(jobId)) p.dismissedIds.push(jobId);
  saveProfile(p);
}

export function getAllProfiles(): CandidateProfile[] {
  return Object.values(readAll());
}
