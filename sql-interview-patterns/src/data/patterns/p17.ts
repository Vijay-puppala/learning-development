import type { Pattern } from '../types';

export const p17: Pattern = {
  num: 17,
  slug: 'find-matching-records',
  title: 'Find Matching Records',
  concept: 'INNER JOIN',
  category: 'Joins & Set Logic',
  tagline: 'The join everyone thinks is easy — until row multiplication doubles the revenue.',
  theory: `An INNER JOIN returns every *combination* of rows that satisfy the ON condition. That word "combination" is the whole pattern. If one order has three lines, joining orders to order_items returns the order three times — and if you then SUM(orders.amount) you have tripled your revenue. This "fan-out" is the most expensive mistake in analytics SQL because the query runs, the numbers look plausible, and nobody notices for a quarter.

So the discipline is: before writing a join, say the grain of each side out loud, then say the grain of the result. one-to-one keeps the grain. one-to-many takes the many side's grain. many-to-many multiplies, and is almost always a sign of a missing filter or a missing bridge table.

The second thing an inner join does is *filter*. Rows with no match on either side disappear. That is often intended, but it means an inner join can silently drop data — join orders to customers and any order with a bad customer_id vanishes without a trace. When the count changes after a join, find out why before moving on.

NULLs never match, on any side, in any join condition. A NULL key is not equal to another NULL key.`,
  pitfalls: [
    'Aggregating a parent measure after joining to a child table — fan-out double counting.',
    'Assuming an inner join preserves row count. It can both drop and multiply rows.',
    'Joining on a nullable column and silently losing rows where the key is NULL.',
    'Chaining three or more joins without checking the grain at each step.',
    'Using a join where EXISTS was meant: "customers who ordered" via a join returns one row per order unless you add DISTINCT.',
  ],
  questions: [
    {
      id: 'p17-q1',
      difficulty: 'easy',
      prompt: 'List every order with the customer\'s name and city.',
      tables: ['orders', 'customers'],
      think: 'What is the grain of each side, and therefore of the result?',
      hint: 'orders is the many side; customers is one row per key. The result stays at order grain.',
      approach: `Start from orders.\nJoin customers on the customer_id foreign key.\nBecause customer_id is unique in customers, no multiplication occurs.\nReturn the order columns decorated with the customer attributes.`,
      solution: `SELECT o.order_id,
       o.order_date,
       o.amount,
       c.customer_name,
       c.city
FROM orders    AS o
JOIN customers AS c ON c.customer_id = o.customer_id
ORDER BY o.order_date DESC, o.order_id;`,
      explanation: 'Joining a many side to a one side is the safe direction — the result keeps the many side\'s grain. Note that any order whose customer_id has no matching customer silently disappears; comparing COUNT(*) before and after is a cheap sanity check.',
    },
    {
      id: 'p17-q2',
      difficulty: 'easy',
      prompt: 'List every order line with the order date and the product name.',
      tables: ['order_items', 'orders', 'products'],
      think: 'Three tables, two joins. Does the grain change at either step?',
      hint: 'Start from the finest grain — order_items — and decorate outwards.',
      approach: `Start from order_items, which is the finest grain.\nJoin orders to get the header attributes.\nJoin products to get the product attributes.\nBoth joins are many-to-one, so the grain stays at one row per line.`,
      solution: `SELECT oi.order_item_id,
       o.order_id,
       o.order_date,
       p.product_name,
       oi.quantity,
       oi.unit_price,
       oi.quantity * oi.unit_price AS line_total
FROM order_items AS oi
JOIN orders      AS o ON o.order_id   = oi.order_id
JOIN products    AS p ON p.product_id = oi.product_id
ORDER BY o.order_date DESC, oi.order_item_id;`,
      explanation: 'Starting from the finest grain and joining outwards to lookups keeps every step many-to-one, so the row count never changes. Stating that rule before you write the joins is what stops fan-out bugs before they happen.',
    },
    {
      id: 'p17-q3',
      difficulty: 'medium',
      prompt: 'Compute total revenue per customer, and explain why joining through order_items would give the wrong answer.',
      tables: ['orders', 'customers', 'order_items'],
      think: 'orders.amount lives at order grain. What happens to it if the query is at line grain?',
      hint: 'Aggregate the parent measure at parent grain, or use the child measure. Never mix.',
      approach: `Join orders to customers, staying at order grain.\nGroup by customer and sum the order amount.\nDo not join order_items — that would repeat each order amount once per line.\nIf line-level detail is needed, aggregate order_items separately first.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       COUNT(*)          AS order_count,
       SUM(o.amount)     AS total_revenue
FROM customers AS c
JOIN orders    AS o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.customer_name
ORDER BY total_revenue DESC;

-- WRONG: joining order_items repeats o.amount once per line
-- SELECT c.customer_id, SUM(o.amount)
-- FROM customers c JOIN orders o ON ... JOIN order_items oi ON ...`,
      explanation: 'The commented-out query is the bug this pattern exists to teach: an order with four lines contributes its amount four times, and the revenue figure is inflated by a factor that varies per customer. If you need both header and line measures, aggregate each at its own grain in separate CTEs and join the two summaries.',
    },
    {
      id: 'p17-q4',
      difficulty: 'medium',
      prompt: 'Return both header revenue and line-level units per customer in one result, without double counting either.',
      tables: ['orders', 'order_items', 'customers'],
      think: 'Two measures at two grains. What has to happen before they can share a row?',
      hint: 'Aggregate each to customer grain independently, then join the two summaries.',
      approach: `In one CTE, aggregate orders to revenue and order count per customer.\nIn a second CTE, aggregate order_items (joined to orders for the customer) to units per customer.\nBoth CTEs are now at customer grain, so joining them is one-to-one.\nJoin them to customers and return both measures.`,
      solution: `WITH order_side AS (
    SELECT customer_id,
           COUNT(*)      AS order_count,
           SUM(amount)   AS revenue
    FROM orders
    GROUP BY customer_id
),
line_side AS (
    SELECT o.customer_id,
           SUM(oi.quantity)                  AS units,
           COUNT(DISTINCT oi.product_id)     AS distinct_products
    FROM order_items AS oi
    JOIN orders      AS o ON o.order_id = oi.order_id
    GROUP BY o.customer_id
)
SELECT c.customer_name,
       os.order_count,
       os.revenue,
       ls.units,
       ls.distinct_products
FROM customers  AS c
JOIN order_side AS os ON os.customer_id = c.customer_id
LEFT JOIN line_side AS ls ON ls.customer_id = c.customer_id
ORDER BY os.revenue DESC;`,
      explanation: '"Aggregate first, join second" is the general cure for multi-grain reporting: each CTE reduces to the common grain before anything is joined, so no measure can be repeated. The LEFT JOIN on the line side protects against orders that have no lines recorded.',
    },
    {
      id: 'p17-q5',
      difficulty: 'medium',
      prompt: 'Find customers who have ordered at least one product from the "Electronics" category.',
      tables: ['customers', 'orders', 'order_items', 'products'],
      think: 'A join through four tables returns one row per matching line. What does the question actually want one row of?',
      hint: 'Either DISTINCT on the customer, or EXISTS — and EXISTS avoids materialising the fan-out at all.',
      approach: `Start from customers.\nTest whether a chain of orders, lines and products exists reaching an Electronics product.\nKeep customers where it does.\nUse EXISTS so the result stays at customer grain with no deduplication needed.`,
      solution: `SELECT c.customer_id,
       c.customer_name
FROM customers AS c
WHERE EXISTS (
    SELECT 1
    FROM orders      AS o
    JOIN order_items AS oi ON oi.order_id   = o.order_id
    JOIN products    AS p  ON p.product_id  = oi.product_id
    WHERE o.customer_id = c.customer_id
      AND p.category    = 'Electronics'
)
ORDER BY c.customer_name;`,
      explanation: 'The four-table join plus SELECT DISTINCT returns the same rows, but it builds every matching combination and then throws most of them away. EXISTS stops at the first match per customer, which is both faster and a clearer statement of intent.',
    },
    {
      id: 'p17-q6',
      difficulty: 'medium',
      prompt: 'Join employees to departments and show how many rows are lost when an employee has a NULL dept_id.',
      tables: ['employees', 'departments'],
      think: 'NULL never equals anything, including another NULL. What does an inner join do with those rows?',
      hint: 'Compare the inner join count against the base table count.',
      approach: `Count the employees in the base table.\nCount the rows returned by the inner join to departments.\nCount the employees whose dept_id is NULL or points nowhere.\nReturn all three so the discrepancy is explicit.`,
      solution: `SELECT (SELECT COUNT(*) FROM employees)                       AS employees_total,
       (SELECT COUNT(*)
        FROM employees AS e
        JOIN departments AS d ON d.dept_id = e.dept_id)        AS joined_rows,
       (SELECT COUNT(*) FROM employees WHERE dept_id IS NULL)  AS null_dept_id,
       (SELECT COUNT(*)
        FROM employees AS e
        WHERE e.dept_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM departments AS d
                          WHERE d.dept_id = e.dept_id))        AS orphan_dept_id;`,
      explanation: 'Employees with a NULL dept_id are dropped by the inner join even though nothing is wrong with them, and employees pointing at a deleted department are dropped for a different reason entirely. Separating the two counts turns "rows went missing" into an actionable data-quality report.',
    },
    {
      id: 'p17-q7',
      difficulty: 'hard',
      prompt: 'Find pairs of customers in the same city who both signed up in the same month, without listing each pair twice.',
      tables: ['customers'],
      think: 'A self-join produces every ordered pair, including a row joined to itself. How do you reduce that to unordered pairs?',
      hint: 'Use a strict inequality on the key instead of <>, which keeps only one direction of each pair.',
      approach: `Join customers to itself on city and signup month.\nExclude the self-pair and one direction of each pair with a strict less-than on the id.\nReturn both customers and the shared attributes.\nOrder for readability.`,
      solution: `SELECT a.customer_id   AS customer_a,
       a.customer_name AS name_a,
       b.customer_id   AS customer_b,
       b.customer_name AS name_b,
       a.city,
       DATE_TRUNC('month', a.signup_date)::date AS signup_month
FROM customers AS a
JOIN customers AS b
  ON  b.city = a.city
  AND DATE_TRUNC('month', b.signup_date) = DATE_TRUNC('month', a.signup_date)
  AND b.customer_id > a.customer_id
ORDER BY a.city, signup_month, a.customer_id;`,
      explanation: 'b.customer_id > a.customer_id does two jobs at once: it removes the self-match (an id is never greater than itself) and keeps exactly one of the two orderings of each pair. Using <> instead would return every pair twice, which is the classic self-join error.',
    },
    {
      id: 'p17-q8',
      difficulty: 'hard',
      prompt: 'For each order, list the products bought, as a single comma-separated string, with one row per order.',
      tables: ['orders', 'order_items', 'products'],
      think: 'The join fans out to line grain. What brings it back to order grain without losing the detail?',
      hint: 'Aggregate the fanned-out rows back with a string aggregate, grouped by the order.',
      approach: `Join orders to order_items to products, accepting the fan-out to line grain.\nGroup by the order to collapse back to order grain.\nAggregate the product names into one ordered string.\nCarry the order-level measures through the GROUP BY unchanged.`,
      solution: `SELECT o.order_id,
       o.order_date,
       o.amount,
       COUNT(*)                                       AS line_count,
       STRING_AGG(p.product_name, ', ' ORDER BY p.product_name) AS products,
       SUM(oi.quantity * oi.unit_price)               AS line_total
FROM orders      AS o
JOIN order_items AS oi ON oi.order_id  = o.order_id
JOIN products    AS p  ON p.product_id = oi.product_id
GROUP BY o.order_id, o.order_date, o.amount
ORDER BY o.order_date DESC;`,
      explanation: 'Grouping by the order key collapses the fan-out, so o.amount appears once and is not multiplied. Returning line_total beside o.amount is a free reconciliation check — if they disagree, the header and lines are out of sync.',
      dialect: 'STRING_AGG is PostgreSQL / SQL Server 2017+. MySQL: GROUP_CONCAT. Oracle: LISTAGG(p.product_name, \', \') WITHIN GROUP (ORDER BY p.product_name).',
    },
    {
      id: 'p17-q9',
      difficulty: 'hard',
      prompt: 'Find products that are frequently bought together: pairs appearing on the same order, with a count of how often.',
      tables: ['order_items', 'products'],
      think: 'This is a self-join at line grain within the same order. What condition prevents a product pairing with itself and with duplicate pairs?',
      hint: 'Join order_items to itself on order_id with a strict less-than on product_id.',
      approach: `Join order_items to itself on the same order_id.\nRequire the second product's id to be strictly greater, removing self-pairs and mirrored duplicates.\nGroup by the product pair and count the distinct orders.\nJoin to products for names and sort by frequency.`,
      solution: `WITH pairs AS (
    SELECT a.product_id AS product_a,
           b.product_id AS product_b,
           a.order_id
    FROM order_items AS a
    JOIN order_items AS b
      ON  b.order_id   = a.order_id
      AND b.product_id > a.product_id
)
SELECT pa.product_name AS product_a,
       pb.product_name AS product_b,
       COUNT(DISTINCT pairs.order_id) AS orders_together
FROM pairs
JOIN products AS pa ON pa.product_id = pairs.product_a
JOIN products AS pb ON pb.product_id = pairs.product_b
GROUP BY pa.product_name, pb.product_name
HAVING COUNT(DISTINCT pairs.order_id) >= 2
ORDER BY orders_together DESC
LIMIT 20;`,
      explanation: 'This is market-basket analysis in one query, and the > condition is what makes each pair appear once rather than twice. COUNT(DISTINCT order_id) rather than COUNT(*) guards against an order that lists the same product on two lines, which would otherwise inflate the affinity.',
    },
    {
      id: 'p17-q10',
      difficulty: 'hard',
      prompt: 'Attach each sale to the product price that was in effect on the sale date, given price history rows with a valid_from and valid_to.',
      tables: ['sales', 'customer_dim'],
      think: 'The join condition is a range containment rather than an equality. What has to be true of the ranges for exactly one row to match?',
      hint: 'Join on the key plus a BETWEEN on the date. The ranges must be non-overlapping or the sale matches twice.',
      approach: `Build the price history as ranges, closing each row with the next row's start.\nJoin each sale to the history on the product key.\nAdd a range condition so the sale date falls inside the validity window.\nVerify that exactly one history row matches each sale.`,
      solution: `WITH price_history AS (
    SELECT customer_id                AS entity_id,
           city                       AS attribute,
           start_date                 AS valid_from,
           COALESCE(LEAD(start_date) OVER (PARTITION BY customer_id ORDER BY start_date),
                    DATE '9999-12-31') AS valid_to
    FROM customer_dim
)
SELECT s.sale_id,
       s.sale_date,
       h.attribute AS value_in_effect,
       h.valid_from,
       h.valid_to
FROM sales AS s
JOIN price_history AS h
  ON  h.entity_id  = s.product_id
  AND s.sale_date >= h.valid_from
  AND s.sale_date <  h.valid_to
ORDER BY s.sale_id;`,
      explanation: 'A range join is still an inner join — the ON clause simply contains an inequality. Using half-open ranges (>= from, < to) is what guarantees exactly one match per sale: with inclusive BETWEEN on both ends, a sale on a boundary date matches two history rows and silently duplicates.',
    },
  ],
};
