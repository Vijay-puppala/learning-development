import type { Pattern } from '../types';

export const p25: Pattern = {
  num: 25,
  slug: 'merge-multiple-tables',
  title: 'Merge Multiple Tables',
  concept: 'UNION ALL',
  category: 'Joins & Set Logic',
  tagline: 'Stack rows vertically. UNION ALL unless you can justify the deduplication cost.',
  theory: `A join widens — it adds columns. A union lengthens — it adds rows. Reach for a union when the same kind of entity lives in several places: yearly partitions, regional tables, a current table plus an archive.

**UNION ALL concatenates. UNION concatenates and then removes duplicates**, which requires a sort or hash of the entire result. That deduplication is not free, and it is usually not wanted: two genuinely identical sales rows from different days are different sales, and UNION would silently merge them into one. Default to UNION ALL and use UNION only when you can name the duplicates you are removing.

The structural rules: every branch must have the same number of columns, in the same order, with compatible types. Column names come from the first branch. ORDER BY applies to the whole result and goes at the end — putting it inside a branch is either a syntax error or ignored.

Two practical habits. Add a literal source column to each branch so a row's origin survives the merge. And list columns explicitly rather than using SELECT *, because a column added to one table later will break the union in a confusing way.`,
  pitfalls: [
    'Using UNION where UNION ALL was meant, silently losing legitimate duplicate rows and paying for a sort.',
    'SELECT * in union branches, which breaks the moment one table gains a column.',
    'Mismatched column order between branches — the types may still be compatible, so it runs and returns nonsense.',
    'Putting ORDER BY inside a branch instead of at the end of the whole statement.',
    'Forgetting a source-tag column, so you cannot tell where a row came from when reconciling.',
  ],
  questions: [
    {
      id: 'p25-q1',
      difficulty: 'easy',
      prompt: 'Combine sales_2023 and sales_2024 into one result, tagging each row with its source year.',
      tables: ['sales_2023 / sales_2024'],
      think: 'Should identical rows from the two tables be collapsed into one?',
      hint: 'No — they are different sales. UNION ALL, not UNION.',
      approach: `Select the same columns in the same order from each table.\nAdd a literal source tag to each branch.\nStack them with UNION ALL so nothing is deduplicated.\nOrder the combined result at the end.`,
      solution: `SELECT '2023' AS source_year, product_id, region, sale_date, amount
FROM sales_2023
UNION ALL
SELECT '2024', product_id, region, sale_date, amount
FROM sales_2024
ORDER BY sale_date, product_id;`,
      explanation: 'The source tag survives the merge and makes every downstream reconciliation possible — without it, a row that looks wrong gives you no clue which table to investigate. Column names are taken from the first branch, so only that one needs aliases.',
    },
    {
      id: 'p25-q2',
      difficulty: 'easy',
      prompt: 'Count the rows contributed by each source table in the merged result.',
      tables: ['sales_2023 / sales_2024'],
      think: 'What does the source tag let you do that you could not do otherwise?',
      hint: 'Group by it.',
      approach: `Build the union with source tags in a CTE.\nGroup the combined result by the source tag.\nCount the rows and sum the amounts per source.\nAdd a grand total row for reconciliation.`,
      solution: `WITH combined AS (
    SELECT '2023' AS src, product_id, region, sale_date, amount FROM sales_2023
    UNION ALL
    SELECT '2024', product_id, region, sale_date, amount FROM sales_2024
)
SELECT COALESCE(src, 'TOTAL') AS source,
       COUNT(*)               AS rows,
       SUM(amount)            AS revenue
FROM combined
GROUP BY ROLLUP (src)
ORDER BY GROUPING(src), src;`,
      explanation: 'ROLLUP adds the grand-total row so you can check that the parts sum to the whole in the same query. Reconciling row counts across a union is the first thing to do after any table merge, and building it into the query makes it hard to skip.',
    },
    {
      id: 'p25-q3',
      difficulty: 'medium',
      prompt: 'Demonstrate the difference between UNION and UNION ALL on the same two tables.',
      tables: ['sales_2023 / sales_2024'],
      think: 'Which rows can UNION remove that you might not want removed?',
      hint: 'Fully identical rows — including two genuinely separate sales that happen to match on every column.',
      approach: `Count the rows returned by UNION ALL.\nCount the rows returned by UNION over the same branches.\nSubtract to see how many rows the deduplication removed.\nConsider whether those rows were duplicates or distinct events.`,
      solution: `SELECT (SELECT COUNT(*) FROM (
           SELECT product_id, region, sale_date, amount FROM sales_2023
           UNION ALL
           SELECT product_id, region, sale_date, amount FROM sales_2024
        ) AS a) AS rows_union_all,
       (SELECT COUNT(*) FROM (
           SELECT product_id, region, sale_date, amount FROM sales_2023
           UNION
           SELECT product_id, region, sale_date, amount FROM sales_2024
        ) AS b) AS rows_union,
       (SELECT COUNT(*) FROM (
           SELECT product_id, region, sale_date, amount FROM sales_2023
           UNION ALL
           SELECT product_id, region, sale_date, amount FROM sales_2024
        ) AS a) -
       (SELECT COUNT(*) FROM (
           SELECT product_id, region, sale_date, amount FROM sales_2023
           UNION
           SELECT product_id, region, sale_date, amount FROM sales_2024
        ) AS b) AS rows_removed_by_dedup;`,
      explanation: 'Every row in rows_removed_by_dedup is one UNION decided was redundant — and two customers buying the same product in the same region on the same day for the same amount are two sales, not one. Once a surrogate key is included in the select list, UNION and UNION ALL agree, which is another reason to carry keys through.',
    },
    {
      id: 'p25-q4',
      difficulty: 'medium',
      prompt: 'Build a unified activity feed combining orders and logins into one chronological timeline per customer.',
      tables: ['orders', 'logins'],
      think: 'The two tables have different columns. What has to be true for them to stack?',
      hint: 'Project each into a common shape: entity, timestamp, event type, and a detail column.',
      approach: `Project orders into a common event shape with a type label and a detail value.\nProject logins into the identical shape, filling missing columns with NULL or a cast.\nStack the two with UNION ALL.\nOrder by the entity and the event timestamp.`,
      solution: `SELECT o.customer_id AS entity_id,
       o.order_date   AS event_date,
       'order'        AS event_type,
       CAST(o.amount AS text) AS detail
FROM orders AS o

UNION ALL

SELECT l.user_id,
       l.login_date,
       'login',
       NULL
FROM logins AS l

ORDER BY entity_id, event_date, event_type;`,
      explanation: 'Projecting heterogeneous tables into a shared event shape is how every activity feed and event-sourcing model is built. Every branch must agree on column types, which is why amount is cast to text to sit alongside a NULL detail — if the detail column needs to stay numeric, carry two columns instead.',
    },
    {
      id: 'p25-q5',
      difficulty: 'medium',
      prompt: 'Merge the two yearly sales tables and compute total revenue per product across both.',
      tables: ['sales_2023 / sales_2024'],
      think: 'Does the aggregation happen inside each branch or after the merge?',
      hint: 'After — otherwise you get one row per product per table and have to sum them again.',
      approach: `Union the two tables into a single CTE.\nGroup the combined result by product.\nSum the amount across both years.\nAlso break the total down by year with conditional aggregation.`,
      solution: `WITH combined AS (
    SELECT 2023 AS yr, product_id, amount FROM sales_2023
    UNION ALL
    SELECT 2024,       product_id, amount FROM sales_2024
)
SELECT product_id,
       SUM(amount)                                       AS total_revenue,
       COALESCE(SUM(amount) FILTER (WHERE yr = 2023), 0) AS revenue_2023,
       COALESCE(SUM(amount) FILTER (WHERE yr = 2024), 0) AS revenue_2024
FROM combined
GROUP BY product_id
ORDER BY total_revenue DESC;`,
      explanation: 'Aggregating after the union keeps the grain correct in one step and makes the per-year breakdown a free extra column. Aggregating inside each branch and then unioning would give two rows per product, which someone downstream would have to sum again.',
    },
    {
      id: 'p25-q6',
      difficulty: 'medium',
      prompt: 'Combine current customers with staged customers, preferring the staged version when a customer exists in both.',
      tables: ['customers', 'customers_stg'],
      think: 'A union stacks rows. How do you stop a customer in both tables appearing twice?',
      hint: 'Take all of staging, then only the current rows that staging does not contain.',
      approach: `Select every row from the staging table as the preferred version.\nSelect rows from the current table only where no staging row shares the key.\nUNION ALL the two branches, which now cannot overlap by construction.\nTag each row with its origin.`,
      solution: `SELECT 'staged'  AS src, customer_id, customer_name, email, city, country
FROM customers_stg

UNION ALL

SELECT 'current', c.customer_id, c.customer_name, c.email, c.city, c.country
FROM customers AS c
WHERE NOT EXISTS (
    SELECT 1 FROM customers_stg AS s WHERE s.customer_id = c.customer_id
)
ORDER BY customer_id;`,
      explanation: 'Making the branches mutually exclusive with an anti-join is what lets you keep UNION ALL and its predictable cost — UNION would not have worked anyway, since the two versions of a changed customer differ and both would survive. This is the classic "upsert as a query" shape.',
    },
    {
      id: 'p25-q7',
      difficulty: 'hard',
      prompt: 'Merge two yearly tables and rank products by total revenue, showing which year each product peaked in.',
      tables: ['sales_2023 / sales_2024'],
      think: 'A window function over a union — does it go inside a branch or outside?',
      hint: 'Outside. A window applied inside a branch only sees that branch.',
      approach: `Union the two tables with a year tag into a CTE.\nAggregate to revenue per product per year.\nWithin each product, rank the years by revenue to find the peak.\nAggregate again to one row per product carrying the total and the peak year.`,
      solution: `WITH combined AS (
    SELECT 2023 AS yr, product_id, amount FROM sales_2023
    UNION ALL
    SELECT 2024,       product_id, amount FROM sales_2024
),
per_year AS (
    SELECT product_id, yr, SUM(amount) AS revenue
    FROM combined
    GROUP BY product_id, yr
),
ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY revenue DESC) AS yr_rank
    FROM per_year
)
SELECT product_id,
       SUM(revenue)                                  AS total_revenue,
       MAX(CASE WHEN yr_rank = 1 THEN yr END)        AS best_year,
       RANK() OVER (ORDER BY SUM(revenue) DESC)      AS overall_rank
FROM ranked
GROUP BY product_id
ORDER BY overall_rank;`,
      explanation: 'A window function applies to the output of the FROM clause, so putting it inside a union branch would rank within that year only. The final RANK sits in the same SELECT as a GROUP BY, which is legal because windows are evaluated after aggregation.',
    },
    {
      id: 'p25-q8',
      difficulty: 'hard',
      prompt: 'Merge two tables where the column orders differ, and show what goes wrong if you rely on position.',
      tables: ['sales_2023 / sales_2024'],
      think: 'A union matches columns by position, not by name. When is that silently dangerous?',
      hint: 'When two columns have compatible types — region and product name, or two numerics — the query runs and the data is scrambled.',
      approach: `Write both branches with explicit column lists in a deliberately matching order.\nNote that the column names in later branches are ignored entirely.\nObserve that a positional mismatch between two compatible types produces no error.\nMake the ordering explicit in every branch as the defence.`,
      solution: `-- Correct: identical order, explicit lists
SELECT product_id, region, sale_date, amount FROM sales_2023
UNION ALL
SELECT product_id, region, sale_date, amount FROM sales_2024
ORDER BY sale_date;

-- Silently wrong: amount and product_id swapped in the second branch.
-- Both are numeric, so there is no error — the data is simply scrambled.
-- SELECT product_id, region, sale_date, amount FROM sales_2023
-- UNION ALL
-- SELECT amount, region, sale_date, product_id FROM sales_2024;`,
      explanation: 'Unions bind by position and take names from the first branch only, so a swap between two numeric columns produces no error at all. Writing explicit column lists in an identical order in every branch — never SELECT * — is the only defence, and it also survives someone adding a column to one table.',
    },
    {
      id: 'p25-q9',
      difficulty: 'hard',
      prompt: 'Build a single report with detail rows and a total row appended at the bottom.',
      tables: ['sales'],
      think: 'Detail and total are different grains. How do you get them into one result and keep the total last?',
      hint: 'UNION ALL the two grains, plus a sort key column that forces the total to the end.',
      approach: `Produce the detail rows with a sort key of 0.\nProduce the total row with the same column shape and a sort key of 1.\nStack them with UNION ALL.\nOrder by the sort key first, then by the detail ordering.`,
      solution: `SELECT 0 AS sort_key,
       region,
       SUM(amount) AS revenue,
       COUNT(*)    AS sales_count
FROM sales
GROUP BY region

UNION ALL

SELECT 1,
       'TOTAL',
       SUM(amount),
       COUNT(*)
FROM sales

ORDER BY sort_key, revenue DESC;`,
      explanation: 'The sort_key column exists only to pin the total row to the bottom regardless of how the detail rows sort — without it the total would be ordered among them by revenue. GROUP BY ROLLUP (region) achieves the same result in one pass and is the better answer when the engine supports it.',
    },
    {
      id: 'p25-q10',
      difficulty: 'hard',
      prompt: 'Merge monthly partition tables named sales_2024_01 through sales_2024_12 without writing twelve SELECTs by hand.',
      tables: ['sales_2023 / sales_2024'],
      think: 'SQL has no loop over table names. What are the real options when the table list is dynamic?',
      hint: 'Table inheritance or declarative partitioning, a view, or generated SQL — not a clever query.',
      approach: `Recognise that a table name cannot be parameterised in plain SQL.\nPrefer declarative partitioning so one parent table already spans all months.\nOtherwise create a view whose body is the union, generated once from the catalog.\nAs a last resort, generate the SQL text from information_schema and execute it.`,
      solution: `-- Best: declarative partitioning — one table, transparent to every query
-- CREATE TABLE sales_2024 (...) PARTITION BY RANGE (sale_date);
-- CREATE TABLE sales_2024_01 PARTITION OF sales_2024
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- SELECT * FROM sales_2024 WHERE sale_date >= DATE '2024-03-01';

-- Otherwise: generate the union text from the catalog, then execute it
SELECT STRING_AGG(FORMAT('SELECT * FROM %I', table_name),
                  E'\nUNION ALL\n' ORDER BY table_name)
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'sales\_2024\___';`,
      explanation: 'Partitioning is the real answer: the planner prunes irrelevant partitions from a normal query, so no union is ever written and adding a month needs no code change. Generated SQL is the pragmatic fallback, and FORMAT with %I quotes the identifiers so a malicious or odd table name cannot inject.',
      dialect: 'Declarative partitioning is PostgreSQL 10+, MySQL 5.7+, Oracle and SQL Server (partitioned tables). The catalog view is information_schema.tables in most engines; SQL Server also has sys.tables.',
    },
  ],
};
