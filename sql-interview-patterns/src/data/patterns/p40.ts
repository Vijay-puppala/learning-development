import type { Pattern } from '../types';

export const p40: Pattern = {
  num: 40,
  slug: 'rolling-7-day-average',
  title: 'Rolling 7-Day Average',
  concept: 'AVG() OVER()',
  category: 'Time Series & Dates',
  tagline: 'The standard smoothing metric — and the standard trap of seven rows not being seven days.',
  theory: `A rolling 7-day average is the single most common metric in operational dashboards, because it removes the day-of-week cycle that makes raw daily numbers unreadable. Weekday traffic and weekend traffic differ enormously; a 7-day window contains exactly one of each day, so the cycle cancels out.

That is also why the window must be **exactly seven days**, not seven rows. ROWS BETWEEN 6 PRECEDING AND CURRENT ROW counts rows, so if two days are missing from the data the window silently spans nine calendar days and includes two extra Mondays. Two fixes: a RANGE frame expressed in an INTERVAL, or a gapless calendar spine plus a ROWS frame. The spine is more portable and has a second benefit — a zero-activity day contributes a genuine zero instead of being skipped.

The remaining decisions are the same as any moving average. Trailing windows can be computed today; centred windows cannot. The first six days have partial windows and should usually be suppressed. And partitioning matters: without PARTITION BY the average bleeds across products or regions at the boundary.`,
  pitfalls: [
    'Using a 7-row window on data with missing days, which quietly becomes a 9- or 10-day window.',
    'Letting a zero-activity day be absent rather than zero, which inflates the average.',
    'Reporting the first six days as a "7-day average" when they average fewer observations.',
    'Forgetting PARTITION BY, so one product\'s early days average in another product\'s late ones.',
    'Using a centred window in a metric that must be computed for today.',
  ],
  questions: [
    {
      id: 'p40-q1',
      difficulty: 'easy',
      prompt: 'Compute a 7-row trailing average of daily sales, and note its weakness.',
      tables: ['sales'],
      think: 'Under what data condition does a 7-row window stop being a 7-day window?',
      hint: 'Whenever a day has no sales rows at all.',
      approach: `Aggregate sales to one row per day.\nOrder the window by date.\nUse a ROWS frame covering the six preceding rows plus the current one.\nAverage over that frame.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS revenue
    FROM sales
    GROUP BY sale_date
)
SELECT sale_date,
       revenue,
       ROUND(AVG(revenue) OVER (ORDER BY sale_date
                                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS ma_7row
FROM daily
ORDER BY sale_date;`,
      explanation: 'This is correct only if every date in the range has at least one sale — otherwise the window reaches further back in calendar time than intended. The fix is either a RANGE frame or a calendar spine, both of which the next two questions cover.',
    },
    {
      id: 'p40-q2',
      difficulty: 'easy',
      prompt: 'Compute a true 7-calendar-day average using a RANGE frame.',
      tables: ['sales'],
      think: 'What does a RANGE frame bound — the number of rows, or the values of the ordering column?',
      hint: 'The values. With a date ordering, an INTERVAL bound means calendar days.',
      approach: `Aggregate to daily totals.\nOrder the window by date.\nUse a RANGE frame bounded by an interval of six days preceding through the current row.\nAverage over it.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS revenue
    FROM sales
    GROUP BY sale_date
)
SELECT sale_date,
       revenue,
       ROUND(AVG(revenue) OVER (ORDER BY sale_date
                                RANGE BETWEEN INTERVAL '6 days' PRECEDING
                                          AND CURRENT ROW), 2) AS ma_7day,
       COUNT(*)   OVER (ORDER BY sale_date
                        RANGE BETWEEN INTERVAL '6 days' PRECEDING
                                  AND CURRENT ROW) AS days_with_data
FROM daily
ORDER BY sale_date;`,
      explanation: 'RANGE bounds the frame by the ordering *value*, so a missing day shrinks the number of rows averaged rather than dragging in older data. The days_with_data column makes that shrinkage visible — it is the honest way to report that a "7-day average" was built from five days.',
      dialect: 'RANGE with INTERVAL needs PostgreSQL 11+, Oracle or Snowflake. MySQL 8 and SQL Server support only numeric ROWS offsets, so use the calendar-spine approach there.',
    },
    {
      id: 'p40-q3',
      difficulty: 'medium',
      prompt: 'Compute the 7-day average using a calendar spine so zero-activity days count as zero.',
      tables: ['sales'],
      think: 'A day with no sales — should it be excluded from the average, or averaged in as zero?',
      hint: 'For an operational metric, zero. A dead day is information, not an absence.',
      approach: `Generate every date in the reporting range.\nAggregate sales to daily totals.\nLEFT JOIN the totals onto the calendar and COALESCE missing days to zero.\nApply a ROWS frame over the now-gapless series.`,
      solution: `WITH calendar AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
),
daily AS (
    SELECT sale_date, SUM(amount) AS revenue
    FROM sales
    GROUP BY sale_date
),
filled AS (
    SELECT c.d, COALESCE(dl.revenue, 0) AS revenue
    FROM calendar AS c
    LEFT JOIN daily AS dl ON dl.sale_date = c.d
)
SELECT d AS sale_date,
       revenue,
       ROUND(AVG(revenue) OVER (ORDER BY d
                                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS ma_7day
FROM filled
ORDER BY d;`,
      explanation: 'With the spine in place, seven rows really are seven days, so the portable ROWS frame becomes correct. It also changes the answer: a dead day now pulls the average down as it should, whereas the RANGE version would simply have averaged fewer days.',
    },
    {
      id: 'p40-q4',
      difficulty: 'medium',
      prompt: 'Suppress the first six days, where the window is not yet full.',
      tables: ['sales'],
      think: 'AVG will happily average one day and call it a 7-day average. How do you find out how many rows were in the frame?',
      hint: 'COUNT(*) over the identical frame.',
      approach: `Build the gapless daily series.\nCompute the rolling average over a 7-row frame.\nCompute COUNT(*) over the same frame to get the observation count.\nReturn the average only when the count reaches seven.`,
      solution: `WITH calendar AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
),
daily AS (
    SELECT sale_date, SUM(amount) AS revenue FROM sales GROUP BY sale_date
),
filled AS (
    SELECT c.d, COALESCE(dl.revenue, 0) AS revenue
    FROM calendar AS c LEFT JOIN daily AS dl ON dl.sale_date = c.d
)
SELECT d AS sale_date,
       revenue,
       CASE WHEN COUNT(*) OVER w = 7 THEN ROUND(AVG(revenue) OVER w, 2) END AS ma_7day,
       COUNT(*) OVER w AS window_days
FROM filled
WINDOW w AS (ORDER BY d ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
ORDER BY d;`,
      explanation: 'Without the guard, the first row of the chart shows a "7-day average" computed from a single day, which is both wrong and visually misleading at exactly the point readers look first. Using a named WINDOW keeps the average and the count provably over the same frame.',
    },
    {
      id: 'p40-q5',
      difficulty: 'medium',
      prompt: 'Compute a 7-day rolling average per region, so regions do not contaminate each other.',
      tables: ['sales'],
      think: 'What happens at the boundary between two regions without a partition?',
      hint: 'The first days of one region average in the last days of the previous one.',
      approach: `Generate the calendar and CROSS JOIN it against the distinct regions to build a complete grid.\nLEFT JOIN the regional daily totals onto the grid.\nPartition the window by region.\nApply the 7-row frame within each partition.`,
      solution: `WITH calendar AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
),
regions AS (SELECT DISTINCT region FROM sales),
grid AS (
    SELECT r.region, c.d FROM regions AS r CROSS JOIN calendar AS c
),
daily AS (
    SELECT region, sale_date, SUM(amount) AS revenue
    FROM sales GROUP BY region, sale_date
),
filled AS (
    SELECT g.region, g.d, COALESCE(dl.revenue, 0) AS revenue
    FROM grid AS g
    LEFT JOIN daily AS dl ON dl.region = g.region AND dl.sale_date = g.d
)
SELECT region,
       d AS sale_date,
       revenue,
       ROUND(AVG(revenue) OVER (PARTITION BY region ORDER BY d
                                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS ma_7day
FROM filled
ORDER BY region, d;`,
      explanation: 'The grid must be built per region as well as per day, otherwise a region with a quiet week would still have missing rows and the ROWS frame would slip. PARTITION BY then guarantees each region\'s window resets at its own boundary.',
    },
    {
      id: 'p40-q6',
      difficulty: 'medium',
      prompt: 'Show the raw daily value, the 7-day average and the 28-day average together.',
      tables: ['sales'],
      think: 'Why would anyone want two smoothing windows on the same chart?',
      hint: 'Short-term movement against the longer-term level — the crossing of the two is a trend signal.',
      approach: `Build the gapless daily series.\nCompute a 7-row and a 28-row trailing average over it.\nReturn both alongside the raw value.\nAdd the difference between them as a momentum indicator.`,
      solution: `WITH calendar AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
),
daily AS (
    SELECT sale_date, SUM(amount) AS revenue FROM sales GROUP BY sale_date
),
filled AS (
    SELECT c.d, COALESCE(dl.revenue, 0) AS revenue
    FROM calendar AS c LEFT JOIN daily AS dl ON dl.sale_date = c.d
)
SELECT d AS sale_date,
       revenue,
       ROUND(AVG(revenue) OVER (ORDER BY d ROWS BETWEEN  6 PRECEDING AND CURRENT ROW), 2) AS ma_7,
       ROUND(AVG(revenue) OVER (ORDER BY d ROWS BETWEEN 27 PRECEDING AND CURRENT ROW), 2) AS ma_28,
       ROUND(AVG(revenue) OVER (ORDER BY d ROWS BETWEEN  6 PRECEDING AND CURRENT ROW)
           - AVG(revenue) OVER (ORDER BY d ROWS BETWEEN 27 PRECEDING AND CURRENT ROW), 2)
         AS momentum
FROM filled
ORDER BY d;`,
      explanation: 'A 28-day window covers exactly four of each weekday, so it removes the weekly cycle as cleanly as a 7-day one while reacting far more slowly. The momentum column turns the relationship between the two into a single number: positive means the recent week is running above the monthly level.',
    },
    {
      id: 'p40-q7',
      difficulty: 'hard',
      prompt: 'Compute a 7-day rolling distinct customer count — the rolling active-user metric.',
      tables: ['orders'],
      think: 'A distinct count cannot be a window function. What computes it per day instead?',
      hint: 'Join each reporting day to the orders within its trailing window and count distinct there.',
      approach: `Generate the reporting dates.\nLEFT JOIN orders falling within the trailing 7-day window of each date.\nCount distinct customers within each window.\nReturn one row per date.`,
      solution: `WITH days AS (
    SELECT generate_series(DATE '2024-01-07', DATE '2024-12-31', INTERVAL '1 day')::date AS d
)
SELECT dy.d AS as_of,
       COUNT(DISTINCT o.customer_id) AS active_7d,
       COUNT(o.order_id)             AS orders_7d,
       ROUND(1.0 * COUNT(o.order_id)
             / NULLIF(COUNT(DISTINCT o.customer_id), 0), 2) AS orders_per_active
FROM days AS dy
LEFT JOIN orders AS o
       ON o.order_date >  dy.d - INTERVAL '7 days'
      AND o.order_date <= dy.d
GROUP BY dy.d
ORDER BY dy.d;`,
      explanation: 'A rolling distinct count must be recomputed per day because the measure is non-additive — you cannot add yesterday\'s answer to today\'s new customers, since customers also fall out of the back of the window. Starting the series on the 7th rather than the 1st avoids reporting partial windows.',
    },
    {
      id: 'p40-q8',
      difficulty: 'hard',
      prompt: 'Compare each day against the same weekday averaged over the previous four weeks.',
      tables: ['sales'],
      think: 'A 7-day average removes the weekly cycle. What if you want to keep it and compare like with like?',
      hint: 'Partition by day-of-week, then take a 4-row trailing average within that partition.',
      approach: `Build the gapless daily series.\nDerive the day of week from the date.\nPartition the window by day of week and order by date.\nAverage the four preceding same-weekday values, excluding the current day.`,
      solution: `WITH calendar AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
),
daily AS (
    SELECT sale_date, SUM(amount) AS revenue FROM sales GROUP BY sale_date
),
filled AS (
    SELECT c.d, COALESCE(dl.revenue, 0) AS revenue,
           EXTRACT(ISODOW FROM c.d) AS dow
    FROM calendar AS c LEFT JOIN daily AS dl ON dl.sale_date = c.d
)
SELECT d AS sale_date,
       TO_CHAR(d, 'Dy') AS day_name,
       revenue,
       ROUND(AVG(revenue) OVER (PARTITION BY dow ORDER BY d
                                ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING), 2)
         AS same_dow_baseline,
       ROUND(100.0 * revenue
             / NULLIF(AVG(revenue) OVER (PARTITION BY dow ORDER BY d
                                         ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING), 0), 1)
         AS pct_of_baseline
FROM filled
ORDER BY d;`,
      explanation: 'Partitioning by day of week compares each Monday against the previous four Mondays, so the weekly cycle is controlled for rather than smoothed away — a quiet Sunday no longer looks like a problem. Ending the frame at 1 PRECEDING keeps today out of its own baseline.',
    },
    {
      id: 'p40-q9',
      difficulty: 'hard',
      prompt: 'Flag days where the actual value falls outside two standard deviations of the trailing 30-day window.',
      tables: ['sales'],
      think: 'A moving average gives the expectation. What gives the tolerance band?',
      hint: 'STDDEV over the same frame, excluding the current day so a spike does not widen its own band.',
      approach: `Build the gapless daily series.\nCompute the mean and standard deviation over a trailing 30-day frame that excludes today.\nCompute the z-score of today against that baseline.\nFlag days beyond two standard deviations, requiring a full window first.`,
      solution: `WITH calendar AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
),
daily AS (
    SELECT sale_date, SUM(amount) AS revenue FROM sales GROUP BY sale_date
),
filled AS (
    SELECT c.d, COALESCE(dl.revenue, 0) AS revenue
    FROM calendar AS c LEFT JOIN daily AS dl ON dl.sale_date = c.d
),
stats AS (
    SELECT d, revenue,
           AVG(revenue)    OVER w AS mu,
           STDDEV(revenue) OVER w AS sigma,
           COUNT(*)        OVER w AS obs
    FROM filled
    WINDOW w AS (ORDER BY d ROWS BETWEEN 30 PRECEDING AND 1 PRECEDING)
)
SELECT d AS sale_date,
       revenue,
       ROUND(mu, 2)    AS baseline_mean,
       ROUND(sigma, 2) AS baseline_sd,
       ROUND((revenue - mu) / NULLIF(sigma, 0), 2) AS z_score,
       CASE WHEN obs = 30 AND ABS(revenue - mu) > 2 * sigma THEN 'anomaly' END AS flag
FROM stats
ORDER BY d;`,
      explanation: 'Excluding the current day from the baseline is what stops a large spike from inflating its own standard deviation and hiding itself. Requiring a full 30-day window before flagging removes the false alarms that the ramp-up period would otherwise generate.',
      dialect: 'STDDEV is PostgreSQL / Oracle (STDDEV_SAMP is the standard spelling). SQL Server: STDEV. MySQL: STDDEV_SAMP.',
    },
    {
      id: 'p40-q10',
      difficulty: 'hard',
      prompt: 'Build a complete daily operations report: raw value, 7-day average, week-over-week change and rank within the trailing 90 days.',
      tables: ['sales'],
      think: 'Four measures over three different frames. Which one cannot be a simple window?',
      hint: 'All four can — but the rank within a moving window needs a self-join or a correlated count.',
      approach: `Build the gapless daily series.\nCompute the 7-day trailing average.\nLAG by seven rows for the week-over-week comparison.\nCount how many of the trailing 90 days had a higher value, which is a rank within that window.`,
      solution: `WITH calendar AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
),
daily AS (
    SELECT sale_date, SUM(amount) AS revenue FROM sales GROUP BY sale_date
),
filled AS (
    SELECT c.d, COALESCE(dl.revenue, 0) AS revenue
    FROM calendar AS c LEFT JOIN daily AS dl ON dl.sale_date = c.d
),
measured AS (
    SELECT d, revenue,
           AVG(revenue) OVER (ORDER BY d ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_7,
           LAG(revenue, 7) OVER (ORDER BY d) AS revenue_last_week,
           COUNT(*) OVER (ORDER BY d ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS obs
    FROM filled
)
SELECT m.d AS sale_date,
       m.revenue,
       CASE WHEN m.obs = 7 THEN ROUND(m.ma_7, 2) END AS ma_7day,
       ROUND(100.0 * (m.revenue - m.revenue_last_week)
             / NULLIF(m.revenue_last_week, 0), 1) AS wow_pct,
       (SELECT COUNT(*) + 1
        FROM measured AS p
        WHERE p.d BETWEEN m.d - 89 AND m.d
          AND p.revenue > m.revenue) AS rank_in_last_90_days
FROM measured AS m
ORDER BY m.d;`,
      explanation: 'The rank within a moving window is the one measure a plain window function cannot express, because RANK() OVER has no notion of a sliding frame — hence the correlated count of better days. LAG(7) is the right week-over-week comparison precisely because the spine guarantees seven rows means seven days.',
    },
  ],
};
