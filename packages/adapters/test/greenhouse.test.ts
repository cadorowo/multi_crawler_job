import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GreenhouseAdapter, type GreenhouseApiResponse } from '../src/adapters/greenhouse.js';
import { type CompanyAdapterTarget } from '../src/types.js';

describe('GreenhouseAdapter', () => {
  const target: CompanyAdapterTarget = {
    companyName: 'Typeform',
    companySlug: 'typeform',
    atsProvider: 'greenhouse',
    atsIdentifier: 'typeform',
    isBarcelonaHq: true,
  };

  const fixturePath = resolve(__dirname, 'fixtures/ats/greenhouse/sample-jobs.json');
  const fixtureData: GreenhouseApiResponse = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  const adapter = new GreenhouseAdapter();

  it('correctly normalizes a standard Barcelona Greenhouse job', () => {
    const rawJob = fixtureData.jobs[0]!;
    const normalized = adapter.normalizeJob(rawJob, target);

    expect(normalized.externalId).toBe('4892019');
    expect(normalized.title).toBe('Software Engineer Intern - Backend (Summer 2026)');
    expect(normalized.url).toBe('https://boards.greenhouse.io/typeform/jobs/4892019');
    expect(normalized.isBarcelona).toBe(true);
    expect(normalized.normalizedLocation).toBe('Barcelona, Spain');
    expect(normalized.jobType).toBe('internship');
    expect(normalized.department).toBe('Engineering');
    expect(normalized.descriptionText).toContain('Join Typeform as a Backend Engineering Intern');
    expect(normalized.descriptionText).not.toContain('<p>');
    expect(normalized.salary?.min).toBe(24000);
    expect(normalized.salary?.max).toBe(28000);
    expect(normalized.salary?.period).toBe('yearly');
  });

  it('correctly normalizes a Remote (Spain) job', () => {
    const rawJob = fixtureData.jobs[1]!;
    const normalized = adapter.normalizeJob(rawJob, target);

    expect(normalized.externalId).toBe('4892020');
    expect(normalized.title).toBe('Product Design Intern');
    expect(normalized.workplaceType).toBe('remote');
    expect(normalized.isBarcelona).toBe(true);
    expect(normalized.jobType).toBe('internship');
    expect(normalized.department).toBe('Design');
  });
});
