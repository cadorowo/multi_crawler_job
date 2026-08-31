import { describe, it, expect } from 'vitest';
import { BouncerService } from '../src/bouncer.js';

describe('BouncerService - Pass 1 Regex Pre-filter', () => {
  const bouncer = new BouncerService();

  it('accepts positive internship and student role titles', () => {
    const positiveTitles = [
      'Software Engineer Intern',
      'UX/UI Design Internship (Summer 2026)',
      'Beca Desarrollador Web Frontend',
      'Prácticas Universitarias - Diseño de Producto',
      'Working Student - AI Research',
      'Trainee Full Stack Developer',
      'Stagiaire UX Designer',
      'Convenio de Prácticas en Ingeniería',
    ];

    for (const title of positiveTitles) {
      const result = bouncer.runPass1Regex(title);
      expect(result.passed, `Expected title "${title}" to pass`).toBe(true);
      expect(result.matchedKeywords.length).toBeGreaterThan(0);
    }
  });

  it('rejects senior and executive positions with no internship keywords', () => {
    const seniorTitles = [
      'Senior Backend Engineer',
      'Lead Product Designer',
      'Principal Software Architect',
      'Director of Engineering',
      'VP of Product',
      'Head of Design',
      'Staff Data Scientist',
      'Engineering Manager',
    ];

    for (const title of seniorTitles) {
      const result = bouncer.runPass1Regex(title);
      expect(result.passed, `Expected senior title "${title}" to be rejected`).toBe(false);
    }
  });

  it('rejects generic regular jobs with no student or intern keywords', () => {
    const regularTitles = [
      'React Developer',
      'Account Executive',
      'Office Manager',
      'Customer Support Specialist',
    ];

    for (const title of regularTitles) {
      const result = bouncer.runPass1Regex(title, 'We are looking for full-time regular employees.');
      expect(result.passed, `Expected title "${title}" to be rejected`).toBe(false);
    }
  });

  it('passes when positive keyword is in the description body', () => {
    const title = 'Frontend Developer';
    const description = 'This is an internship position open for university students looking for a 6-month placement.';
    const result = bouncer.runPass1Regex(title, description);

    expect(result.passed).toBe(true);
  });
});
