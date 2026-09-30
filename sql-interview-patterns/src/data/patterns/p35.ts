import type { Pattern } from '../types';

export const p35: Pattern = {
  num: 35,
  slug: 'detect-gaps-in-sequence',
  title: 'Detect Gaps in Sequence',
  concept: 'ROW_NUMBER() Logic',
  category: 'Time Series & Dates',
  tagline: 'The other half of gaps-and-islands: find what is missing, not what is present.',
  theory: `Pattern 34 found the islands. This one finds the gaps — missing invoice numbers, days with no activity, skipped sequence values, holes in a partition load.

There are two shapes, and choosing the right one is most of the work.

**Gap between existing rows.** LEAD the sort key onto the current row and compare: if the next value is more than one step away, the space between them is a gap. Cheap, needs no reference data, and reports gaps as ranges rather than individual values. It cannot find a gap at the very start or end of the range, because there is no row on one side.

**Gap against an expected set.** Generate the complete sequence — every day, every integer from min to max, every (customer, month) combination — and anti-join the actual data against it. This finds every missing value individually and is the only option when the missing rows are at the edges, or when "expected" is defined by something outside the table.

A useful diagnostic: if COUNT(*) equals MAX(id) − MIN(id) + 1 then the sequence is dense and there are no gaps at all. That one comparison tells you whether the expensive query is worth running.`,
  pitfalls: [
    'Using LEAD-based gap detection and missing gaps at the boundaries of the range.',
    'Generating a spine that starts at the data\'s own minimum, which by definition cannot reveal a leading gap.',
    'Forgetting PARTITION BY, so a gap is reported at every boundary between entities.',
    'Treating a database sequence\'s skipped values as data loss — sequences are not gapless by design after a rollback.',
    'Generating a huge spine for a sparse range when the LEAD form would have answered in one pass.',
  ],
  questions: [
    {
      id: 'p35-q1',
      difficulty: 'easy',
      prompt: 'Check quickly whether order_id has any gaps at all.',
      tables: ['orders'],
      think: 'What arithmetic relationship holds exactly when a sequence is dense?',
      hint: 'Count equals max minus min plus one.',
      approach: `Count the rows.\nTake the minimum and maximum id.\nCompare the count against the span implied by those bounds.\nReport the number of missing values.`,
      solution: `SELECT COUNT(*)                              AS rows,
       MIN(order_id)                         AS min_id,
       MAX(order_id)                         AS max_id,
       MAX(order_id) - MIN(order_id) + 1     AS expected_if_dense,
       MAX(order_id) - MIN(order_id) + 1 - COUNT(*) AS missing_count
FROM orders;`,
      explanation: 'This single query tells you whether a full gap hunt is worth running — missing_count of zero means the sequence is dense and you can stop. It assumes order_id is unique; if duplicates are possible, use COUNT(DISTINCT order_id).',
    },
    {
      id: 'p35-q2',
      difficulty: 'easy',
      prompt: 'Find the ranges of missing order_id values using LEAD.',
      tables: ['orders'],
      think: 'A gap lives between two existing rows. How do you see both ends from one row?',
      hint: 'LEAD the id and compare it to the current id plus one.',
      approach: `Order the orders by id.\nLEAD the id to see the next one that exists.\nWhere the next id is more than one greater, the values in between are missing.\nReturn the gap bounds and its size.`,
      solution: `WITH seq AS (
    SELECT order_id,
           LEAD(order_id) OVER (ORDER BY order_id) AS next_id
    FROM orders
)
SELECT order_id + 1      AS gap_start,
       next_id - 1       AS gap_end,
       next_id - order_id - 1 AS missing_count
FROM seq
WHERE next_id IS NOT NULL
  AND next_id > order_id + 1
ORDER BY gap_start;`,
      explanation: 'Reporting gaps as ranges rather than individual values keeps the output small even when thousands of ids are missing. The cost is that a gap before the first row or after the last is invisible — there is no neighbouring row to detect it from.',
    },
    {
      id: 'p35-q3',
      difficulty: 'medium',
      prompt: 'List every individual missing order_id, not just the ranges.',
      tables: ['orders'],
      think: 'To list what is absent you must first create it. What generates the complete expected sequence?',
      hint: 'generate_series between the min and max, then anti-join.',
      approach: `Find the minimum and maximum existing id.\nGenerate every integer in that range.\nAnti-join the actual orders against that series.\nReturn the ids with no matching row.`,
      solution: `WITH bounds AS (
    SELECT MIN(order_id) AS lo, MAX(order_id) AS hi FROM orders
),
expected AS (
    SELECT generate_series(lo, hi) AS order_id FROM bounds
)
SELECT e.order_id AS missing_order_id
FROM expected AS e
WHERE NOT EXISTS (
    SELECT 1 FROM orders AS o WHERE o.order_id = e.order_id
)
ORDER BY e.order_id;`,
      explanation: 'Generating the expected set is the only way to name each missing value individually, and it also handles the case where every id in a long stretch is absent. Bounding the series by the data\'s own min and max means a gap before the first surviving row still cannot be found — question 5 addresses that.',
      dialect: 'generate_series is PostgreSQL. MySQL 8: a recursive CTE. SQL Server: a numbers table or a recursive CTE. Oracle: CONNECT BY LEVEL.',
    },
    {
      id: 'p35-q4',
      difficulty: 'medium',
      prompt: 'Find days between 2024-01-01 and 2024-12-31 with no sales at all.',
      tables: ['sales'],
      think: 'A day with no sales has no row anywhere. What supplies it?',
      hint: 'A calendar spine anti-joined against the days that do have sales.',
      approach: `Generate every date in the reporting range.\nCollect the distinct dates on which sales occurred.\nAnti-join the calendar against those dates.\nReturn the missing days with their day of week, which often explains the pattern.`,
      solution: `WITH calendar AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
)
SELECT c.d AS no_sales_day,
       TO_CHAR(c.d, 'Day') AS day_name
FROM calendar AS c
WHERE NOT EXISTS (
    SELECT 1 FROM sales AS s WHERE s.sale_date = c.d
)
ORDER BY c.d;`,
      explanation: 'The calendar range is defined by the reporting period rather than by the data, which is what lets it find a dead day at the very start of the year. Returning the day name usually explains most of the result immediately — weekends and holidays rather than a broken pipeline.',
    },
    {
      id: 'p35-q5',
      difficulty: 'medium',
      prompt: 'Find gaps in each customer\'s order sequence number, where the sequence should run 1, 2, 3 per customer.',
      tables: ['orders'],
      think: 'The expected sequence differs per customer. What generates a per-group spine?',
      hint: 'Compare the actual row number against a densely generated one, per partition.',
      approach: `Number each customer's orders in date order — this produces a dense sequence by construction.\nCompare that dense number against the gap-prone stored sequence.\nWhere they diverge, values are missing.\nReport the first divergence per customer.`,
      solution: `WITH numbered AS (
    SELECT customer_id,
           order_id,
           order_date,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date, order_id) AS dense_seq,
           LEAD(order_id) OVER (PARTITION BY customer_id
                                ORDER BY order_id) AS next_order_id
    FROM orders
)
SELECT customer_id,
       order_id      AS gap_after,
       next_order_id AS gap_before,
       next_order_id - order_id - 1 AS ids_missing,
       dense_seq
FROM numbered
WHERE next_order_id IS NOT NULL
  AND next_order_id > order_id + 1
ORDER BY ids_missing DESC;`,
      explanation: 'ROW_NUMBER always produces a dense sequence, so comparing it against a stored sequence number is a general way to detect divergence. The LEAD comparison is partitioned so a jump in order_id between two customers is not reported as a gap.',
    },
    {
      id: 'p35-q6',
      difficulty: 'medium',
      prompt: 'Find months in which a customer who was active before and after placed no orders.',
      tables: ['orders'],
      think: 'A gap must be bounded on both sides to count. What stops you reporting every month before a customer existed?',
      hint: 'Bound the spine per customer by their own first and last order month.',
      approach: `Reduce orders to the distinct months each customer was active.\nCompute each customer's first and last active month.\nGenerate every month between those bounds per customer.\nAnti-join the actual active months against that per-customer spine.`,
      solution: `WITH active AS (
    SELECT DISTINCT customer_id, DATE_TRUNC('month', order_date)::date AS mth
    FROM orders
),
bounds AS (
    SELECT customer_id, MIN(mth) AS first_mth, MAX(mth) AS last_mth
    FROM active
    GROUP BY customer_id
),
expected AS (
    SELECT b.customer_id,
           generate_series(b.first_mth, b.last_mth, INTERVAL '1 month')::date AS mth
    FROM bounds AS b
)
SELECT e.customer_id, e.mth AS inactive_month
FROM expected AS e
WHERE NOT EXISTS (
    SELECT 1 FROM active AS a
    WHERE a.customer_id = e.customer_id AND a.mth = e.mth
)
ORDER BY e.customer_id, e.mth;`,
      explanation: 'Bounding the spine by each customer\'s own first and last activity is what makes this a churn signal rather than a list of months before they signed up. A lateral generate_series driven by a per-row range is the general way to build a per-group spine.',
    },
    {
      id: 'p35-q7',
      difficulty: 'hard',
      prompt: 'Find missing (product, month) combinations where a product sold in some months but not others.',
      tables: ['sales', 'products'],
      think: 'The expected set is a cross product. Which two sets are being crossed, and how is it bounded?',
      hint: 'CROSS JOIN the products against the month spine, bounded per product by its own first and last sale.',
      approach: `Aggregate sales to distinct product-months.\nFind each product's first and last active month.\nGenerate the months between those bounds for each product.\nAnti-join the actual product-months against that grid.`,
      solution: `WITH active AS (
    SELECT DISTINCT product_id, DATE_TRUNC('month', sale_date)::date AS mth
    FROM sales
),
bounds AS (
    SELECT product_id, MIN(mth) AS first_mth, MAX(mth) AS last_mth
    FROM active GROUP BY product_id
),
expected AS (
    SELECT b.product_id,
           generate_series(b.first_mth, b.last_mth, INTERVAL '1 month')::date AS mth
    FROM bounds AS b
)
SELECT p.product_name,
       e.mth AS dormant_month,
       COUNT(*) OVER (PARTITION BY e.product_id) AS total_dormant_months
FROM expected AS e
JOIN products AS p ON p.product_id = e.product_id
WHERE NOT EXISTS (
    SELECT 1 FROM active AS a
    WHERE a.product_id = e.product_id AND a.mth = e.mth
)
ORDER BY total_dormant_months DESC, p.product_name, e.mth;`,
      explanation: 'Bounding per product rather than globally is what distinguishes "this product went quiet" from "this product had not launched yet" — a global spine would report every month before launch as dormant. The window count turns a long row list into a ranked list of the most intermittent products.',
    },
    {
      id: 'p35-q8',
      difficulty: 'hard',
      prompt: 'Report both the gaps and the islands in a login sequence, in one result.',
      tables: ['logins'],
      think: 'Gaps and islands are complements. Can one query produce both without scanning twice?',
      hint: 'Build the islands, then LEAD the next island start to derive the gap between them.',
      approach: `Reduce to distinct user-days and build the island key.\nGroup by user and island to get each run's bounds.\nLEAD the next run's start to find where each gap begins and ends.\nEmit a row per island with the gap that follows it.`,
      solution: `WITH distinct_days AS (
    SELECT DISTINCT user_id, login_date FROM logins
),
keyed AS (
    SELECT user_id, login_date,
           login_date - (ROW_NUMBER() OVER (PARTITION BY user_id
                                            ORDER BY login_date))::int AS island_key
    FROM distinct_days
),
islands AS (
    SELECT user_id, island_key,
           MIN(login_date) AS island_start,
           MAX(login_date) AS island_end,
           COUNT(*)        AS island_days
    FROM keyed
    GROUP BY user_id, island_key
)
SELECT user_id,
       island_start,
       island_end,
       island_days,
       island_end + 1 AS gap_start,
       LEAD(island_start) OVER (PARTITION BY user_id ORDER BY island_start) - 1 AS gap_end,
       LEAD(island_start) OVER (PARTITION BY user_id ORDER BY island_start)
     - island_end - 1 AS gap_days
FROM islands
ORDER BY user_id, island_start;`,
      explanation: 'Islands and gaps are duals: once the runs exist, the gap between consecutive runs is a single LEAD away. The last island per user has a NULL gap, which correctly means "nothing after this yet" rather than a gap of zero.',
    },
    {
      id: 'p35-q9',
      difficulty: 'hard',
      prompt: 'Detect a broken data load: days where the row count fell more than 50% below the trailing 7-day average, including days with zero rows.',
      tables: ['sales'],
      think: 'A day with zero rows is a gap, not a low value. How do you get it into the comparison at all?',
      hint: 'Calendar spine plus COALESCE to zero, then a trailing average that excludes the current day.',
      approach: `Generate the calendar for the reporting range.\nLEFT JOIN the daily row counts and treat a missing day as zero.\nCompute a trailing 7-day average that excludes the current day.\nFlag days whose count is below half that baseline.`,
      solution: `WITH calendar AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
),
daily AS (
    SELECT sale_date, COUNT(*) AS rows
    FROM sales
    GROUP BY sale_date
),
filled AS (
    SELECT c.d, COALESCE(dl.rows, 0) AS rows
    FROM calendar AS c
    LEFT JOIN daily AS dl ON dl.sale_date = c.d
),
baselined AS (
    SELECT d, rows,
           AVG(rows) OVER (ORDER BY d ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) AS baseline,
           COUNT(*)  OVER (ORDER BY d ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) AS obs
    FROM filled
)
SELECT d AS suspect_day,
       rows,
       ROUND(baseline, 1) AS trailing_avg,
       ROUND(100.0 * rows / NULLIF(baseline, 0), 1) AS pct_of_baseline
FROM baselined
WHERE obs = 7
  AND rows < 0.5 * baseline
ORDER BY pct_of_baseline;`,
      explanation: 'Without the calendar spine a completely failed load produces no row at all and the anomaly is invisible — the absence has to be materialised as a zero before any comparison can see it. Excluding the current day from the baseline stops a partial load from lowering the very threshold it should be failing.',
    },
    {
      id: 'p35-q10',
      difficulty: 'hard',
      prompt: 'Compare the LEAD approach and the spine approach for finding gaps, and say when each is right.',
      tables: ['orders'],
      think: 'Both are correct. What makes one unusable in a given situation?',
      hint: 'Boundary gaps and output size on one side; spine cost on the other.',
      approach: `Run the LEAD version to get gap ranges.\nRun the spine version to get individual missing values.\nCompare their row counts and note which gaps only one can find.\nChoose based on range density and whether boundary gaps matter.`,
      solution: `-- LEAD: one row per gap RANGE, cheap, cannot see boundary gaps
WITH seq AS (
    SELECT order_id, LEAD(order_id) OVER (ORDER BY order_id) AS next_id
    FROM orders
)
SELECT 'lead' AS method,
       COUNT(*)                       AS gap_ranges,
       SUM(next_id - order_id - 1)    AS values_missing
FROM seq
WHERE next_id > order_id + 1

UNION ALL

-- Spine: one row per MISSING VALUE, finds boundary gaps when the range
-- is defined externally, but materialises the whole expected sequence
SELECT 'spine',
       NULL,
       COUNT(*)
FROM generate_series(
        (SELECT MIN(order_id) FROM orders),
        (SELECT MAX(order_id) FROM orders)
     ) AS e(order_id)
WHERE NOT EXISTS (SELECT 1 FROM orders AS o WHERE o.order_id = e.order_id);`,
      explanation: 'Both report the same total number of missing values here, because the spine is bounded by the data itself — the moment the expected range comes from outside the table, only the spine can find a gap at the edges. Use LEAD when the sequence is mostly dense and you want compact ranges; use the spine when you need to name each missing value or when "expected" is externally defined.',
    },
  ],
};
