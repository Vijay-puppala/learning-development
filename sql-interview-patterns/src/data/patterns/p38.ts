import type { Pattern } from '../types';

export const p38: Pattern = {
  num: 38,
  slug: 'running-count',
  title: 'Running Count',
  concept: 'COUNT() OVER()',
  category: 'Window Functions',
  tagline: 'Cumulative counts: how many so far. Which COUNT you use decides what "so far" means.',
  theory: `A running count is COUNT(*) OVER (ORDER BY t) — the ORDER BY changes the frame to "from the start of the partition through the current row", so the count accumulates.

The interesting part is **which count**. COUNT(*) counts rows. COUNT(col) counts rows where col is not NULL, so it doubles as "how many rows so far had a value". COUNT(DISTINCT col) is the one people reach for and, in most engines, **cannot be used as a window function at all** — PostgreSQL, SQL Server and MySQL all reject it. The workaround is the standard one: mark the first occurrence of each value with a ROW_NUMBER partitioned by that value, then running-SUM the marker. That gives a running distinct count and is worth knowing cold.

Running counts are how you express cumulative user growth, total signups to date, how many events have happened before this one, and "position in a race" over time.

As with every cumulative window, the ordering must be deterministic and the RANGE-versus-ROWS distinction matters when the ordering column has duplicates — RANGE makes all same-day rows share the end-of-day count.`,
  pitfalls: [
    'Trying to write COUNT(DISTINCT x) OVER (...) — unsupported in most engines.',
    'Forgetting PARTITION BY, so the count carries across entity boundaries.',
    'Confusing COUNT(*) with COUNT(col) after an outer join, where the difference is exactly the unmatched rows.',
    'Assuming a running count fills missing periods — a day with no rows produces no row at all.',
    'Using the default RANGE frame with duplicate ordering values and being surprised by the step pattern.',
  ],
  questions: [
    {
      id: 'p38-q1',
      difficulty: 'easy',
      prompt: 'Show each customer signup with a running count of total customers to date.',
      tables: ['customers'],
      think: 'What single clause turns COUNT from a total into a cumulative figure?',
      hint: 'ORDER BY inside OVER.',
      approach: `Order the window by signup_date.\nApply COUNT(*) over that ordering, which accumulates from the start.\nAdd customer_id as a tiebreaker so same-day signups step one at a time.\nReturn the running total alongside each signup.`,
      solution: `SELECT customer_id,
       customer_name,
       signup_date,
       COUNT(*) OVER (ORDER BY signup_date, customer_id) AS customers_to_date
FROM customers
ORDER BY signup_date, customer_id;`,
      explanation: 'The last row carries the total customer count and every earlier row carries the count as of that date — a growth curve in one pass. The tiebreaker matters: without it, RANGE semantics would give every same-day signup the same end-of-day number.',
    },
    {
      id: 'p38-q2',
      difficulty: 'easy',
      prompt: 'Show a running count of orders per customer, so each order carries its sequence number and the total so far.',
      tables: ['orders'],
      think: 'What is the difference between this running count and ROW_NUMBER over the same ordering?',
      hint: 'On a unique ordering they are identical — the difference appears only with ties.',
      approach: `Partition by customer so the count restarts per customer.\nOrder by order_date within the partition.\nApply COUNT(*) over that frame.\nCompare it against ROW_NUMBER over the same ordering.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       COUNT(*)     OVER (PARTITION BY customer_id ORDER BY order_date) AS count_range,
       ROW_NUMBER() OVER (PARTITION BY customer_id
                          ORDER BY order_date, order_id)                AS row_num
FROM orders
ORDER BY customer_id, order_date, order_id;`,
      explanation: 'With two orders on the same date, count_range shows the same value on both (RANGE includes all peers) while row_num steps 1, 2. Predicting that divergence before running it is the point of putting the two side by side.',
    },
    {
      id: 'p38-q3',
      difficulty: 'medium',
      prompt: 'Show a daily count of new customers with the cumulative total, including days with no signups.',
      tables: ['customers'],
      think: 'A day with no signups produces no row. What does the cumulative curve look like without it?',
      hint: 'It skips the date entirely. Use a calendar spine to keep the series continuous.',
      approach: `Generate every date in the reporting range.\nCount signups per day.\nLEFT JOIN the counts onto the calendar and treat a missing day as zero.\nRunning-sum the daily counts over the gapless spine.`,
      solution: `WITH calendar AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS d
),
daily AS (
    SELECT signup_date, COUNT(*) AS new_customers
    FROM customers
    WHERE signup_date BETWEEN DATE '2024-01-01' AND DATE '2024-12-31'
    GROUP BY signup_date
)
SELECT c.d AS day,
       COALESCE(dl.new_customers, 0) AS new_customers,
       SUM(COALESCE(dl.new_customers, 0)) OVER (ORDER BY c.d) AS cumulative_customers
FROM calendar AS c
LEFT JOIN daily AS dl ON dl.signup_date = c.d
ORDER BY c.d;`,
      explanation: 'The cumulative column is a running SUM of daily counts rather than a running COUNT of rows, because the grain is now one row per day. The calendar spine is what makes a zero-signup day appear as a flat segment rather than vanishing from the chart.',
    },
    {
      id: 'p38-q4',
      difficulty: 'medium',
      prompt: 'Show a running count of *distinct* customers who have ordered, by order date.',
      tables: ['orders'],
      think: 'COUNT(DISTINCT x) OVER (...) is rejected by most engines. What else marks a value\'s first appearance?',
      hint: 'ROW_NUMBER partitioned by the customer — the row numbered 1 is that customer\'s first order.',
      approach: `Number each customer's orders chronologically.\nMark rows numbered 1 with a 1 and every other row with a 0 — these are first-ever orders.\nRunning-sum that marker over the global date ordering.\nThe result is the cumulative count of distinct customers.`,
      solution: `WITH marked AS (
    SELECT order_id, customer_id, order_date,
           CASE WHEN ROW_NUMBER() OVER (PARTITION BY customer_id
                                        ORDER BY order_date, order_id) = 1
                THEN 1 ELSE 0 END AS is_first_order
    FROM orders
)
SELECT order_date,
       order_id,
       customer_id,
       is_first_order,
       SUM(is_first_order) OVER (ORDER BY order_date, order_id) AS distinct_customers_to_date
FROM marked
ORDER BY order_date, order_id;`,
      explanation: 'Marking each value\'s first occurrence and then running-summing the marker is the standard substitute for an unsupported running distinct count. It also gives you the acquisition curve for free — the marker column is exactly "new customer today".',
      dialect: 'COUNT(DISTINCT x) OVER (...) is unsupported in PostgreSQL, MySQL and SQL Server. Some engines (Snowflake, BigQuery with approximations) allow it; the marker trick works everywhere.',
    },
    {
      id: 'p38-q5',
      difficulty: 'medium',
      prompt: 'Show a running count of cancelled orders alongside a running count of all orders, per customer.',
      tables: ['orders'],
      think: 'Two cumulative counts over the same frame, one conditional. What makes a COUNT conditional?',
      hint: 'COUNT of a CASE that is NULL when the condition fails — COUNT ignores NULLs.',
      approach: `Partition by customer and order chronologically.\nCount all rows cumulatively for the denominator.\nCount only cancelled rows cumulatively using a CASE with no ELSE.\nDivide to get a running cancellation rate.`,
      solution: `SELECT customer_id,
       order_date,
       status,
       COUNT(*) OVER w AS orders_to_date,
       COUNT(CASE WHEN status = 'cancelled' THEN 1 END) OVER w AS cancelled_to_date,
       ROUND(100.0 * COUNT(CASE WHEN status = 'cancelled' THEN 1 END) OVER w
             / NULLIF(COUNT(*) OVER w, 0), 1) AS cancel_rate_pct
FROM orders
WINDOW w AS (PARTITION BY customer_id ORDER BY order_date, order_id)
ORDER BY customer_id, order_date;`,
      explanation: 'Omitting the ELSE is essential: COUNT ignores NULLs, so only cancelled rows contribute, whereas ELSE 0 would make it count every row. A running rate like this lets you see a customer\'s cancellation problem developing rather than only its final state.',
      dialect: 'The named WINDOW clause is PostgreSQL / MySQL 8 / Oracle. SQL Server needs the OVER clause written out on each function.',
    },
    {
      id: 'p38-q6',
      difficulty: 'medium',
      prompt: 'Show how many orders each customer had placed *before* the current one.',
      tables: ['orders'],
      think: 'The current row must be excluded from its own count. What does that do to the frame?',
      hint: 'End the frame at 1 PRECEDING rather than CURRENT ROW.',
      approach: `Partition by customer and order chronologically.\nSet the frame from the start of the partition to the row before the current one.\nCount the rows in that frame.\nThe first order of each customer correctly shows zero.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       amount,
       COUNT(*) OVER (PARTITION BY customer_id
                      ORDER BY order_date, order_id
                      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior_orders,
       CASE WHEN COUNT(*) OVER (PARTITION BY customer_id
                                ORDER BY order_date, order_id
                                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) = 0
            THEN 'first purchase' END AS milestone
FROM orders
ORDER BY customer_id, order_date;`,
      explanation: 'Ending the frame at 1 PRECEDING excludes the current row, which is what "before this one" means — with CURRENT ROW the first order would count itself and show 1. Explicit frames are how you express these off-by-one distinctions precisely.',
    },
    {
      id: 'p38-q7',
      difficulty: 'hard',
      prompt: 'Show the cumulative number of active subscriptions on each day — counting starts minus ends.',
      tables: ['subscriptions'],
      think: 'Two events move the count in opposite directions. How do you accumulate both in one series?',
      hint: 'Emit +1 at each start and −1 the day after each end, then running-sum the deltas.',
      approach: `Emit one event row per subscription start with a delta of +1.\nEmit one event row per subscription end, dated the day after, with a delta of −1.\nAggregate the deltas per date.\nRunning-sum them to get the active count on each event date.`,
      solution: `WITH events AS (
    SELECT start_date AS d, 1 AS delta FROM subscriptions
    UNION ALL
    SELECT COALESCE(end_date, DATE '9999-12-31') + 1, -1 FROM subscriptions
),
netted AS (
    SELECT d, SUM(delta) AS net_change
    FROM events
    GROUP BY d
)
SELECT d AS effective_date,
       net_change,
       SUM(net_change) OVER (ORDER BY d) AS active_subscriptions
FROM netted
WHERE d <= CURRENT_DATE
ORDER BY d;`,
      explanation: 'This sweep-line approach produces the active count at every point where it changes, in O(n log n) rather than the O(days × subscriptions) a date-spine join would cost. Dating the −1 event to the day *after* the end date is what makes the subscription count as active on its final day.',
    },
    {
      id: 'p38-q8',
      difficulty: 'hard',
      prompt: 'Show a running count of distinct products each customer has bought, in order of purchase.',
      tables: ['orders', 'order_items'],
      think: 'The distinct count is now per customer, not global. What does the first-occurrence marker partition by?',
      hint: 'Partition the marker by customer *and* product — the first time this customer bought this product.',
      approach: `Join lines to orders so each row has a customer, a product and a date.\nNumber rows within each (customer, product) pair chronologically.\nMark the rows numbered 1 as that customer's first purchase of that product.\nRunning-sum the marker within each customer ordered by date.`,
      solution: `WITH lines AS (
    SELECT o.customer_id, o.order_date, o.order_id, oi.product_id
    FROM orders      AS o
    JOIN order_items AS oi ON oi.order_id = o.order_id
),
marked AS (
    SELECT *,
           CASE WHEN ROW_NUMBER() OVER (PARTITION BY customer_id, product_id
                                        ORDER BY order_date, order_id) = 1
                THEN 1 ELSE 0 END AS is_new_product
    FROM lines
)
SELECT customer_id,
       order_date,
       product_id,
       is_new_product,
       SUM(is_new_product) OVER (PARTITION BY customer_id
                                 ORDER BY order_date, order_id, product_id)
         AS distinct_products_so_far
FROM marked
ORDER BY customer_id, order_date, product_id;`,
      explanation: 'The marker partitions by the pair, while the accumulation partitions by the customer alone — two different partitions doing two different jobs in one query. The resulting curve measures catalog exploration, which flattens out when a customer settles into repeat-buying the same items.',
    },
    {
      id: 'p38-q9',
      difficulty: 'hard',
      prompt: 'Show a running count that resets at the start of each month.',
      tables: ['orders'],
      think: 'A reset is a new partition. What do you partition by?',
      hint: 'The truncated month, alongside any other partition key.',
      approach: `Derive the month from the order date.\nPartition the window by that month so the count restarts each month.\nOrder by date within the partition.\nReturn both the within-month count and the all-time cumulative count for comparison.`,
      solution: `SELECT order_date,
       DATE_TRUNC('month', order_date)::date AS mth,
       order_id,
       COUNT(*) OVER (PARTITION BY DATE_TRUNC('month', order_date)
                      ORDER BY order_date, order_id) AS orders_this_month,
       COUNT(*) OVER (ORDER BY order_date, order_id)  AS orders_all_time
FROM orders
ORDER BY order_date, order_id;`,
      explanation: 'A month-to-date counter is simply a running count partitioned by month — the partition boundary is the reset. Showing the all-time count beside it makes the sawtooth pattern of the month-to-date column obvious and easy to verify.',
    },
    {
      id: 'p38-q10',
      difficulty: 'hard',
      prompt: 'Find the date on which the cumulative customer count first passed each milestone: 100, 500 and 1000.',
      tables: ['customers'],
      think: 'Three thresholds against one curve. How do you extract the crossing row for each?',
      hint: 'Compute the running count, then for each milestone keep the first row at or above it.',
      approach: `Compute the running customer count ordered by signup date.\nCross join against a small list of milestone values.\nKeep rows where the running count reaches the milestone.\nNumber those per milestone and keep the first.`,
      solution: `WITH growth AS (
    SELECT signup_date,
           customer_id,
           COUNT(*) OVER (ORDER BY signup_date, customer_id) AS customers_to_date
    FROM customers
),
milestones AS (
    SELECT * FROM (VALUES (100), (500), (1000)) AS m(target)
),
crossings AS (
    SELECT m.target,
           g.signup_date,
           g.customers_to_date,
           ROW_NUMBER() OVER (PARTITION BY m.target
                              ORDER BY g.signup_date, g.customer_id) AS rn
    FROM milestones AS m
    JOIN growth     AS g ON g.customers_to_date >= m.target
)
SELECT target        AS milestone,
       signup_date   AS reached_on,
       customers_to_date,
       signup_date - LAG(signup_date) OVER (ORDER BY target) AS days_since_previous
FROM crossings
WHERE rn = 1
ORDER BY target;`,
      explanation: 'Joining the curve to a small VALUES list of thresholds lets one query answer all three milestones, and ROW_NUMBER per milestone picks the first crossing of each. The days_since_previous column turns the milestone list into a growth-acceleration report — shrinking gaps mean growth is speeding up.',
    },
  ],
};
