import * as fs from 'fs';
import { parse } from 'csv';
import { launch, Browser, Page, ElementHandle, LaunchOptions } from 'puppeteer';
import { evalFunction, evalArrayFunction } from './on-browser';

/**
 * Object that key is string.
 */
export type KeyStringObject<T = string> = {
  [key: string]: T;
}

/**
 * Action type for ScenarioPage.transition.
 */
const ActionType = [
  'Click',
  'Select',
  'Input'
] as const;

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

/**
 * Action type.
 */
export type ActionType = typeof ActionType[number];

/**
 * Argument type for ScenarioPage.transition.
 */
export type Scenario = {
  action: ActionType;
  selector: string;
  value?: string;
  waitTime?: number;
};

/**
 * Validate for csv record.
 * @param records csv records
 */
const validate = (records: KeyStringObject[]): string[] => {
  const results = records.map((record, i) => {
    if (!record.action) {
      return `Line: ${i + 1}, action is required.`;
    }
    if (!record.selector) {
      return `Line: ${i + 1}, selector is required.`;
    }
    if (!ActionType.find(x => x === record.action)) {
      return `Line: ${i + 1}, action must be ${ActionType}.`;
    }
    if (record.waitTime.match(/^[0-9]*$/) === null) {
      return `Line: ${i + 1}, waitTime must be number.`
    }
    return '';
  });
  return results.filter(x => x);
};

/**
 * Convert csv record to Scenario type.
 * @param record csv record
 * @param replaceValue replace value
 */
const toScenario = (record: KeyStringObject, replace: KeyStringObject): Scenario => {
  const result = {
    action: ActionType.find(x => x === record.action),
    selector: record.selector,
    value: record.value,
    waitTime: Number(record.waitTime),
  };
  if (!result.value.startsWith('#bind:')) {
    return result;
  }
  return { ...result, value: replace[result.value.split(':')[1]] };
}

/**
 * Load Scenario data from csv file.
 * @param path csv file path
 * @param replaceValue replace value
 */
export const loadScenarioFromCsv = (path: string, replace: KeyStringObject = {}): Promise<Scenario[]> => {
  return new Promise((resolve, reject) => {
    fs.createReadStream(path)
      .pipe(parse({ columns: true }, (_, d) => {
        try {
          const records = Array.from<{}>(d);
          if (!records.length) {
            throw new Error('File is empty.');
          }

          const validateResult = validate(records);
          if (validateResult.length) {
            throw new Error(validateResult.join('\n'));
          }
          
          resolve(Array.from<{}>(d).map(x => toScenario(x, replace)));
        } catch (e) {
          reject(e.message);
        }
      })
    );
  });
};

/**
 * Argument type for ScenarioPage.map or mapArray.
 */
export type ScrapeMapping<T> = {
  [key in keyof T]: {
    selector: string;
    property: string;
  };
};

/**
 * Return type for ScenarioPage.map or maparray.
 */
export type ScrapeResult<T> = T & {
  errors: {};
};

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
