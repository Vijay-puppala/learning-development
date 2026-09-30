import type { Pattern } from '../types';

export const p05: Pattern = {
  num: 5,
  slug: 'dense-ranking',
  title: 'Dense Ranking',
  concept: 'DENSE_RANK()',
  category: 'Ranking & Top-N',
  tagline: 'Rank distinct values, not rows — the function behind every "Nth highest" question.',
  theory: `DENSE_RANK() numbers *distinct values* in order. Ties share a number and the next value gets the very next integer, so the sequence is 1, 2, 3 with no gaps no matter how many rows sit at each level.

That property is what makes it the right tool for "the third highest salary": you want the third distinct salary value, and you do not care whether one person or nine people earn it. RANK would have skipped to 4 after a two-way tie at 2; ROW_NUMBER would have called the second-highest-paid person "2" even if they earn the same as person 1.

A useful mental shortcut: DENSE_RANK() OVER (ORDER BY x) is the position of x in the sorted list of distinct x values. So filtering dense_rank = N is exactly "rows holding the Nth distinct value", and filtering dense_rank <= N is "rows holding any of the top N distinct values".`,
  pitfalls: [
    'Using ROW_NUMBER for "Nth highest". With duplicates it returns the Nth *person*, not the Nth *salary*.',
    'Using RANK for "Nth highest". After a tie the number N may not exist at all and you get an empty result.',
    'Adding a tiebreaker to the window ORDER BY, which makes every value distinct and defeats the purpose.',
    'Forgetting that DENSE_RANK still orders NULLs somewhere. Filter them out if "no salary" should not occupy rank 1.',
    'Assuming dense_rank = N always returns exactly one row — it returns everyone who holds that value.',
  ],
  questions: [
    {
      id: 'p05-q1',
      difficulty: 'easy',
      prompt: 'Assign a dense rank to employees by salary descending, so the rank sequence has no gaps.',
      tables: ['employees'],
      think: 'After two employees tie at rank 1, what should the next employee receive under dense ranking — and how does that differ from RANK?',
      hint: 'DENSE_RANK() OVER (ORDER BY salary DESC), and deliberately no tiebreaker.',
      approach: `Order employees by salary descending inside the window.\nApply DENSE_RANK so equal salaries share a number and no number is skipped.\nLeave any unique column out of the window ORDER BY.\nDisplay by rank.`,
      solution: `SELECT emp_name,
       salary,
       DENSE_RANK() OVER (ORDER BY salary DESC) AS salary_level
FROM employees
WHERE salary IS NOT NULL
ORDER BY salary_level, emp_name;`,
      explanation: 'The result reads as salary *bands*: everyone at level 1 is on the top salary, level 2 the next distinct salary down, and so on. That band interpretation is the cleanest way to explain DENSE_RANK out loud.',
    },
    {
      id: 'p05-q2',
      difficulty: 'easy',
      prompt: 'Compare all three ranking functions side by side for employees ordered by salary descending.',
      tables: ['employees'],
      think: 'Before running it, predict what each column shows for a table with two employees tied at the top. Which two columns agree, and where?',
      hint: 'Put ROW_NUMBER, RANK and DENSE_RANK in the same SELECT with an identical OVER clause.',
      approach: `Write three window functions over an identical OVER (ORDER BY salary DESC).\nReturn all three alongside the salary.\nOrder the output by salary descending to make the pattern visible.\nRead down the columns: row_number always increments, rank skips, dense_rank does not.`,
      solution: `SELECT emp_name,
       salary,
       ROW_NUMBER() OVER (ORDER BY salary DESC) AS row_num,
       RANK()       OVER (ORDER BY salary DESC) AS rnk,
       DENSE_RANK() OVER (ORDER BY salary DESC) AS dense_rnk
FROM employees
WHERE salary IS NOT NULL
ORDER BY salary DESC, emp_name;`,
      explanation: 'With salaries 100, 100, 90, 80 the columns read row_num 1,2,3,4 / rnk 1,1,3,4 / dense_rnk 1,1,2,3. Being able to produce that table from memory is worth more in an interview than any single query on this site.',
    },
    {
      id: 'p05-q3',
      difficulty: 'medium',
      prompt: 'Return every employee earning the 3rd highest salary in the company.',
      tables: ['employees'],
      think: 'Is "3rd highest salary" a statement about a person or about a value? And should nine people on that salary all be returned?',
      hint: 'Dense rank the salaries, then filter the dense rank to exactly 3.',
      approach: `Dense rank employees by salary descending, so the rank counts distinct salary values.\nWrap it in a CTE.\nKeep every row whose dense rank equals 3.\nReturn all of them — there may be more than one.`,
      solution: `WITH levels AS (
    SELECT emp_id, emp_name, salary,
           DENSE_RANK() OVER (ORDER BY salary DESC) AS salary_level
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT emp_id, emp_name, salary
FROM levels
WHERE salary_level = 3
ORDER BY emp_name;`,
      explanation: 'This is the canonical "Nth highest salary" answer and it handles duplicates correctly by construction. If the table has fewer than three distinct salaries the result is empty, which is the honest answer — mention that rather than letting the interviewer find it.',
    },
    {
      id: 'p05-q4',
      difficulty: 'medium',
      prompt: 'Return the 2nd highest salary in each department, along with everyone who earns it.',
      tables: ['employees'],
      think: 'Add a partition and the question becomes per-group. Does the meaning of "2nd highest" change inside a partition?',
      hint: 'PARTITION BY dept_id, then filter dense rank = 2.',
      approach: `Dense rank employees by salary descending, partitioned by department.\nWrap in a CTE.\nKeep rows at dense rank 2.\nOrder by department.`,
      solution: `WITH levels AS (
    SELECT emp_id, emp_name, dept_id, salary,
           DENSE_RANK() OVER (PARTITION BY dept_id
                              ORDER BY salary DESC) AS salary_level
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id, emp_name, salary
FROM levels
WHERE salary_level = 2
ORDER BY dept_id, emp_name;`,
      explanation: 'Departments where every employee earns the same salary have no level 2 and simply do not appear. Whether that is correct or whether such departments should show NULL is a genuine clarifying question worth asking.',
    },
    {
      id: 'p05-q5',
      difficulty: 'medium',
      prompt: 'Group products into price tiers: tier 1 is the most expensive distinct price, tier 2 the next, and so on. Return how many products sit in each tier.',
      tables: ['products'],
      think: 'A "tier" is a distinct value level. Which function numbers levels without gaps, so tier 5 really is the fifth distinct price?',
      hint: 'Dense rank the price descending, then aggregate by that tier.',
      approach: `Dense rank products by price descending to assign a tier to each product.\nWrap that in a CTE.\nGroup by tier and count the products in it.\nReturn the tier, its price and the product count.`,
      solution: `WITH tiers AS (
    SELECT product_id, product_name, price,
           DENSE_RANK() OVER (ORDER BY price DESC) AS price_tier
    FROM products
    WHERE price IS NOT NULL
)
SELECT price_tier,
       price,
       COUNT(*) AS products_at_this_price
FROM tiers
GROUP BY price_tier, price
ORDER BY price_tier;`,
      explanation: 'Because dense rank has no gaps, the tier number doubles as a count of how many distinct prices are at or above this one — a fact you can state confidently only with DENSE_RANK.',
    },
    {
      id: 'p05-q6',
      difficulty: 'medium',
      prompt: 'Return departments where the number of distinct salary levels is fewer than 3 — flat pay structures.',
      tables: ['employees'],
      think: 'The maximum dense rank in a partition is the count of distinct values in it. Can you get that without a second aggregation?',
      hint: 'MAX of the dense rank per department equals COUNT(DISTINCT salary) per department.',
      approach: `Dense rank salaries within each department.\nGroup by department and take the maximum dense rank, which is the number of distinct salaries.\nKeep departments where that maximum is below 3.\nReturn the department and its level count.`,
      solution: `WITH levels AS (
    SELECT dept_id, salary,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS lvl
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT dept_id,
       MAX(lvl)  AS distinct_salary_levels,
       COUNT(*)  AS employees
FROM levels
GROUP BY dept_id
HAVING MAX(lvl) < 3
ORDER BY distinct_salary_levels, dept_id;`,
      explanation: 'MAX(dense_rank) = COUNT(DISTINCT value) is the identity that makes this work, and it is only true because dense rank never skips. COUNT(DISTINCT salary) would answer the same question more directly — showing you know both, and why they agree, is the stronger answer.',
    },
    {
      id: 'p05-q7',
      difficulty: 'hard',
      prompt: 'For each customer, return the products they bought at their 2nd-most-frequent purchase count.',
      tables: ['order_items', 'orders'],
      think: 'Two levels of aggregation before the ranking: how many times per product per customer, then which distinct counts exist per customer.',
      hint: 'Aggregate to (customer, product, times_bought), then dense rank times_bought descending within each customer.',
      approach: `Join order lines to orders to attach a customer to each line.\nCount purchases per customer and product.\nDense rank those counts descending within each customer, so equal counts share a level.\nKeep level 2 and return the products.`,
      solution: `WITH purchases AS (
    SELECT o.customer_id,
           oi.product_id,
           COUNT(*) AS times_bought
    FROM order_items AS oi
    JOIN orders      AS o ON o.order_id = oi.order_id
    GROUP BY o.customer_id, oi.product_id
),
levels AS (
    SELECT *,
           DENSE_RANK() OVER (PARTITION BY customer_id
                              ORDER BY times_bought DESC) AS freq_level
    FROM purchases
)
SELECT customer_id, product_id, times_bought
FROM levels
WHERE freq_level = 2
ORDER BY customer_id, product_id;`,
      explanation: 'DENSE_RANK is right here because "2nd-most-frequent" describes a frequency value, not a product. Several products may tie at that frequency and all of them belong in the answer — ROW_NUMBER would have arbitrarily returned one.',
    },
    {
      id: 'p05-q8',
      difficulty: 'hard',
      prompt: 'Write a parameterised query returning the Nth highest salary, with N supplied as a bind variable, and make it return NULL rather than no rows when N exceeds the number of distinct salaries.',
      tables: ['employees'],
      think: 'A filter that matches nothing returns zero rows. How do you turn "zero rows" into "one row containing NULL"?',
      hint: 'Wrap the dense-rank filter in a scalar subquery — a scalar subquery that matches nothing evaluates to NULL.',
      approach: `Dense rank salaries descending over the distinct salary values.\nSelect the salary at the requested level as a scalar subquery.\nBecause a scalar subquery with no matching row yields NULL, the outer SELECT always produces exactly one row.\nReturn the parameter alongside the answer so the output is self-describing.`,
      solution: `SELECT :n AS n,
       (
           SELECT DISTINCT salary
           FROM (
               SELECT salary,
                      DENSE_RANK() OVER (ORDER BY salary DESC) AS lvl
               FROM employees
               WHERE salary IS NOT NULL
           ) AS ranked
           WHERE lvl = :n
       ) AS nth_highest_salary;`,
      explanation: 'The scalar-subquery wrapper is the trick that turns an empty result into a NULL row, which is what the classic LeetCode phrasing of this question demands. DISTINCT inside guarantees the subquery returns at most one value even when several employees share the Nth salary.',
      dialect: 'Bind-parameter syntax varies: :n (Oracle, PostgreSQL via drivers), ? (MySQL, JDBC), @n (SQL Server). The structure is identical.',
    },
    {
      id: 'p05-q9',
      difficulty: 'hard',
      prompt: 'Return the top 3 distinct order amounts per customer, and flag whether each is a personal record at the time it was placed.',
      tables: ['orders'],
      think: 'Two independent ideas per row: a value-level ranking, and a time-ordered running maximum. Can one query carry both?',
      hint: 'DENSE_RANK on amount descending for the levels; a running MAX ordered by date for the record flag.',
      approach: `Dense rank each customer's orders by amount descending so equal amounts share a level.\nIn the same pass, compute a running maximum amount ordered by order date, covering all rows up to the current one.\nA row is a personal record when its amount equals that running maximum.\nKeep levels 1 to 3.`,
      solution: `WITH scored AS (
    SELECT order_id,
           customer_id,
           order_date,
           amount,
           DENSE_RANK() OVER (PARTITION BY customer_id
                              ORDER BY amount DESC) AS amount_level,
           MAX(amount)  OVER (PARTITION BY customer_id
                              ORDER BY order_date, order_id
                              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_max
    FROM orders
)
SELECT customer_id,
       amount_level,
       order_id,
       order_date,
       amount,
       CASE WHEN amount = running_max THEN 'record' ELSE '' END AS was_record
FROM scored
WHERE amount_level <= 3
ORDER BY customer_id, amount_level, order_date;`,
      explanation: 'The two windows share a partition but use different orderings and different frames — perfectly legal and one scan cheaper than two subqueries. The explicit ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW frame is what makes MAX a *running* maximum rather than a partition-wide one.',
    },
    {
      id: 'p05-q10',
      difficulty: 'hard',
      prompt: 'Find employees whose salary level (dense rank descending) in their department is strictly better than their level company-wide would suggest — that is, they rank higher locally than globally.',
      tables: ['employees'],
      think: 'Two dense ranks over the same ordering, different partitions. What comparison expresses "does better locally"?',
      hint: 'A lower dense rank is better. Compute both and keep rows where the department level is numerically smaller than the company level.',
      approach: `Compute the company-wide salary level with an unpartitioned dense rank.\nCompute the departmental salary level with a dense rank partitioned by department.\nCompare the two: a smaller departmental number means the employee stands out more locally.\nReturn the gap, largest first.`,
      solution: `WITH levels AS (
    SELECT emp_id, emp_name, dept_id, salary,
           DENSE_RANK() OVER (ORDER BY salary DESC)                      AS company_level,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS dept_level
    FROM employees
    WHERE salary IS NOT NULL
)
SELECT emp_name,
       dept_id,
       salary,
       dept_level,
       company_level,
       company_level - dept_level AS local_advantage
FROM levels
WHERE dept_level < company_level
ORDER BY local_advantage DESC, salary DESC;`,
      explanation: 'Because dense rank has no gaps, the difference between the two levels is directly interpretable: it is how many distinct salary bands the employee "gains" by being measured against their department instead of the whole company. That arithmetic would be meaningless with RANK, whose gaps depend on tie sizes.',
    },
  ],
};
