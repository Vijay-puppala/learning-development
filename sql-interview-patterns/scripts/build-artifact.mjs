/**
 * Assembles dist-artifact/ into one self-contained HTML page for publishing.
 *
 * The artifact host wraps the file in its own <!doctype>/<html>/<head>/<body>
 * skeleton, so this emits only a <title>, the stylesheet, the mount point and
 * the bundle — no document tags of its own.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join(process.cwd(), 'dist-artifact');
const js = readFileSync(join(out, 'app.js'), 'utf8');
const css = readFileSync(join(out, 'app.css'), 'utf8');

// A literal </script> anywhere in the bundle would close the tag early.
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const html = `<title>SQL Interview Patterns</title>
<style>
${css}
</style>
<div id="root"></div>
<script>
${safeJs}
</script>
`;

mkdirSync(join(process.cwd(), 'artifact'), { recursive: true });
const file = join(process.cwd(), 'artifact', 'sql-interview-patterns.html');
writeFileSync(file, html);

const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
console.log(`${file}\n${mb} MB (artifact limit is 16 MB)`);
if (Buffer.byteLength(html) > 16 * 1024 * 1024) {
  console.error('TOO LARGE for an artifact.');
  process.exit(1);
}
