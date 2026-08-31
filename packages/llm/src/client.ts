import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load .env from root or local
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config();

export interface LlmClientOptions {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
}

export class LlmClient {
  private static instance: LlmClient;
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(options?: LlmClientOptions) {
    const apiKey =
      options?.apiKey ||
      process.env.OPENCODE_API_KEY ||
      process.env.OPENAI_API_KEY ||
      'dummy-key-for-test-environments';

    const baseURL =
      options?.baseURL ||
      process.env.OPENCODE_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      undefined;

    this.defaultModel =
      options?.defaultModel ||
      process.env.OPENCODE_MODEL ||
      process.env.OPENAI_MODEL ||
      'gpt-4o-mini';

    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  public static getInstance(): LlmClient {
    if (!LlmClient.instance) {
      LlmClient.instance = new LlmClient();
    }
    return LlmClient.instance;
  }

  public getModelName(): string {
    return this.defaultModel;
  }

  public getRawClient(): OpenAI {
    return this.client;
  }

  /**
   * Generates structured JSON output validated against a Zod schema with automatic retries and json markdown parsing.
   */
  public async generateStructuredOutput<T>(
    schema: z.ZodType<T, any, any>,
    systemPrompt: string,
    userPrompt: string,
    options?: {
      model?: string;
      temperature?: number;
      maxRetries?: number;
    }
  ): Promise<T> {
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.1;
    const maxRetries = options?.maxRetries ?? 3;

    let attempt = 0;
    let lastError: Error | null = null;

    const fullSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must respond ONLY with valid JSON conforming to the requested schema. Do NOT include markdown code blocks (such as \`\`\`json) if possible, or provide raw parseable JSON.`;

    while (attempt < maxRetries) {
      try {
        const response = await this.client.chat.completions.create({
          model,
          temperature,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: fullSystemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });

        const rawContent = response.choices[0]?.message?.content?.trim();
        if (!rawContent) {
          throw new Error('LLM returned an empty response.');
        }

        // Clean potential markdown wrappers if present
        let cleanedJson = rawContent;
        if (cleanedJson.startsWith('```json')) {
          cleanedJson = cleanedJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedJson.startsWith('```')) {
          cleanedJson = cleanedJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const parsedJson = JSON.parse(cleanedJson);
        return schema.parse(parsedJson);
      } catch (err: any) {
        attempt++;
        lastError = err;
        console.warn(
          `[LlmClient] Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying...`
        );
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    }

    throw new Error(
      `[LlmClient] Failed to generate structured output after ${maxRetries} attempts. Last error: ${lastError?.message}`
    );
  }

  /**
   * Generates free-form text completion.
   */
  public async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: {
      model?: string;
      temperature?: number;
      maxRetries?: number;
    }
  ): Promise<string> {
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.3;

    const response = await this.client.chat.completions.create({
      model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }
}

export function getLlmClient(): LlmClient {
  return LlmClient.getInstance();
}
