import * as fs from 'fs';
import { parse } from 'csv';
import { launch, Browser, Page, ElementHandle } from 'puppeteer';
import { evalFunction, evalParentFunction } from './on-browser';

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
 * Argument type for ScenarioPage.transition.
 */
export type Scenario = {
  action: typeof ActionType[number];
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
    return undefined;
  });
  return results.filter(x => x);
};

/**
 * Convert csv record to Scenario type.
 * @param record csv record
 * @param replaceValue replace value
 */
const toScenario = (record: KeyStringObject, replaceValue?: string): Scenario => {
  const result = {
    action: ActionType.find(x => x === record.action),
    selector: record.selector,
    value: record.value,
    waitTime: Number(record.waitTime),
  };
  if (!replaceValue) {
    return result;
  }
  return { ...result, value: replaceValue };
}

/**
 * Load Scenario data from csv file.
 * @param path csv file path
 * @param replaceValue replace value
 */
export const loadScenarioFromCsv = (path: string, replaceValue: { [key: number]: string } = {}): Promise<Scenario[]> => {
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
          
          resolve(Array.from<{}>(d).map((x, i) => toScenario(x, replaceValue[i])));
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
type ScrapeMapping<T> = {
  [key in keyof T]: {
    selector: string;
    property: string;
  };
};

/**
 * Return type for ScenarioPage.map or maparray.
 */
type ScrapeResult<T> = T & {
  errors: {};
};

/**
 * Execute Scenario page class.
 */
class ScenarioPage {

  /**
   * Constructor
   * @param page Promise&lt;Page>
   */
  constructor(readonly page: Promise<Page>) { }

  /**
   * Goto url.
   * @param url string
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
   * Extract page content according mappings definition.
   * @param mapping mappings definition
   */
  async map<T extends KeyStringObject>(mappings: ScrapeMapping<T>): Promise<ScrapeResult<T>> {
    const page = await this.page;
    const el = await page.$('html');
    return this.extract(el, mappings);
  }

  /**
   * Extract page content as array according mappings definition.
   * @param selector target selector
   * @param mapping mapping definition
   */
  async mapArray<T extends KeyStringObject>(selector: string, mappings: ScrapeMapping<T>): Promise<Array<ScrapeResult<T>>> {
    const page = await this.page;
    const elements = await page.$$(selector);
    return Promise.all(elements.map(el => this.extract(el, mappings)));
  }

  /**
   * Close page.
   */
  async close(): Promise<void> {
    const page = await this.page;
    await page.close();
  }

  /**
   * Extract page content according mappings definition.
   * @param el target element
   * @param mappings mapping definition
   */
  private async extract<T extends KeyStringObject>(el: ElementHandle<Element>, mappings: ScrapeMapping<T>): Promise<ScrapeResult<T>> {
    const results = await Promise.all(Object.entries(mappings)
      .map(async ([k, v]) => {
        const result = await this.eval(el, v.selector);
        return [k, result[v.property], result.error] as const;
      }));
    const errors = results
      .filter(([_1, _2, e]) => e)
      .reduce((a, [k, _, e]) => ({ ...a, [k]: e }), {});
    return results
      .reduce((a, [k, v]) => ({ ...a, [k]: v }), { errors } as ScrapeResult<T>);
  }

  /**
   * If selector is false value, extract target is current element.
   * @param el target element
   * @param selector target selector
   */
  private async eval(el: ElementHandle<Element>, selector?: string): Promise<KeyStringObject> {
    if (selector) {
      return await el.$eval(selector, evalFunction)
        .catch(e => ({ error: e.toString() })) as KeyStringObject;
    }
    return await el.$eval(':first-child', evalParentFunction)
      .catch(e => ({ error: e.toString() })) as KeyStringObject;
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
    const page = browser.pages.length == 1 
      ? browser.pages().then(x => x[0])
      : browser.newPage();
    const result = new ScenarioPage(page);
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
