import type { Pattern } from '../types';

export const p19: Pattern = {
  num: 19,
  slug: 'conditional-aggregation',
  title: 'Conditional Aggregation',
  concept: 'CASE WHEN + SUM()',
  category: 'Aggregation & Grouping',
  tagline: 'Count and sum subsets in one pass — the technique behind pivots, funnels and cohort tables.',
  theory: `Conditional aggregation puts a CASE expression inside an aggregate so a single pass can measure several subsets at once. SUM(CASE WHEN status = 'delivered' THEN amount ELSE 0 END) gives delivered revenue; another column gives cancelled revenue; a third gives the total. One scan, one GROUP BY, several answers.

The key insight is what each aggregate does with the rows that fail the condition. SUM with ELSE 0 adds nothing. COUNT counts non-NULL values, so COUNT(CASE WHEN x THEN 1 END) — with no ELSE — counts only matching rows, because the non-matching ones evaluate to NULL and COUNT skips them. Writing ELSE 0 there is a classic bug: it turns the count into COUNT(*).

This is also the portable PIVOT. Every engine has CASE; only some have a PIVOT operator, and the CASE form is more flexible anyway because each column can use a different aggregate and a different condition.

The modern alternative is the FILTER clause: COUNT(*) FILTER (WHERE status = 'delivered'). It reads better and is standard SQL, but only PostgreSQL and SQLite implement it widely.`,
  pitfalls: [
    'Writing COUNT(CASE WHEN x THEN 1 ELSE 0 END). The ELSE 0 is non-NULL, so it counts every row.',
    'Using AVG with ELSE 0, which drags the average down by treating non-matching rows as zeros instead of excluding them.',
    'Putting the condition in WHERE instead of inside the CASE, which filters the whole query rather than one column.',
    'Forgetting that SUM of an all-NULL set is NULL, not 0 — wrap in COALESCE when the report needs a zero.',
    'Dividing two conditional sums without NULLIF, so an empty denominator raises an error.',
  ],
  questions: [
    {
      id: 'p19-q1',
      difficulty: 'easy',
      prompt: 'For each customer, count their delivered orders and their cancelled orders in one row.',
      tables: ['orders'],
      think: 'Both counts come from the same rows. If you put the status in WHERE, how many of the two can you get?',
      hint: 'Only one — so the condition has to live inside the aggregate, not in WHERE.',
      approach: `Group orders by customer.\nFor delivered, count the rows where status is delivered, letting the others be NULL.\nDo the same for cancelled with a second CASE.\nReturn both counts plus the total.`,
      solution: `SELECT customer_id,
       COUNT(*)                                                AS total_orders,
       COUNT(CASE WHEN status = 'delivered' THEN 1 END)        AS delivered_orders,
       COUNT(CASE WHEN status = 'cancelled' THEN 1 END)        AS cancelled_orders
FROM orders
GROUP BY customer_id
ORDER BY total_orders DESC;`,
      explanation: 'No ELSE branch is the point: a CASE with no matching WHEN returns NULL, and COUNT ignores NULLs. Add ELSE 0 and every column becomes identical to COUNT(*), which is the most common bug in this pattern.',
    },
    {
      id: 'p19-q2',
      difficulty: 'easy',
      prompt: 'For each customer, sum the revenue from delivered orders and separately from cancelled ones.',
      tables: ['orders'],
      think: 'SUM behaves differently from COUNT with the non-matching rows. Does ELSE 0 hurt here?',
      hint: 'For SUM, ELSE 0 and no ELSE give the same answer — except when a group has no matching rows at all.',
      approach: `Group orders by customer.\nSum the amount where the status is delivered, contributing zero otherwise.\nDo the same for cancelled.\nWrap in COALESCE so a group with no matching rows reports 0 rather than NULL.`,
      solution: `SELECT customer_id,
       COALESCE(SUM(CASE WHEN status = 'delivered' THEN amount END), 0) AS delivered_revenue,
       COALESCE(SUM(CASE WHEN status = 'cancelled' THEN amount END), 0) AS cancelled_revenue,
       SUM(amount)                                                     AS gross_revenue
FROM orders
GROUP BY customer_id
ORDER BY delivered_revenue DESC;`,
      explanation: 'SUM over an entirely NULL set returns NULL, not 0 — so a customer with no cancellations would show NULL rather than zero. COALESCE at the outside is the fix, and it is clearer than ELSE 0 inside because it states the intent at the reporting boundary.',
    },
    {
      id: 'p19-q3',
      difficulty: 'medium',
      prompt: 'Build a monthly report with one column per order status, showing counts.',
      tables: ['orders'],
      think: 'This is a pivot. What plays the role of the row key, and what becomes the columns?',
      hint: 'GROUP BY the month; one conditional aggregate per status value.',
      approach: `Truncate order_date to the month to form the row key.\nGroup by that month.\nWrite one conditional count per status value.\nAdd a total column for reconciliation.`,
      solution: `SELECT DATE_TRUNC('month', order_date)::date              AS mth,
       COUNT(CASE WHEN status = 'placed'    THEN 1 END)  AS placed,
       COUNT(CASE WHEN status = 'shipped'   THEN 1 END)  AS shipped,
       COUNT(CASE WHEN status = 'delivered' THEN 1 END)  AS delivered,
       COUNT(CASE WHEN status = 'cancelled' THEN 1 END)  AS cancelled,
       COUNT(*)                                          AS total
FROM orders
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY mth;`,
      explanation: 'This is the portable PIVOT, and it beats the PIVOT operator in every way except brevity: the column set is explicit, each column can use a different aggregate, and it works on every engine. Its one limitation is that the statuses must be known at write time.',
    },
    {
      id: 'p19-q4',
      difficulty: 'medium',
      prompt: 'For each department, compute the percentage of employees earning above 60,000.',
      tables: ['employees'],
      think: 'A percentage is a conditional count over a total count. What must guard the division?',
      hint: 'NULLIF on the denominator, and be careful whether NULL salaries belong in the base.',
      approach: `Group employees by department.\nCount those earning above the threshold with a conditional count.\nCount the employees with a known salary as the denominator.\nDivide with a NULLIF guard and round.`,
      solution: `SELECT dept_id,
       COUNT(*)                                             AS headcount,
       COUNT(salary)                                        AS with_salary,
       COUNT(CASE WHEN salary > 60000 THEN 1 END)           AS above_60k,
       ROUND(100.0 * COUNT(CASE WHEN salary > 60000 THEN 1 END)
             / NULLIF(COUNT(salary), 0), 1)                 AS pct_above_60k
FROM employees
GROUP BY dept_id
ORDER BY pct_above_60k DESC NULLS LAST;`,
      explanation: 'COUNT(salary) counts non-NULL salaries, which is the right denominator — using COUNT(*) would dilute the percentage with employees whose salary is simply unknown. Showing both counts lets the reader judge whether the denominator is trustworthy.',
    },
    {
      id: 'p19-q5',
      difficulty: 'medium',
      prompt: 'For each product category, show revenue split across 2023 and 2024 side by side, with the growth percentage.',
      tables: ['sales', 'products'],
      think: 'Two time slices as columns rather than rows. What does that let you compute that a GROUP BY year would not?',
      hint: 'Once both years are columns on the same row, the growth is plain arithmetic with no window function.',
      approach: `Join sales to products to get the category.\nGroup by category.\nSum the amount conditionally on the year for each of the two years.\nCompute the growth from the two columns directly.`,
      solution: `SELECT p.category,
       COALESCE(SUM(CASE WHEN s.sale_date >= DATE '2023-01-01'
                          AND s.sale_date <  DATE '2024-01-01'
                         THEN s.amount END), 0) AS revenue_2023,
       COALESCE(SUM(CASE WHEN s.sale_date >= DATE '2024-01-01'
                          AND s.sale_date <  DATE '2025-01-01'
                         THEN s.amount END), 0) AS revenue_2024,
       ROUND(100.0 * (COALESCE(SUM(CASE WHEN s.sale_date >= DATE '2024-01-01'
                                         AND s.sale_date <  DATE '2025-01-01'
                                        THEN s.amount END), 0)
                    - COALESCE(SUM(CASE WHEN s.sale_date >= DATE '2023-01-01'
                                         AND s.sale_date <  DATE '2024-01-01'
                                        THEN s.amount END), 0))
             / NULLIF(SUM(CASE WHEN s.sale_date >= DATE '2023-01-01'
                                AND s.sale_date <  DATE '2024-01-01'
                               THEN s.amount END), 0), 1) AS yoy_pct
FROM sales    AS s
JOIN products AS p ON p.product_id = s.product_id
GROUP BY p.category
ORDER BY yoy_pct DESC NULLS LAST;`,
      explanation: 'Pivoting the periods into columns turns a window-function problem into arithmetic, which is often simpler when the number of periods is small and fixed. It gets unwieldy fast — at more than two or three periods, go back to LAG over rows.',
    },
    {
      id: 'p19-q6',
      difficulty: 'medium',
      prompt: 'Show the average salary of employees hired before 2020 and of those hired since, per department, in one row.',
      tables: ['employees'],
      think: 'AVG with a CASE behaves differently from SUM with a CASE. What must you never write in the ELSE?',
      hint: 'Leave the ELSE out. ELSE 0 would average zeros into the result and wreck it.',
      approach: `Group employees by department.\nAverage the salary where the hire date is before 2020, with no ELSE branch.\nDo the same for the later cohort.\nReturn both averages and the headcounts behind them.`,
      solution: `SELECT dept_id,
       ROUND(AVG(CASE WHEN hire_date <  DATE '2020-01-01' THEN salary END), 2) AS avg_salary_veterans,
       COUNT(CASE WHEN hire_date <  DATE '2020-01-01' THEN 1 END)              AS veteran_count,
       ROUND(AVG(CASE WHEN hire_date >= DATE '2020-01-01' THEN salary END), 2) AS avg_salary_recent,
       COUNT(CASE WHEN hire_date >= DATE '2020-01-01' THEN 1 END)              AS recent_count
FROM employees
WHERE salary IS NOT NULL
GROUP BY dept_id
ORDER BY dept_id;`,
      explanation: 'AVG ignores NULLs, so omitting ELSE excludes non-matching rows from both the numerator and the denominator — exactly what an average of a subset means. ELSE 0 would include every other employee as a zero-salary observation and halve the reported average.',
    },
    {
      id: 'p19-q7',
      difficulty: 'hard',
      prompt: 'Build a conversion funnel by month: orders placed, of those shipped, of those delivered, with conversion rates between each stage.',
      tables: ['orders'],
      think: 'Funnel stages are usually cumulative — a delivered order was also shipped. Does the data model support that, and what do you do if it does not?',
      hint: 'If status holds only the latest state, a "reached shipped" count must include delivered too.',
      approach: `Group orders by month.\nCount all orders as the top of the funnel.\nCount orders that reached shipped, meaning status is shipped or delivered.\nCount orders that reached delivered, then compute the stage-to-stage rates.`,
      solution: `SELECT DATE_TRUNC('month', order_date)::date AS mth,
       COUNT(*) AS placed,
       COUNT(CASE WHEN status IN ('shipped', 'delivered') THEN 1 END) AS reached_shipped,
       COUNT(CASE WHEN status = 'delivered'               THEN 1 END) AS reached_delivered,
       ROUND(100.0 * COUNT(CASE WHEN status IN ('shipped','delivered') THEN 1 END)
             / NULLIF(COUNT(*), 0), 1) AS placed_to_shipped_pct,
       ROUND(100.0 * COUNT(CASE WHEN status = 'delivered' THEN 1 END)
             / NULLIF(COUNT(CASE WHEN status IN ('shipped','delivered') THEN 1 END), 0), 1)
         AS shipped_to_delivered_pct
FROM orders
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY mth;`,
      explanation: 'A status column that holds only the current state is not a funnel — it is a snapshot, so "reached shipped" must be expressed as "is shipped or anything downstream of shipped". Getting that wrong makes every conversion rate understate reality, and spotting it is the real test in this question.',
    },
    {
      id: 'p19-q8',
      difficulty: 'hard',
      prompt: 'Produce a cohort table: rows are signup month, columns are months 0, 1, 2 and 3 after signup, values are the count of customers who ordered in that month.',
      tables: ['customers', 'orders'],
      think: 'The column key is a relative offset rather than an absolute date. What must be computed per row before the pivot?',
      hint: 'Compute the month offset between the signup month and the order month, then pivot on that offset.',
      approach: `Reduce orders to the distinct months in which each customer ordered.\nJoin to customers to get the signup month.\nCompute the integer offset in months between the two.\nGroup by signup month and pivot the offsets into columns with distinct counts.`,
      solution: `WITH activity AS (
    SELECT DISTINCT
           o.customer_id,
           DATE_TRUNC('month', c.signup_date) AS cohort_month,
           (EXTRACT(YEAR  FROM o.order_date) - EXTRACT(YEAR  FROM c.signup_date)) * 12
         + (EXTRACT(MONTH FROM o.order_date) - EXTRACT(MONTH FROM c.signup_date)) AS month_offset
    FROM orders    AS o
    JOIN customers AS c ON c.customer_id = o.customer_id
)
SELECT cohort_month::date AS cohort,
       COUNT(DISTINCT CASE WHEN month_offset = 0 THEN customer_id END) AS m0,
       COUNT(DISTINCT CASE WHEN month_offset = 1 THEN customer_id END) AS m1,
       COUNT(DISTINCT CASE WHEN month_offset = 2 THEN customer_id END) AS m2,
       COUNT(DISTINCT CASE WHEN month_offset = 3 THEN customer_id END) AS m3
FROM activity
WHERE month_offset BETWEEN 0 AND 3
GROUP BY cohort_month
ORDER BY cohort_month;`,
      explanation: 'COUNT(DISTINCT CASE WHEN ...) is the cohort-table workhorse: the CASE selects the cohort period and DISTINCT stops a customer with three orders in month 1 from counting three times. Computing the offset in months rather than days keeps the columns aligned regardless of month length.',
    },
    {
      id: 'p19-q9',
      difficulty: 'hard',
      prompt: 'For each region, compute what share of revenue came from the top-selling product in that region.',
      tables: ['sales'],
      think: 'The condition of the conditional aggregate is itself a computed fact. What must exist before the CASE can reference it?',
      hint: 'Rank products per region first, then conditionally sum only the rank-1 product.',
      approach: `Aggregate sales to revenue per region and product.\nRank the products within each region by revenue.\nGroup back to region level, conditionally summing only the rank-1 product's revenue.\nDivide by the total region revenue.`,
      solution: `WITH by_product AS (
    SELECT region, product_id, SUM(amount) AS revenue
    FROM sales
    GROUP BY region, product_id
),
ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY region ORDER BY revenue DESC, product_id) AS rn
    FROM by_product
)
SELECT region,
       SUM(revenue)                                        AS region_revenue,
       SUM(CASE WHEN rn = 1 THEN revenue END)              AS top_product_revenue,
       MAX(CASE WHEN rn = 1 THEN product_id END)           AS top_product_id,
       ROUND(100.0 * SUM(CASE WHEN rn = 1 THEN revenue END)
             / NULLIF(SUM(revenue), 0), 1)                 AS top_product_share_pct
FROM ranked
GROUP BY region
ORDER BY top_product_share_pct DESC;`,
      explanation: 'The CASE condition references rn, a window result, which is why the ranking has to be materialised in a CTE first. A high share is a concentration risk — this single query answers "which regions depend on one product".',
    },
    {
      id: 'p19-q10',
      difficulty: 'hard',
      prompt: 'Rewrite a conditional-aggregation query using the FILTER clause, and explain when you would not.',
      tables: ['orders'],
      think: 'FILTER and CASE produce identical results. What decides which one you write?',
      hint: 'Portability. FILTER is standard SQL but only widely implemented in PostgreSQL and SQLite.',
      approach: `Write the same per-customer status breakdown using FILTER instead of CASE.\nNote that FILTER attaches a WHERE to a single aggregate.\nCompare readability against the CASE form.\nChoose CASE when the query must run on MySQL, SQL Server or Oracle.`,
      solution: `SELECT customer_id,
       COUNT(*)                                        AS total_orders,
       COUNT(*)    FILTER (WHERE status = 'delivered') AS delivered_orders,
       COUNT(*)    FILTER (WHERE status = 'cancelled') AS cancelled_orders,
       SUM(amount) FILTER (WHERE status = 'delivered') AS delivered_revenue,
       AVG(amount) FILTER (WHERE status = 'delivered') AS avg_delivered_amount
FROM orders
GROUP BY customer_id
ORDER BY delivered_revenue DESC NULLS LAST;`,
      explanation: 'FILTER removes the NULL-versus-ELSE trap entirely, since each aggregate simply never sees the non-matching rows — which is why AVG ... FILTER cannot be got wrong the way AVG(CASE ... ELSE 0) can. The trade-off is portability, so write FILTER on PostgreSQL and CASE anywhere the target engine is uncertain.',
      dialect: 'FILTER is PostgreSQL 9.4+ and SQLite 3.30+. MySQL, SQL Server and Oracle require the CASE form.',
    },
  ],
};
