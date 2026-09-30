import type { Pattern } from '../types';

export const p33: Pattern = {
  num: 33,
  slug: 'replace-null-values',
  title: 'Replace NULL Values',
  concept: 'COALESCE()',
  category: 'Data Quality & Modeling',
  tagline: 'NULL is "unknown", not zero. Replacing it is a decision about meaning, not a formatting step.',
  theory: `NULL means *unknown or not applicable*. It is not zero, not an empty string, and not false. Every rule about NULL follows from that.

**Three-valued logic.** Any comparison with NULL yields UNKNOWN, and WHERE keeps only TRUE. So NULL = NULL is UNKNOWN, NULL <> 'x' is UNKNOWN, and both filter the row out. Use IS NULL, IS NOT NULL and IS [NOT] DISTINCT FROM.

**Aggregates skip NULLs.** AVG of (10, 20, NULL) is 15, not 10 — the NULL is excluded from both numerator and denominator. COUNT(col) skips them; COUNT(*) does not. SUM over an all-NULL set returns NULL, not 0.

**Arithmetic and concatenation propagate.** NULL + 5 is NULL; 'a' || NULL is NULL in standard SQL.

The tools: **COALESCE(a, b, c)** returns the first non-NULL argument and is standard. **NULLIF(a, b)** returns NULL when a = b — the idiomatic division guard. IFNULL and ISNULL are vendor-specific two-argument versions.

The judgement call is *whether* to replace. Coalescing an unknown salary to 0 turns an absence into a claim, and it will drag an average down. Replace NULL at the presentation boundary; keep it in the data.`,
  pitfalls: [
    'COALESCE-ing a measure to 0 before aggregating, which corrupts averages by inventing observations.',
    'Using = or <> with NULL instead of IS NULL / IS DISTINCT FROM.',
    'Assuming SUM returns 0 for an empty or all-NULL group — it returns NULL.',
    'COALESCE with mismatched argument types, which either errors or silently coerces.',
    'Treating an empty string as equivalent to NULL. In Oracle they are the same; everywhere else they are not.',
  ],
  questions: [
    {
      id: 'p33-q1',
      difficulty: 'easy',
      prompt: 'Display customers with a readable placeholder wherever city or country is missing.',
      tables: ['customers'],
      think: 'Is this replacement changing the data, or only how it is displayed?',
      hint: 'Only the display — which is exactly where COALESCE belongs.',
      approach: `Select the customer columns.\nWrap each nullable text column in COALESCE with a placeholder.\nChoose a placeholder that cannot be confused with a real value.\nLeave the underlying data untouched.`,
      solution: `SELECT customer_id,
       customer_name,
       COALESCE(city,    '(unknown)') AS city,
       COALESCE(country, '(unknown)') AS country,
       COALESCE(email,   '(no email on file)') AS email
FROM customers
ORDER BY customer_id;`,
      explanation: 'Replacing NULL at the presentation boundary is safe because no aggregate or comparison sees the substitute. Parenthesised placeholders are chosen deliberately so nobody mistakes "(unknown)" for a city called Unknown.',
    },
    {
      id: 'p33-q2',
      difficulty: 'easy',
      prompt: 'Show the difference between AVG over raw salaries and AVG after coalescing NULL salaries to zero.',
      tables: ['employees'],
      think: 'Which of the two answers "what does the average employee earn"?',
      hint: 'The raw one. Coalescing to zero adds fictitious zero-salary employees to the denominator.',
      approach: `Compute AVG over the salary column directly, which ignores NULLs.\nCompute AVG over COALESCE(salary, 0), which counts NULLs as zeros.\nReturn both plus the counts behind them.\nCompare and conclude which is meaningful.`,
      solution: `SELECT COUNT(*)                        AS employees,
       COUNT(salary)                   AS with_known_salary,
       ROUND(AVG(salary), 2)           AS avg_ignoring_nulls,
       ROUND(AVG(COALESCE(salary, 0)), 2) AS avg_treating_null_as_zero,
       ROUND(AVG(salary) - AVG(COALESCE(salary, 0)), 2) AS distortion
FROM employees;`,
      explanation: 'AVG(salary) divides the sum by COUNT(salary); AVG(COALESCE(salary, 0)) divides by COUNT(*), so every unknown salary pulls the average towards zero. The first answers "what do people earn", the second answers a question nobody asked.',
    },
    {
      id: 'p33-q3',
      difficulty: 'medium',
      prompt: 'Return every customer\'s total spend, showing 0 for customers with no orders.',
      tables: ['customers', 'orders'],
      think: 'Here zero really is the right answer. Why is this case different from the salary one?',
      hint: 'A customer with no orders genuinely spent nothing — the value is known, not unknown.',
      approach: `LEFT JOIN customers to orders so every customer survives.\nGroup by the customer and sum the amounts.\nCOALESCE the resulting sum, which is NULL for customers with no orders.\nCount orders with COUNT of the key so it is zero rather than one.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       COUNT(o.order_id)          AS order_count,
       COALESCE(SUM(o.amount), 0) AS total_spend
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.customer_name
ORDER BY total_spend DESC;`,
      explanation: 'SUM over an empty set returns NULL rather than 0, so the COALESCE is doing real work here — and it is legitimate because "no orders" means spend is known to be zero, not unknown. That distinction is the whole judgement call in this pattern.',
    },
    {
      id: 'p33-q4',
      difficulty: 'medium',
      prompt: 'Compute an average order value per customer, guarding against division by zero.',
      tables: ['customers', 'orders'],
      think: 'What is the idiomatic way to turn a zero denominator into a NULL result rather than an error?',
      hint: 'NULLIF(denominator, 0).',
      approach: `Aggregate orders per customer with a LEFT JOIN so everyone appears.\nDivide the total spend by the order count.\nWrap the denominator in NULLIF against zero so customers with no orders yield NULL rather than an error.\nLeave that NULL as NULL — an average of nothing is genuinely undefined.`,
      solution: `SELECT c.customer_id,
       c.customer_name,
       COUNT(o.order_id)          AS order_count,
       COALESCE(SUM(o.amount), 0) AS total_spend,
       ROUND(SUM(o.amount) / NULLIF(COUNT(o.order_id), 0), 2) AS avg_order_value
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.customer_name
ORDER BY avg_order_value DESC NULLS LAST;`,
      explanation: 'NULLIF turns the zero denominator into NULL, and dividing by NULL yields NULL instead of raising an error — the standard division guard. Note the asymmetry with the previous column: total spend is coalesced to 0 because it is known, while the average stays NULL because it is genuinely undefined.',
    },
    {
      id: 'p33-q5',
      difficulty: 'medium',
      prompt: 'Build a display name that falls back through several columns: customer_name, then email, then a generic label.',
      tables: ['customers'],
      think: 'COALESCE picks the first non-NULL. What if a column is present but empty?',
      hint: 'Convert empty strings to NULL first with NULLIF, so COALESCE can skip them too.',
      approach: `Convert each candidate column's empty string to NULL with NULLIF.\nCOALESCE across the candidates in priority order.\nEnd with a literal fallback that can never be NULL.\nLabel which source supplied the value.`,
      solution: `SELECT customer_id,
       COALESCE(NULLIF(TRIM(customer_name), ''),
                NULLIF(TRIM(email), ''),
                'Customer #' || customer_id) AS display_name,
       CASE WHEN NULLIF(TRIM(customer_name), '') IS NOT NULL THEN 'name'
            WHEN NULLIF(TRIM(email), '')         IS NOT NULL THEN 'email'
            ELSE                                                  'generated'
       END AS name_source
FROM customers
ORDER BY name_source, customer_id;`,
      explanation: 'NULLIF(TRIM(x), \'\') collapses whitespace-only and empty values into NULL so COALESCE treats them as missing — without it, a row with a single space for a name wins the fallback chain. Tracking name_source makes the fallback rate measurable rather than invisible.',
    },
    {
      id: 'p33-q6',
      difficulty: 'medium',
      prompt: 'Find rows where two nullable columns differ, counting a NULL-to-value change as a difference.',
      tables: ['customers', 'customers_stg'],
      think: 'What does c.city <> s.city return when one side is NULL?',
      hint: 'UNKNOWN — so the row is filtered out. Use IS DISTINCT FROM, or COALESCE both sides to a sentinel.',
      approach: `Join the two tables on the key.\nCompare the nullable columns with a NULL-safe inequality.\nShow the equivalent COALESCE-to-sentinel form as the portable alternative.\nReturn both values so the change is visible.`,
      solution: `SELECT c.customer_id,
       c.city AS target_city,
       s.city AS source_city,
       (c.city IS DISTINCT FROM s.city)                        AS null_safe_differs,
       (COALESCE(c.city, '<NULL>') <> COALESCE(s.city, '<NULL>')) AS sentinel_differs
FROM customers     AS c
JOIN customers_stg AS s ON s.customer_id = c.customer_id
WHERE c.city IS DISTINCT FROM s.city
ORDER BY c.customer_id;`,
      explanation: 'Both columns return the same answer: IS DISTINCT FROM is the standard operator, and COALESCE to an impossible sentinel is the portable fallback for engines that lack it. The sentinel must be a value that cannot occur in the data, or a real city called "<NULL>" would break the comparison.',
    },
    {
      id: 'p33-q7',
      difficulty: 'hard',
      prompt: 'Forward-fill missing city values in customer_dim, carrying the last known value into each NULL row.',
      tables: ['customer_dim'],
      think: 'COALESCE only looks across columns of one row. What looks across rows?',
      hint: 'A running COUNT of the non-NULL column creates a group id that changes only at each real value.',
      approach: `Partition by the customer and order by start_date.\nCount the non-NULL city values from the start of the partition to the current row — COUNT ignores NULLs, so it only increments on real values.\nEvery NULL therefore shares a group with the last real value before it.\nTake MAX of city within that group to fill the NULLs.`,
      solution: `WITH grouped AS (
    SELECT customer_id,
           start_date,
           city,
           COUNT(city) OVER (PARTITION BY customer_id
                             ORDER BY start_date
                             ROWS BETWEEN UNBOUNDED PRECEDING
                                      AND CURRENT ROW) AS fill_group
    FROM customer_dim
)
SELECT customer_id,
       start_date,
       city                                                 AS city_raw,
       MAX(city) OVER (PARTITION BY customer_id, fill_group) AS city_filled,
       (city IS NULL)                                       AS was_filled
FROM grouped
ORDER BY customer_id, start_date;`,
      explanation: 'The trick rests on COUNT(col) ignoring NULLs: the running count stays flat across a run of NULLs and increments only when a real value arrives, so each NULL inherits the group of the value that preceded it. Rows before the first non-NULL stay NULL, which is correct — there is nothing to carry forward yet.',
      dialect: 'PostgreSQL 16+, Oracle and Snowflake offer LAST_VALUE(city IGNORE NULLS) OVER (...) as a one-liner. The COUNT-group technique works everywhere.',
    },
    {
      id: 'p33-q8',
      difficulty: 'hard',
      prompt: 'Produce a NULL audit: for every column of customers, the count and percentage of NULLs.',
      tables: ['customers'],
      think: 'The output has one row per column. What turns columns into rows?',
      hint: 'A lateral VALUES list, or a UNION ALL of one aggregate per column.',
      approach: `Cross join the table against a VALUES list pairing each column name with its value.\nGroup by the column name.\nCount the rows and the NULLs in each.\nCompute the NULL percentage and sort the worst first.`,
      solution: `SELECT v.column_name,
       COUNT(*)                                           AS rows,
       COUNT(*) FILTER (WHERE v.value IS NULL)            AS nulls,
       ROUND(100.0 * COUNT(*) FILTER (WHERE v.value IS NULL)
             / NULLIF(COUNT(*), 0), 2)                    AS null_pct
FROM customers AS c
CROSS JOIN LATERAL (
    VALUES ('customer_name', c.customer_name),
           ('email',         c.email),
           ('city',          c.city),
           ('country',       c.country),
           ('signup_date',   CAST(c.signup_date AS text))
) AS v(column_name, value)
GROUP BY v.column_name
ORDER BY null_pct DESC;`,
      explanation: 'The lateral VALUES list scans the table once and expands each row into one row per column, which is far cheaper than a UNION ALL of five separate aggregates. Every value must share a type, hence the cast on the date — a real audit would generate this query from the catalog rather than hand-listing the columns.',
      dialect: 'CROSS JOIN LATERAL and FILTER are PostgreSQL. SQL Server: CROSS APPLY (VALUES ...) with COUNT(CASE WHEN ...). MySQL: UNION ALL one aggregate per column.',
    },
    {
      id: 'p33-q9',
      difficulty: 'hard',
      prompt: 'Compute a salary report where unknown salaries are imputed with the department median rather than dropped.',
      tables: ['employees'],
      think: 'Imputation changes the data. What must the report show so the reader can judge the result?',
      hint: 'The imputation rate, alongside the imputed figure and the raw one.',
      approach: `Compute the department median over the known salaries with a percentile window.\nCOALESCE each employee's salary to that median.\nAggregate both the raw and the imputed averages per department.\nReport how many values were imputed so the reader can weigh the result.`,
      solution: `WITH imputed AS (
    SELECT emp_id, dept_id, salary,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary)
             OVER (PARTITION BY dept_id) AS dept_median
    FROM employees
)
SELECT dept_id,
       COUNT(*)                                        AS headcount,
       COUNT(salary)                                   AS known_salaries,
       COUNT(*) - COUNT(salary)                        AS imputed_count,
       ROUND(100.0 * (COUNT(*) - COUNT(salary))
             / NULLIF(COUNT(*), 0), 1)                 AS imputed_pct,
       ROUND(AVG(salary), 2)                           AS avg_known_only,
       ROUND(AVG(COALESCE(salary, dept_median)), 2)    AS avg_with_imputation
FROM imputed
GROUP BY dept_id
ORDER BY imputed_pct DESC;`,
      explanation: 'Median imputation keeps the sample size without dragging the centre the way zero-filling would, but it artificially shrinks the variance — so the imputed_pct column is not decoration, it is the caveat. A department at 40% imputed should not have its average quoted without that number beside it.',
      dialect: 'PERCENTILE_CONT as a window is PostgreSQL / Oracle / Snowflake. MySQL 8 and SQL Server: compute medians in a grouped CTE and join back.',
    },
    {
      id: 'p33-q10',
      difficulty: 'hard',
      prompt: 'Explain and demonstrate why NOT IN, COUNT and GROUP BY each treat NULL differently.',
      tables: ['customers'],
      think: 'Three constructs, three NULL behaviours. Can you predict each before running it?',
      hint: 'NOT IN poisons on any NULL; COUNT(col) skips them; GROUP BY puts them all in one group.',
      approach: `Show that GROUP BY collects all NULLs into a single group, treating them as equal.\nShow that COUNT(col) excludes them while COUNT(*) includes the rows.\nShow that a NOT IN subquery containing a NULL returns no rows at all.\nContrast with NOT EXISTS, which is unaffected.`,
      solution: `-- 1. GROUP BY treats all NULLs as ONE group
SELECT COALESCE(country, '(null group)') AS country, COUNT(*) AS rows
FROM customers
GROUP BY country
ORDER BY rows DESC;

-- 2. COUNT(*) counts rows; COUNT(col) skips NULLs
SELECT COUNT(*)             AS rows,
       COUNT(country)       AS non_null_countries,
       COUNT(DISTINCT country) AS distinct_countries  -- also excludes NULL
FROM customers;

-- 3. NOT IN returns ZERO rows if the subquery yields any NULL;
--    NOT EXISTS is unaffected.
SELECT (SELECT COUNT(*) FROM customers AS c
        WHERE c.country NOT IN (SELECT country FROM customers)) AS not_in_count,
       (SELECT COUNT(*) FROM customers AS c
        WHERE NOT EXISTS (SELECT 1 FROM customers AS x
                          WHERE x.country = c.country))         AS not_exists_count;`,
      explanation: 'GROUP BY uses "not distinct" semantics so all NULLs land together, while joins and IN use equality semantics so no NULL matches anything — the same data, two different notions of sameness. Being able to state that difference, and predict all three results before executing, is the deepest NULL question an interviewer can ask.',
    },
  ],
};
