import { type AtsProvider } from './types.js';
import { BaseAdapter } from './base.js';
import { GreenhouseAdapter } from './adapters/greenhouse.js';
import { LeverAdapter } from './adapters/lever.js';
import { AshbyAdapter } from './adapters/ashby.js';
import { TeamtailorAdapter } from './adapters/teamtailor.js';
import { FactorialAdapter } from './adapters/factorial.js';
import { WorkableAdapter } from './adapters/workable.js';
import { AtsScrapersAdapter } from './adapters/ats-scrapers.js';

export class AdapterFactory {
  private static instance: AdapterFactory;
  private readonly adapters = new Map<AtsProvider, BaseAdapter>();

  private constructor() {
    this.registerDefaultAdapters();
  }

  public static getInstance(): AdapterFactory {
    if (!AdapterFactory.instance) {
      AdapterFactory.instance = new AdapterFactory();
    }
    return AdapterFactory.instance;
  }

  private registerDefaultAdapters(): void {
    this.register(new GreenhouseAdapter());
    this.register(new LeverAdapter());
    this.register(new AshbyAdapter());
    this.register(new TeamtailorAdapter());
    this.register(new FactorialAdapter());
    this.register(new WorkableAdapter());
    this.register(new AtsScrapersAdapter());
  }

  /**
   * Registers a new adapter instance for an ATS provider.
   */
  public register(adapter: BaseAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  /**
   * Retrieves the adapter instance for a given ATS provider.
   */
  public get(provider: AtsProvider): BaseAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(
        `[AdapterFactory] No adapter registered for ATS provider: "${provider}". Supported providers: ${this.getSupportedProviders().join(', ')}`
      );
    }
    return adapter;
  }

  /**
   * Checks if an adapter is registered for the specified provider.
   */
  public has(provider: AtsProvider): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Lists all supported ATS provider names.
   */
  public getSupportedProviders(): AtsProvider[] {
    return Array.from(this.adapters.keys());
  }
}

/**
 * Convenience helper to get an adapter instance directly from the singleton factory.
 */
export function getAdapter(provider: AtsProvider): BaseAdapter {
  return AdapterFactory.getInstance().get(provider);
}
