import type { Pattern } from '../types';

export const p03: Pattern = {
  num: 3,
  slug: 'top-n-per-group',
  title: 'Top N Per Group',
  concept: 'ROW_NUMBER() OVER()',
  category: 'Ranking & Top-N',
  tagline: 'The single most-asked SQL interview shape: number rows inside each partition, then filter.',
  theory: `"Top 3 products per category", "latest order per customer", "highest-paid employee per department" — all the same query. LIMIT cannot help, because LIMIT applies once to the whole result, not once per group.

The tool is a window function. PARTITION BY restarts the numbering for each group; ORDER BY inside the OVER clause decides what "top" means within that group; ROW_NUMBER() hands out 1, 2, 3… with no gaps and no ties. Filtering on that number gives you N rows per group, exactly.

The one structural rule to internalise: window functions are computed *after* WHERE and *before* ORDER BY, so you can never filter on a window result in the same SELECT. Wrap it in a CTE or subquery. Engines with QUALIFY (Snowflake, BigQuery, Databricks, DuckDB) let you skip the wrapper, but the CTE form is what to write in an interview unless you know the stack.

Pick your numbering function deliberately: ROW_NUMBER gives exactly N rows and arbitrarily breaks ties; RANK gives N-or-more rows and skips numbers after a tie; DENSE_RANK gives "top N distinct values".`,
  pitfalls: [
    'Filtering on the window alias in the same SELECT — WHERE rn <= 3 next to the ROW_NUMBER() definition is an error everywhere.',
    'Omitting ORDER BY inside OVER(). The numbering becomes non-deterministic and the "top" row is whatever the engine felt like.',
    'Using ROW_NUMBER when the requirement says "including ties" — that is RANK, and the difference is exactly what the interviewer is testing.',
    'Partitioning by the wrong grain: PARTITION BY category when the ask was per category *per month* quietly answers a different question.',
    'Reaching for a correlated subquery with a nested LIMIT instead. It works but re-scans per group and will be picked apart on performance.',
  ],
  questions: [
    {
      id: 'p03-q1',
      difficulty: 'easy',
      prompt: 'Return the highest-paid employee in each department.',
      tables: ['employees'],
      think: 'What restarts per department — the filter, or the numbering? And what makes one row "the highest" inside a department?',
      hint: 'PARTITION BY dept_id restarts the count; ORDER BY salary DESC decides who gets number 1.',
      approach: `Number the employees within each department, ordered by salary descending.\nPut that numbering in a CTE so it becomes a filterable column.\nKeep only the rows numbered 1.\nReturn the department and the employee.`,
      solution: `WITH ranked AS (
    SELECT emp_id,
           emp_name,
           dept_id,
           salary,
           ROW_NUMBER() OVER (PARTITION BY dept_id
                              ORDER BY salary DESC, emp_id) AS rn
    FROM employees
)
SELECT dept_id, emp_id, emp_name, salary
FROM ranked
WHERE rn = 1
ORDER BY dept_id;`,
      explanation: 'PARTITION BY is the "per group" and ORDER BY inside OVER is the "top". The emp_id tiebreaker guarantees one deterministic winner — ROW_NUMBER always returns exactly one row per department, even when salaries tie.',
    },
    {
      id: 'p03-q2',
      difficulty: 'easy',
      prompt: 'Return the 3 most expensive products in each category.',
      tables: ['products'],
      think: 'Nothing changes structurally from "top 1" except one number. Which number, and where?',
      hint: 'Same query as top-1, with the final filter loosened to rn <= 3.',
      approach: `Number products within each category, ordered by price descending.\nWrap the numbering in a CTE.\nKeep rows numbered 1 through 3.\nOrder the output by category, then by rank.`,
      solution: `WITH ranked AS (
    SELECT product_id,
           product_name,
           category,
           price,
           ROW_NUMBER() OVER (PARTITION BY category
                              ORDER BY price DESC, product_id) AS rn
    FROM products
)
SELECT category, rn, product_id, product_name, price
FROM ranked
WHERE rn <= 3
ORDER BY category, rn;`,
      explanation: 'Top-1 and top-N are the same query. Returning rn in the output is worth doing — it makes the result self-explanatory and shows the interviewer you know what the window produced.',
    },
    {
      id: 'p03-q3',
      difficulty: 'medium',
      prompt: 'Return each customer\'s most recent order, including customers whose latest order is a cancelled one.',
      tables: ['orders'],
      think: '"Most recent" is a descending date sort inside the partition. What breaks a tie when a customer placed two orders on the same day?',
      hint: 'Partition by customer_id, order by order_date descending with order_id descending as the tiebreaker.',
      approach: `Number each customer's orders from newest to oldest.\nUse order_id descending as the within-day tiebreaker.\nKeep the rows numbered 1.\nReturn the order details plus the customer.`,
      solution: `WITH latest AS (
    SELECT order_id,
           customer_id,
           order_date,
           status,
           amount,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date DESC, order_id DESC) AS rn
    FROM orders
)
SELECT customer_id, order_id, order_date, status, amount
FROM latest
WHERE rn = 1
ORDER BY customer_id;`,
      explanation: 'This is pattern 30 ("latest record per group") — the same machinery with a date as the ordering key. Because the ask explicitly includes cancelled orders, there is deliberately no status filter; adding one would change which order is "latest".',
    },
    {
      id: 'p03-q4',
      difficulty: 'medium',
      prompt: 'Return the top 2 customers by total spend within each country.',
      tables: ['orders', 'customers'],
      think: 'The thing being ranked is an aggregate that does not exist yet. Which happens first — the grouping or the windowing?',
      hint: 'Aggregate to customer grain in one CTE, then window over that result in a second step.',
      approach: `First CTE: join orders to customers, group to one row per customer, and sum the spend, carrying the country along.\nSecond CTE: number customers within each country by that summed spend descending.\nKeep the rows numbered 1 and 2.\nOrder by country then rank.`,
      solution: `WITH spend AS (
    SELECT c.customer_id,
           c.customer_name,
           c.country,
           SUM(o.amount) AS total_spend
    FROM customers AS c
    JOIN orders    AS o ON o.customer_id = c.customer_id
    GROUP BY c.customer_id, c.customer_name, c.country
),
ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY country
                              ORDER BY total_spend DESC, customer_id) AS rn
    FROM spend
)
SELECT country, rn, customer_name, total_spend
FROM ranked
WHERE rn <= 2
ORDER BY country, rn;`,
      explanation: 'Aggregate first, window second. A window function can be applied on top of a GROUP BY in the same SELECT, but splitting into two CTEs makes the grain change explicit and is far easier to debug and to explain on a whiteboard.',
    },
    {
      id: 'p03-q5',
      difficulty: 'medium',
      prompt: 'For every product, return its single best-selling region by total quantity sold.',
      tables: ['sales', 'products'],
      think: 'The partition is the product and the ranked measure is a sum per region. What is the grain going into the window?',
      hint: 'Aggregate to (product, region) grain first — then the window partitions by product and orders by that sum.',
      approach: `Sum quantity grouped by product_id and region.\nNumber the regions within each product by that summed quantity descending.\nKeep number 1 per product.\nJoin to products for the name.`,
      solution: `WITH by_region AS (
    SELECT product_id,
           region,
           SUM(quantity) AS units
    FROM sales
    GROUP BY product_id, region
),
ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY product_id
                              ORDER BY units DESC, region) AS rn
    FROM by_region
)
SELECT p.product_name, r.region AS best_region, r.units
FROM ranked   AS r
JOIN products AS p ON p.product_id = r.product_id
WHERE r.rn = 1
ORDER BY r.units DESC;`,
      explanation: 'Ordering the tiebreak by region name rather than leaving it undefined keeps the result stable across runs. The join to products happens last, after the result is already down to one row per product, which keeps it cheap.',
    },
    {
      id: 'p03-q6',
      difficulty: 'medium',
      prompt: 'Return the top 3 products by revenue in each month of 2024.',
      tables: ['sales'],
      think: 'The partition is now two things at once. Does that need two window functions, or one with a wider PARTITION BY?',
      hint: 'PARTITION BY takes a list. Truncate the date to a month and partition by that.',
      approach: `Reduce each sale date to the first day of its month and sum the amount per (month, product).\nNumber products within each month by revenue descending.\nKeep the top 3 per month.\nOrder by month then rank.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', sale_date) AS sale_month,
           product_id,
           SUM(amount)                    AS revenue
    FROM sales
    WHERE sale_date >= DATE '2024-01-01'
      AND sale_date <  DATE '2025-01-01'
    GROUP BY DATE_TRUNC('month', sale_date), product_id
),
ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY sale_month
                              ORDER BY revenue DESC, product_id) AS rn
    FROM monthly
)
SELECT sale_month, rn, product_id, revenue
FROM ranked
WHERE rn <= 3
ORDER BY sale_month, rn;`,
      explanation: 'A composite partition is just a longer PARTITION BY list. Note the half-open date range (>= Jan 1, < Jan 1 next year) rather than BETWEEN — it is index-friendly and correct even if sale_date ever becomes a timestamp.',
      dialect: 'DATE_TRUNC is PostgreSQL. MySQL: DATE_FORMAT(sale_date, \'%Y-%m-01\'). SQL Server: DATEFROMPARTS(YEAR(sale_date), MONTH(sale_date), 1).',
    },
    {
      id: 'p03-q7',
      difficulty: 'hard',
      prompt: 'Return the top 3 salaries per department *including ties*, so a department with four employees on the same top salary returns all four.',
      tables: ['employees'],
      think: 'ROW_NUMBER returns exactly 3 rows per partition. "Including ties" is about distinct salary values. Which function do you need?',
      hint: 'DENSE_RANK gives equal salaries the same number and does not skip, so <= 3 means "the three highest distinct salaries".',
      approach: `Rank employees within each department by salary descending using a function that assigns equal salaries the same rank.\nDo not skip numbers after a tie, so that "3" still means the third-highest distinct salary.\nKeep ranks 1 through 3.\nOrder by department then rank.`,
      solution: `WITH ranked AS (
    SELECT emp_id,
           emp_name,
           dept_id,
           salary,
           DENSE_RANK() OVER (PARTITION BY dept_id
                              ORDER BY salary DESC) AS salary_rank
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id, salary_rank, emp_id, emp_name, salary
FROM ranked
WHERE salary_rank <= 3
ORDER BY dept_id, salary_rank, emp_id;`,
      explanation: 'The three functions answer three different questions: ROW_NUMBER = "exactly 3 rows", RANK = "rows in the top 3 positions, ties skip numbers", DENSE_RANK = "rows at the top 3 distinct salaries". Saying that distinction out loud is usually the point of the question.',
    },
    {
      id: 'p03-q8',
      difficulty: 'hard',
      prompt: 'Return each department\'s top earner, but include departments that currently have no employees, showing NULL for the employee.',
      tables: ['employees', 'departments'],
      think: 'The window only sees rows that exist. If a department has no employees, no row is ever numbered. Where must that department come from?',
      hint: 'Rank first over employees, then LEFT JOIN from departments to the rank-1 rows.',
      approach: `Number employees within each department by salary descending.\nKeep only the rank-1 rows — one per department that has staff.\nLEFT JOIN from departments onto that result so empty departments survive with NULLs.\nOrder by department name.`,
      solution: `WITH top_earner AS (
    SELECT dept_id, emp_id, emp_name, salary,
           ROW_NUMBER() OVER (PARTITION BY dept_id
                              ORDER BY salary DESC, emp_id) AS rn
    FROM employees
)
SELECT d.dept_id,
       d.dept_name,
       t.emp_name AS top_earner,
       t.salary
FROM departments AS d
LEFT JOIN top_earner AS t
       ON t.dept_id = d.dept_id
      AND t.rn = 1
ORDER BY d.dept_name;`,
      explanation: 'The rn = 1 condition belongs in the ON clause, not in WHERE. In WHERE it would discard the NULL-extended rows produced by the LEFT JOIN and silently turn the query back into an inner join — the single most common LEFT JOIN bug there is.',
    },
    {
      id: 'p03-q9',
      difficulty: 'hard',
      prompt: 'For each customer, return their first and last order in a single row: first_order_date, first_amount, last_order_date, last_amount.',
      tables: ['orders'],
      think: 'You need two different "top 1"s per partition, side by side. Can one pass of numbering give you both ends?',
      hint: 'Number ascending and descending at the same time, then keep rows that are first in either direction and pivot with conditional aggregation.',
      approach: `Number each customer's orders oldest-first and, in a second window, newest-first.\nKeep rows that are number 1 in either direction — that is at most two rows per customer.\nCollapse to one row per customer using conditional aggregation: pick the value when the ascending number is 1 for "first", when the descending number is 1 for "last".\nReturn one row per customer.`,
      solution: `WITH numbered AS (
    SELECT customer_id,
           order_date,
           amount,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date,      order_id)      AS rn_asc,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date DESC, order_id DESC) AS rn_desc
    FROM orders
)
SELECT customer_id,
       MAX(CASE WHEN rn_asc  = 1 THEN order_date END) AS first_order_date,
       MAX(CASE WHEN rn_asc  = 1 THEN amount     END) AS first_amount,
       MAX(CASE WHEN rn_desc = 1 THEN order_date END) AS last_order_date,
       MAX(CASE WHEN rn_desc = 1 THEN amount     END) AS last_amount
FROM numbered
WHERE rn_asc = 1 OR rn_desc = 1
GROUP BY customer_id
ORDER BY customer_id;`,
      explanation: 'Two windows over the same partition cost one sort each but avoid scanning the table twice. The MAX(CASE WHEN ...) trick collapses the two surviving rows into one — every other row is NULL inside the CASE and MAX ignores NULLs. A customer with a single order is handled correctly: that one row is number 1 in both directions.',
    },
    {
      id: 'p03-q10',
      difficulty: 'hard',
      prompt: 'Return the top 2 products by revenue per category, and alongside each one show what share of its category\'s total revenue it represents.',
      tables: ['order_items', 'products'],
      think: 'You need a per-row rank and a per-partition total at the same time. Do both have to come from the same window frame?',
      hint: 'Two window functions over the same PARTITION BY: one ranks, one sums the whole partition. The SUM has no ORDER BY, so it covers the entire partition.',
      approach: `Aggregate order lines to revenue per product, keeping the category.\nOver a partition of category, number products by revenue descending.\nOver the same partition, sum revenue across all products — with no ORDER BY the frame is the whole partition.\nKeep the top 2 per category and divide the product revenue by the partition total.`,
      solution: `WITH product_rev AS (
    SELECT p.category,
           p.product_id,
           p.product_name,
           SUM(oi.quantity * oi.unit_price) AS revenue
    FROM order_items AS oi
    JOIN products    AS p ON p.product_id = oi.product_id
    GROUP BY p.category, p.product_id, p.product_name
),
ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY category
                              ORDER BY revenue DESC, product_id) AS rn,
           SUM(revenue) OVER (PARTITION BY category)             AS category_revenue
    FROM product_rev
)
SELECT category,
       rn,
       product_name,
       revenue,
       ROUND(100.0 * revenue / NULLIF(category_revenue, 0), 2) AS pct_of_category
FROM ranked
WHERE rn <= 2
ORDER BY category, rn;`,
      explanation: 'A window SUM with PARTITION BY and no ORDER BY spans the whole partition, which is how you get a group total next to row-level detail without a self-join. Crucially the total is computed before the rn <= 2 filter, so the percentages are shares of the real category total, not of the two rows you kept. NULLIF guards the division.',
    },
  ],
};
