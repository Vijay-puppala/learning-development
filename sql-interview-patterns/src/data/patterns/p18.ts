import type { Pattern } from '../types';

export const p18: Pattern = {
  num: 18,
  slug: 'find-non-matching-records',
  title: 'Find Non-Matching Records',
  concept: 'LEFT JOIN / NOT EXISTS',
  category: 'Joins & Set Logic',
  tagline: 'Anti-join in both directions, plus the harder "matched on key but not on condition" case.',
  theory: `Pattern 16 found rows in A with no row in B. This pattern widens it to the cases interviewers use to separate people: non-matching in *both* directions at once, and non-matching on a *condition* rather than on existence.

Both directions at once is a FULL OUTER JOIN with a WHERE that keeps rows NULL on either side — that is pattern 26, and it is the right tool when you need a single reconciliation report rather than two queries.

The harder case is "matched on key but failed a condition". "Customers who have orders but none in 2024" is not an anti-join on customers-to-orders; it is an anti-join on customers to *a filtered slice* of orders, intersected with customers who do have orders. The filter has to live inside the NOT EXISTS subquery (or the ON clause), never in the outer WHERE.

And the universal guard rail: NOT IN with a nullable column returns nothing at all. If you take one habit from patterns 16 and 18, make it "reach for NOT EXISTS by default".`,
  pitfalls: [
    'Putting the condition in the outer WHERE instead of inside the NOT EXISTS, which changes the question entirely.',
    'NOT IN over a nullable subquery column — silently returns zero rows.',
    'Assuming "no match" and "no match satisfying X" are the same anti-join.',
    'Using a LEFT JOIN with a right-side filter in WHERE, which quietly demotes it to an inner join.',
    'Forgetting that a LEFT JOIN with a duplicating right side inflates counts before you test for NULL.',
  ],
  questions: [
    {
      id: 'p18-q1',
      difficulty: 'easy',
      prompt: 'Find employees who are not assigned to any department that exists in the departments table.',
      tables: ['employees', 'departments'],
      think: 'Two different causes produce "no department". Should they be reported together or separately?',
      hint: 'A NULL dept_id and a dangling dept_id are different problems; the query can return both with a label.',
      approach: `LEFT JOIN employees to departments.\nKeep rows where the department key came back NULL.\nDistinguish employees whose dept_id was NULL from those whose dept_id points nowhere.\nReturn a reason column.`,
      solution: `SELECT e.emp_id,
       e.emp_name,
       e.dept_id,
       CASE WHEN e.dept_id IS NULL THEN 'unassigned'
            ELSE 'orphaned reference' END AS reason
FROM employees AS e
LEFT JOIN departments AS d ON d.dept_id = e.dept_id
WHERE d.dept_id IS NULL
ORDER BY reason, e.emp_id;`,
      explanation: 'Both causes produce a NULL on the right side of the join, but they need different fixes — one is a business gap, the other is a referential-integrity bug. Labelling them in the output turns one query into a triage list.',
    },
    {
      id: 'p18-q2',
      difficulty: 'easy',
      prompt: 'Find orders whose customer_id does not exist in the customers table.',
      tables: ['orders', 'customers'],
      think: 'This is the anti-join run in the other direction. Which table is the left one now?',
      hint: 'The side whose unmatched rows you want — orders.',
      approach: `Start from orders.\nCheck whether a customer exists with that customer_id.\nKeep the orders where none does.\nReturn the order and the dangling key.`,
      solution: `SELECT o.order_id,
       o.order_date,
       o.amount,
       o.customer_id AS missing_customer_id
FROM orders AS o
WHERE NOT EXISTS (
    SELECT 1
    FROM customers AS c
    WHERE c.customer_id = o.customer_id
)
ORDER BY o.order_date DESC;`,
      explanation: 'Orphaned fact rows are exactly what an inner join hides — the revenue they carry vanishes from every report without an error. Running the anti-join in both directions is a standard load-validation step.',
    },
    {
      id: 'p18-q3',
      difficulty: 'medium',
      prompt: 'Find customers who have placed orders, but none in 2024.',
      tables: ['customers', 'orders'],
      think: 'Two conditions: at least one order ever, and zero orders in a window. Can one anti-join express both?',
      hint: 'An EXISTS for "has orders" and a NOT EXISTS for "none in 2024".',
      approach: `Start from customers.\nRequire that at least one order exists for the customer.\nRequire that no order exists for that customer within 2024.\nReturn the customer plus their most recent order date.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       (SELECT MAX(o.order_date) FROM orders AS o
        WHERE o.customer_id = c.customer_id) AS last_order_date
FROM customers AS c
WHERE EXISTS (
        SELECT 1 FROM orders AS o
        WHERE o.customer_id = c.customer_id
      )
  AND NOT EXISTS (
        SELECT 1 FROM orders AS o
        WHERE o.customer_id = c.customer_id
          AND o.order_date >= DATE '2024-01-01'
          AND o.order_date <  DATE '2025-01-01'
      )
ORDER BY last_order_date DESC;`,
      explanation: 'The EXISTS and NOT EXISTS together express "lapsed, not never-acquired" — a genuinely different population from "no orders at all", and the one a win-back campaign targets. Putting the 2024 filter in the outer WHERE instead would return every order outside 2024, one row each.',
    },
    {
      id: 'p18-q4',
      difficulty: 'medium',
      prompt: 'Find products that appear in order_items but are missing from the products catalog, and vice versa, in one result.',
      tables: ['products', 'order_items'],
      think: 'Non-matching in both directions. Is that two queries stapled together, or one join?',
      hint: 'A FULL OUTER JOIN over the distinct key sets, keeping rows NULL on either side.',
      approach: `Reduce order_items to its distinct product ids.\nFULL OUTER JOIN that set against products on the key.\nKeep rows where either side is NULL.\nLabel which side is missing.`,
      solution: `WITH sold AS (
    SELECT DISTINCT product_id FROM order_items
)
SELECT COALESCE(p.product_id, s.product_id) AS product_id,
       p.product_name,
       CASE WHEN p.product_id IS NULL THEN 'sold but not in catalog'
            WHEN s.product_id IS NULL THEN 'in catalog but never sold'
       END AS issue
FROM products AS p
FULL OUTER JOIN sold AS s ON s.product_id = p.product_id
WHERE p.product_id IS NULL
   OR s.product_id IS NULL
ORDER BY issue, product_id;`,
      explanation: 'One FULL OUTER JOIN answers both directions and, crucially, produces a single reconciliation report rather than two lists someone has to merge by hand. COALESCE recovers the key regardless of which side supplied it.',
      dialect: 'MySQL has no FULL OUTER JOIN — emulate with a LEFT JOIN UNION ALL a RIGHT anti-join.',
    },
    {
      id: 'p18-q5',
      difficulty: 'medium',
      prompt: 'Find employees who have never had a salary above 50,000, excluding those with no salary recorded.',
      tables: ['employees'],
      think: 'There is only one table and one row per employee. What is the "non-match" here?',
      hint: 'The condition is the anti-test, not a second table. Be careful how NULL salaries behave in the comparison.',
      approach: `Restrict to employees whose salary is recorded.\nKeep those whose salary does not exceed the threshold.\nMake the NULL exclusion explicit rather than relying on three-valued logic.\nReturn the employee and the salary.`,
      solution: `SELECT emp_id,
       emp_name,
       dept_id,
       salary
FROM employees
WHERE salary IS NOT NULL
  AND salary <= 50000
ORDER BY salary DESC;`,
      explanation: 'salary <= 50000 already excludes NULLs, because NULL <= 50000 is UNKNOWN rather than TRUE — but writing IS NOT NULL explicitly documents that the exclusion is intentional rather than accidental. That distinction is what an interviewer is listening for.',
    },
    {
      id: 'p18-q6',
      difficulty: 'medium',
      prompt: 'Find customers whose every order was cancelled.',
      tables: ['customers', 'orders'],
      think: '"All of them are X" is awkward in SQL. What is the equivalent statement using "none of them is not X"?',
      hint: 'Has at least one order, and no order with a status other than cancelled.',
      approach: `Require that the customer has at least one order.\nRequire that no order exists for them with a status other than cancelled.\nTogether these mean every order was cancelled.\nReturn the customer and the cancelled count.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       (SELECT COUNT(*) FROM orders AS o
        WHERE o.customer_id = c.customer_id) AS cancelled_orders
FROM customers AS c
WHERE EXISTS (
        SELECT 1 FROM orders AS o WHERE o.customer_id = c.customer_id
      )
  AND NOT EXISTS (
        SELECT 1 FROM orders AS o
        WHERE o.customer_id = c.customer_id
          AND o.status <> 'cancelled'
      )
ORDER BY cancelled_orders DESC;`,
      explanation: 'Universal quantification ("for all") has no direct SQL operator, so you rewrite it as double negation: "none that are not". The alternative — GROUP BY with COUNT(*) = COUNT(CASE WHEN status = \'cancelled\' THEN 1 END) — is equally valid and worth mentioning.',
    },
    {
      id: 'p18-q7',
      difficulty: 'hard',
      prompt: 'Find customers who bought product A but never product B.',
      tables: ['orders', 'order_items'],
      think: 'One EXISTS and one NOT EXISTS over the same chain. What has to be shared between them?',
      hint: 'Both subqueries correlate on the same customer_id; only the product filter differs.',
      approach: `Start from the set of customers.\nRequire an order line exists for product A under that customer.\nRequire no order line exists for product B under that customer.\nReturn the customers plus when they last bought A.`,
      solution: `WITH cust AS (
    SELECT DISTINCT customer_id FROM orders
)
SELECT cu.customer_id
FROM cust AS cu
WHERE EXISTS (
        SELECT 1
        FROM orders AS o
        JOIN order_items AS oi ON oi.order_id = o.order_id
        WHERE o.customer_id = cu.customer_id
          AND oi.product_id = 101          -- product A
      )
  AND NOT EXISTS (
        SELECT 1
        FROM orders AS o
        JOIN order_items AS oi ON oi.order_id = o.order_id
        WHERE o.customer_id = cu.customer_id
          AND oi.product_id = 202          -- product B
      )
ORDER BY cu.customer_id;`,
      explanation: 'This is the cross-sell target list: people who own the base product and not the accessory. The two subqueries correlate on the same customer but scan different product filters, which is why one join with a WHERE cannot express it — a row is either A or B, never both at once.',
    },
    {
      id: 'p18-q8',
      difficulty: 'hard',
      prompt: 'Find departments where no employee earns above the company-wide average salary.',
      tables: ['employees'],
      think: 'The threshold is a scalar computed from the whole table. Does it belong inside or outside the anti-test?',
      hint: 'Compute the average once in a CTE, then NOT EXISTS against employees earning more.',
      approach: `Compute the company-wide average salary once.\nList the distinct departments.\nFor each, test whether any employee earns above that average.\nKeep the departments where none does.`,
      solution: `WITH company AS (
    SELECT AVG(salary) AS avg_salary
    FROM employees
    WHERE salary IS NOT NULL
),
depts AS (
    SELECT DISTINCT dept_id FROM employees WHERE dept_id IS NOT NULL
)
SELECT d.dept_id,
       ROUND((SELECT avg_salary FROM company), 2) AS company_avg,
       ROUND(MAX(e.salary), 2)                    AS dept_max_salary
FROM depts AS d
JOIN employees AS e ON e.dept_id = d.dept_id
WHERE NOT EXISTS (
    SELECT 1
    FROM employees AS x, company AS cy
    WHERE x.dept_id = d.dept_id
      AND x.salary  > cy.avg_salary
)
GROUP BY d.dept_id
ORDER BY dept_max_salary DESC;`,
      explanation: 'Computing the average in its own CTE means it is evaluated once rather than per row, and it makes the threshold visible in the output so the reader can sanity-check the result. The equivalent HAVING MAX(salary) <= (SELECT AVG(salary) ...) is shorter and worth offering as the alternative.',
    },
    {
      id: 'p18-q9',
      difficulty: 'hard',
      prompt: 'Find customers present in customers_stg whose email differs from the one in customers, or who have no row in customers at all.',
      tables: ['customers', 'customers_stg'],
      think: 'Two categories: changed and new. What join shape returns both without two queries?',
      hint: 'LEFT JOIN from staging, then a NULL-safe inequality that also catches the all-NULL target side.',
      approach: `LEFT JOIN staging to the target on the business key.\nA missing target row leaves every target column NULL.\nCompare the emails with a NULL-safe inequality, which is true both when they differ and when the target side is absent.\nLabel the two cases.`,
      solution: `SELECT s.customer_id,
       s.email       AS staged_email,
       c.email       AS current_email,
       CASE WHEN c.customer_id IS NULL THEN 'new customer'
            ELSE 'email changed' END AS change_type
FROM customers_stg AS s
LEFT JOIN customers AS c ON c.customer_id = s.customer_id
WHERE c.customer_id IS NULL
   OR c.email IS DISTINCT FROM s.email
ORDER BY change_type, s.customer_id;`,
      explanation: 'IS DISTINCT FROM is what makes one predicate cover both cases: for a new customer the target email is NULL, which a plain <> would evaluate to UNKNOWN and filter out. This exact query is the change-detection step of an incremental load.',
      dialect: 'IS DISTINCT FROM is PostgreSQL / standard. MySQL: NOT (c.email <=> s.email). SQL Server: expand into explicit NULL comparisons.',
    },
    {
      id: 'p18-q10',
      difficulty: 'hard',
      prompt: 'Find products never sold in a region where they were in the catalog — that is, every (product, region) combination that has no sale.',
      tables: ['products', 'sales'],
      think: 'The missing combinations do not exist as rows. What has to be manufactured before they can be found absent?',
      hint: 'CROSS JOIN products against the distinct regions to build the expected grid, then anti-join sales.',
      approach: `Collect the distinct regions that appear in sales.\nCROSS JOIN products against those regions to build every expected combination.\nAnti-join the actual sales on both keys.\nKeep the combinations with no sale, and add the product's sales elsewhere for context.`,
      solution: `WITH regions AS (
    SELECT DISTINCT region FROM sales
),
expected AS (
    SELECT p.product_id, p.product_name, p.category, r.region
    FROM products AS p
    CROSS JOIN regions AS r
)
SELECT e.product_name,
       e.category,
       e.region AS no_sales_in,
       (SELECT COALESCE(SUM(s.amount), 0) FROM sales AS s
        WHERE s.product_id = e.product_id) AS revenue_elsewhere
FROM expected AS e
WHERE NOT EXISTS (
    SELECT 1
    FROM sales AS s
    WHERE s.product_id = e.product_id
      AND s.region     = e.region
)
ORDER BY revenue_elsewhere DESC, e.product_name, e.region;`,
      explanation: 'A CROSS JOIN is the right tool exactly when the question is about combinations that *should* exist, since an anti-join can only find rows that were generated in the first place. Sorting by revenue elsewhere turns a long list of absences into a ranked expansion opportunity.',
    },
  ],
};
