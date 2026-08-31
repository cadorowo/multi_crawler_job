/**
 * Paseo bridge — controlled JobFinder ↔ AGY integration.
 *
 * Paseo is the intelligence bridge, not a second Telegram bot. The JobFinder
 * grammY process owns Telegram polling and calls this service for natural
 * language requests. AGY never writes application state directly: callers
 * validate its output and persist changes through the application services.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const execFileAsync = promisify(execFile);

export interface PaseoRequest {
  prompt: string;
  conversationId?: string | null;
  jsonSchema?: string;
}

interface StructuredSchema<T> {
  parse(value: unknown): T;
}

export class PaseoBridge {
  private readonly binary: string;
  private readonly workspace: string;
  private readonly timeoutMs: number;
  private readonly sandboxed: boolean;
  private readonly autoApprovePermissions: boolean;

  constructor() {
    this.binary = process.env.AGY_BIN || 'agy';
    this.workspace = resolve(process.cwd(), '../../');
    this.timeoutMs = Number(process.env.PASEO_AGY_TIMEOUT_MS || 5 * 60 * 1000);
    this.sandboxed = process.env.PASEO_AGY_SANDBOX !== 'false';
    this.autoApprovePermissions = process.env.PASEO_AGY_SKIP_PERMISSIONS === 'true';
  }

  async run(request: PaseoRequest): Promise<string> {
    const args = ['--print', request.prompt, '--mode', 'plan'];

    // A missing conversation deliberately creates an isolated one-turn session.
    // This avoids the old global --continue behaviour leaking context between users.
    if (request.conversationId) {
      args.push('--conversation', request.conversationId);
    }
    if (request.jsonSchema) {
      args.push('--json-schema', request.jsonSchema, '--output-format', 'json');
    }
    if (this.sandboxed) args.push('--sandbox');
    if (this.autoApprovePermissions) args.push('--dangerously-skip-permissions');

    const { stdout, stderr } = await execFileAsync(this.binary, args, {
      cwd: this.workspace,
      timeout: this.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    const output = (stdout || '').trim() || (stderr || '').trim();
    return output || '_(nessuna risposta da Paseo)_';
  }

  async runStructured<T>(schema: StructuredSchema<T>, request: Omit<PaseoRequest, 'jsonSchema'>): Promise<T> {
    const output = await this.run({
      ...request,
      prompt: `${request.prompt}\n\nReturn ONLY one valid JSON object. Do not use markdown fences or explanatory text.`,
    });

    return schema.parse(parseJsonObject(output));
  }
}

export const paseoBridge = new PaseoBridge();

function parseJsonObject(output: string): unknown {
  const cleaned = output
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1));
    }
    throw new Error('Paseo did not return a valid JSON object.');
  }
}
