import type { Pattern } from '../types';

export const p29: Pattern = {
  num: 29,
  slug: 'customers-with-multiple-orders',
  title: 'Customers with Multiple Orders',
  concept: 'GROUP BY, HAVING',
  category: 'Aggregation & Grouping',
  tagline: 'Filter groups, not rows. WHERE cannot see an aggregate; HAVING is evaluated after one exists.',
  theory: `The mechanic is small and the concept is fundamental: **WHERE filters rows before grouping, HAVING filters groups after aggregation**. Any condition mentioning COUNT, SUM, AVG, MIN or MAX belongs in HAVING. Any condition on a raw column belongs in WHERE, where it also reduces the work the aggregation has to do.

The logical order of evaluation explains everything: FROM → WHERE → GROUP BY → aggregates → HAVING → SELECT → ORDER BY → LIMIT. That is why HAVING can reference an aggregate (it exists by then) and why SELECT aliases are usually not visible in HAVING (SELECT runs later — PostgreSQL and MySQL allow it as an extension; SQL Server and Oracle do not).

Two habits worth building. Put every row-level condition in WHERE, not HAVING — both give the right answer, but WHERE shrinks the input before the grouping and is much cheaper. And be deliberate about which COUNT you mean: COUNT(*) counts rows, COUNT(col) counts non-NULL values, COUNT(DISTINCT col) counts distinct values. On a joined result these can differ wildly.

The related window form — COUNT(*) OVER (PARTITION BY …) then filter — answers the same question while keeping the individual rows.`,
  pitfalls: [
    'Putting an aggregate in WHERE. It is a syntax error in every engine, and the fix is HAVING.',
    'Putting a row condition in HAVING, which works but aggregates rows you were going to discard anyway.',
    'COUNT(*) on a joined result, which counts join combinations rather than the entity you meant.',
    'Relying on SELECT aliases in HAVING — portable only on some engines.',
    'Forgetting that a group with zero rows never appears, so "customers with no orders" cannot come from HAVING COUNT = 0.',
  ],
  questions: [
    {
      id: 'p29-q1',
      difficulty: 'easy',
      prompt: 'Find customers who have placed more than one order.',
      tables: ['orders'],
      think: 'Which clause can see COUNT(*), and why can the other one not?',
      hint: 'HAVING — the aggregate does not exist when WHERE runs.',
      approach: `Group orders by customer.\nCount the rows in each group.\nKeep the groups whose count exceeds one.\nReturn the customer and the count.`,
      solution: `SELECT customer_id,
       COUNT(*) AS order_count
FROM orders
GROUP BY customer_id
HAVING COUNT(*) > 1
ORDER BY order_count DESC;`,
      explanation: 'WHERE is evaluated before GROUP BY, so COUNT(*) has not been computed yet and cannot be referenced there. HAVING runs after aggregation, which is precisely why it exists.',
    },
    {
      id: 'p29-q2',
      difficulty: 'easy',
      prompt: 'Find customers with more than one non-cancelled order, placed in 2024.',
      tables: ['orders'],
      think: 'Two conditions: one on rows, one on groups. Which goes where, and does it matter for correctness or only for speed?',
      hint: 'Both. Row conditions in WHERE change what is counted, so putting them in HAVING gives a different answer.',
      approach: `Filter rows to 2024 and to non-cancelled statuses in WHERE.\nGroup the surviving rows by customer.\nCount them.\nKeep groups above one in HAVING.`,
      solution: `SELECT customer_id,
       COUNT(*)      AS orders_2024,
       SUM(amount)   AS revenue_2024
FROM orders
WHERE order_date >= DATE '2024-01-01'
  AND order_date <  DATE '2025-01-01'
  AND status     <> 'cancelled'
GROUP BY customer_id
HAVING COUNT(*) > 1
ORDER BY revenue_2024 DESC;`,
      explanation: 'The WHERE conditions shrink the input before grouping, so both the count and the sum reflect only the rows that qualify. Moving them into HAVING is not just slower — it would be a syntax error for the row columns, and semantically different if forced through an aggregate.',
    },
    {
      id: 'p29-q3',
      difficulty: 'medium',
      prompt: 'Find customers who ordered in more than one distinct month.',
      tables: ['orders'],
      think: 'Several orders in one month is not the same as orders in several months. Which COUNT expresses the difference?',
      hint: 'COUNT(DISTINCT month), not COUNT(*).',
      approach: `Group orders by customer.\nCount the distinct months in which they ordered.\nKeep customers whose distinct month count exceeds one.\nReturn both counts so the difference is visible.`,
      solution: `SELECT customer_id,
       COUNT(*)                                        AS total_orders,
       COUNT(DISTINCT DATE_TRUNC('month', order_date)) AS active_months
FROM orders
GROUP BY customer_id
HAVING COUNT(DISTINCT DATE_TRUNC('month', order_date)) > 1
ORDER BY active_months DESC, total_orders DESC;`,
      explanation: 'A customer with five orders in one week is loyal for a week; a customer with two orders in two different months has come back. COUNT(DISTINCT expression) is what distinguishes the two, and the expression can be any deterministic derivation of the row.',
    },
    {
      id: 'p29-q4',
      difficulty: 'medium',
      prompt: 'Find customers whose average order value exceeds 500 and who have at least three orders.',
      tables: ['orders'],
      think: 'Two group-level conditions. Do they both go in HAVING, and does the order matter?',
      hint: 'Both in HAVING, joined by AND. The minimum count guards the average from being one lucky order.',
      approach: `Group orders by customer.\nCompute the count and the average amount.\nKeep groups satisfying both conditions in HAVING.\nOrder by the average descending.`,
      solution: `SELECT customer_id,
       COUNT(*)            AS order_count,
       ROUND(AVG(amount), 2) AS avg_order_value,
       SUM(amount)         AS total_spend
FROM orders
WHERE status <> 'cancelled'
GROUP BY customer_id
HAVING COUNT(*) >= 3
   AND AVG(amount) > 500
ORDER BY avg_order_value DESC;`,
      explanation: 'The count condition is a sample-size guard: without it a single £5,000 order gives an average of £5,000 and tops the list on no evidence. Pairing a rate or average with a minimum-volume threshold is a habit worth applying to every such report.',
    },
    {
      id: 'p29-q5',
      difficulty: 'medium',
      prompt: 'Find products that appear on more than five distinct orders.',
      tables: ['order_items'],
      think: 'A product can appear twice on the same order. Which count does the question mean?',
      hint: 'Distinct orders, not lines.',
      approach: `Group order lines by product.\nCount the distinct order ids the product appears on.\nKeep products above the threshold.\nShow the line count alongside so any per-order duplication is visible.`,
      solution: `SELECT product_id,
       COUNT(DISTINCT order_id) AS distinct_orders,
       COUNT(*)                 AS line_count,
       SUM(quantity)            AS total_units
FROM order_items
GROUP BY product_id
HAVING COUNT(DISTINCT order_id) > 5
ORDER BY distinct_orders DESC;`,
      explanation: 'If line_count exceeds distinct_orders, some orders list the same product on more than one line — often a data-quality signal worth flagging. Returning both counts turns an ambiguous question into a self-documenting answer.',
    },
    {
      id: 'p29-q6',
      difficulty: 'medium',
      prompt: 'Return the individual orders of customers who have more than three orders — the rows, not the counts.',
      tables: ['orders'],
      think: 'GROUP BY collapses the rows. What computes a group-level count while keeping them?',
      hint: 'A window COUNT partitioned by customer, filtered in an outer query.',
      approach: `Compute a per-customer order count as a window function, so it appears on every row.\nWrap it in a CTE so the count becomes filterable.\nKeep rows whose customer count exceeds three.\nReturn the full order rows.`,
      solution: `WITH counted AS (
    SELECT order_id, customer_id, order_date, amount, status,
           COUNT(*) OVER (PARTITION BY customer_id) AS customer_order_count
    FROM orders
)
SELECT order_id, customer_id, order_date, amount, status, customer_order_count
FROM counted
WHERE customer_order_count > 3
ORDER BY customer_id, order_date;`,
      explanation: 'The window form keeps row-level detail that GROUP BY would have destroyed, which is what "return the orders" demands. The alternative — GROUP BY in a subquery then join back — gives the same rows but reads the table twice.',
    },
    {
      id: 'p29-q7',
      difficulty: 'hard',
      prompt: 'Find customers who ordered in at least three consecutive months.',
      tables: ['orders'],
      think: 'HAVING can count months but not test consecutiveness. What turns "consecutive" into a countable group?',
      hint: 'The islands trick: month index minus row number is constant within a consecutive run.',
      approach: `Reduce orders to the distinct months each customer was active.\nNumber those months per customer in date order.\nSubtract the row number from the month index — the difference is constant within an unbroken run.\nGroup by that island key and keep runs of at least three.`,
      solution: `WITH active_months AS (
    SELECT DISTINCT
           customer_id,
           DATE_TRUNC('month', order_date)::date AS mth
    FROM orders
),
indexed AS (
    SELECT customer_id,
           mth,
           (EXTRACT(YEAR FROM mth) * 12 + EXTRACT(MONTH FROM mth))
             - ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY mth) AS island
    FROM active_months
)
SELECT customer_id,
       COUNT(*)   AS consecutive_months,
       MIN(mth)   AS streak_start,
       MAX(mth)   AS streak_end
FROM indexed
GROUP BY customer_id, island
HAVING COUNT(*) >= 3
ORDER BY consecutive_months DESC, customer_id;`,
      explanation: 'Converting each month to a single integer (year × 12 + month) is what makes the subtraction meaningful across year boundaries — December to January is a gap of one, not eleven. Once the island key exists, "consecutive" becomes an ordinary GROUP BY and HAVING COUNT.',
    },
    {
      id: 'p29-q8',
      difficulty: 'hard',
      prompt: 'Find customers who bought from more than two distinct product categories.',
      tables: ['orders', 'order_items', 'products'],
      think: 'The join fans out to line grain. What does that do to COUNT(*) versus COUNT(DISTINCT category)?',
      hint: 'COUNT(*) counts lines; only the distinct count answers the question asked.',
      approach: `Join orders to lines to products so each row carries a customer and a category.\nGroup by the customer.\nCount the distinct categories.\nKeep customers above the threshold and list the categories.`,
      solution: `SELECT o.customer_id,
       COUNT(DISTINCT p.category) AS distinct_categories,
       COUNT(*)                   AS order_lines,
       STRING_AGG(DISTINCT p.category, ', ' ORDER BY p.category) AS categories
FROM orders      AS o
JOIN order_items AS oi ON oi.order_id   = o.order_id
JOIN products    AS p  ON p.product_id  = oi.product_id
GROUP BY o.customer_id
HAVING COUNT(DISTINCT p.category) > 2
ORDER BY distinct_categories DESC;`,
      explanation: 'On a fanned-out join COUNT(*) counts join combinations, which is almost never the business question — the distinct count is immune to the fan-out because it counts values, not rows. Category breadth is a standard proxy for how embedded a customer is in the catalog.',
      dialect: 'STRING_AGG(DISTINCT ...) is PostgreSQL. MySQL: GROUP_CONCAT(DISTINCT p.category ORDER BY p.category).',
    },
    {
      id: 'p29-q9',
      difficulty: 'hard',
      prompt: 'Find customers whose order count is above the average order count across all customers.',
      tables: ['orders'],
      think: 'The threshold is itself an aggregate of aggregates. How many levels of grouping is that?',
      hint: 'Two: count per customer, then average those counts. HAVING can compare against a scalar subquery.',
      approach: `Compute the count per customer in a CTE.\nCompute the average of those counts as a scalar.\nKeep customers whose count exceeds that scalar.\nReturn the threshold too, so the result is self-explaining.`,
      solution: `WITH per_customer AS (
    SELECT customer_id, COUNT(*) AS order_count
    FROM orders
    GROUP BY customer_id
),
benchmark AS (
    SELECT AVG(order_count) AS avg_orders FROM per_customer
)
SELECT pc.customer_id,
       pc.order_count,
       ROUND(b.avg_orders, 2) AS avg_across_customers,
       ROUND(pc.order_count - b.avg_orders, 2) AS above_average_by
FROM per_customer AS pc
CROSS JOIN benchmark AS b
WHERE pc.order_count > b.avg_orders
ORDER BY pc.order_count DESC;`,
      explanation: 'SQL will not nest aggregates directly — AVG(COUNT(*)) needs the counts to exist as rows first, hence the CTE. The CROSS JOIN against a one-row benchmark is a clean way to make a scalar available to every row without repeating a subquery.',
    },
    {
      id: 'p29-q10',
      difficulty: 'hard',
      prompt: 'Segment customers into one-time, occasional (2-4 orders) and frequent (5+), with revenue and average order value per segment.',
      tables: ['orders'],
      think: 'The segment is derived from an aggregate, then aggregated again. How many passes is that?',
      hint: 'Aggregate to customer grain, derive the segment, then aggregate to segment grain.',
      approach: `Group orders by customer to get a count and a total per customer.\nDerive a segment label from the count with a CASE chain.\nGroup that result by the segment.\nCount customers, sum revenue and compute the average order value per segment.`,
      solution: `WITH per_customer AS (
    SELECT customer_id,
           COUNT(*)    AS order_count,
           SUM(amount) AS revenue
    FROM orders
    WHERE status <> 'cancelled'
    GROUP BY customer_id
),
segmented AS (
    SELECT *,
           CASE WHEN order_count = 1            THEN '1. one-time'
                WHEN order_count BETWEEN 2 AND 4 THEN '2. occasional'
                ELSE                                  '3. frequent'
           END AS segment
    FROM per_customer
)
SELECT segment,
       COUNT(*)                                  AS customers,
       SUM(order_count)                          AS orders,
       SUM(revenue)                              AS revenue,
       ROUND(SUM(revenue) / NULLIF(SUM(order_count), 0), 2) AS avg_order_value,
       ROUND(100.0 * SUM(revenue) / SUM(SUM(revenue)) OVER (), 1) AS pct_of_revenue
FROM segmented
GROUP BY segment
ORDER BY segment;`,
      explanation: 'Two levels of aggregation with a derivation between them is the standard segmentation shape, and each level must be its own CTE because SQL cannot nest aggregates. SUM(SUM(revenue)) OVER () supplies the grand total for the percentage in the same pass — an aggregate feeding a window, legal because windows run after GROUP BY.',
    },
  ],
};
