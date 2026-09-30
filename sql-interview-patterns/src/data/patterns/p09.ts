import type { Pattern } from '../types';

export const p09: Pattern = {
  num: 9,
  slug: 'previous-row-value',
  title: 'Previous Row Value',
  concept: 'LAG()',
  category: 'Window Functions',
  tagline: 'Pull a value from an earlier row onto this one, so a comparison becomes a subtraction.',
  theory: `LAG(expr, offset, default) returns expr from the row 'offset' positions earlier in the window ordering. The offset defaults to 1 and the default value defaults to NULL. That is the whole API — everything else is choosing the partition and the ordering.

Why it matters: an enormous share of analytics questions are "compare this row to the one before". Without LAG you write a self-join on rn = rn - 1, which is slower, longer and harder to read. With LAG the comparison becomes plain arithmetic on one row.

The two things to get right are the ordering — LAG means nothing without a defined sequence — and the first row, which has no predecessor and returns NULL. Decide deliberately whether a NULL previous value should produce a NULL result (usually correct: there is genuinely no change to report) or be coalesced to zero (sometimes right for counts, almost always wrong for growth rates, where it creates a division by zero or a meaningless "infinite growth").`,
  pitfalls: [
    'Omitting ORDER BY inside OVER. "Previous" is undefined without it.',
    'Forgetting PARTITION BY, so the first row of each group silently borrows the last row of the previous group.',
    'COALESCE-ing the LAG to 0 in a percentage-change formula, producing division by zero or fake 100% growth.',
    'Assuming LAG skips missing periods. LAG(1) is the previous *row*, not the previous *month* — a gap in the data becomes a silent comparison against a much older period.',
    'Filtering rows in WHERE before the window runs, which changes which row is "previous".',
  ],
  questions: [
    {
      id: 'p09-q1',
      difficulty: 'easy',
      prompt: 'For each day of sales, show the previous day\'s total alongside the current day\'s.',
      tables: ['sales'],
      think: 'What defines "previous" here — and what will the first row of the series show?',
      hint: 'LAG over an ORDER BY on the date, applied to the daily aggregate.',
      approach: `Aggregate sales to one row per day.\nOrder the window by date.\nUse LAG on the daily total to pull yesterday's value onto today's row.\nReturn both columns.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY sale_date
)
SELECT sale_date,
       amt                             AS today_amount,
       LAG(amt) OVER (ORDER BY sale_date) AS prev_day_amount
FROM daily
ORDER BY sale_date;`,
      explanation: 'The first row returns NULL because nothing precedes it — that is correct, not a bug. Note this is the previous *row with data*: if the 3rd has no sales, the 4th compares against the 2nd.',
    },
    {
      id: 'p09-q2',
      difficulty: 'easy',
      prompt: 'For each order, show the customer\'s previous order amount and the difference.',
      tables: ['orders'],
      think: 'What stops one customer\'s first order from borrowing the previous customer\'s last order?',
      hint: 'PARTITION BY customer_id.',
      approach: `Partition the window by customer_id so LAG stays inside a customer.\nOrder by order_date with order_id as tiebreaker.\nLAG the amount to get the previous order.\nSubtract to get the change.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       amount,
       LAG(amount) OVER (PARTITION BY customer_id
                         ORDER BY order_date, order_id) AS prev_amount,
       amount - LAG(amount) OVER (PARTITION BY customer_id
                                  ORDER BY order_date, order_id) AS change
FROM orders
ORDER BY customer_id, order_date;`,
      explanation: 'Missing PARTITION BY is the defining bug of this pattern: without it the query still runs, still returns plausible numbers, and is completely wrong at every customer boundary.',
    },
    {
      id: 'p09-q3',
      difficulty: 'medium',
      prompt: 'Compute the day-over-day percentage change in sales.',
      tables: ['sales'],
      think: 'Percentage change divides by the previous value. What are the two ways that division can go wrong?',
      hint: 'Guard against both a NULL previous value and a zero previous value.',
      approach: `Aggregate to daily totals and LAG the total.\nSubtract to get the absolute change.\nDivide by the previous value, guarding zero with NULLIF.\nLeave the first row NULL rather than inventing a number for it.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY sale_date
),
lagged AS (
    SELECT sale_date, amt,
           LAG(amt) OVER (ORDER BY sale_date) AS prev_amt
    FROM daily
)
SELECT sale_date,
       amt,
       prev_amt,
       ROUND(100.0 * (amt - prev_amt) / NULLIF(prev_amt, 0), 2) AS pct_change
FROM lagged
ORDER BY sale_date;`,
      explanation: 'NULLIF(prev_amt, 0) turns a zero denominator into NULL, so the row reports "no meaningful change" instead of raising a division error. COALESCE-ing prev_amt to 0 instead would have been the wrong fix — it makes every first row look like infinite growth.',
    },
    {
      id: 'p09-q4',
      difficulty: 'medium',
      prompt: 'Show each employee\'s salary alongside the salary of the next-highest-paid person in their department.',
      tables: ['employees'],
      think: 'The ordering does not have to be time. What sequence makes "previous" mean "the person just above me"?',
      hint: 'Order the window by salary descending; the LAG row is then the person earning more.',
      approach: `Partition by department.\nOrder by salary descending, so the preceding row is the higher earner.\nLAG the salary and the name to bring that person onto this row.\nCompute the gap.`,
      solution: `SELECT dept_id,
       emp_name,
       salary,
       LAG(emp_name) OVER (PARTITION BY dept_id ORDER BY salary DESC, emp_id) AS earns_more,
       LAG(salary)   OVER (PARTITION BY dept_id ORDER BY salary DESC, emp_id) AS their_salary,
       LAG(salary)   OVER (PARTITION BY dept_id ORDER BY salary DESC, emp_id) - salary AS gap
FROM employees
WHERE salary IS NOT NULL
ORDER BY dept_id, salary DESC;`,
      explanation: 'LAG is not a time-series function — it is an "adjacent row in any ordering" function. Ordering by salary turns it into a pay-band gap analysis, which is a genuinely useful HR report.',
    },
    {
      id: 'p09-q5',
      difficulty: 'medium',
      prompt: 'Compute the number of days between each customer\'s consecutive orders.',
      tables: ['orders'],
      think: 'LAG can fetch a date just as easily as a number. What operation turns two dates into a gap?',
      hint: 'Subtract the lagged date from the current one.',
      approach: `Partition by customer and order by order_date.\nLAG the order_date to get the previous purchase date.\nSubtract to get the gap in days.\nThe first order of each customer has a NULL gap, which is correct.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       LAG(order_date) OVER (PARTITION BY customer_id
                             ORDER BY order_date, order_id) AS prev_order_date,
       order_date - LAG(order_date) OVER (PARTITION BY customer_id
                                          ORDER BY order_date, order_id) AS days_since_prev
FROM orders
ORDER BY customer_id, order_date;`,
      explanation: 'Inter-purchase interval is the backbone of churn modelling: average it per customer and a sudden gap far above their norm is an early churn signal. Date subtraction returns an integer in PostgreSQL — other engines need DATEDIFF.',
      dialect: 'PostgreSQL returns days from date − date. MySQL: DATEDIFF(order_date, prev). SQL Server: DATEDIFF(day, prev, order_date).',
    },
    {
      id: 'p09-q6',
      difficulty: 'medium',
      prompt: 'Find orders where the amount more than doubled compared to the customer\'s previous order.',
      tables: ['orders'],
      think: 'The comparison needs the lagged value in a WHERE clause. What does that imply about query structure?',
      hint: 'Materialise the LAG in a CTE, then filter in the outer query.',
      approach: `Compute the previous amount per customer in a CTE.\nIn the outer query keep rows where the current amount exceeds twice the previous.\nExclude rows with no previous order, since they cannot have doubled.\nReturn the multiple for context.`,
      solution: `WITH lagged AS (
    SELECT customer_id, order_id, order_date, amount,
           LAG(amount) OVER (PARTITION BY customer_id
                             ORDER BY order_date, order_id) AS prev_amount
    FROM orders
)
SELECT customer_id,
       order_id,
       order_date,
       prev_amount,
       amount,
       ROUND(amount / NULLIF(prev_amount, 0), 2) AS multiple
FROM lagged
WHERE prev_amount IS NOT NULL
  AND amount > 2 * prev_amount
ORDER BY multiple DESC;`,
      explanation: 'The explicit prev_amount IS NOT NULL is redundant with the arithmetic comparison (NULL > anything is NULL, which filters the row out) but stating it documents the intent and survives future edits.',
    },
    {
      id: 'p09-q7',
      difficulty: 'hard',
      prompt: 'For each customer, flag orders that represent a change in status from their previous order.',
      tables: ['orders'],
      think: 'A change is an inequality between this row and the lagged row. What complicates that comparison when a value can be NULL?',
      hint: 'Use a NULL-safe inequality so a transition into or out of NULL counts as a change.',
      approach: `Partition by customer and order chronologically.\nLAG the status to bring the previous value onto the row.\nCompare the two with a NULL-safe operator so NULL-to-value transitions are detected.\nTreat the very first order as a change only if you intend it to be — here, label it separately.`,
      solution: `WITH lagged AS (
    SELECT customer_id, order_id, order_date, status,
           LAG(status) OVER (PARTITION BY customer_id
                             ORDER BY order_date, order_id) AS prev_status
    FROM orders
)
SELECT customer_id,
       order_id,
       order_date,
       prev_status,
       status,
       CASE WHEN prev_status IS NULL                    THEN 'first order'
            WHEN status IS DISTINCT FROM prev_status    THEN 'changed'
            ELSE 'same'
       END AS transition
FROM lagged
ORDER BY customer_id, order_date;`,
      explanation: 'status <> prev_status evaluates to NULL when either side is NULL, so a genuine transition would be classified as "same". IS DISTINCT FROM is the three-valued-logic-safe comparison, and separating "first order" from "changed" keeps the two different NULL meanings apart.',
      dialect: 'IS DISTINCT FROM is PostgreSQL / standard. MySQL: NOT (a <=> b). SQL Server: expand to (a <> b OR (a IS NULL) <> (b IS NULL)).',
    },
    {
      id: 'p09-q8',
      difficulty: 'hard',
      prompt: 'Compare each month\'s revenue to the same month one year earlier, without assuming every month has data.',
      tables: ['sales'],
      think: 'LAG(12) means twelve rows back, not twelve months back. When do those differ?',
      hint: 'Either build a gapless month spine and use LAG(12), or self-join on the month arithmetic. Both are defensible — show you know why.',
      approach: `Aggregate sales to one row per calendar month.\nGenerate a continuous series of months so no month is missing.\nLEFT JOIN the revenue onto that spine.\nLAG 12 rows back over the gapless spine, which now reliably means one year.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', sale_date) AS mth, SUM(amount) AS revenue
    FROM sales
    GROUP BY DATE_TRUNC('month', sale_date)
),
spine AS (
    SELECT generate_series(
             (SELECT MIN(mth) FROM monthly),
             (SELECT MAX(mth) FROM monthly),
             INTERVAL '1 month')::date AS mth
),
filled AS (
    SELECT s.mth, COALESCE(m.revenue, 0) AS revenue
    FROM spine AS s
    LEFT JOIN monthly AS m ON m.mth = s.mth
)
SELECT mth,
       revenue,
       LAG(revenue, 12) OVER (ORDER BY mth) AS revenue_last_year,
       ROUND(100.0 * (revenue - LAG(revenue, 12) OVER (ORDER BY mth))
             / NULLIF(LAG(revenue, 12) OVER (ORDER BY mth), 0), 2) AS yoy_pct
FROM filled
ORDER BY mth;`,
      explanation: 'The spine is what makes LAG(12) mean "one year" rather than "twelve rows of whatever months happened to exist". Skipping it is the most common way a year-on-year report silently compares March to the previous July.',
      dialect: 'generate_series is PostgreSQL. In other engines build the spine with a recursive CTE or a calendar dimension table, which is what a warehouse would have anyway.',
    },
    {
      id: 'p09-q9',
      difficulty: 'hard',
      prompt: 'Identify the start of each new "session" in page_views, where a session starts when more than 30 minutes have passed since the user\'s previous view.',
      tables: ['page_views'],
      think: 'A session boundary is a property of the gap between two adjacent events. Once you can flag the boundaries, how do you turn them into session ids?',
      hint: 'LAG the timestamp, flag rows whose gap exceeds 30 minutes, then take a running SUM of that flag.',
      approach: `Partition by user and order by timestamp.\nLAG the timestamp to get the previous view time.\nFlag a row as a new session when the previous timestamp is NULL or the gap exceeds 30 minutes.\nRunning-SUM the flag within each user to turn boundaries into an increasing session number.`,
      solution: `WITH gaps AS (
    SELECT user_id, view_id, page, view_ts,
           LAG(view_ts) OVER (PARTITION BY user_id ORDER BY view_ts, view_id) AS prev_ts
    FROM page_views
),
flagged AS (
    SELECT *,
           CASE WHEN prev_ts IS NULL
                  OR view_ts - prev_ts > INTERVAL '30 minutes'
                THEN 1 ELSE 0 END AS is_new_session
    FROM gaps
)
SELECT user_id,
       view_ts,
       page,
       SUM(is_new_session) OVER (PARTITION BY user_id
                                 ORDER BY view_ts, view_id) AS session_no
FROM flagged
ORDER BY user_id, view_ts;`,
      explanation: 'Sessionisation is the classic LAG application: a running sum over a 0/1 boundary flag increments exactly once per boundary, producing a dense session number per user. The same "flag then accumulate" shape solves streaks, version numbering and SCD grouping.',
    },
    {
      id: 'p09-q10',
      difficulty: 'hard',
      prompt: 'For each customer, find the longest gap between consecutive orders and the two order dates that bracket it.',
      tables: ['orders'],
      think: 'You need the maximum of a derived per-row value, plus the rows that produced it. Which tool keeps the rows?',
      hint: 'Compute the gaps with LAG, then rank the gaps per customer and keep rank 1.',
      approach: `LAG the order date per customer to compute each inter-order gap.\nDrop the first order of each customer, which has no gap.\nRank the gaps descending within each customer.\nKeep the largest, returning both bracketing dates.`,
      solution: `WITH gaps AS (
    SELECT customer_id,
           order_date,
           LAG(order_date) OVER (PARTITION BY customer_id
                                 ORDER BY order_date, order_id) AS prev_date
    FROM orders
),
sized AS (
    SELECT customer_id,
           prev_date,
           order_date,
           order_date - prev_date AS gap_days,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date - prev_date DESC, order_date) AS rn
    FROM gaps
    WHERE prev_date IS NOT NULL
)
SELECT customer_id,
       prev_date AS gap_started,
       order_date AS gap_ended,
       gap_days
FROM sized
WHERE rn = 1
ORDER BY gap_days DESC;`,
      explanation: 'MAX(gap_days) grouped by customer would give the number but lose the dates. Ranking keeps the whole row, which is why "max plus the row that achieved it" is always a ranking problem rather than an aggregation one.',
    },
  ],
};
