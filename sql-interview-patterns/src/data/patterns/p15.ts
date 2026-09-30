import type { Pattern } from '../types';

export const p15: Pattern = {
  num: 15,
  slug: 'month-over-month-growth',
  title: 'Month over Month Growth',
  concept: 'LAG() + Calculation',
  category: 'Time Series & Dates',
  tagline: 'Aggregate to the period, fetch the previous period, divide. The gaps are what get you.',
  theory: `Month-over-month growth is a three-step recipe: reduce the data to one row per month, bring the previous month onto each row with LAG, and compute (current − previous) / previous. The arithmetic is trivial; the correctness lives in the setup.

The defining hazard is *missing periods*. LAG(1) returns the previous **row**, not the previous **month**. If March had no sales, April's LAG returns February and the query reports a growth figure that compares two months two apart — with no error and no warning. The fix is a gapless month spine: generate every month in the range, LEFT JOIN the aggregates onto it, and COALESCE the absent months to zero.

Second hazard: division. A previous month of zero makes the growth undefined, not infinite. NULLIF turns the denominator into NULL and the row honestly reports "no comparison possible" rather than crashing or printing a made-up number.

Third: pick the right comparison. Month-over-month is noisy for seasonal businesses — December to January always looks catastrophic. Year-over-year (LAG 12) controls for seasonality, and showing both is what an analyst would deliver.`,
  pitfalls: [
    'Trusting LAG(1) to mean "last month" when months can be missing from the data.',
    'Dividing by a previous value of zero, or COALESCE-ing it to zero and manufacturing infinite growth.',
    'Grouping by month number without the year, so January 2023 and January 2024 merge.',
    'Comparing a partial current month against a complete previous month, making every report end with a false decline.',
    'Reporting month-over-month on seasonal data without a year-over-year column beside it.',
  ],
  questions: [
    {
      id: 'p15-q1',
      difficulty: 'easy',
      prompt: 'Show total sales per month with the previous month\'s total alongside.',
      tables: ['sales'],
      think: 'What has to be true about the grouping key so that the same month in two different years does not merge?',
      hint: 'Truncate the date to a month, which keeps the year, rather than extracting the month number.',
      approach: `Truncate sale_date to the first day of its month, which preserves the year.\nGroup by that and sum the amount.\nOrder the window by the month and LAG the total.\nReturn both columns.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', sale_date) AS mth,
           SUM(amount)                    AS revenue
    FROM sales
    GROUP BY DATE_TRUNC('month', sale_date)
)
SELECT mth,
       revenue,
       LAG(revenue) OVER (ORDER BY mth) AS prev_month_revenue
FROM monthly
ORDER BY mth;`,
      explanation: 'DATE_TRUNC keeps the year in the key, so 2023-01 and 2024-01 stay separate — EXTRACT(MONTH ...) alone would have merged them and produced a chart that repeats every twelve rows.',
      dialect: 'DATE_TRUNC is PostgreSQL. MySQL: DATE_FORMAT(sale_date, \'%Y-%m-01\'). SQL Server: DATEFROMPARTS(YEAR(sale_date), MONTH(sale_date), 1). BigQuery: DATE_TRUNC(sale_date, MONTH).',
    },
    {
      id: 'p15-q2',
      difficulty: 'easy',
      prompt: 'Add the absolute and percentage month-over-month change to that result.',
      tables: ['sales'],
      think: 'The percentage divides by the previous month. What are the two values of that denominator you must handle?',
      hint: 'NULLIF the denominator against zero; the first month stays NULL because there is nothing to compare to.',
      approach: `Compute the monthly totals and LAG them in a CTE.\nSubtract to get the absolute change.\nDivide by the previous value, guarding zero with NULLIF.\nRound the percentage for readability.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', sale_date) AS mth, SUM(amount) AS revenue
    FROM sales
    GROUP BY DATE_TRUNC('month', sale_date)
),
lagged AS (
    SELECT mth, revenue,
           LAG(revenue) OVER (ORDER BY mth) AS prev_revenue
    FROM monthly
)
SELECT mth,
       revenue,
       prev_revenue,
       revenue - prev_revenue AS mom_change,
       ROUND(100.0 * (revenue - prev_revenue) / NULLIF(prev_revenue, 0), 2) AS mom_pct
FROM lagged
ORDER BY mth;`,
      explanation: 'The first month returns NULL for every derived column, which is the correct output — there is genuinely no growth figure for the start of a series. Coercing it to 0% would tell the reader something false.',
    },
    {
      id: 'p15-q3',
      difficulty: 'medium',
      prompt: 'Make the month-over-month calculation correct even when some months have no sales at all.',
      tables: ['sales'],
      think: 'LAG(1) is "the previous row". When is the previous row not the previous month, and how would you notice?',
      hint: 'Build a continuous month spine and LEFT JOIN the aggregates onto it.',
      approach: `Aggregate sales to the months that exist.\nGenerate every month between the earliest and the latest.\nLEFT JOIN the aggregates onto the spine and treat a missing month as zero revenue.\nLAG over the gapless spine so the previous row really is the previous month.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', sale_date) AS mth, SUM(amount) AS revenue
    FROM sales
    GROUP BY DATE_TRUNC('month', sale_date)
),
spine AS (
    SELECT generate_series((SELECT MIN(mth) FROM monthly),
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
       LAG(revenue) OVER (ORDER BY mth) AS prev_revenue,
       ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY mth))
             / NULLIF(LAG(revenue) OVER (ORDER BY mth), 0), 2) AS mom_pct
FROM filled
ORDER BY mth;`,
      explanation: 'The spine converts a silent correctness bug into visible zeros. Note the interaction with NULLIF: a zero month makes the *next* month\'s growth NULL rather than infinite, which is the honest reading of "we grew from nothing".',
    },
    {
      id: 'p15-q4',
      difficulty: 'medium',
      prompt: 'Show month-over-month growth per region, so each region\'s series is independent.',
      tables: ['sales'],
      think: 'What stops one region\'s first month from comparing itself against another region\'s last month?',
      hint: 'PARTITION BY region in the LAG, and group by region in the aggregate.',
      approach: `Group sales by region and month.\nPartition the window by region so the LAG stays inside a region.\nOrder by month within the partition.\nCompute the change and the percentage as before.`,
      solution: `WITH monthly AS (
    SELECT region,
           DATE_TRUNC('month', sale_date) AS mth,
           SUM(amount)                    AS revenue
    FROM sales
    GROUP BY region, DATE_TRUNC('month', sale_date)
),
lagged AS (
    SELECT region, mth, revenue,
           LAG(revenue) OVER (PARTITION BY region ORDER BY mth) AS prev_revenue
    FROM monthly
)
SELECT region, mth, revenue, prev_revenue,
       ROUND(100.0 * (revenue - prev_revenue) / NULLIF(prev_revenue, 0), 2) AS mom_pct
FROM lagged
ORDER BY region, mth;`,
      explanation: 'Without PARTITION BY the query still runs and still produces numbers — it just compares the first month of one region against the last month of the previous one. Silent correctness bugs like this are why the partition is worth saying out loud when you present the query.',
    },
    {
      id: 'p15-q5',
      difficulty: 'medium',
      prompt: 'Show both month-over-month and year-over-year growth in the same result.',
      tables: ['sales'],
      think: 'Two lags at different offsets. What must be true of the series for LAG(12) to mean "a year ago"?',
      hint: 'LAG(1) and LAG(12) over a gapless spine.',
      approach: `Build a gapless monthly series as before.\nLAG by 1 for the previous month and by 12 for the same month last year.\nCompute both percentage changes with guarded division.\nReturn them side by side so seasonality is visible.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', sale_date) AS mth, SUM(amount) AS revenue
    FROM sales
    GROUP BY DATE_TRUNC('month', sale_date)
),
spine AS (
    SELECT generate_series((SELECT MIN(mth) FROM monthly),
                           (SELECT MAX(mth) FROM monthly),
                           INTERVAL '1 month')::date AS mth
),
filled AS (
    SELECT s.mth, COALESCE(m.revenue, 0) AS revenue
    FROM spine AS s LEFT JOIN monthly AS m ON m.mth = s.mth
),
lagged AS (
    SELECT mth, revenue,
           LAG(revenue, 1)  OVER (ORDER BY mth) AS prev_month,
           LAG(revenue, 12) OVER (ORDER BY mth) AS same_month_last_year
    FROM filled
)
SELECT mth, revenue,
       ROUND(100.0 * (revenue - prev_month) / NULLIF(prev_month, 0), 1)           AS mom_pct,
       ROUND(100.0 * (revenue - same_month_last_year)
             / NULLIF(same_month_last_year, 0), 1)                                AS yoy_pct
FROM lagged
ORDER BY mth;`,
      explanation: 'Month-over-month captures momentum and year-over-year controls for seasonality; a retailer reading only the first column panics every January. LAG(12) is only trustworthy on the gapless spine, which is why the spine is not optional here.',
    },
    {
      id: 'p15-q6',
      difficulty: 'medium',
      prompt: 'Exclude the current partial month from a month-over-month report so the last row is not a false decline.',
      tables: ['sales'],
      think: 'Today is the 8th. Comparing 8 days against a full month is not a decline — how do you stop the report doing it?',
      hint: 'Filter the aggregate to months strictly before the current month.',
      approach: `Truncate the current date to the first of this month to get the cut-off.\nRestrict the aggregation to sale dates strictly before that.\nCompute the lag and growth on the complete months only.\nThe report now ends on the last finished month.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', sale_date) AS mth, SUM(amount) AS revenue
    FROM sales
    WHERE sale_date < DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY DATE_TRUNC('month', sale_date)
)
SELECT mth,
       revenue,
       LAG(revenue) OVER (ORDER BY mth) AS prev_revenue,
       ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY mth))
             / NULLIF(LAG(revenue) OVER (ORDER BY mth), 0), 2) AS mom_pct
FROM monthly
ORDER BY mth;`,
      explanation: 'Every month-over-month dashboard that includes the running month shows a cliff at the right-hand edge, and someone will eventually escalate it as a real drop. Cutting at DATE_TRUNC of today is one line and removes an entire class of false alarm.',
    },
    {
      id: 'p15-q7',
      difficulty: 'hard',
      prompt: 'Compute month-over-month growth in the number of *active customers* — customers who placed at least one order that month.',
      tables: ['orders'],
      think: 'The measure is a distinct count rather than a sum. Does that change where the aggregation must happen relative to the LAG?',
      hint: 'COUNT(DISTINCT customer_id) per month first; a distinct count cannot be derived from monthly sums afterwards.',
      approach: `Group orders by month and count distinct customers in each.\nBuild the gapless spine and fill absent months with zero.\nLAG the active count by one month.\nCompute the change and the percentage.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', order_date) AS mth,
           COUNT(DISTINCT customer_id)     AS active_customers
    FROM orders
    WHERE status <> 'cancelled'
    GROUP BY DATE_TRUNC('month', order_date)
),
spine AS (
    SELECT generate_series((SELECT MIN(mth) FROM monthly),
                           (SELECT MAX(mth) FROM monthly),
                           INTERVAL '1 month')::date AS mth
),
filled AS (
    SELECT s.mth, COALESCE(m.active_customers, 0) AS active_customers
    FROM spine AS s LEFT JOIN monthly AS m ON m.mth = s.mth
)
SELECT mth,
       active_customers,
       LAG(active_customers) OVER (ORDER BY mth) AS prev_active,
       active_customers - LAG(active_customers) OVER (ORDER BY mth) AS change,
       ROUND(100.0 * (active_customers - LAG(active_customers) OVER (ORDER BY mth))
             / NULLIF(LAG(active_customers) OVER (ORDER BY mth), 0), 1) AS mom_pct
FROM filled
ORDER BY mth;`,
      explanation: 'A distinct count is not additive: you cannot sum January and February distinct customers to get the two-month figure, so the COUNT(DISTINCT) must happen at exactly the reporting grain. Recognising non-additive measures is a genuine data-engineering signal.',
    },
    {
      id: 'p15-q8',
      difficulty: 'hard',
      prompt: 'Find the three consecutive months with the steepest combined decline in revenue.',
      tables: ['sales'],
      think: 'The measure spans a window of rows rather than a pair. What compares the end of a 3-month window to its start?',
      hint: 'LAG(revenue, 3) gives the value three months back; compare it to the current month over the gapless spine.',
      approach: `Build the gapless monthly revenue series.\nBring the revenue from three months earlier onto each row with LAG.\nCompute the percentage change across that span.\nSort ascending and keep the worst rows.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', sale_date) AS mth, SUM(amount) AS revenue
    FROM sales
    GROUP BY DATE_TRUNC('month', sale_date)
),
spine AS (
    SELECT generate_series((SELECT MIN(mth) FROM monthly),
                           (SELECT MAX(mth) FROM monthly),
                           INTERVAL '1 month')::date AS mth
),
filled AS (
    SELECT s.mth, COALESCE(m.revenue, 0) AS revenue
    FROM spine AS s LEFT JOIN monthly AS m ON m.mth = s.mth
),
spans AS (
    SELECT mth,
           revenue,
           LAG(revenue, 3) OVER (ORDER BY mth) AS revenue_3m_ago,
           LAG(mth, 3)     OVER (ORDER BY mth) AS window_start
    FROM filled
)
SELECT window_start,
       mth AS window_end,
       revenue_3m_ago,
       revenue,
       ROUND(100.0 * (revenue - revenue_3m_ago) / NULLIF(revenue_3m_ago, 0), 1) AS pct_change
FROM spans
WHERE revenue_3m_ago IS NOT NULL
ORDER BY pct_change
LIMIT 3;`,
      explanation: 'LAG with an offset turns "compare to N periods ago" into a one-line change, and LAG-ing the month column too makes the output self-labelling. Sorting ascending on the percentage surfaces the worst declines, which is the direction people forget to flip.',
    },
    {
      id: 'p15-q9',
      difficulty: 'hard',
      prompt: 'Show each product\'s month-over-month growth but only for products with at least six months of sales history.',
      tables: ['sales'],
      think: 'A qualification test at the group level, applied to a row-level report. Where does that filter belong?',
      hint: 'Count the distinct months per product with a window, then filter in the outer query.',
      approach: `Aggregate to revenue per product per month.\nCount the months per product with a window so the count sits on every row.\nLAG the revenue within each product.\nFilter to products whose month count is at least six, then compute the growth.`,
      solution: `WITH monthly AS (
    SELECT product_id,
           DATE_TRUNC('month', sale_date) AS mth,
           SUM(amount)                    AS revenue
    FROM sales
    GROUP BY product_id, DATE_TRUNC('month', sale_date)
),
enriched AS (
    SELECT product_id, mth, revenue,
           COUNT(*) OVER (PARTITION BY product_id)                       AS months_of_history,
           LAG(revenue) OVER (PARTITION BY product_id ORDER BY mth)      AS prev_revenue
    FROM monthly
)
SELECT product_id,
       mth,
       revenue,
       prev_revenue,
       ROUND(100.0 * (revenue - prev_revenue) / NULLIF(prev_revenue, 0), 1) AS mom_pct
FROM enriched
WHERE months_of_history >= 6
ORDER BY product_id, mth;`,
      explanation: 'Computing the qualification as a window puts a group-level fact on every row, so the filter can be a plain WHERE in the outer query rather than a second aggregation and a join. The filter runs after the LAG, so it removes products without disturbing the lags of the ones that remain.',
    },
    {
      id: 'p15-q10',
      difficulty: 'hard',
      prompt: 'Produce a monthly report with revenue, month-over-month percentage, a 3-month moving average, and a streak count of consecutive growing months.',
      tables: ['sales'],
      think: 'Four measures, three different window shapes. Which one cannot be expressed as a single window function?',
      hint: 'The streak needs the flag-and-accumulate islands technique: a running sum of "not growing" creates the group id.',
      approach: `Build the gapless monthly revenue series.\nCompute the lag, the percentage change and a 3-row moving average.\nFlag months that did not grow, and running-sum that flag to create a streak group.\nNumber the rows within each streak group to get the current run length.`,
      solution: `WITH monthly AS (
    SELECT DATE_TRUNC('month', sale_date) AS mth, SUM(amount) AS revenue
    FROM sales
    GROUP BY DATE_TRUNC('month', sale_date)
),
spine AS (
    SELECT generate_series((SELECT MIN(mth) FROM monthly),
                           (SELECT MAX(mth) FROM monthly),
                           INTERVAL '1 month')::date AS mth
),
filled AS (
    SELECT s.mth, COALESCE(m.revenue, 0) AS revenue
    FROM spine AS s LEFT JOIN monthly AS m ON m.mth = s.mth
),
measured AS (
    SELECT mth,
           revenue,
           LAG(revenue) OVER (ORDER BY mth) AS prev_revenue,
           AVG(revenue) OVER (ORDER BY mth ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS ma_3
    FROM filled
),
flagged AS (
    SELECT *,
           CASE WHEN prev_revenue IS NULL OR revenue <= prev_revenue THEN 1 ELSE 0 END AS reset
    FROM measured
),
grouped AS (
    SELECT *, SUM(reset) OVER (ORDER BY mth) AS streak_group
    FROM flagged
)
SELECT mth,
       revenue,
       ROUND(100.0 * (revenue - prev_revenue) / NULLIF(prev_revenue, 0), 1) AS mom_pct,
       ROUND(ma_3, 2) AS ma_3month,
       CASE WHEN reset = 1 THEN 0
            ELSE ROW_NUMBER() OVER (PARTITION BY streak_group ORDER BY mth) - 1
       END AS consecutive_growth_months
FROM grouped
ORDER BY mth;`,
      explanation: 'Three of the four measures are direct window functions; the streak is not, because its value depends on an unbounded run of previous rows. The flag-then-accumulate-then-number chain is the general solution to every streak question, and subtracting one discounts the reset row that starts each group.',
    },
  ],
};
