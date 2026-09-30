import type { Pattern } from '../types';

export const p02: Pattern = {
  num: 2,
  slug: 'top-n-records',
  title: 'Top N Records',
  concept: 'ORDER BY, LIMIT',
  category: 'Ranking & Top-N',
  tagline: 'Sort, cut. The interest is entirely in ties, NULLs and what "top" means.',
  theory: `Top-N over a whole table is the simplest pattern on this list and the one people most often get subtly wrong. ORDER BY decides the sequence, LIMIT decides how much of it you keep, and the engine can often stop early — this is a cheap query when an index covers the sort column.

Two things make it interesting. First, ties: LIMIT 3 returns three rows even if four employees share the top salary, and *which* three is undefined unless your ORDER BY is deterministic. Always add a tiebreaker column (usually the primary key) when the answer must be reproducible. If the requirement is "everyone tied for the top three salaries", LIMIT is the wrong tool and you want a ranking function (patterns 4–5).

Second, NULLs. PostgreSQL sorts NULLs last ascending and first descending; MySQL and SQL Server do the opposite. "Top 5 by amount" with NULL amounts returns different rows on different engines unless you say NULLS LAST explicitly or filter them out.`,
  pitfalls: [
    'No tiebreaker in ORDER BY. The same query returns different rows on different runs, and an interviewer will ask "are you sure?".',
    'Assuming LIMIT handles ties. It never does — it cuts at exactly N rows. "Top N including ties" is RANK() <= N.',
    'Forgetting NULL ordering. NULLs can occupy your entire top N on engines that sort them first.',
    'Using LIMIT with a dialect that does not have it. SQL Server uses TOP or OFFSET/FETCH; Oracle uses FETCH FIRST n ROWS ONLY.',
    'Applying LIMIT before a join or aggregate when you meant to apply it after — the limit must sit on the final result grain.',
  ],
  questions: [
    {
      id: 'p02-q1',
      difficulty: 'easy',
      prompt: 'Return the 5 highest-paid employees with their name and salary.',
      tables: ['employees'],
      think: 'If two people earn the same salary, which one appears — and would you get the same answer if you ran the query again tomorrow?',
      hint: 'Sort descending on salary, then cut. Add a second sort column so the result is reproducible.',
      approach: `Sort employees by salary from high to low.\nAdd emp_id as a tiebreaker so equal salaries have a defined order.\nKeep the first 5 rows.\nReturn name and salary.`,
      solution: `SELECT emp_name, salary
FROM employees
ORDER BY salary DESC, emp_id
LIMIT 5;`,
      explanation: 'The ORDER BY does the work; LIMIT only truncates. The emp_id tiebreaker makes the query deterministic — without it the engine may return any of the tied rows and the result can change between runs.',
      dialect: 'SQL Server: SELECT TOP 5 ... ORDER BY. Oracle / standard SQL: ... ORDER BY salary DESC FETCH FIRST 5 ROWS ONLY.',
    },
    {
      id: 'p02-q2',
      difficulty: 'easy',
      prompt: 'Return the 10 most recent orders — order_id, order_date and amount.',
      tables: ['orders'],
      think: '"Most recent" is a descending sort on a date. What breaks the tie when several orders land on the same day?',
      hint: 'Sort order_date descending; the surrogate key usually carries the within-day sequence.',
      approach: `Sort orders by order_date descending so the newest is first.\nBreak same-day ties with order_id descending, since a higher id was inserted later.\nKeep the first 10 rows.\nReturn the three requested columns.`,
      solution: `SELECT order_id, order_date, amount
FROM orders
ORDER BY order_date DESC, order_id DESC
LIMIT 10;`,
      explanation: 'When the sort column has day granularity but the data has finer granularity, the surrogate key is the natural secondary sort — it preserves insertion order at no extra cost.',
    },
    {
      id: 'p02-q3',
      difficulty: 'easy',
      prompt: 'Return the 3 cheapest products, but exclude any product with a NULL price.',
      tables: ['products'],
      think: 'Where do NULL prices land in an ascending sort on your engine — and can you afford to guess?',
      hint: 'Filter NULLs out explicitly rather than relying on the engine default ordering.',
      approach: `Restrict to rows where price is known.\nSort ascending on price so the cheapest is first.\nTiebreak on product_id.\nKeep the first 3.`,
      solution: `SELECT product_id, product_name, price
FROM products
WHERE price IS NOT NULL
ORDER BY price ASC, product_id
LIMIT 3;`,
      explanation: 'Stating the NULL handling in WHERE makes the query portable: it returns the same three rows on PostgreSQL, MySQL and SQL Server, none of which agree on default NULL ordering.',
    },
    {
      id: 'p02-q4',
      difficulty: 'medium',
      prompt: 'Return rows 11 to 20 of the employee list ordered by salary descending — the second page of a 10-per-page table.',
      tables: ['employees'],
      think: 'Pagination is Top-N with a starting point. What must be true of the sort for page 2 not to repeat a row from page 1?',
      hint: 'OFFSET skips rows before LIMIT takes them. The sort must be total — a unique tiebreaker is mandatory, not optional.',
      approach: `Sort employees by salary descending with emp_id as a unique tiebreaker.\nSkip the first 10 rows.\nTake the next 10.\nReturn name and salary.`,
      solution: `SELECT emp_name, salary
FROM employees
ORDER BY salary DESC, emp_id
LIMIT 10 OFFSET 10;`,
      explanation: 'Without a unique tiebreaker, tied rows can be ordered differently between the page-1 and page-2 executions, so a row can appear twice or vanish. Deep OFFSET is also slow — the engine still reads and discards every skipped row, which is why real systems switch to keyset pagination (WHERE salary < :last_salary) at scale.',
      dialect: 'SQL Server / Oracle: ORDER BY salary DESC OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY.',
    },
    {
      id: 'p02-q5',
      difficulty: 'medium',
      prompt: 'Return the top 5 customers by total lifetime order amount.',
      tables: ['orders', 'customers'],
      think: 'The thing you are ranking does not exist in any table — it has to be computed first. At what grain does the LIMIT apply?',
      hint: 'Aggregate to one row per customer, and only then sort and cut. LIMIT applies to the grouped result, not to orders.',
      approach: `Join orders to customers so you can return a name.\nGroup to one row per customer.\nSum the order amounts within each group.\nSort by that sum descending and keep the first 5.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       SUM(o.amount) AS lifetime_value
FROM customers AS c
JOIN orders    AS o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.customer_name
ORDER BY lifetime_value DESC, c.customer_id
LIMIT 5;`,
      explanation: 'Logical order of evaluation matters: FROM/JOIN, then GROUP BY, then the aggregate, then ORDER BY, then LIMIT. Because LIMIT runs last, it correctly cuts the customer-grain result rather than the order-grain one.',
    },
    {
      id: 'p02-q6',
      difficulty: 'medium',
      prompt: 'Return the top 3 salaries — the *values*, not the people. If four employees share the highest salary, that is still one value.',
      tables: ['employees'],
      think: 'The grain of the answer is a salary, not an employee. What removes the row-per-person duplication before the cut?',
      hint: 'DISTINCT collapses repeated salaries; the LIMIT then counts distinct values.',
      approach: `Take the salary column only.\nDeduplicate it so each distinct amount appears once.\nSort descending.\nKeep the first 3 values.`,
      solution: `SELECT DISTINCT salary
FROM employees
WHERE salary IS NOT NULL
ORDER BY salary DESC
LIMIT 3;`,
      explanation: 'Changing the grain from "people" to "values" is exactly what DISTINCT does here, and it is why no tiebreaker is needed — the sort key is already unique after deduplication. This is also the simplest correct answer to "3rd highest salary" (pattern 13) when duplicates exist.',
    },
    {
      id: 'p02-q7',
      difficulty: 'medium',
      prompt: 'Return the top 5 products by revenue, where revenue is quantity × unit_price summed across all order lines.',
      tables: ['order_items', 'products'],
      think: 'Revenue is a derived measure at line grain that must be summed at product grain. Can the multiplication happen inside the SUM?',
      hint: 'SUM(quantity * unit_price) aggregates the per-line product — SUM(quantity) * SUM(unit_price) is a different and wrong number.',
      approach: `Join order_items to products to get names.\nGroup to one row per product.\nSum the per-line revenue: quantity multiplied by unit_price, inside the SUM.\nSort by revenue descending and take 5.`,
      solution: `SELECT p.product_id,
       p.product_name,
       SUM(oi.quantity * oi.unit_price) AS revenue
FROM order_items AS oi
JOIN products    AS p ON p.product_id = oi.product_id
GROUP BY p.product_id, p.product_name
ORDER BY revenue DESC, p.product_id
LIMIT 5;`,
      explanation: 'SUM(a * b) and SUM(a) * SUM(b) are only equal by accident. Doing the arithmetic at the row grain and aggregating the result is the general rule for any "price times quantity" measure.',
    },
    {
      id: 'p02-q8',
      difficulty: 'hard',
      prompt: 'Return the top 5 employees by salary *including ties* — if the 5th and 6th place salaries are equal, return both.',
      tables: ['employees'],
      think: 'LIMIT cuts at a row count. "Including ties" is a statement about values. Which tool counts values rather than rows?',
      hint: 'Rank the rows so tied salaries share a rank, then filter on the rank instead of using LIMIT.',
      approach: `Assign each employee a rank by salary descending, giving tied salaries the same rank.\nDo this in a CTE so the rank is available to a WHERE clause.\nKeep every row whose rank is 5 or less.\nOrder the output by salary descending.`,
      solution: `WITH ranked AS (
    SELECT emp_id,
           emp_name,
           salary,
           RANK() OVER (ORDER BY salary DESC) AS salary_rank
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT emp_id, emp_name, salary, salary_rank
FROM ranked
WHERE salary_rank <= 5
ORDER BY salary_rank, emp_id;`,
      explanation: 'This is the dividing line between pattern 2 and pattern 4: LIMIT is row-count semantics, RANK() <= N is value semantics. The CTE is required because window functions are evaluated after WHERE, so you cannot filter on salary_rank in the same SELECT.',
      dialect: 'SQL Server offers SELECT TOP 5 WITH TIES ... ORDER BY salary DESC as a shorthand; Snowflake and Databricks offer QUALIFY salary_rank <= 5, removing the CTE.',
    },
    {
      id: 'p02-q9',
      difficulty: 'hard',
      prompt: 'Return the top 10% of employees by salary, rounded to the nearest whole employee, without hard-coding a row count.',
      tables: ['employees'],
      think: 'N is not known until you have counted the table. Which window function buckets rows into equal-sized slices?',
      hint: 'NTILE(10) splits the ordered rows into ten buckets; bucket 1 is the top decile. PERCENT_RANK is the alternative.',
      approach: `Order employees by salary descending and split them into 10 equal buckets.\nKeep bucket number 1 — that is the top 10%.\nDo the bucketing in a CTE so it can be filtered.\nReturn name, salary and the bucket for transparency.`,
      solution: `WITH deciles AS (
    SELECT emp_id,
           emp_name,
           salary,
           NTILE(10) OVER (ORDER BY salary DESC) AS decile
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT emp_id, emp_name, salary
FROM deciles
WHERE decile = 1
ORDER BY salary DESC, emp_id;`,
      explanation: 'NTILE makes the cut proportional to table size, so the query keeps working as the company grows. It distributes remainder rows into the earliest buckets, so with 23 employees the top decile gets 3 rows, not 2.3 — and unlike PERCENT_RANK it ignores ties, which is the trade-off to mention out loud.',
    },
    {
      id: 'p02-q10',
      difficulty: 'hard',
      prompt: 'Return the 5 most recent orders for customer 42 using keyset pagination rather than OFFSET, given the previous page ended at order_date 2024-03-01 with order_id 9100.',
      tables: ['orders'],
      think: 'OFFSET makes the engine read and throw away every skipped row. What could you put in WHERE so the index seeks straight to the right place?',
      hint: 'Express "strictly older than the last row I saw" as a comparison on the composite sort key (order_date, order_id).',
      approach: `Filter to the customer.\nAdd a condition meaning "comes after the last row of the previous page" in the same order as the sort: an earlier date, or the same date with a smaller id.\nSort by the same composite key descending.\nTake 5 rows.`,
      solution: `SELECT order_id, order_date, amount
FROM orders
WHERE customer_id = 42
  AND (order_date, order_id) < (DATE '2024-03-01', 9100)
ORDER BY order_date DESC, order_id DESC
LIMIT 5;`,
      explanation: 'The row-value comparison (a, b) < (x, y) expresses the composite cursor in one predicate, so an index on (customer_id, order_date, order_id) can seek directly to the page. Cost stays constant no matter how deep you page, and rows cannot be skipped or repeated when new orders arrive mid-scroll — both real failings of OFFSET.',
      dialect: 'Row-value comparison is PostgreSQL / MySQL / standard SQL. SQL Server needs it expanded: (order_date < @d) OR (order_date = @d AND order_id < @id).',
    },
  ],
};
