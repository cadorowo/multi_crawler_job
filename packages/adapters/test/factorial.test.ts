import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FactorialAdapter, type FactorialApiResponse } from '../src/adapters/factorial.js';
import { type CompanyAdapterTarget } from '../src/types.js';

describe('FactorialAdapter', () => {
  const target: CompanyAdapterTarget = {
    companyName: 'Factorial',
    companySlug: 'factorial',
    atsProvider: 'factorial',
    atsIdentifier: 'factorial',
    isBarcelonaHq: true,
  };

  const fixturePath = resolve(__dirname, 'fixtures/ats/factorial/sample-postings.json');
  const fixtureData: FactorialApiResponse = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  const adapter = new FactorialAdapter();

  it('correctly normalizes a Factorial HR job posting', () => {
    const rawJob = fixtureData.data![0]!;
    const normalized = adapter.normalizeJob(rawJob, target);

    expect(normalized.externalId).toBe('fac-job-501');
    expect(normalized.title).toBe('Junior Product Designer (Prácticas / Intern)');
    expect(normalized.url).toBe('https://factorial.factorialhr.com/job_postings/fac-job-501');
    expect(normalized.isBarcelona).toBe(true);
    expect(normalized.workplaceType).toBe('hybrid');
    expect(normalized.jobType).toBe('internship');
    expect(normalized.department).toBe('Design');
    expect(normalized.descriptionText).toContain('Factorial is looking for a talented Product Design Intern');
    expect(normalized.postedAt).toBeInstanceOf(Date);
  });
});
