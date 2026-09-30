import type { Pattern } from '../types';

export const p07: Pattern = {
  num: 7,
  slug: 'running-total',
  title: 'Running Total',
  concept: 'SUM() OVER()',
  category: 'Window Functions',
  tagline: 'A cumulative sum that keeps every row — the frame clause is where the meaning lives.',
  theory: `A running total is SUM(x) OVER (ORDER BY t). Adding ORDER BY inside OVER changes the default frame from "the whole partition" to RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW — every row from the start of the partition up to this one. That default is the entire trick.

The subtlety that separates candidates is RANGE versus ROWS. The default is RANGE, which includes every *peer* row — all rows with the same ORDER BY value — in the current row's frame. With one row per day that is invisible. With three sales on the same date, RANGE gives all three the same running total (the end-of-day figure) while ROWS gives three stepping values. Neither is wrong; know which you asked for.

Add PARTITION BY to reset the accumulator per customer, per region, per year. And remember: the running total is computed over the rows that survived WHERE, so filtering to a date range changes the starting point of the accumulation.`,
  pitfalls: [
    'Assuming ORDER BY inside OVER gives you ROWS semantics. It gives RANGE, and duplicates in the ordering column will surprise you.',
    'Forgetting PARTITION BY, producing one global accumulation when a per-group one was wanted.',
    'Filtering in WHERE and then being surprised the running total does not start from the true beginning of history.',
    'Using a self-join with <= for the cumulative sum. It is O(n²) and will be flagged on any table of size.',
    'Leaving gaps: days with no rows contribute nothing, so the running total is flat but the date is simply absent. Generate a calendar if continuity matters.',
  ],
  questions: [
    {
      id: 'p07-q1',
      difficulty: 'easy',
      prompt: 'Show each sale with a running total of amount ordered by sale_date across the whole table.',
      tables: ['sales'],
      think: 'What single clause turns SUM from a grand total into a cumulative one?',
      hint: 'Adding ORDER BY inside OVER changes the frame to "everything up to the current row".',
      approach: `Use SUM over the amount column.\nAdd an ORDER BY on sale_date inside the OVER clause.\nThat makes the frame run from the first row to the current one.\nReturn the row plus its cumulative figure.`,
      solution: `SELECT sale_id,
       sale_date,
       amount,
       SUM(amount) OVER (ORDER BY sale_date, sale_id) AS running_total
FROM sales
ORDER BY sale_date, sale_id;`,
      explanation: 'Including sale_id in the window ORDER BY makes the ordering total, which sidesteps the RANGE-peers issue entirely: no two rows are peers, so RANGE and ROWS agree.',
    },
    {
      id: 'p07-q2',
      difficulty: 'easy',
      prompt: 'Show a running total of order amount per customer, resetting for each customer.',
      tables: ['orders'],
      think: 'What makes the accumulator restart rather than carry across customers?',
      hint: 'PARTITION BY customer_id.',
      approach: `Partition the window by customer_id so each customer accumulates independently.\nOrder by order_date inside the partition.\nSum the amount over that frame.\nDisplay by customer then date.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       amount,
       SUM(amount) OVER (PARTITION BY customer_id
                         ORDER BY order_date, order_id) AS lifetime_to_date
FROM orders
ORDER BY customer_id, order_date, order_id;`,
      explanation: 'The last row of each partition holds the customer lifetime value, and every earlier row holds the value as of that date — which is exactly what you need to answer "when did this customer cross £1,000?".',
    },
    {
      id: 'p07-q3',
      difficulty: 'medium',
      prompt: 'Produce a daily running total of sales, where each day appears once with its end-of-day cumulative figure.',
      tables: ['sales'],
      think: 'There are many sales per day. Should you aggregate first, or rely on the frame to handle the duplicates?',
      hint: 'Aggregate to one row per day in a CTE, then accumulate — cleaner and unambiguous.',
      approach: `Group sales by sale_date and sum the amount to get one row per day.\nOver that daily result, order by date and take a running sum.\nOne row per day means no peer ambiguity.\nReturn date, daily total and cumulative total.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS daily_amount
    FROM sales
    GROUP BY sale_date
)
SELECT sale_date,
       daily_amount,
       SUM(daily_amount) OVER (ORDER BY sale_date) AS cumulative_amount
FROM daily
ORDER BY sale_date;`,
      explanation: 'Aggregating to the reporting grain before windowing removes the RANGE-versus-ROWS question completely, because there is exactly one row per ordering value. This "aggregate then window" shape is worth defaulting to for any time-series question.',
    },
    {
      id: 'p07-q4',
      difficulty: 'medium',
      prompt: 'Demonstrate the difference between ROWS and RANGE by showing both running totals on raw sales rows ordered by sale_date only.',
      tables: ['sales'],
      think: 'Several sales share a date. Under RANGE, do they see each other in the frame? Under ROWS?',
      hint: 'Write the same SUM twice with explicit frames and compare the two columns on a busy day.',
      approach: `Write one SUM with an explicit ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW frame.\nWrite a second SUM with an explicit RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW frame.\nOrder both by sale_date only, so same-day rows are peers.\nCompare the two columns on a date with several sales.`,
      solution: `SELECT sale_date,
       sale_id,
       amount,
       SUM(amount) OVER (ORDER BY sale_date
                         ROWS  BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS rows_running,
       SUM(amount) OVER (ORDER BY sale_date
                         RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS range_running
FROM sales
ORDER BY sale_date, sale_id;`,
      explanation: 'On a day with three sales, rows_running steps up three times while range_running shows the same end-of-day value on all three rows — because RANGE includes all peers of the current row. RANGE is the default when you write ORDER BY with no frame, which is why this surprises people.',
    },
    {
      id: 'p07-q5',
      difficulty: 'medium',
      prompt: 'For each customer, show the date on which their cumulative spend first reached 1000.',
      tables: ['orders'],
      think: 'Once every row carries a running total, "first time it crossed X" is just a filter plus a pick-the-first.',
      hint: 'Running total in one CTE, then number the qualifying rows and keep number 1.',
      approach: `Compute the per-customer running total ordered by date.\nKeep only rows where that running total is at least 1000.\nNumber those surviving rows per customer by date.\nKeep number 1 — the first crossing.`,
      solution: `WITH running AS (
    SELECT customer_id, order_id, order_date,
           SUM(amount) OVER (PARTITION BY customer_id
                             ORDER BY order_date, order_id) AS cum_spend
    FROM orders
),
crossings AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date, order_id) AS rn
    FROM running
    WHERE cum_spend >= 1000
)
SELECT customer_id, order_date AS crossed_on, cum_spend
FROM crossings
WHERE rn = 1
ORDER BY crossed_on;`,
      explanation: 'The two CTEs do two separate jobs — accumulate, then find the first qualifying row. Note the filter sits between them: filtering before the window would have changed what was accumulated, which is the classic wrong answer here.',
    },
    {
      id: 'p07-q6',
      difficulty: 'medium',
      prompt: 'Show a running total of sales per region per year, resetting at the start of each year.',
      tables: ['sales'],
      think: 'Two reset conditions at once. Does that need two windows, or one with a two-column partition?',
      hint: 'PARTITION BY region and the year expression, both in the same list.',
      approach: `Derive the calendar year from sale_date.\nPartition the window by region and that year, so the total resets on both boundaries.\nOrder by sale_date within the partition.\nReturn the running total alongside the row.`,
      solution: `SELECT region,
       EXTRACT(YEAR FROM sale_date) AS yr,
       sale_date,
       amount,
       SUM(amount) OVER (PARTITION BY region, EXTRACT(YEAR FROM sale_date)
                         ORDER BY sale_date, sale_id) AS ytd_amount
FROM sales
ORDER BY region, yr, sale_date;`,
      explanation: 'A year-to-date figure is nothing more than a running total partitioned by year. Putting the expression directly in PARTITION BY is legal and avoids a wrapper CTE, though naming it in a CTE reads better once the expression gets longer.',
    },
    {
      id: 'p07-q7',
      difficulty: 'hard',
      prompt: 'Show a running total of daily sales that includes days with zero sales, so the series is continuous across 2024.',
      tables: ['sales'],
      think: 'The window can only accumulate rows that exist. Where do the missing days come from?',
      hint: 'Generate a calendar of every date in the range and LEFT JOIN the daily sales onto it.',
      approach: `Generate one row per date across the reporting period.\nAggregate sales to one row per day.\nLEFT JOIN the daily totals onto the calendar, treating a missing day as zero.\nApply the running sum over the calendar, which now has no gaps.`,
      solution: `WITH calendar AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
),
daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    WHERE sale_date BETWEEN DATE '2024-01-01' AND DATE '2024-12-31'
    GROUP BY sale_date
)
SELECT c.d AS sale_date,
       COALESCE(dl.amt, 0) AS daily_amount,
       SUM(COALESCE(dl.amt, 0)) OVER (ORDER BY c.d) AS cumulative_amount
FROM calendar AS c
LEFT JOIN daily AS dl ON dl.sale_date = c.d
ORDER BY c.d;`,
      explanation: 'Windows never invent rows — a zero-sales day produces a flat segment only if a row exists for it. The calendar spine plus LEFT JOIN plus COALESCE is the standard fix and shows up again in rolling averages (pattern 40).',
      dialect: 'generate_series is PostgreSQL. MySQL 8: a recursive CTE counting days. SQL Server: a numbers table or master.dbo.spt_values. BigQuery: GENERATE_DATE_ARRAY with UNNEST.',
    },
    {
      id: 'p07-q8',
      difficulty: 'hard',
      prompt: 'Show each customer\'s running total alongside the running total for their whole country, on the same row.',
      tables: ['orders', 'customers'],
      think: 'Two accumulations over the same ordering at different grains. What has to be true for the country total to be correct on a customer-grain row?',
      hint: 'Two windows with different PARTITION BY but the same ORDER BY, over a joined result.',
      approach: `Join orders to customers so every order row carries a country.\nAccumulate by customer with one window partitioned by customer_id.\nAccumulate by country with a second window partitioned by country, ordered the same way.\nReturn both, plus the customer's share of the country total so far.`,
      solution: `WITH joined AS (
    SELECT o.order_id, o.order_date, o.amount,
           c.customer_id, c.customer_name, c.country
    FROM orders    AS o
    JOIN customers AS c ON c.customer_id = o.customer_id
)
SELECT customer_name,
       country,
       order_date,
       amount,
       SUM(amount) OVER (PARTITION BY customer_id
                         ORDER BY order_date, order_id) AS cust_running,
       SUM(amount) OVER (PARTITION BY country
                         ORDER BY order_date, order_id) AS country_running
FROM joined
ORDER BY country, order_date, order_id;`,
      explanation: 'Because the country window is ordered by the same key, both accumulations are "as of the same instant", so comparing them is meaningful. Mixing orderings between two cumulative windows is the mistake that produces plausible-looking nonsense.',
    },
    {
      id: 'p07-q9',
      difficulty: 'hard',
      prompt: 'Compute a running total of sales that resets to zero whenever a day records no sales — a "streak total".',
      tables: ['sales'],
      think: 'A reset is a new group. How do you turn "runs of consecutive active days" into a group id you can partition by?',
      hint: 'The gaps-and-islands trick: date minus a row number is constant within a consecutive run.',
      approach: `Aggregate to one row per day with sales.\nNumber those days in date order.\nSubtract the row number (as days) from the date — the result is identical for every day in an unbroken run, so it identifies the island.\nPartition the running sum by that island id.`,
      solution: `WITH daily AS (
    SELECT sale_date, SUM(amount) AS amt
    FROM sales
    GROUP BY sale_date
),
islands AS (
    SELECT sale_date,
           amt,
           sale_date - (ROW_NUMBER() OVER (ORDER BY sale_date))::int AS island_key
    FROM daily
)
SELECT sale_date,
       amt,
       SUM(amt) OVER (PARTITION BY island_key
                      ORDER BY sale_date) AS streak_running_total,
       COUNT(*) OVER (PARTITION BY island_key) AS streak_length
FROM islands
ORDER BY sale_date;`,
      explanation: 'date − row_number is the single most useful trick in time-series SQL: both sides advance by one per consecutive day, so their difference is constant within a run and changes at every gap. It reappears in patterns 34, 35 and 41.',
      dialect: 'Subtracting an integer from a date is PostgreSQL. MySQL: DATE_SUB(sale_date, INTERVAL rn DAY). SQL Server: DATEADD(day, -rn, sale_date).',
    },
    {
      id: 'p07-q10',
      difficulty: 'hard',
      prompt: 'For each product, show the running total of units sold and flag the row at which cumulative units passed 80% of that product\'s lifetime total — the Pareto point.',
      tables: ['sales'],
      think: 'You need a cumulative measure and a partition-wide total in the same row. Do the two windows need the same frame?',
      hint: 'One SUM with ORDER BY (cumulative), one SUM without (partition total). The ratio of the two is the cumulative share.',
      approach: `Partition by product_id.\nCompute the running total of quantity ordered by sale_date — this has an ORDER BY so the frame is cumulative.\nCompute the lifetime total of quantity with no ORDER BY so the frame is the whole partition.\nDivide to get the cumulative share and flag the first row where it reaches 0.8.`,
      solution: `WITH cum AS (
    SELECT product_id,
           sale_date,
           quantity,
           SUM(quantity) OVER (PARTITION BY product_id
                               ORDER BY sale_date, sale_id) AS units_to_date,
           SUM(quantity) OVER (PARTITION BY product_id)      AS lifetime_units
    FROM sales
),
scored AS (
    SELECT *,
           1.0 * units_to_date / NULLIF(lifetime_units, 0) AS cum_share,
           ROW_NUMBER() OVER (PARTITION BY product_id
                              ORDER BY sale_date, sale_id) AS rn
    FROM cum
)
SELECT product_id,
       sale_date,
       units_to_date,
       lifetime_units,
       ROUND(CAST(cum_share AS numeric), 4) AS cum_share,
       CASE WHEN cum_share >= 0.8
             AND LAG(cum_share) OVER (PARTITION BY product_id ORDER BY rn) < 0.8
            THEN 'pareto point' END AS milestone
FROM scored
ORDER BY product_id, sale_date;`,
      explanation: 'The same aggregate with and without ORDER BY gives you "so far" and "in total" side by side — the foundation of every cumulative-percentage question (pattern 36). The LAG comparison isolates the single crossing row rather than flagging every row above 80%.',
    },
  ],
};
