import type { Pattern } from '../types';

export const p20: Pattern = {
  num: 20,
  slug: 'pivot-unpivot-data',
  title: 'Pivot / Unpivot Data',
  concept: 'PIVOT / UNPIVOT',
  category: 'Reshaping & Text',
  tagline: 'Rows to columns and back. The portable answer is CASE, not the PIVOT keyword.',
  theory: `Pivoting turns distinct values of one column into columns of their own. Unpivoting does the reverse, folding several columns back into key/value rows.

SQL Server and Oracle have PIVOT and UNPIVOT operators. PostgreSQL has crosstab in the tablefunc extension. MySQL has neither. What every engine does have is CASE, so **conditional aggregation is the portable pivot** and the one to reach for by default. It is also more flexible: each output column can use a different aggregate and a different condition, which PIVOT cannot express.

The hard constraint on both approaches is that **SQL results have a fixed column list**, decided before the query runs. You cannot pivot an unknown set of values into an unknown number of columns in plain SQL. If the value set is dynamic, you either generate the SQL text from a first query that lists the values, or you return key/value rows and let the application or BI tool pivot them. Saying that out loud is usually the point of the question.

Unpivoting portably is a UNION ALL: one SELECT per source column, each emitting a label and a value. LATERAL / CROSS APPLY with a VALUES list is a tidier variant on engines that support it.`,
  pitfalls: [
    'Trying to pivot a dynamic value set in static SQL. It cannot be done — the column list is fixed at parse time.',
    'Forgetting the aggregate. Pivoting inherently aggregates, and without GROUP BY collapsing the other columns you get one row per source row.',
    'Leaving NULLs in the pivoted cells when the report wants zeros.',
    'Unpivoting columns of different data types with UNION ALL, which fails or silently coerces.',
    'Writing PIVOT syntax that only works on one engine, in an interview where the stack is unspecified.',
  ],
  questions: [
    {
      id: 'p20-q1',
      difficulty: 'easy',
      prompt: 'Pivot monthly sales into one column per quarter for each year.',
      tables: ['sales'],
      think: 'The row key and the column key are both derived from one date column. Which becomes which?',
      hint: 'Year is the row key (GROUP BY); quarter becomes the columns (CASE).',
      approach: `Extract the year to use as the row key and group by it.\nExtract the quarter for the column condition.\nWrite one conditional sum per quarter.\nAdd a yearly total for reconciliation.`,
      solution: `SELECT EXTRACT(YEAR FROM sale_date) AS yr,
       COALESCE(SUM(CASE WHEN EXTRACT(QUARTER FROM sale_date) = 1 THEN amount END), 0) AS q1,
       COALESCE(SUM(CASE WHEN EXTRACT(QUARTER FROM sale_date) = 2 THEN amount END), 0) AS q2,
       COALESCE(SUM(CASE WHEN EXTRACT(QUARTER FROM sale_date) = 3 THEN amount END), 0) AS q3,
       COALESCE(SUM(CASE WHEN EXTRACT(QUARTER FROM sale_date) = 4 THEN amount END), 0) AS q4,
       SUM(amount) AS full_year
FROM sales
GROUP BY EXTRACT(YEAR FROM sale_date)
ORDER BY yr;`,
      explanation: 'Quarters are a fixed, known set of four values, which is exactly when a static pivot is safe. COALESCE turns a quarter with no sales into 0 rather than NULL, which is what a financial report expects.',
    },
    {
      id: 'p20-q2',
      difficulty: 'easy',
      prompt: 'Pivot order counts by status, one row per month.',
      tables: ['orders'],
      think: 'What makes this pivot safe to write statically?',
      hint: 'The status values are a known, small, closed set.',
      approach: `Truncate order_date to the month for the row key.\nWrite one conditional count per known status value.\nGroup by the month.\nOrder chronologically.`,
      solution: `SELECT DATE_TRUNC('month', order_date)::date             AS mth,
       COUNT(*) FILTER (WHERE status = 'placed')        AS placed,
       COUNT(*) FILTER (WHERE status = 'shipped')       AS shipped,
       COUNT(*) FILTER (WHERE status = 'delivered')     AS delivered,
       COUNT(*) FILTER (WHERE status = 'cancelled')     AS cancelled
FROM orders
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY mth;`,
      explanation: 'A static pivot is only correct while the value set is closed — add a "refunded" status tomorrow and this report silently omits it. Adding a COUNT(*) total column is a cheap way to make that omission visible instead of invisible.',
      dialect: 'FILTER is PostgreSQL / SQLite. Elsewhere: COUNT(CASE WHEN status = \'placed\' THEN 1 END).',
    },
    {
      id: 'p20-q3',
      difficulty: 'medium',
      prompt: 'Pivot revenue by region, one row per product category.',
      tables: ['sales', 'products'],
      think: 'The region values come from the data rather than from a calendar. What risk does that introduce?',
      hint: 'You must know the region list at write time — and the query silently drops any new region.',
      approach: `Join sales to products to get the category.\nGroup by the category for the row key.\nWrite one conditional sum per known region.\nAdd a total column so a missing region shows up as a discrepancy.`,
      solution: `SELECT p.category,
       COALESCE(SUM(CASE WHEN s.region = 'North' THEN s.amount END), 0) AS north,
       COALESCE(SUM(CASE WHEN s.region = 'South' THEN s.amount END), 0) AS south,
       COALESCE(SUM(CASE WHEN s.region = 'East'  THEN s.amount END), 0) AS east,
       COALESCE(SUM(CASE WHEN s.region = 'West'  THEN s.amount END), 0) AS west,
       SUM(s.amount) AS all_regions
FROM sales    AS s
JOIN products AS p ON p.product_id = s.product_id
GROUP BY p.category
ORDER BY all_regions DESC;`,
      explanation: 'all_regions is deliberately computed from the raw rows rather than by adding the four pivoted columns, so if a fifth region appears the totals stop matching and someone notices. Building that reconciliation into a static pivot is good defensive practice.',
    },
    {
      id: 'p20-q4',
      difficulty: 'medium',
      prompt: 'Unpivot a wide result — quarterly columns q1 to q4 — back into one row per year and quarter.',
      tables: ['sales'],
      think: 'Unpivoting multiplies rows. What produces several output rows from one input row?',
      hint: 'A UNION ALL with one SELECT per source column, or a lateral join over a VALUES list.',
      approach: `Build the pivoted result in a CTE.\nWrite one SELECT per quarter column, each emitting a quarter label and that column's value.\nUnion them all together with UNION ALL to preserve every row.\nOrder by year and quarter.`,
      solution: `WITH wide AS (
    SELECT EXTRACT(YEAR FROM sale_date) AS yr,
           SUM(CASE WHEN EXTRACT(QUARTER FROM sale_date) = 1 THEN amount END) AS q1,
           SUM(CASE WHEN EXTRACT(QUARTER FROM sale_date) = 2 THEN amount END) AS q2,
           SUM(CASE WHEN EXTRACT(QUARTER FROM sale_date) = 3 THEN amount END) AS q3,
           SUM(CASE WHEN EXTRACT(QUARTER FROM sale_date) = 4 THEN amount END) AS q4
    FROM sales
    GROUP BY EXTRACT(YEAR FROM sale_date)
)
SELECT yr, 'Q1' AS quarter, q1 AS revenue FROM wide
UNION ALL SELECT yr, 'Q2', q2 FROM wide
UNION ALL SELECT yr, 'Q3', q3 FROM wide
UNION ALL SELECT yr, 'Q4', q4 FROM wide
ORDER BY yr, quarter;`,
      explanation: 'UNION ALL rather than UNION matters: UNION would deduplicate, so two quarters with identical revenue in the same year would collapse into one row. Every branch must have the same column types, which is why unpivoting mixed-type columns needs explicit casts.',
    },
    {
      id: 'p20-q5',
      difficulty: 'medium',
      prompt: 'Unpivot customer attributes — email, city, country — into key/value rows for a data-quality audit.',
      tables: ['customers'],
      think: 'Is there a shape that avoids scanning the base table once per output column?',
      hint: 'A lateral join over a VALUES list scans once and expands each row into several.',
      approach: `Select from customers.\nCross join laterally against a small VALUES list pairing each attribute name with its column.\nEach input row expands into one output row per attribute.\nFlag the rows whose value is NULL or blank.`,
      solution: `SELECT c.customer_id,
       v.attribute,
       v.value,
       CASE WHEN v.value IS NULL OR TRIM(v.value) = '' THEN 'missing' END AS issue
FROM customers AS c
CROSS JOIN LATERAL (
    VALUES ('email',   c.email),
           ('city',    c.city),
           ('country', c.country)
) AS v(attribute, value)
ORDER BY c.customer_id, v.attribute;`,
      explanation: 'The lateral VALUES form reads the base table once, whereas the UNION ALL form reads it once per column — a real difference on a large table. It also keeps the attribute list in one place, so adding a fourth attribute is a one-line change.',
      dialect: 'CROSS JOIN LATERAL is PostgreSQL / Oracle. SQL Server: CROSS APPLY (VALUES ...). MySQL 8: JOIN with a derived table, or fall back to UNION ALL.',
    },
    {
      id: 'p20-q6',
      difficulty: 'medium',
      prompt: 'Pivot the top 3 products per category into three columns on one row per category.',
      tables: ['order_items', 'products'],
      think: 'The column key is a rank rather than a data value. Why does that make the pivot safe?',
      hint: 'Ranks 1, 2 and 3 are always exactly three known values, however the data changes.',
      approach: `Aggregate order lines to revenue per product with its category.\nRank products within each category by revenue.\nGroup by category and pivot ranks 1 to 3 into columns using conditional aggregation.\nReturn the product names and their revenue.`,
      solution: `WITH product_rev AS (
    SELECT p.category, p.product_id, p.product_name,
           SUM(oi.quantity * oi.unit_price) AS revenue
    FROM order_items AS oi
    JOIN products    AS p ON p.product_id = oi.product_id
    GROUP BY p.category, p.product_id, p.product_name
),
ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY category
                                 ORDER BY revenue DESC, product_id) AS rn
    FROM product_rev
)
SELECT category,
       MAX(CASE WHEN rn = 1 THEN product_name END) AS top_1,
       MAX(CASE WHEN rn = 1 THEN revenue      END) AS top_1_revenue,
       MAX(CASE WHEN rn = 2 THEN product_name END) AS top_2,
       MAX(CASE WHEN rn = 3 THEN product_name END) AS top_3
FROM ranked
WHERE rn <= 3
GROUP BY category
ORDER BY top_1_revenue DESC;`,
      explanation: 'Pivoting on a rank instead of a data value sidesteps the dynamic-column problem entirely, because the rank set is fixed by the query rather than by the data. MAX is used purely as a "pick the one non-NULL" operator, which works because only one row per group satisfies each CASE.',
    },
    {
      id: 'p20-q7',
      difficulty: 'hard',
      prompt: 'Write the same quarterly pivot using the vendor PIVOT operator, and say what it cannot do.',
      tables: ['sales'],
      think: 'PIVOT is shorter. What flexibility do you give up compared with CASE?',
      hint: 'One aggregate for all columns, a fixed IN list, and no per-column conditions.',
      approach: `Project the source down to the row key, the column key and the measure.\nApply PIVOT with a single aggregate and an explicit IN list of column values.\nAlias the resulting columns.\nNote the constraints compared to the CASE form.`,
      solution: `-- SQL Server / Oracle syntax
SELECT yr, [1] AS q1, [2] AS q2, [3] AS q3, [4] AS q4
FROM (
    SELECT YEAR(sale_date)    AS yr,
           DATEPART(QUARTER, sale_date) AS qtr,
           amount
    FROM sales
) AS src
PIVOT (
    SUM(amount) FOR qtr IN ([1], [2], [3], [4])
) AS pvt
ORDER BY yr;`,
      explanation: 'PIVOT applies one aggregate to every column and requires a literal IN list, so it cannot mix SUM and COUNT across columns or apply a different condition per column — both of which the CASE form does naturally. It is also absent from PostgreSQL and MySQL, which is why CASE is the answer to give when the engine is unspecified.',
      dialect: 'PIVOT exists in SQL Server and Oracle. PostgreSQL: the crosstab function in the tablefunc extension. MySQL: no equivalent — use CASE.',
    },
    {
      id: 'p20-q8',
      difficulty: 'hard',
      prompt: 'Explain and demonstrate how you would pivot an unknown, data-driven set of regions into columns.',
      tables: ['sales'],
      think: 'A SQL result has a fixed column list decided at parse time. What are the only two ways around that?',
      hint: 'Generate the SQL text from a query that lists the values, or return long-format rows and pivot outside SQL.',
      approach: `First query the distinct values that would become columns.\nUse a string aggregate to build the CASE expressions as text.\nAssemble a full SQL statement and execute it dynamically.\nOr, preferably, return key/value rows and let the BI tool do the pivot.`,
      solution: `-- Step 1: build the column list as text
SELECT STRING_AGG(
         FORMAT('COALESCE(SUM(CASE WHEN region = %L THEN amount END), 0) AS %I',
                region, LOWER(region)),
         ', ' ORDER BY region)
FROM (SELECT DISTINCT region FROM sales) AS r;

-- Step 2: the generated text is spliced into a full statement and executed
-- by the application (or by PL/pgSQL EXECUTE).

-- Preferred alternative: return long format and pivot in the BI layer
SELECT region,
       DATE_TRUNC('month', sale_date)::date AS mth,
       SUM(amount) AS revenue
FROM sales
GROUP BY region, DATE_TRUNC('month', sale_date)
ORDER BY mth, region;`,
      explanation: 'FORMAT with %L and %I quotes literals and identifiers safely, which is essential because dynamic SQL built by string concatenation is an injection vector. The honest recommendation, though, is the second query: long format is stable, cacheable, and every BI tool pivots it natively.',
      dialect: 'FORMAT and STRING_AGG are PostgreSQL. SQL Server builds dynamic pivots with QUOTENAME and sp_executesql.',
    },
    {
      id: 'p20-q9',
      difficulty: 'hard',
      prompt: 'Pivot each customer\'s last three order amounts into three columns, most recent first.',
      tables: ['orders'],
      think: 'The columns are positions in a per-customer sequence. What produces those positions?',
      hint: 'ROW_NUMBER descending by date, then pivot on the row number.',
      approach: `Number each customer's orders newest-first.\nKeep the first three.\nGroup by customer and pivot the three row numbers into columns.\nReturn both the amounts and the dates so the sequence is verifiable.`,
      solution: `WITH numbered AS (
    SELECT customer_id, order_date, amount,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY order_date DESC, order_id DESC) AS rn
    FROM orders
)
SELECT customer_id,
       MAX(CASE WHEN rn = 1 THEN amount     END) AS last_amount,
       MAX(CASE WHEN rn = 1 THEN order_date END) AS last_date,
       MAX(CASE WHEN rn = 2 THEN amount     END) AS prev_amount,
       MAX(CASE WHEN rn = 3 THEN amount     END) AS prev2_amount,
       COUNT(*)                                  AS orders_shown
FROM numbered
WHERE rn <= 3
GROUP BY customer_id
ORDER BY customer_id;`,
      explanation: 'Customers with only one order return NULL in the second and third columns, which is correct and should not be coalesced to zero — zero would read as "an order of £0". This shape is common for CRM screens that show a customer\'s recent activity inline.',
    },
    {
      id: 'p20-q10',
      difficulty: 'hard',
      prompt: 'Build a cross-tab of order counts with regions as rows, months as columns, plus row and column totals.',
      tables: ['sales'],
      think: 'Totals along both edges mean the result mixes two grains. What produces subtotal rows alongside detail rows?',
      hint: 'GROUPING SETS or ROLLUP adds the total rows; the column totals come from an extra pivoted column.',
      approach: `Group by region with a ROLLUP so a grand-total row is added.\nPivot the months into columns with conditional counts.\nAdd a row total column summing across all months.\nUse GROUPING to label the total row clearly.`,
      solution: `SELECT COALESCE(region, 'ALL REGIONS') AS region,
       COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM sale_date) = 1) AS jan,
       COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM sale_date) = 2) AS feb,
       COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM sale_date) = 3) AS mar,
       COUNT(*)                                                  AS row_total,
       GROUPING(region)                                          AS is_total_row
FROM sales
WHERE sale_date >= DATE '2024-01-01'
  AND sale_date <  DATE '2024-04-01'
GROUP BY ROLLUP (region)
ORDER BY GROUPING(region), region;`,
      explanation: 'ROLLUP emits an extra row where region is NULL holding the grand total, and GROUPING(region) distinguishes that synthetic NULL from a genuine NULL region in the data — without it you cannot tell the two apart. Ordering by GROUPING pushes the total row to the bottom where a reader expects it.',
      dialect: 'ROLLUP and GROUPING are PostgreSQL / SQL Server / Oracle / MySQL 8. Older MySQL uses WITH ROLLUP after GROUP BY.',
    },
  ],
};
