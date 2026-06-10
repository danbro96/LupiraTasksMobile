/** Collapse hard line breaks to single spaces — task titles are single-line data. The one
 *  definition behind every title input, save path, and the CSV importer. */
export function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ');
}
