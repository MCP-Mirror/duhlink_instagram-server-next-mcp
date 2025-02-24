import * as puppeteer from 'puppeteer';
import { IBrowserService, IBrowserConfig, INavigationOptions } from './types.js';
import { BrowserError } from '../../core/utils/errors.js';
import { ConfigManager } from '../../core/utils/config.js';

/**
 * Service for managing browser interactions
 */
export class BrowserService implements IBrowserService {
  private browser: puppeteer.Browser | null = null;
  private config: IBrowserConfig;

  constructor() {
    const serverConfig = ConfigManager.getInstance().getConfig();
    this.config = {
      headless: serverConfig.browser.headless,
      userDataDir: serverConfig.chromeUserDataDir,
      windowWidth: serverConfig.browser.windowWidth,
      windowHeight: serverConfig.browser.windowHeight,
      defaultTimeout: serverConfig.browser.defaultTimeout
    };
  }

  /**
   * Initialize the browser instance
   */
  public async initialize(): Promise<void> {
    try {
      if (!this.browser) {
        this.browser = await puppeteer.launch({
          headless: true,
          channel: 'chrome',
          userDataDir: this.config.userDataDir,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--window-size=${this.config.windowWidth},${this.config.windowHeight}`,
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
          ],
          defaultViewport: {
            width: this.config.windowWidth,
            height: this.config.windowHeight
          }
        });

        // Handle browser disconnection
        this.browser.on('disconnected', () => {
          this.browser = null;
          throw new BrowserError('Browser disconnected unexpectedly');
        });
      }
    } catch (error) {
      throw new BrowserError(
        `Failed to initialize browser: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get a new page instance
   */
  public async getPage(): Promise<puppeteer.Page> {
    if (!this.browser) {
      throw new BrowserError('Browser not initialized');
    }

    try {
      const page = await this.browser.newPage();
      await this.setupPage(page);
      return page;
    } catch (error) {
      throw new BrowserError(
        `Failed to create new page: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Close the browser instance
   */
  public async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
      } catch (error) {
        throw new BrowserError(
          `Failed to close browser: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Configure a page instance with default settings
   */
  private async setupPage(page: puppeteer.Page): Promise<void> {
    try {
      // Set viewport
      await page.setViewport({
        width: this.config.windowWidth,
        height: this.config.windowHeight
      });

      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Set default timeout
      page.setDefaultTimeout(this.config.defaultTimeout);

      // Add additional headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
      });
    } catch (error) {
      throw new BrowserError(
        `Failed to setup page: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Navigate to a URL with error handling
   */
  public async navigateTo(
    page: puppeteer.Page,
    url: string,
    options?: INavigationOptions
  ): Promise<void> {
    try {
      await page.goto(url, {
        waitUntil: options?.waitUntil || 'networkidle0',
        timeout: options?.timeout || this.config.defaultTimeout
      });
    } catch (error) {
      throw new BrowserError(
        `Failed to navigate to ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Wait for a selector with error handling
   */
  public async waitForSelector(
    page: puppeteer.Page,
    selector: string,
    timeout?: number
  ): Promise<boolean> {
    try {
      await page.waitForSelector(selector, {
        timeout: timeout || this.config.defaultTimeout
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
