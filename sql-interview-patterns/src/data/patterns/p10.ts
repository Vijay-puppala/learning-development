import type { Pattern } from '../types';

export const p10: Pattern = {
  num: 10,
  slug: 'next-row-value',
  title: 'Next Row Value',
  concept: 'LEAD()',
  category: 'Window Functions',
  tagline: 'LAG turned around — reach forward to close intervals, measure durations and detect what happens next.',
  theory: `LEAD(expr, offset, default) is LAG's mirror: it returns expr from the row (offset) positions *after* the current one in the window ordering. Same partition rules, same ordering requirement, and the *last* row of each partition is the one that returns NULL.

The killer application is closing open intervals. Event tables store a start and no end — a status change, a price change, an SCD row, a subscription switch. LEAD on the start column gives you the next event's start, which is this event's end. That one move turns an event log into a range table you can join on.

The second application is measuring duration: time to next event, time on page, time between a signup and a first order. And the third is lookahead flags: "did this customer ever order again?" is simply "is LEAD(order_date) not null?".

A practical detail worth knowing: LEAD's third argument supplies a default for the last row. LEAD(start_date, 1, DATE '9999-12-31') closes the final interval with an open-ended sentinel in one expression, with no COALESCE needed.`,
  pitfalls: [
    'Using LEAD in a metric you have to compute for today. The future does not exist yet in production data.',
    'Forgetting that the *last* row per partition is NULL, and letting that NULL silently drop rows in a later join or filter.',
    'Closing an interval with the next start date and then writing an inclusive BETWEEN, which double-counts the boundary day.',
    'Omitting PARTITION BY, so the last row of one group reaches into the first row of the next.',
    'Assuming LEAD respects the outer ORDER BY. It uses the window ORDER BY only.',
  ],
  questions: [
    {
      id: 'p10-q1',
      difficulty: 'easy',
      prompt: 'For each order, show the customer\'s next order date.',
      tables: ['orders'],
      think: 'Which row will come back NULL, and does that NULL mean "missing" or something meaningful?',
      hint: 'LEAD(order_date) partitioned by customer, ordered by date.',
      approach: `Partition by customer_id.\nOrder by order_date with order_id as tiebreaker.\nLEAD the order_date to bring the next purchase onto this row.\nThe most recent order per customer returns NULL — that means "no next order yet".`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       LEAD(order_date) OVER (PARTITION BY customer_id
                              ORDER BY order_date, order_id) AS next_order_date
FROM orders
ORDER BY customer_id, order_date;`,
      explanation: 'The NULL on the last row is information, not an absence: it identifies each customer\'s most recent order in the same pass. Filtering WHERE next_order_date IS NULL is a neat alternative to ROW_NUMBER for "latest per group".',
    },
    {
      id: 'p10-q2',
      difficulty: 'easy',
      prompt: 'Show how many days pass before each customer\'s next order.',
      tables: ['orders'],
      think: 'This is the same gap as the LAG version. What changes about which row carries the number?',
      hint: 'Subtract the current date from the LEAD date.',
      approach: `LEAD the order date within each customer.\nSubtract the current order date from it.\nThe result sits on the earlier order rather than the later one.\nNULL on the last order means "still open".`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       LEAD(order_date) OVER (PARTITION BY customer_id
                              ORDER BY order_date, order_id) AS next_order_date,
       LEAD(order_date) OVER (PARTITION BY customer_id
                              ORDER BY order_date, order_id) - order_date AS days_to_next
FROM orders
ORDER BY customer_id, order_date;`,
      explanation: 'LAG and LEAD compute the same set of gaps; they differ only in which row the number lands on. Choose whichever makes the downstream filter natural — here "orders followed by a long silence" is easier with LEAD.',
    },
    {
      id: 'p10-q3',
      difficulty: 'medium',
      prompt: 'Turn the customer_dim event rows into closed date ranges: give each row a valid_to equal to the day before the next version starts.',
      tables: ['customer_dim'],
      think: 'An event log records starts only. Where does the end of an interval come from, and what closes the final one?',
      hint: 'LEAD(start_date) minus one day, with a far-future default for the last row.',
      approach: `Partition by the business key, customer_id.\nOrder by start_date.\nLEAD the start_date to find when this version stops being true.\nSubtract one day so the ranges do not overlap, and supply a far-future default for the open row.`,
      solution: `SELECT cust_key,
       customer_id,
       customer_name,
       city,
       start_date AS valid_from,
       COALESCE(
           LEAD(start_date) OVER (PARTITION BY customer_id ORDER BY start_date) - 1,
           DATE '9999-12-31'
       ) AS valid_to
FROM customer_dim
ORDER BY customer_id, start_date;`,
      explanation: 'Subtracting a day makes the ranges closed and non-overlapping, so a lookup "which version was true on date D" is a simple BETWEEN. The alternative convention is half-open ranges (valid_to = next start, queried with >= from AND < to), which avoids date-arithmetic bugs entirely and is what most warehouses standardise on.',
    },
    {
      id: 'p10-q4',
      difficulty: 'medium',
      prompt: 'Calculate how long each user spent on every page, using the timestamp of their next page view.',
      tables: ['page_views'],
      think: 'Time on page is a duration you can only know once the next event arrives. What happens to the last page of a session?',
      hint: 'LEAD(view_ts) minus view_ts, partitioned by user and session.',
      approach: `Partition by user and session so the duration never crosses a session boundary.\nOrder by the timestamp.\nLEAD the timestamp to get when the user left this page.\nSubtract to get the dwell time; the final page of each session is NULL because its exit is unknown.`,
      solution: `SELECT user_id,
       session_id,
       page,
       view_ts,
       LEAD(view_ts) OVER (PARTITION BY user_id, session_id
                           ORDER BY view_ts, view_id) AS next_view_ts,
       LEAD(view_ts) OVER (PARTITION BY user_id, session_id
                           ORDER BY view_ts, view_id) - view_ts AS time_on_page
FROM page_views
ORDER BY user_id, session_id, view_ts;`,
      explanation: 'This is exactly how web analytics tools compute time on page, and it is why the last page of a session always shows zero or unknown dwell time — there is no subsequent event to measure against. Say that out loud; it is the insight the question is testing.',
    },
    {
      id: 'p10-q5',
      difficulty: 'medium',
      prompt: 'Flag each customer\'s orders as "repeat followed" when another order came within 30 days.',
      tables: ['orders'],
      think: 'A forward-looking condition on a derived value. Does the flag belong in the same SELECT as the LEAD?',
      hint: 'Materialise the LEAD in a CTE, then apply the comparison outside it.',
      approach: `Compute the next order date per customer in a CTE.\nIn the outer query test whether that date exists and falls within 30 days.\nLabel the row accordingly.\nOrders with no successor are labelled separately rather than as a failure.`,
      solution: `WITH led AS (
    SELECT customer_id, order_id, order_date, amount,
           LEAD(order_date) OVER (PARTITION BY customer_id
                                  ORDER BY order_date, order_id) AS next_date
    FROM orders
)
SELECT customer_id,
       order_id,
       order_date,
       next_date,
       CASE WHEN next_date IS NULL                        THEN 'no repeat yet'
            WHEN next_date - order_date <= 30             THEN 'repeat within 30d'
            ELSE 'repeat but slow'
       END AS repeat_behaviour
FROM led
ORDER BY customer_id, order_date;`,
      explanation: 'Keeping "no successor" as its own label rather than lumping it with "slow" matters: a recent order has not had time to be followed up, so treating its NULL as a negative would bias any repeat-rate metric against the newest data.',
    },
    {
      id: 'p10-q6',
      difficulty: 'medium',
      prompt: 'For each sale, show the amount of the sale two positions ahead, defaulting to 0 when fewer than two remain.',
      tables: ['sales'],
      think: 'LEAD takes more than one argument. What do the second and third do?',
      hint: 'LEAD(amount, 2, 0) — offset then default.',
      approach: `Order sales by date.\nCall LEAD with an offset of 2 to skip a row.\nSupply 0 as the third argument so the final two rows get a value instead of NULL.\nReturn both for comparison.`,
      solution: `SELECT sale_id,
       sale_date,
       amount,
       LEAD(amount, 2)    OVER (ORDER BY sale_date, sale_id) AS two_ahead_null_default,
       LEAD(amount, 2, 0) OVER (ORDER BY sale_date, sale_id) AS two_ahead_zero_default
FROM sales
ORDER BY sale_date, sale_id;`,
      explanation: 'The third argument is the cleanest way to close out a series and saves a COALESCE. Be deliberate about it though: defaulting a *price* to 0 quietly fabricates data, while defaulting a *count* to 0 is usually honest.',
    },
    {
      id: 'p10-q7',
      difficulty: 'hard',
      prompt: 'Find customers whose order amounts increased for three consecutive orders — each one larger than the last, twice in a row.',
      tables: ['orders'],
      think: 'A three-row pattern needs two lookaheads from the same anchor row. How many LEAD calls is that?',
      hint: 'LEAD(amount, 1) and LEAD(amount, 2), then compare all three values on the anchor row.',
      approach: `Partition by customer and order chronologically.\nBring the next amount and the one after that onto each row with two LEAD calls.\nKeep rows where the three values strictly increase.\nReturn the customer and the three amounts that form the run.`,
      solution: `WITH streaks AS (
    SELECT customer_id, order_id, order_date, amount,
           LEAD(amount, 1) OVER (PARTITION BY customer_id
                                 ORDER BY order_date, order_id) AS next_1,
           LEAD(amount, 2) OVER (PARTITION BY customer_id
                                 ORDER BY order_date, order_id) AS next_2
    FROM orders
)
SELECT customer_id,
       order_date AS run_started,
       amount AS amt_1,
       next_1 AS amt_2,
       next_2 AS amt_3
FROM streaks
WHERE next_2 IS NOT NULL
  AND next_1 > amount
  AND next_2 > next_1
ORDER BY customer_id, run_started;`,
      explanation: 'Collapsing a multi-row pattern onto a single anchor row with several LEADs is the readable way to express short fixed-length sequences. For a run of arbitrary length you would switch to the flag-and-accumulate islands technique instead, since you cannot write N LEAD calls for unknown N.',
    },
    {
      id: 'p10-q8',
      difficulty: 'hard',
      prompt: 'Build a price-history table from customer_dim-style records: for each customer, output the periods during which their city was unchanged, merging consecutive rows that repeat the same city.',
      tables: ['customer_dim'],
      think: 'Consecutive identical values must collapse into one interval. What identifies the start of a new block, and how do you number the blocks?',
      hint: 'Flag rows where the city differs from the previous row, running-sum the flag to make a block id, then take MIN and MAX dates per block.',
      approach: `LAG the city within each customer to detect where the value changes.\nFlag a change row with 1 and everything else with 0.\nRunning-sum the flag to give every consecutive same-city run a shared block id.\nGroup by customer and block, taking the earliest start and the latest end.`,
      solution: `WITH changes AS (
    SELECT customer_id, city, start_date,
           CASE WHEN city IS DISTINCT FROM
                     LAG(city) OVER (PARTITION BY customer_id ORDER BY start_date)
                THEN 1 ELSE 0 END AS is_change
    FROM customer_dim
),
blocks AS (
    SELECT *,
           SUM(is_change) OVER (PARTITION BY customer_id ORDER BY start_date) AS block_id
    FROM changes
),
bounded AS (
    SELECT customer_id, block_id, city,
           MIN(start_date) AS block_start
    FROM blocks
    GROUP BY customer_id, block_id, city
)
SELECT customer_id,
       city,
       block_start AS valid_from,
       COALESCE(
           LEAD(block_start) OVER (PARTITION BY customer_id ORDER BY block_start) - 1,
           DATE '9999-12-31'
       ) AS valid_to
FROM bounded
ORDER BY customer_id, valid_from;`,
      explanation: 'Two window passes do two different jobs: LAG plus a running sum collapses repeated values into blocks, and LEAD then closes each block\'s interval. This merge step is what turns a noisy change-data-capture feed into a usable SCD Type 2 dimension.',
    },
    {
      id: 'p10-q9',
      difficulty: 'hard',
      prompt: 'For each subscription, detect whether the customer immediately started another subscription (within 7 days of the previous one ending) or genuinely churned.',
      tables: ['subscriptions'],
      think: 'The next row\'s start must be compared against the current row\'s end, not its start. Which column do you LEAD?',
      hint: 'Order by start_date but LEAD the start_date and compare it to this row\'s end_date.',
      approach: `Partition by customer and order by start_date.\nLEAD the next subscription's start date onto the current row.\nCompare that start to the current row's end date to get the gap in coverage.\nClassify: no next row means churned, a small gap means renewed, a large gap means win-back.`,
      solution: `WITH seq AS (
    SELECT subscription_id, customer_id, plan, start_date, end_date,
           LEAD(start_date) OVER (PARTITION BY customer_id
                                  ORDER BY start_date) AS next_start,
           LEAD(plan)       OVER (PARTITION BY customer_id
                                  ORDER BY start_date) AS next_plan
    FROM subscriptions
)
SELECT customer_id,
       subscription_id,
       plan,
       start_date,
       end_date,
       next_plan,
       next_start - end_date AS gap_days,
       CASE WHEN next_start IS NULL                 THEN 'churned'
            WHEN next_start - end_date <= 7         THEN 'renewed'
            ELSE 'won back after gap'
       END AS outcome
FROM seq
ORDER BY customer_id, start_date;`,
      explanation: 'Ordering by one column while LEADing and comparing against another is the general shape of interval-continuity analysis. Comparing next_start to end_date rather than to start_date is the difference between measuring a coverage gap and measuring a subscription length.',
    },
    {
      id: 'p10-q10',
      difficulty: 'hard',
      prompt: 'Using both LAG and LEAD, return each day\'s sales together with the previous and next day, and flag local peaks — days higher than both neighbours.',
      tables: ['sales'],
      think: 'A local peak is defined by three rows at once. Does that need a self-join?',
      hint: 'LAG and LEAD in the same SELECT give you both neighbours on one row; compare in a CTE wrapper.',
      approach: `Aggregate to daily totals.\nPull the previous day's total with LAG and the next day's with LEAD in the same pass.\nIn an outer query compare the current value to both neighbours.\nFlag rows strictly greater than both, and exclude the series endpoints which have only one neighbour.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY sale_date
),
neighbours AS (
    SELECT sale_date, amt,
           LAG(amt)  OVER (ORDER BY sale_date) AS prev_amt,
           LEAD(amt) OVER (ORDER BY sale_date) AS next_amt
    FROM daily
)
SELECT sale_date,
       prev_amt,
       amt,
       next_amt,
       CASE WHEN prev_amt IS NOT NULL AND next_amt IS NOT NULL
             AND amt > prev_amt AND amt > next_amt
            THEN 'local peak' END AS shape
FROM neighbours
ORDER BY sale_date;`,
      explanation: 'LAG and LEAD together collapse a three-row comparison onto one row with no join at all — the pre-window alternative is two self-joins and is both slower and much harder to read. Requiring both neighbours to be non-NULL correctly refuses to call the first and last days peaks.',
    },
  ],
};
