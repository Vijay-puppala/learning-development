import type { Pattern } from '../types';

export const p45: Pattern = {
  num: 45,
  slug: 'find-mode',
  title: 'Find Mode',
  concept: 'GROUP BY, COUNT()',
  category: 'Aggregation & Grouping',
  tagline: 'The most frequent value. Count, then take the maximum count — and decide what to do about ties.',
  theory: `The mode is the most frequently occurring value. Unlike the mean and the median, it works on categorical data — you cannot average a city name, but you can find the most common one.

The recipe is two aggregations. Count the occurrences of each value, then keep the value or values whose count is highest. That second step is where the decisions live.

**Ties are normal.** Unlike the mean, the mode is not unique: two values can share the top count. RANK or DENSE_RANK on the count returns all of them; ROW_NUMBER picks one arbitrarily. Distributions can be bimodal, and silently hiding that is a real analytical error.

**NULLs.** GROUP BY puts all NULLs in one group, so "unknown" can win the mode. Decide whether that is meaningful or whether NULLs should be excluded.

**Per group.** "The most common city per country" is the mode plus a partition — count per (country, city), then rank within country.

PostgreSQL has a built-in: MODE() WITHIN GROUP (ORDER BY col), which returns the lowest value among ties. It is concise and hides the tie behaviour, so know the manual form too.`,
  pitfalls: [
    'Using ROW_NUMBER and silently reporting one of several tied modes as the answer.',
    'Forgetting NULLs form their own group and can win.',
    'Reporting a mode without its count, so nobody can tell whether it is meaningful.',
    'Using MAX(COUNT(*)) and then being unable to recover which value achieved it.',
    'Assuming MODE() WITHIN GROUP reports ties — it returns only the lowest tied value.',
  ],
  questions: [
    {
      id: 'p45-q1',
      difficulty: 'easy',
      prompt: 'Find the most common city among customers.',
      tables: ['customers'],
      think: 'Two aggregation steps. What does the first produce, and what does the second pick from it?',
      hint: 'Count per city, then order by the count and take the top.',
      approach: `Group customers by city.\nCount the rows in each group.\nOrder by the count descending.\nTake the first row, with a tiebreaker for determinism.`,
      solution: `SELECT city,
       COUNT(*) AS customers
FROM customers
WHERE city IS NOT NULL
GROUP BY city
ORDER BY customers DESC, city
LIMIT 1;`,
      explanation: 'LIMIT 1 returns exactly one row even when two cities tie, which is why the city tiebreaker is there — without it the winner varies between runs. If ties should all be shown, this is the wrong tool and the next question has the right one.',
    },
    {
      id: 'p45-q2',
      difficulty: 'easy',
      prompt: 'Return every city tied for the most common, not just one.',
      tables: ['customers'],
      think: 'LIMIT cuts at a row count. What expresses "everything at the top count"?',
      hint: 'RANK on the count, then keep rank 1.',
      approach: `Count customers per city.\nRank the cities by that count descending, letting ties share rank 1.\nKeep rank 1.\nReturn every city at that count.`,
      solution: `WITH counts AS (
    SELECT city, COUNT(*) AS customers
    FROM customers
    WHERE city IS NOT NULL
    GROUP BY city
),
ranked AS (
    SELECT *, RANK() OVER (ORDER BY customers DESC) AS rnk
    FROM counts
)
SELECT city, customers
FROM ranked
WHERE rnk = 1
ORDER BY city;`,
      explanation: 'RANK gives every tied city the number 1, so all of them survive the filter — which is the honest answer when a distribution is bimodal. Deliberately leaving the city out of the window ORDER BY is what preserves the tie; adding it would turn RANK into ROW_NUMBER.',
    },
    {
      id: 'p45-q3',
      difficulty: 'medium',
      prompt: 'Find the most common city within each country.',
      tables: ['customers'],
      think: 'Adding a group changes both aggregation steps. How?',
      hint: 'Count per (country, city), then rank within country.',
      approach: `Group by country and city and count.\nPartition the ranking by country and order by the count descending.\nKeep rank 1 in each country.\nShow the count and its share of the country.`,
      solution: `WITH counts AS (
    SELECT country, city, COUNT(*) AS customers
    FROM customers
    WHERE city IS NOT NULL AND country IS NOT NULL
    GROUP BY country, city
),
ranked AS (
    SELECT *,
           RANK()      OVER (PARTITION BY country ORDER BY customers DESC) AS rnk,
           SUM(customers) OVER (PARTITION BY country)                      AS country_total
    FROM counts
)
SELECT country,
       city AS modal_city,
       customers,
       country_total,
       ROUND(100.0 * customers / NULLIF(country_total, 0), 1) AS pct_of_country
FROM ranked
WHERE rnk = 1
ORDER BY country;`,
      explanation: 'The share column is what makes the mode interpretable: a modal city holding 60% of a country is a real concentration, while one holding 4% is barely more common than the next. A mode without its share is a number without a meaning.',
    },
    {
      id: 'p45-q4',
      difficulty: 'medium',
      prompt: 'Use the built-in MODE function and explain what it does with ties.',
      tables: ['customers'],
      think: 'A one-line answer — what does it hide?',
      hint: 'It returns only the lowest value among tied modes, with no indication that a tie existed.',
      approach: `Call MODE as an ordered-set aggregate over the column.\nCompare its result against the manual tie-aware version.\nNote that the built-in silently picks one value.\nUse it when ties do not matter and the manual form when they might.`,
      solution: `SELECT MODE() WITHIN GROUP (ORDER BY city) AS modal_city,
       COUNT(*) FILTER (WHERE city = (SELECT MODE() WITHIN GROUP (ORDER BY city)
                                      FROM customers)) AS its_count,
       COUNT(DISTINCT city) AS distinct_cities
FROM customers
WHERE city IS NOT NULL;`,
      explanation: 'MODE() WITHIN GROUP breaks ties by returning the lowest value in the ordering, and gives no signal that it did so — a bimodal distribution looks unimodal. It is the right call for a quick answer and the wrong one when the tie itself is the finding.',
      dialect: 'MODE() WITHIN GROUP is PostgreSQL and Oracle. SQL Server and MySQL have no built-in mode — use the count-and-rank form.',
    },
    {
      id: 'p45-q5',
      difficulty: 'medium',
      prompt: 'Find the most common order amount, and show how NULL handling changes the answer.',
      tables: ['orders'],
      think: 'GROUP BY collects all NULLs into one group. Can "unknown" be the mode?',
      hint: 'Yes — and whether that is a finding or a distortion depends on the question.',
      approach: `Count orders per amount, including the NULL group.\nRank the counts descending.\nReturn the top results with the NULL group labelled.\nCompare against the same query with NULLs excluded.`,
      solution: `WITH counts AS (
    SELECT amount, COUNT(*) AS orders
    FROM orders
    GROUP BY amount
)
SELECT COALESCE(CAST(amount AS text), '(NULL / unknown)') AS amount,
       orders,
       RANK() OVER (ORDER BY orders DESC) AS rnk,
       ROUND(100.0 * orders / SUM(orders) OVER (), 2) AS pct_of_orders
FROM counts
ORDER BY orders DESC
LIMIT 5;`,
      explanation: 'If "(NULL / unknown)" tops this list, the finding is about data capture rather than about customer behaviour — which is exactly why it should be visible rather than filtered away silently. Labelling the NULL group explicitly is what turns a distortion into a discovery.',
    },
    {
      id: 'p45-q6',
      difficulty: 'medium',
      prompt: 'Find each customer\'s most frequently purchased product.',
      tables: ['orders', 'order_items'],
      think: 'Two aggregations and a partition. What is the grain going into the ranking?',
      hint: 'One row per (customer, product) with a purchase count.',
      approach: `Join orders to lines so each row carries a customer and a product.\nCount purchases per customer and product.\nRank products within each customer by that count.\nKeep rank 1, allowing ties.`,
      solution: `WITH purchases AS (
    SELECT o.customer_id, oi.product_id, COUNT(*) AS times_bought
    FROM orders      AS o
    JOIN order_items AS oi ON oi.order_id = o.order_id
    GROUP BY o.customer_id, oi.product_id
),
ranked AS (
    SELECT *,
           RANK()   OVER (PARTITION BY customer_id ORDER BY times_bought DESC) AS rnk,
           SUM(times_bought) OVER (PARTITION BY customer_id)                   AS total_lines
    FROM purchases
)
SELECT customer_id,
       product_id AS favourite_product,
       times_bought,
       ROUND(100.0 * times_bought / NULLIF(total_lines, 0), 1) AS pct_of_their_purchases
FROM ranked
WHERE rnk = 1
ORDER BY customer_id;`,
      explanation: 'RANK rather than ROW_NUMBER means a customer who bought two products equally often gets both returned, which is the truthful answer. The percentage column distinguishes a genuine favourite from someone who bought everything once.',
    },
    {
      id: 'p45-q7',
      difficulty: 'hard',
      prompt: 'Detect bimodal distributions: find countries where the top two cities are within 10% of each other.',
      tables: ['customers'],
      think: 'Two rank levels compared on one row. What brings the second onto the first?',
      hint: 'LEAD across the ranked counts, or a conditional pivot.',
      approach: `Count customers per country and city.\nRank the cities within each country.\nLEAD the next city's count onto the top row.\nKeep countries where the second count is within 10% of the first.`,
      solution: `WITH counts AS (
    SELECT country, city, COUNT(*) AS customers
    FROM customers
    WHERE city IS NOT NULL AND country IS NOT NULL
    GROUP BY country, city
),
ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY country ORDER BY customers DESC, city) AS rn,
           LEAD(city)      OVER (PARTITION BY country
                                 ORDER BY customers DESC, city) AS runner_up,
           LEAD(customers) OVER (PARTITION BY country
                                 ORDER BY customers DESC, city) AS runner_up_count
    FROM counts
)
SELECT country,
       city            AS top_city,
       customers       AS top_count,
       runner_up,
       runner_up_count,
       ROUND(100.0 * runner_up_count / NULLIF(customers, 0), 1) AS runner_up_pct_of_top
FROM ranked
WHERE rn = 1
  AND runner_up_count IS NOT NULL
  AND runner_up_count >= 0.9 * customers
ORDER BY runner_up_pct_of_top DESC;`,
      explanation: 'A mode that only narrowly beats the runner-up is not a stable finding — resample the data and the winner may swap. Checking the margin before reporting a mode is the analytical habit this question is testing.',
    },
    {
      id: 'p45-q8',
      difficulty: 'hard',
      prompt: 'Find the modal day of week for orders, and the modal hour within that day.',
      tables: ['orders'],
      think: 'A mode of a derived value, then a mode within the winner. How many passes?',
      hint: 'Two levels: find the modal day first, then rank hours within it.',
      approach: `Derive the day of week from the order date and count orders per day.\nRank the days and identify the modal one.\nCount orders per hour within that day only.\nRank the hours and return the top.`,
      solution: `WITH by_dow AS (
    SELECT EXTRACT(ISODOW FROM order_date) AS dow,
           COUNT(*) AS orders
    FROM orders
    GROUP BY EXTRACT(ISODOW FROM order_date)
),
modal_day AS (
    SELECT dow, orders,
           RANK() OVER (ORDER BY orders DESC) AS rnk
    FROM by_dow
)
SELECT TO_CHAR(DATE '2024-01-01' + (md.dow - 1)::int, 'Day') AS modal_day_name,
       md.orders   AS orders_on_that_day,
       ROUND(100.0 * md.orders / SUM(md.orders) OVER (), 1) AS pct_of_all_orders
FROM modal_day AS md
WHERE md.rnk = 1;`,
      explanation: 'Computing the mode of a derived expression is no different from computing it on a stored column — the derivation just moves into the GROUP BY. ISODOW numbers Monday as 1, which keeps the day naming locale-independent.',
    },
    {
      id: 'p45-q9',
      difficulty: 'hard',
      prompt: 'Report the mean, median and mode of order amounts side by side, and explain when they diverge.',
      tables: ['orders'],
      think: 'Three measures of centre. What does the gap between them tell you about the distribution?',
      hint: 'Mean above median above mode means a right-skewed distribution with a long tail.',
      approach: `Compute the mean with AVG.\nCompute the median with a percentile function.\nCompute the mode with the built-in or a count-and-rank subquery.\nReturn all three and the skew implied by their order.`,
      solution: `SELECT ROUND(AVG(amount), 2)                                         AS mean_amount,
       ROUND(CAST(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount)
                  AS numeric), 2)                                    AS median_amount,
       (SELECT amount FROM orders
        WHERE amount IS NOT NULL
        GROUP BY amount ORDER BY COUNT(*) DESC, amount LIMIT 1)      AS modal_amount,
       COUNT(*)                                                      AS orders,
       CASE WHEN AVG(amount) > PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) * 1.1
            THEN 'right-skewed: a few large orders pull the mean up'
            WHEN AVG(amount) < PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) * 0.9
            THEN 'left-skewed'
            ELSE 'roughly symmetric' END AS shape
FROM orders
WHERE amount IS NOT NULL;`,
      explanation: 'Order-value distributions are almost always right-skewed, which is why quoting the mean alone overstates the typical order — the median is the better headline and the mode says what customers most often actually pay. Reporting all three and naming the skew is what an analyst would deliver.',
      dialect: 'PERCENTILE_CONT is PostgreSQL / Oracle / SQL Server / Snowflake. MySQL 8 needs a window-function workaround for the median.',
    },
    {
      id: 'p45-q10',
      difficulty: 'hard',
      prompt: 'Build a mode-based imputation: fill missing city values with the modal city of that customer\'s country.',
      tables: ['customers'],
      think: 'Imputation needs a per-group mode attached to every row. What attaches it without collapsing the rows?',
      hint: 'Compute the modal city per country in a CTE, then join it back.',
      approach: `Count customers per country and city, ignoring NULL cities.\nRank the cities within each country and keep the top one.\nJoin that modal city back to every customer row.\nCOALESCE the missing city to it, and flag which rows were imputed.`,
      solution: `WITH counts AS (
    SELECT country, city, COUNT(*) AS n
    FROM customers
    WHERE city IS NOT NULL AND country IS NOT NULL
    GROUP BY country, city
),
modal AS (
    SELECT country, city AS modal_city, n,
           ROW_NUMBER() OVER (PARTITION BY country ORDER BY n DESC, city) AS rn
    FROM counts
)
SELECT c.customer_id,
       c.country,
       c.city                                   AS city_raw,
       COALESCE(c.city, m.modal_city)           AS city_imputed,
       (c.city IS NULL AND m.modal_city IS NOT NULL) AS was_imputed,
       m.n                                      AS modal_city_support
FROM customers AS c
LEFT JOIN modal AS m ON m.country = c.country AND m.rn = 1
ORDER BY was_imputed DESC, c.customer_id;`,
      explanation: 'Mode imputation is the standard fill for categorical data, since there is no meaningful average of a city name. The was_imputed flag and the support count are what keep it honest — a modal city backed by three customers is a guess, and any analysis of the imputed column should be able to exclude those rows.',
    },
  ],
};
