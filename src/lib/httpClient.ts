import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { CrawlerConfig } from '@/types';

export class HttpClient {
  private client: AxiosInstance;
  private currentDelay: number;
  private baseDelay: number;

  constructor(config: CrawlerConfig) {
    this.baseDelay = config.crawlDelay;
    this.currentDelay = config.crawlDelay;

    this.client = axios.create({
      timeout: config.requestTimeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CrawlSiteBot/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 400,
    });
  }

  /**
   * Sleep for the specified delay
   */
  private async sleep(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.currentDelay));
  }

  /**
   * Increase delay on error (exponential backoff)
   */
  private increaseDelay(): void {
    this.currentDelay = Math.min(this.currentDelay * 2, 30000); // Cap at 30 seconds
  }

  /**
   * Reset delay to base value on success
   */
  private resetDelay(): void {
    this.currentDelay = this.baseDelay;
  }

  /**
   * Fetch HTML content from a URL
   */
  async fetchHtml(url: string): Promise<string | null> {
    try {
      await this.sleep();

      const response: AxiosResponse = await this.client.get(url);

      if (response.status >= 400) {
        console.error(`HTTP ${response.status} for URL: ${url}`);
        this.increaseDelay();
        return null;
      }

      this.resetDelay();
      return response.data;
    } catch (error: any) {
      console.error(`Error fetching ${url}:`, error.message);
      this.increaseDelay();
      return null;
    }
  }

  /**
   * Fetch and parse XML sitemap
   */
  async fetchXml(url: string): Promise<string | null> {
    return this.fetchHtml(url);
  }

  /**
   * Get the current delay value
   */
  getCurrentDelay(): number {
    return this.currentDelay;
  }
}
