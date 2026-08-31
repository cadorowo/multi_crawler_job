import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JobSpyAdapter, type JobSpyRawRecord } from '../src/adapters/jobspy.js';
import { type CompanyAdapterTarget } from '../src/types.js';

describe('JobSpyAdapter', () => {
  const target: CompanyAdapterTarget = {
    companyName: 'Barcelona Aggregator',
    companySlug: 'jobspy-aggregator',
    atsProvider: 'jobspy',
    atsIdentifier: 'UX UI Design Intern',
    isBarcelonaHq: true,
  };

  const fixturePath = resolve(__dirname, 'fixtures/ats/jobspy/sample-jobs.json');
  const fixtureData: JobSpyRawRecord[] = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  const adapter = new JobSpyAdapter();

  it('correctly normalizes a JobSpy aggregator record', () => {
    const rawJob = fixtureData[0]!;
    const normalized = adapter.normalizeJob(rawJob, target);

    expect(normalized.externalId).toBe('li-job-89218');
    expect(normalized.title).toBe('UX / UI Design Intern - AI Products');
    expect(normalized.url).toBe('https://careers.barcelonastudio.com/jobs/89218');
    expect(normalized.canonicalUrl).toBe('https://www.linkedin.com/jobs/view/89218');
    expect(normalized.isBarcelona).toBe(true);
    expect(normalized.jobType).toBe('internship');
    expect(normalized.salary?.min).toBe(1000);
    expect(normalized.salary?.max).toBe(1400);
    expect(normalized.salary?.currency).toBe('EUR');
    expect(normalized.salary?.period).toBe('monthly');
    expect(normalized.descriptionText).toContain('UX / UI Design Intern');
    expect(normalized.descriptionText).toContain('Design responsive web interfaces.');
  });
});
