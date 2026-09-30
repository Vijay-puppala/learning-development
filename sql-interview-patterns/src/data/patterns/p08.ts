import type { Pattern } from '../types';

export const p08: Pattern = {
  num: 8,
  slug: 'moving-average',
  title: 'Moving Average',
  concept: 'AVG() OVER()',
  category: 'Window Functions',
  tagline: 'Smooth a noisy series by averaging a sliding window — the frame clause is the whole question.',
  theory: `A moving average is AVG(x) OVER (ORDER BY t ROWS BETWEEN n PRECEDING AND CURRENT ROW). Unlike a running total, the frame has a fixed size and slides forward, so old rows fall out of the back.

Three decisions define the answer. First, window size: a 3-row window reacts fast and stays noisy, a 30-row window is smooth and laggy. Second, alignment: "preceding and current row" is a trailing average you can compute in production today; "n PRECEDING AND n FOLLOWING" is a centred average that uses the future and is only valid in hindsight. Third — and this is the one that separates a good answer — ROWS versus RANGE. ROWS counts *rows*, so a 7-row window over gappy daily data covers more than 7 calendar days. RANGE with an INTERVAL counts *time*, which is what "7-day average" almost always means.

Finally, the ramp-up: the first few rows have fewer than n predecessors, so AVG quietly averages a short frame. If a partial window should be NULL instead, count the rows in the frame and blank it out.`,
  pitfalls: [
    'Using ROWS when the requirement is calendar-based and the data has missing days. Seven rows is not seven days.',
    'Leaving the frame out entirely. ORDER BY alone gives a cumulative average, not a moving one.',
    'Forgetting the ramp-up: the first rows average fewer observations and look artificially smooth.',
    'Using a centred window (n FOLLOWING) in a production metric — it cannot be computed for today.',
    'Forgetting PARTITION BY, so the average bleeds across products or regions at the boundary.',
  ],
  questions: [
    {
      id: 'p08-q1',
      difficulty: 'easy',
      prompt: 'Show each day\'s total sales with a 3-day trailing moving average.',
      tables: ['sales'],
      think: 'Which three days go into the average on any given row — and is the current day one of them?',
      hint: 'ROWS BETWEEN 2 PRECEDING AND CURRENT ROW gives a 3-row window ending today.',
      approach: `Aggregate sales to one row per day.\nOrder by date inside the window.\nSet an explicit frame covering the two preceding rows plus the current one.\nAverage the daily total over that frame.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY sale_date
)
SELECT sale_date,
       amt,
       ROUND(AVG(amt) OVER (ORDER BY sale_date
                            ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS ma_3day
FROM daily
ORDER BY sale_date;`,
      explanation: '"2 preceding and current row" is three rows, not four — off-by-one here is the single most common mistake. The first two output rows average one and two observations respectively.',
    },
    {
      id: 'p08-q2',
      difficulty: 'easy',
      prompt: 'Show a 5-order moving average of order amount for each customer.',
      tables: ['orders'],
      think: 'The frame counts orders, not days. What stops the average sliding across customer boundaries?',
      hint: 'PARTITION BY customer_id plus ROWS BETWEEN 4 PRECEDING AND CURRENT ROW.',
      approach: `Partition by customer so each customer's average is independent.\nOrder by order_date within the partition.\nUse a frame of the four preceding rows plus the current one.\nAverage the amount over that frame.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       amount,
       ROUND(AVG(amount) OVER (PARTITION BY customer_id
                               ORDER BY order_date, order_id
                               ROWS BETWEEN 4 PRECEDING AND CURRENT ROW), 2) AS ma_5orders
FROM orders
ORDER BY customer_id, order_date;`,
      explanation: 'ROWS is genuinely right here because the unit of analysis is an order, not a day. PARTITION BY resets the frame at each customer boundary, so customer B\'s first order never averages in customer A\'s last four.',
    },
    {
      id: 'p08-q3',
      difficulty: 'medium',
      prompt: 'Compute a true 7-calendar-day moving average of sales, correct even when some days have no sales rows.',
      tables: ['sales'],
      think: 'Seven rows and seven days are the same thing only if no day is missing. Which frame type counts time rather than rows?',
      hint: 'RANGE BETWEEN INTERVAL \'6 days\' PRECEDING AND CURRENT ROW.',
      approach: `Aggregate to one row per day that has sales.\nOrder by date inside the window.\nUse a RANGE frame expressed in days, not a ROWS frame.\nAverage the daily total over the trailing 7-day span.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY sale_date
)
SELECT sale_date,
       amt,
       ROUND(AVG(amt) OVER (ORDER BY sale_date
                            RANGE BETWEEN INTERVAL '6 days' PRECEDING
                                      AND CURRENT ROW), 2) AS ma_7day
FROM daily
ORDER BY sale_date;`,
      explanation: 'A RANGE frame with an INTERVAL bounds the window by the ordering *value*, so missing days shrink the number of rows averaged instead of dragging in older data. Note it still averages only the days present — if a zero-sales day should count as zero, join a calendar spine first.',
      dialect: 'RANGE with INTERVAL needs PostgreSQL 11+, Oracle, or Snowflake. MySQL 8 and SQL Server support only ROWS with a numeric offset, so build a gapless calendar and use ROWS 6 PRECEDING.',
    },
    {
      id: 'p08-q4',
      difficulty: 'medium',
      prompt: 'Show a 7-day centred moving average — three days either side of the current day plus the day itself.',
      tables: ['sales'],
      think: 'A centred window looks into the future. What does that mean for whether you could run this in production for today?',
      hint: 'ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING.',
      approach: `Aggregate to daily totals.\nOrder by date inside the window.\nSet a frame spanning three rows before and three rows after the current row.\nAverage over it, and note that the last three days of the series will have partial frames.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY sale_date
)
SELECT sale_date,
       amt,
       ROUND(AVG(amt)   OVER w, 2) AS centred_ma_7,
       COUNT(*)         OVER w     AS days_in_window
FROM daily
WINDOW w AS (ORDER BY sale_date ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING)
ORDER BY sale_date;`,
      explanation: 'A centred average removes the lag that a trailing average introduces, which makes it better for describing history and useless for monitoring today. The named WINDOW clause defines the frame once and reuses it — worth knowing and rarely used.',
      dialect: 'The WINDOW clause is PostgreSQL / MySQL 8 / Oracle. SQL Server has no named windows, so repeat the OVER clause.',
    },
    {
      id: 'p08-q5',
      difficulty: 'medium',
      prompt: 'Show the 3-day moving average but return NULL for rows that do not have a full 3-day window.',
      tables: ['sales'],
      think: 'AVG silently averages whatever is in the frame. How do you find out how many rows that actually was?',
      hint: 'COUNT(*) OVER the same frame tells you the frame size; use CASE to blank out short frames.',
      approach: `Compute the moving average over a 3-row trailing frame.\nCompute COUNT(*) over the identical frame to get the number of observations.\nReturn the average only when the count reaches 3.\nOtherwise return NULL.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY sale_date
)
SELECT sale_date,
       amt,
       CASE WHEN COUNT(*) OVER w = 3
            THEN ROUND(AVG(amt) OVER w, 2)
       END AS ma_3day_strict
FROM daily
WINDOW w AS (ORDER BY sale_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
ORDER BY sale_date;`,
      explanation: 'The ramp-up is invisible unless you look for it: without this guard the first row of a chart shows a "3-day average" computed from a single day. Suppressing it is what an analyst would actually ship.',
    },
    {
      id: 'p08-q6',
      difficulty: 'medium',
      prompt: 'For each product, show its 4-week moving average of weekly revenue.',
      tables: ['sales'],
      think: 'The grain must change before the window is applied. What is the unit being averaged?',
      hint: 'Truncate the date to a week, aggregate, then window with ROWS 3 PRECEDING over the weekly rows.',
      approach: `Truncate sale_date to the start of its week and sum revenue per product per week.\nPartition the window by product.\nOrder by week inside the partition.\nAverage over the current week plus the three preceding weeks.`,
      solution: `WITH weekly AS (
    SELECT product_id,
           DATE_TRUNC('week', sale_date) AS wk,
           SUM(amount)                   AS revenue
    FROM sales
    GROUP BY product_id, DATE_TRUNC('week', sale_date)
)
SELECT product_id,
       wk,
       revenue,
       ROUND(AVG(revenue) OVER (PARTITION BY product_id
                                ORDER BY wk
                                ROWS BETWEEN 3 PRECEDING AND CURRENT ROW), 2) AS ma_4week
FROM weekly
ORDER BY product_id, wk;`,
      explanation: 'Changing the grain first turns a messy calendar problem into a tidy row-counting one — after the weekly rollup, "4 weeks" and "4 rows" coincide for any product that sells every week. For a product with dormant weeks you would still need the calendar spine.',
    },
    {
      id: 'p08-q7',
      difficulty: 'hard',
      prompt: 'Show each day\'s sales, its 7-day moving average, and flag days where actual sales deviate more than 50% from that average.',
      tables: ['sales'],
      think: 'The flag compares a row to a window computed from the same row. Can both live in one SELECT?',
      hint: 'Compute the average in a CTE, then do the comparison in the outer query where the alias is visible.',
      approach: `Aggregate to daily totals.\nCompute the trailing 7-day average in a CTE.\nIn the outer query compute the relative deviation of the actual from the average.\nFlag rows whose absolute deviation exceeds 50%.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY sale_date
),
smoothed AS (
    SELECT sale_date,
           amt,
           AVG(amt) OVER (ORDER BY sale_date
                          ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_7,
           COUNT(*) OVER (ORDER BY sale_date
                          ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS obs
    FROM daily
)
SELECT sale_date,
       amt,
       ROUND(ma_7, 2) AS ma_7,
       ROUND(100.0 * (amt - ma_7) / NULLIF(ma_7, 0), 1) AS pct_deviation,
       CASE WHEN obs = 7
             AND ABS(amt - ma_7) > 0.5 * ma_7 THEN 'anomaly' END AS flag
FROM smoothed
ORDER BY sale_date;`,
      explanation: 'A moving average doubles as a naive anomaly detector: the average is the expectation and the deviation is the surprise. Requiring obs = 7 before flagging stops the ramp-up rows from generating false alarms, which is the detail that makes this answer credible.',
    },
    {
      id: 'p08-q8',
      difficulty: 'hard',
      prompt: 'Compute a 7-day moving average where the trailing window excludes the current day — the average of the previous 7 days only.',
      tables: ['sales'],
      think: 'What does the upper bound of the frame become when today must not be included?',
      hint: 'ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING.',
      approach: `Aggregate to daily totals.\nSet the frame to start 7 rows back and end 1 row back, so the current row is outside it.\nAverage over that frame.\nThe result is the baseline against which today can be judged without contaminating it.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY sale_date
)
SELECT sale_date,
       amt,
       ROUND(AVG(amt) OVER (ORDER BY sale_date
                            ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING), 2) AS prior_7day_avg,
       ROUND(amt - AVG(amt) OVER (ORDER BY sale_date
                                  ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING), 2) AS vs_baseline
FROM daily
ORDER BY sale_date;`,
      explanation: 'Both frame bounds can be PRECEDING — the frame does not have to touch the current row. Excluding today matters whenever the average is used as a baseline to score today against, otherwise a spike partly inflates its own expectation.',
    },
    {
      id: 'p08-q9',
      difficulty: 'hard',
      prompt: 'Compute a weighted moving average over the last 3 days, weighting today 3, yesterday 2 and the day before 1.',
      tables: ['sales'],
      think: 'AVG cannot weight. What can you build a weighted average from using only LAG and arithmetic?',
      hint: 'Fetch the two previous values with LAG, then compute the weighted sum divided by the weight total by hand.',
      approach: `Aggregate to daily totals.\nUse LAG to bring yesterday's and the day-before's totals onto the current row.\nMultiply each by its weight and add them.\nDivide by the sum of the weights that actually have a value, so the start of the series is not distorted.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY sale_date
),
lagged AS (
    SELECT sale_date,
           amt,
           LAG(amt, 1) OVER (ORDER BY sale_date) AS amt_1,
           LAG(amt, 2) OVER (ORDER BY sale_date) AS amt_2
    FROM daily
)
SELECT sale_date,
       amt,
       ROUND(
         (3 * amt + 2 * COALESCE(amt_1, 0) + 1 * COALESCE(amt_2, 0))
         / (3 + CASE WHEN amt_1 IS NULL THEN 0 ELSE 2 END
              + CASE WHEN amt_2 IS NULL THEN 0 ELSE 1 END)
       , 2) AS weighted_ma_3
FROM lagged
ORDER BY sale_date;`,
      explanation: 'A weighted moving average reacts to recent change faster than a flat one, and SQL has no built-in for it — you assemble it from LAG. Dividing by the weights that are actually present rather than the constant 6 keeps the first two rows honest.',
    },
    {
      id: 'p08-q10',
      difficulty: 'hard',
      prompt: 'Detect a golden cross: the day a product\'s 7-day moving average rises above its 30-day moving average.',
      tables: ['sales'],
      think: 'A crossing is defined by two rows: the relationship today and the relationship yesterday. How do you compare a derived value to its own previous value?',
      hint: 'Compute both averages, then LAG the difference between them and look for a sign change.',
      approach: `Aggregate to daily revenue per product.\nCompute the 7-row and 30-row trailing averages per product.\nTake their difference, and use LAG to get yesterday's difference.\nA crossing is where today's difference is positive and yesterday's was not.`,
      solution: `WITH daily AS (
    SELECT product_id, sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY product_id, sale_date
),
mas AS (
    SELECT product_id, sale_date, amt,
           AVG(amt) OVER (PARTITION BY product_id ORDER BY sale_date
                          ROWS BETWEEN  6 PRECEDING AND CURRENT ROW) AS ma_7,
           AVG(amt) OVER (PARTITION BY product_id ORDER BY sale_date
                          ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS ma_30,
           COUNT(*) OVER (PARTITION BY product_id ORDER BY sale_date
                          ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS obs
    FROM daily
),
diffed AS (
    SELECT *,
           ma_7 - ma_30 AS spread,
           LAG(ma_7 - ma_30) OVER (PARTITION BY product_id ORDER BY sale_date) AS prev_spread
    FROM mas
)
SELECT product_id, sale_date, ROUND(ma_7, 2) AS ma_7, ROUND(ma_30, 2) AS ma_30
FROM diffed
WHERE obs = 30
  AND spread > 0
  AND prev_spread <= 0
ORDER BY product_id, sale_date;`,
      explanation: 'Crossings are always a two-row comparison of a derived quantity, which is why the spread has to be materialised in a CTE before LAG can reach it. The obs = 30 guard excludes the ramp-up, where the short average is mechanically above the long one and every product would look like a false cross.',
    },
  ],
};
