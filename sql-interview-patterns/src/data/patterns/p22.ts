import type { Pattern } from '../types';

export const p22: Pattern = {
  num: 22,
  slug: 'products-never-sold',
  title: 'Products Never Sold',
  concept: 'NOT EXISTS',
  category: 'Joins & Set Logic',
  tagline: 'Anti-join from the dimension side, and the place to learn why NOT EXISTS beats NOT IN.',
  theory: `"Products never sold" is the anti-join asked from the catalog side. Structurally identical to pattern 21, but it is the standard vehicle for the NOT IN versus NOT EXISTS discussion, so treat it as the NULL-semantics pattern.

**Why NOT IN fails.** NOT IN expands to "<> ALL". If the subquery yields any NULL, then for every outer row the comparison against that NULL is UNKNOWN, the AND of the comparisons can never be TRUE, and the predicate filters out every row. The query returns zero rows and looks like "nothing matched" rather than "your query is broken". Worse, it is data-dependent: it works fine until the day a NULL lands in that column.

**Why NOT EXISTS is safe.** It asks whether a row exists, not whether values are unequal. A NULL in the subquery produces a row that simply fails the correlation condition; there is no three-valued-logic trap because no value comparison escapes the subquery.

**Why LEFT JOIN + IS NULL is also safe** — it tests row existence too, via the NULL-extension, not value equality.

Performance-wise all three usually compile to an anti-join. Correctness, not speed, is the reason to pick NOT EXISTS.`,
  pitfalls: [
    'NOT IN over a nullable column — the whole result silently becomes empty.',
    'Assuming "never sold" is the same as "sold zero units" — a sales row with quantity 0 still means the product was sold.',
    'Filtering the date range in the outer query instead of inside the subquery, which changes the question.',
    'Forgetting discontinued products, which inflate the "never sold" list with rows nobody can act on.',
    'Using COUNT(*) = 0 with a GROUP BY when no row exists to group — the group never appears at all.',
  ],
  questions: [
    {
      id: 'p22-q1',
      difficulty: 'easy',
      prompt: 'List products that have never appeared on an order line.',
      tables: ['products', 'order_items'],
      think: 'Which table supplies the rows in the answer, and what is the correlation key?',
      hint: 'Start from products and test for the absence of a matching order_items row.',
      approach: `Select from products, the side whose unmatched rows are the answer.\nInside a NOT EXISTS, look for an order_items row with the same product_id.\nKeep the products where none exists.\nReturn the catalog details.`,
      solution: `SELECT p.product_id,
       p.product_name,
       p.category,
       p.price
FROM products AS p
WHERE NOT EXISTS (
    SELECT 1
    FROM order_items AS oi
    WHERE oi.product_id = p.product_id
)
ORDER BY p.category, p.price DESC;`,
      explanation: 'The correlation condition inside the subquery is what ties it to the outer row; without it the subquery would be uncorrelated and the result would be all-or-nothing. SELECT 1 is conventional because EXISTS ignores the select list entirely.',
    },
    {
      id: 'p22-q2',
      difficulty: 'easy',
      prompt: 'Write the same query with a LEFT JOIN, and confirm both return the same rows.',
      tables: ['products', 'order_items'],
      think: 'Both forms test existence rather than equality. Does either risk duplicating rows?',
      hint: 'The LEFT JOIN form is safe here because only unmatched rows survive, and unmatched rows are never duplicated.',
      approach: `LEFT JOIN products to order_items on product_id.\nA product with no lines gets a single NULL-extended row.\nKeep those by testing the order_items key for NULL.\nCompare the row count against the NOT EXISTS version.`,
      solution: `SELECT p.product_id,
       p.product_name,
       p.category
FROM products AS p
LEFT JOIN order_items AS oi ON oi.product_id = p.product_id
WHERE oi.order_item_id IS NULL
ORDER BY p.category, p.product_name;`,
      explanation: 'Fan-out cannot affect this query: a product that matched many lines produces many rows, but all of them are discarded by the IS NULL test, and an unmatched product produces exactly one. That is why the LEFT JOIN anti-join is safe even against a duplicating right side.',
    },
    {
      id: 'p22-q3',
      difficulty: 'medium',
      prompt: 'Demonstrate the NOT IN failure: show why adding one NULL product_id to order_items empties the result.',
      tables: ['products', 'order_items'],
      think: 'What is "5 NOT IN (1, 2, NULL)" — true, false, or something else?',
      hint: 'UNKNOWN. And UNKNOWN is not TRUE, so the row is filtered out. Every row meets the same fate.',
      approach: `Write the NOT IN form.\nNote it expands to product_id <> 1 AND product_id <> 2 AND product_id <> NULL.\nThe last comparison is UNKNOWN, so the conjunction can never be TRUE.\nAdd an IS NOT NULL guard inside the subquery to repair it.`,
      solution: `-- BROKEN whenever order_items.product_id contains a NULL:
-- SELECT * FROM products
-- WHERE product_id NOT IN (SELECT product_id FROM order_items);

-- Repaired by excluding NULLs from the subquery:
SELECT p.product_id, p.product_name
FROM products AS p
WHERE p.product_id NOT IN (
    SELECT oi.product_id
    FROM order_items AS oi
    WHERE oi.product_id IS NOT NULL
)
ORDER BY p.product_id;`,
      explanation: 'The repair works, but it depends on every future maintainer remembering the guard — which is why the real recommendation is to stop writing NOT IN against subqueries entirely. NOT IN against a literal list with no NULLs is still perfectly fine.',
    },
    {
      id: 'p22-q4',
      difficulty: 'medium',
      prompt: 'Find products with no sales in the last 12 months, including those never sold at all.',
      tables: ['products', 'sales'],
      think: 'A time window inside an anti-test. Does the window belong inside the subquery or outside it?',
      hint: 'Inside. Outside, it would filter products rather than sales.',
      approach: `Select from products.\nInside NOT EXISTS, look for a sale for that product within the last 12 months.\nKeep the products where none exists.\nAdd the last-ever sale date so never-sold and lapsed products can be told apart.`,
      solution: `SELECT p.product_id,
       p.product_name,
       p.category,
       (SELECT MAX(s2.sale_date) FROM sales AS s2
        WHERE s2.product_id = p.product_id) AS last_sold,
       CASE WHEN NOT EXISTS (SELECT 1 FROM sales AS s3 WHERE s3.product_id = p.product_id)
            THEN 'never sold' ELSE 'lapsed' END AS status
FROM products AS p
WHERE NOT EXISTS (
    SELECT 1
    FROM sales AS s
    WHERE s.product_id = p.product_id
      AND s.sale_date >= CURRENT_DATE - INTERVAL '12 months'
)
ORDER BY status, last_sold DESC NULLS LAST;`,
      explanation: 'The time window must live inside the subquery, where it restricts which sales count as a match. Splitting the result into "never sold" and "lapsed" matters commercially: one is a listing problem, the other is a demand problem.',
    },
    {
      id: 'p22-q5',
      difficulty: 'medium',
      prompt: 'Find products never sold in a specific region, but sold elsewhere.',
      tables: ['products', 'sales'],
      think: 'One EXISTS and one NOT EXISTS over the same table with different filters. What do they share?',
      hint: 'Both correlate on product_id; only the region predicate differs.',
      approach: `Select from products.\nRequire that a sale exists for the product in some region other than the target.\nRequire that no sale exists for the product in the target region.\nReturn the revenue earned elsewhere as the size of the opportunity.`,
      solution: `SELECT p.product_id,
       p.product_name,
       (SELECT COALESCE(SUM(s2.amount), 0) FROM sales AS s2
        WHERE s2.product_id = p.product_id) AS revenue_elsewhere
FROM products AS p
WHERE EXISTS (
        SELECT 1 FROM sales AS s
        WHERE s.product_id = p.product_id
          AND s.region <> 'North'
      )
  AND NOT EXISTS (
        SELECT 1 FROM sales AS s
        WHERE s.product_id = p.product_id
          AND s.region = 'North'
      )
ORDER BY revenue_elsewhere DESC;`,
      explanation: 'A product that sells well in three regions and not at all in a fourth is a distribution gap, not a dud — which is exactly what the EXISTS half establishes. Quantifying revenue_elsewhere turns the list into a prioritised expansion plan.',
    },
    {
      id: 'p22-q6',
      difficulty: 'medium',
      prompt: 'Find categories in which no product has ever sold.',
      tables: ['products', 'sales'],
      think: 'The anti-test is now at group level rather than row level. What does the subquery correlate on?',
      hint: 'Correlate the subquery on the category through a join to products.',
      approach: `List the distinct categories from products.\nFor each, test whether any sale exists for any product in that category.\nKeep the categories where none does.\nCount how many products are affected.`,
      solution: `SELECT p.category,
       COUNT(*) AS products_in_category
FROM products AS p
GROUP BY p.category
HAVING NOT EXISTS (
    SELECT 1
    FROM sales    AS s
    JOIN products AS p2 ON p2.product_id = s.product_id
    WHERE p2.category = p.category
)
ORDER BY products_in_category DESC;`,
      explanation: 'A correlated NOT EXISTS is legal in HAVING, where it is evaluated once per group rather than once per row. The equivalent formulation — aggregate sales per category and anti-join — is also fine and often easier to read; both are worth knowing.',
    },
    {
      id: 'p22-q7',
      difficulty: 'hard',
      prompt: 'Find products that were sold historically but have had no sales since a competitor launched on 2024-06-01.',
      tables: ['products', 'sales'],
      think: 'Two windows on the same table, one requiring presence and one requiring absence. Do the boundaries overlap?',
      hint: 'EXISTS before the date, NOT EXISTS on or after it. The two windows must be disjoint.',
      approach: `Require that at least one sale exists strictly before the cut-off date.\nRequire that no sale exists on or after that date.\nKeep only products satisfying both.\nQuantify the pre-cut-off revenue that has been lost.`,
      solution: `SELECT p.product_id,
       p.product_name,
       (SELECT SUM(s2.amount) FROM sales AS s2
        WHERE s2.product_id = p.product_id
          AND s2.sale_date  < DATE '2024-06-01') AS revenue_before,
       (SELECT MAX(s3.sale_date) FROM sales AS s3
        WHERE s3.product_id = p.product_id)      AS last_sale
FROM products AS p
WHERE EXISTS (
        SELECT 1 FROM sales AS s
        WHERE s.product_id = p.product_id
          AND s.sale_date  < DATE '2024-06-01'
      )
  AND NOT EXISTS (
        SELECT 1 FROM sales AS s
        WHERE s.product_id = p.product_id
          AND s.sale_date >= DATE '2024-06-01'
      )
ORDER BY revenue_before DESC NULLS LAST;`,
      explanation: 'Using < and >= against the same boundary makes the two windows exactly disjoint and exactly exhaustive — mixing <= and >= would let a sale on the cut-off date satisfy both and produce an empty result. Half-open intervals are the habit that prevents this class of bug everywhere dates are involved.',
    },
    {
      id: 'p22-q8',
      difficulty: 'hard',
      prompt: 'Find products in the catalog that have never been sold, and compare their average price against the average price of products that do sell.',
      tables: ['products', 'order_items'],
      think: 'The comparison is between two populations defined by an anti-test. How do you get both onto one row?',
      hint: 'Flag each product as sold or unsold, then aggregate conditionally over the flag.',
      approach: `For every product, compute a boolean flag for whether any order line exists.\nGroup the whole catalog into one row.\nConditionally count and average the price within each flag value.\nReturn both populations side by side.`,
      solution: `WITH flagged AS (
    SELECT p.product_id,
           p.price,
           EXISTS (SELECT 1 FROM order_items AS oi
                   WHERE oi.product_id = p.product_id) AS has_sold
    FROM products AS p
)
SELECT COUNT(*) FILTER (WHERE NOT has_sold)                 AS never_sold_count,
       ROUND(AVG(price) FILTER (WHERE NOT has_sold), 2)     AS never_sold_avg_price,
       COUNT(*) FILTER (WHERE has_sold)                     AS sold_count,
       ROUND(AVG(price) FILTER (WHERE has_sold), 2)         AS sold_avg_price,
       ROUND(AVG(price) FILTER (WHERE NOT has_sold)
           - AVG(price) FILTER (WHERE has_sold), 2)         AS price_gap
FROM flagged;`,
      explanation: 'EXISTS used in the SELECT list returns a boolean, which turns an anti-join into a per-row attribute you can aggregate over. If never-sold products are systematically more expensive, the answer is a pricing problem rather than a merchandising one — which is the insight the query is built to surface.',
    },
    {
      id: 'p22-q9',
      difficulty: 'hard',
      prompt: 'Find products that have never been sold together with product 101 on the same order.',
      tables: ['products', 'order_items'],
      think: 'The anti-test is about co-occurrence within a group, not about the existence of a row. What identifies the group?',
      hint: 'The order_id. Look for an order containing both the candidate product and product 101.',
      approach: `Select from products, excluding product 101 itself.\nInside NOT EXISTS, join order_items to itself on order_id.\nRequire one side to be the candidate product and the other to be 101.\nKeep candidates for which no such order exists.`,
      solution: `SELECT p.product_id,
       p.product_name,
       (SELECT COUNT(DISTINCT oi.order_id) FROM order_items AS oi
        WHERE oi.product_id = p.product_id) AS orders_containing_it
FROM products AS p
WHERE p.product_id <> 101
  AND NOT EXISTS (
      SELECT 1
      FROM order_items AS a
      JOIN order_items AS b ON b.order_id = a.order_id
      WHERE a.product_id = p.product_id
        AND b.product_id = 101
  )
ORDER BY orders_containing_it DESC;`,
      explanation: 'The self-join inside the subquery is what expresses "on the same order": one alias anchors the candidate, the other anchors product 101, and they share an order_id. Sorting by how often the candidate does sell separates "never co-occurs because it is popular and unrelated" from "never co-occurs because it barely sells".',
    },
    {
      id: 'p22-q10',
      difficulty: 'hard',
      prompt: 'Produce a catalog health report: total products, never sold, sold but not in the last 90 days, and actively selling, as one row with percentages.',
      tables: ['products', 'sales'],
      think: 'Three mutually exclusive states from two existence tests. How do you make sure a product lands in exactly one bucket?',
      hint: 'Compute the last sale date per product once, then derive the state from it with a CASE chain.',
      approach: `LEFT JOIN products to sales and aggregate to one row per product carrying the last sale date.\nDerive a single state from that date with a CASE chain, ordered so the buckets are exclusive.\nAggregate over the states to count each one.\nDivide by the total for percentages.`,
      solution: `WITH product_state AS (
    SELECT p.product_id,
           MAX(s.sale_date) AS last_sold,
           CASE WHEN MAX(s.sale_date) IS NULL                                 THEN 'never sold'
                WHEN MAX(s.sale_date) < CURRENT_DATE - INTERVAL '90 days'     THEN 'stale'
                ELSE                                                               'active'
           END AS state
    FROM products AS p
    LEFT JOIN sales AS s ON s.product_id = p.product_id
    GROUP BY p.product_id
)
SELECT COUNT(*)                                      AS products_total,
       COUNT(*) FILTER (WHERE state = 'never sold')  AS never_sold,
       COUNT(*) FILTER (WHERE state = 'stale')       AS stale_90d,
       COUNT(*) FILTER (WHERE state = 'active')      AS active,
       ROUND(100.0 * COUNT(*) FILTER (WHERE state = 'active')
             / NULLIF(COUNT(*), 0), 1)               AS active_pct
FROM product_state;`,
      explanation: 'Reducing to one row per product with a single state column is what guarantees the buckets are mutually exclusive and sum to the total — three independent EXISTS tests could double-count. The CASE arms must be ordered with the NULL test first, or never-sold products fall through into "stale".',
    },
  ],
};
