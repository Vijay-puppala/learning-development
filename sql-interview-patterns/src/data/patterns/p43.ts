import type { Pattern } from '../types';

export const p43: Pattern = {
  num: 43,
  slug: 'recursive-hierarchy',
  title: 'Recursive Hierarchy',
  concept: 'RECURSIVE CTE',
  category: 'Data Quality & Modeling',
  tagline: 'Walk a tree of unknown depth. Anchor, recursive term, UNION ALL — and always a depth guard.',
  theory: `A self join reaches exactly one level. When the depth is unknown — an org chart, a bill of materials, a category tree, a thread of replies — you need a recursive CTE.

The structure is always the same three parts. The **anchor** selects the starting rows (the roots, or one specific node). The **recursive term** joins the CTE back to the base table to reach the next level. **UNION ALL** combines them, and the engine repeats the recursive term against the newly produced rows until it produces none.

UNION ALL rather than UNION matters: UNION deduplicates on every iteration, which is slower and can mask a cycle rather than exposing it.

Three things belong in every recursive query you write. A **depth counter**, incremented each iteration, so you can see how deep you went and cap it. A **path array or string**, which both documents the route and lets you detect a cycle by checking whether the next node is already on the path. And a **depth limit** in the recursive term, because a single bad manager_id pointing upwards turns the query into an infinite loop that will take the server with it.

Direction is just a matter of which column you join on: parent-to-child walks down, child-to-parent walks up.`,
  pitfalls: [
    'No depth limit or cycle guard, so corrupted data produces an infinite loop.',
    'UNION instead of UNION ALL, which deduplicates every iteration and hides cycles.',
    'Forgetting the RECURSIVE keyword, which PostgreSQL and MySQL require and SQL Server forbids.',
    'Referencing the recursive CTE more than once in the recursive term, which is not allowed.',
    'Building the path as a string and hitting a separator collision — an array is safer.',
  ],
  questions: [
    {
      id: 'p43-q1',
      difficulty: 'easy',
      prompt: 'Return every employee with their level in the org chart, starting from the CEO at level 1.',
      tables: ['employees'],
      think: 'What identifies the starting rows, and how does each iteration know how deep it is?',
      hint: 'The anchor is the row with no manager; carry a level counter and add one each iteration.',
      approach: `Anchor on employees with no manager, setting level to 1.\nIn the recursive term, join employees whose manager is a row already in the CTE.\nIncrement the level each iteration.\nUNION ALL the two parts.`,
      solution: `WITH RECURSIVE org AS (
    -- anchor: the roots
    SELECT emp_id, emp_name, manager_id, 1 AS level
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- recursive term: one level deeper each iteration
    SELECT e.emp_id, e.emp_name, e.manager_id, o.level + 1
    FROM employees AS e
    JOIN org       AS o ON o.emp_id = e.manager_id
)
SELECT level, emp_id, emp_name, manager_id
FROM org
ORDER BY level, emp_name;`,
      explanation: 'The recursion stops naturally when an iteration produces no rows — that is, when the deepest level has no children. Anyone unreachable from a root, because of a dangling manager_id, simply never appears, which is why the integrity checks in pattern 23 matter before you run this.',
      dialect: 'PostgreSQL, MySQL 8 and SQLite require the RECURSIVE keyword. SQL Server and Oracle omit it — just WITH org AS (...).',
    },
    {
      id: 'p43-q2',
      difficulty: 'easy',
      prompt: 'Return all employees who report, directly or indirectly, to employee 5.',
      tables: ['employees'],
      think: 'What changes about the anchor when the starting point is one specific node rather than the roots?',
      hint: 'Anchor on that node instead of on manager_id IS NULL.',
      approach: `Anchor on the specific employee, at depth 0.\nRecursively join employees whose manager is already in the CTE.\nIncrement the depth.\nExclude the anchor row from the final output if only the subordinates are wanted.`,
      solution: `WITH RECURSIVE subtree AS (
    SELECT emp_id, emp_name, manager_id, 0 AS depth
    FROM employees
    WHERE emp_id = 5

    UNION ALL

    SELECT e.emp_id, e.emp_name, e.manager_id, s.depth + 1
    FROM employees AS e
    JOIN subtree   AS s ON s.emp_id = e.manager_id
)
SELECT depth, emp_id, emp_name
FROM subtree
WHERE depth > 0
ORDER BY depth, emp_name;`,
      explanation: 'Starting the depth at 0 makes it read as "levels below the anchor", so the filter depth > 0 cleanly removes the manager themselves. This subtree query is what answers "how big is this person\'s whole organisation", which a self join cannot.',
    },
    {
      id: 'p43-q3',
      difficulty: 'medium',
      prompt: 'Walk upwards: return the full management chain above a given employee.',
      tables: ['employees'],
      think: 'What changes in the recursive join when you walk up instead of down?',
      hint: 'Join the CTE\'s manager_id to the base table\'s emp_id, the reverse of before.',
      approach: `Anchor on the employee of interest.\nIn the recursive term, join the base table on emp_id = the CTE row's manager_id.\nIncrement a level counter to record how far up you have gone.\nStop naturally when a row has no manager.`,
      solution: `WITH RECURSIVE chain AS (
    SELECT emp_id, emp_name, manager_id, 0 AS levels_up
    FROM employees
    WHERE emp_id = 17

    UNION ALL

    SELECT m.emp_id, m.emp_name, m.manager_id, c.levels_up + 1
    FROM employees AS m
    JOIN chain     AS c ON m.emp_id = c.manager_id
)
SELECT levels_up, emp_id, emp_name
FROM chain
ORDER BY levels_up;`,
      explanation: 'Reversing the join direction is the only change — everything else about the recursion is identical. Walking upward terminates when it reaches a row with a NULL manager_id, because the join then finds nothing.',
    },
    {
      id: 'p43-q4',
      difficulty: 'medium',
      prompt: 'Build a readable path string for each employee, like "CEO > VP Sales > Regional Manager".',
      tables: ['employees'],
      think: 'The path grows with the recursion. Where is it accumulated?',
      hint: 'Concatenate onto the parent\'s path inside the recursive term.',
      approach: `Anchor with the root's name as the initial path.\nIn the recursive term, append the current name to the parent's path.\nCarry the level alongside.\nOrder by the path so the output reads as a tree.`,
      solution: `WITH RECURSIVE org AS (
    SELECT emp_id, emp_name, manager_id, 1 AS level,
           emp_name AS path
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    SELECT e.emp_id, e.emp_name, e.manager_id, o.level + 1,
           o.path || ' > ' || e.emp_name
    FROM employees AS e
    JOIN org       AS o ON o.emp_id = e.manager_id
)
SELECT level, emp_name, path
FROM org
ORDER BY path;`,
      explanation: 'Ordering by the accumulated path sorts the result into depth-first tree order, so the output reads like an indented org chart without any post-processing. Building the path in the recursive term is free — it is one concatenation per row, done as the row is produced.',
    },
    {
      id: 'p43-q5',
      difficulty: 'medium',
      prompt: 'Add a depth limit so a corrupted hierarchy cannot loop forever.',
      tables: ['employees'],
      think: 'What single bad row would make this query never terminate, and where does the guard belong?',
      hint: 'A manager_id that points back up the chain. The guard goes in the recursive term\'s WHERE.',
      approach: `Anchor as usual with a level counter.\nIn the recursive term, add a condition capping the level.\nThe recursion then stops after that many iterations regardless of the data.\nFlag rows that hit the cap so the corruption is visible.`,
      solution: `WITH RECURSIVE org AS (
    SELECT emp_id, emp_name, manager_id, 1 AS level
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    SELECT e.emp_id, e.emp_name, e.manager_id, o.level + 1
    FROM employees AS e
    JOIN org       AS o ON o.emp_id = e.manager_id
    WHERE o.level < 20          -- hard stop: no real org chart is 20 deep
)
SELECT level, emp_id, emp_name,
       CASE WHEN level = 20 THEN 'depth limit reached - check for a cycle' END AS warning
FROM org
ORDER BY level, emp_name;`,
      explanation: 'The guard belongs in the recursive term, where it stops new rows being produced, rather than in the outer query, where it would filter results only after the infinite loop had already run. A depth limit costs nothing and is the difference between a slow query and an incident.',
    },
    {
      id: 'p43-q6',
      difficulty: 'medium',
      prompt: 'Count how many people report, directly or indirectly, to each manager.',
      tables: ['employees'],
      think: 'You need a subtree size for every node, not just one. How do you get the ancestor of every row?',
      hint: 'Recurse from every employee as an anchor, carrying the original root along.',
      approach: `Anchor with every employee as their own root, recording that root id.\nRecurse downwards, carrying the original root id unchanged.\nEach produced row is an (ancestor, descendant) pair.\nGroup by the root to count the descendants.`,
      solution: `WITH RECURSIVE reach AS (
    SELECT emp_id AS root_id, emp_id AS descendant_id, 0 AS depth
    FROM employees

    UNION ALL

    SELECT r.root_id, e.emp_id, r.depth + 1
    FROM employees AS e
    JOIN reach     AS r ON r.descendant_id = e.manager_id
    WHERE r.depth < 20
)
SELECT e.emp_id,
       e.emp_name,
       COUNT(*) FILTER (WHERE r.depth = 1) AS direct_reports,
       COUNT(*) FILTER (WHERE r.depth > 0) AS total_org_size,
       MAX(r.depth)                        AS org_depth
FROM reach     AS r
JOIN employees AS e ON e.emp_id = r.root_id
GROUP BY e.emp_id, e.emp_name
HAVING COUNT(*) FILTER (WHERE r.depth > 0) > 0
ORDER BY total_org_size DESC;`,
      explanation: 'Anchoring on every employee produces the full transitive closure — one row per ancestor-descendant pair — which is what lets a single GROUP BY answer the question for every manager at once. The depth column then distinguishes direct reports from the whole organisation without a second query.',
    },
    {
      id: 'p43-q7',
      difficulty: 'hard',
      prompt: 'Detect cycles in the hierarchy using a path array.',
      tables: ['employees'],
      think: 'A cycle means revisiting a node. How do you know whether you have already seen it?',
      hint: 'Carry the visited nodes as an array and check membership before recursing.',
      approach: `Anchor with a single-element path array containing the starting node.\nIn the recursive term, refuse to follow an edge into a node already in the path.\nCarry a flag when such an edge is detected.\nReturn the rows where a cycle was found, with the path that formed it.`,
      solution: `WITH RECURSIVE walk AS (
    SELECT emp_id, emp_name, manager_id,
           ARRAY[emp_id] AS path,
           FALSE          AS is_cycle
    FROM employees

    UNION ALL

    SELECT e.emp_id, e.emp_name, e.manager_id,
           w.path || e.emp_id,
           e.emp_id = ANY(w.path)
    FROM employees AS e
    JOIN walk      AS w ON w.emp_id = e.manager_id
    WHERE NOT w.is_cycle
      AND array_length(w.path, 1) < 20
)
SELECT emp_id, emp_name, path AS cycle_path
FROM walk
WHERE is_cycle
ORDER BY emp_id;`,
      explanation: 'The array membership test stops the recursion at the exact moment it would revisit a node, so the offending path is captured rather than the query hanging. PostgreSQL 14+ offers a built-in CYCLE clause that does this declaratively, but knowing the manual construction shows you understand what it is doing.',
      dialect: 'Arrays and ANY are PostgreSQL. SQL Server: build a delimited string path and use LIKE for the membership test. Oracle: CONNECT BY has NOCYCLE built in.',
    },
    {
      id: 'p43-q8',
      difficulty: 'hard',
      prompt: 'Compute the total salary cost of each manager\'s entire organisation, including themselves.',
      tables: ['employees'],
      think: 'A rollup up a tree. What does the transitive closure give you that makes this a plain aggregation?',
      hint: 'One row per (ancestor, descendant) pair — then just sum the descendant salaries per ancestor.',
      approach: `Build the transitive closure anchored on every employee.\nJoin each descendant back to employees for the salary.\nGroup by the ancestor and sum.\nInclude the ancestor's own salary by keeping depth 0 in the sum.`,
      solution: `WITH RECURSIVE reach AS (
    SELECT emp_id AS root_id, emp_id AS node_id, 0 AS depth
    FROM employees

    UNION ALL

    SELECT r.root_id, e.emp_id, r.depth + 1
    FROM employees AS e
    JOIN reach     AS r ON r.node_id = e.manager_id
    WHERE r.depth < 20
)
SELECT mgr.emp_id,
       mgr.emp_name,
       COUNT(*)                                 AS org_headcount,
       SUM(node.salary)                         AS org_salary_cost,
       SUM(node.salary) FILTER (WHERE r.depth > 0) AS reports_salary_cost,
       ROUND(AVG(node.salary), 2)               AS org_avg_salary
FROM reach     AS r
JOIN employees AS mgr  ON mgr.emp_id  = r.root_id
JOIN employees AS node ON node.emp_id = r.node_id
WHERE node.salary IS NOT NULL
GROUP BY mgr.emp_id, mgr.emp_name
ORDER BY org_salary_cost DESC;`,
      explanation: 'Once the closure exists, a hierarchical rollup is an ordinary GROUP BY — the recursion has already flattened the tree into pairs. Including depth 0 means each manager\'s own salary is in their org cost, which is what a budget owner expects; the FILTER column gives the other reading for free.',
    },
    {
      id: 'p43-q9',
      difficulty: 'hard',
      prompt: 'Generate a date series with a recursive CTE, for engines without generate_series.',
      tables: ['sales'],
      think: 'Recursion is not only for hierarchies. What makes a sequence a recursive structure?',
      hint: 'Each row is derived from the previous one by adding an interval.',
      approach: `Anchor on the first date of the range.\nIn the recursive term, add one day to the previous row.\nStop when the date passes the end of the range.\nUse the result as a calendar spine.`,
      solution: `WITH RECURSIVE calendar AS (
    SELECT DATE '2024-01-01' AS d

    UNION ALL

    SELECT d + 1
    FROM calendar
    WHERE d < DATE '2024-12-31'
)
SELECT c.d AS day,
       COALESCE(SUM(s.amount), 0) AS revenue,
       COUNT(s.sale_id)           AS sales
FROM calendar AS c
LEFT JOIN sales AS s ON s.sale_date = c.d
GROUP BY c.d
ORDER BY c.d;`,
      explanation: 'The termination condition sits in the recursive term\'s WHERE, exactly as the depth guard does in a hierarchy — without it the recursion never stops. This is the portable replacement for generate_series, and it is how you build a calendar spine on MySQL or SQL Server.',
      dialect: 'MySQL 8 and SQL Server both need a recursion limit: MySQL SET cte_max_recursion_depth, SQL Server OPTION (MAXRECURSION 400), since the default of 100 is too low for a year.',
    },
    {
      id: 'p43-q10',
      difficulty: 'hard',
      prompt: 'Return the org chart as an indented tree, sorted so children appear directly under their parent.',
      tables: ['employees'],
      think: 'Depth-first order is not the natural output order of a recursive CTE. What sort key produces it?',
      hint: 'An accumulated path array of the sort keys, which sorts lexicographically into tree order.',
      approach: `Anchor at the roots, carrying a path array of the sort key — the name or id.\nAppend to that array in each recursive step.\nUse the array as the ORDER BY in the outer query.\nIndent the name by the level for readability.`,
      solution: `WITH RECURSIVE org AS (
    SELECT emp_id, emp_name, manager_id, 1 AS level,
           ARRAY[emp_name] AS sort_path
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    SELECT e.emp_id, e.emp_name, e.manager_id, o.level + 1,
           o.sort_path || e.emp_name
    FROM employees AS e
    JOIN org       AS o ON o.emp_id = e.manager_id
    WHERE o.level < 20
)
SELECT level,
       REPEAT('    ', level - 1) || emp_name AS org_chart,
       emp_id
FROM org
ORDER BY sort_path;`,
      explanation: 'Ordering by the accumulated path array gives depth-first traversal because array comparison is lexicographic — a child\'s path always starts with its parent\'s. The REPEAT indentation then turns a flat result set into something that reads like an actual org chart.',
      dialect: 'Arrays are PostgreSQL. SQL Server: build a padded string path so it sorts correctly, e.g. concatenating zero-padded ids. Oracle: CONNECT BY has SYS_CONNECT_BY_PATH and ORDER SIBLINGS BY.',
    },
  ],
};
