import type { Pattern } from '../types';

export const p34: Pattern = {
  num: 34,
  slug: 'find-consecutive-records',
  title: 'Find Consecutive Records',
  concept: 'LAG()',
  category: 'Time Series & Dates',
  tagline: 'Streaks, runs and repeats — flag the breaks with LAG, then accumulate them into group ids.',
  theory: `Consecutiveness questions come in two sizes, and they need different tools.

**Fixed-length runs** — "three logins in a row", "two increases then a decrease" — can be answered by bringing the neighbouring rows onto the current one with LAG and LEAD and comparing. Three rows means two lookaheads. It is simple, readable, and it does not generalise: you cannot write N LAG calls for unknown N.

**Arbitrary-length runs** — "the longest streak", "every unbroken period" — need the **gaps-and-islands** technique, which is the single most valuable idea in time-series SQL:

1. Order the rows and detect where the sequence *breaks* (a LAG comparison, or the date-minus-row-number trick).
2. Turn each break into a 1 and everything else into a 0.
3. Running-SUM that flag. Every row in an unbroken run now shares the same accumulated value — that is the island id.
4. GROUP BY the island id: MIN and MAX give the run's bounds, COUNT gives its length.

The date-minus-row-number shortcut is worth internalising: for consecutive daily rows, both the date and the row number advance by one, so their difference is constant within a run and changes at every gap.`,
  pitfalls: [
    'Comparing to LAG without PARTITION BY, so one entity\'s first row continues the previous entity\'s streak.',
    'Using date − row_number on data that has duplicate dates per entity — deduplicate first.',
    'Forgetting that LAG returns NULL on the first row, which must count as a break rather than a continuation.',
    'Assuming consecutive means "consecutive rows" when the business means "consecutive days" — a gap in the data hides a gap in reality.',
    'Trying to express an arbitrary-length streak with a fixed number of LAG calls.',
  ],
  questions: [
    {
      id: 'p34-q1',
      difficulty: 'easy',
      prompt: 'Flag logins that happened the day after the same user\'s previous login.',
      tables: ['logins'],
      think: 'What makes two rows consecutive — their position in the table, or the values in them?',
      hint: 'LAG the date and test whether the difference is exactly one day.',
      approach: `Partition by user and order by login_date.\nLAG the login_date to bring the previous login onto the row.\nCompute the day gap.\nFlag rows where the gap is exactly one.`,
      solution: `SELECT user_id,
       login_date,
       LAG(login_date) OVER (PARTITION BY user_id ORDER BY login_date) AS prev_login,
       login_date - LAG(login_date) OVER (PARTITION BY user_id
                                          ORDER BY login_date) AS gap_days,
       CASE WHEN login_date - LAG(login_date) OVER (PARTITION BY user_id
                                                    ORDER BY login_date) = 1
            THEN 'consecutive' ELSE 'break' END AS status
FROM logins
ORDER BY user_id, login_date;`,
      explanation: 'The first login of each user returns NULL for the gap, and the CASE sends it to "break" — which is correct, since a streak starts there rather than continuing. PARTITION BY is what stops one user\'s first row comparing against another user\'s last.',
    },
    {
      id: 'p34-q2',
      difficulty: 'easy',
      prompt: 'Find users who logged in on three consecutive days.',
      tables: ['logins'],
      think: 'Three rows must be examined together. How many LAG calls does that need, and from which anchor?',
      hint: 'Two LAGs from the most recent row, or two LEADs from the earliest — either way, two.',
      approach: `Partition by user and order by date.\nLAG the date by 1 and by 2 to bring the two previous logins onto the row.\nKeep rows where each step is exactly one day.\nReturn the three dates that form the run.`,
      solution: `WITH lagged AS (
    SELECT user_id, login_date,
           LAG(login_date, 1) OVER (PARTITION BY user_id ORDER BY login_date) AS d1,
           LAG(login_date, 2) OVER (PARTITION BY user_id ORDER BY login_date) AS d2
    FROM logins
)
SELECT user_id,
       d2 AS day_1,
       d1 AS day_2,
       login_date AS day_3
FROM lagged
WHERE login_date - d1 = 1
  AND d1 - d2 = 1
ORDER BY user_id, login_date;`,
      explanation: 'Two LAG calls collapse a three-row pattern onto one anchor row, which is the readable way to express short fixed-length sequences. It stops being viable the moment the required run length is a parameter — that is what the islands technique in the later questions solves.',
    },
    {
      id: 'p34-q3',
      difficulty: 'medium',
      prompt: 'Assign a streak id to each user\'s runs of consecutive login days.',
      tables: ['logins'],
      think: 'What single accumulated number is constant within a run and increments at every break?',
      hint: 'A running sum of a 0/1 break flag.',
      approach: `LAG the login date within each user to detect breaks.\nFlag a row with 1 when it starts a new run — no previous row, or a gap larger than one day.\nRunning-sum the flag within the user to produce a streak id.\nEvery row of an unbroken run now shares that id.`,
      solution: `WITH flagged AS (
    SELECT user_id, login_date,
           CASE WHEN LAG(login_date) OVER (PARTITION BY user_id ORDER BY login_date)
                     IS NULL
                  OR login_date - LAG(login_date) OVER (PARTITION BY user_id
                                                        ORDER BY login_date) > 1
                THEN 1 ELSE 0 END AS is_new_streak
    FROM logins
)
SELECT user_id,
       login_date,
       SUM(is_new_streak) OVER (PARTITION BY user_id ORDER BY login_date) AS streak_id
FROM flagged
ORDER BY user_id, login_date;`,
      explanation: 'A running sum over a 0/1 flag increments exactly once per break, so consecutive rows between breaks carry the same total — that total is the island id. This "flag then accumulate" shape solves sessionisation, version grouping and value-change collapsing as well as streaks.',
    },
    {
      id: 'p34-q4',
      difficulty: 'medium',
      prompt: 'Return each user\'s longest login streak with its start and end dates.',
      tables: ['logins'],
      think: 'Once every row carries a streak id, what does the question reduce to?',
      hint: 'GROUP BY the streak id for lengths, then rank the streaks per user and keep the longest.',
      approach: `Build the streak id as in the previous question.\nGroup by user and streak id to get each run's length and bounds.\nRank the runs within each user by length descending.\nKeep the top one per user.`,
      solution: `WITH flagged AS (
    SELECT user_id, login_date,
           CASE WHEN LAG(login_date) OVER (PARTITION BY user_id ORDER BY login_date) IS NULL
                  OR login_date - LAG(login_date) OVER (PARTITION BY user_id
                                                        ORDER BY login_date) > 1
                THEN 1 ELSE 0 END AS brk
    FROM logins
),
streaks AS (
    SELECT user_id, login_date,
           SUM(brk) OVER (PARTITION BY user_id ORDER BY login_date) AS streak_id
    FROM flagged
),
runs AS (
    SELECT user_id, streak_id,
           MIN(login_date) AS streak_start,
           MAX(login_date) AS streak_end,
           COUNT(*)        AS streak_length
    FROM streaks
    GROUP BY user_id, streak_id
)
SELECT user_id, streak_start, streak_end, streak_length
FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id
                                 ORDER BY streak_length DESC, streak_start) AS rn
    FROM runs
) AS ranked
WHERE rn = 1
ORDER BY streak_length DESC;`,
      explanation: 'Once the island id exists, "longest streak" is an ordinary GROUP BY followed by a top-1-per-group ranking — two patterns you already know, composed. Ordering the tiebreak by streak_start makes the winner deterministic when a user has two runs of equal length.',
    },
    {
      id: 'p34-q5',
      difficulty: 'medium',
      prompt: 'Solve the same streak problem with the date-minus-row-number trick instead of LAG.',
      tables: ['logins'],
      think: 'If dates advance by one and row numbers advance by one, what happens to their difference within a run?',
      hint: 'It stays constant, and changes at every gap — so it is already an island id.',
      approach: `Deduplicate to one row per user per day, since duplicates would break the arithmetic.\nNumber each user's days in date order.\nSubtract the row number (as days) from the date.\nGroup by that difference to get the runs.`,
      solution: `WITH distinct_days AS (
    SELECT DISTINCT user_id, login_date FROM logins
),
keyed AS (
    SELECT user_id,
           login_date,
           login_date - (ROW_NUMBER() OVER (PARTITION BY user_id
                                            ORDER BY login_date))::int AS island_key
    FROM distinct_days
)
SELECT user_id,
       MIN(login_date) AS streak_start,
       MAX(login_date) AS streak_end,
       COUNT(*)        AS streak_length
FROM keyed
GROUP BY user_id, island_key
HAVING COUNT(*) >= 3
ORDER BY streak_length DESC;`,
      explanation: 'The DISTINCT is essential — two logins on the same day would make the row number outrun the date and split a genuine run in two. This form is shorter than the LAG version and does the same job; use whichever you can explain faster under pressure.',
      dialect: 'Subtracting an integer from a date is PostgreSQL. MySQL: DATE_SUB(login_date, INTERVAL rn DAY). SQL Server: DATEADD(day, -rn, login_date).',
    },
    {
      id: 'p34-q6',
      difficulty: 'medium',
      prompt: 'Find orders where the amount increased compared to the customer\'s previous order, and count the current increase run.',
      tables: ['orders'],
      think: 'The break condition is now a value comparison rather than a date gap. Does the technique change?',
      hint: 'No — only the flag expression. Everything after it is identical.',
      approach: `LAG the amount within each customer ordered by date.\nFlag a break where the amount did not increase, or there is no previous row.\nRunning-sum the flag to get a run id.\nNumber the rows within each run to get the current run length.`,
      solution: `WITH lagged AS (
    SELECT customer_id, order_id, order_date, amount,
           LAG(amount) OVER (PARTITION BY customer_id
                             ORDER BY order_date, order_id) AS prev_amount
    FROM orders
),
flagged AS (
    SELECT *,
           CASE WHEN prev_amount IS NULL OR amount <= prev_amount
                THEN 1 ELSE 0 END AS brk
    FROM lagged
),
runs AS (
    SELECT *, SUM(brk) OVER (PARTITION BY customer_id
                             ORDER BY order_date, order_id) AS run_id
    FROM flagged
)
SELECT customer_id, order_date, prev_amount, amount,
       CASE WHEN brk = 1 THEN 0
            ELSE ROW_NUMBER() OVER (PARTITION BY customer_id, run_id
                                    ORDER BY order_date) - 1
       END AS consecutive_increases
FROM runs
ORDER BY customer_id, order_date;`,
      explanation: 'Only the break expression changes between a date-gap streak and a value-trend streak — steps 2, 3 and 4 of the islands recipe are identical. Subtracting one from the row number discounts the reset row, so the count reads as "increases so far" rather than "rows in this run".',
    },
    {
      id: 'p34-q7',
      difficulty: 'hard',
      prompt: 'Find products whose daily sales rose for at least four consecutive days.',
      tables: ['sales'],
      think: 'The run length is a threshold rather than a fixed pattern. Which technique scales to that?',
      hint: 'Islands. Build the run id, group by it, then filter on COUNT.',
      approach: `Aggregate sales to one row per product per day.\nLAG the daily total within each product and flag days that did not increase.\nRunning-sum the flag into a run id.\nGroup by product and run id, keeping runs of at least four days.`,
      solution: `WITH daily AS (
    SELECT product_id, sale_date, SUM(amount) AS revenue
    FROM sales
    GROUP BY product_id, sale_date
),
flagged AS (
    SELECT product_id, sale_date, revenue,
           CASE WHEN LAG(revenue) OVER (PARTITION BY product_id ORDER BY sale_date) IS NULL
                  OR revenue <= LAG(revenue) OVER (PARTITION BY product_id
                                                   ORDER BY sale_date)
                THEN 1 ELSE 0 END AS brk
    FROM daily
),
runs AS (
    SELECT *, SUM(brk) OVER (PARTITION BY product_id ORDER BY sale_date) AS run_id
    FROM flagged
)
SELECT product_id,
       MIN(sale_date)  AS run_start,
       MAX(sale_date)  AS run_end,
       COUNT(*)        AS rising_days,
       MIN(revenue)    AS started_at,
       MAX(revenue)    AS peaked_at
FROM runs
GROUP BY product_id, run_id
HAVING COUNT(*) >= 4
ORDER BY rising_days DESC;`,
      explanation: 'Note that the run counted here is "days in the rising block including its first day", so four rows means three increases — decide which the business means and adjust the HAVING accordingly. Aggregating to daily grain first is what makes the LAG comparison meaningful.',
    },
    {
      id: 'p34-q8',
      difficulty: 'hard',
      prompt: 'Find users who logged in every day for a full calendar week, Monday to Sunday.',
      tables: ['logins'],
      think: 'The run must align to a calendar boundary, not just be seven days long. What does that change?',
      hint: 'Group by the week rather than by an island, and count distinct days within it.',
      approach: `Reduce logins to distinct user-days.\nTruncate each date to the start of its ISO week.\nGroup by user and week, counting the distinct days.\nKeep the combinations with all seven days.`,
      solution: `WITH distinct_days AS (
    SELECT DISTINCT user_id, login_date FROM logins
)
SELECT user_id,
       DATE_TRUNC('week', login_date)::date AS week_starting,
       COUNT(*) AS days_logged_in
FROM distinct_days
GROUP BY user_id, DATE_TRUNC('week', login_date)
HAVING COUNT(*) = 7
ORDER BY week_starting DESC, user_id;`,
      explanation: 'A calendar-aligned run is a grouping problem rather than an islands problem — the boundary is given by the calendar, so no break detection is needed. DATE_TRUNC to week in PostgreSQL starts on Monday, which matches the ISO definition the question implies.',
      dialect: 'DATE_TRUNC(\'week\', ...) is PostgreSQL and starts Monday. MySQL: YEARWEEK(login_date, 3) for ISO weeks. SQL Server: DATEADD(week, DATEDIFF(week, 0, login_date), 0).',
    },
    {
      id: 'p34-q9',
      difficulty: 'hard',
      prompt: 'Collapse consecutive rows with the same status into one row per unbroken block.',
      tables: ['orders'],
      think: 'The break is a change in value rather than a gap in time. How does that affect the flag?',
      hint: 'Flag rows where the status differs from the previous one, using a NULL-safe comparison.',
      approach: `LAG the status within each customer ordered by date.\nFlag a row where the status differs from the previous, NULL-safely.\nRunning-sum the flag into a block id.\nGroup by customer and block, returning the status and the block bounds.`,
      solution: `WITH flagged AS (
    SELECT customer_id, order_date, status,
           CASE WHEN status IS DISTINCT FROM
                     LAG(status) OVER (PARTITION BY customer_id ORDER BY order_date)
                THEN 1 ELSE 0 END AS brk
    FROM orders
),
blocks AS (
    SELECT *, SUM(brk) OVER (PARTITION BY customer_id ORDER BY order_date) AS block_id
    FROM flagged
)
SELECT customer_id,
       status,
       MIN(order_date) AS block_start,
       MAX(order_date) AS block_end,
       COUNT(*)        AS orders_in_block
FROM blocks
GROUP BY customer_id, block_id, status
ORDER BY customer_id, block_start;`,
      explanation: 'IS DISTINCT FROM makes a transition into or out of NULL count as a change, which a plain <> would evaluate to UNKNOWN and treat as "no change". Collapsing repeated values into blocks is how a noisy event log becomes a readable state history.',
    },
    {
      id: 'p34-q10',
      difficulty: 'hard',
      prompt: 'Return each user\'s current active streak — the unbroken run of login days ending today or yesterday.',
      tables: ['logins'],
      think: 'A "current" streak is the last island, but only if it reaches the present. What is the test?',
      hint: 'Build the islands, keep the most recent per user, then check its end date is recent enough.',
      approach: `Reduce to distinct user-days and build the island key.\nGroup by user and island to get each run's bounds and length.\nKeep the run with the latest end date per user.\nReturn it only if it ends today or yesterday.`,
      solution: `WITH distinct_days AS (
    SELECT DISTINCT user_id, login_date FROM logins
),
keyed AS (
    SELECT user_id, login_date,
           login_date - (ROW_NUMBER() OVER (PARTITION BY user_id
                                            ORDER BY login_date))::int AS island_key
    FROM distinct_days
),
runs AS (
    SELECT user_id, island_key,
           MIN(login_date) AS streak_start,
           MAX(login_date) AS streak_end,
           COUNT(*)        AS streak_length
    FROM keyed
    GROUP BY user_id, island_key
),
latest AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY streak_end DESC) AS rn
    FROM runs
)
SELECT user_id, streak_start, streak_end, streak_length,
       CURRENT_DATE - streak_end AS days_since_last_login
FROM latest
WHERE rn = 1
  AND streak_end >= CURRENT_DATE - 1
ORDER BY streak_length DESC;`,
      explanation: 'Allowing streak_end to be yesterday as well as today is a deliberate product decision — it stops a streak breaking simply because the user has not logged in yet this morning. Without that tolerance, every streak counter resets at midnight and the metric becomes useless.',
    },
  ],
};
