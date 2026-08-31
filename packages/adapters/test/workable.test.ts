import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorkableAdapter, type WorkableWidgetResponse } from '../src/adapters/workable.js';
import { type CompanyAdapterTarget } from '../src/types.js';

describe('WorkableAdapter', () => {
  const target: CompanyAdapterTarget = {
    companyName: 'Lodgify',
    companySlug: 'lodgify',
    atsProvider: 'workable',
    atsIdentifier: 'lodgify',
    isBarcelonaHq: true,
  };

  const fixturePath = resolve(__dirname, 'fixtures/ats/workable/sample-widget.json');
  const fixtureData: WorkableWidgetResponse = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  const adapter = new WorkableAdapter();

  it('correctly normalizes a Workable widget account payload', () => {
    const rawJob = fixtureData.jobs![0]!;
    const normalized = adapter.normalizeJob(rawJob, target);

    expect(normalized.externalId).toBe('LDGFY-INT-2026');
    expect(normalized.title).toBe('Software Developer Intern - Backend (Java / .NET)');
    expect(normalized.url).toBe('https://apply.workable.com/lodgify/j/LDGFY-INT-2026/');
    expect(normalized.alternateUrls).toContain('https://apply.workable.com/lodgify/j/LDGFY-INT-2026/apply/');
    expect(normalized.isBarcelona).toBe(true);
    expect(normalized.workplaceType).toBe('hybrid');
    expect(normalized.jobType).toBe('internship');
    expect(normalized.department).toBe('Engineering');
    expect(normalized.descriptionText).toContain('Lodgify is seeking a motivated Software Developer Intern');
    expect(normalized.descriptionText).toContain('Paid internship with mentorship');
    expect(normalized.postedAt).toBeInstanceOf(Date);
  });
});
