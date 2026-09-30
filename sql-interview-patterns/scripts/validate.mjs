// Data integrity checks for the pattern catalog.
import { PATTERNS, TOTAL_QUESTIONS } from '../src/data/patterns.ts';
import { CATEGORY_ORDER } from '../src/data/types.ts';

const errors = [];
const slugs = new Set();
const ids = new Set();
const nums = new Set();

for (const p of PATTERNS) {
  if (nums.has(p.num)) errors.push(`duplicate pattern num ${p.num}`);
  nums.add(p.num);
  if (slugs.has(p.slug)) errors.push(`duplicate slug ${p.slug}`);
  slugs.add(p.slug);
  if (!CATEGORY_ORDER.includes(p.category)) errors.push(`${p.slug}: unknown category "${p.category}"`);
  if (p.questions.length !== 10) errors.push(`${p.slug}: ${p.questions.length} questions, expected 10`);
  if (p.pitfalls.length < 3) errors.push(`${p.slug}: only ${p.pitfalls.length} pitfalls`);

  const expectedPrefix = `p${String(p.num).padStart(2, '0')}-q`;
  p.questions.forEach((q, i) => {
    if (ids.has(q.id)) errors.push(`duplicate question id ${q.id}`);
    ids.add(q.id);
    if (q.id !== `${expectedPrefix}${i + 1}`) errors.push(`${q.id}: expected ${expectedPrefix}${i + 1}`);
    for (const field of ['prompt', 'think', 'hint', 'approach', 'solution', 'explanation']) {
      if (!q[field] || q[field].trim() === '') errors.push(`${q.id}: empty ${field}`);
    }
    if (q.tables.length === 0) errors.push(`${q.id}: no tables listed`);
    if (!['easy', 'medium', 'hard'].includes(q.difficulty)) errors.push(`${q.id}: bad difficulty`);
    // The approach is rendered as an ordered list, so it needs several steps.
    if (q.approach.split('\n').length < 3) errors.push(`${q.id}: approach has fewer than 3 steps`);
  });
}

for (let n = 1; n <= 50; n += 1) if (!nums.has(n)) errors.push(`missing pattern number ${n}`);

const byDifficulty = PATTERNS.flatMap((p) => p.questions).reduce((acc, q) => {
  acc[q.difficulty] = (acc[q.difficulty] ?? 0) + 1;
  return acc;
}, {});

console.log(`patterns: ${PATTERNS.length}`);
console.log(`questions: ${TOTAL_QUESTIONS}`);
console.log(`difficulty mix:`, byDifficulty);
console.log(`categories:`, Object.fromEntries(
  CATEGORY_ORDER.map((c) => [c, PATTERNS.filter((p) => p.category === c).length]),
));
if (errors.length) {
  console.error(`\n${errors.length} PROBLEM(S):`);
  errors.slice(0, 40).forEach((e) => console.error('  - ' + e));
  process.exit(1);
}
console.log('\nAll checks passed.');
