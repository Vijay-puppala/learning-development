import type { Pattern } from '../types';

export const p39: Pattern = {
  num: 39,
  slug: 'distinct-count',
  title: 'Distinct Count',
  concept: 'COUNT(DISTINCT)',
  category: 'Aggregation & Grouping',
  tagline: 'Counting unique things. Non-additive, NULL-skipping, and expensive — three facts that shape every design.',
  theory: `COUNT(DISTINCT col) counts unique non-NULL values. Three properties follow from that, and all three matter.

**It ignores NULLs.** COUNT(DISTINCT country) over (UK, UK, NULL) is 1, not 2. If "unknown" should count as a category, COALESCE it to a sentinel first.

**It is not additive.** You cannot sum January's distinct customers and February's to get the two-month figure — someone who ordered in both would be counted twice. This is the single most important fact about the measure: every reporting grain needs its own COUNT(DISTINCT), and pre-aggregated tables cannot serve an arbitrary date range. Sums and counts roll up; distinct counts do not.

**It is expensive.** Deduplication needs a sort or hash of the values, which is memory-hungry on high-cardinality columns. On large tables, approximate counters (HyperLogLog: approx_count_distinct, APPROX_COUNT_DISTINCT, HLL) trade about 2% error for an enormous speedup, and that trade is usually worth naming in an interview.

On a fanned-out join, COUNT(*) counts join combinations while COUNT(DISTINCT key) counts entities — which is why the distinct form is often the only correct one after a multi-table join.`,
  pitfalls: [
    'Summing distinct counts across periods or groups. The result double-counts everything that appears in more than one.',
    'Forgetting NULLs are excluded, so an "unknown" bucket silently vanishes from the count.',
    'Using COUNT(*) after a fan-out join when you meant to count entities.',
    'Expecting COUNT(DISTINCT a, b) to work — most engines require a concatenation or a subquery.',
    'Attempting COUNT(DISTINCT x) OVER (...), which most engines reject outright.',
  ],
  questions: [
    {
      id: 'p39-q1',
      difficulty: 'easy',
      prompt: 'Count how many distinct customers placed an order, and how many orders there were.',
      tables: ['orders'],
      think: 'What does the ratio of the two numbers tell you?',
      hint: 'Orders per customer — a repeat-purchase indicator.',
      approach: `Count the rows for the order total.\nCount the distinct customer ids for the customer total.\nDivide to get orders per customer.\nGuard the division.`,
      solution: `SELECT COUNT(*)                     AS orders,
       COUNT(DISTINCT customer_id)  AS distinct_customers,
       ROUND(1.0 * COUNT(*) / NULLIF(COUNT(DISTINCT customer_id), 0), 2)
         AS orders_per_customer
FROM orders;`,
      explanation: 'The two counts differ by exactly the amount of repeat purchasing in the data, so their ratio is a free loyalty metric. Note that any order with a NULL customer_id contributes to COUNT(*) but not to the distinct count.',
    },
    {
      id: 'p39-q2',
      difficulty: 'easy',
      prompt: 'Show that COUNT(DISTINCT) ignores NULLs, and produce a version that counts "unknown" as a category.',
      tables: ['customers'],
      think: 'Is an unknown country one category or no category? Which reading does the business want?',
      hint: 'COALESCE to a sentinel before counting to include it.',
      approach: `Count the distinct countries directly, which excludes NULLs.\nCount the distinct countries after coalescing NULL to a sentinel.\nCount the NULL rows separately.\nCompare the two distinct counts.`,
      solution: `SELECT COUNT(*)                                          AS rows,
       COUNT(DISTINCT country)                           AS distinct_countries,
       COUNT(DISTINCT COALESCE(country, '(unknown)'))    AS distinct_incl_unknown,
       COUNT(*) FILTER (WHERE country IS NULL)           AS null_country_rows
FROM customers;`,
      explanation: 'The two distinct counts differ by exactly one whenever any NULL exists, because COALESCE turns all of them into a single extra category. Which number is right depends on whether "we do not know where they are" is a meaningful group for the report.',
    },
    {
      id: 'p39-q3',
      difficulty: 'medium',
      prompt: 'Count distinct active customers per month, and demonstrate why those counts cannot be summed to get the quarter.',
      tables: ['orders'],
      think: 'A customer who ordered in January and February — how many times do they appear in a sum of monthly counts?',
      hint: 'Twice. The quarterly figure must be computed at quarterly grain.',
      approach: `Count distinct customers per month.\nSeparately, count distinct customers across the whole quarter.\nCompare the sum of the monthly figures against the true quarterly figure.\nThe difference is the double-counted repeat customers.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', order_date)::date AS mth,
           COUNT(DISTINCT customer_id)           AS active_customers
    FROM orders
    WHERE order_date >= DATE '2024-01-01'
      AND order_date <  DATE '2024-04-01'
    GROUP BY DATE_TRUNC('month', order_date)
)
SELECT (SELECT SUM(active_customers) FROM monthly) AS naive_sum_of_months,
       (SELECT COUNT(DISTINCT customer_id) FROM orders
        WHERE order_date >= DATE '2024-01-01'
          AND order_date <  DATE '2024-04-01')     AS true_quarterly_distinct,
       (SELECT SUM(active_customers) FROM monthly)
     - (SELECT COUNT(DISTINCT customer_id) FROM orders
        WHERE order_date >= DATE '2024-01-01'
          AND order_date <  DATE '2024-04-01')     AS double_counted;`,
      explanation: 'The gap between the two numbers is exactly the repeat activity across months, and it is why a pre-aggregated monthly table cannot answer an arbitrary date range for this measure. Non-additivity is the defining property of a distinct count, and recognising it is a real data-engineering signal.',
    },
    {
      id: 'p39-q4',
      difficulty: 'medium',
      prompt: 'Count distinct products bought per customer, and distinct customers per product.',
      tables: ['orders', 'order_items'],
      think: 'Two directions of the same join. Which count is protected from the fan-out, and why?',
      hint: 'Both — a distinct count of a key is immune to row multiplication.',
      approach: `Join orders to order lines so each row carries a customer and a product.\nGroup by customer to count distinct products.\nSeparately, group by product to count distinct customers.\nCompare the distinct counts against the raw line counts.`,
      solution: `WITH lines AS (
    SELECT o.customer_id, oi.product_id
    FROM orders      AS o
    JOIN order_items AS oi ON oi.order_id = o.order_id
)
SELECT 'per customer' AS direction,
       customer_id    AS entity,
       COUNT(DISTINCT product_id) AS distinct_counterparts,
       COUNT(*)                   AS raw_lines
FROM lines
GROUP BY customer_id

UNION ALL

SELECT 'per product',
       product_id,
       COUNT(DISTINCT customer_id),
       COUNT(*)
FROM lines
GROUP BY product_id
ORDER BY direction, distinct_counterparts DESC;`,
      explanation: 'COUNT(*) here counts order lines, which is inflated by repeat purchases, while the distinct count answers the breadth question actually being asked. Returning both makes the repeat intensity visible: a product with 500 lines and 20 customers is a subscription staple.',
    },
    {
      id: 'p39-q5',
      difficulty: 'medium',
      prompt: 'Count distinct combinations of (customer, product) — pairs, not individual values.',
      tables: ['orders', 'order_items'],
      think: 'Most engines reject COUNT(DISTINCT a, b). What are the two portable workarounds?',
      hint: 'Concatenate the two into one value, or count the rows of a DISTINCT subquery.',
      approach: `Join to get customer and product on each row.\nEither concatenate the two keys with a separator that cannot appear in either, or wrap a DISTINCT select in a COUNT.\nPrefer the subquery form, which cannot suffer separator collisions.\nReturn both to show they agree.`,
      solution: `WITH lines AS (
    SELECT o.customer_id, oi.product_id
    FROM orders      AS o
    JOIN order_items AS oi ON oi.order_id = o.order_id
)
SELECT (SELECT COUNT(*) FROM (SELECT DISTINCT customer_id, product_id FROM lines) AS d)
         AS distinct_pairs_subquery,
       (SELECT COUNT(DISTINCT customer_id || ':' || product_id) FROM lines)
         AS distinct_pairs_concat;`,
      explanation: 'The subquery form is the safer of the two: concatenation can collide if the separator appears in a value, turning ("1:2", "3") and ("1", "2:3") into the same key. MySQL is the exception that supports COUNT(DISTINCT a, b) natively.',
      dialect: 'COUNT(DISTINCT a, b) works in MySQL only. PostgreSQL can also write COUNT(DISTINCT (a, b)) using a row constructor, which is collision-free.',
    },
    {
      id: 'p39-q6',
      difficulty: 'medium',
      prompt: 'Count distinct customers per region per month, with the regional and monthly totals.',
      tables: ['orders', 'customers'],
      think: 'Three grains, and the measure does not roll up. What does that force you to do?',
      hint: 'Recompute the distinct count at each grain — GROUPING SETS does it in one pass.',
      approach: `Join orders to customers for the region.\nUse GROUPING SETS to request the cell, the row total, the column total and the grand total.\nEach grouping set recomputes its own distinct count, which is required since the measure is non-additive.\nLabel the subtotal rows.`,
      solution: `SELECT COALESCE(c.country, 'ALL COUNTRIES') AS country,
       COALESCE(DATE_TRUNC('month', o.order_date)::text, 'ALL MONTHS') AS mth,
       COUNT(DISTINCT o.customer_id) AS active_customers
FROM orders    AS o
JOIN customers AS c ON c.customer_id = o.customer_id
GROUP BY GROUPING SETS (
    (c.country, DATE_TRUNC('month', o.order_date)),
    (c.country),
    (DATE_TRUNC('month', o.order_date)),
    ()
)
ORDER BY country, mth;`,
      explanation: 'Each grouping set recomputes the distinct count over its own row set, which is the only correct way to get subtotals for a non-additive measure — summing the cells would double-count anyone active in several months. GROUPING SETS does all four passes in one scan, which is why it beats four separate queries.',
      dialect: 'GROUPING SETS is PostgreSQL / SQL Server / Oracle / MySQL 8.',
    },
    {
      id: 'p39-q7',
      difficulty: 'hard',
      prompt: 'Produce a running distinct count of customers over time, given that COUNT(DISTINCT) is not allowed as a window function.',
      tables: ['orders'],
      think: 'What single row per customer marks the moment they should first be counted?',
      hint: 'Their first order. Mark it with ROW_NUMBER and running-sum the marker.',
      approach: `Number each customer's orders chronologically.\nMark the row numbered 1 as that customer's first appearance.\nRunning-sum the marker over the global date ordering.\nThe result is the cumulative distinct customer count.`,
      solution: `WITH firsts AS (
    SELECT order_id, customer_id, order_date,
           CASE WHEN ROW_NUMBER() OVER (PARTITION BY customer_id
                                        ORDER BY order_date, order_id) = 1
                THEN 1 ELSE 0 END AS is_first
    FROM orders
)
SELECT order_date,
       SUM(is_first) OVER (ORDER BY order_date, order_id) AS distinct_customers_to_date,
       COUNT(*)      OVER (ORDER BY order_date, order_id) AS orders_to_date
FROM firsts
ORDER BY order_date, order_id;`,
      explanation: 'Counting each value exactly once at its first appearance turns an unsupported running distinct count into an ordinary running sum. The two curves together tell the story: when orders_to_date grows faster than the distinct count, growth is coming from existing customers rather than new ones.',
    },
    {
      id: 'p39-q8',
      difficulty: 'hard',
      prompt: 'Compute a rolling 30-day distinct customer count, the standard "monthly active users" metric.',
      tables: ['orders'],
      think: 'A rolling distinct count cannot be a window function. What can compute it per day instead?',
      hint: 'For each day, count distinct customers over the preceding 30 days — a lateral join or a self-join on a date range.',
      approach: `Generate the reporting dates.\nFor each date, join to the orders in the trailing 30-day window.\nCount distinct customers within that window.\nReturn one row per date.`,
      solution: `WITH days AS (
    SELECT generate_series(DATE '2024-02-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
)
SELECT dy.d AS as_of,
       COUNT(DISTINCT o.customer_id) AS active_30d,
       COUNT(o.order_id)             AS orders_30d
FROM days AS dy
LEFT JOIN orders AS o
       ON o.order_date >  dy.d - INTERVAL '30 days'
      AND o.order_date <= dy.d
GROUP BY dy.d
ORDER BY dy.d;`,
      explanation: 'A rolling distinct count has to be recomputed per day because the measure is non-additive — yesterday\'s answer plus today\'s new customers is not today\'s answer, since customers also drop out of the back of the window. This is why MAU is expensive and why warehouses often approximate it with HyperLogLog sketches that *can* be merged.',
    },
    {
      id: 'p39-q9',
      difficulty: 'hard',
      prompt: 'Compare exact and approximate distinct counts and explain when the approximation is acceptable.',
      tables: ['orders'],
      think: 'What is being traded away, and what is gained?',
      hint: 'About 2% relative error in exchange for constant memory and a mergeable sketch.',
      approach: `Compute the exact distinct customer count.\nCompute the approximate count with the engine's HyperLogLog function.\nCompare the values and the relative error.\nConclude when the approximation is and is not acceptable.`,
      solution: `SELECT COUNT(DISTINCT customer_id)        AS exact_distinct,
       -- PostgreSQL needs the postgres_hll extension; most warehouses
       -- ship an approximate counter natively:
       -- APPROX_COUNT_DISTINCT(customer_id)  -- SQL Server 2019+, Snowflake, BigQuery
       COUNT(DISTINCT customer_id)        AS approx_distinct_placeholder,
       COUNT(*)                           AS rows_scanned
FROM orders;`,
      explanation: 'HyperLogLog uses fixed memory regardless of cardinality and its sketches can be merged, which means a daily sketch can answer a monthly question — something an exact distinct count can never do. Roughly 2% error is fine for a dashboard trend and unacceptable for billing or regulatory reporting, and saying which side of that line you are on is the answer.',
      dialect: 'APPROX_COUNT_DISTINCT in SQL Server 2019+, Snowflake and Oracle; APPROX_COUNT_DISTINCT / HLL_COUNT in BigQuery; the postgres_hll extension in PostgreSQL.',
    },
    {
      id: 'p39-q10',
      difficulty: 'hard',
      prompt: 'Compute customer stickiness: distinct daily actives divided by distinct monthly actives.',
      tables: ['orders'],
      think: 'Two distinct counts at two grains in one ratio. Why can neither be derived from the other?',
      hint: 'Both are non-additive, so each must be computed over its own row set.',
      approach: `Compute the distinct active customers per day.\nSeparately compute the distinct active customers per month.\nJoin the daily figures to their month.\nDivide to get the daily-to-monthly ratio, then average it per month.`,
      solution: `WITH dau AS (
    SELECT order_date AS d,
           DATE_TRUNC('month', order_date)::date AS mth,
           COUNT(DISTINCT customer_id) AS daily_actives
    FROM orders
    GROUP BY order_date, DATE_TRUNC('month', order_date)
),
mau AS (
    SELECT DATE_TRUNC('month', order_date)::date AS mth,
           COUNT(DISTINCT customer_id) AS monthly_actives
    FROM orders
    GROUP BY DATE_TRUNC('month', order_date)
)
SELECT m.mth,
       m.monthly_actives,
       ROUND(AVG(d.daily_actives), 1) AS avg_daily_actives,
       ROUND(100.0 * AVG(d.daily_actives) / NULLIF(m.monthly_actives, 0), 1)
         AS stickiness_pct
FROM mau AS m
JOIN dau AS d ON d.mth = m.mth
GROUP BY m.mth, m.monthly_actives
ORDER BY m.mth;`,
      explanation: 'Neither figure can be derived from the other because both are non-additive, so the query computes each over its own row set and only then combines them. Stickiness answers "on a typical day, what fraction of the monthly audience shows up" — a high number means habitual use, a low one means sporadic visits.',
    },
  ],
};
