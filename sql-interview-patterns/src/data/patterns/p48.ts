import type { Pattern } from '../types';

export const p48: Pattern = {
  num: 48,
  slug: 'find-common-records',
  title: 'Find Common Records',
  concept: 'INTERSECT',
  category: 'Joins & Set Logic',
  tagline: 'Rows present in both result sets. Set semantics: whole rows, NULL-safe, deduplicated.',
  theory: `INTERSECT returns the rows that appear in both of two result sets. Unlike a join, it compares **entire rows** rather than a join condition, and it uses **set equality**, which treats two NULLs as equal — the opposite of how a join behaves.

Those two properties are exactly when to reach for it. Comparing two tables column-for-column with an inner join needs a NULL-safe predicate on every column; INTERSECT gets it right for free. And because it compares whole rows, you cannot accidentally omit a column from the comparison.

The costs are the flip side. **INTERSECT deduplicates**: if a row appears three times on the left and twice on the right, you get one row. INTERSECT ALL preserves the lower multiplicity (two here) and is what you want when counts matter — but it is missing from several engines. And you only get the columns you compared, so any extra detail needs a join back.

Both branches must have the same number of columns with compatible types, and the column names come from the first branch.

For "which customers appear in both", a join or an EXISTS is usually clearer; for "are these two tables identical", INTERSECT and EXCEPT together are the right tool.`,
  pitfalls: [
    'Forgetting INTERSECT deduplicates, so counts come out lower than expected.',
    'Assuming INTERSECT ALL exists — it is absent from SQL Server and older MySQL.',
    'Using INTERSECT when you need columns from both sides; it returns only the compared columns.',
    'Mismatched column order between branches, which can still run if the types are compatible.',
    'Reaching for INTERSECT where an EXISTS would be clearer and index-friendlier.',
  ],
  questions: [
    {
      id: 'p48-q1',
      difficulty: 'easy',
      prompt: 'Find product_ids that appear in both sales_2023 and sales_2024.',
      tables: ['sales_2023 / sales_2024'],
      think: 'What does the result deduplicate, and is that what you want here?',
      hint: 'One row per product id — which is exactly right for a key list.',
      approach: `Select the product id from the first table.\nSelect the same column from the second.\nIntersect the two sets.\nThe result is the ids present in both, deduplicated.`,
      solution: `SELECT product_id FROM sales_2023
INTERSECT
SELECT product_id FROM sales_2024
ORDER BY product_id;`,
      explanation: 'Deduplication is a feature here: you want each product listed once regardless of how many sales it had in either year. The ORDER BY applies to the whole set operation and must sit at the very end, not inside a branch.',
    },
    {
      id: 'p48-q2',
      difficulty: 'easy',
      prompt: 'Write the same query with a join and with EXISTS, and say which you would ship.',
      tables: ['sales_2023 / sales_2024'],
      think: 'Three syntaxes, one answer. What differs beyond style?',
      hint: 'Duplicate handling and the ability to return extra columns.',
      approach: `Write the intersection as a join on the key, deduplicating explicitly.\nWrite it as an EXISTS against the second table.\nCompare the row counts against the INTERSECT version.\nChoose based on whether extra columns are needed.`,
      solution: `-- EXISTS: no fan-out, index-friendly, returns extra columns freely
SELECT DISTINCT s.product_id
FROM sales_2023 AS s
WHERE EXISTS (SELECT 1 FROM sales_2024 AS t WHERE t.product_id = s.product_id)
ORDER BY s.product_id;

-- Join: needs DISTINCT because both sides have many rows per product
-- SELECT DISTINCT a.product_id
-- FROM sales_2023 a JOIN sales_2024 b ON b.product_id = a.product_id;`,
      explanation: 'The join version builds every matching pair before DISTINCT throws them away, so on two large tables it does far more work than EXISTS, which stops at the first match. EXISTS is also the one that lets you return other columns from the left side without changing the row count.',
    },
    {
      id: 'p48-q3',
      difficulty: 'medium',
      prompt: 'Find customers present in both customers and customers_stg with identical values in every compared column.',
      tables: ['customers', 'customers_stg'],
      think: 'Comparing every column with a join needs a NULL-safe predicate per column. What does INTERSECT do instead?',
      hint: 'It compares whole rows with set equality, where NULL equals NULL.',
      approach: `Project both tables down to the same column list in the same order.\nIntersect the two projections.\nThe result is the rows that are byte-for-byte identical, including matching NULLs.\nCount them to quantify how much is unchanged.`,
      solution: `SELECT customer_id, customer_name, email, city, country FROM customers
INTERSECT
SELECT customer_id, customer_name, email, city, country FROM customers_stg
ORDER BY customer_id;`,
      explanation: 'A row where city is NULL on both sides is returned by INTERSECT and would be dropped by a join using plain equality — set semantics treat NULLs as equal. That makes INTERSECT the correct tool for "are these rows the same" and a join the wrong one unless every column gets IS NOT DISTINCT FROM.',
    },
    {
      id: 'p48-q4',
      difficulty: 'medium',
      prompt: 'Demonstrate the difference between INTERSECT and INTERSECT ALL.',
      tables: ['sales_2023 / sales_2024'],
      think: 'A product appears four times in one table and two in the other. How many rows does each return?',
      hint: 'INTERSECT returns one; INTERSECT ALL returns the smaller of the two multiplicities.',
      approach: `Run the intersection with deduplication and count the rows.\nRun it with ALL, preserving multiplicity, and count again.\nCompare the two totals.\nConclude which one matches the question being asked.`,
      solution: `SELECT 'INTERSECT (deduplicated)' AS variant,
       COUNT(*) AS rows
FROM (
    SELECT product_id FROM sales_2023
    INTERSECT
    SELECT product_id FROM sales_2024
) AS d

UNION ALL

SELECT 'INTERSECT ALL (multiplicity preserved)',
       COUNT(*)
FROM (
    SELECT product_id FROM sales_2023
    INTERSECT ALL
    SELECT product_id FROM sales_2024
) AS a;`,
      explanation: 'INTERSECT ALL returns min(left count, right count) copies of each value, which is the right answer when the number of occurrences carries meaning. Plain INTERSECT is right for key lists, where you want each entity once.',
      dialect: 'INTERSECT ALL is PostgreSQL and Oracle. SQL Server supports only INTERSECT; MySQL added both in 8.0.31.',
    },
    {
      id: 'p48-q5',
      difficulty: 'medium',
      prompt: 'Find customers who ordered in both January and February 2024.',
      tables: ['orders'],
      think: 'Two filtered slices of the same table. Does INTERSECT care that they come from one source?',
      hint: 'No — each branch is just a result set.',
      approach: `Select the distinct customers active in January.\nSelect the distinct customers active in February.\nIntersect the two sets.\nThe result is the retained customers.`,
      solution: `SELECT customer_id FROM orders
WHERE order_date >= DATE '2024-01-01' AND order_date < DATE '2024-02-01'
INTERSECT
SELECT customer_id FROM orders
WHERE order_date >= DATE '2024-02-01' AND order_date < DATE '2024-03-01'
ORDER BY customer_id;`,
      explanation: 'Set operations do not care whether the branches come from different tables or from different slices of one, which makes this the most readable form of a period-over-period retention list. The automatic deduplication is exactly right here — a customer with ten January orders should appear once.',
    },
    {
      id: 'p48-q6',
      difficulty: 'medium',
      prompt: 'Find products sold in all three of 2022, 2023 and 2024, chaining the operator.',
      tables: ['sales'],
      think: 'INTERSECT is binary. How do you apply it to three sets, and does the order matter?',
      hint: 'Chain it — it is associative, so the order has no effect on the result.',
      approach: `Produce one branch per year, each selecting the product id.\nChain INTERSECT between them.\nThe result is the ids present in every branch.\nOrder at the end.`,
      solution: `SELECT product_id FROM sales
WHERE sale_date >= DATE '2022-01-01' AND sale_date < DATE '2023-01-01'
INTERSECT
SELECT product_id FROM sales
WHERE sale_date >= DATE '2023-01-01' AND sale_date < DATE '2024-01-01'
INTERSECT
SELECT product_id FROM sales
WHERE sale_date >= DATE '2024-01-01' AND sale_date < DATE '2025-01-01'
ORDER BY product_id;`,
      explanation: 'INTERSECT is associative and commutative, so chaining is safe and the branch order is irrelevant to the result. Beyond three or four branches, a GROUP BY with HAVING COUNT(DISTINCT year) = 3 scales far better and reads more clearly.',
    },
    {
      id: 'p48-q7',
      difficulty: 'hard',
      prompt: 'Rewrite the three-year intersection as an aggregation, and say why you would prefer it.',
      tables: ['sales'],
      think: 'Three branches means three scans. What does one pass with a count give you instead?',
      hint: 'Count the distinct years per product and require the count to equal three.',
      approach: `Scan the sales table once, restricted to the three-year window.\nGroup by product and count the distinct years it sold in.\nKeep products whose count is three.\nReturn the years for verification.`,
      solution: `SELECT product_id,
       COUNT(DISTINCT EXTRACT(YEAR FROM sale_date)) AS years_active,
       MIN(sale_date) AS first_sale,
       MAX(sale_date) AS last_sale,
       SUM(amount)    AS total_revenue
FROM sales
WHERE sale_date >= DATE '2022-01-01'
  AND sale_date <  DATE '2025-01-01'
GROUP BY product_id
HAVING COUNT(DISTINCT EXTRACT(YEAR FROM sale_date)) = 3
ORDER BY total_revenue DESC;`,
      explanation: 'One scan replaces three, and the aggregation form generalises to "sold in at least N of the last M years" by changing a number rather than adding branches. It also returns supporting measures for free, which the set operator cannot — INTERSECT gives you only the compared columns.',
    },
    {
      id: 'p48-q8',
      difficulty: 'hard',
      prompt: 'Use INTERSECT and EXCEPT together to prove two tables are identical.',
      tables: ['customers', 'customers_stg'],
      think: 'Two sets are equal when neither contains anything the other lacks. What tests that?',
      hint: 'Both EXCEPT directions must be empty — and the row counts must match if duplicates matter.',
      approach: `Count the rows only in the first table using EXCEPT one way.\nCount the rows only in the second using EXCEPT the other way.\nCount the rows in both using INTERSECT.\nThe tables are identical when both EXCEPT counts are zero and the raw counts agree.`,
      solution: `WITH t AS (SELECT customer_id, customer_name, email, city, country FROM customers),
     s AS (SELECT customer_id, customer_name, email, city, country FROM customers_stg)
SELECT (SELECT COUNT(*) FROM (SELECT * FROM t EXCEPT    SELECT * FROM s) AS x) AS only_in_target,
       (SELECT COUNT(*) FROM (SELECT * FROM s EXCEPT    SELECT * FROM t) AS y) AS only_in_source,
       (SELECT COUNT(*) FROM (SELECT * FROM t INTERSECT SELECT * FROM s) AS z) AS in_both,
       (SELECT COUNT(*) FROM t) AS target_rows,
       (SELECT COUNT(*) FROM s) AS source_rows;`,
      explanation: 'Both EXCEPT counts being zero proves the two *sets* are equal, but not that the tables are — duplicates are invisible to set operators, which is why the raw row counts are included. If the EXCEPT counts are zero and the raw counts differ, one table has duplicate rows the other does not.',
    },
    {
      id: 'p48-q9',
      difficulty: 'hard',
      prompt: 'Find customers who bought every product in a given set — relational division.',
      tables: ['orders', 'order_items'],
      think: 'INTERSECT one branch per product would work. Why is that a bad idea at scale?',
      hint: 'The number of branches depends on the set size, so the query cannot be parameterised.',
      approach: `Put the required products in a list rather than in query text.\nJoin the customer purchases to that list.\nGroup by customer and count the distinct required products they bought.\nKeep customers whose count equals the size of the required set.`,
      solution: `WITH required AS (
    SELECT * FROM (VALUES (101), (202), (303)) AS r(product_id)
),
bought AS (
    SELECT DISTINCT o.customer_id, oi.product_id
    FROM orders      AS o
    JOIN order_items AS oi ON oi.order_id = o.order_id
)
SELECT b.customer_id,
       COUNT(*) AS required_products_owned
FROM bought   AS b
JOIN required AS r ON r.product_id = b.product_id
GROUP BY b.customer_id
HAVING COUNT(*) = (SELECT COUNT(*) FROM required)
ORDER BY b.customer_id;`,
      explanation: 'Relational division — "has all of" — is expressed as counting the distinct matches and comparing against the required-set size, which works for any set size without changing the query. An INTERSECT chain would need one branch per product and could not be parameterised at all.',
    },
    {
      id: 'p48-q10',
      difficulty: 'hard',
      prompt: 'Compare the plan and cost of INTERSECT against the equivalent EXISTS and aggregation forms.',
      tables: ['sales_2023 / sales_2024'],
      think: 'All three are correct. What decides between them in production?',
      hint: 'Whether the deduplication is wanted, whether extra columns are needed, and how many scans each does.',
      approach: `Run EXPLAIN on the INTERSECT form and note the deduplication step.\nRun EXPLAIN on the EXISTS form and look for a semi join.\nRun EXPLAIN on the aggregation form and count the scans.\nChoose based on the output needed, not only on the plan.`,
      solution: `EXPLAIN ANALYZE
SELECT product_id FROM sales_2023
INTERSECT
SELECT product_id FROM sales_2024;

EXPLAIN ANALYZE
SELECT DISTINCT s.product_id
FROM sales_2023 AS s
WHERE EXISTS (SELECT 1 FROM sales_2024 AS t WHERE t.product_id = s.product_id);

EXPLAIN ANALYZE
SELECT product_id
FROM (SELECT product_id, 2023 AS yr FROM sales_2023
      UNION ALL
      SELECT product_id, 2024      FROM sales_2024) AS u
GROUP BY product_id
HAVING COUNT(DISTINCT yr) = 2;`,
      explanation: 'INTERSECT usually plans as a hash or merge operation with an explicit deduplication step, while EXISTS becomes a semi join that can stop at the first match per row. The aggregation form reads each table once and is the only one that scales cleanly when the number of sets grows, so pick INTERSECT for clarity on two sets and the aggregation for many.',
    },
  ],
};
