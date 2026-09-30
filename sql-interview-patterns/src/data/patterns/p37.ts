import type { Pattern } from '../types';

export const p37: Pattern = {
  num: 37,
  slug: 'percent-of-total',
  title: 'Percent of Total',
  concept: 'SUM() OVER()',
  category: 'Window Functions',
  tagline: 'Row value over group total, without a self-join. The question is always: total of what?',
  theory: `"What share of the total is this?" is answered by dividing a row's value by SUM(x) OVER (PARTITION BY …). The window with no ORDER BY spans the whole partition, so the denominator is constant across it and the ratio is a share.

The only real decision is **which total**. Share of the grand total (no PARTITION BY), share of the region (PARTITION BY region), share of the region *within* the year (PARTITION BY region, year) — three different questions, three different denominators, and the query looks nearly identical each time. Say out loud which total you mean before writing it.

The second decision is **which rows are in the total**. The window runs after WHERE, so filtering to one region first makes every share 100%. If you need shares of the unfiltered population while displaying only part of it, compute the window first in a CTE and filter afterwards.

Mechanically: guard the division with NULLIF, multiply by 100.0 rather than 100 so integer division does not truncate to zero, and remember that a window aggregate can sit in the same SELECT as a GROUP BY — SUM(SUM(x)) OVER () is the grand total of the grouped result, not a syntax error.`,
  pitfalls: [
    'Filtering before the window and then wondering why every percentage is 100.',
    'Integer division: 100 * 3 / 10 is 30 in some engines and 0 in others — use 100.0.',
    'Dividing without NULLIF, so an empty partition raises a division-by-zero error.',
    'Using the wrong partition, so shares sum to more or less than 100% per group.',
    'Computing the total with a self-join or correlated subquery when one window would do.',
  ],
  questions: [
    {
      id: 'p37-q1',
      difficulty: 'easy',
      prompt: 'Show each region\'s revenue as a percentage of total revenue.',
      tables: ['sales'],
      think: 'The rows are already aggregated by region. Where does the grand total come from?',
      hint: 'A window aggregate over the grouped result: SUM(SUM(amount)) OVER ().',
      approach: `Group sales by region and sum the amount.\nIn the same SELECT, apply a window SUM over that grouped sum with no partition.\nDivide the group total by the grand total.\nMultiply by 100.0 to force decimal arithmetic.`,
      solution: `SELECT region,
       SUM(amount) AS revenue,
       SUM(SUM(amount)) OVER () AS total_revenue,
       ROUND(100.0 * SUM(amount) / NULLIF(SUM(SUM(amount)) OVER (), 0), 2) AS pct_of_total
FROM sales
GROUP BY region
ORDER BY revenue DESC;`,
      explanation: 'SUM(SUM(amount)) OVER () is not a typo — the inner SUM is the aggregate over each group and the outer one is a window over the grouped rows, which is legal because windows run after GROUP BY. It saves a second pass over the table that a subquery would cost.',
    },
    {
      id: 'p37-q2',
      difficulty: 'easy',
      prompt: 'Show each order\'s amount as a percentage of its customer\'s lifetime spend.',
      tables: ['orders'],
      think: 'The denominator now varies per row. What makes it vary?',
      hint: 'PARTITION BY customer_id on the window sum.',
      approach: `Keep the rows at order grain — no GROUP BY.\nCompute the customer lifetime total with a window partitioned by customer.\nDivide the order amount by that total.\nOrder by customer then by share descending.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       amount,
       SUM(amount) OVER (PARTITION BY customer_id) AS lifetime_spend,
       ROUND(100.0 * amount
             / NULLIF(SUM(amount) OVER (PARTITION BY customer_id), 0), 2) AS pct_of_lifetime
FROM orders
ORDER BY customer_id, pct_of_lifetime DESC;`,
      explanation: 'A window aggregate attaches a group total to every row without collapsing them, which is exactly what a GROUP BY cannot do. Within each customer the percentages sum to 100, which is a free sanity check on the partition being right.',
    },
    {
      id: 'p37-q3',
      difficulty: 'medium',
      prompt: 'Show each product\'s share of revenue within its category, and its share of overall revenue, side by side.',
      tables: ['order_items', 'products'],
      think: 'Two denominators on one row. Does that need two queries?',
      hint: 'Two window sums with different PARTITION BY clauses in the same SELECT.',
      approach: `Aggregate order lines to revenue per product with its category.\nCompute one window sum partitioned by category and another with no partition.\nDivide the product revenue by each in turn.\nCompare the two shares.`,
      solution: `WITH product_rev AS (
    SELECT p.category, p.product_id, p.product_name,
           SUM(oi.quantity * oi.unit_price) AS revenue
    FROM order_items AS oi
    JOIN products    AS p ON p.product_id = oi.product_id
    GROUP BY p.category, p.product_id, p.product_name
)
SELECT category,
       product_name,
       revenue,
       ROUND(100.0 * revenue
             / NULLIF(SUM(revenue) OVER (PARTITION BY category), 0), 2) AS pct_of_category,
       ROUND(100.0 * revenue
             / NULLIF(SUM(revenue) OVER (), 0), 2)                      AS pct_of_all
FROM product_rev
ORDER BY category, revenue DESC;`,
      explanation: 'The two percentages answer different questions: dominance within a niche versus importance to the business. A product at 60% of its category and 2% of the business is a big fish in a small pond, and having both numbers on one row is what makes that visible.',
    },
    {
      id: 'p37-q4',
      difficulty: 'medium',
      prompt: 'Show revenue by region and month, with each cell as a percentage of that month\'s total.',
      tables: ['sales'],
      think: 'The denominator is the month, not the region. Which way round does the partition go?',
      hint: 'PARTITION BY month — the total you divide by is the month total.',
      approach: `Aggregate to revenue per region per month.\nPartition the window sum by month so the denominator is that month's total across all regions.\nDivide each region's figure by it.\nOrder by month then by share.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', sale_date)::date AS mth,
           region,
           SUM(amount) AS revenue
    FROM sales
    GROUP BY DATE_TRUNC('month', sale_date), region
)
SELECT mth,
       region,
       revenue,
       SUM(revenue) OVER (PARTITION BY mth) AS month_total,
       ROUND(100.0 * revenue / NULLIF(SUM(revenue) OVER (PARTITION BY mth), 0), 1)
         AS pct_of_month
FROM monthly
ORDER BY mth, pct_of_month DESC;`,
      explanation: 'Partitioning by month makes the shares sum to 100 within each month, which is what "share of that month" means — partitioning by region instead would give each region\'s monthly profile, a different and equally valid report. Stating which one you built is the difference between a right answer and a lucky one.',
    },
    {
      id: 'p37-q5',
      difficulty: 'medium',
      prompt: 'Show only the North region\'s products, but with each one\'s share of *company-wide* revenue.',
      tables: ['sales'],
      think: 'The window runs after WHERE. What does that mean for a filtered report with an unfiltered denominator?',
      hint: 'Compute the window first in a CTE, then filter in the outer query.',
      approach: `Aggregate to revenue per region and product across all regions.\nCompute the company-wide total as a window over the full set.\nFilter to the target region only in the outer query, after the window has been computed.\nThe denominator therefore still reflects every region.`,
      solution: `WITH rev AS (
    SELECT region, product_id, SUM(amount) AS revenue
    FROM sales
    GROUP BY region, product_id
),
shared AS (
    SELECT *,
           SUM(revenue) OVER () AS company_revenue
    FROM rev
)
SELECT region,
       product_id,
       revenue,
       company_revenue,
       ROUND(100.0 * revenue / NULLIF(company_revenue, 0), 3) AS pct_of_company
FROM shared
WHERE region = 'North'
ORDER BY revenue DESC;`,
      explanation: 'Because the window is computed in the CTE and the filter applied outside it, the denominator still spans every region — put the WHERE inside the CTE and every percentage would be a share of North alone. This ordering trick is the general answer to "filtered rows, unfiltered total".',
    },
    {
      id: 'p37-q6',
      difficulty: 'medium',
      prompt: 'Show each employee\'s salary as a percentage of their department\'s payroll, and flag anyone above 25%.',
      tables: ['employees'],
      think: 'A single person taking a quarter of a department\'s payroll — what does that usually indicate?',
      hint: 'Either a very small team or a key-person concentration. Include the headcount so the reader can tell.',
      approach: `Partition the window sum by department to get the payroll.\nCount the headcount in the same partition.\nDivide each salary by the payroll.\nFlag rows above the threshold, and show the headcount for context.`,
      solution: `SELECT dept_id,
       emp_name,
       salary,
       COUNT(*)    OVER (PARTITION BY dept_id) AS headcount,
       SUM(salary) OVER (PARTITION BY dept_id) AS dept_payroll,
       ROUND(100.0 * salary
             / NULLIF(SUM(salary) OVER (PARTITION BY dept_id), 0), 1) AS pct_of_payroll,
       CASE WHEN salary > 0.25 * SUM(salary) OVER (PARTITION BY dept_id)
             AND COUNT(*) OVER (PARTITION BY dept_id) >= 5
            THEN 'concentration risk' END AS flag
FROM employees
WHERE salary IS NOT NULL
ORDER BY pct_of_payroll DESC;`,
      explanation: 'The headcount guard is what stops the flag firing on a team of two, where one person taking 50% is arithmetic rather than risk. Pairing a ratio threshold with a minimum group size is a habit worth applying to every percentage-based alert.',
    },
    {
      id: 'p37-q7',
      difficulty: 'hard',
      prompt: 'Build a table of revenue by category and region with row totals, column totals and shares of the grand total.',
      tables: ['sales', 'products'],
      think: 'Three grains in one result — cell, row, column and grand total. What produces subtotal rows?',
      hint: 'GROUPING SETS or CUBE, with GROUPING() to label the synthetic NULLs.',
      approach: `Join sales to products for the category.\nGroup with CUBE over category and region to get every combination including subtotals.\nCompute each cell's share of the grand total with a window over the result.\nLabel the subtotal rows using GROUPING.`,
      solution: `SELECT COALESCE(p.category, 'ALL CATEGORIES') AS category,
       COALESCE(s.region,   'ALL REGIONS')    AS region,
       SUM(s.amount)                          AS revenue,
       GROUPING(p.category) AS is_category_total,
       GROUPING(s.region)   AS is_region_total,
       ROUND(100.0 * SUM(s.amount)
             / NULLIF(MAX(SUM(s.amount)) OVER (), 0), 2) AS pct_of_grand_total
FROM sales    AS s
JOIN products AS p ON p.product_id = s.product_id
GROUP BY CUBE (p.category, s.region)
ORDER BY GROUPING(p.category), GROUPING(s.region), category, region;`,
      explanation: 'CUBE produces every subtotal combination in one pass, and the grand-total row is the maximum of the grouped sums, which is why MAX(SUM(...)) OVER () is a neat way to reach it. GROUPING distinguishes a synthetic subtotal NULL from a genuine NULL category in the data — without it the two are indistinguishable.',
      dialect: 'CUBE and GROUPING are PostgreSQL / SQL Server / Oracle / MySQL 8. Older MySQL has only WITH ROLLUP.',
    },
    {
      id: 'p37-q8',
      difficulty: 'hard',
      prompt: 'Show each customer\'s share of revenue, but group everyone below 1% into a single "Other" bucket.',
      tables: ['orders', 'customers'],
      think: 'The bucket assignment depends on a percentage computed over the full set. How many passes is that?',
      hint: 'Compute the share first, derive a label from it, then re-aggregate by the label.',
      approach: `Aggregate orders to revenue per customer.\nCompute each customer's share of the total with a window.\nDerive a display label: the customer name above the threshold, Other below it.\nGroup by that label and re-sum.`,
      solution: `WITH spend AS (
    SELECT c.customer_id, c.customer_name, SUM(o.amount) AS revenue
    FROM customers AS c
    JOIN orders    AS o ON o.customer_id = c.customer_id
    GROUP BY c.customer_id, c.customer_name
),
shared AS (
    SELECT *,
           100.0 * revenue / NULLIF(SUM(revenue) OVER (), 0) AS pct
    FROM spend
)
SELECT CASE WHEN pct >= 1 THEN customer_name ELSE 'Other (under 1%)' END AS label,
       COUNT(*)     AS customers,
       SUM(revenue) AS revenue,
       ROUND(SUM(pct), 2) AS pct_of_total
FROM shared
GROUP BY CASE WHEN pct >= 1 THEN customer_name ELSE 'Other (under 1%)' END
ORDER BY revenue DESC;`,
      explanation: 'The percentages are computed before the bucketing, so summing them within the Other group gives its true combined share rather than a recomputed approximation. This long-tail collapse is what makes a pie chart readable when there are four hundred customers.',
    },
    {
      id: 'p37-q9',
      difficulty: 'hard',
      prompt: 'Show how each region\'s share of total revenue has changed month over month.',
      tables: ['sales'],
      think: 'A share per month, then a change in that share across months. Which window does which?',
      hint: 'PARTITION BY month for the share; PARTITION BY region with ORDER BY month for the LAG.',
      approach: `Aggregate to revenue per region per month.\nCompute each region's share of its month with a window partitioned by month.\nLAG that share within each region ordered by month.\nSubtract to get the change in share, in percentage points.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', sale_date)::date AS mth,
           region,
           SUM(amount) AS revenue
    FROM sales
    GROUP BY DATE_TRUNC('month', sale_date), region
),
shares AS (
    SELECT mth, region, revenue,
           100.0 * revenue / NULLIF(SUM(revenue) OVER (PARTITION BY mth), 0) AS share_pct
    FROM monthly
)
SELECT mth,
       region,
       revenue,
       ROUND(share_pct, 2) AS share_pct,
       ROUND(share_pct - LAG(share_pct) OVER (PARTITION BY region ORDER BY mth), 2)
         AS share_change_pp
FROM shares
ORDER BY mth, share_pct DESC;`,
      explanation: 'Two windows with different partitions do two different jobs in one pass: one computes the share within a month, the other tracks that share through time within a region. The change is in percentage *points*, not percent — a region going from 20% to 25% gained 5 points, not 5%, and mislabelling that is a common reporting error.',
    },
    {
      id: 'p37-q10',
      difficulty: 'hard',
      prompt: 'Verify that percentages sum to 100 within each partition, and find any partition where they do not.',
      tables: ['sales'],
      think: 'If the shares do not sum to 100, what could have caused it?',
      hint: 'Rounding, NULL amounts excluded from the numerator but not the denominator, or a mismatched partition.',
      approach: `Compute each row's share within its partition.\nSum those shares back up per partition.\nCompare the result against 100 with a tolerance for rounding.\nReport any partition that fails, along with the NULL counts that usually explain it.`,
      solution: `WITH rev AS (
    SELECT region, product_id, SUM(amount) AS revenue
    FROM sales
    GROUP BY region, product_id
),
shared AS (
    SELECT region, product_id, revenue,
           ROUND(100.0 * revenue
                 / NULLIF(SUM(revenue) OVER (PARTITION BY region), 0), 2) AS pct
    FROM rev
)
SELECT region,
       COUNT(*)                     AS rows,
       COUNT(*) - COUNT(pct)        AS null_pct_rows,
       SUM(pct)                     AS sum_of_pct,
       ROUND(ABS(SUM(pct) - 100), 4) AS drift_from_100,
       CASE WHEN ABS(SUM(pct) - 100) > 0.5 THEN 'investigate' END AS flag
FROM shared
GROUP BY region
ORDER BY drift_from_100 DESC;`,
      explanation: 'Small drift is rounding — each ROUND to two places loses up to half a hundredth, and a hundred rows can accumulate a visible difference. Large drift means something structural: a NULL revenue excluded from the numerator but counted in the denominator, or a partition that does not match the one used for the total.',
    },
  ],
};
