import * as fs from 'fs';
import { parse } from 'csv';
import { KeyStringObject, ScrapeMapping } from './type';

/**
 * Action type for ScenarioPage.transition.
 */
export const ActionType = [
  'Click',
  'Select',
  'Input'
] as const;

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
const validateScenario = (records: KeyStringObject[]): string[] => {
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

          const validateResult = validateScenario(records);
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
 * Validate for csv record.
 * @param records csv records
 */
const validateMapping = (records: KeyStringObject[]): string[] => {
  const results = records.map((record, i) => {
    if (!record.name) {
      return `Line: ${i + 1}, name is required.`;
    }
    if (!record.selector) {
      return `Line: ${i + 1}, selector is required.`;
    }
    if (!record.property) {
      return `Line: ${i + 1}, property is required.`;
    }
    return '';
  });
  return results.filter(x => x);
}

/**
 * Convert csv record to ScrapeMapping type.
 * @param records csv records
 */
const toMapping = <T extends KeyStringObject> (records: KeyStringObject[]): ScrapeMapping<T> => {
  return records.reduce((accum, cur) => ({
    ...accum,
    [cur.name]: {
      'selector': cur.selector,
      'property': cur.property,
    }
  }), {} as ScrapeMapping<T>);
};

/**
 * Load Mapping data from csv file.
 * @param path csv file path
 */
export const loadMappingFromCsv = async <T extends KeyStringObject> (path: string): Promise<ScrapeMapping<T>> => {
  return new Promise((resolve, reject) => {
    fs.createReadStream(path)
      .pipe(parse({ columns: true }, (_, d) => {
        try {
          const records = Array.from<{}>(d);
          if (!records.length) {
            throw new Error('File is empty.');
          }

          const validateResult = validateMapping(records);
          if (validateResult.length) {
            throw new Error(validateResult.join('\n'));
          }

          resolve(toMapping(Array.from<{}>(d)));
        } catch (e) {
          reject(e.message);
        }
      })
    );
  });
};
