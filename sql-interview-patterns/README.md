# SQL Interview Patterns

A learning site for the 50 SQL patterns that sit behind almost every SQL
interview question. **50 patterns × 10 questions = 500 questions**, each one
built so you have to reason about the concept before the syntax is available
to copy.

## The idea

Interviews don't really test syntax — they test whether you can recognise
which of a small set of *shapes* a problem has. Once you see "top N per
group", the query writes itself. So every question here is staged:

| Stage | What you get | What it's for |
| --- | --- | --- |
| **Prompt** | The task, phrased the way an interviewer asks it, plus the tables involved | Recognise the shape |
| **Think first** | A question about the concept — what's the grain, what breaks ties, what happens to NULLs | Commit to a mental model |
| **1 · Hint** | A nudge, no syntax | Unstick without giving it away |
| **2 · Approach** | The full plan in plain English, still no SQL | Write your own query from the plan |
| **3 · Solution** | The SQL, an explanation of *why* it works, and the trap it avoids | Compare against yours |

Nothing is revealed until you click. Progress (solved / revealed) is kept per
question in `localStorage`, so there's no backend and no account.

## The patterns

Grouped by the concept they train, not by the order of the original list:

- **Aggregation & Grouping** — duplicates, conditional aggregation, distinct counts, mode, HAVING
- **Ranking & Top-N** — top N, top N per group, RANK vs DENSE_RANK vs ROW_NUMBER, Nth highest, latest per group
- **Window Functions** — row numbers, running totals, moving averages, LAG/LEAD, FIRST/LAST_VALUE, percent of total, cumulative percentage
- **Joins & Set Logic** — inner/outer/anti joins, fan-out, FULL OUTER reconciliation, UNION, INTERSECT, EXCEPT
- **Time Series & Dates** — date arithmetic, month-over-month, overlapping ranges, gaps and islands, rolling windows, retention
- **Reshaping & Text** — pivot/unpivot, string splitting, LIKE and regex, length extremes
- **Data Quality & Modeling** — NULL semantics, deduplication, hierarchies, recursive CTEs, SCD Type 2, change detection
- **Performance** — reading `EXPLAIN ANALYZE` and fixing the cause rather than the symptom

Every question runs against **one shared schema** (see the Schema page), so by
pattern 20 you should be reaching for the right table without looking it up.

## Dialect

Solutions are ANSI SQL, verified against PostgreSQL semantics. Where a feature
is vendor-specific — `PIVOT`, `STRING_SPLIT`, `DATEDIFF`, `FILTER`,
`generate_series`, `LIMIT` vs `TOP` — the question carries a **dialect note**
with the portable alternative for MySQL, SQL Server and Oracle.

## Running it locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build    # production build into dist/
npm run check    # data integrity + highlighter + typecheck
npm run gen      # regenerate the data index after editing src/data/patterns/
```

## Deploying

### Vercel

The repo root is the *parent* of this folder, so set **Root Directory** to
`sql-interview-patterns` when importing the project. Everything else is
detected automatically — `vercel.json` pins the framework, the build command
and the SPA rewrite that makes `/pattern/<slug>` work on a hard refresh.

```
Framework Preset:  Vite
Root Directory:    sql-interview-patterns
Build Command:     npm run build
Output Directory:  dist
```

Or from the CLI, inside this folder:

```bash
npx vercel --prod
```

### Anywhere else

`npm run build` produces a fully static `dist/`. It works on Netlify, Cloudflare
Pages, GitHub Pages or any static host — the only requirement is a rewrite of
unknown paths to `/index.html` so client-side routing survives a refresh.

### Lovable

Lovable expects the app at the repository root. Either point it at a repo whose
root is this folder, or move these files up one level and drop the
`sql-interview-patterns` directory.

## Adding or editing content

Each pattern is a single self-contained file in `src/data/patterns/pNN.ts`
matching the `Pattern` type in `src/data/types.ts`. After editing:

```bash
npm run gen      # rebuilds the index, the lazy loaders and the metadata
npm run check    # asserts 10 questions per pattern, unique ids, no empty fields,
                 # and that the highlighter doesn't alter a single character of SQL
```

## How it's built

Vite + React + TypeScript, plain CSS, no UI framework. Each pattern's questions
are a separate lazily-imported chunk, so the home page ships ~80 kB gzipped and
a pattern page pulls only its own ~5 kB.
