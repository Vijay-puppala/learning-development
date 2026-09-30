import type { Pattern } from '../types';

export const p11: Pattern = {
  num: 11,
  slug: 'first-value-in-group',
  title: 'First Value in Group',
  concept: 'FIRST_VALUE() OVER()',
  category: 'Window Functions',
  tagline: 'Broadcast the group leader onto every row, so each row can be compared to it.',
  theory: `FIRST_VALUE(expr) OVER (PARTITION BY g ORDER BY o) returns expr from the first row of the window frame. Unlike a GROUP BY, it keeps every row — so the group's leading value sits next to each member, ready to be subtracted, divided or compared.

The default frame catches people out. With ORDER BY and no explicit frame, the frame is UNBOUNDED PRECEDING to CURRENT ROW — which happens to be harmless for FIRST_VALUE, because the first row of that frame is always the first row of the partition. (It is *not* harmless for LAST_VALUE; see pattern 12.)

Typical uses: "what was this customer's first order amount", "what did this product cost when it launched", "who is the top earner in this department" as a column rather than a filter. The alternative — ROW_NUMBER + self-join, or a correlated subquery — works but costs an extra pass and reads worse.

A close cousin is NTH_VALUE(expr, n), which reaches into position n of the frame and does need an explicit frame to be useful.`,
  pitfalls: [
    'Assuming the ordering is obvious. FIRST_VALUE with a non-deterministic ORDER BY returns an arbitrary row from the ties.',
    'Confusing "first" (ordering) with "minimum" (value). FIRST_VALUE ordered by date gives the earliest row, not the smallest amount.',
    'Forgetting PARTITION BY and broadcasting the global first row to everything.',
    'Using NTH_VALUE with the default frame and getting NULL on early rows, because position n is not in the frame yet.',
    'Reaching for it when a MIN() OVER would be simpler — MIN ignores ordering and is often what you actually meant.',
  ],
  questions: [
    {
      id: 'p11-q1',
      difficulty: 'easy',
      prompt: 'For every order, show the amount of that customer\'s very first order.',
      tables: ['orders'],
      think: 'Every row needs the same value for a given customer. What is doing the broadcasting — the partition, or the frame?',
      hint: 'FIRST_VALUE(amount) partitioned by customer, ordered by order_date ascending.',
      approach: `Partition by customer_id so each customer has their own window.\nOrder by order_date ascending so the first row is the earliest order.\nFIRST_VALUE reads the amount from that first row.\nEvery row of the partition receives the same value.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       amount,
       FIRST_VALUE(amount) OVER (PARTITION BY customer_id
                                 ORDER BY order_date, order_id) AS first_order_amount
FROM orders
ORDER BY customer_id, order_date;`,
      explanation: 'The value is constant within a partition even though the default frame grows row by row, because the first row of any frame starting at UNBOUNDED PRECEDING is the partition\'s first row. That is the whole reason FIRST_VALUE is safe with the default frame and LAST_VALUE is not.',
    },
    {
      id: 'p11-q2',
      difficulty: 'easy',
      prompt: 'Show each employee next to the name of the highest-paid person in their department.',
      tables: ['employees'],
      think: '"Highest paid" becomes "first" once you choose the right ordering. Which one?',
      hint: 'ORDER BY salary DESC makes the top earner the first row of the partition.',
      approach: `Partition by dept_id.\nOrder by salary descending inside the window, so the best-paid employee is first.\nFIRST_VALUE reads their name.\nEvery employee in the department gets that name on their row.`,
      solution: `SELECT emp_name,
       dept_id,
       salary,
       FIRST_VALUE(emp_name) OVER (PARTITION BY dept_id
                                   ORDER BY salary DESC, emp_id) AS dept_top_earner,
       FIRST_VALUE(salary)   OVER (PARTITION BY dept_id
                                   ORDER BY salary DESC, emp_id) AS dept_top_salary
FROM employees
WHERE salary IS NOT NULL
ORDER BY dept_id, salary DESC;`,
      explanation: '"First" is entirely determined by the window ORDER BY, so sorting descending turns FIRST_VALUE into a "max row" picker that also lets you fetch *other columns* from that row — something MAX() cannot do.',
    },
    {
      id: 'p11-q3',
      difficulty: 'medium',
      prompt: 'Show each order alongside the customer\'s first order amount and the growth since then, as a percentage.',
      tables: ['orders'],
      think: 'Once the baseline is on every row, what is left is arithmetic. Where must the division be guarded?',
      hint: 'Compute FIRST_VALUE in a CTE so the alias can be used in the arithmetic.',
      approach: `Broadcast the first order amount onto every row with FIRST_VALUE in a CTE.\nIn the outer query subtract the baseline from the current amount.\nDivide by the baseline, guarding a zero denominator.\nReturn the percentage.`,
      solution: `WITH based AS (
    SELECT customer_id, order_id, order_date, amount,
           FIRST_VALUE(amount) OVER (PARTITION BY customer_id
                                     ORDER BY order_date, order_id) AS baseline
    FROM orders
)
SELECT customer_id,
       order_date,
       baseline,
       amount,
       ROUND(100.0 * (amount - baseline) / NULLIF(baseline, 0), 2) AS pct_vs_first
FROM based
ORDER BY customer_id, order_date;`,
      explanation: 'Indexing every row to a fixed baseline is the standard way to build a "growth since start" chart. The CTE is needed only because SQL will not let you reference a SELECT alias in the same SELECT list — the window itself is fine in one pass.',
    },
    {
      id: 'p11-q4',
      difficulty: 'medium',
      prompt: 'For each product, show the price it was first sold at and the price of every sale since.',
      tables: ['sales', 'products'],
      think: 'The sales table records an amount and a quantity rather than a price. What must be computed before the window can broadcast it?',
      hint: 'Derive the unit price per sale first, then FIRST_VALUE over it ordered by date.',
      approach: `Compute an implied unit price per sale by dividing amount by quantity, guarding zero.\nPartition by product and order by sale_date.\nFIRST_VALUE that unit price to get the launch price.\nCompare each sale's price to the launch price.`,
      solution: `WITH priced AS (
    SELECT product_id,
           sale_date,
           amount / NULLIF(quantity, 0) AS unit_price
    FROM sales
),
based AS (
    SELECT product_id, sale_date, unit_price,
           FIRST_VALUE(unit_price) OVER (PARTITION BY product_id
                                         ORDER BY sale_date) AS launch_price
    FROM priced
)
SELECT p.product_name,
       b.sale_date,
       ROUND(CAST(b.unit_price AS numeric), 2)   AS unit_price,
       ROUND(CAST(b.launch_price AS numeric), 2) AS launch_price,
       ROUND(CAST(b.unit_price - b.launch_price AS numeric), 2) AS drift
FROM based    AS b
JOIN products AS p ON p.product_id = b.product_id
ORDER BY p.product_name, b.sale_date;`,
      explanation: 'Derive first, window second: the window can only broadcast something that already exists as a column. Stacking CTEs in the order "compute, then window, then decorate with joins" keeps each step independently checkable.',
    },
    {
      id: 'p11-q5',
      difficulty: 'medium',
      prompt: 'Show each customer\'s first city of record from customer_dim next to their current one.',
      tables: ['customer_dim'],
      think: 'First and last of the same partition. Which one needs a frame adjustment and which does not?',
      hint: 'FIRST_VALUE is safe with the default frame; LAST_VALUE needs the frame widened to the whole partition.',
      approach: `Partition by customer_id and order by start_date.\nFIRST_VALUE gives the earliest recorded city with no frame change.\nFor the latest, widen the frame to the entire partition explicitly.\nReturn both and flag whether the customer moved.`,
      solution: `SELECT DISTINCT
       customer_id,
       FIRST_VALUE(city) OVER (PARTITION BY customer_id ORDER BY start_date) AS first_city,
       LAST_VALUE(city)  OVER (PARTITION BY customer_id ORDER BY start_date
                               ROWS BETWEEN UNBOUNDED PRECEDING
                                        AND UNBOUNDED FOLLOWING) AS latest_city
FROM customer_dim
ORDER BY customer_id;`,
      explanation: 'The explicit UNBOUNDED FOLLOWING on LAST_VALUE is mandatory — without it the frame ends at the current row and LAST_VALUE returns the current row\'s own value. DISTINCT collapses the repeated per-row output to one row per customer.',
    },
    {
      id: 'p11-q6',
      difficulty: 'medium',
      prompt: 'Return the second-highest-paid employee\'s salary per department as a column on every employee row.',
      tables: ['employees'],
      think: 'FIRST_VALUE reaches position 1. What reaches position 2, and what does it need that FIRST_VALUE does not?',
      hint: 'NTH_VALUE(salary, 2) with the frame widened to the whole partition.',
      approach: `Partition by dept_id and order by salary descending.\nUse NTH_VALUE with n = 2 to reach the second row.\nWiden the frame to the entire partition so position 2 is always inside it.\nReturn it next to each employee's own salary.`,
      solution: `SELECT emp_name,
       dept_id,
       salary,
       NTH_VALUE(salary, 2) OVER (PARTITION BY dept_id
                                  ORDER BY salary DESC, emp_id
                                  ROWS BETWEEN UNBOUNDED PRECEDING
                                           AND UNBOUNDED FOLLOWING) AS second_highest
FROM employees
WHERE salary IS NOT NULL
ORDER BY dept_id, salary DESC;`,
      explanation: 'With the default frame, the first row of a partition cannot see position 2 yet and NTH_VALUE returns NULL there. Widening the frame is what makes the value constant across the partition, which is almost always what "the second highest in this department" means.',
      dialect: 'NTH_VALUE is PostgreSQL / Oracle / MySQL 8 / Snowflake. SQL Server has no NTH_VALUE — use a DENSE_RANK CTE and join, or MAX(CASE WHEN rnk = 2 THEN salary END) OVER (PARTITION BY dept_id).',
    },
    {
      id: 'p11-q7',
      difficulty: 'hard',
      prompt: 'For each customer, show the product they bought on their very first order.',
      tables: ['orders', 'order_items', 'products'],
      think: 'The "first" is determined at order grain but the value you want lives at line grain. Which grain does the window run over?',
      hint: 'Join to line level first, then FIRST_VALUE over the joined rows ordered by order date.',
      approach: `Join orders to order_items to products so each row is one product on one order.\nPartition by customer and order by order_date, then order_id, then product_id for determinism.\nFIRST_VALUE the product name to broadcast the first-ever purchased product.\nCollapse to one row per customer.`,
      solution: `WITH lines AS (
    SELECT o.customer_id,
           o.order_id,
           o.order_date,
           p.product_id,
           p.product_name
    FROM orders      AS o
    JOIN order_items AS oi ON oi.order_id = o.order_id
    JOIN products    AS p  ON p.product_id = oi.product_id
)
SELECT DISTINCT
       customer_id,
       FIRST_VALUE(product_name) OVER (PARTITION BY customer_id
                                       ORDER BY order_date, order_id, product_id)
         AS first_product_bought
FROM lines
ORDER BY customer_id;`,
      explanation: 'An order with several lines has no single "first product", so the tiebreaker on product_id is what makes the answer deterministic rather than arbitrary — worth stating, because the honest alternative is to return all lines of the first order.',
    },
    {
      id: 'p11-q8',
      difficulty: 'hard',
      prompt: 'For each region, show every month\'s revenue indexed to 100 at the first month in the series.',
      tables: ['sales'],
      think: 'An index is a ratio against a fixed baseline. Which row supplies the baseline, and does it vary per region?',
      hint: 'FIRST_VALUE of the monthly revenue, partitioned by region and ordered by month.',
      approach: `Aggregate sales to revenue per region per month.\nPartition by region and order by month.\nFIRST_VALUE the revenue to capture each region's starting level.\nDivide every month by that level and multiply by 100.`,
      solution: `WITH monthly AS (
    SELECT region,
           DATE_TRUNC('month', sale_date) AS mth,
           SUM(amount)                    AS revenue
    FROM sales
    GROUP BY region, DATE_TRUNC('month', sale_date)
),
based AS (
    SELECT *,
           FIRST_VALUE(revenue) OVER (PARTITION BY region ORDER BY mth) AS base_revenue
    FROM monthly
)
SELECT region,
       mth,
       revenue,
       ROUND(100.0 * revenue / NULLIF(base_revenue, 0), 1) AS index_vs_start
FROM based
ORDER BY region, mth;`,
      explanation: 'Indexing to 100 makes regions of wildly different size comparable on one chart — a small region growing 40% and a large one growing 5% become visually honest. The baseline is per region because PARTITION BY says so; remove it and every region is indexed to whichever region sorted first.',
    },
    {
      id: 'p11-q9',
      difficulty: 'hard',
      prompt: 'For each customer, find how many days elapsed between their first order and every subsequent order, and bucket those into 0-30, 31-90 and 90+ days.',
      tables: ['orders'],
      think: 'The baseline is a date rather than a number. Does that change how you broadcast it?',
      hint: 'FIRST_VALUE(order_date), then subtract, then CASE the result into buckets.',
      approach: `Partition by customer and order chronologically.\nFIRST_VALUE the order_date to get the acquisition date on every row.\nSubtract to get days since acquisition.\nBucket the result with a CASE expression, and exclude the first order itself.`,
      solution: `WITH cohorted AS (
    SELECT customer_id, order_id, order_date, amount,
           FIRST_VALUE(order_date) OVER (PARTITION BY customer_id
                                         ORDER BY order_date, order_id) AS first_order_date
    FROM orders
)
SELECT customer_id,
       order_date,
       first_order_date,
       order_date - first_order_date AS days_since_first,
       CASE WHEN order_date - first_order_date <= 30 THEN '0-30'
            WHEN order_date - first_order_date <= 90 THEN '31-90'
            ELSE '90+'
       END AS age_bucket,
       amount
FROM cohorted
WHERE order_date > first_order_date
ORDER BY customer_id, order_date;`,
      explanation: 'FIRST_VALUE turns each customer\'s acquisition date into a per-row column, which is precisely the join key a cohort analysis needs. The WHERE at the end removes the baseline order itself — note it runs after the window, so it cannot corrupt the baseline it is filtering against.',
    },
    {
      id: 'p11-q10',
      difficulty: 'hard',
      prompt: 'For each department, return the name of the earliest hire and the latest hire, plus how many years separate them — one row per department.',
      tables: ['employees'],
      think: 'You want two named rows per group. Could MIN and MAX have given you the names, or only the dates?',
      hint: 'FIRST_VALUE and LAST_VALUE fetch arbitrary columns from the boundary rows, which MIN/MAX cannot.',
      approach: `Partition by department and order by hire_date.\nFIRST_VALUE the name and date of the earliest hire.\nLAST_VALUE the name and date of the latest hire, with the frame widened to the whole partition.\nCollapse to one row per department and compute the span.`,
      solution: `WITH bounds AS (
    SELECT DISTINCT
           dept_id,
           FIRST_VALUE(emp_name)  OVER w AS earliest_hire,
           FIRST_VALUE(hire_date) OVER w AS earliest_date,
           LAST_VALUE(emp_name)   OVER w AS latest_hire,
           LAST_VALUE(hire_date)  OVER w AS latest_date
    FROM employees
    WINDOW w AS (PARTITION BY dept_id ORDER BY hire_date, emp_id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
)
SELECT dept_id,
       earliest_hire, earliest_date,
       latest_hire,   latest_date,
       ROUND((latest_date - earliest_date) / 365.25, 1) AS years_span
FROM bounds
ORDER BY years_span DESC;`,
      explanation: 'MIN(hire_date) tells you when, never who — fetching a *companion column* from the extreme row is exactly what FIRST_VALUE and LAST_VALUE are for. Defining the frame once in a named WINDOW clause keeps four window calls in sync, which is where copy-paste errors usually creep in.',
    },
  ],
};
