import type { Pattern } from '../types';

export const p16: Pattern = {
  num: 16,
  slug: 'find-missing-records',
  title: 'Find Missing Records',
  concept: 'LEFT JOIN / NOT EXISTS',
  category: 'Joins & Set Logic',
  tagline: 'Anti-join: rows on one side with no counterpart on the other. Three ways to write it, one to avoid.',
  theory: `"Which rows in A have no match in B?" is an anti-join, and SQL gives you three idioms.

**LEFT JOIN ... WHERE b.key IS NULL** — join everything, then keep the rows where the right side came back empty. Universally supported and the one most people reach for.

**NOT EXISTS (correlated subquery)** — the most semantically precise. It stops at the first match, handles NULLs correctly by construction, and most planners turn it into the same anti-join as the LEFT JOIN form.

**NOT IN (subquery)** — the trap. If the subquery returns a single NULL, the whole predicate evaluates to UNKNOWN for every row and the query returns **zero rows**. Because NULL is neither equal nor unequal to anything, "x NOT IN (1, 2, NULL)" can never be true. This is the single most dangerous silent bug in SQL, and interviewers ask about it constantly.

The mechanical rule for the LEFT JOIN form: conditions that filter the *right* table belong in the ON clause, not in WHERE. A right-table condition in WHERE runs after the join and eliminates the NULL-extended rows, turning your LEFT JOIN back into an INNER JOIN.`,
  pitfalls: [
    'NOT IN with a nullable subquery column. One NULL makes the entire result empty, silently.',
    'Putting a right-table filter in WHERE instead of ON, which converts the LEFT JOIN to an inner join.',
    'Testing IS NULL on a right column that is itself nullable — test the join key or a non-nullable column.',
    'Forgetting that a LEFT JOIN can multiply rows if the right side has duplicates, inflating the count before the NULL test.',
    'Reaching for EXCEPT when the two sides have different column lists — EXCEPT compares whole rows.',
  ],
  questions: [
    {
      id: 'p16-q1',
      difficulty: 'easy',
      prompt: 'Find customers who have never placed an order.',
      tables: ['customers', 'orders'],
      think: 'After a LEFT JOIN, what does a NULL on the right-hand side actually mean?',
      hint: 'LEFT JOIN orders, then keep rows where the order key is NULL.',
      approach: `Start from customers so every customer survives.\nLEFT JOIN orders on customer_id.\nRows with no matching order get NULLs in all order columns.\nKeep exactly those rows by testing the order key for NULL.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       c.signup_date
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL
ORDER BY c.signup_date;`,
      explanation: 'Test the join key or the right table\'s primary key for NULL — never a nullable attribute column, which could be NULL on a row that genuinely matched. This is the canonical anti-join and works on every engine.',
    },
    {
      id: 'p16-q2',
      difficulty: 'easy',
      prompt: 'Write the same query with NOT EXISTS.',
      tables: ['customers', 'orders'],
      think: 'What does the SELECT list inside an EXISTS subquery actually affect?',
      hint: 'Nothing — EXISTS only cares whether a row comes back. SELECT 1 is conventional.',
      approach: `Start from customers.\nFor each one, ask whether any order exists with that customer_id.\nKeep customers where the answer is no.\nThe subquery's SELECT list is irrelevant, so use a constant.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       c.signup_date
FROM customers AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM orders AS o
    WHERE o.customer_id = c.customer_id
)
ORDER BY c.signup_date;`,
      explanation: 'NOT EXISTS reads as the English sentence, cannot multiply rows, and short-circuits on the first match. Most planners compile it to exactly the same anti-join as the LEFT JOIN version, so prefer whichever reads better — but know both.',
    },
    {
      id: 'p16-q3',
      difficulty: 'medium',
      prompt: 'Demonstrate why NOT IN is dangerous here, and show the version that is safe.',
      tables: ['customers', 'orders'],
      think: 'If orders.customer_id can be NULL, what does "c.customer_id NOT IN (1, 2, NULL)" evaluate to?',
      hint: 'It evaluates to UNKNOWN, never TRUE — so the query returns nothing at all.',
      approach: `Write the naive NOT IN form to see the hazard.\nNote that a single NULL in the subquery makes every comparison UNKNOWN.\nAdd an IS NOT NULL filter inside the subquery to make it safe.\nPrefer NOT EXISTS, which needs no such guard.`,
      solution: `-- Dangerous: returns ZERO rows if any orders.customer_id is NULL
-- SELECT * FROM customers
-- WHERE customer_id NOT IN (SELECT customer_id FROM orders);

-- Safe version 1: exclude NULLs from the subquery explicitly
SELECT c.customer_id, c.customer_name
FROM customers AS c
WHERE c.customer_id NOT IN (
    SELECT o.customer_id
    FROM orders AS o
    WHERE o.customer_id IS NOT NULL
)
ORDER BY c.customer_id;`,
      explanation: 'NOT IN is shorthand for "<> ALL", and any comparison with NULL yields UNKNOWN, which is not TRUE, so the row is filtered out. Every row fails, the result is empty, and nothing in the output hints at why. NOT EXISTS has no equivalent failure mode because it tests row existence rather than value equality.',
    },
    {
      id: 'p16-q4',
      difficulty: 'medium',
      prompt: 'Find products that have never appeared on any order line.',
      tables: ['products', 'order_items'],
      think: 'Same shape, different tables. Which table goes on the left?',
      hint: 'The table you want rows *from* is the left one — products.',
      approach: `Start from products, the side whose unmatched rows you want.\nCheck whether any order_items row references each product.\nKeep the products where none does.\nReturn the product details for a merchandising review.`,
      solution: `SELECT p.product_id,
       p.product_name,
       p.category,
       p.price
FROM products AS p
WHERE NOT EXISTS (
    SELECT 1
    FROM order_items AS oi
    WHERE oi.product_id = p.product_id
)
ORDER BY p.category, p.product_name;`,
      explanation: 'Deciding which table is "left" is the only real decision in an anti-join: it is always the side whose unmatched rows are the answer. Get that backwards and you get a correct query to a different question.',
    },
    {
      id: 'p16-q5',
      difficulty: 'medium',
      prompt: 'Find customers who have not ordered in the last 90 days, including those who never ordered at all.',
      tables: ['customers', 'orders'],
      think: 'A date restriction on the right table plus an anti-join. Does the date condition belong in ON or in WHERE?',
      hint: 'In the ON clause. In WHERE it would discard the never-ordered customers along with the recent ones.',
      approach: `LEFT JOIN customers to orders, restricting the join to orders in the last 90 days inside the ON clause.\nA customer with no recent order gets NULLs, whether or not they have older orders.\nKeep rows where the joined order key is NULL.\nReturn the customer with their last-ever order date for context.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       (SELECT MAX(o2.order_date)
        FROM orders AS o2
        WHERE o2.customer_id = c.customer_id) AS last_order_ever
FROM customers AS c
LEFT JOIN orders AS o
       ON o.customer_id = c.customer_id
      AND o.order_date >= CURRENT_DATE - INTERVAL '90 days'
WHERE o.order_id IS NULL
ORDER BY last_order_ever NULLS FIRST;`,
      explanation: 'Moving the date test from WHERE to ON is the whole answer. In WHERE, o.order_date >= ... is false for the NULL-extended rows, so every never-ordered customer disappears and the query silently answers "customers whose *only* orders are old".',
      dialect: 'NULLS FIRST is PostgreSQL / Oracle. MySQL sorts NULLs first by default ascending; SQL Server needs an explicit CASE in the ORDER BY.',
    },
    {
      id: 'p16-q6',
      difficulty: 'medium',
      prompt: 'Find departments that have no employees.',
      tables: ['departments', 'employees'],
      think: 'A count-based version is also possible. When is COUNT = 0 equivalent to an anti-join, and when is it slower?',
      hint: 'Both work; the anti-join can stop at the first match while the count must read every row.',
      approach: `Start from departments.\nTest whether any employee references the department.\nKeep the departments where none does.\nReturn the department details.`,
      solution: `SELECT d.dept_id,
       d.dept_name,
       d.location
FROM departments AS d
WHERE NOT EXISTS (
    SELECT 1
    FROM employees AS e
    WHERE e.dept_id = d.dept_id
)
ORDER BY d.dept_name;`,
      explanation: 'The LEFT JOIN + GROUP BY + HAVING COUNT(e.emp_id) = 0 version returns the same rows but must aggregate every employee first. NOT EXISTS can stop at the first match per department, which matters once the child table is large.',
    },
    {
      id: 'p16-q7',
      difficulty: 'hard',
      prompt: 'Find (customer, month) combinations where an active customer placed no orders — gaps in their purchasing history.',
      tables: ['customers', 'orders'],
      think: 'The "missing" rows do not exist anywhere. What has to be generated before they can be found missing?',
      hint: 'Cross join customers against a month spine to build every expected combination, then anti-join the actual orders.',
      approach: `Generate the months spanned by the order history.\nCross join each customer against every month from their first order onwards.\nLEFT JOIN the actual monthly orders onto that expected grid.\nKeep the combinations with no matching order.`,
      solution: `WITH months AS (
    SELECT generate_series(DATE_TRUNC('month', MIN(order_date)),
                           DATE_TRUNC('month', MAX(order_date)),
                           INTERVAL '1 month')::date AS mth
    FROM orders
),
first_order AS (
    SELECT customer_id, DATE_TRUNC('month', MIN(order_date))::date AS started
    FROM orders
    GROUP BY customer_id
),
expected AS (
    SELECT f.customer_id, m.mth
    FROM first_order AS f
    CROSS JOIN months AS m
    WHERE m.mth >= f.started
),
actual AS (
    SELECT customer_id, DATE_TRUNC('month', order_date)::date AS mth
    FROM orders
    GROUP BY customer_id, DATE_TRUNC('month', order_date)
)
SELECT e.customer_id, e.mth AS missing_month
FROM expected AS e
LEFT JOIN actual AS a
       ON a.customer_id = e.customer_id
      AND a.mth         = e.mth
WHERE a.customer_id IS NULL
ORDER BY e.customer_id, e.mth;`,
      explanation: 'You cannot anti-join against rows that were never created, so the expected grid has to be built with a CROSS JOIN first. Restricting the grid to months from each customer\'s first order onwards stops the report accusing customers of gaps before they existed.',
    },
    {
      id: 'p16-q8',
      difficulty: 'hard',
      prompt: 'Find customers in customers_stg that are not present in customers — new arrivals in today\'s load.',
      tables: ['customers', 'customers_stg'],
      think: 'Two tables with the same key. Does this need a join at all, or is there a set operator?',
      hint: 'EXCEPT on the key lists works, and so does NOT EXISTS. Compare their behaviour with duplicates.',
      approach: `Select the business key from the staging table.\nSubtract the set of keys already present in the target.\nNote that EXCEPT also deduplicates, which may or may not be wanted.\nJoin back to staging if the full row is needed.`,
      solution: `SELECT s.*
FROM customers_stg AS s
WHERE NOT EXISTS (
    SELECT 1
    FROM customers AS c
    WHERE c.customer_id = s.customer_id
)
ORDER BY s.customer_id;

-- Set-operator alternative, keys only, and implicitly DISTINCT:
-- SELECT customer_id FROM customers_stg
-- EXCEPT
-- SELECT customer_id FROM customers;`,
      explanation: 'EXCEPT is elegant but returns only the columns you compare and silently deduplicates, so a staging table with two copies of a new customer yields one row. NOT EXISTS keeps the full staging row and preserves duplicates, which is usually what a load process needs to see.',
    },
    {
      id: 'p16-q9',
      difficulty: 'hard',
      prompt: 'Find employees who report to a manager_id that does not exist in the employees table — orphaned references.',
      tables: ['employees'],
      think: 'The anti-join is against the same table. What must you be careful about with the NULL manager_id of the CEO?',
      hint: 'Exclude NULL manager_id explicitly, or the top of the hierarchy is reported as broken.',
      approach: `Consider only employees whose manager_id is populated.\nCheck whether an employee row exists with that emp_id.\nKeep the rows where none does.\nReport the dangling reference for data-quality triage.`,
      solution: `SELECT e.emp_id,
       e.emp_name,
       e.manager_id AS dangling_manager_id
FROM employees AS e
WHERE e.manager_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM employees AS m
      WHERE m.emp_id = e.manager_id
  )
ORDER BY e.emp_id;`,
      explanation: 'A self anti-join is the standard referential-integrity check for a hierarchy that has no enforced foreign key. The IS NOT NULL guard is essential: a NULL manager_id means "no manager by design" (the CEO), not "broken pointer", and lumping the two together makes every report cry wolf.',
    },
    {
      id: 'p16-q10',
      difficulty: 'hard',
      prompt: 'Find products that sold in 2023 but not at all in 2024, and quantify what was lost.',
      tables: ['sales'],
      think: 'The anti-join is between two filtered slices of the same table. Where does the filtering happen relative to the anti-test?',
      hint: 'Aggregate 2023 into one set, then NOT EXISTS against the 2024 rows.',
      approach: `Aggregate 2023 sales to one row per product with its revenue.\nFor each such product, test whether any 2024 sale exists.\nKeep the products with no 2024 activity.\nReturn the lost revenue, biggest first.`,
      solution: `WITH y2023 AS (
    SELECT product_id,
           SUM(amount)   AS revenue_2023,
           SUM(quantity) AS units_2023
    FROM sales
    WHERE sale_date >= DATE '2023-01-01'
      AND sale_date <  DATE '2024-01-01'
    GROUP BY product_id
)
SELECT p.product_name,
       y.revenue_2023,
       y.units_2023
FROM y2023    AS y
JOIN products AS p ON p.product_id = y.product_id
WHERE NOT EXISTS (
    SELECT 1
    FROM sales AS s
    WHERE s.product_id = y.product_id
      AND s.sale_date >= DATE '2024-01-01'
      AND s.sale_date <  DATE '2025-01-01'
)
ORDER BY y.revenue_2023 DESC;`,
      explanation: 'Quantifying the anti-join turns a list into a decision: "47 products dropped out" is noise, "these three took £180k of 2023 revenue with them" gets acted on. Note the half-open date ranges on both sides, which stay correct if sale_date ever gains a time component.',
    },
  ],
};
