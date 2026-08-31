import { describe, it, expect } from 'vitest';
import { AdapterFactory, getAdapter } from '../src/factory.js';
import { GreenhouseAdapter } from '../src/adapters/greenhouse.js';
import { LeverAdapter } from '../src/adapters/lever.js';
import { AshbyAdapter } from '../src/adapters/ashby.js';
import { TeamtailorAdapter } from '../src/adapters/teamtailor.js';
import { FactorialAdapter } from '../src/adapters/factorial.js';
import { WorkableAdapter } from '../src/adapters/workable.js';

describe('AdapterFactory', () => {
  it('instantiates and provides all 6 ATS adapters', () => {
    const factory = AdapterFactory.getInstance();

    expect(factory.get('greenhouse')).toBeInstanceOf(GreenhouseAdapter);
    expect(factory.get('lever')).toBeInstanceOf(LeverAdapter);
    expect(factory.get('ashby')).toBeInstanceOf(AshbyAdapter);
    expect(factory.get('teamtailor')).toBeInstanceOf(TeamtailorAdapter);
    expect(factory.get('factorial')).toBeInstanceOf(FactorialAdapter);
    expect(factory.get('workable')).toBeInstanceOf(WorkableAdapter);

    expect(getAdapter('greenhouse')).toBeInstanceOf(GreenhouseAdapter);
  });

  it('throws an error when an unregistered provider is requested', () => {
    const factory = AdapterFactory.getInstance();
    expect(() => factory.get('other' as any)).toThrowError(/No adapter registered/);
  });
});

describe('BaseAdapter Utility Helpers', () => {
  const adapter = new GreenhouseAdapter();

  describe('htmlToPlainText', () => {
    it('strips html tags, decodes entities, and collapses newlines', () => {
      const html = '<h3>Role Overview:</h3><p>We are &amp; looking for &quot;top&quot; talent.<br/>Apply now!</p>';
      const text = adapter.htmlToPlainText(html);

      expect(text).toContain('Role Overview:');
      expect(text).toContain('We are & looking for "top" talent.');
      expect(text).toContain('Apply now!');
      expect(text).not.toContain('<p>');
      expect(text).not.toContain('&amp;');
    });
  });

  describe('detectBarcelona', () => {
    it('detects Barcelona city variants and nearby commuting hubs', () => {
      expect(adapter.detectBarcelona('Barcelona, Spain')).toBe(true);
      expect(adapter.detectBarcelona('Sant Cugat del Vallès, Catalonia')).toBe(true);
      expect(adapter.detectBarcelona('Hospitalet de Llobregat')).toBe(true);
      expect(adapter.detectBarcelona('Madrid, Spain')).toBe(false);
      expect(adapter.detectBarcelona('London, UK')).toBe(false);
      expect(adapter.detectBarcelona('Spain (Remote)', 'remote')).toBe(true);
      expect(adapter.detectBarcelona(undefined, 'hybrid', true)).toBe(true); // Barcelona HQ company fallback
    });
  });

  describe('detectWorkplaceType', () => {
    it('identifies remote, hybrid, and onsite patterns', () => {
      expect(adapter.detectWorkplaceType('Barcelona (Hybrid)', 'Developer')).toBe('hybrid');
      expect(adapter.detectWorkplaceType('Spain', '100% Remote React Intern')).toBe('remote');
      expect(adapter.detectWorkplaceType('Barcelona Office', 'On-site QA Engineer')).toBe('onsite');
      expect(adapter.detectWorkplaceType('Barcelona', 'Software Engineer')).toBe('unknown');
    });
  });

  describe('detectJobType', () => {
    it('classifies internships, working students, trainees, and junior positions', () => {
      expect(adapter.detectJobType('Software Engineer Intern')).toBe('internship');
      expect(adapter.detectJobType('Beca Desarrollo Web (Prácticas)')).toBe('internship');
      expect(adapter.detectJobType('Werkstudent / Working Student Backend')).toBe('working_student');
      expect(adapter.detectJobType('Management Trainee 2026')).toBe('trainee');
      expect(adapter.detectJobType('Junior Frontend Developer')).toBe('junior');
      expect(adapter.detectJobType('Senior Lead Architect')).toBe('unknown');
    });
  });

  describe('extractSalary', () => {
    it('parses salary ranges when present', () => {
      const salary = adapter.extractSalary('Stipend: €1,200 - €1,800 / month for candidates');
      expect(salary?.min).toBe(1200);
      expect(salary?.max).toBe(1800);
      expect(salary?.currency).toBe('EUR');
      expect(salary?.period).toBe('monthly');
      expect(salary?.isPaid).toBe(true);
    });

    it('identifies unpaid positions', () => {
      const unpaid = adapter.extractSalary('This is an unpaid academic internship');
      expect(unpaid?.isPaid).toBe(false);
    });
  });
});
