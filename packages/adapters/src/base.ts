import {
  type AtsProvider,
  type CompanyAdapterTarget,
  type FetchJobsOptions,
  type AdapterFetchResult,
  type NormalizedJobPayload,
  type WorkplaceType,
  type JobType,
  type NormalizedSalary,
} from './types.js';

export abstract class BaseAdapter {
  abstract readonly provider: AtsProvider;

  /**
   * Fetches and normalizes all jobs for a target company from its ATS public endpoint.
   */
  abstract fetchJobs(
    target: CompanyAdapterTarget,
    options?: FetchJobsOptions
  ): Promise<AdapterFetchResult>;

  /**
   * Transforms a single raw ATS job posting object into the standardized NormalizedJobPayload.
   */
  abstract normalizeJob(raw: any, target: CompanyAdapterTarget): NormalizedJobPayload;

  /**
   * HTTP request executor with automatic retry, exponential backoff, jitter, timeout, and 429 rate limit handling.
   */
  protected async fetchWithRetry<T = unknown>(
    url: string,
    options: RequestInit = {},
    maxRetries = 3,
    initialBackoffMs = 500
  ): Promise<T> {
    const timeoutMs = 15000;
    let attempt = 0;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Accept: 'application/json, text/plain, */*',
            'User-Agent': 'Barcelona-Internship-Bot/1.0 (+https://github.com/bcn-intern-bot)',
            ...options.headers,
          },
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return (await response.json()) as T;
        }

        // Handle rate limiting (429) or transient server errors (500, 502, 503, 504)
        if (response.status === 429 || (response.status >= 500 && response.status <= 504)) {
          if (attempt === maxRetries) {
            throw new Error(
              `[${this.provider}] HTTP ${response.status} (${response.statusText}) after ${maxRetries} retries for URL: ${url}`
            );
          }

          let waitTime = initialBackoffMs * Math.pow(2, attempt) + Math.random() * 200;
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) {
            const seconds = parseInt(retryAfter, 10);
            if (!isNaN(seconds)) {
              waitTime = seconds * 1000;
            }
          }

          console.warn(
            `[${this.provider}] Received HTTP ${response.status} for ${url}. Retrying in ${Math.round(waitTime)}ms (attempt ${attempt + 1}/${maxRetries})...`
          );

          await new Promise((resolve) => setTimeout(resolve, waitTime));
          attempt++;
          continue;
        }

        throw new Error(
          `[${this.provider}] HTTP ${response.status} (${response.statusText}) for URL: ${url}`
        );
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err.name === 'AbortError') {
          console.warn(`[${this.provider}] Request timed out after ${timeoutMs}ms for ${url}`);
        }

        if (attempt === maxRetries) {
          throw new Error(
            `[${this.provider}] Failed to fetch from ${url} after ${maxRetries} retries. Cause: ${err.message}`
          );
        }

        const waitTime = initialBackoffMs * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        attempt++;
      }
    }

    throw new Error(`[${this.provider}] Max retries exceeded for URL: ${url}`);
  }

  /**
   * Cleans HTML markup into readable, plain text by stripping tags and unescaping common HTML entities.
   */
  public htmlToPlainText(html?: string): string {
    if (!html) return '';

    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<\/p>|<\/div>|<br\s*\/?>|<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  /**
   * Deterministically determines if a job posting is located in Barcelona or nearby commuting area / remote Spain.
   */
  public detectBarcelona(
    locationText?: string,
    workplaceType: WorkplaceType = 'unknown',
    isCompanyBarcelonaHq = false
  ): boolean {
    if (!locationText && isCompanyBarcelonaHq) return true;
    if (!locationText) return false;

    const loc = locationText.toLowerCase();

    // Specific Barcelona keywords
    const bcnKeywords = [
      'barcelona',
      'bcn',
      'sant cugat',
      'sant joan despí',
      'l\'hospitalet',
      'hospitalet de llobregat',
      'badalona',
      'cornella',
      'castelldefels',
      'mataro',
      'sabadell',
      'terrassa',
      'catalonia',
      'catalunya',
    ];

    if (bcnKeywords.some((k) => loc.includes(k))) {
      return true;
    }

    // Remote Spain allowed if workplace is remote
    if (
      workplaceType === 'remote' &&
      (loc.includes('spain') || loc.includes('españa') || loc.includes('spain remote') || loc.includes('remote - spain') || loc.includes('remote (spain)'))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Detects workplace model (remote, hybrid, onsite, unknown).
   */
  public detectWorkplaceType(
    locationText?: string,
    titleText?: string,
    rawWorkplace?: string
  ): WorkplaceType {
    const combined = `${locationText ?? ''} ${titleText ?? ''} ${rawWorkplace ?? ''}`.toLowerCase();

    if (
      combined.includes('hybrid') ||
      combined.includes('híbrido') ||
      combined.includes('hibrido')
    ) {
      return 'hybrid';
    }

    if (
      combined.includes('remote') ||
      combined.includes('teletrabajo') ||
      combined.includes('anywhere') ||
      combined.includes('100% remote') ||
      combined.includes('remoto')
    ) {
      return 'remote';
    }

    if (
      combined.includes('onsite') ||
      combined.includes('on-site') ||
      combined.includes('presencial') ||
      combined.includes('office')
    ) {
      return 'onsite';
    }

    return 'unknown';
  }

  /**
   * Detects job taxonomy (internship, working student, graduate, junior, entry level, etc.)
   */
  public detectJobType(title?: string, description?: string, employmentType?: string): JobType {
    const text = `${title ?? ''} ${employmentType ?? ''}`.toLowerCase();

    // Check for explicit Internship / Beca
    if (
      text.includes('intern') ||
      text.includes('internship') ||
      text.includes('beca') ||
      text.includes('becario') ||
      text.includes('becaria') ||
      text.includes('pasantía') ||
      text.includes('pasantia') ||
      text.includes('prácticas') ||
      text.includes('practicas') ||
      text.includes('stagiaire') ||
      text.includes('stage')
    ) {
      return 'internship';
    }

    // Working Student
    if (text.includes('working student') || text.includes('werkstudent')) {
      return 'working_student';
    }

    // Trainee
    if (text.includes('trainee') || text.includes('traineeship')) {
      return 'trainee';
    }

    // Graduate program
    if (text.includes('graduate program') || text.includes('grad program') || text.includes('graduate')) {
      return 'graduate';
    }

    // Junior / Entry Level
    if (
      text.includes('junior') ||
      text.includes('jr.') ||
      text.includes('jr ') ||
      text.includes('entry level') ||
      text.includes('entry-level')
    ) {
      return 'junior';
    }

    return 'unknown';
  }

  /**
   * Extracts basic salary boundaries from job text or raw salary structures.
   */
  public extractSalary(text?: string): NormalizedSalary | undefined {
    if (!text) return undefined;

    const lower = text.toLowerCase();
    const isPaid = !lower.includes('unpaid') && !lower.includes('no remunerada') && !lower.includes('sin remunerar');

    // Check for Euro amounts like €20,000 - €30,000 or 1,200€ / month
    const euroPattern = /(?:€|eur|\$)\s*([0-9]{1,3}(?:[.,][0-9]{3})*)\s*(?:-|to|\/)\s*(?:€|eur|\$)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*)/i;
    const match = text.match(euroPattern);

    if (match && match[1] && match[2]) {
      const min = parseInt(match[1].replace(/[,.]/g, ''), 10);
      const max = parseInt(match[2].replace(/[,.]/g, ''), 10);
      const period = min > 5000 ? 'yearly' : 'monthly';

      return {
        raw: text,
        currency: 'EUR',
        min,
        max,
        period,
        isPaid,
      };
    }

    return {
      raw: text,
      isPaid,
    };
  }
}
