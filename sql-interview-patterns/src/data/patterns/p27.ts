import type { Pattern } from '../types';

export const p27: Pattern = {
  num: 27,
  slug: 'detect-changed-records',
  title: 'Detect Changed Records',
  concept: 'FULL OUTER JOIN',
  category: 'Data Quality & Modeling',
  tagline: 'Change Data Capture without a CDC tool: classify every key as inserted, updated, deleted or unchanged.',
  theory: `Detecting change is the engine room of every incremental pipeline. Given yesterday's snapshot and today's, classify each business key into four buckets: **inserted** (new today), **deleted** (gone today), **updated** (present both days, values differ), **unchanged**.

The join is a FULL OUTER JOIN on the business key so all four are reachable in one pass. Everything else is about doing the comparison honestly.

**NULL-safe comparison is mandatory.** A column going from a value to NULL, or NULL to a value, is a real change. Plain <> returns UNKNOWN for those and files them as unchanged — the most consequential silent bug in ETL.

**Hash columns scale better than column lists.** Comparing twenty columns means twenty IS DISTINCT FROM clauses that must be maintained. Hashing the concatenated row into one value reduces that to one comparison, at the cost of needing a deterministic serialisation — a NULL-safe separator and a consistent null marker, or "a|b" and "a||b" can collide.

**Only compare what matters.** Excluding load timestamps and audit columns from the hash stops every row appearing changed on every run.`,
  pitfalls: [
    'Using <> instead of IS DISTINCT FROM, missing every change to or from NULL.',
    'Hashing without a null marker, so NULL and empty string collide and real changes are missed.',
    'Including load_timestamp in the comparison, making every row look changed on every run.',
    'Comparing on a non-unique key, which fans out and produces phantom changes.',
    'Assuming deletions exist in an incremental feed — a source that only sends changed rows cannot tell you what was deleted.',
  ],
  questions: [
    {
      id: 'p27-q1',
      difficulty: 'easy',
      prompt: 'Classify each customer_id as inserted, deleted, updated or unchanged between customers and customers_stg.',
      tables: ['customers', 'customers_stg'],
      think: 'Four outcomes from one join. What distinguishes updated from unchanged?',
      hint: 'Presence tests give three buckets; a NULL-safe value comparison splits the third.',
      approach: `FULL OUTER JOIN on the business key.\nBranch first on which side is missing to get inserted and deleted.\nFor rows on both sides, compare the attribute columns NULL-safely.\nLabel the result and return one row per key.`,
      solution: `SELECT COALESCE(s.customer_id, c.customer_id) AS customer_id,
       CASE WHEN c.customer_id IS NULL                   THEN 'inserted'
            WHEN s.customer_id IS NULL                   THEN 'deleted'
            WHEN c.customer_name IS DISTINCT FROM s.customer_name
              OR c.email         IS DISTINCT FROM s.email
              OR c.city          IS DISTINCT FROM s.city
              OR c.country       IS DISTINCT FROM s.country THEN 'updated'
            ELSE                                              'unchanged'
       END AS change_type
FROM customers     AS c
FULL OUTER JOIN customers_stg AS s ON s.customer_id = c.customer_id
ORDER BY change_type, customer_id;`,
      explanation: 'The CASE arms must be ordered with the presence tests first, or a new row would fall into the value comparison against NULLs and be misclassified. This four-way classification is the entire output contract of a CDC step.',
    },
    {
      id: 'p27-q2',
      difficulty: 'easy',
      prompt: 'Count how many rows fall into each change type — the load summary.',
      tables: ['customers', 'customers_stg'],
      think: 'What does a change summary let you catch that inspecting individual rows does not?',
      hint: 'Anomalous volumes. A load that suddenly reports 90% updated is usually broken, not busy.',
      approach: `Build the four-way classification in a CTE.\nGroup by the change type and count.\nAdd the percentage of the total.\nThis summary is what a pipeline should log and alert on.`,
      solution: `WITH classified AS (
    SELECT CASE WHEN c.customer_id IS NULL THEN 'inserted'
                WHEN s.customer_id IS NULL THEN 'deleted'
                WHEN c.email IS DISTINCT FROM s.email
                  OR c.city  IS DISTINCT FROM s.city  THEN 'updated'
                ELSE                                       'unchanged'
           END AS change_type
    FROM customers AS c
    FULL OUTER JOIN customers_stg AS s ON s.customer_id = c.customer_id
)
SELECT change_type,
       COUNT(*) AS rows,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM classified
GROUP BY change_type
ORDER BY rows DESC;`,
      explanation: 'The percentages are the alert condition: a healthy daily delta is mostly unchanged, so a run reporting 90% updated usually means a timestamp column crept into the comparison or the source changed a format. Logging this summary per run is cheap insurance.',
    },
    {
      id: 'p27-q3',
      difficulty: 'medium',
      prompt: 'Show why <> instead of IS DISTINCT FROM misses changes, with a query that quantifies how many.',
      tables: ['customers', 'customers_stg'],
      think: 'Which specific transitions does <> fail to detect?',
      hint: 'Value to NULL, and NULL to value. Count the rows where the two operators disagree.',
      approach: `Join the two tables on the key.\nEvaluate both the naive and the NULL-safe comparison for each row.\nKeep rows where the two disagree.\nThose are exactly the changes a naive comparison would lose.`,
      solution: `SELECT c.customer_id,
       c.email AS target_email,
       s.email AS source_email,
       (c.email <> s.email)               AS naive_says_changed,
       (c.email IS DISTINCT FROM s.email) AS safe_says_changed
FROM customers     AS c
JOIN customers_stg AS s ON s.customer_id = c.customer_id
WHERE (c.email IS DISTINCT FROM s.email)
  AND (c.email <> s.email) IS NOT TRUE
ORDER BY c.customer_id;`,
      explanation: 'Every returned row is a genuine change that a naive pipeline would silently drop, leaving stale data in the warehouse with no error anywhere. The (…) IS NOT TRUE form is needed because the naive comparison returns UNKNOWN rather than FALSE on these rows.',
    },
    {
      id: 'p27-q4',
      difficulty: 'medium',
      prompt: 'Compare rows using a single hash column instead of listing every field.',
      tables: ['customers', 'customers_stg'],
      think: 'Concatenating "a" + "b" and "ab" + "" give the same string. How do you stop that collision?',
      hint: 'Use a separator that cannot appear in the data, and an explicit marker for NULL.',
      approach: `For each side, concatenate the comparable columns with a separator, replacing NULL with an explicit marker.\nHash the resulting string.\nFULL OUTER JOIN on the key and compare the two hashes NULL-safely.\nClassify as before but with one comparison instead of many.`,
      solution: `WITH t AS (
    SELECT customer_id,
           MD5(CONCAT_WS('|', COALESCE(customer_name, '<NULL>'),
                              COALESCE(email,         '<NULL>'),
                              COALESCE(city,          '<NULL>'),
                              COALESCE(country,       '<NULL>'))) AS row_hash
    FROM customers
),
s AS (
    SELECT customer_id,
           MD5(CONCAT_WS('|', COALESCE(customer_name, '<NULL>'),
                              COALESCE(email,         '<NULL>'),
                              COALESCE(city,          '<NULL>'),
                              COALESCE(country,       '<NULL>'))) AS row_hash
    FROM customers_stg
)
SELECT COALESCE(s.customer_id, t.customer_id) AS customer_id,
       CASE WHEN t.customer_id IS NULL            THEN 'inserted'
            WHEN s.customer_id IS NULL            THEN 'deleted'
            WHEN t.row_hash <> s.row_hash         THEN 'updated'
            ELSE                                       'unchanged'
       END AS change_type
FROM t
FULL OUTER JOIN s ON s.customer_id = t.customer_id
ORDER BY change_type, customer_id;`,
      explanation: 'The explicit <NULL> marker is what prevents a NULL and an empty string hashing identically, which would hide real changes. Storing row_hash as a persisted column on the target turns every future comparison into a single indexed equality test — the standard warehouse pattern.',
      dialect: 'MD5 is PostgreSQL / MySQL. SQL Server: HASHBYTES(\'MD5\', ...). Snowflake: HASH or MD5. Use SHA-256 where collision resistance matters.',
    },
    {
      id: 'p27-q5',
      difficulty: 'medium',
      prompt: 'Detect changes while ignoring audit columns such as a load timestamp.',
      tables: ['customers', 'customers_stg'],
      think: 'Which columns represent the business fact, and which merely record when the row was loaded?',
      hint: 'Compare only the business columns — an audit column changes on every run by design.',
      approach: `List the business columns explicitly rather than using every column.\nExclude load timestamps, batch ids and surrogate keys from the comparison.\nCompare only that list NULL-safely.\nDocument the exclusion in the query so future maintainers do not re-add them.`,
      solution: `SELECT c.customer_id,
       'updated' AS change_type,
       c.email   AS old_email,
       s.email   AS new_email
FROM customers     AS c
JOIN customers_stg AS s ON s.customer_id = c.customer_id
-- Business columns only. Deliberately excluded: any load_timestamp,
-- batch_id or surrogate key, which change on every run by design.
WHERE c.customer_name IS DISTINCT FROM s.customer_name
   OR c.email         IS DISTINCT FROM s.email
   OR c.city          IS DISTINCT FROM s.city
   OR c.country       IS DISTINCT FROM s.country
ORDER BY c.customer_id;`,
      explanation: 'Including an audit column makes every row differ on every run, so the update volume equals the table size and the pipeline does maximum work for zero information. Writing the exclusion as a comment beside the column list is what stops it being reintroduced by the next person who adds a field.',
    },
    {
      id: 'p27-q6',
      difficulty: 'medium',
      prompt: 'Return only the changed rows, with the old and new values of every field that moved.',
      tables: ['customers', 'customers_stg'],
      think: 'A change report is read by a human. What makes it actionable rather than just correct?',
      hint: 'Show both values side by side and name the fields that moved.',
      approach: `Inner join the two tables on the key, since only rows on both sides can be updates.\nFilter to rows where at least one comparable field differs.\nReturn each field's old and new value in adjacent columns.\nAdd a concatenated list of changed field names.`,
      solution: `SELECT c.customer_id,
       CONCAT_WS(', ',
           CASE WHEN c.customer_name IS DISTINCT FROM s.customer_name THEN 'name'    END,
           CASE WHEN c.email         IS DISTINCT FROM s.email         THEN 'email'   END,
           CASE WHEN c.city          IS DISTINCT FROM s.city          THEN 'city'    END,
           CASE WHEN c.country       IS DISTINCT FROM s.country       THEN 'country' END
       ) AS fields_changed,
       c.customer_name AS old_name,  s.customer_name AS new_name,
       c.email         AS old_email, s.email         AS new_email,
       c.city          AS old_city,  s.city          AS new_city
FROM customers     AS c
JOIN customers_stg AS s ON s.customer_id = c.customer_id
WHERE c.customer_name IS DISTINCT FROM s.customer_name
   OR c.email         IS DISTINCT FROM s.email
   OR c.city          IS DISTINCT FROM s.city
   OR c.country       IS DISTINCT FROM s.country
ORDER BY c.customer_id;`,
      explanation: 'Pairing old and new values in adjacent columns is what lets a reviewer spot a systematic problem — twenty rows where the city changed from a name to a code is a source format change, not twenty customer relocations. The fields_changed summary makes that pattern visible at a glance.',
    },
    {
      id: 'p27-q7',
      difficulty: 'hard',
      prompt: 'Detect changes against an SCD Type 2 dimension, comparing staging only against the current version of each customer.',
      tables: ['customer_dim', 'customers_stg'],
      think: 'The dimension holds several versions per business key. Which one is the comparison baseline?',
      hint: 'Only the open row — is_current true, or end_date at the sentinel.',
      approach: `Restrict the dimension to its current rows so there is exactly one per business key.\nFULL OUTER JOIN that against staging on the business key.\nClassify inserted, deleted and updated as before.\nReturn the surrogate key too, since an update must close that specific version.`,
      solution: `WITH current_dim AS (
    SELECT cust_key, customer_id, customer_name, city
    FROM customer_dim
    WHERE is_current = TRUE
)
SELECT COALESCE(s.customer_id, d.customer_id) AS customer_id,
       d.cust_key AS version_to_close,
       CASE WHEN d.customer_id IS NULL                       THEN 'new customer'
            WHEN s.customer_id IS NULL                       THEN 'disappeared at source'
            WHEN d.customer_name IS DISTINCT FROM s.customer_name
              OR d.city          IS DISTINCT FROM s.city     THEN 'new version needed'
            ELSE                                                  'no change'
       END AS action,
       d.city AS current_city,
       s.city AS incoming_city
FROM current_dim   AS d
FULL OUTER JOIN customers_stg AS s ON s.customer_id = d.customer_id
ORDER BY action, customer_id;`,
      explanation: 'Filtering to the current version first is what makes the join one-to-one — comparing against the full dimension would match staging against every historical version and report spurious changes. The surrogate key in the output is what the update step needs to close the superseded row.',
    },
    {
      id: 'p27-q8',
      difficulty: 'hard',
      prompt: 'Handle an incremental feed that only sends changed rows: detect inserts and updates but explain why deletes are undetectable.',
      tables: ['customers', 'customers_stg'],
      think: 'A feed containing only changed rows carries no evidence about rows that did not change. What does absence mean?',
      hint: 'Absence is ambiguous — unchanged or deleted — so deletes need a separate signal.',
      approach: `Join staging to the target on the key.\nClassify rows present in staging as insert or update.\nDo not classify absent keys, because absence does not distinguish unchanged from deleted.\nNote the schema change needed — a soft-delete flag or a periodic full reconciliation.`,
      solution: `SELECT s.customer_id,
       CASE WHEN c.customer_id IS NULL THEN 'insert'
            WHEN c.email IS DISTINCT FROM s.email
              OR c.city  IS DISTINCT FROM s.city THEN 'update'
            ELSE 'resent unchanged'
       END AS action,
       s.email AS new_email,
       s.city  AS new_city
FROM customers_stg AS s
LEFT JOIN customers AS c ON c.customer_id = s.customer_id
ORDER BY action, s.customer_id;

-- Deletes are NOT derivable here: a key absent from the feed means either
-- "unchanged" or "deleted", and nothing in the data separates them. The fix
-- is a tombstone / is_deleted flag in the feed, or a periodic full snapshot
-- reconciliation (question 1 of this pattern).`,
      explanation: 'Recognising what the data cannot tell you is the point of this question — an engineer who invents a delete rule from absence will quietly destroy rows. The two real solutions are a soft-delete flag from the source or a scheduled full comparison, and naming them is the expected answer.',
    },
    {
      id: 'p27-q9',
      difficulty: 'hard',
      prompt: 'Build a change-history audit table from two snapshots, with one row per field that changed.',
      tables: ['customers', 'customers_stg'],
      think: 'The output grain is one row per changed field, not per changed record. What turns columns into rows?',
      hint: 'Unpivot the comparison with a lateral VALUES list of (field name, old, new) triples.',
      approach: `Join the two snapshots on the business key.\nCross join laterally against a VALUES list pairing each field name with its old and new value.\nKeep only the expanded rows where old and new differ NULL-safely.\nStamp each with the detection time.`,
      solution: `SELECT c.customer_id,
       v.field_name,
       v.old_value,
       v.new_value,
       CURRENT_TIMESTAMP AS detected_at
FROM customers     AS c
JOIN customers_stg AS s ON s.customer_id = c.customer_id
CROSS JOIN LATERAL (
    VALUES ('customer_name', c.customer_name, s.customer_name),
           ('email',         c.email,         s.email),
           ('city',          c.city,          s.city),
           ('country',       c.country,       s.country)
) AS v(field_name, old_value, new_value)
WHERE v.old_value IS DISTINCT FROM v.new_value
ORDER BY c.customer_id, v.field_name;`,
      explanation: 'The lateral VALUES list expands one wide row into one row per field, so the filter can be a single NULL-safe comparison rather than one per column. Field-level audit rows are far more useful than record-level ones — they answer "when did this customer\'s email last change" directly.',
      dialect: 'CROSS JOIN LATERAL is PostgreSQL / Oracle. SQL Server: CROSS APPLY (VALUES ...). MySQL: UNION ALL one SELECT per field.',
    },
    {
      id: 'p27-q10',
      difficulty: 'hard',
      prompt: 'Write the MERGE statement that applies the detected changes, and say when you would use the query-based approach instead.',
      tables: ['customers', 'customers_stg'],
      think: 'MERGE does detection and application in one statement. What do you lose by combining them?',
      hint: 'Visibility. You cannot review or count the changes before they are applied.',
      approach: `Write a MERGE using the business key as the match condition.\nUpdate matched rows only when a field actually differs, to avoid needless writes.\nInsert unmatched source rows.\nDelete target rows absent from the source only when the source is a full snapshot.`,
      solution: `MERGE INTO customers AS t
USING customers_stg AS s
   ON t.customer_id = s.customer_id

WHEN MATCHED AND (t.customer_name IS DISTINCT FROM s.customer_name
               OR t.email         IS DISTINCT FROM s.email
               OR t.city          IS DISTINCT FROM s.city
               OR t.country       IS DISTINCT FROM s.country)
THEN UPDATE SET customer_name = s.customer_name,
                email         = s.email,
                city          = s.city,
                country       = s.country

WHEN NOT MATCHED
THEN INSERT (customer_id, customer_name, email, city, country)
     VALUES (s.customer_id, s.customer_name, s.email, s.city, s.country)

-- Only safe when customers_stg is a FULL snapshot, never an incremental feed:
WHEN NOT MATCHED BY SOURCE
THEN DELETE;`,
      explanation: 'The AND clause on WHEN MATCHED is what stops MERGE rewriting every matched row, which would inflate write volume and, on an SCD, create a new version for rows that did not change. The delete branch is the dangerous one: on an incremental feed it would erase every row the source simply did not resend, which is why the query-based work list is preferable whenever the change set needs reviewing first.',
      dialect: 'MERGE is standard SQL, in PostgreSQL 15+, SQL Server, Oracle and Snowflake. WHEN NOT MATCHED BY SOURCE is SQL Server and PostgreSQL 17+. MySQL uses INSERT ... ON DUPLICATE KEY UPDATE, which has no delete branch.',
    },
  ],
};
