/**
 * Object that key is string.
 */
export type KeyStringObject<T = string> = Record<string, T>;

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
export type ScrapeResult<T> = Partial<T> & {
  errors: {};
};
