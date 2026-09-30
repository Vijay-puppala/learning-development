import type { Pattern } from '../types';

export const p14: Pattern = {
  num: 14,
  slug: 'date-difference',
  title: 'Date Difference',
  concept: 'DATEDIFF()',
  category: 'Time Series & Dates',
  tagline: 'Measure spans between dates — where units, inclusivity and dialect differences all bite.',
  theory: `Every engine can subtract dates; none of them agree on how. PostgreSQL lets you write d2 - d1 and returns an integer number of days. MySQL has DATEDIFF(d2, d1), also days, arguments newest-first. SQL Server has DATEDIFF(unit, start, end) with the unit first and the arguments the other way round. Oracle subtracts to a number and has MONTHS_BETWEEN. Writing the wrong argument order silently returns the negative of the right answer.

Three conceptual traps matter more than the syntax. First, *boundary counting*: SQL Server's DATEDIFF(month, ...) counts boundaries crossed, so 31 Jan to 1 Feb is one month. That is rarely what a human means by "a month apart". Second, *inclusivity*: a stay from the 1st to the 3rd is 2 days of difference and 3 days of occupancy; decide which you were asked for and add one if needed. Third, *timestamps*: subtracting two timestamps gives you an interval with hours and minutes, and truncating it to days is a decision, not a formality.

Finally, never wrap the column in a function when filtering. WHERE DATEDIFF(day, order_date, CURRENT_DATE) <= 30 cannot use an index; WHERE order_date >= CURRENT_DATE - 30 can.`,
  pitfalls: [
    'Reversing the argument order and getting a negative span. SQL Server is (unit, start, end); MySQL is (end, start).',
    'Using month-boundary counting where you meant elapsed months — 31 Jan to 1 Feb is not "a month".',
    'Confusing difference with duration: check whether both endpoints should be counted.',
    'Applying a function to the date column in WHERE, which blocks index use.',
    'Subtracting timestamps and treating the result as an integer. It is an interval, and it has a time part.',
  ],
  questions: [
    {
      id: 'p14-q1',
      difficulty: 'easy',
      prompt: 'For each employee, show how many days they have been with the company.',
      tables: ['employees'],
      think: 'Which of the two dates is the start and which the end — and what sign should the answer have?',
      hint: 'Subtract hire_date from today.',
      approach: `Take the current date as the end point.\nSubtract the hire_date from it.\nThe result is elapsed days, always non-negative for past hires.\nReturn it alongside the hire date.`,
      solution: `SELECT emp_id,
       emp_name,
       hire_date,
       CURRENT_DATE - hire_date AS days_employed
FROM employees
ORDER BY days_employed DESC;`,
      explanation: 'PostgreSQL returns a plain integer from date − date. Ordering by it descending puts the longest-serving employees first, which is the same as ordering by hire_date ascending — worth noticing, because the second form can use an index.',
      dialect: 'MySQL: DATEDIFF(CURDATE(), hire_date). SQL Server: DATEDIFF(day, hire_date, GETDATE()). Oracle: TRUNC(SYSDATE) - hire_date.',
    },
    {
      id: 'p14-q2',
      difficulty: 'easy',
      prompt: 'Show each employee\'s tenure in whole years.',
      tables: ['employees'],
      think: 'Dividing days by 365 is close but wrong. Which detail does it miss, and does it matter for your use case?',
      hint: 'Either divide by 365.25 and floor, or use a dedicated age/interval function for exactness.',
      approach: `Compute the elapsed interval between the hire date and today.\nExtract the whole number of years from it, so leap years are handled correctly.\nReturn the years alongside the hire date.\nOrder by tenure descending.`,
      solution: `SELECT emp_id,
       emp_name,
       hire_date,
       EXTRACT(YEAR FROM AGE(CURRENT_DATE, hire_date)) AS years_of_service
FROM employees
ORDER BY years_of_service DESC, hire_date;`,
      explanation: 'AGE returns a calendar-aware interval, so someone hired on 29 February is handled correctly and no leap-year drift accumulates. (CURRENT_DATE - hire_date) / 365 is off by several days for long tenures and will eventually produce an anniversary a day early.',
      dialect: 'AGE is PostgreSQL. MySQL: TIMESTAMPDIFF(YEAR, hire_date, CURDATE()). SQL Server: DATEDIFF(year, ...) counts boundaries — use a corrected form. Oracle: FLOOR(MONTHS_BETWEEN(SYSDATE, hire_date)/12).',
    },
    {
      id: 'p14-q3',
      difficulty: 'medium',
      prompt: 'Find orders placed in the last 30 days, written so an index on order_date can be used.',
      tables: ['orders'],
      think: 'Both forms of this filter give the same rows. What makes one of them unusable by an index?',
      hint: 'Keep the column bare on one side of the comparison and put all the arithmetic on the other.',
      approach: `Compute the cut-off date by subtracting 30 days from today.\nCompare the raw order_date column against that constant.\nDo not wrap order_date in any function.\nReturn the matching orders.`,
      solution: `SELECT order_id,
       customer_id,
       order_date,
       amount,
       CURRENT_DATE - order_date AS days_ago
FROM orders
WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
  AND order_date <  CURRENT_DATE + INTERVAL '1 day'
ORDER BY order_date DESC;`,
      explanation: 'A predicate is sargable — index-usable — only when the indexed column appears alone on one side. Writing WHERE CURRENT_DATE - order_date <= 30 forces a full scan because the engine must evaluate the expression for every row before it can compare.',
    },
    {
      id: 'p14-q4',
      difficulty: 'medium',
      prompt: 'Calculate the number of days each subscription lasted, counting both the start and end day.',
      tables: ['subscriptions'],
      think: 'A subscription from the 1st to the 3rd — is that 2 days or 3? Which does "lasted" mean?',
      hint: 'Difference is end − start; duration counting both endpoints is that plus one.',
      approach: `Subtract the start_date from the end_date to get the span.\nAdd one so the first day is counted as well.\nReturn both numbers so the distinction is visible.\nOrder by the longest subscription.`,
      solution: `SELECT subscription_id,
       customer_id,
       plan,
       start_date,
       end_date,
       end_date - start_date       AS days_difference,
       end_date - start_date + 1   AS days_inclusive
FROM subscriptions
WHERE end_date IS NOT NULL
ORDER BY days_inclusive DESC;`,
      explanation: 'The off-by-one between "difference" and "duration" is a real billing bug, not a pedantic distinction — a one-day subscription has a difference of zero. Returning both columns and letting the reader choose is the safest deliverable when the spec is ambiguous.',
    },
    {
      id: 'p14-q5',
      difficulty: 'medium',
      prompt: 'For each customer, compute the average number of days between consecutive orders.',
      tables: ['orders'],
      think: 'The gaps have to exist as rows before they can be averaged. What produces them, and which rows have no gap?',
      hint: 'LAG the order date to build per-row gaps, then average them per customer.',
      approach: `Partition by customer and order chronologically.\nLAG the order_date to get the previous purchase date on each row.\nSubtract to produce a gap in days; the first order has none.\nGroup by customer and average the gaps, ignoring NULLs.`,
      solution: `WITH gaps AS (
    SELECT customer_id,
           order_date - LAG(order_date) OVER (PARTITION BY customer_id
                                              ORDER BY order_date, order_id) AS gap_days
    FROM orders
)
SELECT customer_id,
       COUNT(gap_days)                  AS intervals,
       ROUND(AVG(gap_days), 1)          AS avg_days_between_orders,
       MIN(gap_days)                    AS fastest_repeat,
       MAX(gap_days)                    AS slowest_repeat
FROM gaps
GROUP BY customer_id
HAVING COUNT(gap_days) > 0
ORDER BY avg_days_between_orders;`,
      explanation: 'AVG ignores NULLs, so the first order of each customer is excluded automatically and the denominator is the number of intervals, not the number of orders. COUNT(gap_days) rather than COUNT(*) makes that denominator explicit.',
    },
    {
      id: 'p14-q6',
      difficulty: 'medium',
      prompt: 'Find orders that took more than 7 days from placement to delivery, assuming delivered orders have a status of "delivered" and we approximate delivery by the next status change date.',
      tables: ['orders'],
      think: 'When the end date is not stored, it has to be derived. What does that do to the reliability of the answer?',
      hint: 'LEAD the order_date within the customer to approximate a follow-up event, and be explicit that it is an approximation.',
      approach: `Partition by customer and order chronologically.\nLEAD the order_date to get the next event for that customer.\nCompute the gap and keep rows exceeding 7 days where the status is delivered.\nLabel the measure clearly as an approximation.`,
      solution: `WITH spans AS (
    SELECT order_id,
           customer_id,
           order_date,
           status,
           LEAD(order_date) OVER (PARTITION BY customer_id
                                  ORDER BY order_date, order_id) AS next_event_date
    FROM orders
)
SELECT order_id,
       customer_id,
       order_date,
       next_event_date,
       next_event_date - order_date AS approx_days_to_next
FROM spans
WHERE status = 'delivered'
  AND next_event_date IS NOT NULL
  AND next_event_date - order_date > 7
ORDER BY approx_days_to_next DESC;`,
      explanation: 'The honest answer to this question includes the caveat: without a delivered_date column you are measuring the gap to the next order, not the delivery time. Naming the limitation and proposing the schema change is worth more than a query that quietly pretends otherwise.',
    },
    {
      id: 'p14-q7',
      difficulty: 'hard',
      prompt: 'Count business days (Monday to Friday) between each subscription\'s start and end date.',
      tables: ['subscriptions'],
      think: 'Calendar days are arithmetic; business days are a count of qualifying dates. What has to exist for you to count them?',
      hint: 'Generate every date in the range and count the ones whose day of week is Monday to Friday.',
      approach: `For each subscription, generate one row per date between the start and end dates.\nFilter those dates to weekdays using the day-of-week function.\nCount the surviving rows per subscription.\nJoin the count back to the subscription row.`,
      solution: `SELECT s.subscription_id,
       s.customer_id,
       s.start_date,
       s.end_date,
       s.end_date - s.start_date + 1 AS calendar_days,
       (
           SELECT COUNT(*)
           FROM generate_series(s.start_date, s.end_date, INTERVAL '1 day') AS d(day)
           WHERE EXTRACT(ISODOW FROM d.day) BETWEEN 1 AND 5
       ) AS business_days
FROM subscriptions AS s
WHERE s.end_date IS NOT NULL
ORDER BY business_days DESC;`,
      explanation: 'ISODOW numbers Monday as 1 and Sunday as 7, which makes the weekday test a clean BETWEEN 1 AND 5 with no locale dependency. In a warehouse you would join a date dimension carrying an is_business_day flag instead — that also handles public holidays, which no arithmetic formula can.',
      dialect: 'generate_series is PostgreSQL. Elsewhere use a calendar/date dimension table, which production systems should have regardless.',
    },
    {
      id: 'p14-q8',
      difficulty: 'hard',
      prompt: 'For each customer, compute the number of full months between their first and most recent order.',
      tables: ['orders'],
      think: 'Dividing days by 30 is wrong in a way that compounds. What counts a month correctly, and does it count boundaries or elapsed time?',
      hint: 'Use a month-aware difference, then guard the partial month at the end.',
      approach: `Aggregate orders to the first and last order date per customer.\nCompute the difference in whole months between the two, using year and month arithmetic.\nSubtract one when the day-of-month of the end is earlier than that of the start, so partial months do not count.\nReturn the span.`,
      solution: `WITH bounds AS (
    SELECT customer_id,
           MIN(order_date) AS first_order,
           MAX(order_date) AS last_order
    FROM orders
    GROUP BY customer_id
)
SELECT customer_id,
       first_order,
       last_order,
       (EXTRACT(YEAR  FROM last_order) - EXTRACT(YEAR  FROM first_order)) * 12
     + (EXTRACT(MONTH FROM last_order) - EXTRACT(MONTH FROM first_order))
     - CASE WHEN EXTRACT(DAY FROM last_order) < EXTRACT(DAY FROM first_order)
            THEN 1 ELSE 0 END AS full_months_active
FROM bounds
ORDER BY full_months_active DESC;`,
      explanation: 'The year×12 + month formula counts month *boundaries* crossed; the CASE subtracts one when the final month has not actually completed. That correction is exactly what SQL Server\'s DATEDIFF(month, ...) omits, which is why it reports 31 Jan to 1 Feb as one month.',
    },
    {
      id: 'p14-q9',
      difficulty: 'hard',
      prompt: 'Find pairs of consecutive logins by the same user that are more than 90 days apart, and report the gap in months and days.',
      tables: ['logins'],
      think: 'One number can be presented in several units. What do you have to be careful about when converting days to months?',
      hint: 'LAG the login date, filter on the day gap, then express the same interval in a calendar-aware way.',
      approach: `Partition logins by user and order by date.\nLAG the date to get each consecutive pair.\nFilter to pairs more than 90 days apart.\nReport the gap both as raw days and as a calendar-aware interval.`,
      solution: `WITH paired AS (
    SELECT user_id,
           login_date,
           LAG(login_date) OVER (PARTITION BY user_id ORDER BY login_date) AS prev_login
    FROM logins
)
SELECT user_id,
       prev_login,
       login_date,
       login_date - prev_login AS gap_days,
       EXTRACT(YEAR  FROM AGE(login_date, prev_login)) * 12
     + EXTRACT(MONTH FROM AGE(login_date, prev_login)) AS gap_whole_months,
       EXTRACT(DAY   FROM AGE(login_date, prev_login)) AS plus_days
FROM paired
WHERE prev_login IS NOT NULL
  AND login_date - prev_login > 90
ORDER BY gap_days DESC;`,
      explanation: 'AGE decomposes an interval into years, months and days using the real calendar, so "3 months and 4 days" is exact rather than an approximation from dividing by 30. Reporting the raw day count alongside it lets the reader sort and threshold without ambiguity.',
    },
    {
      id: 'p14-q10',
      difficulty: 'hard',
      prompt: 'Bucket customers by recency: days since their last order, grouped into 0-30, 31-90, 91-365 and over 365, with a count per bucket.',
      tables: ['orders', 'customers'],
      think: 'Two aggregations in sequence: one per customer, one per bucket. Which comes first, and what happens to customers who never ordered?',
      hint: 'Reduce to one row per customer with MAX(order_date), bucket it, then group by the bucket.',
      approach: `LEFT JOIN customers to orders so customers with no orders survive.\nAggregate to one row per customer taking the latest order date.\nCompute days since that date and map it to a bucket with CASE, giving never-ordered customers their own label.\nGroup by the bucket and count.`,
      solution: `WITH recency AS (
    SELECT c.customer_id,
           MAX(o.order_date) AS last_order_date
    FROM customers AS c
    LEFT JOIN orders AS o ON o.customer_id = c.customer_id
    GROUP BY c.customer_id
),
bucketed AS (
    SELECT customer_id,
           last_order_date,
           CURRENT_DATE - last_order_date AS days_since,
           CASE WHEN last_order_date IS NULL                     THEN '4. never ordered'
                WHEN CURRENT_DATE - last_order_date <= 30        THEN '0. 0-30 days'
                WHEN CURRENT_DATE - last_order_date <= 90        THEN '1. 31-90 days'
                WHEN CURRENT_DATE - last_order_date <= 365       THEN '2. 91-365 days'
                ELSE                                                  '3. over a year'
           END AS recency_bucket
    FROM recency
)
SELECT recency_bucket,
       COUNT(*) AS customers,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct_of_base
FROM bucketed
GROUP BY recency_bucket
ORDER BY recency_bucket;`,
      explanation: 'The CASE arms are evaluated top to bottom, so the NULL test must come first or never-ordered customers fall into the final ELSE and get counted as lapsed. Numbering the bucket labels makes them sort correctly without a separate ordering column, and SUM(COUNT(*)) OVER () — an aggregate inside a window — gives the grand total for the percentage in the same pass.',
    },
  ],
};
