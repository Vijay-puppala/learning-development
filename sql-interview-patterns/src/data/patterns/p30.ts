import type { Pattern } from '../types';

export const p30: Pattern = {
  num: 30,
  slug: 'latest-record-per-group',
  title: 'Latest Record Per Group',
  concept: 'ROW_NUMBER()',
  category: 'Ranking & Top-N',
  tagline: 'The most common query in production analytics. Four ways to write it; know why you picked yours.',
  theory: `"The latest row per key" — current status per order, most recent price per product, last login per user — is probably the single most-written analytical query. There are four idioms and they are not interchangeable.

**ROW_NUMBER + filter** is the default. One window pass, exactly one row per group, and you keep every column. The ordering must be total (add the primary key) or the "latest" row is arbitrary among ties.

**Correlated subquery on MAX(date)** reads naturally but returns *all* rows tied on the maximum — often two rows where you wanted one — and can re-scan per group.

**DISTINCT ON** (PostgreSQL) is the shortest correct form and very fast, but non-portable.

**LEFT JOIN self-anti-join** — join the table to itself looking for a later row and keep rows where none exists — is the pre-window classic, worth recognising in legacy code.

The trap that unites them: with a date-only column, several rows commonly share the maximum. Whatever idiom you choose, state your tiebreaker.`,
  pitfalls: [
    'No tiebreaker in the ordering, so "latest" is non-deterministic when two rows share a timestamp.',
    'MAX(date) subquery returning several rows per group when ties exist, silently inflating the result.',
    'Filtering rows in WHERE before the window, which changes which row is "latest".',
    'Using DISTINCT ON without ORDER BY starting with the same expressions — PostgreSQL requires it.',
    'Assuming the latest row has the maximum id. Insertion order and business date are not the same thing.',
  ],
  questions: [
    {
      id: 'p30-q1',
      difficulty: 'easy',
      prompt: 'Return each customer\'s most recent order.',
      tables: ['orders'],
      think: 'Two orders on the same date — which one is "most recent", and can you answer that from the data alone?',
      hint: 'Add order_id DESC as the tiebreaker so the answer is deterministic.',
      approach: `Partition by customer_id.\nOrder by order_date descending with order_id descending as the tiebreaker.\nNumber the rows and keep number 1.\nReturn the whole order row.`,
      solution: `WITH ranked AS (
    SELECT order_id, customer_id, order_date, amount, status,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date DESC, order_id DESC) AS rn
    FROM orders
)
SELECT order_id, customer_id, order_date, amount, status
FROM ranked
WHERE rn = 1
ORDER BY customer_id;`,
      explanation: 'ROW_NUMBER guarantees exactly one row per customer even when two orders share a date, which is what makes this the safe default. The CTE is structural, not stylistic — a window result cannot be filtered in the SELECT that defines it.',
    },
    {
      id: 'p30-q2',
      difficulty: 'easy',
      prompt: 'Write the same query with a correlated MAX subquery, and say when it differs.',
      tables: ['orders'],
      think: 'If a customer has two orders on the same latest date, how many rows does this version return?',
      hint: 'Two. The MAX form has no tiebreaker.',
      approach: `Select from orders.\nKeep rows whose order_date equals the maximum order_date for that customer.\nNote that ties produce several rows.\nDecide whether that is acceptable for the use case.`,
      solution: `SELECT o.order_id, o.customer_id, o.order_date, o.amount, o.status
FROM orders AS o
WHERE o.order_date = (
    SELECT MAX(o2.order_date)
    FROM orders AS o2
    WHERE o2.customer_id = o.customer_id
)
ORDER BY o.customer_id, o.order_id;`,
      explanation: 'This returns every row tied on the maximum date, so a customer with two same-day orders appears twice — which breaks any downstream join that assumes one row per customer. It is readable and fine when the date column is a full timestamp with practical uniqueness, and wrong when it is a date.',
    },
    {
      id: 'p30-q3',
      difficulty: 'medium',
      prompt: 'Write the PostgreSQL DISTINCT ON version.',
      tables: ['orders'],
      think: 'DISTINCT ON keeps the first row per group. What defines "first"?',
      hint: 'The ORDER BY, which must begin with the same expressions as the DISTINCT ON list.',
      approach: `Use DISTINCT ON with the grouping key.\nOrder by that same key first, then by the recency ordering.\nPostgreSQL keeps the first row of each group under that ordering.\nReturn the whole row with no CTE.`,
      solution: `SELECT DISTINCT ON (customer_id)
       order_id, customer_id, order_date, amount, status
FROM orders
ORDER BY customer_id, order_date DESC, order_id DESC;`,
      explanation: 'DISTINCT ON is the shortest correct form and often the fastest, because it can stop at the first row of each group rather than numbering all of them. The catch is that the ORDER BY must start with the DISTINCT ON expressions, and it exists only in PostgreSQL.',
      dialect: 'DISTINCT ON is PostgreSQL only. The portable equivalent is the ROW_NUMBER form.',
    },
    {
      id: 'p30-q4',
      difficulty: 'medium',
      prompt: 'Write the anti-join version: keep rows for which no later row exists.',
      tables: ['orders'],
      think: 'What makes a row the latest? Nothing comes after it. How do you say that in SQL?',
      hint: 'NOT EXISTS a row with the same customer and a strictly greater sort key.',
      approach: `Select from orders.\nTest for the existence of another row for the same customer with a greater composite sort key.\nKeep rows where none exists.\nUse a row-value comparison so the tiebreaker is included.`,
      solution: `SELECT o.order_id, o.customer_id, o.order_date, o.amount
FROM orders AS o
WHERE NOT EXISTS (
    SELECT 1
    FROM orders AS later
    WHERE later.customer_id = o.customer_id
      AND (later.order_date, later.order_id) > (o.order_date, o.order_id)
)
ORDER BY o.customer_id;`,
      explanation: 'Including order_id in the row-value comparison restores the tiebreaker the MAX version lacked, so this returns exactly one row per customer. It is the pre-window-function idiom and still shows up in older codebases — recognising it is worth as much as writing it.',
      dialect: 'Row-value comparison is PostgreSQL / MySQL. SQL Server needs it expanded into an OR of two conditions.',
    },
    {
      id: 'p30-q5',
      difficulty: 'medium',
      prompt: 'Return each product\'s most recent sale, including products that have never sold.',
      tables: ['products', 'sales'],
      think: 'The window only sees rows that exist. Where does a never-sold product come from?',
      hint: 'Rank the sales, then LEFT JOIN from products onto the rank-1 rows.',
      approach: `Number each product's sales newest-first in a CTE.\nLEFT JOIN from products onto that CTE, restricted to rank 1 in the ON clause.\nProducts with no sales get NULLs.\nLabel them explicitly.`,
      solution: `WITH latest AS (
    SELECT product_id, sale_id, sale_date, amount,
           ROW_NUMBER() OVER (PARTITION BY product_id
                              ORDER BY sale_date DESC, sale_id DESC) AS rn
    FROM sales
)
SELECT p.product_id,
       p.product_name,
       l.sale_date AS last_sale_date,
       l.amount    AS last_sale_amount,
       CASE WHEN l.sale_id IS NULL THEN 'never sold' END AS note
FROM products AS p
LEFT JOIN latest AS l
       ON l.product_id = p.product_id
      AND l.rn = 1
ORDER BY l.sale_date DESC NULLS LAST;`,
      explanation: 'The rn = 1 predicate must sit in the ON clause — in WHERE it would discard the NULL-extended rows and silently turn the LEFT JOIN into an inner one, dropping exactly the products the question asked to include.',
    },
    {
      id: 'p30-q6',
      difficulty: 'medium',
      prompt: 'Return the latest order per customer per status — the most recent delivered order and the most recent cancelled one, separately.',
      tables: ['orders'],
      think: 'The partition now has two keys. Does that change anything beyond the PARTITION BY list?',
      hint: 'No — a composite partition is just a longer list.',
      approach: `Partition by customer_id and status together.\nOrder by date descending within each partition.\nKeep number 1 from each.\nReturn one row per customer per status.`,
      solution: `WITH ranked AS (
    SELECT order_id, customer_id, status, order_date, amount,
           ROW_NUMBER() OVER (PARTITION BY customer_id, status
                              ORDER BY order_date DESC, order_id DESC) AS rn
    FROM orders
)
SELECT customer_id, status, order_id, order_date, amount
FROM ranked
WHERE rn = 1
ORDER BY customer_id, status;`,
      explanation: 'Widening the partition changes the grain of the answer from one row per customer to one row per customer per status. Being precise about the partition list is how you make sure you answer the question that was asked rather than a neighbouring one.',
    },
    {
      id: 'p30-q7',
      difficulty: 'hard',
      prompt: 'Return each customer\'s latest order alongside their previous one, in a single row.',
      tables: ['orders'],
      think: 'You need positions 1 and 2 of the same partition on one row. What collapses two rows into one?',
      hint: 'Rank, keep the top two, then pivot with conditional aggregation.',
      approach: `Number each customer's orders newest-first.\nKeep the first two.\nGroup by customer and pivot the two ranks into columns.\nCompute the change between them.`,
      solution: `WITH ranked AS (
    SELECT customer_id, order_id, order_date, amount,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date DESC, order_id DESC) AS rn
    FROM orders
)
SELECT customer_id,
       MAX(CASE WHEN rn = 1 THEN order_date END) AS latest_date,
       MAX(CASE WHEN rn = 1 THEN amount     END) AS latest_amount,
       MAX(CASE WHEN rn = 2 THEN order_date END) AS previous_date,
       MAX(CASE WHEN rn = 2 THEN amount     END) AS previous_amount,
       MAX(CASE WHEN rn = 1 THEN amount     END)
     - MAX(CASE WHEN rn = 2 THEN amount     END) AS change
FROM ranked
WHERE rn <= 2
GROUP BY customer_id
ORDER BY change DESC NULLS LAST;`,
      explanation: 'MAX(CASE WHEN ...) is a pivot, not a maximum — each CASE is NULL except on the one row that matches, so MAX simply picks it. A customer with a single order gets NULL in the previous columns and a NULL change, which is correct rather than zero.',
    },
    {
      id: 'p30-q8',
      difficulty: 'hard',
      prompt: 'Return each customer\'s latest order, but only considering orders that were not cancelled, while still reporting whether their true latest order was a cancellation.',
      tables: ['orders'],
      think: 'A filter before the window changes what "latest" means. How do you compute both meanings?',
      hint: 'Two windows over different row sets: one over all orders, one restricted with a conditional ordering.',
      approach: `Number all orders per customer newest-first for the unrestricted latest.\nIn the same pass, number only the non-cancelled orders by using a conditional ordering key.\nKeep the rows that are first under the restricted ordering.\nReport the unrestricted latest status alongside.`,
      solution: `WITH ranked AS (
    SELECT order_id, customer_id, order_date, amount, status,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date DESC, order_id DESC) AS rn_all,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY CASE WHEN status <> 'cancelled' THEN 0 ELSE 1 END,
                                       order_date DESC, order_id DESC) AS rn_valid,
           MAX(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)
             OVER (PARTITION BY customer_id
                   ORDER BY order_date DESC, order_id DESC
                   ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS ever_cancelled
    FROM orders
)
SELECT customer_id, order_id, order_date, amount, status,
       (rn_all = 1) AS is_also_overall_latest,
       ever_cancelled
FROM ranked
WHERE rn_valid = 1
  AND status <> 'cancelled'
ORDER BY customer_id;`,
      explanation: 'Sorting cancelled orders to the back of the partition with a CASE key lets one pass answer both questions, because a WHERE filter would have removed the information needed for the second. Putting a CASE expression in the window ORDER BY is a general technique for "prefer these rows, then order normally".',
    },
    {
      id: 'p30-q9',
      difficulty: 'hard',
      prompt: 'Return the current version of each customer from an SCD Type 2 dimension, using the date columns rather than the is_current flag.',
      tables: ['customer_dim'],
      think: 'Two ways to find the open row. Which one is more trustworthy, and why check both?',
      hint: 'The flag can go stale; the dates are the source of truth. Compare the two and report disagreements.',
      approach: `Number each business key's versions by start_date descending.\nKeep number 1 — the latest version by date.\nCompare that against the is_current flag.\nReport rows where the two disagree, since that indicates a maintenance bug.`,
      solution: `WITH versions AS (
    SELECT cust_key, customer_id, customer_name, city,
           start_date, end_date, is_current,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY start_date DESC, cust_key DESC) AS rn
    FROM customer_dim
)
SELECT customer_id,
       cust_key,
       customer_name,
       city,
       start_date,
       end_date,
       is_current,
       CASE WHEN is_current IS NOT TRUE
            THEN 'flag disagrees with dates' END AS integrity_issue
FROM versions
WHERE rn = 1
ORDER BY integrity_issue NULLS LAST, customer_id;`,
      explanation: 'The is_current flag is derived data that must be maintained on every load, so it drifts out of sync when a load fails partway; the start_date ordering is the underlying fact. Returning the latest version by date and flagging disagreements gives you both the answer and an audit in one query.',
    },
    {
      id: 'p30-q10',
      difficulty: 'hard',
      prompt: 'Compare the performance characteristics of the four idioms and say which you would ship.',
      tables: ['orders'],
      think: 'All four are correct given the right tiebreaker. What actually decides between them?',
      hint: 'Index availability, portability, and whether ties can occur.',
      approach: `Write all four forms against the same table.\nRun EXPLAIN ANALYZE on each.\nCompare how each uses an index on (customer_id, order_date).\nChoose based on portability and tie behaviour, not just speed.`,
      solution: `-- 1. ROW_NUMBER — portable, exactly one row per group, one sort
EXPLAIN ANALYZE
SELECT * FROM (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY customer_id
                                   ORDER BY order_date DESC, order_id DESC) AS rn
    FROM orders AS o
) AS r WHERE rn = 1;

-- 2. DISTINCT ON — PostgreSQL only, can stop early per group
EXPLAIN ANALYZE
SELECT DISTINCT ON (customer_id) * FROM orders
ORDER BY customer_id, order_date DESC, order_id DESC;

-- 3. Correlated MAX — readable, returns ties, may re-scan
EXPLAIN ANALYZE
SELECT o.* FROM orders AS o
WHERE o.order_date = (SELECT MAX(x.order_date) FROM orders AS x
                      WHERE x.customer_id = o.customer_id);

-- 4. Anti-join — portable, one row per group with a composite comparison
EXPLAIN ANALYZE
SELECT o.* FROM orders AS o
WHERE NOT EXISTS (SELECT 1 FROM orders AS l
                  WHERE l.customer_id = o.customer_id
                    AND (l.order_date, l.order_id) > (o.order_date, o.order_id));`,
      explanation: 'With an index on (customer_id, order_date DESC) the DISTINCT ON and anti-join forms can seek rather than sort, while ROW_NUMBER usually sorts the whole partition set. The honest recommendation is still ROW_NUMBER for portability and predictable tie handling, switching to DISTINCT ON when you know the engine is PostgreSQL and the table is large.',
    },
  ],
};
