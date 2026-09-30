import type { Pattern } from '../types';

export const p26: Pattern = {
  num: 26,
  slug: 'compare-two-tables',
  title: 'Compare Two Tables',
  concept: 'FULL OUTER JOIN',
  category: 'Joins & Set Logic',
  tagline: 'One join that answers "only in A", "only in B" and "in both but different" at once.',
  theory: `Reconciling two tables — a source against a target, yesterday against today, a migration against its original — has three possible verdicts per key: present only on the left, present only on the right, or present on both and either matching or differing.

A FULL OUTER JOIN produces all of them in one pass. Rows matching on the key appear once with both sides populated; unmatched rows from either side appear with NULLs on the missing side. A CASE over which side is NULL classifies every row.

Three details separate a working reconciliation from a broken one.

**COALESCE the key.** After a full outer join, neither a.key nor b.key is reliably populated, so the output key must be COALESCE(a.key, b.key).

**Compare values NULL-safely.** a.col <> b.col is UNKNOWN whenever either side is NULL, so a value changing to or from NULL is silently reported as unchanged. Use IS DISTINCT FROM.

**Check the join key is unique on both sides.** A full outer join against a duplicated key fans out, and the reconciliation report becomes meaningless. Verify or deduplicate first.

MySQL has no FULL OUTER JOIN; emulate it with a LEFT JOIN unioned to a right anti-join.`,
  pitfalls: [
    'Selecting a.key instead of COALESCE(a.key, b.key), losing the key on right-only rows.',
    'Comparing values with <> instead of IS DISTINCT FROM, missing every change involving a NULL.',
    'Joining on a non-unique key, which fans out and invalidates the whole report.',
    'Filtering in WHERE on one side, which collapses the full outer join into a one-sided one.',
    'Assuming MySQL supports FULL OUTER JOIN — it does not.',
  ],
  questions: [
    {
      id: 'p26-q1',
      difficulty: 'easy',
      prompt: 'Compare customers against customers_stg and classify every customer_id as left-only, right-only or in both.',
      tables: ['customers', 'customers_stg'],
      think: 'After a full outer join, how do you tell which side a row came from?',
      hint: 'Test each side\'s key for NULL.',
      approach: `FULL OUTER JOIN the two tables on the business key.\nCOALESCE the two key columns to get a reliable output key.\nClassify with a CASE on which side's key is NULL.\nReturn one row per key with its verdict.`,
      solution: `SELECT COALESCE(c.customer_id, s.customer_id) AS customer_id,
       CASE WHEN s.customer_id IS NULL THEN 'target only'
            WHEN c.customer_id IS NULL THEN 'source only'
            ELSE                            'both'
       END AS presence
FROM customers     AS c
FULL OUTER JOIN customers_stg AS s
  ON s.customer_id = c.customer_id
ORDER BY presence, customer_id;`,
      explanation: 'COALESCE recovers the key regardless of which side supplied it — selecting c.customer_id alone would return NULL for every source-only row. This three-way classification is the skeleton of every reconciliation report.',
      dialect: 'MySQL has no FULL OUTER JOIN: write a LEFT JOIN UNION ALL a right-side anti-join.',
    },
    {
      id: 'p26-q2',
      difficulty: 'easy',
      prompt: 'Count how many customer_ids fall into each of those three categories.',
      tables: ['customers', 'customers_stg'],
      think: 'What does a large "source only" count tell you that a large "both" count does not?',
      hint: 'Aggregate the classification from the previous query.',
      approach: `Build the three-way classification in a CTE.\nGroup by the classification.\nCount the keys in each bucket.\nAdd a percentage of the total.`,
      solution: `WITH classified AS (
    SELECT COALESCE(c.customer_id, s.customer_id) AS customer_id,
           CASE WHEN s.customer_id IS NULL THEN 'target only'
                WHEN c.customer_id IS NULL THEN 'source only'
                ELSE                            'both'
           END AS presence
    FROM customers AS c
    FULL OUTER JOIN customers_stg AS s ON s.customer_id = c.customer_id
)
SELECT presence,
       COUNT(*) AS keys,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM classified
GROUP BY presence
ORDER BY keys DESC;`,
      explanation: 'SUM(COUNT(*)) OVER () computes the grand total in the same pass, avoiding a second scan for the denominator. A large "target only" count on a full refresh means rows were deleted at the source — which is often a load failure rather than a real deletion.',
    },
    {
      id: 'p26-q3',
      difficulty: 'medium',
      prompt: 'Extend the comparison to detect rows present on both sides whose email or city differs.',
      tables: ['customers', 'customers_stg'],
      think: 'What does c.email <> s.email evaluate to when one of them is NULL?',
      hint: 'UNKNOWN, so the row is filtered out. Use IS DISTINCT FROM.',
      approach: `FULL OUTER JOIN on the key.\nClassify presence as before.\nFor rows on both sides, compare the attribute columns with a NULL-safe inequality.\nProduce a four-way verdict: source only, target only, changed, unchanged.`,
      solution: `SELECT COALESCE(c.customer_id, s.customer_id) AS customer_id,
       CASE WHEN s.customer_id IS NULL                       THEN 'deleted at source'
            WHEN c.customer_id IS NULL                       THEN 'new at source'
            WHEN c.email IS DISTINCT FROM s.email
              OR c.city  IS DISTINCT FROM s.city             THEN 'changed'
            ELSE                                                  'unchanged'
       END AS verdict,
       c.email AS target_email, s.email AS source_email,
       c.city  AS target_city,  s.city  AS source_city
FROM customers     AS c
FULL OUTER JOIN customers_stg AS s ON s.customer_id = c.customer_id
ORDER BY verdict, customer_id;`,
      explanation: 'IS DISTINCT FROM treats NULL as a comparable value, so a city going from NULL to "Leeds" is correctly reported as changed. With plain <> that row evaluates to UNKNOWN, falls into the ELSE branch, and is filed as unchanged — a silent data-loss bug in an incremental load.',
    },
    {
      id: 'p26-q4',
      difficulty: 'medium',
      prompt: 'Return only the rows that differ, with a column naming which field changed.',
      tables: ['customers', 'customers_stg'],
      think: 'Several fields can change at once. What produces a readable list rather than one flag per column?',
      hint: 'Build a list of changed field names with conditional expressions and concatenate the non-NULL ones.',
      approach: `FULL OUTER JOIN on the key and keep only rows present on both sides.\nFor each comparable field, emit its name when it differs and NULL otherwise.\nConcatenate those with a NULL-skipping function to produce a change list.\nFilter to rows where the list is non-empty.`,
      solution: `SELECT c.customer_id,
       CONCAT_WS(', ',
           CASE WHEN c.email   IS DISTINCT FROM s.email   THEN 'email'   END,
           CASE WHEN c.city    IS DISTINCT FROM s.city    THEN 'city'    END,
           CASE WHEN c.country IS DISTINCT FROM s.country THEN 'country' END
       ) AS changed_fields,
       c.email AS old_email, s.email AS new_email,
       c.city  AS old_city,  s.city  AS new_city
FROM customers     AS c
JOIN customers_stg AS s ON s.customer_id = c.customer_id
WHERE c.email   IS DISTINCT FROM s.email
   OR c.city    IS DISTINCT FROM s.city
   OR c.country IS DISTINCT FROM s.country
ORDER BY c.customer_id;`,
      explanation: 'CONCAT_WS skips NULL arguments, so the changed_fields column lists exactly the fields that moved with no stray separators. An inner join is correct here because the question is only about rows present on both sides — new and deleted rows are a different verdict.',
      dialect: 'CONCAT_WS is PostgreSQL / MySQL / SQL Server 2017+. Oracle: build the list with COALESCE and trim the separators.',
    },
    {
      id: 'p26-q5',
      difficulty: 'medium',
      prompt: 'Emulate the FULL OUTER JOIN comparison on an engine that does not support it.',
      tables: ['customers', 'customers_stg'],
      think: 'A full outer join is the union of three disjoint sets. Which two queries produce all three?',
      hint: 'A LEFT JOIN gives left-only plus both; a right anti-join adds right-only.',
      approach: `Write a LEFT JOIN from the target to the source, which covers rows in the target and rows in both.\nWrite a second query selecting source rows with no matching target row.\nUNION ALL the two — they are disjoint by construction.\nClassify each row as before.`,
      solution: `SELECT c.customer_id,
       CASE WHEN s.customer_id IS NULL THEN 'target only' ELSE 'both' END AS presence,
       c.email AS target_email,
       s.email AS source_email
FROM customers AS c
LEFT JOIN customers_stg AS s ON s.customer_id = c.customer_id

UNION ALL

SELECT s.customer_id, 'source only', NULL, s.email
FROM customers_stg AS s
WHERE NOT EXISTS (
    SELECT 1 FROM customers AS c WHERE c.customer_id = s.customer_id
)
ORDER BY presence, customer_id;`,
      explanation: 'The two branches are mutually exclusive — the first covers everything reachable from the target, the second covers only source rows the target lacks — so UNION ALL is safe and needs no deduplication. This is exactly what an engine does internally for a full outer join.',
    },
    {
      id: 'p26-q6',
      difficulty: 'medium',
      prompt: 'Verify that the join key is unique on both sides before running the comparison.',
      tables: ['customers', 'customers_stg'],
      think: 'What happens to a reconciliation report if one side has the key twice?',
      hint: 'The join fans out and every count in the report is wrong. Check first.',
      approach: `Count total rows and distinct keys on each side.\nCompare them — any difference means duplicates.\nReturn both figures so the size of the problem is visible.\nOnly run the reconciliation once both sides are clean.`,
      solution: `SELECT 'customers'     AS tbl,
       COUNT(*)               AS rows,
       COUNT(DISTINCT customer_id) AS distinct_keys,
       COUNT(*) - COUNT(DISTINCT customer_id) AS duplicate_rows
FROM customers
UNION ALL
SELECT 'customers_stg',
       COUNT(*),
       COUNT(DISTINCT customer_id),
       COUNT(*) - COUNT(DISTINCT customer_id)
FROM customers_stg;`,
      explanation: 'A full outer join on a duplicated key produces the cross product of the duplicates, so a key present twice on each side yields four rows and inflates every bucket. Running this check first is cheap and turns a mysterious reconciliation into a known data-quality task.',
    },
    {
      id: 'p26-q7',
      difficulty: 'hard',
      prompt: 'Compare two yearly sales tables by product and report revenue in each year plus the change, including products present in only one year.',
      tables: ['sales_2023 / sales_2024'],
      think: 'The comparison is between two aggregates rather than two rows. Where does the aggregation happen?',
      hint: 'Aggregate each side to one row per product first, then full outer join the two summaries.',
      approach: `Aggregate the 2023 table to revenue per product.\nAggregate the 2024 table the same way.\nFULL OUTER JOIN the two summaries on product_id.\nCOALESCE the key and the revenues, then compute the change and a status label.`,
      solution: `WITH y23 AS (
    SELECT product_id, SUM(amount) AS revenue FROM sales_2023 GROUP BY product_id
),
y24 AS (
    SELECT product_id, SUM(amount) AS revenue FROM sales_2024 GROUP BY product_id
)
SELECT COALESCE(a.product_id, b.product_id) AS product_id,
       COALESCE(a.revenue, 0) AS revenue_2023,
       COALESCE(b.revenue, 0) AS revenue_2024,
       COALESCE(b.revenue, 0) - COALESCE(a.revenue, 0) AS change,
       CASE WHEN a.product_id IS NULL THEN 'new in 2024'
            WHEN b.product_id IS NULL THEN 'dropped in 2024'
            WHEN b.revenue > a.revenue THEN 'grew'
            WHEN b.revenue < a.revenue THEN 'declined'
            ELSE 'flat' END AS status
FROM y23 AS a
FULL OUTER JOIN y24 AS b ON b.product_id = a.product_id
ORDER BY change;`,
      explanation: 'Aggregating each side to one row per key before the full outer join guarantees the join is one-to-one and cannot fan out. COALESCE-ing the revenues to zero makes the arithmetic work for products present in only one year, which is where the interesting answers are.',
    },
    {
      id: 'p26-q8',
      difficulty: 'hard',
      prompt: 'Compare two tables on every column without naming the columns twice, using set operators.',
      tables: ['customers', 'customers_stg'],
      think: 'EXCEPT compares whole rows. What does the symmetric difference of two tables tell you?',
      hint: 'Rows in A not in B, unioned with rows in B not in A — tagged by direction.',
      approach: `Select the comparable columns from the target and subtract the same projection of the source with EXCEPT.\nDo the same in the opposite direction.\nTag each branch with a direction label and UNION ALL them.\nA key appearing in both directions is a changed row; a key in one is an insert or a delete.`,
      solution: `SELECT 'only in target' AS side, customer_id, customer_name, email, city, country
FROM (
    SELECT customer_id, customer_name, email, city, country FROM customers
    EXCEPT
    SELECT customer_id, customer_name, email, city, country FROM customers_stg
) AS t

UNION ALL

SELECT 'only in source', customer_id, customer_name, email, city, country
FROM (
    SELECT customer_id, customer_name, email, city, country FROM customers_stg
    EXCEPT
    SELECT customer_id, customer_name, email, city, country FROM customers
) AS s
ORDER BY customer_id, side;`,
      explanation: 'EXCEPT compares entire rows with NULL-safe equality built in, so no IS DISTINCT FROM is needed — that is its main advantage over the join form. Its cost is that it deduplicates and gives no per-column detail, so you learn that a row changed but not which field.',
      dialect: 'EXCEPT is PostgreSQL / SQL Server / SQLite / Oracle (MINUS). MySQL 8.0.31+ supports EXCEPT; earlier versions need the anti-join form.',
    },
    {
      id: 'p26-q9',
      difficulty: 'hard',
      prompt: 'Produce a row-count and checksum comparison between two tables as a fast pre-check before a full row comparison.',
      tables: ['customers', 'customers_stg'],
      think: 'A full comparison is expensive. What cheap summary would prove the tables are identical, or prove they are not?',
      hint: 'Row counts plus an order-independent aggregate over a hash of each row.',
      approach: `Count the rows on each side.\nCompute a hash per row over the concatenated column values.\nAggregate those hashes with an order-independent function such as SUM so row order does not matter.\nCompare the two summaries; matching ones make a full comparison unnecessary.`,
      solution: `WITH t AS (
    SELECT COUNT(*) AS rows,
           SUM(('x' || SUBSTR(MD5(CONCAT_WS('|', customer_id, customer_name,
                                            email, city, country)), 1, 8))::bit(32)::bigint)
             AS checksum
    FROM customers
),
s AS (
    SELECT COUNT(*) AS rows,
           SUM(('x' || SUBSTR(MD5(CONCAT_WS('|', customer_id, customer_name,
                                            email, city, country)), 1, 8))::bit(32)::bigint)
             AS checksum
    FROM customers_stg
)
SELECT t.rows AS target_rows, s.rows AS source_rows,
       t.checksum AS target_checksum, s.checksum AS source_checksum,
       (t.rows = s.rows AND t.checksum = s.checksum) AS tables_match
FROM t CROSS JOIN s;`,
      explanation: 'SUM is order-independent, so the checksum does not depend on how either table is physically ordered — which is what makes the comparison valid. Matching checksums are strong evidence of equality and matching counts with different checksums prove a difference, either way saving a full row-by-row scan.',
      dialect: 'MD5 and the bit-cast trick are PostgreSQL. MySQL: SUM(CONV(SUBSTR(MD5(...), 1, 8), 16, 10)). SQL Server: CHECKSUM_AGG(BINARY_CHECKSUM(*)).',
    },
    {
      id: 'p26-q10',
      difficulty: 'hard',
      prompt: 'Generate the INSERT, UPDATE and DELETE work list needed to make customers match customers_stg.',
      tables: ['customers', 'customers_stg'],
      think: 'Three operations from one comparison. What determines which operation a key needs?',
      hint: 'Missing on the target is an insert, missing on the source is a delete, present on both but different is an update.',
      approach: `FULL OUTER JOIN the two tables on the business key.\nClassify each key into insert, update, delete or no-op using the presence and a NULL-safe value comparison.\nDiscard the no-ops.\nReturn the operation alongside the values needed to perform it.`,
      solution: `SELECT CASE WHEN c.customer_id IS NULL THEN 'INSERT'
            WHEN s.customer_id IS NULL THEN 'DELETE'
            ELSE                            'UPDATE'
       END AS operation,
       COALESCE(c.customer_id, s.customer_id) AS customer_id,
       s.customer_name AS new_name,
       s.email         AS new_email,
       s.city          AS new_city,
       s.country       AS new_country
FROM customers     AS c
FULL OUTER JOIN customers_stg AS s ON s.customer_id = c.customer_id
WHERE c.customer_id IS NULL
   OR s.customer_id IS NULL
   OR c.customer_name IS DISTINCT FROM s.customer_name
   OR c.email         IS DISTINCT FROM s.email
   OR c.city          IS DISTINCT FROM s.city
   OR c.country       IS DISTINCT FROM s.country
ORDER BY operation, customer_id;`,
      explanation: 'This is exactly what a MERGE statement does internally, expressed as a readable, reviewable work list — which is often preferable, because you can inspect and count the operations before applying them. The WHERE clause is what excludes unchanged rows, keeping the update set minimal.',
    },
  ],
};
