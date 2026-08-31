import { describe, it, expect } from 'vitest';
import { EmbedderService } from '../src/embedder.js';

describe('EmbedderService - Cosine Similarity & Helpers', () => {
  it('correctly calculates cosine similarity for identical and orthogonal vectors', () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];
    const vecD = [0.7071, 0.7071, 0];

    expect(EmbedderService.cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 4);
    expect(EmbedderService.cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0, 4);
    expect(EmbedderService.cosineSimilarity(vecA, vecD)).toBeCloseTo(0.7071, 3);
  });

  it('normalizes vectors to unit length', () => {
    const raw = [3, 4, 0];
    const normalized = EmbedderService.normalizeVector(raw);

    expect(normalized[0]).toBeCloseTo(0.6, 4);
    expect(normalized[1]).toBeCloseTo(0.8, 4);
    expect(normalized[2]).toBe(0);
  });

  it('formats job embedding input correctly', () => {
    const text = EmbedderService.buildJobEmbeddingInput({
      title: 'Frontend Intern',
      companyName: 'Glovo',
      department: 'Engineering',
      location: 'Barcelona, Spain',
      requiredTools: ['React', 'TypeScript', 'Figma'],
      descriptionText: 'Help develop UI components for YellowPark.',
    });

    expect(text).toContain('Job Title: Frontend Intern');
    expect(text).toContain('Company: Glovo');
    expect(text).toContain('Tools/Skills: React, TypeScript, Figma');
    expect(text).toContain('Help develop UI components for YellowPark.');
  });
});
