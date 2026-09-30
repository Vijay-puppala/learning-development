import type { Pattern } from '../types';

export const p32: Pattern = {
  num: 32,
  slug: 'remove-duplicate-rows',
  title: 'Remove Duplicate Rows',
  concept: 'ROW_NUMBER() + DELETE',
  category: 'Data Quality & Modeling',
  tagline: 'Number within the duplicate key, keep one, delete the rest — and always SELECT before you DELETE.',
  theory: `Deduplication is a three-decision process, and the SQL is the least interesting part.

**Which key defines a duplicate?** Same email? Same (customer, date, amount)? The entire row? This determines the PARTITION BY and nothing else in the query changes.

**Which copy survives?** Oldest, newest, most complete, lowest id. This is the window ORDER BY, and it must be deterministic — otherwise a rerun deletes a different row and the operation is not idempotent.

**How do you delete safely?** Number the rows with ROW_NUMBER over the duplicate key, then delete everything above 1. Always run the SELECT version first, count what it returns, and wrap the DELETE in a transaction you can roll back.

Mechanically there are three deletion idioms: DELETE using a CTE of doomed row ids (PostgreSQL, SQL Server); DELETE with a correlated NOT EXISTS against the survivors; and CREATE TABLE AS SELECT the survivors, then swap — which is usually fastest when a large fraction of the table is going.

If the table has no unique identifier at all, PostgreSQL's hidden ctid or an equivalent physical row identifier is the escape hatch.`,
  pitfalls: [
    'Running DELETE before running the equivalent SELECT and checking the count.',
    'A non-deterministic window ORDER BY, so which row survives varies between runs.',
    'Deleting without a transaction on a production table.',
    'Forgetting that the "duplicate" key may need normalising (case, whitespace) before it detects anything.',
    'Deleting rows that other tables reference, leaving orphaned children behind.',
  ],
  questions: [
    {
      id: 'p32-q1',
      difficulty: 'easy',
      prompt: 'Identify duplicate customers by email, marking which row to keep (oldest signup) and which to delete.',
      tables: ['customers'],
      think: 'Before writing any DELETE, what does the SELECT that lists the victims look like?',
      hint: 'ROW_NUMBER over the email partition, ordered so the survivor is number 1.',
      approach: `Partition by the duplicate key — the email.\nOrder so the copy you want to keep sorts first.\nNumber the rows.\nLabel row 1 as keep and everything else as delete.`,
      solution: `WITH ranked AS (
    SELECT customer_id, customer_name, email, signup_date,
           ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email))
                              ORDER BY signup_date, customer_id) AS rn
    FROM customers
    WHERE email IS NOT NULL
)
SELECT customer_id, customer_name, email, signup_date, rn,
       CASE WHEN rn = 1 THEN 'keep' ELSE 'delete' END AS action
FROM ranked
WHERE email IN (SELECT email FROM ranked WHERE rn > 1)
ORDER BY email, rn;`,
      explanation: 'Normalising the partition key with LOWER and TRIM is what makes the dedup catch "Ann@x.com" and " ann@x.com " as the same address. Producing a keep/delete worklist before any destructive statement is the habit that separates a safe deduplication from an incident.',
    },
    {
      id: 'p32-q2',
      difficulty: 'easy',
      prompt: 'Count how many rows a deduplication on email would remove.',
      tables: ['customers'],
      think: 'What number should you be able to quote before running the DELETE?',
      hint: 'Total rows minus distinct keys — or the count of rows numbered above 1.',
      approach: `Count the total rows with a non-null email.\nCount the distinct normalised emails.\nSubtract to get the number of rows that would be deleted.\nReturn all three figures.`,
      solution: `SELECT COUNT(*)                                  AS rows_total,
       COUNT(DISTINCT LOWER(TRIM(email)))       AS distinct_emails,
       COUNT(*) - COUNT(DISTINCT LOWER(TRIM(email))) AS rows_to_delete,
       ROUND(100.0 * (COUNT(*) - COUNT(DISTINCT LOWER(TRIM(email))))
             / NULLIF(COUNT(*), 0), 2)          AS pct_to_delete
FROM customers
WHERE email IS NOT NULL;`,
      explanation: 'Knowing the expected deletion count before you run the statement means you can compare it against the rows-affected message afterwards, and roll back immediately if they disagree. A pct_to_delete above a few percent usually deserves investigation before deletion.',
    },
    {
      id: 'p32-q3',
      difficulty: 'medium',
      prompt: 'Write the DELETE that removes duplicate customers by email, keeping the oldest signup.',
      tables: ['customers'],
      think: 'A DELETE needs to identify rows by a stable identifier. What does the CTE have to return?',
      hint: 'The primary keys of the rows to remove.',
      approach: `Build a CTE numbering rows within the normalised email partition.\nSelect the primary keys of rows numbered above 1.\nDelete from the table where the key is in that set.\nWrap the whole thing in a transaction.`,
      solution: `BEGIN;

WITH ranked AS (
    SELECT customer_id,
           ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email))
                              ORDER BY signup_date, customer_id) AS rn
    FROM customers
    WHERE email IS NOT NULL
)
DELETE FROM customers
WHERE customer_id IN (SELECT customer_id FROM ranked WHERE rn > 1);

-- Check the reported row count against question 2 before committing.
-- COMMIT;  -- or ROLLBACK;`,
      explanation: 'The CTE returns only primary keys, which is what makes the DELETE unambiguous — deleting by a matched set of attribute values would risk removing the survivor too. Leaving COMMIT commented out is deliberate: you verify the affected-row count first.',
      dialect: 'A CTE feeding DELETE works in PostgreSQL and SQL Server. MySQL: DELETE c FROM customers c JOIN (subquery) d ON c.customer_id = d.customer_id. Oracle: DELETE WHERE ROWID NOT IN (...).',
    },
    {
      id: 'p32-q4',
      difficulty: 'medium',
      prompt: 'Deduplicate using NOT EXISTS instead of a numbered CTE.',
      tables: ['customers'],
      think: 'A row should survive if it is the "best" of its group. How do you say "a better row exists" in a correlated subquery?',
      hint: 'Delete rows for which another row with the same key sorts earlier.',
      approach: `For each row, look for another row sharing the normalised email.\nRequire that other row to sort earlier under the survivor rule.\nDelete rows for which such a better row exists.\nThe comparison must be strict so no row deletes itself.`,
      solution: `BEGIN;

DELETE FROM customers AS c
WHERE EXISTS (
    SELECT 1
    FROM customers AS better
    WHERE LOWER(TRIM(better.email)) = LOWER(TRIM(c.email))
      AND (better.signup_date, better.customer_id)
        < (c.signup_date,      c.customer_id)
);

-- COMMIT;  -- or ROLLBACK;`,
      explanation: 'The strict row-value comparison is what stops a row from matching itself and deleting the entire group. This form needs no window function, which makes it usable on older engines, but it can be slower without an index on the normalised key.',
    },
    {
      id: 'p32-q5',
      difficulty: 'medium',
      prompt: 'Deduplicate on a composite key: same customer_id, order_date and amount in orders.',
      tables: ['orders'],
      think: 'What changes when the duplicate key has three columns instead of one?',
      hint: 'Only the PARTITION BY list.',
      approach: `Partition by the three columns that define a duplicate event.\nOrder by order_id so the lowest id survives.\nNumber the rows.\nList or delete everything above 1.`,
      solution: `WITH ranked AS (
    SELECT order_id, customer_id, order_date, amount,
           ROW_NUMBER() OVER (PARTITION BY customer_id, order_date, amount
                              ORDER BY order_id) AS rn
    FROM orders
)
SELECT order_id, customer_id, order_date, amount, rn,
       CASE WHEN rn = 1 THEN 'keep' ELSE 'delete' END AS action
FROM ranked
WHERE rn > 1
   OR (customer_id, order_date, amount) IN (
        SELECT customer_id, order_date, amount FROM ranked WHERE rn > 1)
ORDER BY customer_id, order_date, rn;`,
      explanation: 'order_id must stay out of the PARTITION BY — it is the column that differs between the duplicates, and including it would put every row in its own group. Keeping the lowest id is a defensible survivor rule because it is the first submission, but say so rather than leaving it implicit.',
    },
    {
      id: 'p32-q6',
      difficulty: 'medium',
      prompt: 'Deduplicate keeping the most complete row — the one with the fewest NULL fields.',
      tables: ['customers'],
      think: 'The survivor rule is now computed rather than stored. Where does that computation go?',
      hint: 'Count the NULLs per row as an expression, then order the window by it.',
      approach: `Compute a completeness score per row by counting its non-NULL fields.\nPartition by the duplicate key.\nOrder by that score descending, with a stable tiebreaker.\nKeep number 1.`,
      solution: `WITH scored AS (
    SELECT customer_id, customer_name, email, city, country, signup_date,
           (CASE WHEN customer_name IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN city          IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN country       IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN signup_date   IS NOT NULL THEN 1 ELSE 0 END) AS completeness
    FROM customers
    WHERE email IS NOT NULL
),
ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email))
                              ORDER BY completeness DESC, signup_date, customer_id) AS rn
    FROM scored
)
SELECT customer_id, customer_name, email, completeness, rn,
       CASE WHEN rn = 1 THEN 'keep' ELSE 'delete' END AS action
FROM ranked
ORDER BY email, rn;`,
      explanation: 'Keeping the most complete row loses less information than keeping the oldest, which is usually the better business rule for master data. The secondary sort on signup_date and customer_id is what keeps the choice deterministic when two copies are equally complete.',
    },
    {
      id: 'p32-q7',
      difficulty: 'hard',
      prompt: 'Merge duplicates instead of deleting them: build one row per email taking the first non-NULL value of each field.',
      tables: ['customers'],
      think: 'Deletion loses data that only the losing rows carried. What preserves it?',
      hint: 'Aggregate per key, taking the first non-NULL value of each column in a defined order.',
      approach: `Group the rows by the normalised email.\nFor each field, take the first non-NULL value under a consistent ordering.\nKeep the lowest customer_id as the surviving surrogate key.\nReturn one golden record per email.`,
      solution: `WITH ordered AS (
    SELECT LOWER(TRIM(email)) AS email_key,
           customer_id, customer_name, email, city, country, signup_date,
           ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email))
                              ORDER BY signup_date, customer_id) AS rn
    FROM customers
    WHERE email IS NOT NULL
)
SELECT email_key,
       MIN(customer_id) AS surviving_id,
       COUNT(*)         AS merged_from,
       MIN(customer_name) FILTER (WHERE customer_name IS NOT NULL) AS customer_name,
       MIN(city)          FILTER (WHERE city          IS NOT NULL) AS city,
       MIN(country)       FILTER (WHERE country       IS NOT NULL) AS country,
       MIN(signup_date)                                            AS first_seen
FROM ordered
GROUP BY email_key
ORDER BY merged_from DESC;`,
      explanation: 'A golden record keeps every field that any copy populated, so deduplication becomes lossless rather than destructive — usually what a master-data process actually wants. Using MIN with a FILTER is a portable stand-in for "first non-NULL"; PostgreSQL 16+ can write MIN(city) with an IGNORE NULLS window instead.',
      dialect: 'FILTER is PostgreSQL / SQLite. Elsewhere: MIN(CASE WHEN city IS NOT NULL THEN city END), which is equivalent since MIN already ignores NULLs.',
    },
    {
      id: 'p32-q8',
      difficulty: 'hard',
      prompt: 'Deduplicate a table that has no primary key at all.',
      tables: ['customers_stg'],
      think: 'Every deletion idiom so far identified rows by a key. What identifies a row when there is none?',
      hint: 'A physical row identifier — ctid in PostgreSQL, ROWID in Oracle — or rebuild the table from a DISTINCT select.',
      approach: `Use the engine's physical row identifier as a stand-in key.\nNumber rows within the duplicate key, ordered by that identifier.\nDelete rows numbered above 1 by their physical identifier.\nOr, more simply, rebuild the table from a deduplicated select and swap it in.`,
      solution: `-- PostgreSQL: ctid is the physical row location
BEGIN;
DELETE FROM customers_stg AS s
WHERE s.ctid NOT IN (
    SELECT MIN(inner_s.ctid)
    FROM customers_stg AS inner_s
    GROUP BY inner_s.customer_id, inner_s.customer_name,
             inner_s.email, inner_s.city, inner_s.country
);
-- COMMIT;

-- Portable alternative: rebuild and swap
-- CREATE TABLE customers_stg_new AS SELECT DISTINCT * FROM customers_stg;
-- DROP TABLE customers_stg;
-- ALTER TABLE customers_stg_new RENAME TO customers_stg;`,
      explanation: 'ctid is stable only within a transaction — VACUUM and UPDATE can move rows — which is why the delete must run inside one. The rebuild-and-swap alternative is usually better on a large table anyway, since writing the survivors is cheaper than deleting the majority.',
      dialect: 'ctid is PostgreSQL. Oracle: ROWID. SQL Server has no equivalent, so add an IDENTITY column or use the ROW_NUMBER-in-a-CTE DELETE, which SQL Server supports directly.',
    },
    {
      id: 'p32-q9',
      difficulty: 'hard',
      prompt: 'Deduplicate while preserving referential integrity: repoint orders at the surviving customer before deleting the losers.',
      tables: ['customers', 'orders'],
      think: 'Deleting a duplicate customer orphans their orders. What has to happen first, and in what order?',
      hint: 'Build a mapping from loser id to survivor id, UPDATE the children, then DELETE the parents.',
      approach: `Number the duplicate customers and build a mapping from each loser to its group's survivor.\nUPDATE orders so every loser's orders point at the survivor.\nOnly then DELETE the losing customer rows.\nRun all three steps in one transaction.`,
      solution: `BEGIN;

CREATE TEMP TABLE dedup_map AS
WITH ranked AS (
    SELECT customer_id,
           LOWER(TRIM(email)) AS email_key,
           ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email))
                              ORDER BY signup_date, customer_id) AS rn,
           FIRST_VALUE(customer_id) OVER (PARTITION BY LOWER(TRIM(email))
                                          ORDER BY signup_date, customer_id) AS survivor_id
    FROM customers
    WHERE email IS NOT NULL
)
SELECT customer_id AS loser_id, survivor_id
FROM ranked
WHERE rn > 1;

UPDATE orders AS o
SET customer_id = m.survivor_id
FROM dedup_map AS m
WHERE o.customer_id = m.loser_id;

DELETE FROM customers
WHERE customer_id IN (SELECT loser_id FROM dedup_map);

-- COMMIT;  -- or ROLLBACK;`,
      explanation: 'The order is non-negotiable: repoint the children first, or the foreign key blocks the delete (if enforced) or you create orphans (if not). Materialising the mapping in a temp table means the same survivor assignment is used by both the UPDATE and the DELETE, which a recomputed window could not guarantee.',
    },
    {
      id: 'p32-q10',
      difficulty: 'hard',
      prompt: 'Prevent future duplicates rather than cleaning them repeatedly.',
      tables: ['customers'],
      think: 'Deduplication is a symptom. What is the structural fix, and what must be true before you can apply it?',
      hint: 'A unique constraint — but it can only be created once the existing duplicates are gone.',
      approach: `Deduplicate the existing data first, since a unique index cannot be created over duplicates.\nAdd a unique index on the normalised key rather than the raw column.\nConsider a partial index if NULLs should be allowed.\nDecide how the application should behave on conflict.`,
      solution: `-- 1. Deduplicate first (a unique index cannot be built over duplicates).

-- 2. Enforce uniqueness on the NORMALISED key, not the raw column:
CREATE UNIQUE INDEX customers_email_uniq
    ON customers (LOWER(TRIM(email)))
    WHERE email IS NOT NULL;

-- 3. Make inserts idempotent so the application does not error on retry:
-- INSERT INTO customers (customer_id, customer_name, email)
-- VALUES (:id, :name, :email)
-- ON CONFLICT (LOWER(TRIM(email))) WHERE email IS NOT NULL
-- DO UPDATE SET customer_name = EXCLUDED.customer_name;`,
      explanation: 'Indexing the raw column would still allow "Ann@x.com" and "ann@x.com" as two rows, which is why the index is on the same expression the dedup used. The partial WHERE clause lets several rows have a NULL email — usually desirable, since NULL means "unknown" rather than a specific shared value.',
      dialect: 'Expression and partial indexes are PostgreSQL / SQLite. MySQL 8 supports functional indexes but not partial ones — use a generated column. SQL Server: an indexed computed column plus a filtered index.',
    },
  ],
};
