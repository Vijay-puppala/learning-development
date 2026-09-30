import type { Pattern } from '../types';

export const p41: Pattern = {
  num: 41,
  slug: 'customer-retention',
  title: 'Customer Retention',
  concept: 'SELF JOIN',
  category: 'Time Series & Dates',
  tagline: 'Did the same person come back? A self join on the entity across two periods.',
  theory: `Retention asks whether the *same* entity that was active in one period is active in a later one. The shape is always: build a set of (entity, period) pairs, then join that set to itself on the entity with an offset between the periods.

Three definitions get conflated and they give very different numbers.

**Period-over-period retention** — active in month N and month N+1. Simple, harsh, and it treats a customer who skips a month as churned even if they return.

**Cohort retention** — of everyone acquired in month N, what fraction is active in month N+k? This is the triangular chart every SaaS company reports, and it is the most informative because it controls for acquisition timing.

**Rolling retention** — active in month N and *any* month after. Kinder, and the only one that does not punish irregular usage.

The universal trap is the denominator. "80% retention" is meaningless without knowing what it is a percentage of, and cohorts near the end of the data have not had time to show their later months — reporting those partial cells as low retention is the classic beginner error.`,
  pitfalls: [
    'Reporting a retention rate without stating the denominator population.',
    'Including immature cohorts, whose later periods have not happened yet, as if they were zeros.',
    'Counting orders instead of distinct customers, so one heavy buyer looks like retention.',
    'Using a self join on a period offset without a gapless period spine, so a skipped month misaligns everything.',
    'Confusing retention with repeat rate — the first is about a specific later period, the second about any later activity.',
  ],
  questions: [
    {
      id: 'p41-q1',
      difficulty: 'easy',
      prompt: 'Find customers who ordered in both January and February 2024.',
      tables: ['orders'],
      think: 'Two conditions about the same customer across two periods. What joins a customer to themselves?',
      hint: 'A self join on customer_id with different date filters on each side — or two EXISTS clauses.',
      approach: `Build the set of customers active in January.\nBuild the set active in February.\nIntersect them on customer_id.\nReturn the retained customers.`,
      solution: `SELECT DISTINCT jan.customer_id
FROM orders AS jan
JOIN orders AS feb
  ON  feb.customer_id = jan.customer_id
 AND  feb.order_date >= DATE '2024-02-01'
 AND  feb.order_date <  DATE '2024-03-01'
WHERE jan.order_date >= DATE '2024-01-01'
  AND jan.order_date <  DATE '2024-02-01'
ORDER BY jan.customer_id;`,
      explanation: 'DISTINCT is required because a customer with three January orders and two February ones produces six join rows. The alternative — two EXISTS clauses — avoids materialising that fan-out entirely and is usually the better query.',
    },
    {
      id: 'p41-q2',
      difficulty: 'easy',
      prompt: 'Compute the January-to-February retention rate as a percentage.',
      tables: ['orders'],
      think: 'What is the denominator — all customers, or only January-active ones?',
      hint: 'January-active customers. Retention is always a share of the starting population.',
      approach: `Count the distinct customers active in January — the denominator.\nCount those also active in February — the numerator.\nDivide and guard the denominator.\nReport both counts alongside the rate.`,
      solution: `WITH jan AS (
    SELECT DISTINCT customer_id FROM orders
    WHERE order_date >= DATE '2024-01-01' AND order_date < DATE '2024-02-01'
),
feb AS (
    SELECT DISTINCT customer_id FROM orders
    WHERE order_date >= DATE '2024-02-01' AND order_date < DATE '2024-03-01'
)
SELECT (SELECT COUNT(*) FROM jan) AS active_january,
       COUNT(*)                   AS retained_in_february,
       ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM jan), 0), 1) AS retention_pct
FROM jan
WHERE EXISTS (SELECT 1 FROM feb WHERE feb.customer_id = jan.customer_id);`,
      explanation: 'Returning the denominator beside the rate is not decoration — "60% retention" from a base of five customers means something very different from the same figure across five thousand. Every retention number should be quoted with its population.',
    },
    {
      id: 'p41-q3',
      difficulty: 'medium',
      prompt: 'Compute month-over-month retention for every consecutive pair of months.',
      tables: ['orders'],
      think: 'How do you avoid writing one query per month pair?',
      hint: 'Build (customer, month) pairs once, then self-join on month = month + 1 month.',
      approach: `Reduce orders to distinct customer-months.\nSelf join that set on the same customer with the second month exactly one month later.\nGroup by the earlier month.\nCount the base and the retained, then divide.`,
      solution: `WITH activity AS (
    SELECT DISTINCT customer_id, DATE_TRUNC('month', order_date)::date AS mth
    FROM orders
)
SELECT a.mth                                  AS month,
       COUNT(DISTINCT a.customer_id)          AS active_customers,
       COUNT(DISTINCT b.customer_id)          AS retained_next_month,
       ROUND(100.0 * COUNT(DISTINCT b.customer_id)
             / NULLIF(COUNT(DISTINCT a.customer_id), 0), 1) AS retention_pct
FROM activity AS a
LEFT JOIN activity AS b
       ON b.customer_id = a.customer_id
      AND b.mth = a.mth + INTERVAL '1 month'
GROUP BY a.mth
ORDER BY a.mth;`,
      explanation: 'The LEFT JOIN is what keeps the base population intact — an inner join would drop every customer who did not return and make the denominator equal the numerator, giving 100% retention every month. Building the distinct customer-month set first is what makes the self join meaningful.',
    },
    {
      id: 'p41-q4',
      difficulty: 'medium',
      prompt: 'Build a cohort retention table: rows are signup month, columns are months 0 to 3 since signup.',
      tables: ['customers', 'orders'],
      think: 'The column key is a relative offset. What must be computed per customer before the pivot?',
      hint: 'Months between the signup month and each active month.',
      approach: `Reduce orders to the distinct months each customer was active.\nJoin to customers to get the signup month — the cohort.\nCompute the integer month offset between the two.\nGroup by cohort and pivot the offsets into columns with distinct counts.`,
      solution: `WITH activity AS (
    SELECT DISTINCT
           o.customer_id,
           DATE_TRUNC('month', c.signup_date)::date AS cohort,
           (EXTRACT(YEAR  FROM o.order_date) - EXTRACT(YEAR  FROM c.signup_date)) * 12
         + (EXTRACT(MONTH FROM o.order_date) - EXTRACT(MONTH FROM c.signup_date)) AS offset_m
    FROM orders    AS o
    JOIN customers AS c ON c.customer_id = o.customer_id
),
sized AS (
    SELECT cohort, COUNT(DISTINCT customer_id) AS cohort_size
    FROM activity WHERE offset_m = 0 GROUP BY cohort
)
SELECT a.cohort,
       s.cohort_size,
       COUNT(DISTINCT CASE WHEN a.offset_m = 1 THEN a.customer_id END) AS m1,
       COUNT(DISTINCT CASE WHEN a.offset_m = 2 THEN a.customer_id END) AS m2,
       COUNT(DISTINCT CASE WHEN a.offset_m = 3 THEN a.customer_id END) AS m3
FROM activity AS a
JOIN sized    AS s ON s.cohort = a.cohort
GROUP BY a.cohort, s.cohort_size
ORDER BY a.cohort;`,
      explanation: 'COUNT(DISTINCT CASE WHEN ...) is the cohort-table workhorse: the CASE picks the period and DISTINCT stops a customer with three orders in month 1 counting three times. Defining cohort_size from month 0 rather than from the customers table means the denominator is "acquired and actually purchased", which is the honest base.',
    },
    {
      id: 'p41-q5',
      difficulty: 'medium',
      prompt: 'Convert that cohort table into percentages rather than counts.',
      tables: ['customers', 'orders'],
      think: 'Which number is the denominator for every cell in a row?',
      hint: 'The cohort size — the month-0 count for that row.',
      approach: `Compute the cohort counts as before.\nDivide each period column by the cohort size.\nGuard the division.\nRound for readability.`,
      solution: `WITH activity AS (
    SELECT DISTINCT
           o.customer_id,
           DATE_TRUNC('month', c.signup_date)::date AS cohort,
           (EXTRACT(YEAR  FROM o.order_date) - EXTRACT(YEAR  FROM c.signup_date)) * 12
         + (EXTRACT(MONTH FROM o.order_date) - EXTRACT(MONTH FROM c.signup_date)) AS offset_m
    FROM orders    AS o
    JOIN customers AS c ON c.customer_id = o.customer_id
),
counts AS (
    SELECT cohort,
           COUNT(DISTINCT CASE WHEN offset_m = 0 THEN customer_id END) AS m0,
           COUNT(DISTINCT CASE WHEN offset_m = 1 THEN customer_id END) AS m1,
           COUNT(DISTINCT CASE WHEN offset_m = 2 THEN customer_id END) AS m2,
           COUNT(DISTINCT CASE WHEN offset_m = 3 THEN customer_id END) AS m3
    FROM activity
    GROUP BY cohort
)
SELECT cohort,
       m0 AS cohort_size,
       ROUND(100.0 * m1 / NULLIF(m0, 0), 1) AS m1_pct,
       ROUND(100.0 * m2 / NULLIF(m0, 0), 1) AS m2_pct,
       ROUND(100.0 * m3 / NULLIF(m0, 0), 1) AS m3_pct
FROM counts
ORDER BY cohort;`,
      explanation: 'Percentages make cohorts of different sizes comparable down the column, which is the whole point of the triangular chart — you are looking for whether newer cohorts retain better than older ones. Keeping the raw cohort size in the first column stops a 100% retention from a cohort of two being read as a success.',
    },
    {
      id: 'p41-q6',
      difficulty: 'medium',
      prompt: 'Identify which cohort cells are immature — periods that have not fully elapsed yet.',
      tables: ['customers', 'orders'],
      think: 'A cohort from last month cannot have a month-3 number. What does the table show in that cell, and why is it dangerous?',
      hint: 'Zero, which looks like terrible retention. It must be blanked out.',
      approach: `Compute the number of months elapsed between each cohort and the latest data date.\nCompare that against the offset each column represents.\nBlank out cells whose period has not fully elapsed.\nShow the maturity so the reader can see which cells are trustworthy.`,
      solution: `WITH bounds AS (SELECT MAX(order_date) AS latest FROM orders),
activity AS (
    SELECT DISTINCT
           o.customer_id,
           DATE_TRUNC('month', c.signup_date)::date AS cohort,
           (EXTRACT(YEAR  FROM o.order_date) - EXTRACT(YEAR  FROM c.signup_date)) * 12
         + (EXTRACT(MONTH FROM o.order_date) - EXTRACT(MONTH FROM c.signup_date)) AS offset_m
    FROM orders AS o JOIN customers AS c ON c.customer_id = o.customer_id
),
counts AS (
    SELECT a.cohort,
           (EXTRACT(YEAR  FROM b.latest) - EXTRACT(YEAR  FROM a.cohort)) * 12
         + (EXTRACT(MONTH FROM b.latest) - EXTRACT(MONTH FROM a.cohort)) AS months_mature,
           COUNT(DISTINCT CASE WHEN a.offset_m = 0 THEN a.customer_id END) AS m0,
           COUNT(DISTINCT CASE WHEN a.offset_m = 1 THEN a.customer_id END) AS m1,
           COUNT(DISTINCT CASE WHEN a.offset_m = 3 THEN a.customer_id END) AS m3
    FROM activity AS a CROSS JOIN bounds AS b
    GROUP BY a.cohort, b.latest
)
SELECT cohort,
       m0 AS cohort_size,
       months_mature,
       CASE WHEN months_mature >= 1 THEN ROUND(100.0 * m1 / NULLIF(m0, 0), 1) END AS m1_pct,
       CASE WHEN months_mature >= 3 THEN ROUND(100.0 * m3 / NULLIF(m0, 0), 1) END AS m3_pct
FROM counts
ORDER BY cohort;`,
      explanation: 'Showing NULL rather than zero for an immature cell is the difference between an honest chart and one that appears to show collapsing retention in recent months. The months_mature column makes the cut-off explicit instead of leaving the reader to infer it.',
    },
    {
      id: 'p41-q7',
      difficulty: 'hard',
      prompt: 'Classify each customer-month as new, retained, resurrected or churned.',
      tables: ['orders'],
      think: 'Four states from two facts: were they active last month, and have they ever been active before?',
      hint: 'LAG on the activity month, plus a check for any earlier activity.',
      approach: `Build the distinct customer-month activity set.\nFor each active month, LAG the previous active month for that customer.\nClassify: no prior activity is new, prior month adjacent is retained, prior activity but a gap is resurrected.\nSeparately emit a churned row for the month after a customer's last activity.`,
      solution: `WITH activity AS (
    SELECT DISTINCT customer_id, DATE_TRUNC('month', order_date)::date AS mth
    FROM orders
),
lagged AS (
    SELECT customer_id, mth,
           LAG(mth) OVER (PARTITION BY customer_id ORDER BY mth) AS prev_mth,
           LEAD(mth) OVER (PARTITION BY customer_id ORDER BY mth) AS next_mth
    FROM activity
)
SELECT mth,
       COUNT(*) FILTER (WHERE prev_mth IS NULL)                            AS new_customers,
       COUNT(*) FILTER (WHERE prev_mth = mth - INTERVAL '1 month')         AS retained,
       COUNT(*) FILTER (WHERE prev_mth IS NOT NULL
                          AND prev_mth < mth - INTERVAL '1 month')         AS resurrected,
       COUNT(*) FILTER (WHERE next_mth IS NULL
                           OR next_mth > mth + INTERVAL '1 month')         AS churning
FROM lagged
GROUP BY mth
ORDER BY mth;`,
      explanation: 'These four states are the standard growth-accounting decomposition, and they add up: new plus retained plus resurrected is this month\'s active count. Separating resurrected from new matters commercially — winning someone back is a different motion from acquiring them.',
    },
    {
      id: 'p41-q8',
      difficulty: 'hard',
      prompt: 'Compute rolling retention: of customers active in month N, what fraction was active in *any* later month?',
      tables: ['orders'],
      think: 'How does this differ from month-over-month, and which is kinder to irregular usage?',
      hint: 'The join condition becomes "any later month" rather than "exactly one month later".',
      approach: `Build the distinct customer-month activity set.\nSelf join on the customer with the second month strictly later, with no fixed offset.\nGroup by the earlier month.\nCount the base and those with any later activity.`,
      solution: `WITH activity AS (
    SELECT DISTINCT customer_id, DATE_TRUNC('month', order_date)::date AS mth
    FROM orders
)
SELECT a.mth AS month,
       COUNT(DISTINCT a.customer_id) AS active_customers,
       COUNT(DISTINCT CASE WHEN EXISTS (
             SELECT 1 FROM activity AS b
             WHERE b.customer_id = a.customer_id AND b.mth > a.mth
           ) THEN a.customer_id END) AS returned_later,
       ROUND(100.0 * COUNT(DISTINCT CASE WHEN EXISTS (
             SELECT 1 FROM activity AS b
             WHERE b.customer_id = a.customer_id AND b.mth > a.mth
           ) THEN a.customer_id END)
             / NULLIF(COUNT(DISTINCT a.customer_id), 0), 1) AS rolling_retention_pct
FROM activity AS a
GROUP BY a.mth
ORDER BY a.mth;`,
      explanation: 'Rolling retention is always higher than month-over-month because it forgives gaps, which makes it the right measure for products used irregularly — an annual insurance renewal has near-zero monthly retention and excellent rolling retention. Its weakness is that recent months are structurally understated, since there is less future in which to return.',
    },
    {
      id: 'p41-q9',
      difficulty: 'hard',
      prompt: 'Compute revenue retention rather than customer retention: of the revenue from month N customers, how much did the same customers generate in month N+1?',
      tables: ['orders'],
      think: 'Why can revenue retention exceed 100% when customer retention cannot?',
      hint: 'Retained customers can spend more than they did before — expansion.',
      approach: `Aggregate revenue per customer per month.\nSelf join on the customer with the second month one later.\nSum the base-month revenue for the whole cohort and the next-month revenue for the retained subset.\nDivide to get net revenue retention.`,
      solution: `WITH monthly AS (
    SELECT customer_id,
           DATE_TRUNC('month', order_date)::date AS mth,
           SUM(amount) AS revenue
    FROM orders
    WHERE status <> 'cancelled'
    GROUP BY customer_id, DATE_TRUNC('month', order_date)
)
SELECT a.mth AS month,
       SUM(a.revenue)                       AS base_revenue,
       SUM(COALESCE(b.revenue, 0))          AS retained_revenue,
       ROUND(100.0 * SUM(COALESCE(b.revenue, 0))
             / NULLIF(SUM(a.revenue), 0), 1) AS net_revenue_retention_pct
FROM monthly AS a
LEFT JOIN monthly AS b
       ON b.customer_id = a.customer_id
      AND b.mth = a.mth + INTERVAL '1 month'
GROUP BY a.mth
ORDER BY a.mth;`,
      explanation: 'Net revenue retention above 100% means expansion from existing customers outweighed churn and contraction — the metric investors care most about, because it means the business grows without acquiring anyone. The LEFT JOIN with COALESCE is essential: a churned customer must contribute zero to the numerator while staying in the denominator.',
    },
    {
      id: 'p41-q10',
      difficulty: 'hard',
      prompt: 'Build a full cohort triangle with a dynamic number of period columns, and explain why that is hard in SQL.',
      tables: ['customers', 'orders'],
      think: 'The number of columns depends on how much history exists. What does SQL require about the column list?',
      hint: 'It must be fixed at parse time — so the honest answer is long format plus a pivot in the presentation layer.',
      approach: `Produce the cohort table in long format: one row per cohort per period offset.\nInclude the cohort size and the retention percentage on each row.\nMark immature cells so the consumer can suppress them.\nLet the BI tool or application pivot the offsets into columns.`,
      solution: `WITH bounds AS (SELECT MAX(order_date) AS latest FROM orders),
activity AS (
    SELECT DISTINCT
           o.customer_id,
           DATE_TRUNC('month', c.signup_date)::date AS cohort,
           (EXTRACT(YEAR  FROM o.order_date) - EXTRACT(YEAR  FROM c.signup_date)) * 12
         + (EXTRACT(MONTH FROM o.order_date) - EXTRACT(MONTH FROM c.signup_date)) AS offset_m
    FROM orders AS o JOIN customers AS c ON c.customer_id = o.customer_id
),
sizes AS (
    SELECT cohort, COUNT(DISTINCT customer_id) AS cohort_size
    FROM activity WHERE offset_m = 0 GROUP BY cohort
)
SELECT a.cohort,
       a.offset_m                      AS months_since_signup,
       s.cohort_size,
       COUNT(DISTINCT a.customer_id)   AS active,
       ROUND(100.0 * COUNT(DISTINCT a.customer_id)
             / NULLIF(s.cohort_size, 0), 1) AS retention_pct,
       (a.offset_m <= (EXTRACT(YEAR  FROM b.latest) - EXTRACT(YEAR  FROM a.cohort)) * 12
                    + (EXTRACT(MONTH FROM b.latest) - EXTRACT(MONTH FROM a.cohort)))
         AS is_mature
FROM activity AS a
JOIN sizes    AS s ON s.cohort = a.cohort
CROSS JOIN bounds AS b
WHERE a.offset_m >= 0
GROUP BY a.cohort, a.offset_m, s.cohort_size, b.latest
ORDER BY a.cohort, a.offset_m;`,
      explanation: 'A SQL result has a fixed column list decided before execution, so a cohort triangle whose width grows with history cannot be produced statically — the choices are generated SQL or long format. Long format is the better answer: it is stable, cacheable, every BI tool pivots it natively, and the is_mature flag travels with the data instead of being reconstructed downstream.',
    },
  ],
};
