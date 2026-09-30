import type { Pattern } from '../types';

export const p23: Pattern = {
  num: 23,
  slug: 'employee-hierarchy',
  title: 'Employee Hierarchy',
  concept: 'SELF JOIN',
  category: 'Data Quality & Modeling',
  tagline: 'One table, two roles. A self join reads a hierarchy one level at a time.',
  theory: `A self join joins a table to itself under two aliases, so the same rows can play two roles — here, employee and manager. The join condition e.manager_id = m.emp_id is the edge in the org graph.

Aliases are not optional cosmetics: without them the engine cannot tell which "emp_name" you mean, and with them the query reads like the sentence it represents.

The critical modelling fact is that a self join reaches **exactly one level**. Joining twice reaches two levels, three times reaches three. To walk an arbitrary depth you need a recursive CTE (pattern 43). Knowing where the self join stops being the right tool is as important as knowing how to write it.

Two NULL traps. The root of the hierarchy has manager_id NULL, so an inner self join silently drops the CEO — use a LEFT JOIN when the root must appear. And employees with a manager_id pointing at a deleted row vanish the same way, which is a data-quality bug rather than an intentional exclusion; the anti-join in pattern 16 is how you find them.`,
  pitfalls: [
    'Inner self join dropping the root row, because its manager_id is NULL.',
    'Forgetting aliases, or reusing the same alias, making the query ambiguous or wrong.',
    'Assuming one self join reaches the whole hierarchy — it reaches exactly one level.',
    'Self-joining without an inequality when producing pairs, yielding self-matches and duplicates.',
    'Ignoring cycles: a corrupted manager chain can loop, which a recursive walk must guard against.',
  ],
  questions: [
    {
      id: 'p23-q1',
      difficulty: 'easy',
      prompt: 'List each employee with their manager\'s name.',
      tables: ['employees'],
      think: 'Which alias holds the employee and which holds the manager — and which column of each does the join use?',
      hint: 'e.manager_id = m.emp_id. The manager alias is matched on its own primary key.',
      approach: `Alias the table twice, once as the employee and once as the manager.\nJoin the employee's manager_id to the manager's emp_id.\nUse a LEFT JOIN so the root employee survives.\nReturn both names.`,
      solution: `SELECT e.emp_id,
       e.emp_name  AS employee,
       m.emp_name  AS manager
FROM employees AS e
LEFT JOIN employees AS m ON m.emp_id = e.manager_id
ORDER BY m.emp_name NULLS FIRST, e.emp_name;`,
      explanation: 'The LEFT JOIN is what keeps the CEO in the result with a NULL manager — an inner join would silently drop the top of the org chart, which is the most common bug in this query. Sorting NULLs first puts the root at the top where it belongs.',
    },
    {
      id: 'p23-q2',
      difficulty: 'easy',
      prompt: 'Find employees who earn more than their manager.',
      tables: ['employees'],
      think: 'The comparison is between two rows of the same table. What makes both salaries visible in one row?',
      hint: 'Self join, then compare e.salary against m.salary.',
      approach: `Self join employees to itself on the manager relationship.\nUse an inner join, since an employee with no manager cannot be compared.\nCompare the two salaries.\nReturn the gap.`,
      solution: `SELECT e.emp_name   AS employee,
       e.salary     AS employee_salary,
       m.emp_name   AS manager,
       m.salary     AS manager_salary,
       e.salary - m.salary AS excess
FROM employees AS e
JOIN employees AS m ON m.emp_id = e.manager_id
WHERE e.salary > m.salary
ORDER BY excess DESC;`,
      explanation: 'Here an inner join is correct rather than a mistake: an employee with no manager has nothing to compare against, so excluding them is the intended behaviour. Knowing when the root *should* drop out is the other half of the LEFT JOIN lesson.',
    },
    {
      id: 'p23-q3',
      difficulty: 'medium',
      prompt: 'List each employee with their manager and their manager\'s manager.',
      tables: ['employees'],
      think: 'How many levels does one self join reach, and therefore how many joins do you need?',
      hint: 'Two joins for two levels; chain the second onto the first alias.',
      approach: `Join employees to itself to reach the manager.\nJoin again from the manager alias to reach the skip-level manager.\nUse LEFT JOINs throughout so employees near the top still appear.\nReturn all three names.`,
      solution: `SELECT e.emp_name  AS employee,
       m.emp_name  AS manager,
       mm.emp_name AS skip_level_manager
FROM employees AS e
LEFT JOIN employees AS m  ON m.emp_id  = e.manager_id
LEFT JOIN employees AS mm ON mm.emp_id = m.manager_id
ORDER BY mm.emp_name NULLS FIRST, m.emp_name NULLS FIRST, e.emp_name;`,
      explanation: 'Each additional level costs one more join, which is why a self join is the wrong tool for an org chart of unknown depth — you would need a join per level and the query would break the day someone adds a tier. That limitation is what the recursive CTE in pattern 43 removes.',
    },
    {
      id: 'p23-q4',
      difficulty: 'medium',
      prompt: 'Count how many direct reports each manager has, including managers with none.',
      tables: ['employees'],
      think: 'Which side of the join is the manager, and what must the count be careful about?',
      hint: 'LEFT JOIN from the manager alias to the report alias, and count the report key rather than rows.',
      approach: `Treat one alias as the manager and LEFT JOIN the other alias as their reports.\nGroup by the manager.\nCount the reports' emp_id, so a manager with none scores zero.\nOrder by the count descending.`,
      solution: `SELECT m.emp_id,
       m.emp_name AS manager,
       COUNT(e.emp_id) AS direct_reports
FROM employees AS m
LEFT JOIN employees AS e ON e.manager_id = m.emp_id
GROUP BY m.emp_id, m.emp_name
ORDER BY direct_reports DESC, m.emp_name;`,
      explanation: 'COUNT(e.emp_id) rather than COUNT(*) is what makes "no reports" come out as 0 instead of 1 — the NULL-extended row still counts as a row. This query lists every employee, since anyone with zero reports is simply not a manager; add HAVING COUNT(e.emp_id) > 0 to restrict it.',
    },
    {
      id: 'p23-q5',
      difficulty: 'medium',
      prompt: 'Find employees who have no direct reports — the individual contributors.',
      tables: ['employees'],
      think: 'This is an anti-join against the same table. What is the correlation condition?',
      hint: 'No row exists whose manager_id equals this employee\'s emp_id.',
      approach: `Select every employee.\nTest whether any other employee names them as manager.\nKeep those where none does.\nReturn the employee with their own manager for context.`,
      solution: `SELECT e.emp_id,
       e.emp_name,
       e.dept_id,
       m.emp_name AS reports_to
FROM employees AS e
LEFT JOIN employees AS m ON m.emp_id = e.manager_id
WHERE NOT EXISTS (
    SELECT 1
    FROM employees AS r
    WHERE r.manager_id = e.emp_id
)
ORDER BY e.dept_id, e.emp_name;`,
      explanation: 'Leaf detection in a hierarchy is just an anti-join with the parent and child roles swapped. Combining it with a LEFT JOIN for the employee\'s own manager gives a single result that is both a leaf list and a reporting line.',
    },
    {
      id: 'p23-q6',
      difficulty: 'medium',
      prompt: 'Find managers whose entire team earns less than they do.',
      tables: ['employees'],
      think: '"All reports earn less" is a universal statement. What is the equivalent existence test?',
      hint: 'Has at least one report, and no report earns at least as much.',
      approach: `Select the managers, meaning employees who have at least one report.\nRequire that no report earns greater than or equal to the manager's salary.\nReturn the manager with their team size and the highest team salary.\nOrder by team size.`,
      solution: `SELECT m.emp_id,
       m.emp_name AS manager,
       m.salary   AS manager_salary,
       (SELECT COUNT(*) FROM employees AS r WHERE r.manager_id = m.emp_id)   AS team_size,
       (SELECT MAX(r.salary) FROM employees AS r WHERE r.manager_id = m.emp_id) AS top_report_salary
FROM employees AS m
WHERE EXISTS (SELECT 1 FROM employees AS r WHERE r.manager_id = m.emp_id)
  AND NOT EXISTS (
        SELECT 1 FROM employees AS r
        WHERE r.manager_id = m.emp_id
          AND r.salary >= m.salary
      )
ORDER BY team_size DESC;`,
      explanation: 'Universal quantification becomes "exists at least one AND not exists a counterexample" — the same double-negation pattern as in pattern 18. The MAX subquery in the select list lets the reader verify the claim at a glance.',
    },
    {
      id: 'p23-q7',
      difficulty: 'hard',
      prompt: 'Build a full reporting path string for each employee, up to three levels, like "CEO > VP > Manager > Employee".',
      tables: ['employees'],
      think: 'The path length varies per employee. How do you build a string that skips absent levels cleanly?',
      hint: 'Chain LEFT JOINs, then concatenate the non-NULL names with a separator-aware function.',
      approach: `Chain three LEFT JOINs to reach up to three levels above the employee.\nConcatenate the names from the top down.\nUse a concatenation function that skips NULLs rather than propagating them.\nReturn the path and its depth.`,
      solution: `SELECT e.emp_name AS employee,
       CONCAT_WS(' > ',
                 mmm.emp_name,
                 mm.emp_name,
                 m.emp_name,
                 e.emp_name) AS reporting_path,
       (CASE WHEN m.emp_id   IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN mm.emp_id  IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN mmm.emp_id IS NOT NULL THEN 1 ELSE 0 END) AS levels_above
FROM employees AS e
LEFT JOIN employees AS m   ON m.emp_id   = e.manager_id
LEFT JOIN employees AS mm  ON mm.emp_id  = m.manager_id
LEFT JOIN employees AS mmm ON mmm.emp_id = mm.manager_id
ORDER BY levels_above DESC, reporting_path;`,
      explanation: 'CONCAT_WS skips NULL arguments, so an employee two levels down produces a clean three-part path rather than "  > CEO > VP". Plain CONCAT or the || operator would propagate NULL and blank the whole string, which is the trap here.',
      dialect: 'CONCAT_WS is PostgreSQL / MySQL / SQL Server 2017+. Oracle: use COALESCE on each part and trim the separators, or build the path with a recursive CTE.',
    },
    {
      id: 'p23-q8',
      difficulty: 'hard',
      prompt: 'For each department, find pairs of employees where one manages the other but they sit in different departments.',
      tables: ['employees', 'departments'],
      think: 'A self join plus a comparison between two attributes of the joined rows. What makes the mismatch visible?',
      hint: 'Join on the manager relationship, then compare the two dept_id values with a NULL-safe inequality.',
      approach: `Self join employees on the manager relationship.\nJoin departments twice to get both department names.\nKeep pairs where the two dept_ids differ, using a NULL-safe comparison.\nReturn both sides of the cross-department reporting line.`,
      solution: `SELECT e.emp_name   AS employee,
       de.dept_name AS employee_dept,
       m.emp_name   AS manager,
       dm.dept_name AS manager_dept
FROM employees AS e
JOIN employees AS m ON m.emp_id = e.manager_id
LEFT JOIN departments AS de ON de.dept_id = e.dept_id
LEFT JOIN departments AS dm ON dm.dept_id = m.dept_id
WHERE e.dept_id IS DISTINCT FROM m.dept_id
ORDER BY de.dept_name, e.emp_name;`,
      explanation: 'IS DISTINCT FROM catches the case where one side has a department and the other has NULL, which a plain <> would evaluate to UNKNOWN and silently skip. Cross-department reporting lines are usually either matrix management or a data error, and this query is how you audit them.',
    },
    {
      id: 'p23-q9',
      difficulty: 'hard',
      prompt: 'Find employees whose salary is more than 20% above the average salary of their manager\'s whole team.',
      tables: ['employees'],
      think: 'The comparison baseline is a group aggregate defined by the employee\'s own manager. What computes it without a second scan per row?',
      hint: 'A window partitioned by manager_id gives each row its team average in one pass.',
      approach: `Partition a window by manager_id to compute the team's average salary on every row.\nCount the team size in the same pass so tiny teams can be excluded.\nCompare each salary against 1.2 times that average.\nReturn the employee, the team average and the ratio.`,
      solution: `WITH team_stats AS (
    SELECT emp_id,
           emp_name,
           manager_id,
           salary,
           AVG(salary) OVER (PARTITION BY manager_id) AS team_avg,
           COUNT(*)    OVER (PARTITION BY manager_id) AS team_size
    FROM employees
    WHERE salary IS NOT NULL
      AND manager_id IS NOT NULL
)
SELECT ts.emp_name,
       m.emp_name AS manager,
       ts.salary,
       ROUND(ts.team_avg, 2) AS team_avg,
       ts.team_size,
       ROUND(ts.salary / NULLIF(ts.team_avg, 0), 2) AS ratio
FROM team_stats AS ts
JOIN employees  AS m ON m.emp_id = ts.manager_id
WHERE ts.team_size >= 3
  AND ts.salary > 1.2 * ts.team_avg
ORDER BY ratio DESC;`,
      explanation: 'A window partitioned by manager_id is the cheap way to attach a team aggregate to every member — a correlated subquery would recompute the average once per employee. The team_size >= 3 guard matters because on a team of one the employee *is* the average and the ratio is meaningless.',
    },
    {
      id: 'p23-q10',
      difficulty: 'hard',
      prompt: 'Detect broken hierarchy data: employees who manage themselves, mutual manager pairs, and dangling manager references.',
      tables: ['employees'],
      think: 'Three different corruptions of the same edge. Can one query report all three with a label?',
      hint: 'UNION ALL three targeted checks, each emitting the same columns plus an issue label.',
      approach: `Check for rows where manager_id equals emp_id — a self loop.\nSelf join to find pairs that manage each other, keeping one direction only.\nAnti-join to find manager_ids with no matching employee.\nUnion the three checks with a label column.`,
      solution: `SELECT e.emp_id, e.emp_name, e.manager_id, 'manages self' AS issue
FROM employees AS e
WHERE e.manager_id = e.emp_id

UNION ALL

SELECT a.emp_id, a.emp_name, a.manager_id, 'mutual management cycle'
FROM employees AS a
JOIN employees AS b
  ON  b.emp_id     = a.manager_id
  AND a.emp_id     = b.manager_id
  AND a.emp_id     < b.emp_id

UNION ALL

SELECT e.emp_id, e.emp_name, e.manager_id, 'manager does not exist'
FROM employees AS e
WHERE e.manager_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM employees AS m WHERE m.emp_id = e.manager_id)

ORDER BY issue, emp_id;`,
      explanation: 'Each branch targets one corruption and emits the same column shape, so UNION ALL stacks them into one triage report. The a.emp_id < b.emp_id condition on the mutual check reports each cycle once rather than twice — and any of these three defects will make a recursive CTE loop forever, which is why you run this check before walking the tree.',
    },
  ],
};
