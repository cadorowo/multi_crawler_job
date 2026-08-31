import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { BaseAdapter } from '../base.js';
import {
  type AtsProvider,
  type CompanyAdapterTarget,
  type FetchJobsOptions,
  type AdapterFetchResult,
  type NormalizedJobPayload,
  type NormalizedSalary,
} from '../types.js';

export interface JobSpyRawRecord {
  id?: string;
  site?: string;
  job_url: string;
  job_url_direct?: string;
  title: string;
  company?: string;
  location?: string;
  date_posted?: string;
  job_type?: string;
  salary_source?: string;
  interval?: string;
  min_amount?: number;
  max_amount?: number;
  currency?: string;
  is_remote?: boolean;
  job_level?: string;
  job_function?: string;
  listing_type?: string;
  emails?: string[];
  description?: string;
  company_industry?: string;
  company_url?: string;
  company_logo?: string;
  company_url_direct?: string;
}

export class JobSpyAdapter extends BaseAdapter {
  readonly provider: AtsProvider = 'jobspy';

  private readonly scriptPath: string;

  constructor(customScriptPath?: string) {
    super();
    this.scriptPath =
      customScriptPath ||
      resolve(process.cwd(), 'scripts/scrape_jobspy.py');
  }

  async fetchJobs(
    target: CompanyAdapterTarget,
    options?: FetchJobsOptions
  ): Promise<AdapterFetchResult> {
    const startTime = Date.now();
    const searchTerm = target.atsIdentifier || 'UX UI Design Intern';
    const limit = options?.limit || 25;

    let rawRecords: JobSpyRawRecord[] = [];

    try {
      rawRecords = await this.executeJobSpyScript(searchTerm, limit);
    } catch (err: any) {
      console.warn(`[JobSpyAdapter] Aggregator scraping returned error: ${err.message}. Falling back to empty set.`);
      rawRecords = [];
    }

    const normalizedJobs = rawRecords.map((raw) => this.normalizeJob(raw, target));

    return {
      company: target,
      jobs: normalizedJobs,
      rawCount: rawRecords.length,
      fetchedAt: new Date(),
      durationMs: Date.now() - startTime,
    };
  }

  normalizeJob(raw: JobSpyRawRecord, target: CompanyAdapterTarget): NormalizedJobPayload {
    const applyUrl = raw.job_url_direct || raw.job_url;
    const fallbackId = createHash('md5').update(applyUrl || raw.title).digest('hex').slice(0, 16);
    const externalId = raw.id || fallbackId;

    const title = raw.title?.trim() || 'Untitled Role';
    const locationRaw = raw.location || 'Barcelona, Spain';

    let workplaceType = this.detectWorkplaceType(locationRaw, title);
    if (raw.is_remote) {
      workplaceType = 'remote';
    }

    const isBarcelona = this.detectBarcelona(locationRaw, workplaceType, target.isBarcelonaHq);
    const jobType = this.detectJobType(title, raw.description, raw.job_type || raw.job_level);

    const descriptionText = this.htmlToPlainText(raw.description || '');

    const postedAt = raw.date_posted ? new Date(raw.date_posted) : undefined;

    let salary: NormalizedSalary | undefined;
    if (raw.min_amount || raw.max_amount) {
      salary = {
        raw: `${raw.min_amount || ''} - ${raw.max_amount || ''} ${raw.currency || 'EUR'}`,
        currency: raw.currency || 'EUR',
        min: raw.min_amount,
        max: raw.max_amount,
        period:
          raw.interval?.toLowerCase() === 'yearly'
            ? 'yearly'
            : raw.interval?.toLowerCase() === 'monthly'
            ? 'monthly'
            : 'yearly',
        isPaid: true,
      };
    } else {
      salary = this.extractSalary(descriptionText);
    }

    return {
      externalId,
      title,
      url: applyUrl,
      canonicalUrl: raw.job_url,
      alternateUrls: raw.job_url_direct && raw.job_url !== raw.job_url_direct ? [raw.job_url] : [],
      locationRaw,
      normalizedLocation: isBarcelona ? 'Barcelona, Spain' : locationRaw,
      isBarcelona,
      workplaceType,
      jobType,
      department: raw.job_function || target.companyName,
      descriptionHtml: raw.description,
      descriptionText,
      salary,
      postedAt,
      rawPayload: raw as unknown as Record<string, unknown>,
    };
  }

  /**
   * Executes the Python JobSpy CLI subprocess and parses JSON output from stdout.
   */
  private executeJobSpyScript(searchTerm: string, limit: number): Promise<JobSpyRawRecord[]> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [
        this.scriptPath,
        '--search-term',
        searchTerm,
        '--location',
        'Barcelona, Spain',
        '--country-indeed',
        'Spain',
        '--results-wanted',
        String(limit),
        '--hours-old',
        '72',
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0 && stdout.trim().length === 0) {
          return reject(
            new Error(`JobSpy script exited with code ${code}: ${stderr}`)
          );
        }

        try {
          const parsed = JSON.parse(stdout.trim() || '[]');
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch (parseErr: any) {
          reject(new Error(`Failed to parse JobSpy stdout JSON: ${parseErr.message}\nStdout: ${stdout}\nStderr: ${stderr}`));
        }
      });

      pythonProcess.on('error', (err) => {
        reject(new Error(`Failed to spawn Python process: ${err.message}`));
      });
    });
  }
}
