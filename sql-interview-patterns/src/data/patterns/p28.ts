import type { Pattern } from '../types';

export const p28: Pattern = {
  num: 28,
  slug: 'fast-dimension-lookup',
  title: 'Fast Dimension Lookup',
  concept: 'LEFT JOIN',
  category: 'Joins & Set Logic',
  tagline: 'Decorate facts with dimension attributes without losing a single fact row.',
  theory: `A star schema separates facts (sales, orders, events) from dimensions (products, customers, dates). Reporting means joining them back together, and the default should be a **LEFT JOIN from the fact to the dimension**.

Why left rather than inner: a fact row with a missing or unmatched dimension key is still a real transaction carrying real revenue. An inner join deletes it from the report silently. A LEFT JOIN keeps it with NULL attributes, where COALESCE can label it "Unknown" and the total still reconciles. Losing revenue to a join is the kind of bug that survives for quarters.

Three things make a dimension lookup fast. The join key should be indexed on the dimension side — usually free, since it is the primary key. The dimension should be **unique on the join key**, or the join fans out and multiplies the facts. And filters on dimension attributes should go in WHERE only when you genuinely want to drop the unmatched facts; otherwise they belong in ON.

For an SCD Type 2 dimension the join is no longer an equality: you must also constrain the fact date to the version's validity window, or one fact matches every historical version.`,
  pitfalls: [
    'Inner-joining facts to dimensions and silently dropping facts with unmatched keys.',
    'Joining to a dimension that is not unique on the key, multiplying fact rows and inflating every measure.',
    'Filtering on a dimension attribute in WHERE after a LEFT JOIN, which converts it to an inner join.',
    'Forgetting the validity-window predicate on an SCD Type 2 dimension.',
    'Leaving NULLs in the report instead of labelling them, so "Unknown" revenue is invisible.',
  ],
  questions: [
    {
      id: 'p28-q1',
      difficulty: 'easy',
      prompt: 'Report sales revenue by product name, keeping sales whose product is missing from the catalog.',
      tables: ['sales', 'products'],
      think: 'What happens to the revenue total if a sale references a product that was deleted?',
      hint: 'LEFT JOIN from the fact, and COALESCE the name so the row is visible rather than blank.',
      approach: `Start from sales, the fact table.\nLEFT JOIN products so unmatched sales survive.\nCOALESCE the product name to an explicit Unknown label.\nGroup by that label and sum the revenue.`,
      solution: `SELECT COALESCE(p.product_name, '(unknown product)') AS product,
       COUNT(*)    AS sales_count,
       SUM(s.amount) AS revenue
FROM sales AS s
LEFT JOIN products AS p ON p.product_id = s.product_id
GROUP BY COALESCE(p.product_name, '(unknown product)')
ORDER BY revenue DESC;`,
      explanation: 'The "(unknown product)" bucket is the point: with an inner join that revenue would simply be absent and the report total would not match the source system. A visible unknown bucket is both a correct total and a data-quality alert.',
    },
    {
      id: 'p28-q2',
      difficulty: 'easy',
      prompt: 'Quantify how much revenue would be lost by using an inner join instead.',
      tables: ['sales', 'products'],
      think: 'What is the difference between the two totals, and would anyone notice it in a dashboard?',
      hint: 'Compare SUM over all sales against SUM over sales with a matching product.',
      approach: `Compute the total revenue over the raw fact table.\nCompute the revenue that survives an inner join to the dimension.\nSubtract to get the amount an inner join would hide.\nExpress it as a percentage of the true total.`,
      solution: `SELECT SUM(s.amount)                                        AS true_revenue,
       SUM(CASE WHEN p.product_id IS NOT NULL THEN s.amount END) AS revenue_after_inner_join,
       SUM(CASE WHEN p.product_id IS NULL     THEN s.amount END) AS revenue_lost,
       ROUND(100.0 * SUM(CASE WHEN p.product_id IS NULL THEN s.amount END)
             / NULLIF(SUM(s.amount), 0), 2)                   AS pct_lost
FROM sales AS s
LEFT JOIN products AS p ON p.product_id = s.product_id;`,
      explanation: 'Running this check after every new join is a cheap habit that catches an entire class of silent reporting bug. A non-zero pct_lost is either a referential-integrity problem to fix or a deliberate exclusion to document — never something to leave unexplained.',
    },
    {
      id: 'p28-q3',
      difficulty: 'medium',
      prompt: 'Report orders by customer country, but only for European countries, keeping orders with no customer record.',
      tables: ['orders', 'customers'],
      think: 'A filter on the dimension, but unmatched facts must survive. Where does the filter go?',
      hint: 'In the ON clause. In WHERE it would delete the NULL-extended rows.',
      approach: `LEFT JOIN orders to customers, restricting the match to European countries inside the ON clause.\nOrders whose customer is non-European or missing entirely both get NULLs.\nCOALESCE the country into a labelled bucket.\nGroup and sum.`,
      solution: `SELECT COALESCE(c.country, '(not matched / non-EU)') AS country,
       COUNT(*)      AS orders,
       SUM(o.amount) AS revenue
FROM orders AS o
LEFT JOIN customers AS c
       ON c.customer_id = o.customer_id
      AND c.country IN ('UK', 'France', 'Germany', 'Spain', 'Italy')
GROUP BY COALESCE(c.country, '(not matched / non-EU)')
ORDER BY revenue DESC;`,
      explanation: 'Putting the country filter in ON makes the join answer "match me only to European customers" while keeping every order row. In WHERE, the NULL-extended rows would fail the IN test and the query would quietly become an inner join, dropping both the non-European and the orphaned orders.',
    },
    {
      id: 'p28-q4',
      difficulty: 'medium',
      prompt: 'Verify that the products dimension is unique on product_id before joining to it.',
      tables: ['products', 'sales'],
      think: 'What would a duplicated dimension row do to a revenue figure?',
      hint: 'Double it. Check before you join, not after the numbers look odd.',
      approach: `Group the dimension by its supposed key.\nCount the rows in each group.\nKeep the groups with more than one row.\nIf any exist, the join will fan out and the dimension must be deduplicated first.`,
      solution: `SELECT product_id,
       COUNT(*) AS duplicate_rows
FROM products
GROUP BY product_id
HAVING COUNT(*) > 1
ORDER BY duplicate_rows DESC;

-- If this returns rows, every fact joined to them is multiplied.
-- Deduplicate first, e.g. keep the newest version per key with ROW_NUMBER.`,
      explanation: 'A dimension duplicated on its key multiplies every fact that joins to it, so revenue rises with no error and no obvious cause. Checking key uniqueness is a five-second query and it belongs in the pipeline as an assertion, not just in your head.',
    },
    {
      id: 'p28-q5',
      difficulty: 'medium',
      prompt: 'Join sales to a deduplicated products dimension, keeping only the most recently updated row per product.',
      tables: ['sales', 'products'],
      think: 'A duplicated dimension must be reduced to one row per key before the join. What decides which row wins?',
      hint: 'ROW_NUMBER over the key with a deterministic ordering, then keep rn = 1.',
      approach: `Number the dimension rows within each product_id by a recency ordering.\nKeep only number 1 to guarantee one row per key.\nLEFT JOIN the facts to that deduplicated dimension.\nThe join is now provably many-to-one.`,
      solution: `WITH dim AS (
    SELECT product_id, product_name, category, price,
           ROW_NUMBER() OVER (PARTITION BY product_id
                              ORDER BY price DESC, product_name) AS rn
    FROM products
)
SELECT COALESCE(d.category, '(unknown)') AS category,
       COUNT(*)      AS sales_count,
       SUM(s.amount) AS revenue
FROM sales AS s
LEFT JOIN dim AS d
       ON d.product_id = s.product_id
      AND d.rn = 1
GROUP BY COALESCE(d.category, '(unknown)')
ORDER BY revenue DESC;`,
      explanation: 'Deduplicating in a CTE makes the fan-out impossible by construction rather than compensating for it with DISTINCT downstream. Note d.rn = 1 sits in the ON clause, not WHERE — in WHERE it would eliminate the NULL-extended rows and undo the LEFT JOIN.',
    },
    {
      id: 'p28-q6',
      difficulty: 'medium',
      prompt: 'Decorate order lines with both product and customer attributes in one query.',
      tables: ['order_items', 'orders', 'products', 'customers'],
      think: 'Three lookups from one fact. Does the grain change at any step?',
      hint: 'Each lookup is many-to-one on a unique key, so the grain stays at one row per line.',
      approach: `Start from order_items, the finest grain.\nLEFT JOIN orders for the header attributes.\nLEFT JOIN products and customers for their attributes.\nConfirm the output row count equals the order_items row count.`,
      solution: `SELECT oi.order_item_id,
       o.order_date,
       COALESCE(c.customer_name, '(unknown customer)') AS customer,
       COALESCE(c.country,       '(unknown)')          AS country,
       COALESCE(p.product_name,  '(unknown product)')  AS product,
       COALESCE(p.category,      '(unknown)')          AS category,
       oi.quantity,
       oi.unit_price,
       oi.quantity * oi.unit_price AS line_revenue
FROM order_items AS oi
LEFT JOIN orders    AS o ON o.order_id    = oi.order_id
LEFT JOIN customers AS c ON c.customer_id = o.customer_id
LEFT JOIN products  AS p ON p.product_id  = oi.product_id
ORDER BY o.order_date DESC, oi.order_item_id;`,
      explanation: 'Chaining LEFT JOINs from the fact outwards is the standard star-schema decoration, and the row count should equal the fact row count exactly — if it does not, one of the dimensions is not unique on its key. Note that the customer join goes through orders, so an orphaned order loses the customer too.',
    },
    {
      id: 'p28-q7',
      difficulty: 'hard',
      prompt: 'Join sales to an SCD Type 2 customer dimension so each sale gets the attributes that were current on its sale date.',
      tables: ['sales', 'customer_dim'],
      think: 'The dimension has several rows per business key. What stops a sale matching all of them?',
      hint: 'Add the validity window to the ON clause, using half-open bounds.',
      approach: `Join the fact to the dimension on the business key.\nAdd a condition that the sale date falls within the version's validity window.\nUse half-open bounds so a sale on a boundary date matches exactly one version.\nLEFT JOIN so sales with no matching version survive.`,
      solution: `SELECT s.sale_id,
       s.sale_date,
       s.amount,
       COALESCE(d.customer_name, '(no version in effect)') AS customer_as_of_sale,
       d.city                                             AS city_as_of_sale,
       d.start_date,
       d.end_date
FROM sales AS s
LEFT JOIN customer_dim AS d
       ON d.customer_id = s.product_id        -- business key join
      AND s.sale_date  >= d.start_date
      AND s.sale_date  <  COALESCE(d.end_date, DATE '9999-12-31')
ORDER BY s.sale_date;`,
      explanation: 'Without the date predicates every sale matches every historical version and the fact table is multiplied by the version count. Half-open bounds (>= start, < end) guarantee exactly one match, where inclusive bounds on both ends would double-match on the changeover date.',
    },
    {
      id: 'p28-q8',
      difficulty: 'hard',
      prompt: 'Report revenue by category with a date-dimension style breakdown by year and quarter, including dates with no sales.',
      tables: ['sales', 'products'],
      think: 'A missing period is a missing row, not a zero. What supplies the periods the facts do not cover?',
      hint: 'Generate a period spine and CROSS JOIN it against the categories, then LEFT JOIN the facts.',
      approach: `Generate every quarter in the reporting range.\nCROSS JOIN those quarters against the distinct categories to build the full expected grid.\nLEFT JOIN the aggregated sales onto the grid.\nCOALESCE missing revenue to zero.`,
      solution: `WITH quarters AS (
    SELECT generate_series(DATE '2024-01-01', DATE '2024-10-01', INTERVAL '3 months')::date AS qtr
),
cats AS (
    SELECT DISTINCT category FROM products WHERE category IS NOT NULL
),
grid AS (
    SELECT c.category, q.qtr
    FROM cats AS c CROSS JOIN quarters AS q
),
actual AS (
    SELECT p.category,
           DATE_TRUNC('quarter', s.sale_date)::date AS qtr,
           SUM(s.amount) AS revenue
    FROM sales    AS s
    JOIN products AS p ON p.product_id = s.product_id
    GROUP BY p.category, DATE_TRUNC('quarter', s.sale_date)
)
SELECT g.category,
       g.qtr,
       COALESCE(a.revenue, 0) AS revenue
FROM grid AS g
LEFT JOIN actual AS a
       ON a.category = g.category
      AND a.qtr      = g.qtr
ORDER BY g.category, g.qtr;`,
      explanation: 'The CROSS JOIN builds every category-quarter combination that *should* exist, and the LEFT JOIN fills in what actually happened — a quarter with no sales becomes an explicit zero rather than a gap in the chart. This grid-plus-outer-join shape is the general answer to every "include periods with no data" request.',
    },
    {
      id: 'p28-q9',
      difficulty: 'hard',
      prompt: 'Compare the cost of a lookup done as a correlated scalar subquery versus a LEFT JOIN.',
      tables: ['sales', 'products'],
      think: 'A scalar subquery returns one value per row. What does that cost on a large fact table?',
      hint: 'A join is set-based; a correlated subquery can be evaluated per row unless the planner rewrites it.',
      approach: `Write the lookup as a correlated scalar subquery in the SELECT list.\nWrite the same lookup as a LEFT JOIN.\nCompare the plans with EXPLAIN ANALYZE.\nNote that a scalar subquery can only return one column, so each extra attribute costs another subquery.`,
      solution: `EXPLAIN ANALYZE
SELECT s.sale_id,
       (SELECT p.product_name FROM products AS p
        WHERE p.product_id = s.product_id) AS product_name,
       (SELECT p.category     FROM products AS p
        WHERE p.product_id = s.product_id) AS category
FROM sales AS s;

EXPLAIN ANALYZE
SELECT s.sale_id, p.product_name, p.category
FROM sales AS s
LEFT JOIN products AS p ON p.product_id = s.product_id;`,
      explanation: 'The join fetches every needed attribute in one pass, while each scalar subquery is a separate lookup — two attributes means two probes per fact row. Modern planners often flatten a single scalar subquery into a join, but they rarely merge two, so the join is both faster and the clearer statement of intent.',
    },
    {
      id: 'p28-q10',
      difficulty: 'hard',
      prompt: 'Build a lookup that falls back through a hierarchy: use the product-specific price if present, otherwise the category default, otherwise a global default.',
      tables: ['sales', 'products'],
      think: 'Three candidate sources in priority order. What expresses "first non-NULL wins"?',
      hint: 'LEFT JOIN each level, then COALESCE across them in priority order.',
      approach: `LEFT JOIN the product-level lookup.\nLEFT JOIN a category-level aggregate as the second fallback.\nCOALESCE across product price, category average and a literal global default.\nLabel which level supplied the value so the fallback rate is measurable.`,
      solution: `WITH category_default AS (
    SELECT category, AVG(price) AS avg_price
    FROM products
    WHERE price IS NOT NULL
    GROUP BY category
)
SELECT s.sale_id,
       s.product_id,
       COALESCE(p.price, cd.avg_price, 9.99) AS effective_price,
       CASE WHEN p.price      IS NOT NULL THEN 'product'
            WHEN cd.avg_price IS NOT NULL THEN 'category default'
            ELSE                               'global default'
       END AS price_source
FROM sales AS s
LEFT JOIN products         AS p  ON p.product_id = s.product_id
LEFT JOIN category_default AS cd ON cd.category  = p.category
ORDER BY price_source, s.sale_id;`,
      explanation: 'COALESCE evaluates left to right and stops at the first non-NULL, which is exactly a priority chain. The price_source column is what makes the fallback auditable — if most rows are landing on the global default, the dimension has a coverage problem that a bare COALESCE would have hidden.',
    },
  ],
};
