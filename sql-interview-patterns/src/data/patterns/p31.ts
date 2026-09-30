import type { Pattern } from '../types';

export const p31: Pattern = {
  num: 31,
  slug: 'top-salary-per-department',
  title: 'Top Salary Per Department',
  concept: 'DENSE_RANK()',
  category: 'Ranking & Top-N',
  tagline: 'The classic per-group top-N, where the whole question is how you handle a tie for first place.',
  theory: `"Highest-paid employee per department" is the most-asked per-group ranking question, and the interviewer is almost always probing one thing: what happens when two people tie for the top?

The three functions give three defensible answers. **ROW_NUMBER** returns exactly one employee per department, picking arbitrarily among ties unless you add a tiebreaker. **RANK** returns everyone at the top salary, and if you extend it to <= 3 the numbering skips after each tie. **DENSE_RANK** returns everyone at each of the top N *distinct* salaries.

For "the top salary in each department", DENSE_RANK and RANK behave identically at rank 1 — they diverge only from rank 2 onwards. For "the top 3 salaries", they differ substantially, and DENSE_RANK is usually what a compensation question means.

The other half of the pattern is departments with nobody in them, or with everyone on a NULL salary. A window only sees rows that exist, so an empty department never appears. If the report must list every department, rank first and then LEFT JOIN from the departments table — with the rank predicate in the ON clause.`,
  pitfalls: [
    'Using ROW_NUMBER when the requirement says "everyone who earns the top salary".',
    'Adding a unique tiebreaker to a RANK or DENSE_RANK window, which destroys the ties you meant to keep.',
    'Losing empty departments because the window has no rows to produce.',
    'Putting the rank filter in WHERE after a LEFT JOIN, converting it to an inner join.',
    'Letting NULL salaries occupy rank 1 on engines that sort NULLs first in a descending order.',
  ],
  questions: [
    {
      id: 'p31-q1',
      difficulty: 'easy',
      prompt: 'Return everyone who earns the highest salary in their department.',
      tables: ['employees'],
      think: 'If two people tie for the top, should both appear? Which function guarantees that?',
      hint: 'DENSE_RANK (or RANK — they agree at rank 1) with no tiebreaker in the window.',
      approach: `Partition by department and order by salary descending.\nApply DENSE_RANK so tied salaries share rank 1.\nExclude NULL salaries so they cannot occupy the top.\nKeep rank 1 and return everyone at it.`,
      solution: `WITH ranked AS (
    SELECT emp_id, emp_name, dept_id, salary,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS lvl
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id, emp_id, emp_name, salary
FROM ranked
WHERE lvl = 1
ORDER BY dept_id, emp_name;`,
      explanation: 'Leaving emp_id out of the window ORDER BY is deliberate — adding it would make every salary distinct and silently turn DENSE_RANK into ROW_NUMBER, returning one arbitrary winner. The WHERE on NULL salaries runs before the window, so it cannot distort the ranking.',
    },
    {
      id: 'p31-q2',
      difficulty: 'easy',
      prompt: 'Return exactly one top earner per department, even when there is a tie.',
      tables: ['employees'],
      think: 'What decides the winner when the salaries are equal, and can that decision be defended?',
      hint: 'ROW_NUMBER with an explicit, documented tiebreaker.',
      approach: `Partition by department and order by salary descending.\nAdd a deliberate tiebreaker — longest tenure, then employee id.\nApply ROW_NUMBER so exactly one row per department is numbered 1.\nKeep that row.`,
      solution: `WITH ranked AS (
    SELECT emp_id, emp_name, dept_id, salary, hire_date,
           ROW_NUMBER() OVER (PARTITION BY dept_id
                              ORDER BY salary DESC, hire_date, emp_id) AS rn
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id, emp_id, emp_name, salary, hire_date
FROM ranked
WHERE rn = 1
ORDER BY dept_id;`,
      explanation: 'Choosing hire_date as the tiebreaker makes the rule explainable — "the longest-serving of the top earners" — rather than "whichever row the engine happened to pick". When a question forces one row from a tie, saying which rule you applied is worth more than the query itself.',
    },
    {
      id: 'p31-q3',
      difficulty: 'medium',
      prompt: 'Return the top earner in every department, including departments with no employees.',
      tables: ['departments', 'employees'],
      think: 'The window cannot produce a row for a department with no staff. What supplies it?',
      hint: 'Rank first, then LEFT JOIN from departments with the rank predicate in ON.',
      approach: `Rank employees by salary descending within each department.\nLEFT JOIN from departments onto that ranked set.\nPut the rank filter in the ON clause so empty departments survive.\nLabel the empty ones explicitly.`,
      solution: `WITH ranked AS (
    SELECT emp_id, emp_name, dept_id, salary,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS lvl
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT d.dept_id,
       d.dept_name,
       r.emp_name AS top_earner,
       r.salary,
       CASE WHEN r.emp_id IS NULL THEN 'no staff with a salary' END AS note
FROM departments AS d
LEFT JOIN ranked AS r
       ON r.dept_id = d.dept_id
      AND r.lvl = 1
ORDER BY d.dept_name, r.emp_name;`,
      explanation: 'r.lvl = 1 belongs in ON, not WHERE: in WHERE it is false for the NULL-extended rows and the empty departments vanish, converting the LEFT JOIN to an inner join. Note that a department where everyone has a NULL salary also appears with the note, because the pre-window filter removed all its rows.',
    },
    {
      id: 'p31-q4',
      difficulty: 'medium',
      prompt: 'Return the top 3 distinct salary levels per department with everyone at each level.',
      tables: ['employees'],
      think: '"Top 3 salaries" and "top 3 employees" are different questions. Which function answers the first?',
      hint: 'DENSE_RANK <= 3 counts distinct salary values.',
      approach: `Dense rank salaries descending within each department.\nKeep levels 1 through 3.\nReturn every employee at those levels.\nShow how many people share each level.`,
      solution: `WITH ranked AS (
    SELECT emp_id, emp_name, dept_id, salary,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS lvl,
           COUNT(*)     OVER (PARTITION BY dept_id, salary)             AS people_at_level
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id, lvl, salary, people_at_level, emp_name
FROM ranked
WHERE lvl <= 3
ORDER BY dept_id, lvl, emp_name;`,
      explanation: 'A department with five people on three distinct salaries returns all five rows across levels 1 to 3 — that is the correct reading of "the top 3 salary levels". The people_at_level column makes the tie structure visible, which is exactly what a compensation review wants to see.',
    },
    {
      id: 'p31-q5',
      difficulty: 'medium',
      prompt: 'Return the top earner per department alongside the department average, and the multiple between them.',
      tables: ['employees'],
      think: 'A ranking and a group aggregate over the same partition. Do they need the same window definition?',
      hint: 'No — the average needs no ORDER BY, which makes its frame the whole partition.',
      approach: `Partition by department for both windows.\nRank by salary descending for the top earner.\nCompute the average with a partition-only window and no ORDER BY.\nKeep rank 1 and divide.`,
      solution: `WITH stats AS (
    SELECT emp_id, emp_name, dept_id, salary,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS lvl,
           AVG(salary)  OVER (PARTITION BY dept_id)                      AS dept_avg,
           COUNT(*)     OVER (PARTITION BY dept_id)                      AS headcount
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id,
       emp_name AS top_earner,
       salary,
       ROUND(dept_avg, 2) AS dept_avg,
       headcount,
       ROUND(salary / NULLIF(dept_avg, 0), 2) AS multiple_of_avg
FROM stats
WHERE lvl = 1
ORDER BY multiple_of_avg DESC;`,
      explanation: 'An aggregate window with no ORDER BY spans the whole partition, which is how the average is computed over every employee rather than only those up to the current row. The average is calculated before the lvl = 1 filter, so it reflects the real department, not just its top earner.',
    },
    {
      id: 'p31-q6',
      difficulty: 'medium',
      prompt: 'Find departments where the top earner is also the longest-serving employee.',
      tables: ['employees'],
      think: 'Two independent rankings over the same partition. How do you test whether they pick the same person?',
      hint: 'Rank by salary and by hire_date in the same pass, then keep rows that are rank 1 in both.',
      approach: `Partition by department.\nRank by salary descending for the pay ranking.\nRank by hire_date ascending for the tenure ranking.\nKeep employees who are rank 1 under both.`,
      solution: `WITH ranked AS (
    SELECT emp_id, emp_name, dept_id, salary, hire_date,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS pay_rank,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY hire_date)   AS tenure_rank
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id, emp_name, salary, hire_date
FROM ranked
WHERE pay_rank = 1
  AND tenure_rank = 1
ORDER BY dept_id;`,
      explanation: 'Two windows over the same partition with different orderings cost one sort each and answer a question neither could alone. Using DENSE_RANK for both means a genuine tie on either dimension still qualifies, which is the right reading of "is also".',
    },
    {
      id: 'p31-q7',
      difficulty: 'hard',
      prompt: 'Return the top earner per department and the pay gap to the second-highest distinct salary.',
      tables: ['employees'],
      think: 'Two rank levels must meet on one row. What brings level 2 onto the level-1 row?',
      hint: 'Pivot the levels with conditional aggregation, or LEAD across the distinct salary levels.',
      approach: `Reduce to the distinct salary levels per department with DENSE_RANK.\nKeep levels 1 and 2.\nGroup by department and pivot the two levels into columns.\nSubtract to get the gap, handling departments with only one level.`,
      solution: `WITH levels AS (
    SELECT DISTINCT dept_id, salary,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS lvl
    FROM employees
    WHERE salary IS NOT NULL
),
pivoted AS (
    SELECT dept_id,
           MAX(CASE WHEN lvl = 1 THEN salary END) AS top_salary,
           MAX(CASE WHEN lvl = 2 THEN salary END) AS second_salary
    FROM levels
    WHERE lvl <= 2
    GROUP BY dept_id
)
SELECT p.dept_id,
       STRING_AGG(e.emp_name, ', ' ORDER BY e.emp_name) AS top_earners,
       p.top_salary,
       p.second_salary,
       p.top_salary - p.second_salary AS gap,
       ROUND(100.0 * (p.top_salary - p.second_salary)
             / NULLIF(p.second_salary, 0), 1) AS gap_pct
FROM pivoted     AS p
JOIN employees   AS e ON e.dept_id = p.dept_id AND e.salary = p.top_salary
GROUP BY p.dept_id, p.top_salary, p.second_salary
ORDER BY gap DESC NULLS LAST;`,
      explanation: 'The DISTINCT in the levels CTE is what makes the pivot one row per level rather than one per employee, so MAX picks a single salary. A department with one distinct salary yields NULL for second_salary and therefore a NULL gap, which is honest — there is no second level to compare against.',
    },
    {
      id: 'p31-q8',
      difficulty: 'hard',
      prompt: 'Return the top earner per department per hire year, so you can see how top pay has moved over time.',
      tables: ['employees'],
      think: 'A three-part partition. Does the ranking logic change, or only the grouping?',
      hint: 'Only the PARTITION BY list — but check whether "per year" means hire year or something else.',
      approach: `Derive the hire year from hire_date.\nPartition by department and that year.\nRank by salary descending within each combination.\nKeep rank 1 and order chronologically per department.`,
      solution: `WITH ranked AS (
    SELECT emp_id, emp_name, dept_id, salary,
           EXTRACT(YEAR FROM hire_date) AS hire_year,
           DENSE_RANK() OVER (PARTITION BY dept_id, EXTRACT(YEAR FROM hire_date)
                              ORDER BY salary DESC) AS lvl
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id,
       hire_year,
       emp_name,
       salary,
       salary - LAG(salary) OVER (PARTITION BY dept_id ORDER BY hire_year) AS vs_prior_year
FROM ranked
WHERE lvl = 1
ORDER BY dept_id, hire_year;`,
      explanation: 'The LAG in the outer query runs over the already-filtered rank-1 rows, so it compares each year\'s top hire against the previous year\'s — a window applied to the output of an earlier window is perfectly legal once the first is materialised. A tie in a given year produces two rows, which would double-count in the LAG; add a ROW_NUMBER tiebreaker if that matters.',
    },
    {
      id: 'p31-q9',
      difficulty: 'hard',
      prompt: 'Find departments where the top earner earns more than twice the department median.',
      tables: ['employees'],
      think: 'The median is not a rank. How do you attach it to every row without collapsing them?',
      hint: 'PERCENTILE_CONT used as a window function, partitioned by department.',
      approach: `Attach the department median salary to every employee with a percentile window.\nRank employees by salary descending within the department.\nKeep rank 1.\nCompare the top salary against twice the median.`,
      solution: `WITH stats AS (
    SELECT emp_id, emp_name, dept_id, salary,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS lvl,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary)
             OVER (PARTITION BY dept_id) AS median_salary,
           COUNT(*) OVER (PARTITION BY dept_id) AS headcount
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id,
       emp_name AS top_earner,
       salary,
       ROUND(median_salary, 2) AS median_salary,
       headcount,
       ROUND(salary / NULLIF(median_salary, 0), 2) AS ratio
FROM stats
WHERE lvl = 1
  AND headcount >= 4
  AND salary > 2 * median_salary
ORDER BY ratio DESC;`,
      explanation: 'The median rather than the mean is the right comparator here, because one very high salary drags the mean towards itself and hides the very skew you are looking for. The headcount guard matters too — on a team of two the top earner is always above the median by construction.',
      dialect: 'PERCENTILE_CONT as a window function is PostgreSQL / Oracle / Snowflake. MySQL 8 and SQL Server: compute the median in a grouped CTE and join it back.',
    },
    {
      id: 'p31-q10',
      difficulty: 'hard',
      prompt: 'Produce one row per department showing the top earner, the bottom earner, the median and the pay ratio between top and bottom.',
      tables: ['employees'],
      think: 'Four facts per department, two of which are named rows rather than values. What fetches a name from an extreme row?',
      hint: 'FIRST_VALUE and LAST_VALUE with an explicit full-partition frame, or two conditional pivots on a rank.',
      approach: `Partition by department and order by salary descending.\nRank ascending and descending so both extremes can be identified.\nAttach the median with a percentile window.\nCollapse to one row per department with conditional aggregation and compute the ratio.`,
      solution: `WITH ranked AS (
    SELECT emp_name, dept_id, salary,
           ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC, emp_id) AS rn_high,
           ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary,      emp_id) AS rn_low,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary)
             OVER (PARTITION BY dept_id) AS median_salary,
           COUNT(*) OVER (PARTITION BY dept_id) AS headcount
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id,
       headcount,
       MAX(CASE WHEN rn_high = 1 THEN emp_name END) AS top_earner,
       MAX(CASE WHEN rn_high = 1 THEN salary   END) AS top_salary,
       MAX(CASE WHEN rn_low  = 1 THEN emp_name END) AS bottom_earner,
       MAX(CASE WHEN rn_low  = 1 THEN salary   END) AS bottom_salary,
       ROUND(MAX(median_salary), 2)                 AS median_salary,
       ROUND(MAX(CASE WHEN rn_high = 1 THEN salary END)
             / NULLIF(MAX(CASE WHEN rn_low = 1 THEN salary END), 0), 2) AS pay_ratio
FROM ranked
WHERE rn_high = 1 OR rn_low = 1
GROUP BY dept_id, headcount
ORDER BY pay_ratio DESC;`,
      explanation: 'Numbering in both directions and keeping the rows that are first in either gives at most two rows per department, which conditional aggregation then collapses into one. In a department of one employee that single row is number 1 in both directions, so top and bottom are the same person and the ratio is 1 — correct, and worth pointing out.',
    },
  ],
};
