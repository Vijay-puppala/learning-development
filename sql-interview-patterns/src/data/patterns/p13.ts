import type { Pattern } from '../types';

export const p13: Pattern = {
  num: 13,
  slug: 'nth-highest-salary',
  title: 'Nth Highest Salary',
  concept: 'DENSE_RANK()',
  category: 'Ranking & Top-N',
  tagline: 'The most-asked SQL question of all time. Everything hinges on how you treat duplicates.',
  theory: `"Find the 2nd highest salary" is a trick question wearing plain clothes. If two people both earn the top salary, is the 2nd highest the salary they share (there is only one distinct value above it — none), or the next distinct value down, or the salary of the second person in a sorted list? Different readings give different answers, and an interviewer is watching to see whether you ask.

The almost-always-intended reading is *the Nth distinct salary value*, and DENSE_RANK() delivers exactly that: it numbers distinct values with no gaps, so dense_rank = N is the Nth distinct salary and every person on it.

Know the alternatives and their failure modes. OFFSET on a DISTINCT list works and is often the clearest. A correlated subquery counting greater salaries is the pre-window classic. MAX of a filtered set solves N = 2 elegantly and generalises badly. LIMIT 1 OFFSET N-1 on a non-distinct list is the answer that quietly fails on duplicates — which is exactly why the question is asked.

Finally, decide what happens when N exceeds the number of distinct salaries. Returning no rows is honest; the classic textbook phrasing wants a single row containing NULL.`,
  pitfalls: [
    'Using ROW_NUMBER, which returns the Nth *person* and breaks the moment two people share a salary.',
    'Using RANK, where the number N may not exist after a tie, silently returning nothing.',
    'Forgetting to handle N greater than the number of distinct salaries.',
    'Forgetting NULL salaries, which can occupy a rank position depending on the engine.',
    'Answering with LIMIT 1 OFFSET 1 without mentioning the duplicate problem — it is the exact trap the question sets.',
  ],
  questions: [
    {
      id: 'p13-q1',
      difficulty: 'easy',
      prompt: 'Find the 2nd highest salary in the company, treating duplicates as one value.',
      tables: ['employees'],
      think: 'If three people all earn the maximum, what should the 2nd highest be?',
      hint: 'Rank distinct values with DENSE_RANK and filter to 2.',
      approach: `Dense rank employees by salary descending so equal salaries share a number.\nWrap in a CTE so the rank becomes filterable.\nKeep rows at rank 2.\nReturn the distinct salary value.`,
      solution: `WITH levels AS (
    SELECT DISTINCT salary,
           DENSE_RANK() OVER (ORDER BY salary DESC) AS lvl
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT salary AS second_highest_salary
FROM levels
WHERE lvl = 2;`,
      explanation: 'DISTINCT plus DENSE_RANK gives one row per salary value, so the result is a single number rather than one row per employee on that salary. If there is no second distinct salary the result is empty — say so before being asked.',
    },
    {
      id: 'p13-q2',
      difficulty: 'easy',
      prompt: 'Solve the same problem without any window function, using OFFSET.',
      tables: ['employees'],
      think: 'OFFSET skips rows. What must be true of the list before skipping one row means skipping one salary?',
      hint: 'DISTINCT first, so the list is one row per salary value.',
      approach: `Select the distinct salary values.\nSort them descending.\nSkip the first one.\nTake the next one.`,
      solution: `SELECT DISTINCT salary AS second_highest_salary
FROM employees
WHERE salary IS NOT NULL
ORDER BY salary DESC
LIMIT 1 OFFSET 1;`,
      explanation: 'DISTINCT is what makes this correct — without it, OFFSET 1 skips a *person* and returns the top salary again when two people share it. This is the shortest correct answer and a fine one to give, provided you say the word "distinct" out loud.',
      dialect: 'SQL Server / Oracle: ORDER BY salary DESC OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY.',
    },
    {
      id: 'p13-q3',
      difficulty: 'medium',
      prompt: 'Return the 2nd highest salary, or NULL if fewer than two distinct salaries exist.',
      tables: ['employees'],
      think: 'An empty result set and a row containing NULL are different things. Which does the question ask for, and how do you produce the second?',
      hint: 'Wrap the query in a scalar subquery — no matching row makes a scalar subquery evaluate to NULL.',
      approach: `Write the distinct-and-offset query as an inner scalar subquery.\nSelect it in an outer query with no FROM clause.\nA scalar subquery with no rows evaluates to NULL rather than producing no output.\nThe outer query therefore always returns exactly one row.`,
      solution: `SELECT (
    SELECT DISTINCT salary
    FROM employees
    WHERE salary IS NOT NULL
    ORDER BY salary DESC
    LIMIT 1 OFFSET 1
) AS second_highest_salary;`,
      explanation: 'This is the exact shape the classic LeetCode phrasing expects. The scalar-subquery wrapper is a general technique: it converts "zero or one rows" into "always one row, possibly NULL", which is what report consumers usually need.',
    },
    {
      id: 'p13-q4',
      difficulty: 'medium',
      prompt: 'Find the Nth highest salary with N as a parameter, using DENSE_RANK.',
      tables: ['employees'],
      think: 'What changes between "2nd highest" and "Nth highest" — the structure, or one literal?',
      hint: 'Replace the constant 2 with a bind parameter.',
      approach: `Dense rank the distinct salaries descending.\nFilter on the rank equalling the supplied parameter.\nReturn the salary.\nWrap in a scalar subquery if a NULL row is required for out-of-range N.`,
      solution: `WITH levels AS (
    SELECT DISTINCT salary,
           DENSE_RANK() OVER (ORDER BY salary DESC) AS lvl
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT :n AS n,
       (SELECT salary FROM levels WHERE lvl = :n) AS nth_highest_salary;`,
      explanation: 'Parameterising the rank rather than the OFFSET keeps the duplicate handling correct for every N without further thought. Echoing the parameter in the output makes the result self-describing, which matters when it lands in a report.',
      dialect: 'Bind syntax varies: :n, ?, or @n. On MySQL 5.7 (no window functions) use LIMIT 1 OFFSET (n-1) on a DISTINCT list instead.',
    },
    {
      id: 'p13-q5',
      difficulty: 'medium',
      prompt: 'Solve the 2nd-highest problem with a correlated subquery, the pre-window-function classic.',
      tables: ['employees'],
      think: 'A salary is the Nth highest when exactly N−1 distinct salaries are greater than it. Can you express that as a count?',
      hint: 'For each candidate salary, count the distinct salaries strictly above it and keep the one where that count is 1.',
      approach: `Take each distinct salary as a candidate.\nFor each candidate, count how many distinct salaries are strictly greater.\nKeep the candidate where that count equals N minus 1.\nReturn that salary.`,
      solution: `SELECT DISTINCT e1.salary AS second_highest_salary
FROM employees AS e1
WHERE e1.salary IS NOT NULL
  AND (
      SELECT COUNT(DISTINCT e2.salary)
      FROM employees AS e2
      WHERE e2.salary > e1.salary
  ) = 1;`,
      explanation: 'This is the definition of "Nth highest" written directly as SQL, and it is worth knowing for legacy engines with no window functions. It is also O(n²) without an index on salary, so present it as the fallback and DENSE_RANK as the answer you would ship.',
    },
    {
      id: 'p13-q6',
      difficulty: 'medium',
      prompt: 'Find the 3rd highest salary in each department.',
      tables: ['employees', 'departments'],
      think: 'Adding a partition makes it per-group. Does the duplicate handling change?',
      hint: 'PARTITION BY dept_id in the DENSE_RANK, then filter to 3.',
      approach: `Dense rank salaries descending within each department.\nDeduplicate to one row per department and salary level.\nKeep level 3.\nJoin to departments for the name, and note that small departments simply do not appear.`,
      solution: `WITH levels AS (
    SELECT DISTINCT
           dept_id,
           salary,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS lvl
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT d.dept_name,
       l.salary AS third_highest_salary
FROM levels      AS l
JOIN departments AS d ON d.dept_id = l.dept_id
WHERE l.lvl = 3
ORDER BY d.dept_name;`,
      explanation: 'Departments with fewer than three distinct salaries are absent from the result. If they should appear with NULL, start the query from departments and LEFT JOIN the levels — a good clarifying question to raise unprompted.',
    },
    {
      id: 'p13-q7',
      difficulty: 'hard',
      prompt: 'Return the top 5 distinct salaries as separate rows, each with the list of employees earning it.',
      tables: ['employees'],
      think: 'The grain is a salary, but each row must carry a set of names. What collapses many rows into one text value?',
      hint: 'Dense rank to get salary levels, then aggregate names per level with a string aggregate.',
      approach: `Dense rank employees by salary descending.\nKeep levels 1 to 5.\nGroup by the level and the salary.\nAggregate the employee names into one ordered list per group, and count them.`,
      solution: `WITH levels AS (
    SELECT emp_name, salary,
           DENSE_RANK() OVER (ORDER BY salary DESC) AS lvl
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT lvl AS salary_rank,
       salary,
       COUNT(*) AS employees_at_level,
       STRING_AGG(emp_name, ', ' ORDER BY emp_name) AS who
FROM levels
WHERE lvl <= 5
GROUP BY lvl, salary
ORDER BY lvl;`,
      explanation: 'Window first, aggregate second: the dense rank has to exist before rows can be grouped by it. This output shape — one row per salary band with its members listed — is what a compensation review actually wants, rather than a flat list of people.',
      dialect: 'STRING_AGG is PostgreSQL / SQL Server 2017+. MySQL: GROUP_CONCAT(emp_name ORDER BY emp_name SEPARATOR \', \'). Oracle: LISTAGG.',
    },
    {
      id: 'p13-q8',
      difficulty: 'hard',
      prompt: 'Compare all three readings of "2nd highest salary" in one result: the 2nd distinct value, the 2nd ranked position, and the 2nd person in a sorted list.',
      tables: ['employees'],
      think: 'Three functions, three answers. On which data do all three agree, and on which do they diverge?',
      hint: 'Compute DENSE_RANK, RANK and ROW_NUMBER over the same ordering and pick the value at 2 from each.',
      approach: `Compute all three ranking functions over an identical salary-descending ordering.\nPick the salary where each function equals 2, using conditional aggregation.\nReturn the three answers side by side.\nCompare them on data with a tie at the top.`,
      solution: `WITH ranked AS (
    SELECT salary,
           DENSE_RANK() OVER (ORDER BY salary DESC) AS dr,
           RANK()       OVER (ORDER BY salary DESC) AS rk,
           ROW_NUMBER() OVER (ORDER BY salary DESC, emp_id) AS rn
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT MAX(CASE WHEN dr = 2 THEN salary END) AS by_dense_rank,
       MAX(CASE WHEN rk = 2 THEN salary END) AS by_rank,
       MAX(CASE WHEN rn = 2 THEN salary END) AS by_row_number
FROM ranked;`,
      explanation: 'With salaries 100, 100, 90 the three columns return 90, NULL and 100 respectively — three different answers to the same English sentence. Producing this comparison unprompted is the strongest possible response to "find the 2nd highest salary".',
    },
    {
      id: 'p13-q9',
      difficulty: 'hard',
      prompt: 'For each department, return the gap between the highest and the 2nd highest salary, and flag departments where they are equal.',
      tables: ['employees'],
      think: 'Two levels of the same partition must end up on one row. Which technique pivots rank levels into columns?',
      hint: 'Dense rank, then conditional aggregation over levels 1 and 2.',
      approach: `Dense rank salaries descending within each department.\nKeep the first two levels.\nGroup by department and pivot the two levels into two columns with conditional aggregation.\nSubtract, and flag the case where the second level does not exist.`,
      solution: `WITH levels AS (
    SELECT DISTINCT dept_id, salary,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS lvl
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id,
       MAX(CASE WHEN lvl = 1 THEN salary END) AS top_salary,
       MAX(CASE WHEN lvl = 2 THEN salary END) AS second_salary,
       MAX(CASE WHEN lvl = 1 THEN salary END)
     - MAX(CASE WHEN lvl = 2 THEN salary END) AS gap,
       CASE WHEN MAX(CASE WHEN lvl = 2 THEN salary END) IS NULL
            THEN 'only one salary level' END AS note
FROM levels
WHERE lvl <= 2
GROUP BY dept_id
ORDER BY gap DESC NULLS LAST;`,
      explanation: 'MAX(CASE WHEN ...) is the portable pivot: each CASE is NULL except on the row you want, and MAX picks the one non-NULL. A department with a single distinct salary yields NULL for second_salary and therefore NULL for the gap — which the note column explains rather than hides.',
      dialect: 'NULLS LAST is PostgreSQL / Oracle. MySQL: ORDER BY gap IS NULL, gap DESC. SQL Server: ORDER BY CASE WHEN gap IS NULL THEN 1 ELSE 0 END, gap DESC.',
    },
    {
      id: 'p13-q10',
      difficulty: 'hard',
      prompt: 'Return the Nth highest order amount per customer, where N varies by customer: use 2 for customers with 5 or more orders and 1 for everyone else.',
      tables: ['orders'],
      think: 'The target rank is itself computed per group. Can the filter compare a rank column to another column?',
      hint: 'Compute the per-customer order count as a window, derive the target N from it, and compare the dense rank to that column.',
      approach: `Partition by customer and count the orders with a window, so the count sits on every row.\nDense rank the amounts descending within the customer.\nDerive the target rank from the count with a CASE expression.\nKeep rows where the dense rank equals that target.`,
      solution: `WITH scored AS (
    SELECT customer_id,
           order_id,
           order_date,
           amount,
           COUNT(*)     OVER (PARTITION BY customer_id) AS order_count,
           DENSE_RANK() OVER (PARTITION BY customer_id
                              ORDER BY amount DESC)     AS amount_level
    FROM orders
)
SELECT customer_id,
       order_count,
       CASE WHEN order_count >= 5 THEN 2 ELSE 1 END AS target_level,
       amount_level,
       order_date,
       amount
FROM scored
WHERE amount_level = CASE WHEN order_count >= 5 THEN 2 ELSE 1 END
ORDER BY customer_id, amount DESC;`,
      explanation: 'Comparing a window result to another window-derived expression in the outer WHERE is perfectly legal once both are materialised in the CTE — the rank does not have to be compared to a constant. Several orders tied at the target amount all come back, which DENSE_RANK makes deliberate rather than accidental.',
    },
  ],
};
