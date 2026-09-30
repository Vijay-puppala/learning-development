import type { Pattern } from '../types';

export const p04: Pattern = {
  num: 4,
  slug: 'ranking',
  title: 'Ranking',
  concept: 'RANK()',
  category: 'Ranking & Top-N',
  tagline: 'Olympic ranking: ties share a position and the next position is skipped.',
  theory: `RANK() answers "what position is this row in?" when equal values deserve equal positions. Two employees tied at the top are both rank 1, and the next employee is rank 3 — the gap is not a bug, it is the definition. Think of a leaderboard: two golds, no silver.

The consequence people miss is that RANK() <= N does not return N rows. It returns *at least* N rows, and possibly far more if the data is lumpy. That is exactly the behaviour you want for "top 3 including ties" and exactly wrong for "give me 3 rows".

Mechanically it is identical to ROW_NUMBER: an OVER clause, optional PARTITION BY, and a mandatory ORDER BY that defines the sort the rank is measured against. Everything in the ORDER BY list participates in tie detection — add emp_id as a tiebreaker and you have destroyed the ties you were trying to preserve, turning RANK into an expensive ROW_NUMBER.`,
  pitfalls: [
    'Adding a unique tiebreaker to the OVER(ORDER BY ...). It eliminates every tie and RANK silently becomes ROW_NUMBER.',
    'Expecting RANK() <= 3 to return exactly 3 rows.',
    'Expecting consecutive rank numbers. RANK skips after ties — if you need 1,2,3 with ties sharing, that is DENSE_RANK.',
    'Filtering on the rank alias in the same SELECT instead of wrapping in a CTE.',
    'Ranking without PARTITION BY when the ask was per group — one global leaderboard instead of one per department.',
  ],
  questions: [
    {
      id: 'p04-q1',
      difficulty: 'easy',
      prompt: 'Rank all employees by salary from highest to lowest, letting equal salaries share a rank.',
      tables: ['employees'],
      think: 'If three people earn 90,000, what rank should the next person down receive — 2 or 4? Which function gives you that?',
      hint: 'RANK() with an ORDER BY inside OVER, and no PARTITION BY because the leaderboard is global.',
      approach: `Order employees by salary descending inside the window.\nApply RANK so equal salaries receive the same number.\nDo not add a tiebreaker to the window ORDER BY, or the ties disappear.\nReturn name, salary and rank.`,
      solution: `SELECT emp_name,
       salary,
       RANK() OVER (ORDER BY salary DESC) AS salary_rank
FROM employees
WHERE salary IS NOT NULL
ORDER BY salary_rank, emp_name;`,
      explanation: 'No PARTITION BY means a single window covering the whole table. The outer ORDER BY is separate from the window ORDER BY: the window one defines the ranking, the outer one defines the display order.',
    },
    {
      id: 'p04-q2',
      difficulty: 'easy',
      prompt: 'Rank employees by salary within each department.',
      tables: ['employees'],
      think: 'What single clause turns one global leaderboard into one leaderboard per department?',
      hint: 'PARTITION BY dept_id restarts the rank at 1 for every department.',
      approach: `Partition the window by dept_id so the ranking restarts per department.\nOrder by salary descending inside each partition.\nApply RANK.\nDisplay by department then rank.`,
      solution: `SELECT dept_id,
       emp_name,
       salary,
       RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS dept_rank
FROM employees
WHERE salary IS NOT NULL
ORDER BY dept_id, dept_rank;`,
      explanation: 'PARTITION BY is the only difference between a global and a per-group ranking. Every window function on this site uses the same two knobs: partition (which rows share a window) and order (how they are sequenced inside it).',
    },
    {
      id: 'p04-q3',
      difficulty: 'medium',
      prompt: 'Return every employee who is in the top 3 salary positions of their department, including all tied employees.',
      tables: ['employees'],
      think: 'Does "top 3 positions" mean three rows, or every row whose position number is 3 or less?',
      hint: 'RANK gives you position semantics. Filter on rank <= 3 from inside a CTE.',
      approach: `Rank employees by salary descending within each department.\nWrap that in a CTE so the rank becomes filterable.\nKeep rows with rank at most 3 — this may be more than three employees per department.\nOrder by department then rank.`,
      solution: `WITH ranked AS (
    SELECT emp_id, emp_name, dept_id, salary,
           RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS dept_rank
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id, dept_rank, emp_name, salary
FROM ranked
WHERE dept_rank <= 3
ORDER BY dept_id, dept_rank, emp_name;`,
      explanation: 'If a department has two people tied at rank 1 and one at rank 3, the result holds three employees but the ranks read 1, 1, 3. Explain that gap before the interviewer asks about it.',
    },
    {
      id: 'p04-q4',
      difficulty: 'medium',
      prompt: 'Show the salary rank alongside the number of employees sharing that exact salary in the same department.',
      tables: ['employees'],
      think: 'You need a rank and a group size in the same row. Can both be windows over the same partition, with different partition keys?',
      hint: 'The rank partitions by department; the tie count partitions by department *and* salary.',
      approach: `Compute the rank with a window partitioned by dept_id, ordered by salary descending.\nCompute the tie count with a second window partitioned by dept_id and salary, using COUNT(*) with no ORDER BY.\nReturn both side by side.\nDisplay by department then rank.`,
      solution: `SELECT dept_id,
       emp_name,
       salary,
       RANK()   OVER (PARTITION BY dept_id ORDER BY salary DESC) AS dept_rank,
       COUNT(*) OVER (PARTITION BY dept_id, salary)              AS tied_with
FROM employees
WHERE salary IS NOT NULL
ORDER BY dept_id, dept_rank, emp_name;`,
      explanation: 'Different window functions in one SELECT may use completely different OVER clauses. A COUNT(*) OVER with no ORDER BY covers the whole partition, which is how you get a group size next to row detail without joining.',
    },
    {
      id: 'p04-q5',
      difficulty: 'medium',
      prompt: 'Rank products by revenue within their category and return only those ranked worse than 10th — the long tail.',
      tables: ['order_items', 'products'],
      think: 'Ranking is usually used to keep the top. What changes if you want the complement?',
      hint: 'Same rank, inverted filter: rank > 10.',
      approach: `Aggregate order lines into revenue per product, carrying the category.\nRank products by revenue descending within each category.\nKeep the rows whose rank exceeds 10.\nOrder by category then rank so the tail reads in order.`,
      solution: `WITH product_rev AS (
    SELECT p.category, p.product_id, p.product_name,
           SUM(oi.quantity * oi.unit_price) AS revenue
    FROM order_items AS oi
    JOIN products    AS p ON p.product_id = oi.product_id
    GROUP BY p.category, p.product_id, p.product_name
),
ranked AS (
    SELECT *, RANK() OVER (PARTITION BY category ORDER BY revenue DESC) AS rev_rank
    FROM product_rev
)
SELECT category, rev_rank, product_name, revenue
FROM ranked
WHERE rev_rank > 10
ORDER BY category, rev_rank;`,
      explanation: 'Note that products with no order lines never appear, because the inner join drops them. If "long tail" should include never-sold products, the join has to become a LEFT JOIN from products with COALESCE(revenue, 0) — worth flagging as a clarifying question.',
    },
    {
      id: 'p04-q6',
      difficulty: 'medium',
      prompt: 'Rank customers by lifetime spend and also show their percentile position, where 0 is the top spender.',
      tables: ['orders', 'customers'],
      think: 'A rank is an absolute position; a percentile is relative to the population size. Which window function already normalises for you?',
      hint: 'PERCENT_RANK() returns (rank - 1) / (total rows - 1), so the top row is exactly 0.',
      approach: `Aggregate orders to total spend per customer.\nRank by spend descending.\nAdd PERCENT_RANK over the same ordering to get the normalised position.\nReturn both, best first.`,
      solution: `WITH spend AS (
    SELECT c.customer_id, c.customer_name, SUM(o.amount) AS total_spend
    FROM customers AS c
    JOIN orders    AS o ON o.customer_id = c.customer_id
    GROUP BY c.customer_id, c.customer_name
)
SELECT customer_name,
       total_spend,
       RANK()              OVER (ORDER BY total_spend DESC) AS spend_rank,
       ROUND(CAST(PERCENT_RANK() OVER (ORDER BY total_spend DESC) AS numeric), 4) AS pct_rank
FROM spend
ORDER BY spend_rank, customer_name;`,
      explanation: 'PERCENT_RANK is built on RANK, so ties share a percentile too. Use CUME_DIST instead when you want "fraction of rows at or better than this one" — it ranges over (0, 1] rather than [0, 1).',
    },
    {
      id: 'p04-q7',
      difficulty: 'hard',
      prompt: 'Show, for each employee, their salary rank in their department and their rank company-wide, in one row.',
      tables: ['employees'],
      think: 'Two ranks over the same ordering but different partitions. Does that require two passes over the table?',
      hint: 'Two window functions in the same SELECT — one with PARTITION BY, one without.',
      approach: `Rank by salary descending with no partition to get the company-wide position.\nRank by salary descending partitioned by dept_id to get the departmental position.\nReturn both columns in the same row.\nOrder by the company rank.`,
      solution: `SELECT emp_id,
       emp_name,
       dept_id,
       salary,
       RANK() OVER (ORDER BY salary DESC)                      AS company_rank,
       RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS dept_rank
FROM employees
WHERE salary IS NOT NULL
ORDER BY company_rank, dept_id;`,
      explanation: 'One scan, two windows. An employee who is rank 1 in their department but rank 40 company-wide is a big fish in a small pond — the comparison of the two numbers is usually the insight the question is fishing for.',
    },
    {
      id: 'p04-q8',
      difficulty: 'hard',
      prompt: 'Find departments where the top salary is held by more than one employee — a contested first place.',
      tables: ['employees'],
      think: 'A contested first place means several rows share rank 1. How do you count the rows at a given rank?',
      hint: 'Rank first, keep rank 1, then group by department and count what survived.',
      approach: `Rank employees by salary descending within each department.\nKeep only the rows at rank 1.\nGroup those by department and count them.\nKeep departments where the count is above one, and list the tied names.`,
      solution: `WITH ranked AS (
    SELECT emp_id, emp_name, dept_id, salary,
           RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS dept_rank
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id,
       salary        AS top_salary,
       COUNT(*)      AS employees_tied,
       STRING_AGG(emp_name, ', ' ORDER BY emp_name) AS tied_employees
FROM ranked
WHERE dept_rank = 1
GROUP BY dept_id, salary
HAVING COUNT(*) > 1
ORDER BY employees_tied DESC, dept_id;`,
      explanation: 'Because RANK gives every tied row the number 1, "contested" is simply "more than one row survived the rank = 1 filter". This is only true of RANK and DENSE_RANK — ROW_NUMBER would have arbitrarily kept one and hidden the tie entirely.',
      dialect: 'STRING_AGG is PostgreSQL / SQL Server 2017+. MySQL: GROUP_CONCAT(emp_name ORDER BY emp_name). Oracle: LISTAGG(emp_name, \', \') WITHIN GROUP (ORDER BY emp_name).',
    },
    {
      id: 'p04-q9',
      difficulty: 'hard',
      prompt: 'Rank each month of 2024 by total sales, and show how each month\'s rank changed compared with the same month in 2023.',
      tables: ['sales'],
      think: 'You are ranking twice over disjoint populations, then comparing. What is the join key between the two rankings?',
      hint: 'Rank months within each year separately (PARTITION BY year), then join the two years on month number.',
      approach: `Aggregate sales to one row per year and calendar month.\nRank months by revenue descending within each year.\nSelf-join the ranking to itself on month number, one side filtered to 2024 and the other to 2023.\nSubtract the ranks to get the movement, where a negative number means improvement.`,
      solution: `WITH monthly AS (
    SELECT EXTRACT(YEAR  FROM sale_date) AS yr,
           EXTRACT(MONTH FROM sale_date) AS mth,
           SUM(amount)                   AS revenue
    FROM sales
    WHERE sale_date >= DATE '2023-01-01'
      AND sale_date <  DATE '2025-01-01'
    GROUP BY EXTRACT(YEAR FROM sale_date), EXTRACT(MONTH FROM sale_date)
),
ranked AS (
    SELECT *, RANK() OVER (PARTITION BY yr ORDER BY revenue DESC) AS mth_rank
    FROM monthly
)
SELECT cur.mth,
       cur.revenue  AS revenue_2024,
       cur.mth_rank AS rank_2024,
       prv.mth_rank AS rank_2023,
       prv.mth_rank - cur.mth_rank AS rank_improvement
FROM ranked AS cur
LEFT JOIN ranked AS prv
       ON prv.mth = cur.mth
      AND prv.yr  = 2023
WHERE cur.yr = 2024
ORDER BY cur.mth;`,
      explanation: 'Ranking inside a partition of year keeps the two leaderboards independent, which is what makes the comparison meaningful. The LEFT JOIN protects against a month that has 2024 data but no 2023 data — rank_improvement comes back NULL rather than dropping the month.',
    },
    {
      id: 'p04-q10',
      difficulty: 'hard',
      prompt: 'For each department, return the employee whose salary is closest to the department median.',
      tables: ['employees'],
      think: 'Median is not a rank, but it can be reached through one. What does "closest to" look like once you have the median as a number?',
      hint: 'Compute the median per department with a window, then rank employees by the absolute distance from it.',
      approach: `Attach each department's median salary to every employee row using a percentile window function.\nCompute the absolute difference between the employee's salary and that median.\nRank employees within each department by that distance ascending.\nKeep the closest one per department.`,
      solution: `WITH with_median AS (
    SELECT emp_id, emp_name, dept_id, salary,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary)
             OVER (PARTITION BY dept_id) AS median_salary
    FROM employees
    WHERE salary IS NOT NULL
),
scored AS (
    SELECT *,
           ABS(salary - median_salary) AS distance,
           RANK() OVER (PARTITION BY dept_id
                        ORDER BY ABS(salary - median_salary)) AS closeness
    FROM with_median
)
SELECT dept_id, emp_name, salary, ROUND(median_salary, 2) AS median_salary, distance
FROM scored
WHERE closeness = 1
ORDER BY dept_id, emp_name;`,
      explanation: 'PERCENTILE_CONT used as a window attaches an aggregate to every row without collapsing them, so the distance can be computed at row level. RANK rather than ROW_NUMBER is deliberate: two employees equidistant above and below the median are genuinely tied and both should be returned.',
      dialect: 'PERCENTILE_CONT as a window function is PostgreSQL / Oracle / Snowflake. MySQL 8 and SQL Server: compute the median in a separate grouped CTE and join it back.',
    },
  ],
};
