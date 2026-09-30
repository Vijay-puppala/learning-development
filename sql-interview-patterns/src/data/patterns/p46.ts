import type { Pattern } from '../types';

export const p46: Pattern = {
  num: 46,
  slug: 'longest-shortest-value',
  title: 'Longest & Shortest Value',
  concept: 'LENGTH(), MIN(), MAX()',
  category: 'Reshaping & Text',
  tagline: 'Extremes of a derived measure — plus the eternal MAX-versus-ranking distinction.',
  theory: `"The longest product name" sounds trivial and contains the pattern that trips people up: **MAX() gives you the value, never the row it came from**. MAX(LENGTH(product_name)) returns a number; it cannot tell you which product. To get the row you either rank by the derived value and keep rank 1, or filter against the maximum computed in a subquery.

Length itself has traps. LENGTH counts *characters* in PostgreSQL and MySQL; OCTET_LENGTH counts bytes, and they differ for any non-ASCII text. SQL Server's LEN ignores trailing spaces while DATALENGTH does not. On a CHAR column, values are space-padded to the declared width, so every length is identical until you TRIM.

Ties are the norm for length, far more than for a numeric measure — many names share a length. RANK returns all of them; ROW_NUMBER hides them. And NULL has no length: LENGTH(NULL) is NULL, and both MIN and MAX skip it, so "shortest" silently excludes unknown values rather than treating them as zero.

The pattern generalises to any derived measure: longest-running subscription, largest order, widest price spread. Extreme value, then the row that produced it.`,
  pitfalls: [
    'Using MAX(LENGTH(x)) and then being unable to say which row achieved it.',
    'Confusing character length with byte length on multi-byte text.',
    'Forgetting CHAR padding, which makes every value the same length until trimmed.',
    'Using ROW_NUMBER for extremes and silently reporting one of several tied rows.',
    'Treating NULL as a zero-length value — it is excluded entirely.',
  ],
  questions: [
    {
      id: 'p46-q1',
      difficulty: 'easy',
      prompt: 'Find the length of the longest and shortest product name.',
      tables: ['products'],
      think: 'This returns numbers. What is it deliberately not telling you?',
      hint: 'Which products they are — MAX returns a value, not a row.',
      approach: `Compute the length of each product name.\nTake the maximum and minimum of those lengths.\nReturn them alongside the average for context.\nNote that no product name is identified.`,
      solution: `SELECT MIN(LENGTH(product_name)) AS shortest_name,
       MAX(LENGTH(product_name)) AS longest_name,
       ROUND(AVG(LENGTH(product_name)), 1) AS avg_name_length,
       COUNT(*) AS products
FROM products
WHERE product_name IS NOT NULL;`,
      explanation: 'MIN and MAX collapse the rows entirely, so this answers "how long" and can never answer "which". Rows with a NULL name are excluded from all three aggregates, which is why the count is there to show the base.',
      dialect: 'LENGTH is PostgreSQL / MySQL / Oracle. SQL Server: LEN, which ignores trailing spaces — use DATALENGTH to include them.',
    },
    {
      id: 'p46-q2',
      difficulty: 'easy',
      prompt: 'Return the actual product with the longest name.',
      tables: ['products'],
      think: 'Two ways to get from a maximum value back to its row. What are they?',
      hint: 'Order by the derived value and take the top, or filter against a subquery computing the max.',
      approach: `Compute the name length for each product.\nSort by it descending.\nTake the first row, with a tiebreaker for determinism.\nReturn the product and the length.`,
      solution: `SELECT product_id,
       product_name,
       LENGTH(product_name) AS name_length
FROM products
WHERE product_name IS NOT NULL
ORDER BY LENGTH(product_name) DESC, product_id
LIMIT 1;`,
      explanation: 'Sorting by the derived value and limiting is the shortest route from a maximum to its row, and the tiebreaker is what stops the answer changing between runs. If several products share the longest name length, this reports only one — the next question fixes that.',
    },
    {
      id: 'p46-q3',
      difficulty: 'medium',
      prompt: 'Return every product tied for the longest name.',
      tables: ['products'],
      think: 'Name lengths tie far more often than numeric measures. What returns all of them?',
      hint: 'RANK on the length, or a filter against the maximum from a subquery.',
      approach: `Rank products by name length descending, letting ties share rank 1.\nKeep rank 1.\nReturn every product at that length.\nShow how many tied.`,
      solution: `WITH ranked AS (
    SELECT product_id, product_name, category,
           LENGTH(product_name) AS name_length,
           RANK()   OVER (ORDER BY LENGTH(product_name) DESC) AS rnk,
           COUNT(*) OVER (PARTITION BY LENGTH(product_name))  AS tied_count
    FROM products
    WHERE product_name IS NOT NULL
)
SELECT product_id, product_name, category, name_length, tied_count
FROM ranked
WHERE rnk = 1
ORDER BY product_name;`,
      explanation: 'Length is a low-cardinality derived measure, so ties are the normal case rather than an edge case — RANK is the right default here in a way it is not for, say, revenue. The tied_count column makes the size of the tie visible without a second query.',
    },
    {
      id: 'p46-q4',
      difficulty: 'medium',
      prompt: 'Find the longest and shortest product name within each category, in one row per category.',
      tables: ['products'],
      think: 'Two extremes and their names per group. Can MIN and MAX give you the names?',
      hint: 'No — rank in both directions and pivot, or use FIRST_VALUE with two orderings.',
      approach: `Partition by category.\nNumber products by name length descending and ascending in the same pass.\nKeep rows that are first in either direction.\nCollapse to one row per category with conditional aggregation.`,
      solution: `WITH ranked AS (
    SELECT category, product_name,
           LENGTH(product_name) AS len,
           ROW_NUMBER() OVER (PARTITION BY category
                              ORDER BY LENGTH(product_name) DESC, product_name) AS rn_long,
           ROW_NUMBER() OVER (PARTITION BY category
                              ORDER BY LENGTH(product_name),      product_name) AS rn_short
    FROM products
    WHERE product_name IS NOT NULL
)
SELECT category,
       MAX(CASE WHEN rn_long  = 1 THEN product_name END) AS longest_name,
       MAX(CASE WHEN rn_long  = 1 THEN len          END) AS longest_length,
       MAX(CASE WHEN rn_short = 1 THEN product_name END) AS shortest_name,
       MAX(CASE WHEN rn_short = 1 THEN len          END) AS shortest_length
FROM ranked
WHERE rn_long = 1 OR rn_short = 1
GROUP BY category
ORDER BY category;`,
      explanation: 'Numbering in both directions and keeping the rows that are first in either gives at most two rows per category, which the conditional aggregation then pivots into one. A category with a single product returns the same name in both columns, which is correct.',
    },
    {
      id: 'p46-q5',
      difficulty: 'medium',
      prompt: 'Find customers whose email looks suspiciously short or long, outside two standard deviations of the typical length.',
      tables: ['customers'],
      think: 'The extreme is now relative to the distribution rather than absolute. What does that need?',
      hint: 'The mean and standard deviation of the length, attached to every row with a window.',
      approach: `Compute the email length per customer.\nAttach the overall mean and standard deviation with windows over the whole set.\nCompute each row's z-score.\nFlag rows beyond two standard deviations in either direction.`,
      solution: `WITH lengths AS (
    SELECT customer_id, email,
           LENGTH(email) AS len,
           AVG(LENGTH(email))    OVER () AS mu,
           STDDEV(LENGTH(email)) OVER () AS sigma
    FROM customers
    WHERE email IS NOT NULL
)
SELECT customer_id,
       email,
       len,
       ROUND(mu, 1)    AS avg_length,
       ROUND((len - mu) / NULLIF(sigma, 0), 2) AS z_score,
       CASE WHEN len < mu - 2 * sigma THEN 'suspiciously short'
            WHEN len > mu + 2 * sigma THEN 'suspiciously long'
       END AS flag
FROM lengths
WHERE ABS(len - mu) > 2 * sigma
ORDER BY ABS(len - mu) DESC;`,
      explanation: 'A window aggregate with no partition attaches the population statistics to every row, so the z-score can be computed at row level in one pass. Length outliers are a cheap data-quality signal: very short emails are usually truncation, very long ones are usually concatenated junk.',
      dialect: 'STDDEV is PostgreSQL / Oracle. SQL Server: STDEV. MySQL: STDDEV_SAMP.',
    },
    {
      id: 'p46-q6',
      difficulty: 'medium',
      prompt: 'Show the difference between character length, byte length and trimmed length.',
      tables: ['customers'],
      think: 'When would these three numbers disagree, and which does a validation rule usually mean?',
      hint: 'Multi-byte characters split the first two; padding and stray whitespace split the third.',
      approach: `Compute the character length of the value.\nCompute the byte length of the same value.\nCompute the length after trimming whitespace.\nReturn rows where any two disagree.`,
      solution: `SELECT customer_id,
       customer_name,
       LENGTH(customer_name)              AS chars,
       OCTET_LENGTH(customer_name)        AS bytes,
       LENGTH(TRIM(customer_name))        AS trimmed_chars,
       CASE WHEN OCTET_LENGTH(customer_name) > LENGTH(customer_name)
            THEN 'contains multi-byte characters' END AS encoding_note,
       CASE WHEN LENGTH(TRIM(customer_name)) < LENGTH(customer_name)
            THEN 'has leading or trailing whitespace' END AS whitespace_note
FROM customers
WHERE customer_name IS NOT NULL
  AND (OCTET_LENGTH(customer_name) <> LENGTH(customer_name)
    OR LENGTH(TRIM(customer_name)) <> LENGTH(customer_name))
ORDER BY customer_id;`,
      explanation: 'A name with an accented character is longer in bytes than in characters, which matters because a VARCHAR(50) limit is measured in characters while a byte-oriented system may truncate earlier. Untrimmed whitespace is the other common cause of "this value looks right but never matches".',
      dialect: 'OCTET_LENGTH is PostgreSQL / MySQL. SQL Server: DATALENGTH. Oracle: LENGTHB.',
    },
    {
      id: 'p46-q7',
      difficulty: 'hard',
      prompt: 'Find the product whose name is longest relative to its category average.',
      tables: ['products'],
      think: 'The extreme is now relative to a group baseline. What attaches the baseline without collapsing rows?',
      hint: 'A window average partitioned by category, then rank by the ratio.',
      approach: `Compute each product's name length.\nAttach the category's average name length with a partitioned window.\nCompute the ratio of the two.\nRank by that ratio and keep the top per category.`,
      solution: `WITH scored AS (
    SELECT category, product_id, product_name,
           LENGTH(product_name) AS len,
           AVG(LENGTH(product_name)) OVER (PARTITION BY category) AS cat_avg_len,
           COUNT(*)                  OVER (PARTITION BY category) AS cat_size
    FROM products
    WHERE product_name IS NOT NULL
),
ranked AS (
    SELECT *,
           len / NULLIF(cat_avg_len, 0) AS ratio,
           ROW_NUMBER() OVER (PARTITION BY category
                              ORDER BY len / NULLIF(cat_avg_len, 0) DESC,
                                       product_id) AS rn
    FROM scored
)
SELECT category, product_name, len,
       ROUND(cat_avg_len, 1) AS cat_avg_len,
       ROUND(CAST(ratio AS numeric), 2) AS times_the_average,
       cat_size
FROM ranked
WHERE rn = 1
  AND cat_size >= 3
ORDER BY ratio DESC;`,
      explanation: 'Measuring against the group baseline finds outliers that an absolute threshold would miss, because a naturally verbose category would otherwise dominate every "longest" list. The cat_size guard matters: in a category of one product, that product *is* the average and the ratio is meaninglessly 1.',
    },
    {
      id: 'p46-q8',
      difficulty: 'hard',
      prompt: 'Find the customer with the longest gap between their first and last order.',
      tables: ['orders'],
      think: 'Length here is a duration, not a string. Does the pattern change?',
      hint: 'No — derive the measure, then rank by it and keep the row.',
      approach: `Aggregate orders to the first and last order date per customer.\nCompute the span in days.\nRank customers by that span descending.\nKeep the top, allowing ties.`,
      solution: `WITH spans AS (
    SELECT customer_id,
           MIN(order_date) AS first_order,
           MAX(order_date) AS last_order,
           MAX(order_date) - MIN(order_date) AS span_days,
           COUNT(*)        AS orders
    FROM orders
    GROUP BY customer_id
    HAVING COUNT(*) > 1
)
SELECT customer_id, first_order, last_order, span_days, orders,
       ROUND(span_days / NULLIF(orders - 1, 0), 1) AS avg_days_between_orders
FROM spans
WHERE span_days = (SELECT MAX(span_days) FROM spans)
ORDER BY customer_id;`,
      explanation: 'Filtering against a subquery that computes the maximum is the other route from an extreme value to its row, and unlike LIMIT 1 it returns every tied row. The HAVING COUNT(*) > 1 guard removes single-order customers, whose span is trivially zero.',
    },
    {
      id: 'p46-q9',
      difficulty: 'hard',
      prompt: 'Rank products by name length and show the percentile each name length sits at.',
      tables: ['products'],
      think: 'A rank is absolute; a percentile is relative to the population. Which function normalises it?',
      hint: 'PERCENT_RANK or CUME_DIST over the length ordering.',
      approach: `Compute the name length per product.\nRank by it descending, letting ties share a rank.\nCompute the percentile position over the same ordering.\nReturn both plus the distinct length count.`,
      solution: `SELECT product_id,
       product_name,
       LENGTH(product_name) AS len,
       RANK()        OVER (ORDER BY LENGTH(product_name) DESC) AS length_rank,
       ROUND(CAST(PERCENT_RANK() OVER (ORDER BY LENGTH(product_name)) AS numeric), 3)
         AS pct_rank,
       ROUND(CAST(CUME_DIST()    OVER (ORDER BY LENGTH(product_name)) AS numeric), 3)
         AS cume_dist,
       COUNT(*) OVER (PARTITION BY LENGTH(product_name)) AS others_at_this_length
FROM products
WHERE product_name IS NOT NULL
ORDER BY len DESC, product_name;`,
      explanation: 'PERCENT_RANK runs from 0 to just under 1 and answers "what fraction is strictly shorter"; CUME_DIST runs to exactly 1 and answers "what fraction is this length or shorter". With a heavily tied measure like length the two diverge noticeably, which is why showing both is instructive.',
    },
    {
      id: 'p46-q10',
      difficulty: 'hard',
      prompt: 'Build a text-quality report for product names: length distribution, plus counts of names that are too short, too long, or contain suspicious characters.',
      tables: ['products'],
      think: 'Several independent checks over the same column. What shape delivers them as one summary?',
      hint: 'Conditional aggregation — one FILTER per rule.',
      approach: `Compute the length and a few boolean checks per product.\nAggregate the whole table into one row.\nUse conditional counts for each rule.\nInclude percentile lengths so the thresholds can be judged.`,
      solution: `WITH checks AS (
    SELECT product_id,
           product_name,
           LENGTH(product_name)             AS len,
           product_name <> TRIM(product_name) AS has_pad,
           product_name ~ '[^A-Za-z0-9 .,''&()-]' AS has_odd_chars,
           product_name ~ '\\s\\s'             AS has_double_space
    FROM products
    WHERE product_name IS NOT NULL
)
SELECT COUNT(*)                                             AS products,
       MIN(len)                                             AS min_len,
       ROUND(CAST(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY len) AS numeric), 1)
                                                            AS median_len,
       MAX(len)                                             AS max_len,
       COUNT(*) FILTER (WHERE len < 3)                      AS suspiciously_short,
       COUNT(*) FILTER (WHERE len > 80)                     AS suspiciously_long,
       COUNT(*) FILTER (WHERE has_pad)                      AS untrimmed,
       COUNT(*) FILTER (WHERE has_odd_chars)                AS odd_characters,
       COUNT(*) FILTER (WHERE has_double_space)             AS double_spaces
FROM checks;`,
      explanation: 'One pass and one row gives a whole text-quality dashboard, with each rule as its own conditional count. Reporting the median and the extremes alongside the flags lets the reader judge whether the thresholds are sensible for this catalog rather than taking them on faith.',
      dialect: 'The ~ regex operator is PostgreSQL. MySQL: REGEXP. SQL Server has no regex — use LIKE with character ranges or a CLR function.',
    },
  ],
};
