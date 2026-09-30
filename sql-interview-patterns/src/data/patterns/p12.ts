import type { Pattern } from '../types';

export const p12: Pattern = {
  num: 12,
  slug: 'last-value-in-group',
  title: 'Last Value in Group',
  concept: 'LAST_VALUE() OVER()',
  category: 'Window Functions',
  tagline: 'The function with the famous trap: without an explicit frame it returns the current row.',
  theory: `LAST_VALUE(expr) returns expr from the last row of the *frame* — and that word is the entire lesson. When you write ORDER BY inside OVER and no frame clause, SQL applies the default frame RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW. The last row of that frame is the current row. So LAST_VALUE with the default frame returns each row's own value, which looks like a broken function and is in fact the standard behaving exactly as specified.

The fix is to say what you mean: ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING makes the frame the whole partition, and LAST_VALUE then returns the genuine final row.

Two pragmatic alternatives are worth knowing. FIRST_VALUE with the ordering reversed does the same job and needs no frame clause, which is why many teams simply never write LAST_VALUE. And when you want the maximum rather than the final row, MAX() OVER (PARTITION BY ...) is clearer and frame-independent.

Being able to explain this trap is a reliable way to demonstrate that you understand window frames rather than having memorised snippets.`,
  pitfalls: [
    'Omitting the frame and getting the current row back. This is the single most asked window-function gotcha.',
    'Using RANGE instead of ROWS in the frame, which behaves differently when the ordering column has duplicates.',
    'Confusing "last" (by ordering) with "maximum" (by value).',
    'Widening the frame but forgetting PARTITION BY, so every row gets the global last value.',
    'Writing the frame on one window function in a SELECT and forgetting it on the sibling — use a named WINDOW clause.',
  ],
  questions: [
    {
      id: 'p12-q1',
      difficulty: 'easy',
      prompt: 'Show each order with the amount of that customer\'s most recent order.',
      tables: ['orders'],
      think: 'What will LAST_VALUE return if you write it exactly like FIRST_VALUE, with no frame clause?',
      hint: 'Widen the frame to UNBOUNDED FOLLOWING, or the function returns the current row.',
      approach: `Partition by customer_id and order by order_date ascending.\nAdd an explicit frame covering the entire partition.\nLAST_VALUE then reads the final row's amount.\nEvery row of the partition receives that value.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       amount,
       LAST_VALUE(amount) OVER (PARTITION BY customer_id
                                ORDER BY order_date, order_id
                                ROWS BETWEEN UNBOUNDED PRECEDING
                                         AND UNBOUNDED FOLLOWING) AS latest_order_amount
FROM orders
ORDER BY customer_id, order_date;`,
      explanation: 'Remove the ROWS BETWEEN clause and latest_order_amount becomes identical to amount on every row — the default frame ends at the current row. Being able to predict that before running it is the point of this pattern.',
    },
    {
      id: 'p12-q2',
      difficulty: 'easy',
      prompt: 'Get the same result without using LAST_VALUE at all.',
      tables: ['orders'],
      think: 'If "last ascending" and "first descending" are the same row, which function needs no frame clause?',
      hint: 'FIRST_VALUE with ORDER BY reversed.',
      approach: `Partition by customer_id.\nOrder by order_date descending so the most recent order is first.\nFIRST_VALUE reads it with the default frame, safely.\nNo frame clause is needed.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       amount,
       FIRST_VALUE(amount) OVER (PARTITION BY customer_id
                                 ORDER BY order_date DESC, order_id DESC) AS latest_order_amount
FROM orders
ORDER BY customer_id, order_date;`,
      explanation: 'This is the version most teams actually ship: shorter, frame-independent, and immune to the default-frame trap. Knowing both and explaining why you prefer this one is a stronger answer than knowing only one.',
    },
    {
      id: 'p12-q3',
      difficulty: 'medium',
      prompt: 'Demonstrate the trap: return the correct last value and the incorrect default-frame version side by side.',
      tables: ['orders'],
      think: 'Predict both columns before you run it. Which one equals the row\'s own amount?',
      hint: 'Write LAST_VALUE twice — once with a full-partition frame, once without any frame.',
      approach: `Write one LAST_VALUE with ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING.\nWrite a second LAST_VALUE with only an ORDER BY and no frame.\nReturn both alongside the row's own amount.\nCompare the second column to amount — they are identical.`,
      solution: `SELECT customer_id,
       order_date,
       amount,
       LAST_VALUE(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id
                                ROWS BETWEEN UNBOUNDED PRECEDING
                                         AND UNBOUNDED FOLLOWING) AS correct_last,
       LAST_VALUE(amount) OVER (PARTITION BY customer_id ORDER BY order_date, order_id)
                                                                 AS trap_last
FROM orders
ORDER BY customer_id, order_date;`,
      explanation: 'trap_last equals amount on every single row. The default frame is RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW, so "the last row of the frame" is always the row you are standing on.',
    },
    {
      id: 'p12-q4',
      difficulty: 'medium',
      prompt: 'For each product, show every sale next to the most recent sale date and the lifetime maximum amount.',
      tables: ['sales'],
      think: 'One of these is a boundary row and the other is an extreme value. Do both need the frame widened?',
      hint: 'LAST_VALUE needs the frame; MAX() OVER (PARTITION BY ...) with no ORDER BY already covers the partition.',
      approach: `Partition by product_id.\nFor the latest sale date, order by date and widen the frame to the whole partition.\nFor the maximum amount, use MAX with a partition-only window and no ORDER BY.\nReturn both and note they need different window definitions.`,
      solution: `SELECT product_id,
       sale_date,
       amount,
       LAST_VALUE(sale_date) OVER (PARTITION BY product_id
                                   ORDER BY sale_date, sale_id
                                   ROWS BETWEEN UNBOUNDED PRECEDING
                                            AND UNBOUNDED FOLLOWING) AS most_recent_sale,
       MAX(amount)           OVER (PARTITION BY product_id)          AS biggest_ever_sale
FROM sales
ORDER BY product_id, sale_date;`,
      explanation: 'An aggregate window with no ORDER BY already spans the whole partition, which is why MAX needs no frame clause while LAST_VALUE does. Reaching for MAX/MIN when you want an extreme *value* and for FIRST/LAST_VALUE when you want a *companion column* from the extreme row is the clean decision rule.',
    },
    {
      id: 'p12-q5',
      difficulty: 'medium',
      prompt: 'Show each employee next to the name of the most recently hired person in their department.',
      tables: ['employees'],
      think: 'You want a name from the boundary row, not a date. Which family of functions can fetch companion columns?',
      hint: 'FIRST_VALUE(emp_name) with hire_date descending is the simplest correct form.',
      approach: `Partition by dept_id.\nOrder by hire_date descending so the newest hire is first.\nFIRST_VALUE reads that person's name.\nCompare against the employee's own hire date to show tenure relative to the newest joiner.`,
      solution: `SELECT emp_name,
       dept_id,
       hire_date,
       FIRST_VALUE(emp_name)  OVER (PARTITION BY dept_id
                                    ORDER BY hire_date DESC, emp_id DESC) AS newest_hire,
       FIRST_VALUE(hire_date) OVER (PARTITION BY dept_id
                                    ORDER BY hire_date DESC, emp_id DESC) AS newest_hire_date
FROM employees
ORDER BY dept_id, hire_date;`,
      explanation: 'MAX(hire_date) OVER would give the date but never the name. The moment the question asks "who" rather than "when", you need a value function with an ordering, not an aggregate.',
    },
    {
      id: 'p12-q6',
      difficulty: 'medium',
      prompt: 'For each customer, show their first and last order dates and amounts on every order row, plus whether their spend grew.',
      tables: ['orders'],
      think: 'Four boundary values from the same partition. How do you avoid writing the frame clause four times and getting one of them wrong?',
      hint: 'Define the window once with a named WINDOW clause and reference it by name.',
      approach: `Define a named window partitioned by customer, ordered by date, framed over the whole partition.\nCall FIRST_VALUE twice and LAST_VALUE twice against that window.\nCompare the last amount to the first.\nReturn a growth label.`,
      solution: `SELECT customer_id,
       order_date,
       amount,
       FIRST_VALUE(order_date) OVER w AS first_order,
       FIRST_VALUE(amount)     OVER w AS first_amount,
       LAST_VALUE(order_date)  OVER w AS last_order,
       LAST_VALUE(amount)      OVER w AS last_amount,
       CASE WHEN LAST_VALUE(amount) OVER w > FIRST_VALUE(amount) OVER w THEN 'grew'
            WHEN LAST_VALUE(amount) OVER w < FIRST_VALUE(amount) OVER w THEN 'shrank'
            ELSE 'flat' END AS spend_trend
FROM orders
WINDOW w AS (PARTITION BY customer_id ORDER BY order_date, order_id
             ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
ORDER BY customer_id, order_date;`,
      explanation: 'A named WINDOW guarantees all six references share one definition, which is the practical defence against the frame trap — you can only forget the frame once. It also makes the optimiser\'s job easier, since it is unambiguously one window.',
      dialect: 'The WINDOW clause is PostgreSQL / MySQL 8 / Oracle. SQL Server requires the OVER clause repeated in full on each function.',
    },
    {
      id: 'p12-q7',
      difficulty: 'hard',
      prompt: 'For each customer, show the status of their most recent order on every row, and flag customers whose latest order is cancelled.',
      tables: ['orders'],
      think: 'The flag depends on a value broadcast from the last row. Where must the comparison live?',
      hint: 'Broadcast the latest status in a CTE, then filter or flag in the outer query.',
      approach: `Partition by customer and order by date ascending.\nUse LAST_VALUE on status with the frame widened to the whole partition.\nWrap in a CTE so the broadcast value becomes a filterable column.\nFlag or filter rows where that value is 'cancelled'.`,
      solution: `WITH latest AS (
    SELECT customer_id,
           order_id,
           order_date,
           status,
           LAST_VALUE(status) OVER (PARTITION BY customer_id
                                    ORDER BY order_date, order_id
                                    ROWS BETWEEN UNBOUNDED PRECEDING
                                             AND UNBOUNDED FOLLOWING) AS latest_status
    FROM orders
)
SELECT customer_id,
       order_date,
       status,
       latest_status,
       CASE WHEN latest_status = 'cancelled' THEN 'at risk' END AS risk_flag
FROM latest
ORDER BY customer_id, order_date;`,
      explanation: 'Broadcasting a group-level fact onto every row is what makes a row-level filter express a group-level condition — "customers whose latest order is cancelled" needs the group fact visible at row level, and LAST_VALUE puts it there in one pass.',
    },
    {
      id: 'p12-q8',
      difficulty: 'hard',
      prompt: 'Show each month\'s revenue per region alongside the final month\'s revenue in the series, and the gap to it.',
      tables: ['sales'],
      think: 'The comparison target is the end of the series rather than the start. Does the frame direction change anything about correctness?',
      hint: 'LAST_VALUE with UNBOUNDED FOLLOWING, partitioned by region.',
      approach: `Aggregate to revenue per region per month.\nPartition by region and order by month.\nLAST_VALUE the revenue with the frame widened to the whole partition to get the latest month's figure.\nSubtract to show how far each month sits below or above the current level.`,
      solution: `WITH monthly AS (
    SELECT region,
           DATE_TRUNC('month', sale_date) AS mth,
           SUM(amount)                    AS revenue
    FROM sales
    GROUP BY region, DATE_TRUNC('month', sale_date)
)
SELECT region,
       mth,
       revenue,
       LAST_VALUE(revenue) OVER (PARTITION BY region ORDER BY mth
                                 ROWS BETWEEN UNBOUNDED PRECEDING
                                          AND UNBOUNDED FOLLOWING) AS current_level,
       ROUND(100.0 * revenue
             / NULLIF(LAST_VALUE(revenue) OVER (PARTITION BY region ORDER BY mth
                                                ROWS BETWEEN UNBOUNDED PRECEDING
                                                         AND UNBOUNDED FOLLOWING), 0), 1)
         AS pct_of_current
FROM monthly
ORDER BY region, mth;`,
      explanation: 'Indexing to the *end* of a series rather than the start answers "how much of today\'s scale did we have back then", which reads more naturally for growth stories. Note how verbose the repeated frame is — this is precisely the query that should use a named WINDOW.',
    },
    {
      id: 'p12-q9',
      difficulty: 'hard',
      prompt: 'For each customer, show a running "latest known city" from customer_dim, where a row with a NULL city should carry the last non-NULL value forward.',
      tables: ['customer_dim'],
      think: 'LAST_VALUE over the whole partition would reach into the future. What frame carries a value forward without looking ahead?',
      hint: 'Keep the default trailing frame but make the function ignore NULLs — or emulate that with a running MAX over a grouping key.',
      approach: `Partition by customer and order by start_date.\nUse a trailing frame from the start of the partition to the current row, so only the past is visible.\nCount the non-NULL cities seen so far to build a group id that increments at each real value.\nTake the maximum city within each such group, which forward-fills the NULLs.`,
      solution: `WITH grouped AS (
    SELECT customer_id,
           start_date,
           city,
           COUNT(city) OVER (PARTITION BY customer_id
                             ORDER BY start_date
                             ROWS BETWEEN UNBOUNDED PRECEDING
                                      AND CURRENT ROW) AS fill_group
    FROM customer_dim
)
SELECT customer_id,
       start_date,
       city,
       MAX(city) OVER (PARTITION BY customer_id, fill_group) AS city_filled
FROM grouped
ORDER BY customer_id, start_date;`,
      explanation: 'COUNT ignores NULLs, so the running count only increments on rows that carry a real value — every NULL therefore shares a group with the last real value before it. MAX over that group is the classic SQL forward-fill, and it is useful far beyond this table.',
      dialect: 'PostgreSQL 16+, Oracle and Snowflake support LAST_VALUE(city IGNORE NULLS) OVER (...), which does this in one expression. The COUNT-group trick works everywhere.',
    },
    {
      id: 'p12-q10',
      difficulty: 'hard',
      prompt: 'For each subscription, show the plan the customer was on at the very end of their history, and how many plan changes they made along the way.',
      tables: ['subscriptions'],
      think: 'One value comes from the boundary row and the other from counting transitions. Can a single pass produce both?',
      hint: 'LAST_VALUE for the final plan; LAG plus a comparison counted over the partition for the changes.',
      approach: `Partition by customer and order by start_date.\nLAST_VALUE the plan with the frame widened to the whole partition to get the final plan.\nIn an inner step, LAG the plan and flag rows where it differs, using a NULL-safe comparison.\nSum those flags over the partition to count changes.`,
      solution: `WITH flagged AS (
    SELECT customer_id,
           subscription_id,
           plan,
           start_date,
           CASE WHEN LAG(plan) OVER (PARTITION BY customer_id ORDER BY start_date)
                     IS DISTINCT FROM plan
                 AND LAG(plan) OVER (PARTITION BY customer_id ORDER BY start_date)
                     IS NOT NULL
                THEN 1 ELSE 0 END AS changed
    FROM subscriptions
)
SELECT DISTINCT
       customer_id,
       LAST_VALUE(plan) OVER (PARTITION BY customer_id ORDER BY start_date
                              ROWS BETWEEN UNBOUNDED PRECEDING
                                       AND UNBOUNDED FOLLOWING) AS final_plan,
       SUM(changed)     OVER (PARTITION BY customer_id)          AS plan_changes
FROM flagged
ORDER BY plan_changes DESC, customer_id;`,
      explanation: 'The two windows share a partition but need different definitions: the boundary value needs an ordering and a widened frame, while the count is order-independent and needs neither. Excluding the NULL LAG stops the first subscription from being counted as a change, which would inflate every customer by one.',
    },
  ],
};
