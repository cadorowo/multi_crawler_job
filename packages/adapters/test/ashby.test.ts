import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AshbyAdapter, type AshbyApiResponse } from '../src/adapters/ashby.js';
import { type CompanyAdapterTarget } from '../src/types.js';

describe('AshbyAdapter', () => {
  const target: CompanyAdapterTarget = {
    companyName: 'Coverflex',
    companySlug: 'coverflex',
    atsProvider: 'ashby',
    atsIdentifier: 'coverflex',
    isBarcelonaHq: false,
  };

  const fixturePath = resolve(__dirname, 'fixtures/ats/ashby/sample-jobs.json');
  const fixtureData: AshbyApiResponse = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  const adapter = new AshbyAdapter();

  it('correctly normalizes an Ashby job posting with compensation details and secondary locations', () => {
    const rawJob = fixtureData.jobs[0]!;
    const normalized = adapter.normalizeJob(rawJob, target);

    expect(normalized.externalId).toBe('c88f2190-7d31-48e2-9ef8-823901b22301');
    expect(normalized.title).toBe('Software Engineering Intern - Frontend');
    expect(normalized.url).toBe('https://jobs.ashbyhq.com/coverflex/c88f2190-7d31-48e2-9ef8-823901b22301');
    expect(normalized.alternateUrls).toContain('https://jobs.ashbyhq.com/coverflex/c88f2190-7d31-48e2-9ef8-823901b22301/application');
    expect(normalized.locationRaw).toContain('Sant Cugat del Vallès');
    expect(normalized.isBarcelona).toBe(true);
    expect(normalized.jobType).toBe('internship');
    expect(normalized.department).toBe('Product Engineering');
    expect(normalized.salary?.min).toBe(1200);
    expect(normalized.salary?.max).toBe(1500);
    expect(normalized.salary?.period).toBe('monthly');
    expect(normalized.salary?.currency).toBe('EUR');
    expect(normalized.postedAt).toBeInstanceOf(Date);
  });
});
