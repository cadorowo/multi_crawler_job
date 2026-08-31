import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TeamtailorAdapter, type TeamtailorResponse } from '../src/adapters/teamtailor.js';
import { type CompanyAdapterTarget } from '../src/types.js';

describe('TeamtailorAdapter', () => {
  const target: CompanyAdapterTarget = {
    companyName: 'Domestic Data Streamers',
    companySlug: 'domestic-data-streamers',
    atsProvider: 'teamtailor',
    atsIdentifier: 'domesticstreamers',
    isBarcelonaHq: true,
  };

  const fixturePath = resolve(__dirname, 'fixtures/ats/teamtailor/sample-jobs.json');
  const fixtureData: TeamtailorResponse = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  const adapter = new TeamtailorAdapter();

  it('correctly normalizes a Teamtailor JSON:API payload', () => {
    const rawJob = fixtureData.data![0]!;
    const normalized = adapter.normalizeJob(rawJob, target);

    expect(normalized.externalId).toBe('782910');
    expect(normalized.title).toBe('Data Science & AI Intern');
    expect(normalized.url).toBe('https://domesticstreamers.teamtailor.com/jobs/782910-data-science-ai-intern');
    expect(normalized.isBarcelona).toBe(true);
    expect(normalized.workplaceType).toBe('hybrid');
    expect(normalized.jobType).toBe('internship');
    expect(normalized.department).toBe('Research & Creative Tech');
    expect(normalized.descriptionText).toContain('Domestic Data Streamers is looking for a curious AI & Data Design Intern in Poblenou, Barcelona.');
  });
});
