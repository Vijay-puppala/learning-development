import type { Pattern } from '../types';

export const p21: Pattern = {
  num: 21,
  slug: 'customers-without-orders',
  title: 'Customers Without Orders',
  concept: 'LEFT JOIN + IS NULL',
  category: 'Joins & Set Logic',
  tagline: 'The named case of the anti-join — and the one where ON versus WHERE decides the answer.',
  theory: `This is pattern 16 with a business label, and it is asked so often it earns its own slot. The mechanics: LEFT JOIN keeps every customer, the unmatched ones get NULLs in all order columns, and WHERE o.order_id IS NULL keeps exactly those.

The lesson that makes it worth its own pattern is the ON-versus-WHERE rule, because this is where candidates most often demonstrate they have memorised a snippet rather than understood a join.

- A condition in **ON** decides *which rows count as a match*. Non-matching left rows still survive, NULL-extended.
- A condition in **WHERE** runs *after* the join and filters the combined result — including the NULL-extended rows.

So "customers with no orders in 2024" needs the year in ON. Put it in WHERE and every NULL-extended row fails the test, the LEFT JOIN degenerates into an INNER JOIN, and you have silently answered "orders not placed in 2024" instead.

The related trap is counting. COUNT(*) on a LEFT JOIN counts the NULL-extended row as 1; COUNT(o.order_id) counts it as 0. For "how many orders does each customer have", only the second is right.`,
  pitfalls: [
    'Filtering the right table in WHERE, which turns the LEFT JOIN into an inner join and drops the very rows you wanted.',
    'COUNT(*) instead of COUNT(right_table.key), giving every order-less customer a count of 1.',
    'Testing IS NULL on a nullable attribute rather than on the join key.',
    'Using NOT IN against a nullable column — zero rows, no error.',
    'Forgetting the right side can duplicate, inflating counts before the NULL test.',
  ],
  questions: [
    {
      id: 'p21-q1',
      difficulty: 'easy',
      prompt: 'List customers who have never placed an order, newest signups first.',
      tables: ['customers', 'orders'],
      think: 'Which column do you test for NULL, and why does the choice of column matter?',
      hint: 'Test the right table\'s primary key — it can only be NULL when no row matched.',
      approach: `Start from customers so all of them survive.\nLEFT JOIN orders on the customer key.\nKeep rows where the order primary key is NULL.\nOrder by signup date descending.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       c.email,
       c.signup_date
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL
ORDER BY c.signup_date DESC;`,
      explanation: 'order_id is the orders table\'s primary key, so it is never NULL in a real row — a NULL there can only mean the join found nothing. Testing a nullable column such as o.amount would wrongly include customers whose orders happen to have a NULL amount.',
    },
    {
      id: 'p21-q2',
      difficulty: 'easy',
      prompt: 'Show every customer with their order count, including zeros.',
      tables: ['customers', 'orders'],
      think: 'COUNT(*) and COUNT(o.order_id) differ on exactly one kind of row. Which one, and by how much?',
      hint: 'COUNT(*) counts the NULL-extended row; COUNT(column) ignores NULLs.',
      approach: `LEFT JOIN customers to orders.\nGroup by the customer.\nCount the order key rather than the rows, so unmatched customers score zero.\nReturn both counts to make the difference visible.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       COUNT(o.order_id) AS order_count,
       COUNT(*)          AS rows_returned,
       COALESCE(SUM(o.amount), 0) AS total_spend
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.customer_name
ORDER BY order_count, c.customer_name;`,
      explanation: 'For a customer with no orders, order_count is 0 and rows_returned is 1 — the NULL-extended row still exists as a row. That one-row difference is the most common silent bug in "count per group including zeros" queries.',
    },
    {
      id: 'p21-q3',
      difficulty: 'medium',
      prompt: 'Find customers with no orders in 2024, including those who have never ordered at all.',
      tables: ['customers', 'orders'],
      think: 'Where does the year condition go, and what happens to never-ordered customers in each case?',
      hint: 'In ON. In WHERE, the NULL-extended rows fail the date test and disappear.',
      approach: `LEFT JOIN customers to orders, restricting the match to 2024 orders inside the ON clause.\nCustomers with only older orders, and customers with none at all, both get NULLs.\nKeep those rows by testing the order key for NULL.\nShow their most recent order date for context.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       (SELECT MAX(o2.order_date) FROM orders AS o2
        WHERE o2.customer_id = c.customer_id) AS last_order_ever
FROM customers AS c
LEFT JOIN orders AS o
       ON o.customer_id = c.customer_id
      AND o.order_date >= DATE '2024-01-01'
      AND o.order_date <  DATE '2025-01-01'
WHERE o.order_id IS NULL
ORDER BY last_order_ever DESC NULLS LAST;`,
      explanation: 'Move those two date conditions into WHERE and the result becomes empty or nonsensical, because the NULL-extended rows cannot satisfy a comparison on a NULL date. This is the single most testable fact about outer joins.',
    },
    {
      id: 'p21-q4',
      difficulty: 'medium',
      prompt: 'Show what the query returns when the date filter is wrongly placed in WHERE, and explain the result.',
      tables: ['customers', 'orders'],
      think: 'Predict the row count before running it. Is it more or fewer rows than the correct version?',
      hint: 'The NULL-extended rows are eliminated, so you get an inner join plus an impossible predicate.',
      approach: `Write the LEFT JOIN with the date condition in WHERE rather than ON.\nObserve that o.order_date is NULL for unmatched rows, so the comparison is UNKNOWN.\nCombined with o.order_id IS NULL, no row can satisfy both.\nConclude that the result is always empty.`,
      solution: `-- WRONG: always returns zero rows
SELECT c.customer_id, c.customer_name
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
WHERE o.order_date >= DATE '2024-01-01'   -- kills NULL-extended rows
  AND o.order_id IS NULL;                 -- only NULL-extended rows qualify

-- RIGHT: the date test belongs in ON
SELECT c.customer_id, c.customer_name
FROM customers AS c
LEFT JOIN orders AS o
       ON o.customer_id = c.customer_id
      AND o.order_date >= DATE '2024-01-01'
WHERE o.order_id IS NULL;`,
      explanation: 'The two WHERE conditions are mutually exclusive: the first requires a matched row, the second requires an unmatched one. Being able to reason to "this must return zero rows" without executing it is what the question is really testing.',
    },
    {
      id: 'p21-q5',
      difficulty: 'medium',
      prompt: 'Find customers who signed up more than 30 days ago and still have not ordered.',
      tables: ['customers', 'orders'],
      think: 'Two filters on two different tables. Which one goes in WHERE and which in ON?',
      hint: 'A filter on the *left* table is safe in WHERE; only right-table filters must move to ON.',
      approach: `LEFT JOIN customers to orders on the key.\nKeep rows where no order matched.\nAdd a WHERE condition on the customer's signup date — this is a left-table filter, so WHERE is correct.\nReturn how long they have been dormant.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       c.signup_date,
       CURRENT_DATE - c.signup_date AS days_since_signup
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL
  AND c.signup_date < CURRENT_DATE - INTERVAL '30 days'
ORDER BY days_since_signup DESC;`,
      explanation: 'The rule is about which side the filtered column belongs to, not about the keyword: left-table conditions in WHERE are fine because those rows always exist. Only conditions on the outer-joined side need to move into ON.',
    },
    {
      id: 'p21-q6',
      difficulty: 'medium',
      prompt: 'Find customers whose only orders were cancelled — they have orders, but no successful one.',
      tables: ['customers', 'orders'],
      think: 'Two conditions of opposite sign. Can a single LEFT JOIN express both?',
      hint: 'A LEFT JOIN restricted to non-cancelled orders in ON, plus an EXISTS for "has some order".',
      approach: `LEFT JOIN customers to orders, matching only non-cancelled orders in the ON clause.\nKeep rows where that join found nothing.\nAdd an EXISTS requiring at least one order of any status.\nReturn the cancelled count.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       (SELECT COUNT(*) FROM orders AS o2
        WHERE o2.customer_id = c.customer_id) AS cancelled_orders
FROM customers AS c
LEFT JOIN orders AS o
       ON o.customer_id = c.customer_id
      AND o.status <> 'cancelled'
WHERE o.order_id IS NULL
  AND EXISTS (SELECT 1 FROM orders AS o3 WHERE o3.customer_id = c.customer_id)
ORDER BY cancelled_orders DESC;`,
      explanation: 'Restricting the ON clause makes the LEFT JOIN answer "no *successful* order", and the EXISTS separates that population from customers who never ordered at all. These are different remediation cases — one needs a payments investigation, the other a marketing email.',
    },
    {
      id: 'p21-q7',
      difficulty: 'hard',
      prompt: 'Find customers with no orders, and show the query plan difference between the LEFT JOIN and NOT EXISTS forms.',
      tables: ['customers', 'orders'],
      think: 'Two syntaxes, usually one plan. When do they actually diverge?',
      hint: 'Both typically become an anti-join. They diverge when the right side can produce duplicates or when statistics are poor.',
      approach: `Write both forms of the query.\nRun EXPLAIN on each.\nCompare the join node each planner chooses.\nNote that a hash anti-join for both is the expected outcome on a modern optimiser.`,
      solution: `EXPLAIN ANALYZE
SELECT c.customer_id
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL;

EXPLAIN ANALYZE
SELECT c.customer_id
FROM customers AS c
WHERE NOT EXISTS (SELECT 1 FROM orders AS o WHERE o.customer_id = c.customer_id);`,
      explanation: 'PostgreSQL typically plans both as "Hash Anti Join", so the choice is about readability rather than speed. The LEFT JOIN form does materialise all matches before discarding them on some older optimisers, which is the argument for making NOT EXISTS your default.',
    },
    {
      id: 'p21-q8',
      difficulty: 'hard',
      prompt: 'List every customer with their order count, but make sure a customer with duplicate rows in a joined lookup table is not counted twice.',
      tables: ['customers', 'orders'],
      think: 'A LEFT JOIN to a non-unique right side multiplies rows. What does that do to a COUNT, and how do you defend against it?',
      hint: 'Either aggregate the right side to one row per key before joining, or count distinct keys.',
      approach: `Aggregate orders to one row per customer in a CTE, so the right side is guaranteed unique.\nLEFT JOIN that summary to customers.\nCoalesce the missing counts to zero.\nNote that this shape is immune to fan-out by construction.`,
      solution: `WITH order_summary AS (
    SELECT customer_id,
           COUNT(*)    AS order_count,
           SUM(amount) AS total_spend
    FROM orders
    GROUP BY customer_id
)
SELECT c.customer_id,
       c.customer_name,
       COALESCE(os.order_count, 0) AS order_count,
       COALESCE(os.total_spend, 0) AS total_spend
FROM customers AS c
LEFT JOIN order_summary AS os ON os.customer_id = c.customer_id
ORDER BY total_spend DESC;`,
      explanation: '"Aggregate before you join" guarantees the right side is one row per key, which removes fan-out as a possibility rather than compensating for it with COUNT(DISTINCT). It also keeps the query correct when a second summary CTE is added later, which the DISTINCT approach does not.',
    },
    {
      id: 'p21-q9',
      difficulty: 'hard',
      prompt: 'Find customers who placed their first order but never a second one, and how long ago that single order was.',
      tables: ['customers', 'orders'],
      think: 'This is "exactly one" rather than "none". Which aggregate expresses it, and where does the filter go?',
      hint: 'GROUP BY with HAVING COUNT(*) = 1, or a window count filtered to 1.',
      approach: `Aggregate orders to one row per customer with a count and the order date.\nKeep customers whose count is exactly one.\nJoin back to customers for the name.\nReport how long ago that order was.`,
      solution: `WITH per_customer AS (
    SELECT customer_id,
           COUNT(*)        AS order_count,
           MIN(order_date) AS only_order_date,
           SUM(amount)     AS only_order_amount
    FROM orders
    WHERE status <> 'cancelled'
    GROUP BY customer_id
    HAVING COUNT(*) = 1
)
SELECT c.customer_id,
       c.customer_name,
       pc.only_order_date,
       pc.only_order_amount,
       CURRENT_DATE - pc.only_order_date AS days_since
FROM per_customer AS pc
JOIN customers    AS c ON c.customer_id = pc.customer_id
ORDER BY days_since DESC;`,
      explanation: 'One-and-done customers are a distinct business problem from never-ordered ones: acquisition worked and retention failed. HAVING COUNT(*) = 1 is the filter, and MIN(order_date) safely returns that single order\'s date because there is only one row in the group.',
    },
    {
      id: 'p21-q10',
      difficulty: 'hard',
      prompt: 'Produce a single summary row: how many customers have never ordered, ordered once, and ordered more than once.',
      tables: ['customers', 'orders'],
      think: 'Three mutually exclusive buckets over the same population. What shape gets them onto one row?',
      hint: 'Aggregate to a per-customer count first, then conditionally count the buckets.',
      approach: `LEFT JOIN customers to orders and aggregate to one row per customer with an order count.\nIn an outer query, conditionally count how many customers fall into each bucket.\nDivide each by the total for percentages.\nReturn one summary row.`,
      solution: `WITH per_customer AS (
    SELECT c.customer_id,
           COUNT(o.order_id) AS order_count
    FROM customers AS c
    LEFT JOIN orders AS o ON o.customer_id = c.customer_id
    GROUP BY c.customer_id
)
SELECT COUNT(*)                                         AS customers_total,
       COUNT(*) FILTER (WHERE order_count = 0)          AS never_ordered,
       COUNT(*) FILTER (WHERE order_count = 1)          AS ordered_once,
       COUNT(*) FILTER (WHERE order_count > 1)          AS repeat_customers,
       ROUND(100.0 * COUNT(*) FILTER (WHERE order_count > 1)
             / NULLIF(COUNT(*), 0), 1)                  AS repeat_rate_pct
FROM per_customer;`,
      explanation: 'COUNT(o.order_id) inside the CTE is what makes the zero bucket possible — COUNT(*) would give every customer at least 1 and the never_ordered column would always read zero. Reducing to per-customer grain first is what lets the three buckets be mutually exclusive.',
      dialect: 'FILTER is PostgreSQL / SQLite. Elsewhere: COUNT(CASE WHEN order_count = 0 THEN 1 END).',
    },
  ],
};
