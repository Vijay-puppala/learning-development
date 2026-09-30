import type { Pattern } from '../types';

export const p24: Pattern = {
  num: 24,
  slug: 'overlapping-date-ranges',
  title: 'Overlapping Date Ranges',
  concept: 'SELF JOIN',
  category: 'Time Series & Dates',
  tagline: 'Two intervals overlap when each starts before the other ends. One condition, endlessly misremembered.',
  theory: `Two intervals [a_start, a_end] and [b_start, b_end] overlap if and only if **a_start <= b_end AND b_start <= a_end**. That is the whole rule, and it is worth memorising because people reconstruct it wrongly under pressure and end up enumerating four cases.

Why it works: think about when they *cannot* overlap. Either A finishes entirely before B starts (a_end < b_start), or B finishes entirely before A starts (b_end < a_start). Negate that disjunction and you get the condition above. Two comparisons cover all four geometric arrangements — containment, partial overlap either way, and identity.

Two refinements matter in practice. **Touching versus overlapping**: with <= a range ending on the 5th overlaps one starting on the 5th. If ranges are half-open (end exclusive), use strict < on both sides instead, and prefer that convention — it eliminates boundary double-counting everywhere.

**Open-ended ranges**: a NULL end date means "still active". COALESCE it to a far-future sentinel before comparing, or the condition evaluates to UNKNOWN and the row disappears.

For self-overlap within one table, add a_id < b_id to report each pair once and exclude self-matches.`,
  pitfalls: [
    'Enumerating four separate cases instead of the two-comparison rule, and missing the containment case.',
    'Leaving NULL end dates uncoalesced, so open-ended ranges never match anything.',
    'Using <= when ranges are half-open, double-counting the boundary day.',
    'Forgetting a_id < b_id on a self join, so every overlapping pair appears twice plus each row matching itself.',
    'Assuming BETWEEN expresses overlap. BETWEEN tests a point against a range, not a range against a range.',
  ],
  questions: [
    {
      id: 'p24-q1',
      difficulty: 'easy',
      prompt: 'Find pairs of subscriptions for the same customer whose date ranges overlap.',
      tables: ['subscriptions'],
      think: 'Write down the condition for two ranges NOT overlapping first, then negate it.',
      hint: 'a.start <= b.end AND b.start <= a.end.',
      approach: `Self join subscriptions on customer_id.\nApply the two-comparison overlap condition.\nAdd an id inequality so each pair appears once and nothing matches itself.\nReturn both ranges.`,
      solution: `SELECT a.customer_id,
       a.subscription_id AS sub_a,
       a.start_date      AS a_start,
       a.end_date        AS a_end,
       b.subscription_id AS sub_b,
       b.start_date      AS b_start,
       b.end_date        AS b_end
FROM subscriptions AS a
JOIN subscriptions AS b
  ON  b.customer_id     = a.customer_id
  AND b.subscription_id > a.subscription_id
  AND a.start_date <= b.end_date
  AND b.start_date <= a.end_date
ORDER BY a.customer_id, a.start_date;`,
      explanation: 'The two comparisons cover every geometric case — containment included — which is why enumerating scenarios is unnecessary. b.subscription_id > a.subscription_id removes both the self-match and the mirrored duplicate in one condition.',
    },
    {
      id: 'p24-q2',
      difficulty: 'easy',
      prompt: 'Find subscriptions that were active on 2024-06-15.',
      tables: ['subscriptions'],
      think: 'This is a point against a range rather than a range against a range. Does the same rule apply?',
      hint: 'A point is a zero-length range, so the rule collapses to start <= point AND point <= end.',
      approach: `Compare the target date against the start and end of each subscription.\nKeep rows where the date falls inside the range.\nTreat a NULL end date as still active.\nReturn the matching subscriptions.`,
      solution: `SELECT subscription_id,
       customer_id,
       plan,
       start_date,
       end_date
FROM subscriptions
WHERE start_date <= DATE '2024-06-15'
  AND COALESCE(end_date, DATE '9999-12-31') >= DATE '2024-06-15'
ORDER BY customer_id;`,
      explanation: 'COALESCE on the end date is what makes open-ended subscriptions match — without it, end_date >= target is UNKNOWN for active rows and they silently disappear. That is the single most common bug in "who was active on date X" queries.',
    },
    {
      id: 'p24-q3',
      difficulty: 'medium',
      prompt: 'Find subscriptions that overlap a fixed reporting window of 2024-04-01 to 2024-06-30.',
      tables: ['subscriptions'],
      think: 'The window is a constant range. Does the condition change shape?',
      hint: 'Same two comparisons, with the constants on one side.',
      approach: `Treat the reporting window as range B with literal dates.\nApply the two-comparison rule against each subscription.\nCoalesce open-ended subscriptions to a far-future date.\nReturn the overlapping rows with the number of overlapping days.`,
      solution: `SELECT subscription_id,
       customer_id,
       start_date,
       end_date,
       GREATEST(start_date, DATE '2024-04-01') AS overlap_start,
       LEAST(COALESCE(end_date, DATE '9999-12-31'), DATE '2024-06-30') AS overlap_end,
       LEAST(COALESCE(end_date, DATE '9999-12-31'), DATE '2024-06-30')
     - GREATEST(start_date, DATE '2024-04-01') + 1 AS overlap_days
FROM subscriptions
WHERE start_date <= DATE '2024-06-30'
  AND COALESCE(end_date, DATE '9999-12-31') >= DATE '2024-04-01'
ORDER BY overlap_days DESC;`,
      explanation: 'GREATEST of the two starts and LEAST of the two ends gives the intersection of the ranges, which is how you go from "does it overlap" to "by how much". Adding one makes the day count inclusive, matching how a billing period is usually counted.',
      dialect: 'GREATEST and LEAST are PostgreSQL / MySQL / Oracle. SQL Server 2022+ has them; earlier versions need a CASE expression.',
    },
    {
      id: 'p24-q4',
      difficulty: 'medium',
      prompt: 'Find customers who had two subscriptions running at the same time — double billing.',
      tables: ['subscriptions'],
      think: 'You want the customers, not the pairs. What collapses the pairs?',
      hint: 'Detect the overlapping pairs, then aggregate to customer level.',
      approach: `Self join subscriptions on the customer with the overlap condition and an id inequality.\nCollapse the resulting pairs to one row per customer.\nCount how many overlapping pairs each customer has.\nReturn the earliest overlap so it can be investigated.`,
      solution: `WITH overlaps AS (
    SELECT a.customer_id,
           GREATEST(a.start_date, b.start_date) AS overlap_from,
           LEAST(COALESCE(a.end_date, DATE '9999-12-31'),
                 COALESCE(b.end_date, DATE '9999-12-31')) AS overlap_to
    FROM subscriptions AS a
    JOIN subscriptions AS b
      ON  b.customer_id     = a.customer_id
      AND b.subscription_id > a.subscription_id
      AND a.start_date <= COALESCE(b.end_date, DATE '9999-12-31')
      AND b.start_date <= COALESCE(a.end_date, DATE '9999-12-31')
)
SELECT customer_id,
       COUNT(*)          AS overlapping_pairs,
       MIN(overlap_from) AS first_overlap,
       MAX(overlap_to)   AS last_overlap
FROM overlaps
GROUP BY customer_id
ORDER BY overlapping_pairs DESC;`,
      explanation: 'Finding the pairs and then aggregating keeps the two concerns separate and gives you the overlap window for free. A customer with three concurrent subscriptions produces three pairs, which is correct — the pair count measures the tangle, not the subscription count.',
    },
    {
      id: 'p24-q5',
      difficulty: 'medium',
      prompt: 'Show the difference between closed ranges (<=) and half-open ranges (<) on the boundary day.',
      tables: ['subscriptions'],
      think: 'A subscription ends on the 30th and another starts on the 30th. Do they overlap?',
      hint: 'With <= yes, with < no. Which convention does the business mean?',
      approach: `Write the overlap condition twice, once with inclusive comparisons and once with strict ones.\nApply both to the same self join.\nFlag pairs where the two answers differ — these are the boundary-touching pairs.\nReturn them for inspection.`,
      solution: `SELECT a.customer_id,
       a.subscription_id AS sub_a,
       a.end_date        AS a_ends,
       b.subscription_id AS sub_b,
       b.start_date      AS b_starts,
       (a.start_date <= b.end_date AND b.start_date <= a.end_date) AS overlaps_closed,
       (a.start_date <  b.end_date AND b.start_date <  a.end_date) AS overlaps_half_open
FROM subscriptions AS a
JOIN subscriptions AS b
  ON  b.customer_id     = a.customer_id
  AND b.subscription_id > a.subscription_id
WHERE (a.start_date <= b.end_date AND b.start_date <= a.end_date)
  AND NOT (a.start_date < b.end_date AND b.start_date < a.end_date)
ORDER BY a.customer_id;`,
      explanation: 'The rows returned are exactly the pairs that merely touch at a boundary — they overlap under the closed convention and not under the half-open one. Deciding which convention the business means before writing the query is what stops a one-day double-count from reaching a bill.',
    },
    {
      id: 'p24-q6',
      difficulty: 'medium',
      prompt: 'Find employees whose employment period overlaps a given project window, treating a NULL end date as still employed.',
      tables: ['employees'],
      think: 'One endpoint is missing from the data. What must you substitute, and what would happen if you did not?',
      hint: 'COALESCE the open end to a far-future date; otherwise the comparison is UNKNOWN.',
      approach: `Treat the hire_date as the start and a far-future date as the end for currently employed staff.\nApply the two-comparison rule against the project window.\nReturn the overlap length.\nOrder by the longest availability.`,
      solution: `SELECT emp_id,
       emp_name,
       hire_date,
       GREATEST(hire_date, DATE '2024-01-01') AS available_from,
       DATE '2024-12-31'                      AS available_to
FROM employees
WHERE hire_date <= DATE '2024-12-31'
  AND COALESCE(NULL::date, DATE '9999-12-31') >= DATE '2024-01-01'
ORDER BY hire_date;`,
      explanation: 'The sentinel date 9999-12-31 stands in for "no end yet" so the comparison has a value to work with rather than evaluating to UNKNOWN. Using a sentinel consistently across a schema — rather than NULL — is a common warehouse convention precisely because it makes range logic work without special cases.',
    },
    {
      id: 'p24-q7',
      difficulty: 'hard',
      prompt: 'Merge each customer\'s overlapping or adjacent subscription periods into consolidated continuous ranges.',
      tables: ['subscriptions'],
      think: 'This is interval merging. What identifies the start of a new merged block, and how do you number the blocks?',
      hint: 'A new block starts when a row\'s start is later than the running maximum end so far. Accumulate a flag into a group id.',
      approach: `Order each customer's subscriptions by start date.\nTrack the running maximum end date of all previous rows.\nFlag a row as a new block when its start is after that running maximum.\nRunning-sum the flags into a block id, then take the min start and max end per block.`,
      solution: `WITH ordered AS (
    SELECT customer_id,
           start_date,
           COALESCE(end_date, DATE '9999-12-31') AS end_date,
           MAX(COALESCE(end_date, DATE '9999-12-31'))
             OVER (PARTITION BY customer_id ORDER BY start_date
                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_max_end
    FROM subscriptions
),
flagged AS (
    SELECT *,
           CASE WHEN prev_max_end IS NULL OR start_date > prev_max_end
                THEN 1 ELSE 0 END AS is_new_block
    FROM ordered
),
blocked AS (
    SELECT *, SUM(is_new_block) OVER (PARTITION BY customer_id
                                      ORDER BY start_date) AS block_id
    FROM flagged
)
SELECT customer_id,
       block_id,
       MIN(start_date) AS block_start,
       MAX(end_date)   AS block_end,
       COUNT(*)        AS subscriptions_merged
FROM blocked
GROUP BY customer_id, block_id
ORDER BY customer_id, block_start;`,
      explanation: 'The running MAX must exclude the current row — hence the frame ending at 1 PRECEDING — or every row would compare against its own end and never start a block. This merge is what turns overlapping billing periods into an accurate count of days actually covered.',
    },
    {
      id: 'p24-q8',
      difficulty: 'hard',
      prompt: 'For each day in June 2024, count how many subscriptions were active.',
      tables: ['subscriptions'],
      think: 'The answer has one row per day, but the data has one row per range. What bridges the two grains?',
      hint: 'Generate the days, then join each day to every range that contains it.',
      approach: `Generate one row per day in the reporting month.\nJoin each day to the subscriptions whose range contains it.\nUse a LEFT JOIN so days with no active subscription still appear with zero.\nCount the distinct subscriptions per day.`,
      solution: `WITH days AS (
    SELECT generate_series(DATE '2024-06-01', DATE '2024-06-30', INTERVAL '1 day')::date AS d
)
SELECT d.d AS day,
       COUNT(s.subscription_id) AS active_subscriptions
FROM days AS d
LEFT JOIN subscriptions AS s
       ON s.start_date <= d.d
      AND COALESCE(s.end_date, DATE '9999-12-31') >= d.d
GROUP BY d.d
ORDER BY d.d;`,
      explanation: 'Joining a date spine to ranges converts interval data into a daily time series, which is what every "active users by day" chart needs. COUNT of the subscription key rather than COUNT(*) is what makes an empty day report 0 instead of 1.',
      dialect: 'generate_series is PostgreSQL. Elsewhere use a calendar dimension table or a recursive CTE.',
    },
    {
      id: 'p24-q9',
      difficulty: 'hard',
      prompt: 'Find the single day in 2024 with the highest number of concurrent subscriptions, without generating a row per day.',
      tables: ['subscriptions'],
      think: 'Concurrency only changes at a start or an end. Do you need to check every day, or only those points?',
      hint: 'The sweep-line technique: +1 at each start, −1 the day after each end, then a running sum over the event points.',
      approach: `Emit one event row per subscription start with a delta of +1.\nEmit one event row per subscription end, dated the day after, with a delta of −1.\nOrder the events by date and take a running sum of the deltas — this is the concurrency level.\nReturn the date where the running sum peaks.`,
      solution: `WITH events AS (
    SELECT start_date AS event_date, 1 AS delta
    FROM subscriptions
    UNION ALL
    SELECT COALESCE(end_date, DATE '9999-12-31') + 1, -1
    FROM subscriptions
),
rolled AS (
    SELECT event_date,
           SUM(SUM(delta)) OVER (ORDER BY event_date) AS concurrent
    FROM events
    GROUP BY event_date
)
SELECT event_date AS peak_starts,
       concurrent AS peak_concurrency
FROM rolled
WHERE event_date <= DATE '2024-12-31'
ORDER BY concurrent DESC, event_date
LIMIT 1;`,
      explanation: 'The sweep line is O(n log n) in the number of subscriptions rather than O(days × subscriptions), so it scales to years of data where a date spine would not. SUM(SUM(delta)) OVER (...) is an aggregate feeding a window in one step — legal because the window runs after the GROUP BY.',
    },
    {
      id: 'p24-q10',
      difficulty: 'hard',
      prompt: 'Find gaps in coverage: periods where a customer had no active subscription between their first and last one.',
      tables: ['subscriptions'],
      think: 'A gap is the space between one merged block and the next. What do you need before you can measure it?',
      hint: 'Merge the overlapping ranges first, then LEAD the next block start and compare it to this block end.',
      approach: `Merge each customer's overlapping periods into continuous blocks, as in the merge question.\nWithin each customer, LEAD the next block's start date.\nA gap exists when the next start is more than one day after this block's end.\nReturn the gap boundaries and length.`,
      solution: `WITH ordered AS (
    SELECT customer_id, start_date,
           COALESCE(end_date, DATE '9999-12-31') AS end_date,
           MAX(COALESCE(end_date, DATE '9999-12-31'))
             OVER (PARTITION BY customer_id ORDER BY start_date
                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_max_end
    FROM subscriptions
),
blocked AS (
    SELECT *,
           SUM(CASE WHEN prev_max_end IS NULL OR start_date > prev_max_end THEN 1 ELSE 0 END)
             OVER (PARTITION BY customer_id ORDER BY start_date) AS block_id
    FROM ordered
),
blocks AS (
    SELECT customer_id, block_id,
           MIN(start_date) AS block_start,
           MAX(end_date)   AS block_end
    FROM blocked
    GROUP BY customer_id, block_id
)
SELECT customer_id,
       block_end + 1 AS gap_starts,
       LEAD(block_start) OVER (PARTITION BY customer_id ORDER BY block_start) - 1 AS gap_ends,
       LEAD(block_start) OVER (PARTITION BY customer_id ORDER BY block_start)
     - block_end - 1 AS gap_days
FROM blocks
WHERE LEAD(block_start) OVER (PARTITION BY customer_id ORDER BY block_start) IS NOT NULL
  AND LEAD(block_start) OVER (PARTITION BY customer_id ORDER BY block_start) > block_end + 1
ORDER BY gap_days DESC;`,
      explanation: 'Merging first is essential: without it, overlapping subscriptions would produce phantom gaps between ranges that were actually concurrent. The +1 and −1 adjustments make the gap the set of days genuinely uncovered, rather than including the boundary days that were covered.',
    },
  ],
};
