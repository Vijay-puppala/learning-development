import type { Pattern } from '../types';

export const p36: Pattern = {
  num: 36,
  slug: 'cumulative-percentage',
  title: 'Cumulative Percentage',
  concept: 'SUM() OVER()',
  category: 'Window Functions',
  tagline: 'Two windows, one row: a running total over a partition total. The engine of every Pareto chart.',
  theory: `A cumulative percentage is the ratio of two window sums computed over the same partition with different frames:

- **Numerator** — SUM(x) OVER (ORDER BY …): the ORDER BY makes the frame "start of partition through current row", so this accumulates.
- **Denominator** — SUM(x) OVER (): no ORDER BY, so the frame is the whole partition and the value is constant.

Divide and you get "what share of the total has been reached by this row". Order the rows by the measure descending and you have an ABC or Pareto analysis: the row where the cumulative share crosses 80% tells you how few items account for most of the value.

Two details decide correctness. The ordering must be deterministic, or the same data produces a different curve each run. And the denominator is computed over the rows that survived WHERE — filter first and the percentages are shares of the filtered set, which is usually what you want but should be stated.

Isolating the *crossing row* rather than flagging every row above the threshold needs a LAG comparison: this row is at or above 80% and the previous one was not.`,
  pitfalls: [
    'Forgetting that ORDER BY inside OVER silently changes the frame — that is the entire mechanism here.',
    'Non-deterministic ordering, making the cumulative curve unstable between runs.',
    'Dividing without NULLIF, so an empty or zero-total partition raises an error.',
    'Flagging every row past the threshold instead of the single crossing row.',
    'Using RANGE semantics with duplicate ordering values, so tied rows all jump to the same cumulative value.',
  ],
  questions: [
    {
      id: 'p36-q1',
      difficulty: 'easy',
      prompt: 'Show each product\'s revenue, the running total, and the cumulative percentage of overall revenue, biggest first.',
      tables: ['sales'],
      think: 'Which of the two sums needs an ORDER BY inside OVER, and why does the other one not?',
      hint: 'The running total needs it; the grand total must not have it.',
      approach: `Aggregate sales to revenue per product.\nOrder by revenue descending.\nCompute a running sum with an ORDER BY inside OVER.\nDivide by a partition-wide sum with no ORDER BY.`,
      solution: `WITH product_rev AS (
    SELECT product_id, SUM(amount) AS revenue
    FROM sales
    GROUP BY product_id
)
SELECT product_id,
       revenue,
       SUM(revenue) OVER (ORDER BY revenue DESC, product_id) AS running_total,
       SUM(revenue) OVER ()                                  AS grand_total,
       ROUND(100.0 * SUM(revenue) OVER (ORDER BY revenue DESC, product_id)
             / NULLIF(SUM(revenue) OVER (), 0), 2)           AS cumulative_pct
FROM product_rev
ORDER BY revenue DESC;`,
      explanation: 'The presence or absence of ORDER BY inside OVER is the whole difference between the two sums — one accumulates, the other spans the partition. The product_id tiebreaker keeps the curve identical between runs when two products earn the same revenue.',
    },
    {
      id: 'p36-q2',
      difficulty: 'easy',
      prompt: 'Add a rank and the percentage of products covered, so the result reads as a full Pareto table.',
      tables: ['sales'],
      think: 'A Pareto claim compares two percentages. Which two?',
      hint: 'Share of items against share of value.',
      approach: `Compute the revenue per product and the cumulative revenue share as before.\nNumber the products by revenue descending.\nDivide that number by the total product count to get the cumulative share of items.\nPlace the two percentages side by side.`,
      solution: `WITH product_rev AS (
    SELECT product_id, SUM(amount) AS revenue
    FROM sales
    GROUP BY product_id
)
SELECT ROW_NUMBER() OVER (ORDER BY revenue DESC, product_id) AS rank,
       product_id,
       revenue,
       ROUND(100.0 * ROW_NUMBER() OVER (ORDER BY revenue DESC, product_id)
             / COUNT(*) OVER (), 1) AS pct_of_products,
       ROUND(100.0 * SUM(revenue) OVER (ORDER BY revenue DESC, product_id)
             / NULLIF(SUM(revenue) OVER (), 0), 1) AS pct_of_revenue
FROM product_rev
ORDER BY rank;`,
      explanation: 'Reading across a row gives the Pareto statement directly: "the top 18% of products account for 80% of revenue". Both percentages come from windows over the same ordering, so they are always aligned on the same row.',
    },
    {
      id: 'p36-q3',
      difficulty: 'medium',
      prompt: 'Find the smallest set of products that together account for 80% of revenue.',
      tables: ['sales'],
      think: 'Every row past 80% satisfies "cumulative >= 80". How do you keep only the rows up to and including the crossing?',
      hint: 'Keep rows whose *previous* cumulative percentage was below 80.',
      approach: `Compute the cumulative percentage per product ordered by revenue descending.\nLAG that percentage to see the value on the row before.\nKeep rows where the previous value was below 80, which includes the crossing row itself.\nReturn the resulting set.`,
      solution: `WITH product_rev AS (
    SELECT product_id, SUM(amount) AS revenue
    FROM sales
    GROUP BY product_id
),
cum AS (
    SELECT product_id, revenue,
           100.0 * SUM(revenue) OVER (ORDER BY revenue DESC, product_id)
           / NULLIF(SUM(revenue) OVER (), 0) AS cum_pct
    FROM product_rev
),
marked AS (
    SELECT *, LAG(cum_pct, 1, 0) OVER (ORDER BY revenue DESC, product_id) AS prev_cum_pct
    FROM cum
)
SELECT product_id,
       revenue,
       ROUND(cum_pct, 2) AS cum_pct
FROM marked
WHERE prev_cum_pct < 80
ORDER BY revenue DESC;`,
      explanation: 'Filtering on the *previous* cumulative value rather than the current one is what includes the crossing product and excludes everything after it — filtering on cum_pct <= 80 would cut just before the threshold is reached. LAG with a default of 0 makes the first row qualify without a special case.',
    },
    {
      id: 'p36-q4',
      difficulty: 'medium',
      prompt: 'Compute the cumulative percentage of revenue within each region separately.',
      tables: ['sales'],
      think: 'Both sums need to be scoped to the region. Where does that scoping go in each?',
      hint: 'PARTITION BY region in both windows — the running one and the total one.',
      approach: `Aggregate to revenue per region and product.\nPartition both windows by region.\nKeep the ORDER BY on the running sum only.\nDivide to get a per-region cumulative share.`,
      solution: `WITH rev AS (
    SELECT region, product_id, SUM(amount) AS revenue
    FROM sales
    GROUP BY region, product_id
)
SELECT region,
       product_id,
       revenue,
       ROUND(100.0 * SUM(revenue) OVER (PARTITION BY region
                                        ORDER BY revenue DESC, product_id)
             / NULLIF(SUM(revenue) OVER (PARTITION BY region), 0), 2) AS cum_pct_in_region,
       ROW_NUMBER() OVER (PARTITION BY region ORDER BY revenue DESC, product_id) AS rank_in_region
FROM rev
ORDER BY region, rank_in_region;`,
      explanation: 'Forgetting PARTITION BY on the denominator is the classic bug: each region\'s cumulative share would then be measured against global revenue and no region would ever reach 100%. Both windows must agree on the partition for the ratio to mean anything.',
    },
    {
      id: 'p36-q5',
      difficulty: 'medium',
      prompt: 'Classify products into ABC categories: A up to 80% cumulative, B up to 95%, C the rest.',
      tables: ['sales'],
      think: 'The class depends on where the row sits on the cumulative curve. Which cumulative value decides it — this row\'s or the previous one\'s?',
      hint: 'The previous row\'s, so the crossing product falls into the class it completes.',
      approach: `Compute the cumulative percentage ordered by revenue descending.\nLAG it to get the value entering each row.\nAssign the class from that entering value with a CASE chain.\nSummarise the count and revenue per class.`,
      solution: `WITH product_rev AS (
    SELECT product_id, SUM(amount) AS revenue
    FROM sales GROUP BY product_id
),
cum AS (
    SELECT product_id, revenue,
           100.0 * SUM(revenue) OVER (ORDER BY revenue DESC, product_id)
           / NULLIF(SUM(revenue) OVER (), 0) AS cum_pct
    FROM product_rev
),
classed AS (
    SELECT *,
           LAG(cum_pct, 1, 0) OVER (ORDER BY revenue DESC, product_id) AS entering_pct
    FROM cum
)
SELECT CASE WHEN entering_pct < 80 THEN 'A'
            WHEN entering_pct < 95 THEN 'B'
            ELSE                        'C' END AS abc_class,
       COUNT(*)      AS products,
       SUM(revenue)  AS revenue,
       ROUND(100.0 * SUM(revenue) / SUM(SUM(revenue)) OVER (), 1) AS pct_of_revenue
FROM classed
GROUP BY CASE WHEN entering_pct < 80 THEN 'A'
              WHEN entering_pct < 95 THEN 'B'
              ELSE                        'C' END
ORDER BY abc_class;`,
      explanation: 'Classifying on the entering percentage puts each boundary-crossing product in the class it completes rather than the next one, which is the standard ABC convention. SUM(SUM(revenue)) OVER () supplies the grand total inside a GROUP BY, since windows are evaluated after aggregation.',
    },
    {
      id: 'p36-q6',
      difficulty: 'medium',
      prompt: 'Show the cumulative percentage of orders over time, so you can see what fraction of annual revenue had arrived by each month.',
      tables: ['orders'],
      think: 'The ordering is now chronological rather than by size. Does the formula change?',
      hint: 'No — only the ORDER BY. The meaning changes from Pareto to progress-to-date.',
      approach: `Aggregate orders to revenue per month within the year.\nOrder the running sum by month rather than by revenue.\nDivide by the annual total.\nThe result is cumulative progress through the year.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', order_date)::date AS mth,
           SUM(amount) AS revenue
    FROM orders
    WHERE order_date >= DATE '2024-01-01'
      AND order_date <  DATE '2025-01-01'
    GROUP BY DATE_TRUNC('month', order_date)
)
SELECT mth,
       revenue,
       SUM(revenue) OVER (ORDER BY mth) AS revenue_ytd,
       ROUND(100.0 * SUM(revenue) OVER (ORDER BY mth)
             / NULLIF(SUM(revenue) OVER (), 0), 1) AS pct_of_year_complete
FROM monthly
ORDER BY mth;`,
      explanation: 'The same two-window formula answers a completely different question once the ordering changes from "largest first" to "earliest first" — Pareto becomes seasonality. Note the denominator is the total of the *filtered* year, which is why the WHERE clause bounds both sums consistently.',
    },
    {
      id: 'p36-q7',
      difficulty: 'hard',
      prompt: 'Compute the cumulative share of revenue by customer and identify concentration risk: how few customers make up half the revenue.',
      tables: ['orders', 'customers'],
      think: 'Concentration is a single number derived from the curve. How do you extract it rather than printing the whole table?',
      hint: 'Find the crossing row and report its rank and the customer share it represents.',
      approach: `Aggregate orders to revenue per customer.\nCompute the cumulative percentage and the rank ordered by revenue descending.\nFind the first row where the cumulative percentage reaches 50.\nReport the rank, the customer count share, and the names involved.`,
      solution: `WITH spend AS (
    SELECT c.customer_id, c.customer_name, SUM(o.amount) AS revenue
    FROM customers AS c
    JOIN orders    AS o ON o.customer_id = c.customer_id
    GROUP BY c.customer_id, c.customer_name
),
cum AS (
    SELECT *,
           ROW_NUMBER() OVER (ORDER BY revenue DESC, customer_id) AS rank,
           COUNT(*)     OVER ()                                   AS total_customers,
           100.0 * SUM(revenue) OVER (ORDER BY revenue DESC, customer_id)
           / NULLIF(SUM(revenue) OVER (), 0)                      AS cum_pct
    FROM spend
)
SELECT rank                                        AS customers_needed,
       total_customers,
       ROUND(100.0 * rank / total_customers, 1)    AS pct_of_customer_base,
       ROUND(cum_pct, 1)                           AS revenue_share_reached
FROM cum
WHERE cum_pct >= 50
ORDER BY rank
LIMIT 1;`,
      explanation: 'A single crossing row summarises the whole curve: "3 of 480 customers are half our revenue" is an actionable risk statement in a way the full table is not. LIMIT 1 after ordering by rank picks the first row that reaches the threshold, which is the minimal set.',
    },
    {
      id: 'p36-q8',
      difficulty: 'hard',
      prompt: 'Show how the cumulative revenue curve differs between two years, so you can tell whether concentration increased.',
      tables: ['sales_2023 / sales_2024'],
      think: 'Two curves must be comparable despite different totals. What makes them comparable?',
      hint: 'Both axes as percentages — share of products against share of revenue — computed within each year.',
      approach: `Union the two yearly tables with a year tag.\nAggregate to revenue per product per year.\nCompute rank share and cumulative revenue share within each year.\nJoin the two curves on the rank share to compare them at the same points.`,
      solution: `WITH combined AS (
    SELECT 2023 AS yr, product_id, amount FROM sales_2023
    UNION ALL
    SELECT 2024,       product_id, amount FROM sales_2024
),
rev AS (
    SELECT yr, product_id, SUM(amount) AS revenue
    FROM combined GROUP BY yr, product_id
),
curve AS (
    SELECT yr, product_id, revenue,
           ROUND(100.0 * ROW_NUMBER() OVER (PARTITION BY yr
                                            ORDER BY revenue DESC, product_id)
                 / COUNT(*) OVER (PARTITION BY yr)) AS pct_products,
           100.0 * SUM(revenue) OVER (PARTITION BY yr
                                      ORDER BY revenue DESC, product_id)
           / NULLIF(SUM(revenue) OVER (PARTITION BY yr), 0) AS cum_pct_revenue
    FROM rev
)
SELECT pct_products,
       ROUND(MAX(CASE WHEN yr = 2023 THEN cum_pct_revenue END), 1) AS curve_2023,
       ROUND(MAX(CASE WHEN yr = 2024 THEN cum_pct_revenue END), 1) AS curve_2024
FROM curve
GROUP BY pct_products
ORDER BY pct_products;`,
      explanation: 'Normalising both axes to percentages is what makes two years with different product counts and different revenue directly comparable. A 2024 curve sitting above the 2023 one at every point means revenue has become more concentrated in fewer products.',
    },
    {
      id: 'p36-q9',
      difficulty: 'hard',
      prompt: 'Compute a cumulative percentage where ties should share the same cumulative value.',
      tables: ['sales'],
      think: 'Two products with identical revenue — should one show 40% and the next 55%, or both show 55%?',
      hint: 'That is the ROWS versus RANGE distinction. RANGE includes all peers of the current row.',
      approach: `Aggregate to revenue per product.\nOrder the running sum by revenue only, with no unique tiebreaker.\nUse a RANGE frame so all rows tied on revenue share the same cumulative value.\nCompare against the ROWS form to see the difference.`,
      solution: `WITH product_rev AS (
    SELECT product_id, SUM(amount) AS revenue
    FROM sales GROUP BY product_id
)
SELECT product_id,
       revenue,
       ROUND(100.0 * SUM(revenue) OVER (ORDER BY revenue DESC
                                        RANGE BETWEEN UNBOUNDED PRECEDING
                                                  AND CURRENT ROW)
             / NULLIF(SUM(revenue) OVER (), 0), 2) AS cum_pct_range,
       ROUND(100.0 * SUM(revenue) OVER (ORDER BY revenue DESC, product_id
                                        ROWS BETWEEN UNBOUNDED PRECEDING
                                                 AND CURRENT ROW)
             / NULLIF(SUM(revenue) OVER (), 0), 2) AS cum_pct_rows
FROM product_rev
ORDER BY revenue DESC, product_id;`,
      explanation: 'With RANGE, every product tied on revenue shows the same cumulative value — the one reached after all of them are counted — because RANGE includes all peers of the current row. RANGE is also the default when you write ORDER BY with no frame, which is why tied data sometimes produces a "flat step" nobody expected.',
    },
    {
      id: 'p36-q10',
      difficulty: 'hard',
      prompt: 'Build a full Pareto report: per category, the number of products needed to reach 80% of that category\'s revenue.',
      tables: ['order_items', 'products'],
      think: 'A per-category crossing point. What has to be partitioned, and what has to be picked?',
      hint: 'Partition both windows by category, find the crossing row per category, then keep one row each.',
      approach: `Aggregate order lines to revenue per product with its category.\nCompute the per-category rank, product count and cumulative revenue share.\nKeep the first row per category whose cumulative share reaches 80.\nReport the rank as the number of products needed.`,
      solution: `WITH product_rev AS (
    SELECT p.category, p.product_id, p.product_name,
           SUM(oi.quantity * oi.unit_price) AS revenue
    FROM order_items AS oi
    JOIN products    AS p ON p.product_id = oi.product_id
    GROUP BY p.category, p.product_id, p.product_name
),
curve AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY category
                              ORDER BY revenue DESC, product_id) AS rank,
           COUNT(*)     OVER (PARTITION BY category)             AS products_in_category,
           100.0 * SUM(revenue) OVER (PARTITION BY category
                                      ORDER BY revenue DESC, product_id)
           / NULLIF(SUM(revenue) OVER (PARTITION BY category), 0) AS cum_pct
    FROM product_rev
),
crossing AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY category ORDER BY rank) AS pick
    FROM curve
    WHERE cum_pct >= 80
)
SELECT category,
       rank                 AS products_for_80pct,
       products_in_category,
       ROUND(100.0 * rank / products_in_category, 1) AS pct_of_range,
       ROUND(cum_pct, 1)    AS revenue_share_reached
FROM crossing
WHERE pick = 1
ORDER BY pct_of_range;`,
      explanation: 'Three windows over the same partition — a rank, a count and a cumulative sum — produce every number the report needs in one pass. The second ROW_NUMBER over the already-filtered rows is how you pick the *first* crossing per category, since a simple MIN would lose the accompanying columns.',
    },
  ],
};
