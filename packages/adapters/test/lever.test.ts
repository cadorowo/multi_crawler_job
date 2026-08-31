import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LeverAdapter, type LeverPostingRaw } from '../src/adapters/lever.js';
import { type CompanyAdapterTarget } from '../src/types.js';

describe('LeverAdapter', () => {
  const target: CompanyAdapterTarget = {
    companyName: 'Kantox',
    companySlug: 'kantox',
    atsProvider: 'lever',
    atsIdentifier: 'kantox',
    isBarcelonaHq: true,
  };

  const fixturePath = resolve(__dirname, 'fixtures/ats/lever/sample-postings.json');
  const fixtureData: LeverPostingRaw[] = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  const adapter = new LeverAdapter();

  it('correctly normalizes a Lever posting with lists and categories', () => {
    const rawJob = fixtureData[0]!;
    const normalized = adapter.normalizeJob(rawJob, target);

    expect(normalized.externalId).toBe('e391b49a-5f33-4f2b-98b7-6b4512984ef2');
    expect(normalized.title).toBe('Junior Full Stack Developer / Intern');
    expect(normalized.url).toBe('https://jobs.lever.co/kantox/e391b49a-5f33-4f2b-98b7-6b4512984ef2');
    expect(normalized.alternateUrls).toContain('https://jobs.lever.co/kantox/e391b49a-5f33-4f2b-98b7-6b4512984ef2/apply');
    expect(normalized.isBarcelona).toBe(true);
    expect(normalized.workplaceType).toBe('hybrid');
    expect(normalized.jobType).toBe('internship');
    expect(normalized.department).toBe('Core Banking');
    expect(normalized.descriptionText).toContain('Requirements:');
    expect(normalized.descriptionText).toContain('Knowledge of Ruby, Python, or TypeScript.');
    expect(normalized.descriptionText).toContain('Competitive intern stipend provided.');
    expect(normalized.postedAt).toBeInstanceOf(Date);
  });
});
