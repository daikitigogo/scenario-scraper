import { launch, Browser, Page, ElementHandle, LaunchOptions } from 'puppeteer';
import { evalFunction, evalArrayFunction } from './on-browser';
import { Scenario } from './csv-loader';
import { KeyStringObject, ScrapeMapping, ScrapeResult } from './type';

/**
 * Scenario action for ScenarioPage.transition.
 */
const ScenarioAction = {
  Click: async (page: Page, scenario: Omit<Scenario, 'action'>): Promise<void> => {
    await page.click(scenario.selector);
    if (scenario.waitTime) {
      await page.waitForTimeout(scenario.waitTime);
    }
  },
  Select: async (page: Page, scenario: Omit<Scenario, 'action'>): Promise<void> => {
    await page.select(scenario.selector, ...scenario.value.split(';'));
    if (scenario.waitTime) {
      await page.waitForTimeout(scenario.waitTime);
    }
  },
  Input: async (page: Page, scenario: Omit<Scenario, 'action'>): Promise<void> => {
    await page.type(scenario.selector, scenario.value);
    if (scenario.waitTime) {
      await page.waitForTimeout(scenario.waitTime);
    }
  },
} as const;


class ScenarioElement {

  /**
   * Constructor
   * @param element scenario element
   * @package current current element value
   */
  constructor(readonly element: ElementHandle<Element>, readonly current: KeyStringObject) { }

  /**
   * Extract page content according mappings definition.
   * @param mapping mappings definition
   */
  async map<T extends KeyStringObject>(mappings: ScrapeMapping<T>): Promise<ScrapeResult<T>> {
    return this.extract(this, mappings);
  }

  /**
   * Extract page content as array according mappings definition.
   * @param selector target selector
   * @param mapping mapping definition
   */
  async mapArray<T extends KeyStringObject>(selector: string, mappings: ScrapeMapping<T>): Promise<Array<ScrapeResult<T>>> {
    const elements = await this.element.$$(selector);
    const currents = await this.element.$$eval(selector, evalArrayFunction);
    return Promise.all(elements.map((el, i) => this.extract(new ScenarioElement(el, currents[i]), mappings)));
  }

  /**
   * Extract page content according mappings definition.
   * @param el target element
   * @param mappings mapping definition
   */
  async extract<T extends KeyStringObject>(se: ScenarioElement, mappings: ScrapeMapping<T>): Promise<ScrapeResult<T>> {
    const results = await Promise.all(Object.entries(mappings)
      .map(async ([k, v]) => {
        const result = await this.evaluate(se, v.selector);
        return {
          key: k,
          value: result[v.property],
          error: result.error
        } as const;
      }));
    const errors = results
      .filter(({ error }) => error)
      .reduce((a, { key, error }) => ({ ...a, [key]: error }), {});
    return results
      .reduce((a, { key, value }) => ({ ...a, [key]: value }), { errors } as ScrapeResult<T>);
  }

  /**
   * If selector is false value, extract target is current element.
   * @param se target scenario element
   * @param selector target selector
   */
  async evaluate(se: ScenarioElement, selector?: string): Promise<KeyStringObject> {
    if (!selector) {
      return se.current;
    }
    return await se.element.$eval(selector, evalFunction)
      .catch(e => ({ error: e.toString() })) as KeyStringObject;
  }
}

/**
 * Execute Scenario page class.
 */
class ScenarioPage {

  /**
   * Constructor
   * @param page scenario page
   */
  constructor(readonly page: Promise<Page>) { }

  /**
   * Goto url.
   * @param url url
   */
  async goto(url: string) {
    const page = await this.page;
    await page.goto(url);
  }

  /**
   * Page transition by scenarios.
   * @param scenarios transition scenario
   */
  async transition(scenarios: Scenario[]): Promise<void> {
    const page = await this.page;
    for (const scenario of scenarios) {
      await ScenarioAction[scenario.action](page, scenario);
    }
  }

  /**
   * Get element as ScenarioElement.
   * @param selector selector
   */
  async element(selector?: string): Promise<ScenarioElement> {
    const page = await this.page;
    const element = await page.$(selector || 'html');
    const current = await page.$eval(selector || 'html', evalFunction);
    return new ScenarioElement(element, current);
  }

  /**
   * Get elements as ScenarioElement[].
   * @param selector selector
   */
  async elementArray(selector: string): Promise<ScenarioElement[]> {
    const page = await this.page;
    const elements = await page.$$(selector);
    const currents = await page.$$eval(selector, evalArrayFunction);
    return elements.map((el, i) => new ScenarioElement(el, currents[i]));
  }

  /**
   * Close page.
   */
  async close(): Promise<void> {
    const page = await this.page;
    await page.close();
  }
}

/**
 * Browser that manage the ScenarioPage.
 */
export class ScenarioBrowser {

  /**
   * Constructor
   * @param browser puppeteer`s browser
   */
  constructor(private readonly browser: Promise<Browser> = launch()) { }

  /**
   * Create new page.
   */
  async newPage(url?: string): Promise<ScenarioPage> {
    const browser = await this.browser;
    const result = new ScenarioPage(browser.newPage());
    if (!url) {
      return result;
    }
    await result.goto(url);
    return result;
  }

  /**
   * Close browser.
   */
  async close(): Promise<void> {
    const browser = await this.browser;
    await browser.close();
  }
};

export const puppeteerLaunch = (options: LaunchOptions) => launch(options);
