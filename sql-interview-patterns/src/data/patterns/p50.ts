import type { Pattern } from '../types';

export const p50: Pattern = {
  num: 50,
  slug: 'query-performance-analysis',
  title: 'Query Performance Analysis',
  concept: 'EXPLAIN / EXPLAIN ANALYZE',
  category: 'Performance',
  tagline: 'Read the plan, find the row-estimate that is wrong, and fix the cause rather than the symptom.',
  theory: `EXPLAIN shows the plan the optimiser *intends*. EXPLAIN ANALYZE runs the query and shows what actually happened, including real timings and real row counts. Only the second tells you whether the optimiser was right — and it executes the query, so never run it on an UPDATE or DELETE outside a transaction you will roll back.

Read a plan from the inside out: the most indented nodes run first and feed their parents. On each node compare **estimated rows against actual rows**. A large discrepancy is almost always the root cause — the optimiser picked a nested loop expecting 10 rows, got 500,000, and the query fell off a cliff. Fix the estimate (ANALYZE the table, add a statistics target, restructure the predicate) rather than fighting the plan with hints.

The scan types in increasing cost: Index Only Scan, Index Scan, Bitmap Heap Scan, Sequential Scan. A sequential scan is not automatically bad — reading a small table or most of a large one is genuinely faster than random index lookups.

Join methods: Nested Loop is right for a few rows on the outer side, Hash Join for larger unsorted inputs, Merge Join when both sides are already sorted.

The common fixes are unglamorous: make the predicate sargable (no function on the indexed column), add the index the plan wants, reduce rows earlier, and avoid SELECT * so an index-only scan becomes possible.`,
  pitfalls: [
    'Running EXPLAIN ANALYZE on a data-modifying statement outside a transaction — it really executes.',
    'Reading only the total cost instead of comparing estimated against actual rows per node.',
    'Treating every sequential scan as a bug; on small tables it is the right choice.',
    'Adding indexes without measuring — every index slows writes and takes space.',
    'Benchmarking on a cold cache or on data volumes unlike production, and drawing conclusions from it.',
  ],
  questions: [
    {
      id: 'p50-q1',
      difficulty: 'easy',
      prompt: 'Show the plan for a simple filtered query and identify the scan type.',
      tables: ['orders'],
      think: 'What is the difference between what EXPLAIN tells you and what EXPLAIN ANALYZE tells you?',
      hint: 'EXPLAIN estimates; EXPLAIN ANALYZE executes and reports reality.',
      approach: `Run EXPLAIN to see the intended plan and the estimated row count.\nRun EXPLAIN ANALYZE to see the actual rows and timing.\nCompare the estimate against the actual.\nNote the scan type chosen.`,
      solution: `EXPLAIN
SELECT order_id, amount
FROM orders
WHERE customer_id = 42;

EXPLAIN (ANALYZE, BUFFERS)
SELECT order_id, amount
FROM orders
WHERE customer_id = 42;`,
      explanation: 'BUFFERS adds how many pages were read from cache versus disk, which separates "this query is slow" from "this query was cold". The estimate-versus-actual comparison on the scan node is the first thing to look at in any plan.',
      dialect: 'EXPLAIN ANALYZE is PostgreSQL / MySQL 8.0.18+. SQL Server: SET STATISTICS IO, TIME ON plus the actual execution plan. Oracle: EXPLAIN PLAN plus DBMS_XPLAN.DISPLAY_CURSOR.',
    },
    {
      id: 'p50-q2',
      difficulty: 'easy',
      prompt: 'Compare the plan for a sargable predicate against a non-sargable one.',
      tables: ['orders'],
      think: 'What does wrapping the indexed column in a function do to the planner\'s options?',
      hint: 'It cannot use the index, because the index stores the raw column values.',
      approach: `Write the predicate with the column wrapped in a function.\nWrite the equivalent with the column bare and the arithmetic on the constant side.\nCompare the plans.\nNote which one can seek.`,
      solution: `-- Non-sargable: the function must be evaluated for every row
EXPLAIN ANALYZE
SELECT * FROM orders
WHERE EXTRACT(YEAR FROM order_date) = 2024;

-- Sargable: the index on order_date can seek a contiguous range
EXPLAIN ANALYZE
SELECT * FROM orders
WHERE order_date >= DATE '2024-01-01'
  AND order_date <  DATE '2025-01-01';`,
      explanation: 'An index stores raw column values in order, so a predicate can only seek when the indexed column appears alone on one side of the comparison. The half-open range is also more correct than BETWEEN if order_date ever becomes a timestamp — it needs no end-of-day fiddling.',
    },
    {
      id: 'p50-q3',
      difficulty: 'medium',
      prompt: 'Find the node where the row estimate is most wrong.',
      tables: ['orders', 'customers'],
      think: 'Why does a bad estimate matter more than a slow node?',
      hint: 'The estimate drives every join and scan choice above it, so one bad estimate poisons the whole plan.',
      approach: `Run EXPLAIN ANALYZE on a multi-table query.\nFor each node, read the estimated rows and the actual rows.\nCompute the ratio between them.\nThe node with the largest ratio is where the plan went wrong.`,
      solution: `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT c.customer_name,
       COUNT(*)      AS orders,
       SUM(o.amount) AS revenue
FROM customers AS c
JOIN orders    AS o ON o.customer_id = c.customer_id
WHERE o.order_date >= DATE '2024-01-01'
  AND c.country = 'UK'
GROUP BY c.customer_name
ORDER BY revenue DESC
LIMIT 10;

-- Read each node as:  (cost=... rows=EST ...) (actual ... rows=ACT ...)
-- A ratio far from 1 on a low node is the root cause.`,
      explanation: 'A node estimating 10 rows that returns 500,000 will have caused the planner to choose a nested loop, and the cost of that mistake multiplies through every node above it. Fix the estimate — run ANALYZE, raise the statistics target, or simplify a predicate the planner cannot reason about — rather than trying to force a different join.',
    },
    {
      id: 'p50-q4',
      difficulty: 'medium',
      prompt: 'Identify which index a query needs and write it.',
      tables: ['orders'],
      think: 'What does the plan tell you about the columns that should be in the index, and in what order?',
      hint: 'Equality predicates first, then range predicates, then columns needed only for output.',
      approach: `Look at the predicates in the query and classify them as equality or range.\nPut the equality columns first in the index, then the range column.\nAdd the selected columns as included columns for an index-only scan.\nRe-run EXPLAIN to confirm the plan changed.`,
      solution: `EXPLAIN ANALYZE
SELECT order_id, amount
FROM orders
WHERE customer_id = 42
  AND order_date >= DATE '2024-01-01'
ORDER BY order_date DESC;

-- Equality column first, then the range column, then the payload:
CREATE INDEX orders_cust_date_idx
    ON orders (customer_id, order_date DESC)
    INCLUDE (amount);

-- Re-run the EXPLAIN: expect an Index Only Scan.`,
      explanation: 'Equality columns must come first because they fix a single value and let the range column\'s ordering still be useful — reverse them and the index can only be scanned, not seeked. INCLUDE puts the output column in the leaf pages without making it part of the key, which is what enables an index-only scan.',
      dialect: 'INCLUDE is PostgreSQL 11+ and SQL Server. MySQL has no INCLUDE — add the column to the key instead. Oracle: put it in the key or use an index-organised table.',
    },
    {
      id: 'p50-q5',
      difficulty: 'medium',
      prompt: 'Explain why SELECT * can prevent an index-only scan.',
      tables: ['orders'],
      think: 'What does the engine have to do when the index does not contain every column the query needs?',
      hint: 'Visit the table heap for each matching row, which is a random read per row.',
      approach: `Run the query selecting only the indexed columns.\nRun the same query with SELECT *.\nCompare the scan node in each plan.\nNote the extra heap access in the second.`,
      solution: `-- Index Only Scan: everything needed is in the index
EXPLAIN ANALYZE
SELECT customer_id, order_date
FROM orders
WHERE customer_id = 42;

-- Index Scan + heap fetches: the index cannot satisfy SELECT *
EXPLAIN ANALYZE
SELECT *
FROM orders
WHERE customer_id = 42;`,
      explanation: 'An index-only scan never touches the table, so it avoids one random read per matching row — which on a wide table is most of the query cost. Selecting only the columns you need is the cheapest optimisation available and it costs nothing but discipline.',
    },
    {
      id: 'p50-q6',
      difficulty: 'medium',
      prompt: 'Compare the plans for a correlated subquery and the equivalent join.',
      tables: ['orders', 'customers'],
      think: 'Modern planners often rewrite one into the other. When do they fail to?',
      hint: 'When the subquery appears several times in the select list, or contains something the planner cannot flatten.',
      approach: `Write the lookup as two correlated scalar subqueries in the select list.\nWrite the equivalent as a single join.\nCompare the plans and the number of scans of the inner table.\nNote whether the planner flattened the subqueries.`,
      solution: `EXPLAIN ANALYZE
SELECT c.customer_id,
       (SELECT COUNT(*)    FROM orders o WHERE o.customer_id = c.customer_id) AS orders,
       (SELECT SUM(amount) FROM orders o WHERE o.customer_id = c.customer_id) AS revenue
FROM customers AS c;

EXPLAIN ANALYZE
SELECT c.customer_id,
       COUNT(o.order_id) AS orders,
       SUM(o.amount)     AS revenue
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
GROUP BY c.customer_id;`,
      explanation: 'Two separate scalar subqueries usually mean two passes over orders, whereas the join computes both aggregates in one — planners rarely merge sibling subqueries even when they can flatten a single one. The join version is also the one that keeps working when a third aggregate is added.',
    },
    {
      id: 'p50-q7',
      difficulty: 'hard',
      prompt: 'Diagnose a query that is slow because of a nested loop over a large outer input.',
      tables: ['orders', 'order_items'],
      think: 'A nested loop probes the inner side once per outer row. When is that the wrong choice?',
      hint: 'When the outer side has far more rows than the planner estimated.',
      approach: `Run EXPLAIN ANALYZE on a join whose outer side is underestimated.\nLook for a Nested Loop whose outer actual rows far exceed its estimate.\nRefresh the statistics so the planner sees the real distribution.\nRe-run and expect a Hash Join instead.`,
      solution: `EXPLAIN (ANALYZE, BUFFERS)
SELECT o.order_id, oi.product_id, oi.quantity
FROM orders      AS o
JOIN order_items AS oi ON oi.order_id = o.order_id
WHERE o.order_date >= DATE '2024-01-01';

-- If the plan shows:
--   Nested Loop  (rows=50) (actual rows=480000 loops=1)
-- the estimate is three orders of magnitude out. Refresh statistics:
ANALYZE orders;
ANALYZE order_items;

-- Then re-run. A Hash Join is expected once the estimate is realistic.`,
      explanation: 'A nested loop is optimal for a handful of outer rows and catastrophic for hundreds of thousands, because it pays an index probe per row rather than one hash build. Stale statistics are the most common cause of the misestimate, which is why ANALYZE is the first thing to try before touching the query.',
    },
    {
      id: 'p50-q8',
      difficulty: 'hard',
      prompt: 'Find which indexes exist on a table and which are never used.',
      tables: ['orders'],
      think: 'What is the cost of an index nobody uses?',
      hint: 'Write amplification on every insert and update, plus disk space.',
      approach: `List the indexes on the table from the catalog.\nRead the usage statistics for each.\nIdentify indexes with zero or near-zero scans.\nConsider dropping them, after checking they are not serving a constraint.`,
      solution: `SELECT i.relname        AS index_name,
       t.relname        AS table_name,
       s.idx_scan       AS times_used,
       pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
       ix.indisunique   AS enforces_uniqueness
FROM pg_class      AS t
JOIN pg_index      AS ix ON ix.indrelid = t.oid
JOIN pg_class      AS i  ON i.oid       = ix.indexrelid
LEFT JOIN pg_stat_user_indexes AS s ON s.indexrelid = i.oid
WHERE t.relname = 'orders'
ORDER BY s.idx_scan NULLS FIRST, pg_relation_size(i.oid) DESC;`,
      explanation: 'Every index must be updated on every write, so an unused one is pure cost — and a large unused index on a hot table is a real throughput problem. The uniqueness column is the safety check: an index backing a constraint must never be dropped however rarely it is scanned.',
      dialect: 'pg_stat_user_indexes is PostgreSQL. SQL Server: sys.dm_db_index_usage_stats. MySQL: performance_schema.table_io_waits_summary_by_index_usage. Oracle: monitor with ALTER INDEX ... MONITORING USAGE.',
    },
    {
      id: 'p50-q9',
      difficulty: 'hard',
      prompt: 'Rewrite a query that filters on a window-function result so the filtering happens earlier.',
      tables: ['orders'],
      think: 'Window functions run after WHERE. What does that mean for how many rows they process?',
      hint: 'Every row that survives WHERE gets windowed, even those the outer filter will discard.',
      approach: `Write the naive version: window over everything, then filter the result in an outer query.\nIdentify predicates that could safely run before the window without changing its meaning.\nPush those into the inner query.\nCompare the rows processed by the window node in both plans.`,
      solution: `-- Naive: the window sorts and numbers every order in the table
EXPLAIN ANALYZE
SELECT * FROM (
    SELECT o.*,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date DESC) AS rn
    FROM orders AS o
) AS r
WHERE rn = 1
  AND order_date >= DATE '2024-01-01';

-- Better: push the date filter below the window, since restricting the
-- input to 2024 does not change which row is "latest within 2024"
EXPLAIN ANALYZE
SELECT * FROM (
    SELECT o.*,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date DESC) AS rn
    FROM orders AS o
    WHERE o.order_date >= DATE '2024-01-01'
) AS r
WHERE rn = 1;`,
      explanation: 'The window node has to sort every row it receives, so shrinking its input is usually the largest single win available in this shape of query. The caveat is semantic: pushing a filter below the window changes what the window sees, so it is only safe when the question is genuinely scoped to that subset — here, "latest order in 2024" rather than "latest order overall, if it fell in 2024".',
    },
    {
      id: 'p50-q10',
      difficulty: 'hard',
      prompt: 'Write a systematic checklist for diagnosing a slow query, and demonstrate it.',
      tables: ['orders', 'customers', 'order_items'],
      think: 'What order should the checks go in, so you find the cause rather than a symptom?',
      hint: 'Measure, find the worst estimate, check the scans and joins, then change one thing at a time.',
      approach: `Measure the query with EXPLAIN ANALYZE and BUFFERS to get a baseline.\nFind the node with the worst estimate-to-actual ratio, which is usually the root cause.\nCheck for non-sargable predicates and missing indexes on that node.\nChange one thing, re-measure, and keep the change only if it helped.`,
      solution: `-- 1. Baseline with real timings and real row counts
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT c.country,
       COUNT(DISTINCT o.customer_id)    AS customers,
       SUM(oi.quantity * oi.unit_price) AS revenue
FROM customers   AS c
JOIN orders      AS o  ON o.customer_id = c.customer_id
JOIN order_items AS oi ON oi.order_id   = o.order_id
WHERE o.order_date >= DATE '2024-01-01'
GROUP BY c.country
ORDER BY revenue DESC;

-- 2. Worst estimate/actual ratio?  -> refresh statistics
--    ANALYZE orders; ANALYZE order_items;
-- 3. Non-sargable predicates?      -> keep the column bare in WHERE
-- 4. Scan types?                   -> Seq Scan on a filtered large table
--                                     suggests a missing index
--    CREATE INDEX orders_date_idx ON orders (order_date)
--        INCLUDE (customer_id, order_id);
-- 5. Join methods?                 -> Nested Loop over a big outer side
--                                     means the estimate is wrong, not the join
-- 6. Re-measure after each single change, and revert anything that did not help.`,
      explanation: 'The order matters: statistics first because a bad estimate makes every other observation misleading, then sargability, then indexes, then join methods. Changing one thing at a time and re-measuring is what separates tuning from guessing — and it is the answer an interviewer is listening for far more than any specific index.',
    },
  ],
};
