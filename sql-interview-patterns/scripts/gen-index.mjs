// Regenerates src/data/patterns.ts from the per-pattern files in src/data/patterns/.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'src/data/patterns');
const files = readdirSync(dir)
  .filter((f) => /^p\d{2}\.ts$/.test(f))
  .sort();

const names = files.map((f) => f.replace('.ts', ''));
const body = `import type { Pattern } from './types';
${names.map((n) => `import { ${n} } from './patterns/${n}';`).join('\n')}

/** All 50 patterns, in the order of the classic interview cheat-sheet. */
export const PATTERNS: Pattern[] = [
${names.map((n) => `  ${n},`).join('\n')}
];

export const TOTAL_QUESTIONS = PATTERNS.reduce((n, p) => n + p.questions.length, 0);
`;

writeFileSync(join(process.cwd(), 'src/data/patterns.ts'), body);
console.log(`indexed ${names.length} patterns`);
