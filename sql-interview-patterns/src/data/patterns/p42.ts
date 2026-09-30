import type { Pattern } from '../types';

export const p42: Pattern = {
  num: 42,
  slug: 'scd-type-2-comparison',
  title: 'SCD Type 2 Comparison',
  concept: 'SELF JOIN',
  category: 'Data Quality & Modeling',
  tagline: 'Dimensions that keep history: query as-of a date, compare versions, and close the open row correctly.',
  theory: `A Slowly Changing Dimension Type 2 keeps every historical version of a row instead of overwriting it. Each version carries a surrogate key, the business key, a validity window (start_date, end_date) and usually an is_current flag. Several rows share a business key; exactly one is open at any moment.

Three operations define the pattern.

**As-of lookup.** Join a fact to the dimension on the business key *plus* a date-containment predicate. Without the date predicate one fact matches every version and your fact table silently multiplies. Use half-open ranges (>= start, < end) so a fact on a changeover date matches exactly one version.

**Version comparison.** Self join the dimension on the business key with an adjacency condition — or, far better, use LAG to bring the previous version onto the current row. LAG needs no join and cannot fan out.

**Integrity.** The invariants are worth knowing: no overlapping windows per key, exactly one current row per key, no gaps between consecutive versions, and the flag agreeing with the dates. Real dimensions break all four, so check before you trust.`,
  pitfalls: [
    'Joining a fact to the dimension without a date predicate, multiplying facts by the version count.',
    'Using inclusive BETWEEN on both ends, so a fact on the changeover date matches two versions.',
    'Trusting is_current, which is derived data and drifts when a load fails partway.',
    'Self-joining versions on start_date = end_date + 1, which breaks the moment a gap exists.',
    'Forgetting that the open row has a NULL or sentinel end_date and must be handled in every comparison.',
  ],
  questions: [
    {
      id: 'p42-q1',
      difficulty: 'easy',
      prompt: 'Return the current version of every customer from the dimension.',
      tables: ['customer_dim'],
      think: 'Two ways to identify the open row. Which one is derived data?',
      hint: 'is_current is derived; the end_date sentinel is the underlying fact.',
      approach: `Select from the dimension.\nKeep rows whose validity window has no end, using the sentinel or NULL.\nReturn one row per business key.\nCompare against the flag as a cross-check.`,
      solution: `SELECT cust_key,
       customer_id,
       customer_name,
       city,
       start_date,
       end_date,
       is_current
FROM customer_dim
WHERE COALESCE(end_date, DATE '9999-12-31') = DATE '9999-12-31'
ORDER BY customer_id;`,
      explanation: 'Filtering on the end_date sentinel uses the data that actually defines the window, rather than a flag that a half-completed load can leave stale. Handling both NULL and the sentinel with COALESCE makes the query work regardless of which convention the warehouse chose.',
    },
    {
      id: 'p42-q2',
      difficulty: 'easy',
      prompt: 'Return every version of one customer in chronological order, so the change history is readable.',
      tables: ['customer_dim'],
      think: 'What ordering makes a version history readable, and how do you see what changed?',
      hint: 'Order by start_date, and number the versions.',
      approach: `Filter to the business key of interest.\nOrder by start_date.\nNumber the versions so they read as v1, v2, v3.\nShow the window and the flag.`,
      solution: `SELECT ROW_NUMBER() OVER (ORDER BY start_date) AS version_no,
       cust_key,
       customer_name,
       city,
       start_date,
       COALESCE(end_date, DATE '9999-12-31') AS end_date,
       is_current
FROM customer_dim
WHERE customer_id = 42
ORDER BY start_date;`,
      explanation: 'Numbering the versions makes the history self-describing and immediately reveals whether the chain is complete. Coalescing the open end_date to the sentinel means every row has a comparable window, which matters for the integrity checks later in this pattern.',
    },
    {
      id: 'p42-q3',
      difficulty: 'medium',
      prompt: 'Show what changed between each version and the one before it.',
      tables: ['customer_dim'],
      think: 'A self join on adjacency, or something that needs no join at all?',
      hint: 'LAG over the business key partition — no join, no fan-out risk.',
      approach: `Partition by the business key and order by start_date.\nLAG each attribute to bring the previous version's value onto the row.\nCompare NULL-safely and list the changed field names.\nDiscard the first version, which has nothing to compare against.`,
      solution: `WITH versioned AS (
    SELECT customer_id, cust_key, customer_name, city, start_date,
           LAG(customer_name) OVER (PARTITION BY customer_id ORDER BY start_date) AS prev_name,
           LAG(city)          OVER (PARTITION BY customer_id ORDER BY start_date) AS prev_city
    FROM customer_dim
)
SELECT customer_id,
       start_date AS changed_on,
       CONCAT_WS(', ',
           CASE WHEN customer_name IS DISTINCT FROM prev_name THEN 'name' END,
           CASE WHEN city          IS DISTINCT FROM prev_city THEN 'city' END
       ) AS fields_changed,
       prev_name, customer_name,
       prev_city, city
FROM versioned
WHERE prev_name IS NOT NULL OR prev_city IS NOT NULL
ORDER BY customer_id, start_date;`,
      explanation: 'LAG replaces a self join on adjacency and is both faster and immune to the fan-out a mis-specified join condition would cause. IS DISTINCT FROM is what makes a change to or from NULL count as a change, which a plain <> would silently classify as "unchanged".',
    },
    {
      id: 'p42-q4',
      difficulty: 'medium',
      prompt: 'Look up what each customer\'s city was on 2024-06-15.',
      tables: ['customer_dim'],
      think: 'An as-of lookup is a range containment test. What makes exactly one version match?',
      hint: 'Half-open bounds: start <= date and date < end.',
      approach: `Compare the target date against each version's validity window.\nUse >= on the start and < on the end so a changeover date matches one version only.\nCoalesce the open end to a far-future sentinel.\nReturn one row per business key.`,
      solution: `SELECT customer_id,
       cust_key,
       customer_name,
       city,
       start_date,
       COALESCE(end_date, DATE '9999-12-31') AS end_date
FROM customer_dim
WHERE start_date <= DATE '2024-06-15'
  AND COALESCE(end_date, DATE '9999-12-31') > DATE '2024-06-15'
ORDER BY customer_id;`,
      explanation: 'The asymmetry — inclusive start, exclusive end — is what guarantees a single match: with BETWEEN on both ends, a customer whose version changed on 15 June would match two rows and duplicate. If this query returns more rows than there are distinct customer_ids, the dimension has overlapping windows.',
    },
    {
      id: 'p42-q5',
      difficulty: 'medium',
      prompt: 'Join sales to the dimension so each sale gets the attributes in effect on its own date.',
      tables: ['sales', 'customer_dim'],
      think: 'What is the cost of forgetting the date predicate here?',
      hint: 'Every fact multiplies by the number of versions of its key.',
      approach: `LEFT JOIN the fact to the dimension on the business key.\nAdd the half-open date containment predicate to the ON clause.\nKeep the join left so a fact with no matching version survives.\nVerify the output row count equals the fact row count.`,
      solution: `SELECT s.sale_id,
       s.sale_date,
       s.amount,
       d.cust_key,
       COALESCE(d.customer_name, '(no version in effect)') AS name_as_of_sale,
       d.city AS city_as_of_sale
FROM sales AS s
LEFT JOIN customer_dim AS d
       ON d.customer_id = s.product_id
      AND s.sale_date  >= d.start_date
      AND s.sale_date  <  COALESCE(d.end_date, DATE '9999-12-31')
ORDER BY s.sale_date;`,
      explanation: 'Comparing the output row count against the fact row count is the check that proves the date predicate is doing its job — any increase means versions are overlapping. The LEFT JOIN plus a labelled placeholder means a sale predating its dimension row stays visible instead of silently disappearing.',
    },
    {
      id: 'p42-q6',
      difficulty: 'medium',
      prompt: 'Close the validity windows on a dimension that only stores start_date.',
      tables: ['customer_dim'],
      think: 'Where does the end of one version come from?',
      hint: 'The start of the next version, via LEAD.',
      approach: `Partition by the business key and order by start_date.\nLEAD the start_date to find when this version stops being true.\nUse that directly for half-open ranges, or subtract a day for closed ones.\nSupply a far-future default for the open row.`,
      solution: `SELECT cust_key,
       customer_id,
       customer_name,
       city,
       start_date AS valid_from,
       COALESCE(LEAD(start_date) OVER (PARTITION BY customer_id ORDER BY start_date),
                DATE '9999-12-31') AS valid_to_exclusive,
       COALESCE(LEAD(start_date) OVER (PARTITION BY customer_id ORDER BY start_date) - 1,
                DATE '9999-12-31') AS valid_to_inclusive,
       LEAD(start_date) OVER (PARTITION BY customer_id ORDER BY start_date) IS NULL
         AS is_current_derived
FROM customer_dim
ORDER BY customer_id, start_date;`,
      explanation: 'Returning both conventions side by side makes the choice explicit — half-open avoids every boundary bug, closed ranges read more naturally in a report. Deriving is_current from the absence of a successor is also more trustworthy than the stored flag.',
    },
    {
      id: 'p42-q7',
      difficulty: 'hard',
      prompt: 'Check the dimension for integrity violations: overlapping windows, multiple current rows and gaps.',
      tables: ['customer_dim'],
      think: 'Three separate invariants. Can one query report all three?',
      hint: 'UNION ALL three targeted checks, each with an issue label.',
      approach: `Check for versions whose window overlaps the next one for the same key.\nCheck for business keys with more than one open row.\nCheck for gaps between the end of one version and the start of the next.\nUnion the three with a label.`,
      solution: `WITH v AS (
    SELECT cust_key, customer_id, start_date,
           COALESCE(end_date, DATE '9999-12-31') AS end_date,
           LEAD(start_date) OVER (PARTITION BY customer_id ORDER BY start_date) AS next_start
    FROM customer_dim
)
SELECT 'overlapping windows' AS issue, customer_id, cust_key, start_date, end_date
FROM v
WHERE next_start IS NOT NULL AND next_start < end_date

UNION ALL

SELECT 'gap between versions', customer_id, cust_key, start_date, end_date
FROM v
WHERE next_start IS NOT NULL AND next_start > end_date

UNION ALL

SELECT 'multiple current rows', customer_id, MIN(cust_key), MIN(start_date), MAX(end_date)
FROM v
WHERE end_date = DATE '9999-12-31'
GROUP BY customer_id
HAVING COUNT(*) > 1

ORDER BY issue, customer_id;`,
      explanation: 'These three defects each break a different downstream query: overlaps duplicate facts, gaps lose them, and multiple current rows break every "current state" report. Running this check before trusting a dimension costs one scan and saves the investigation that would otherwise start from a wrong number.',
    },
    {
      id: 'p42-q8',
      difficulty: 'hard',
      prompt: 'Collapse redundant versions where nothing actually changed between consecutive rows.',
      tables: ['customer_dim'],
      think: 'Consecutive identical versions should be one interval. What identifies a block of them?',
      hint: 'Flag rows where the attributes differ from the previous, then running-sum the flag.',
      approach: `LAG the comparable attributes within each business key.\nFlag a row where any attribute differs, NULL-safely.\nRunning-sum the flag to give each run of identical versions a shared block id.\nGroup by the block and take the earliest start and latest end.`,
      solution: `WITH flagged AS (
    SELECT customer_id, customer_name, city, start_date,
           COALESCE(end_date, DATE '9999-12-31') AS end_date,
           CASE WHEN customer_name IS DISTINCT FROM
                     LAG(customer_name) OVER (PARTITION BY customer_id ORDER BY start_date)
                  OR city IS DISTINCT FROM
                     LAG(city) OVER (PARTITION BY customer_id ORDER BY start_date)
                THEN 1 ELSE 0 END AS is_change
    FROM customer_dim
),
blocked AS (
    SELECT *, SUM(is_change) OVER (PARTITION BY customer_id ORDER BY start_date) AS block_id
    FROM flagged
)
SELECT customer_id,
       block_id,
       customer_name,
       city,
       MIN(start_date) AS valid_from,
       MAX(end_date)   AS valid_to,
       COUNT(*)        AS versions_merged
FROM blocked
GROUP BY customer_id, block_id, customer_name, city
HAVING COUNT(*) > 1
ORDER BY versions_merged DESC;`,
      explanation: 'Redundant versions accumulate when a load compares too many columns — an audit timestamp in the comparison creates a new version every run. Collapsing them shrinks the dimension and, more importantly, makes the change history readable again.',
    },
    {
      id: 'p42-q9',
      difficulty: 'hard',
      prompt: 'Generate the rows a Type 2 load would insert and the rows it would close, given a staging snapshot.',
      tables: ['customer_dim', 'customers_stg'],
      think: 'A Type 2 update is two operations on one detected change. What are they?',
      hint: 'Close the open version by setting its end_date, and insert a new open version.',
      approach: `Restrict the dimension to its current rows so the comparison is one-to-one.\nFULL OUTER JOIN staging against them on the business key.\nEmit a close instruction for keys whose attributes changed or that disappeared.\nEmit an insert instruction for changed and brand-new keys.`,
      solution: `WITH current_dim AS (
    SELECT cust_key, customer_id, customer_name, city
    FROM customer_dim
    WHERE COALESCE(end_date, DATE '9999-12-31') = DATE '9999-12-31'
),
diff AS (
    SELECT COALESCE(s.customer_id, d.customer_id) AS customer_id,
           d.cust_key,
           d.customer_name AS old_name, s.customer_name AS new_name,
           d.city          AS old_city, s.city          AS new_city,
           CASE WHEN d.customer_id IS NULL THEN 'new'
                WHEN s.customer_id IS NULL THEN 'disappeared'
                WHEN d.customer_name IS DISTINCT FROM s.customer_name
                  OR d.city          IS DISTINCT FROM s.city THEN 'changed'
                ELSE 'unchanged' END AS verdict
    FROM current_dim AS d
    FULL OUTER JOIN customers_stg AS s ON s.customer_id = d.customer_id
)
SELECT 'CLOSE version' AS action, customer_id, cust_key,
       old_name AS name, old_city AS city, CURRENT_DATE - 1 AS set_end_date
FROM diff WHERE verdict IN ('changed', 'disappeared')

UNION ALL

SELECT 'INSERT version', customer_id, NULL,
       new_name, new_city, NULL
FROM diff WHERE verdict IN ('changed', 'new')
ORDER BY customer_id, action;`,
      explanation: 'A changed key produces both a close and an insert, which is why the two branches overlap on the "changed" verdict — that pairing is the whole mechanic of Type 2. Comparing only against the current version is essential; comparing against all versions would match staging to historical rows and report spurious changes.',
    },
    {
      id: 'p42-q10',
      difficulty: 'hard',
      prompt: 'Measure how long each customer spent in each city, using the version windows.',
      tables: ['customer_dim'],
      think: 'A duration is the width of a validity window. What do you do about the still-open one?',
      hint: 'Cap the open window at today rather than at the far-future sentinel.',
      approach: `Derive each version's end from the next version's start, capped at today for the open row.\nCompute the number of days each version was in effect.\nGroup by customer and city to total the time in each.\nRank the cities per customer by time spent.`,
      solution: `WITH bounded AS (
    SELECT customer_id,
           city,
           start_date,
           LEAST(COALESCE(LEAD(start_date) OVER (PARTITION BY customer_id
                                                 ORDER BY start_date),
                          CURRENT_DATE),
                 CURRENT_DATE) AS effective_end
    FROM customer_dim
),
durations AS (
    SELECT customer_id, city,
           SUM(GREATEST(effective_end - start_date, 0)) AS days_in_city,
           COUNT(*)                                     AS stints
    FROM bounded
    WHERE start_date <= CURRENT_DATE
    GROUP BY customer_id, city
)
SELECT customer_id,
       city,
       days_in_city,
       stints,
       ROUND(100.0 * days_in_city
             / NULLIF(SUM(days_in_city) OVER (PARTITION BY customer_id), 0), 1) AS pct_of_history,
       ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY days_in_city DESC) AS rank
FROM durations
ORDER BY customer_id, rank;`,
      explanation: 'Capping the open window at today rather than at 9999-12-31 is what keeps the durations meaningful — otherwise every current city would dominate with several thousand years. Summing per city rather than per version correctly handles a customer who moved away and came back, which the stints column then reveals.',
    },
  ],
};
