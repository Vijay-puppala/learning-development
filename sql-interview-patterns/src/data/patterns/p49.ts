import type { Pattern } from '../types';

export const p49: Pattern = {
  num: 49,
  slug: 'find-records-in-a-not-b',
  title: 'Find Records in A Not B',
  concept: 'EXCEPT',
  category: 'Joins & Set Logic',
  tagline: 'Set difference: whole rows, NULL-safe, deduplicated — and the shortest correct reconciliation tool.',
  theory: `EXCEPT returns the rows of the first result set that do not appear in the second. Oracle spells it MINUS; everything else follows the standard.

It shares INTERSECT's two defining properties. It compares **entire rows**, so a difference in any column makes the row appear. And it uses **set equality**, where NULL equals NULL — which means it finds differences a join with plain equality would silently miss.

That makes EXCEPT the most concise correct answer to "what changed between these two tables": run it one way for rows only on the left, the other way for rows only on the right. No NULL-safe predicate per column, no chance of forgetting a column.

The trade-offs mirror INTERSECT's. **EXCEPT deduplicates**, so three identical left rows and none on the right produce one row; EXCEPT ALL preserves the surplus multiplicity and is absent from SQL Server. You get only the compared columns. And unlike NOT EXISTS, you cannot mix in an unrelated predicate — every column in the branch participates in the comparison.

The crucial contrast: EXCEPT compares whole rows, NOT EXISTS compares a key. "In A and not in B **by key**" is NOT EXISTS; "in A and not in B **exactly**" is EXCEPT.`,
  pitfalls: [
    'Expecting EXCEPT to compare only the key — it compares every selected column.',
    'Forgetting it deduplicates, so the row count understates the number of offending rows.',
    'Assuming EXCEPT ALL exists; SQL Server has neither, and Oracle spells the operator MINUS.',
    'Putting ORDER BY inside a branch instead of at the end of the whole statement.',
    'Mismatched column order between branches, which still runs when the types are compatible.',
  ],
  questions: [
    {
      id: 'p49-q1',
      difficulty: 'easy',
      prompt: 'Find product_ids that sold in 2023 but not in 2024.',
      tables: ['sales_2023 / sales_2024'],
      think: 'Does the order of the two branches matter?',
      hint: 'Yes — EXCEPT is not commutative. The first branch is the one you keep rows from.',
      approach: `Select the product id from the earlier year.\nSelect the same column from the later year.\nSubtract the second set from the first with EXCEPT.\nOrder the result at the end.`,
      solution: `SELECT product_id FROM sales_2023
EXCEPT
SELECT product_id FROM sales_2024
ORDER BY product_id;`,
      explanation: 'Reversing the branches answers the opposite question — products new in 2024 — so the order is part of the meaning, unlike INTERSECT. The result is deduplicated, which is right for a key list.',
      dialect: 'EXCEPT is PostgreSQL / SQL Server / SQLite / MySQL 8.0.31+. Oracle spells it MINUS.',
    },
    {
      id: 'p49-q2',
      difficulty: 'easy',
      prompt: 'Write the same query with NOT EXISTS and note what changes.',
      tables: ['sales_2023 / sales_2024'],
      think: 'Two syntaxes for one answer. What can NOT EXISTS do that EXCEPT cannot?',
      hint: 'Return extra columns, and compare on a key rather than on whole rows.',
      approach: `Select from the earlier year's table.\nTest for the absence of a matching row in the later year.\nDeduplicate explicitly, since the source has many rows per product.\nReturn supporting columns alongside the key.`,
      solution: `SELECT s.product_id,
       COUNT(*)      AS sales_2023,
       SUM(s.amount) AS revenue_lost
FROM sales_2023 AS s
WHERE NOT EXISTS (
    SELECT 1 FROM sales_2024 AS t WHERE t.product_id = s.product_id
)
GROUP BY s.product_id
ORDER BY revenue_lost DESC;`,
      explanation: 'NOT EXISTS compares only the key, which is what lets it carry extra columns and aggregates through — EXCEPT returns nothing but the columns you compared. Quantifying the loss turns a bare list of dropped products into a prioritised report.',
    },
    {
      id: 'p49-q3',
      difficulty: 'medium',
      prompt: 'Find rows in customers that differ in any column from customers_stg.',
      tables: ['customers', 'customers_stg'],
      think: 'Whole-row comparison with NULLs on either side. Which tool handles that without a predicate per column?',
      hint: 'EXCEPT — set equality treats NULL as equal to NULL.',
      approach: `Project both tables to the same column list in the same order.\nSubtract the staging projection from the target projection.\nThe result is every target row not exactly reproduced in staging.\nOrder at the end.`,
      solution: `SELECT customer_id, customer_name, email, city, country FROM customers
EXCEPT
SELECT customer_id, customer_name, email, city, country FROM customers_stg
ORDER BY customer_id;`,
      explanation: 'The join equivalent would need IS DISTINCT FROM on every column, and forgetting one silently hides a whole class of change — EXCEPT cannot be got wrong that way. Its limitation is that it tells you a row differs without telling you which column did.',
    },
    {
      id: 'p49-q4',
      difficulty: 'medium',
      prompt: 'Produce a full symmetric difference: rows in either table but not both, labelled by side.',
      tables: ['customers', 'customers_stg'],
      think: 'EXCEPT runs one direction. How do you get both in one result?',
      hint: 'UNION ALL the two directions, each with a tag.',
      approach: `Compute the rows present only in the target with EXCEPT one way.\nCompute the rows present only in the source with EXCEPT the other way.\nTag each branch with its side.\nUNION ALL the two, which are disjoint by construction.`,
      solution: `SELECT 'target only' AS side, customer_id, customer_name, email, city
FROM (
    SELECT customer_id, customer_name, email, city, country FROM customers
    EXCEPT
    SELECT customer_id, customer_name, email, city, country FROM customers_stg
) AS t

UNION ALL

SELECT 'source only', customer_id, customer_name, email, city
FROM (
    SELECT customer_id, customer_name, email, city, country FROM customers_stg
    EXCEPT
    SELECT customer_id, customer_name, email, city, country FROM customers
) AS s
ORDER BY customer_id, side;`,
      explanation: 'A customer_id appearing on both sides means the row changed; appearing on one side only means it was inserted or deleted — the same id in both branches is the signal to look for. UNION ALL is safe because the two branches cannot overlap.',
    },
    {
      id: 'p49-q5',
      difficulty: 'medium',
      prompt: 'Show the difference between EXCEPT and EXCEPT ALL.',
      tables: ['customers', 'customers_stg'],
      think: 'Three identical rows on the left and one on the right — how many come back from each?',
      hint: 'EXCEPT returns one; EXCEPT ALL returns the surplus, which is two.',
      approach: `Run the difference with deduplication and count the rows.\nRun it with ALL, preserving multiplicity, and count again.\nCompare the totals.\nDecide which matches the question being asked.`,
      solution: `SELECT 'EXCEPT (deduplicated)' AS variant, COUNT(*) AS rows
FROM (
    SELECT customer_id, email FROM customers
    EXCEPT
    SELECT customer_id, email FROM customers_stg
) AS d

UNION ALL

SELECT 'EXCEPT ALL (surplus preserved)', COUNT(*)
FROM (
    SELECT customer_id, email FROM customers
    EXCEPT ALL
    SELECT customer_id, email FROM customers_stg
) AS a;`,
      explanation: 'EXCEPT ALL returns max(0, left count − right count) copies, which is what you want when the number of surplus rows is the finding. Plain EXCEPT is right for key lists and hides duplicate problems, so run both when reconciling a load.',
      dialect: 'EXCEPT ALL is PostgreSQL and Oracle (MINUS ALL in 21c+). SQL Server supports only EXCEPT; MySQL added both in 8.0.31.',
    },
    {
      id: 'p49-q6',
      difficulty: 'medium',
      prompt: 'Find customers who ordered in January but not in February.',
      tables: ['orders'],
      think: 'Two filtered slices of one table. Which branch goes first?',
      hint: 'The one you want rows from — January.',
      approach: `Select the customers active in January.\nSelect the customers active in February.\nSubtract the second from the first.\nThe result is the churned customers for that month pair.`,
      solution: `SELECT customer_id FROM orders
WHERE order_date >= DATE '2024-01-01' AND order_date < DATE '2024-02-01'
EXCEPT
SELECT customer_id FROM orders
WHERE order_date >= DATE '2024-02-01' AND order_date < DATE '2024-03-01'
ORDER BY customer_id;`,
      explanation: 'This is the complement of the INTERSECT retention query, and together they partition January\'s customers into retained and churned. The deduplication is right here — a customer with ten January orders should be counted once either way.',
    },
    {
      id: 'p49-q7',
      difficulty: 'hard',
      prompt: 'Explain when EXCEPT and NOT EXISTS give different answers.',
      tables: ['customers', 'customers_stg'],
      think: 'One compares whole rows, the other compares a key. Construct the case where they diverge.',
      hint: 'A customer present in both tables but with a changed email.',
      approach: `Run the EXCEPT comparison over every column.\nRun the NOT EXISTS comparison on the key alone.\nCount each result.\nThe difference is the rows that exist on both sides but differ in content.`,
      solution: `WITH by_row AS (
    SELECT customer_id FROM (
        SELECT customer_id, customer_name, email, city, country FROM customers
        EXCEPT
        SELECT customer_id, customer_name, email, city, country FROM customers_stg
    ) AS x
),
by_key AS (
    SELECT c.customer_id
    FROM customers AS c
    WHERE NOT EXISTS (SELECT 1 FROM customers_stg AS s
                      WHERE s.customer_id = c.customer_id)
)
SELECT (SELECT COUNT(*) FROM by_row) AS differ_by_whole_row,
       (SELECT COUNT(*) FROM by_key) AS missing_by_key,
       (SELECT COUNT(*) FROM by_row) - (SELECT COUNT(*) FROM by_key)
         AS present_but_changed;`,
      explanation: 'present_but_changed counts the rows that exist on both sides with different content — found by EXCEPT and invisible to a key-based NOT EXISTS. Choosing between them is choosing between "is this row missing" and "is this row different", which are separate questions in every load.',
    },
    {
      id: 'p49-q8',
      difficulty: 'hard',
      prompt: 'Find products in the catalog that have never been sold, and quantify the dormant inventory.',
      tables: ['products', 'sales'],
      think: 'EXCEPT returns only the compared columns. How do you get the price back?',
      hint: 'Join the EXCEPT result back to the source table.',
      approach: `Subtract the distinct sold product ids from the full catalog ids with EXCEPT.\nJoin that key list back to products for the details.\nAggregate to quantify the dormant catalog.\nOrder by the most valuable dormant products.`,
      solution: `WITH never_sold AS (
    SELECT product_id FROM products
    EXCEPT
    SELECT product_id FROM sales
)
SELECT p.category,
       COUNT(*)                AS dormant_products,
       ROUND(AVG(p.price), 2)  AS avg_price,
       SUM(p.price)            AS catalog_value_at_list
FROM never_sold AS n
JOIN products   AS p ON p.product_id = n.product_id
GROUP BY p.category
ORDER BY dormant_products DESC;`,
      explanation: 'EXCEPT produces the key list and the join brings back the attributes, which is the standard way to work around its narrow output. Aggregating by category turns a flat list of dead SKUs into a merchandising conversation.',
    },
    {
      id: 'p49-q9',
      difficulty: 'hard',
      prompt: 'Build a load-validation check that fails loudly if the target does not exactly reproduce the source.',
      tables: ['customers', 'customers_stg'],
      think: 'What single result should a passing load produce, and what makes a failure obvious?',
      hint: 'Both EXCEPT directions empty and the row counts equal — expressed as one boolean.',
      approach: `Count the rows only in the target and only in the source with the two EXCEPT directions.\nCount the raw rows on each side to catch duplicate differences.\nCombine all four into a single pass or fail verdict.\nReturn the component counts so a failure is diagnosable.`,
      solution: `WITH t AS (SELECT customer_id, customer_name, email, city, country FROM customers),
     s AS (SELECT customer_id, customer_name, email, city, country FROM customers_stg),
     checks AS (
         SELECT (SELECT COUNT(*) FROM (SELECT * FROM t EXCEPT SELECT * FROM s) AS a)
                  AS only_in_target,
                (SELECT COUNT(*) FROM (SELECT * FROM s EXCEPT SELECT * FROM t) AS b)
                  AS only_in_source,
                (SELECT COUNT(*) FROM t) AS target_rows,
                (SELECT COUNT(*) FROM s) AS source_rows
     )
SELECT *,
       CASE WHEN only_in_target = 0
             AND only_in_source = 0
             AND target_rows = source_rows
            THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM checks;`,
      explanation: 'Including the raw row counts catches the case the set operators cannot see: identical sets where one side has duplicate rows. Returning the four components alongside the verdict means a failure points straight at its cause rather than requiring a second investigation.',
    },
    {
      id: 'p49-q10',
      difficulty: 'hard',
      prompt: 'Compare the three ways to express "in A not in B" — EXCEPT, NOT EXISTS and LEFT JOIN IS NULL — on correctness and cost.',
      tables: ['customers', 'customers_stg'],
      think: 'All three are common. Which one is never the right answer, and which two differ in meaning?',
      hint: 'NOT IN is the dangerous one. EXCEPT compares rows; the other two compare keys.',
      approach: `Write the EXCEPT form, which compares whole rows NULL-safely.\nWrite the NOT EXISTS form, which compares a key and can return extra columns.\nWrite the LEFT JOIN IS NULL form, which is equivalent to NOT EXISTS.\nNote that NOT IN over a nullable column returns nothing at all.`,
      solution: `-- 1. Whole-row difference, NULL-safe, deduplicated
SELECT customer_id, email FROM customers
EXCEPT
SELECT customer_id, email FROM customers_stg;

-- 2. Key-based anti-join: extra columns allowed, no deduplication
SELECT c.customer_id, c.email, c.signup_date
FROM customers AS c
WHERE NOT EXISTS (SELECT 1 FROM customers_stg AS s
                  WHERE s.customer_id = c.customer_id);

-- 3. Same as (2), written as an outer join
SELECT c.customer_id, c.email
FROM customers AS c
LEFT JOIN customers_stg AS s ON s.customer_id = c.customer_id
WHERE s.customer_id IS NULL;

-- 4. NEVER: one NULL in the subquery makes this return zero rows
-- SELECT * FROM customers
-- WHERE customer_id NOT IN (SELECT customer_id FROM customers_stg);`,
      explanation: 'Forms 2 and 3 are semantically identical and usually compile to the same anti-join, so pick on readability; form 1 answers a different question, comparing whole rows rather than keys. Form 4 is the one to strike from your vocabulary: a single NULL turns the predicate to UNKNOWN for every row and the query returns nothing with no error at all.',
    },
  ],
};
