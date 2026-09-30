/**
 * The highlighter must only ADD markup: stripping the tags and decoding the
 * entities has to give back the original SQL, character for character.
 * Runs against every solution in the catalog.
 */
import { PATTERNS } from '../src/data/patterns.ts';
import { highlight } from '../src/lib/sqlHighlight.ts';

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

let checked = 0;
const bad = [];

for (const p of PATTERNS) {
  for (const q of p.questions) {
    checked += 1;
    const rendered = decode(highlight(q.solution));
    if (rendered !== q.solution) {
      bad.push({ id: q.id, expected: q.solution.slice(0, 160), got: rendered.slice(0, 160) });
    }
  }
}

console.log(`checked ${checked} SQL solutions`);
if (bad.length) {
  console.error(`${bad.length} CORRUPTED:`);
  bad.slice(0, 3).forEach((b) =>
    console.error(`\n--- ${b.id}\nexpected: ${JSON.stringify(b.expected)}\ngot:      ${JSON.stringify(b.got)}`),
  );
  process.exit(1);
}
console.log('highlighter round-trips every solution exactly.');
