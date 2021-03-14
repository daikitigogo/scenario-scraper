/**
 * Scraping function for $eval.
 * @param el Element
 */
export const evalFunction = (el: Element): { [key: string]: string } => {
  return el.getAttributeNames()
    .reduce((accum, name) => Object.assign(accum, { [name]: el.getAttribute(name) }), { textContent: el.textContent?.trim() ?? '' });
};

/**
 * Scraping function for $eval, when selector is false value.
 * @param el Element
 */
export const evalArrayFunction = (els: Element[]): Array<{ [key: string]: string }> => {
  return els.map(el => 
    el.getAttributeNames()
      .reduce((accum, name) => Object.assign(accum, { [name]: el.getAttribute(name) }), { textContent: el.textContent?.trim() ?? '' }));
};
