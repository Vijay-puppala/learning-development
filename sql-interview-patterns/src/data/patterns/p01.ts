import type { Pattern } from '../types';

export const p01: Pattern = {
  num: 1,
  slug: 'find-duplicate-rows',
  title: 'Find Duplicate Rows',
  concept: 'GROUP BY, HAVING',
  category: 'Aggregation & Grouping',
  tagline: 'Decide what "the same row" means, then count the groups that hold more than one.',
  theory: `A duplicate is not a property of a row — it is a property of a *key you chose*. Before writing anything, answer: duplicate on what? Same email? Same (customer_id, order_date)? The entire row? The columns you name become the GROUP BY list, and everything else is noise.

Once the key is fixed the pattern is mechanical: group by the key, count the rows in each group, keep the groups whose count exceeds one. HAVING is what makes it work — WHERE filters rows before grouping and cannot see COUNT(*), while HAVING filters groups after the aggregate exists.

The second half of the pattern is what you return. "Show me the duplicates" can mean the key plus a count (a summary) or every offending row including its primary key (a worklist for cleanup). Ask which; the first is GROUP BY, the second needs a window function or a join back to the grouped result.`,
  pitfalls: [
    'Putting COUNT(*) > 1 in WHERE. The aggregate does not exist yet at WHERE time — it belongs in HAVING.',
    'Grouping by the primary key. Every group then has exactly one row and you get an empty result — a classic self-inflicted "there are no duplicates".',
    'Forgetting that NULL never equals NULL in a join, but GROUP BY *does* put all NULLs in one group. Two rows with a NULL email are duplicates to GROUP BY and not to a self-join.',
    'Returning only the key when the interviewer wanted the rows to delete, or vice versa. Clarify the deliverable.',
    'Case and whitespace: "Ann@x.com" and "ann@x.com " group separately unless you normalise with LOWER/TRIM first.',
  ],
  questions: [
    {
      id: 'p01-q1',
      difficulty: 'easy',
      prompt: 'List every email address that appears more than once in customers, along with how many times it appears.',
      tables: ['customers'],
      think: 'What is the grain of the answer — one row per customer, or one row per email? That choice decides whether you need GROUP BY at all.',
      hint: 'The answer has one row per email, so email is the only thing in your GROUP BY. The count is the size of each group.',
      approach: `Collapse customers down to one row per email.\nCount how many original rows fell into each group.\nKeep only the groups whose count is at least 2.\nReturn the email and its count, biggest offenders first.`,
      solution: `SELECT email,
       COUNT(*) AS occurrences
FROM customers
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY occurrences DESC, email;`,
      explanation: 'GROUP BY email defines the grain; COUNT(*) measures each group; HAVING filters groups after aggregation. Swapping HAVING for WHERE is a syntax error in every engine because COUNT(*) is not computed when WHERE runs.',
    },
    {
      id: 'p01-q2',
      difficulty: 'easy',
      prompt: 'Find customers who share both the same customer_name and the same city with at least one other customer.',
      tables: ['customers'],
      think: 'The duplicate key is now a pair of columns. Does that change the shape of the query, or only the GROUP BY list?',
      hint: 'A composite duplicate key is still one GROUP BY — just list both columns.',
      approach: `Group customers by the pair (customer_name, city).\nCount the rows per pair.\nKeep pairs with more than one row.\nReturn the name, the city and the count.`,
      solution: `SELECT customer_name,
       city,
       COUNT(*) AS occurrences
FROM customers
GROUP BY customer_name, city
HAVING COUNT(*) > 1
ORDER BY occurrences DESC;`,
      explanation: 'The pattern does not change when the key widens — only the GROUP BY list does. Note that two rows matching on name but differing in city are correctly *not* duplicates here.',
    },
    {
      id: 'p01-q3',
      difficulty: 'medium',
      prompt: 'Return the full customer rows (customer_id and all) for every customer whose email is duplicated — not just the email and a count.',
      tables: ['customers'],
      think: 'A GROUP BY result loses the individual rows. How do you get back to row level once you know which keys are bad?',
      hint: 'Either join the grouped result back to the base table, or use IN with a subquery that lists the offending emails.',
      approach: `Build the set of emails that appear more than once (the GROUP BY / HAVING query from Q1).\nTreat that as a filter list.\nSelect every customer row whose email is in that list.\nOrder by email so the duplicate clusters sit together for review.`,
      solution: `SELECT c.*
FROM customers AS c
WHERE c.email IN (
    SELECT email
    FROM customers
    GROUP BY email
    HAVING COUNT(*) > 1
)
ORDER BY c.email, c.customer_id;`,
      explanation: 'The subquery answers "which keys are duplicated"; the outer query answers "which rows carry those keys". Keeping the two questions separate is what makes the query readable — and it is exactly how you would build a cleanup worklist.',
    },
    {
      id: 'p01-q4',
      difficulty: 'medium',
      prompt: 'Find emails that are duplicated only after normalising case and trimming whitespace — for example "Ann@x.com" and " ann@x.com " must count as the same address.',
      tables: ['customers'],
      think: 'GROUP BY compares the stored value exactly. If the key you actually mean is a *derived* value, where must the derivation happen?',
      hint: 'Group by the expression, not the column. The same expression has to appear in SELECT and GROUP BY.',
      approach: `Derive a normalised email: trim the whitespace, then lowercase it.\nGroup by that derived expression rather than the raw column.\nCount rows per normalised value and keep those above one.\nAlso return how many distinct raw spellings exist, so you can see the mess.`,
      solution: `SELECT LOWER(TRIM(email)) AS normalised_email,
       COUNT(*)                 AS occurrences,
       COUNT(DISTINCT email)    AS raw_spellings
FROM customers
WHERE email IS NOT NULL
GROUP BY LOWER(TRIM(email))
HAVING COUNT(*) > 1
ORDER BY occurrences DESC;`,
      explanation: 'The grouping key can be any deterministic expression. COUNT(DISTINCT email) alongside COUNT(*) is a nice touch: it separates "genuine duplicates" from "one customer spelled three ways".',
    },
    {
      id: 'p01-q5',
      difficulty: 'medium',
      prompt: 'Identify orders that look like accidental double-submissions: the same customer_id, the same order_date and the same amount appearing more than once.',
      tables: ['orders'],
      think: 'Business duplicates are usually a composite of identity plus time plus value. Which columns are evidence of the *same event*, and which are just metadata?',
      hint: 'order_id differs on a double-submit, so it must stay out of the GROUP BY. Everything that describes the event goes in.',
      approach: `Group orders by customer_id, order_date and amount — the three facts that describe the same purchase event.\nCount the rows in each group.\nKeep the groups above one row.\nReturn the group key, the count, and the list of order_ids involved so the team can cancel the extras.`,
      solution: `SELECT customer_id,
       order_date,
       amount,
       COUNT(*)                   AS submissions,
       MIN(order_id)              AS keep_order_id,
       MAX(order_id)              AS newest_order_id
FROM orders
GROUP BY customer_id, order_date, amount
HAVING COUNT(*) > 1
ORDER BY submissions DESC, order_date DESC;`,
      explanation: 'MIN(order_id) gives you a deterministic "row to keep" straight out of the aggregate, which is often all a cleanup job needs. Leaving order_id out of GROUP BY is the whole point — include it and every group collapses to one row.',
    },
    {
      id: 'p01-q6',
      difficulty: 'medium',
      prompt: 'Count how many *distinct* email addresses are duplicated, and how many total customer rows are involved in duplication.',
      tables: ['customers'],
      think: 'You need an aggregate of an aggregate. Which layer produces the groups, and which layer counts them?',
      hint: 'Wrap the GROUP BY / HAVING query in an outer query and aggregate its output rows.',
      approach: `Inner query: one row per duplicated email, carrying its occurrence count.\nOuter query: count those rows to get the number of affected emails.\nOuter query: sum the occurrence counts to get the number of affected customer rows.\nReturn both numbers as a single summary row.`,
      solution: `SELECT COUNT(*)              AS duplicated_emails,
       SUM(occurrences)      AS rows_involved,
       SUM(occurrences) - COUNT(*) AS rows_to_delete
FROM (
    SELECT email, COUNT(*) AS occurrences
    FROM customers
    GROUP BY email
    HAVING COUNT(*) > 1
) AS dupes;`,
      explanation: 'Aggregating an aggregate always needs a derived table (or CTE) — SQL will not let you nest COUNT(COUNT(*)) directly. rows_to_delete falls out naturally: keep one per group, delete the rest.',
    },
    {
      id: 'p01-q7',
      difficulty: 'hard',
      prompt: 'Find rows in customers that are duplicated across *every* column except customer_id, without typing out the column list twice.',
      tables: ['customers'],
      think: 'A full-row duplicate check is still GROUP BY — but what happens to a group when one of the grouped columns is NULL, and how is that different from comparing with =?',
      hint: 'GROUP BY treats all NULLs as one value, which is what you want here. Use a CTE so the column list is written once.',
      approach: `Write a CTE that groups by every business column and counts rows, capturing the smallest customer_id in each group.\nKeep groups with more than one row.\nJoin back to customers on the business columns to list the individual offending rows — or simply return the group with its keep/delete ids.\nReturn the duplicated content plus the id that should survive.`,
      solution: `WITH full_row_dupes AS (
    SELECT customer_name, email, city, country, signup_date,
           COUNT(*)      AS copies,
           MIN(customer_id) AS keep_id
    FROM customers
    GROUP BY customer_name, email, city, country, signup_date
    HAVING COUNT(*) > 1
)
SELECT c.customer_id,
       c.customer_name,
       c.email,
       d.copies,
       CASE WHEN c.customer_id = d.keep_id THEN 'keep' ELSE 'delete' END AS action
FROM customers AS c
JOIN full_row_dupes AS d
  ON  c.customer_name IS NOT DISTINCT FROM d.customer_name
  AND c.email         IS NOT DISTINCT FROM d.email
  AND c.city          IS NOT DISTINCT FROM d.city
  AND c.country       IS NOT DISTINCT FROM d.country
  AND c.signup_date   IS NOT DISTINCT FROM d.signup_date
ORDER BY d.keep_id, c.customer_id;`,
      explanation: 'The subtle part is the join back: plain = drops rows where the column is NULL on both sides, silently losing duplicates that GROUP BY had happily found. IS NOT DISTINCT FROM is the NULL-safe comparison that keeps the two halves consistent.',
      dialect: 'IS NOT DISTINCT FROM is PostgreSQL / standard SQL. MySQL spells it <=>; SQL Server has no operator, so use (a = b OR (a IS NULL AND b IS NULL)) or join on a COALESCE-ed sentinel value.',
    },
    {
      id: 'p01-q8',
      difficulty: 'hard',
      prompt: 'For each duplicated email, return the rows side by side with a sequence number (1 = oldest signup) so an analyst can eyeball which copy to keep.',
      tables: ['customers'],
      think: 'You want per-row output *and* group-level knowledge at the same time. Which tool gives you an aggregate without collapsing the rows?',
      hint: 'A window function computes COUNT(*) over a partition while leaving every row intact — no GROUP BY needed.',
      approach: `Over a partition of email, count how many rows share that email — this stays at row level.\nOver the same partition, number the rows ordered by signup_date so the oldest is 1.\nWrap it in a CTE.\nKeep only rows whose partition count is above one, ordered so the duplicate clusters read top to bottom.`,
      solution: `WITH numbered AS (
    SELECT customer_id,
           customer_name,
           email,
           signup_date,
           COUNT(*)     OVER (PARTITION BY email) AS copies,
           ROW_NUMBER() OVER (PARTITION BY email
                              ORDER BY signup_date, customer_id) AS copy_no
    FROM customers
    WHERE email IS NOT NULL
)
SELECT customer_id, customer_name, email, signup_date, copies, copy_no
FROM numbered
WHERE copies > 1
ORDER BY email, copy_no;`,
      explanation: 'This is the window-function form of the duplicate pattern, and it is strictly more useful than GROUP BY when you need the rows back. Note the filter sits in the outer query: window functions are computed after WHERE, so you cannot filter on copies in the same SELECT.',
    },
    {
      id: 'p01-q9',
      difficulty: 'hard',
      prompt: 'Find customer_ids that appear in both customers and customers_stg but whose email or city differs — duplicated identity, conflicting content.',
      tables: ['customers', 'customers_stg'],
      think: 'This is a duplicate across two tables rather than within one. What does "same" mean when one side may hold a NULL?',
      hint: 'Join on the business key, then compare the attribute columns with a NULL-safe inequality.',
      approach: `Inner join the two tables on customer_id — that restricts you to ids present in both.\nCompare email and city between the two sides.\nUse a NULL-safe comparison so a NULL on one side and a value on the other counts as a difference.\nReturn both versions so the conflict is visible.`,
      solution: `SELECT c.customer_id,
       c.email AS current_email,
       s.email AS staged_email,
       c.city  AS current_city,
       s.city  AS staged_city
FROM customers      AS c
JOIN customers_stg  AS s
  ON c.customer_id = s.customer_id
WHERE c.email IS DISTINCT FROM s.email
   OR c.city  IS DISTINCT FROM s.city
ORDER BY c.customer_id;`,
      explanation: 'c.email <> s.email evaluates to NULL — and therefore filters the row out — whenever either side is NULL, so a value-to-NULL change would be silently missed. IS DISTINCT FROM is the three-valued-logic-safe version.',
      dialect: 'IS DISTINCT FROM is PostgreSQL / standard. MySQL: NOT (a <=> b). SQL Server: use EXCEPT on the two column lists, or explicit OR ... IS NULL checks.',
    },
    {
      id: 'p01-q10',
      difficulty: 'hard',
      prompt: 'Which products have duplicate product_name values within the same category, and for each such name give the price spread (max − min) so pricing can be reconciled?',
      tables: ['products'],
      think: 'The group key and the measure are different things here. What is the grain of the answer, and what do you want to know about each group beyond its size?',
      hint: 'Once you are grouping, COUNT is not the only aggregate available — MIN and MAX describe the group too.',
      approach: `Group products by category and product_name.\nCount rows per group and keep the groups above one.\nWithin each surviving group compute the lowest and highest price and their difference.\nSurface groups where the spread is non-zero first — those are the real pricing problems.`,
      solution: `SELECT category,
       product_name,
       COUNT(*)                 AS duplicate_count,
       MIN(price)               AS lowest_price,
       MAX(price)               AS highest_price,
       MAX(price) - MIN(price)  AS price_spread
FROM products
GROUP BY category, product_name
HAVING COUNT(*) > 1
ORDER BY price_spread DESC, duplicate_count DESC;`,
      explanation: 'Duplicate detection and group profiling are the same query — once the rows are grouped, every aggregate is free. Sorting by price_spread turns a raw duplicate list into a prioritised worklist, which is the answer an interviewer remembers.',
    },
  ],
};
