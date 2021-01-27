import * as SS from '../index';
import { launch } from 'puppeteer';
import * as http from 'http-server';

// Setup
const server = http.createServer({ root: 'src/__test__/html' });
server.listen(8080);
const browser = new SS.ScenarioBrowser(launch({ headless: true }));
// beforeAll(() => {
// });
afterAll(async () => {
  server.close();
  await browser.close();
});

// base value
const baseDir = './src/__test__';
const rootUrl = 'http://localhost:8080';

// loadScenarioFromCsv
describe('Test for loadScenarioFromCsv.', () => {
  const describeDir = 'describe01';

  // NG pattern 1.
  test('File is empty.', async () => {
    await expect(async () => SS.loadScenarioFromCsv(`${baseDir}/${describeDir}/test01-input.csv`))
      .rejects
      .toBe('File is empty.');
  });

  // NG pattern 2.
  test('Validation is NG.', async () => {
    const expected = await import(`./${describeDir}/test02-expected.json`);
    await expect(async () => SS.loadScenarioFromCsv(`${baseDir}/${describeDir}/test02-input.csv`))
      .rejects
      .toBe(expected.join('\n'));
  });

  // OK pattern 1.
  test('Validation is OK1.', async () => {
    const expected = await import(`./${describeDir}/test03-expected.json`);
    await expect(SS.loadScenarioFromCsv(`${baseDir}/${describeDir}/test03-input.csv`))
      .resolves
      .toEqual(expected);
  });

  // OK pattern 2.
  test('Validation is OK2.', async () => {
    const expected = await import(`./${describeDir}/test04-expected.json`);
    await expect(SS.loadScenarioFromCsv(`${baseDir}/${describeDir}/test04-input.csv`, { 1: 'test' }))
      .resolves
      .toEqual(expected);
  });
});

// ScenarioPage
describe('Test for ScenarioPage.', () => {
  const describeDir = 'describe02';

  // transition OK pattern.
  test('transition is OK.', async () => {
    const scenario = await import(`./${describeDir}/test01-input.json`);
    const page = await browser.newPage(rootUrl);
    await page.transition(scenario);
    const result = await (await page.page).evaluate(() => {
      // @ts-ignore
      const text = (id) => document.querySelector(id).textContent.trim();
      return {
        click: text('#click-result'),
        select: text('#select-result'),
        input: text('#input-result'),
      }
    });
    expect(result)
      .toEqual(await import(`./${describeDir}/test01-expected.json`));
    await page.close();
  });

  // map OK pattern.
  test('map is OK.', async () => {
    const mappings = await import(`./${describeDir}/test02-input.json`);
    const page = await browser.newPage(rootUrl);
    const result = await page.map(mappings);
    expect(result)
      .toEqual(await import(`./${describeDir}/test02-expected.json`));
  });

  // mapall OK pattern.
  test('mapall is OK.', async () => {
    const mappings = await import(`./${describeDir}/test03-input.json`);
    const page = await browser.newPage(rootUrl);
    const result = await page.mapArray('#maparray-test > div', mappings);
    expect(result)
      .toEqual(await import(`./${describeDir}/test03-expected.json`));
  });
});
