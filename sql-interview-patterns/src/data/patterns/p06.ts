import type { Pattern } from '../types';

export const p06: Pattern = {
  num: 6,
  slug: 'assign-row-numbers',
  title: 'Assign Row Numbers',
  concept: 'ROW_NUMBER()',
  category: 'Window Functions',
  tagline: 'A deterministic sequence per partition — the workhorse behind dedup, pagination and pivoting.',
  theory: `ROW_NUMBER() hands out 1, 2, 3… with no ties and no gaps. It is the only ranking function that guarantees exactly one row per number, which is why it underpins deduplication (keep rn = 1), latest-record-per-group (pattern 30) and any "pair row N with row N" reshaping.

Because it never ties, the ORDER BY inside OVER must be *total* for the result to be reproducible. If two rows compare equal on every ordering column, the engine picks arbitrarily and may pick differently tomorrow. Adding the primary key as the last ordering column costs nothing and makes the query deterministic — do it reflexively.

A ROW_NUMBER with no PARTITION BY numbers the whole result set; with PARTITION BY it restarts at 1 for each group. And remember there is no "current row number of the output" in SQL — ROW_NUMBER is computed before the outer ORDER BY, so sorting the result differently does not renumber it.`,
  pitfalls: [
    'OVER () with no ORDER BY. Legal in some engines, non-deterministic in all of them.',
    'Expecting ROW_NUMBER to reflect the final display order. It is fixed by the window ORDER BY, not the query ORDER BY.',
    'Using it where ties must be preserved — that is RANK or DENSE_RANK.',
    'Filtering on it in the same SELECT rather than from a CTE.',
    'Assuming row numbers survive a later join. Any join can duplicate or drop rows; number after the joins, not before.',
  ],
  questions: [
    {
      id: 'p06-q1',
      difficulty: 'easy',
      prompt: 'Number all employees 1..N ordered by hire_date, oldest hire first.',
      tables: ['employees'],
      think: 'Two people hired on the same day — who gets the lower number, and can you guarantee the same answer next run?',
      hint: 'ROW_NUMBER() OVER (ORDER BY hire_date, emp_id) — the key makes it total.',
      approach: `Order employees by hire_date ascending inside the window.\nAdd emp_id as a final tiebreaker so the ordering is total.\nApply ROW_NUMBER.\nDisplay in the same order.`,
      solution: `SELECT ROW_NUMBER() OVER (ORDER BY hire_date, emp_id) AS seniority_no,
       emp_id,
       emp_name,
       hire_date
FROM employees
ORDER BY seniority_no;`,
      explanation: 'No PARTITION BY means one window over the whole table, so the numbering runs 1..N. The emp_id tiebreaker is the difference between a query you can put in a report and one that shuffles between runs.',
    },
    {
      id: 'p06-q2',
      difficulty: 'easy',
      prompt: 'Number each customer\'s orders 1, 2, 3… in the sequence they were placed.',
      tables: ['orders'],
      think: 'What restarts the numbering, and what defines "the sequence they were placed"?',
      hint: 'PARTITION BY customer_id restarts it; ORDER BY order_date sequences it.',
      approach: `Partition the window by customer_id so numbering restarts per customer.\nOrder by order_date ascending, with order_id as the within-day tiebreaker.\nApply ROW_NUMBER to get the order sequence number.\nDisplay by customer then sequence.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       ROW_NUMBER() OVER (PARTITION BY customer_id
                          ORDER BY order_date, order_id) AS order_seq
FROM orders
ORDER BY customer_id, order_seq;`,
      explanation: 'order_seq = 1 is the customer\'s first-ever order, which is the basis of every cohort and retention analysis. Storing it once in a CTE and reusing it saves repeating the window three times later.',
    },
    {
      id: 'p06-q3',
      difficulty: 'medium',
      prompt: 'Return only each customer\'s 2nd order.',
      tables: ['orders'],
      think: 'Filtering on a window result has a structural requirement. What is it?',
      hint: 'Number in a CTE, filter on the number in the outer query.',
      approach: `Number each customer's orders chronologically inside a CTE.\nIn the outer query keep rows where the sequence number is 2.\nCustomers with only one order simply do not appear.\nReturn the order details.`,
      solution: `WITH seq AS (
    SELECT customer_id, order_id, order_date, amount,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date, order_id) AS order_seq
    FROM orders
)
SELECT customer_id, order_id, order_date, amount
FROM seq
WHERE order_seq = 2
ORDER BY customer_id;`,
      explanation: 'Window functions are evaluated after WHERE and before the outer SELECT list can be filtered, so the CTE is not stylistic — it is required. The second-order query is a real business question: it measures whether a first purchase converted into a habit.',
    },
    {
      id: 'p06-q4',
      difficulty: 'medium',
      prompt: 'Split employees into two alternating groups (A and B) by salary rank, for an A/B test.',
      tables: ['employees'],
      think: 'Alternating assignment is a property of the row number itself. What arithmetic turns 1,2,3,4 into A,B,A,B?',
      hint: 'The parity of the row number — modulo 2.',
      approach: `Number employees by salary descending.\nTake the remainder of that number divided by 2.\nMap remainder 1 to group A and 0 to group B.\nReturn the assignment.`,
      solution: `WITH numbered AS (
    SELECT emp_id, emp_name, salary,
           ROW_NUMBER() OVER (ORDER BY salary DESC, emp_id) AS rn
    FROM employees
)
SELECT emp_id,
       emp_name,
       salary,
       CASE WHEN rn % 2 = 1 THEN 'A' ELSE 'B' END AS test_group
FROM numbered
ORDER BY rn;`,
      explanation: 'Alternating on a salary-sorted row number balances the two groups on salary far better than a random split would — each adjacent pair is separated. This is stratified assignment, and it is a good thing to name when you present the query.',
      dialect: 'The modulo operator is % in PostgreSQL, MySQL and SQL Server; Oracle uses MOD(rn, 2).',
    },
    {
      id: 'p06-q5',
      difficulty: 'medium',
      prompt: 'Return every 10th order by date — a 10% systematic sample.',
      tables: ['orders'],
      think: 'Systematic sampling means "every kth row of an ordered list". What gives you the position in that list?',
      hint: 'Number by date, then keep rows whose number is divisible by 10.',
      approach: `Number all orders by order_date with order_id as the tiebreaker.\nKeep rows whose number leaves no remainder when divided by 10.\nThat yields rows 10, 20, 30 and so on.\nReturn the sampled orders.`,
      solution: `WITH numbered AS (
    SELECT order_id, customer_id, order_date, amount,
           ROW_NUMBER() OVER (ORDER BY order_date, order_id) AS rn
    FROM orders
)
SELECT order_id, customer_id, order_date, amount, rn
FROM numbered
WHERE rn % 10 = 0
ORDER BY rn;`,
      explanation: 'Systematic sampling is reproducible, unlike ORDER BY RANDOM(), which is what makes it usable for an auditable sample. Its one weakness is periodicity: if the data has a cycle of length 10 the sample is biased, so mention that caveat.',
    },
    {
      id: 'p06-q6',
      difficulty: 'medium',
      prompt: 'For each customer, show their order sequence number and how many orders they placed in total, on every row.',
      tables: ['orders'],
      think: 'One value counts up per row; the other is constant across the partition. What distinguishes the two window definitions?',
      hint: 'Presence or absence of ORDER BY inside OVER changes the frame. COUNT(*) OVER (PARTITION BY ...) with no ORDER BY spans the whole partition.',
      approach: `Partition by customer_id for both windows.\nFor the sequence, add an ORDER BY inside OVER and use ROW_NUMBER.\nFor the total, omit ORDER BY and use COUNT(*) so the frame covers the whole partition.\nReturn both plus a readable "3 of 7" style label.`,
      solution: `SELECT customer_id,
       order_id,
       order_date,
       ROW_NUMBER() OVER (PARTITION BY customer_id
                          ORDER BY order_date, order_id) AS order_seq,
       COUNT(*)     OVER (PARTITION BY customer_id)      AS total_orders,
       CONCAT(
           ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id),
           ' of ',
           COUNT(*) OVER (PARTITION BY customer_id)
       ) AS position_label
FROM orders
ORDER BY customer_id, order_seq;`,
      explanation: 'The presence of ORDER BY inside OVER silently changes the default frame from the whole partition to "start of partition through current row". That single fact explains most surprising window-function results and is worth stating explicitly in an interview.',
    },
    {
      id: 'p06-q7',
      difficulty: 'hard',
      prompt: 'Keep only the most recently signed-up customer for each email address, discarding older duplicate accounts.',
      tables: ['customers'],
      think: 'Deduplication is "number within the duplicate key, keep one". What is the key, and what decides which copy wins?',
      hint: 'PARTITION BY email, ORDER BY signup_date DESC, then keep rn = 1.',
      approach: `Partition by the duplicate key — the email address.\nOrder within the partition so the copy you want to keep lands first: newest signup, with the id as the tiebreaker.\nNumber the rows.\nKeep only number 1 per email.`,
      solution: `WITH ranked AS (
    SELECT customer_id, customer_name, email, city, signup_date,
           ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email))
                              ORDER BY signup_date DESC, customer_id DESC) AS rn
    FROM customers
    WHERE email IS NOT NULL
)
SELECT customer_id, customer_name, email, city, signup_date
FROM ranked
WHERE rn = 1
ORDER BY customer_id;`,
      explanation: 'ROW_NUMBER is the correct choice here precisely because it never ties: you are guaranteed exactly one survivor per email even if two accounts share a signup date. Normalising the partition key with LOWER/TRIM makes the dedup catch case and whitespace variants.',
    },
    {
      id: 'p06-q8',
      difficulty: 'hard',
      prompt: 'Pair each employee with the next employee hired after them, showing both names in one row.',
      tables: ['employees'],
      think: 'Adjacent rows in an ordering can be paired by number. What is the relationship between the two row numbers you want to join on?',
      hint: 'Number by hire_date, then self-join the numbered set on rn = rn + 1.',
      approach: `Number employees by hire_date ascending in a CTE.\nJoin that CTE to itself, matching each row to the row whose number is one greater.\nUse a LEFT JOIN so the most recent hire still appears, with NULL for the successor.\nReturn both names and the gap in days.`,
      solution: `WITH ordered AS (
    SELECT emp_id, emp_name, hire_date,
           ROW_NUMBER() OVER (ORDER BY hire_date, emp_id) AS rn
    FROM employees
)
SELECT a.emp_name                     AS hired_first,
       a.hire_date,
       b.emp_name                     AS hired_next,
       b.hire_date                    AS next_hire_date,
       b.hire_date - a.hire_date      AS days_between
FROM ordered AS a
LEFT JOIN ordered AS b ON b.rn = a.rn + 1
ORDER BY a.rn;`,
      explanation: 'Self-joining on rn + 1 is the pre-window-function way to reach an adjacent row, and it is worth knowing because it generalises to rn + k. In practice LEAD() (pattern 10) does the same thing in one pass with no join — say so, and say that LEAD is what you would actually ship.',
    },
    {
      id: 'p06-q9',
      difficulty: 'hard',
      prompt: 'Split each department\'s employees into 3 roughly equal salary bands and label them high, mid and low.',
      tables: ['employees'],
      think: 'Equal-sized buckets are not the same as equal-width value ranges. Which function does the first, and how does it handle a partition that does not divide evenly?',
      hint: 'NTILE(3) within each department partition.',
      approach: `Partition by department, order by salary descending.\nUse NTILE with 3 buckets so each department is split into three near-equal groups.\nMap bucket 1, 2, 3 to the labels high, mid, low.\nReturn the band along with the employee.`,
      solution: `WITH banded AS (
    SELECT emp_id, emp_name, dept_id, salary,
           NTILE(3) OVER (PARTITION BY dept_id
                          ORDER BY salary DESC, emp_id) AS band_no
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id,
       emp_name,
       salary,
       band_no,
       CASE band_no WHEN 1 THEN 'high' WHEN 2 THEN 'mid' ELSE 'low' END AS pay_band
FROM banded
ORDER BY dept_id, band_no, salary DESC;`,
      explanation: 'NTILE distributes remainder rows to the earliest buckets, so a department of 8 splits 3/3/2 rather than failing. Its blind spot is ties: two employees on identical salaries can land in different bands, which is why NTILE is for rough bucketing and DENSE_RANK is for exact value levels.',
    },
    {
      id: 'p06-q10',
      difficulty: 'hard',
      prompt: 'Assign a stable global sequence number across two tables, sales_2023 and sales_2024, ordered by sale_date across both.',
      tables: ['sales_2023 / sales_2024'],
      think: 'The numbering must span a union. Does the window go inside each branch of the UNION or outside it?',
      hint: 'Union first into a CTE, then apply one window over the combined result.',
      approach: `Union the two yearly tables with UNION ALL, tagging each row with its source table.\nTreat the union as a single input in a CTE.\nApply one ROW_NUMBER over the whole combined set ordered by sale_date.\nReturn the sequence, the source tag and the row.`,
      solution: `WITH combined AS (
    SELECT '2023' AS src, product_id, region, sale_date, amount FROM sales_2023
    UNION ALL
    SELECT '2024' AS src, product_id, region, sale_date, amount FROM sales_2024
)
SELECT ROW_NUMBER() OVER (ORDER BY sale_date, product_id, region) AS global_seq,
       src,
       sale_date,
       product_id,
       region,
       amount
FROM combined
ORDER BY global_seq;`,
      explanation: 'A window function applies to the result of the FROM clause, so numbering after the union gives one continuous sequence; numbering inside each branch would restart at 1 twice. UNION ALL rather than UNION matters too — UNION would deduplicate identical sales rows and change the counts.',
    },
  ],
};
