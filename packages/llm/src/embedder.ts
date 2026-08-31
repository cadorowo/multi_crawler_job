import { getLlmClient, LlmClient } from './client.js';

export class EmbedderService {
  private static instance: EmbedderService;
  private readonly llmClient: LlmClient;
  private readonly model = 'text-embedding-3-small';

  constructor(llmClient?: LlmClient) {
    this.llmClient = llmClient || getLlmClient();
  }

  public static getInstance(): EmbedderService {
    if (!EmbedderService.instance) {
      EmbedderService.instance = new EmbedderService();
    }
    return EmbedderService.instance;
  }

  /**
   * Generates a 1536-dimensional vector embedding for a given text.
   */
  public async embedText(text: string): Promise<number[]> {
    const cleaned = text.replace(/\n+/g, ' ').trim().slice(0, 8000);
    const client = this.llmClient.getRawClient();

    const response = await client.embeddings.create({
      model: this.model,
      input: cleaned,
      encoding_format: 'float',
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error('Failed to generate embedding for input text.');
    }

    return embedding;
  }

  /**
   * Generates embeddings in batches to respect rate limits and token windows.
   */
  public async embedBatch(texts: string[], batchSize = 30): Promise<number[][]> {
    const results: number[][] = [];
    const client = this.llmClient.getRawClient();

    for (let i = 0; i < texts.length; i += batchSize) {
      const chunk = texts
        .slice(i, i + batchSize)
        .map((t) => t.replace(/\n+/g, ' ').trim().slice(0, 8000));

      const response = await client.embeddings.create({
        model: this.model,
        input: chunk,
        encoding_format: 'float',
      });

      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);

      results.push(...embeddings);
    }

    return results;
  }

  /**
   * Computes cosine similarity between two vectors. Returns a value between -1.0 and 1.0 (normally 0.0 to 1.0 for normalized embeddings).
   */
  public static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i]!;
      const b = vecB[i]!;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.max(0, Math.min(1, similarity)); // Clamp between 0.0 and 1.0
  }

  /**
   * Normalizes vector to unit length (L2 norm).
   */
  public static normalizeVector(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
  }

  /**
   * Prepares a high-density summary text representation of a job for embedding.
   */
  public static buildJobEmbeddingInput(job: {
    title: string;
    companyName?: string;
    department?: string;
    location?: string;
    descriptionText: string;
    requiredTools?: string[];
  }): string {
    const header = [
      `Job Title: ${job.title}`,
      job.companyName ? `Company: ${job.companyName}` : '',
      job.department ? `Department: ${job.department}` : '',
      job.location ? `Location: ${job.location}` : '',
      job.requiredTools && job.requiredTools.length > 0
        ? `Tools/Skills: ${job.requiredTools.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join(' | ');

    // Use header plus first ~1500 characters of description
    const body = job.descriptionText.slice(0, 1500).replace(/\s+/g, ' ');
    return `${header}\n\nDescription:\n${body}`;
  }

  /**
   * Prepares a high-density summary text representation of a candidate for embedding.
   */
  public static buildCandidateEmbeddingInput(candidate: {
    targetRoles: string[];
    skills: string[];
    tools?: string[];
    bio?: string;
  }): string {
    const roles = `Target Roles: ${candidate.targetRoles.join(', ')}`;
    const skills = `Skills & Technologies: ${candidate.skills.join(', ')}`;
    const tools = candidate.tools?.length ? `Design & Dev Tools: ${candidate.tools.join(', ')}` : '';
    const bio = candidate.bio ? `Bio: ${candidate.bio}` : '';

    return [roles, skills, tools, bio].filter(Boolean).join('\n');
  }
}

export function getEmbedder(): EmbedderService {
  return EmbedderService.getInstance();
}
