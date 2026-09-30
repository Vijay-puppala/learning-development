import type { Pattern } from '../types';

export const p44: Pattern = {
  num: 44,
  slug: 'split-string-into-rows',
  title: 'Split String into Rows',
  concept: 'STRING_SPLIT()',
  category: 'Reshaping & Text',
  tagline: 'Unpack a comma-separated column into rows — and then argue for fixing the schema.',
  theory: `A column holding "red,blue,green" violates first normal form, and every query against it is harder than it should be: you cannot index it usefully, you cannot join on it, and LIKE '%red%' matches "infrared".

Every engine solves the unpacking differently and none of them agree. PostgreSQL has **unnest(string_to_array(col, ','))** and **regexp_split_to_table**. SQL Server has **STRING_SPLIT(col, ',')**, which only gained a position column in 2022. MySQL 8 has no split function at all, so you use JSON_TABLE or a numbers-table join. Oracle uses a CONNECT BY regexp trick. BigQuery has SPLIT with UNNEST.

The portable fallback, worth knowing because it works everywhere: join to a numbers table of 1..N, take the Nth element with a substring expression, and stop when N exceeds the number of separators in the row.

Three practical points. Trim each element — "a, b" yields " b" with a leading space. Preserve the position when order matters, because the original sequence is often meaningful. And discard empty elements produced by trailing separators.

Always mention the schema fix: a child table, or a native array or JSON column, turns all of this into a normal join.`,
  pitfalls: [
    'Assuming STRING_SPLIT preserves order — it does not guarantee it without the ordinal column.',
    'Forgetting to TRIM, so elements carry leading spaces and never match anything.',
    'Using LIKE on the packed column: \'%red%\' also matches \'infrared\' and \'bored\'.',
    'Ignoring empty elements from trailing or doubled separators.',
    'Writing a split that only works on one engine when the stack was not specified.',
  ],
  questions: [
    {
      id: 'p44-q1',
      difficulty: 'easy',
      prompt: 'Split the comma-separated tags column of products into one row per tag.',
      tables: ['products'],
      think: 'One input row becomes several output rows. What operation does that?',
      hint: 'A set-returning function in the FROM clause, laterally joined to each row.',
      approach: `Split the tags string into an array on the comma.\nUnnest that array so each element becomes a row.\nTrim each element to remove stray spaces.\nDiscard empty elements.`,
      solution: `SELECT p.product_id,
       p.product_name,
       TRIM(t.tag) AS tag
FROM products AS p
CROSS JOIN LATERAL unnest(string_to_array(p.tags, ',')) AS t(tag)
WHERE p.tags IS NOT NULL
  AND TRIM(t.tag) <> ''
ORDER BY p.product_id, tag;`,
      explanation: 'unnest expands an array into rows, and string_to_array turns the packed column into that array — the two together are PostgreSQL\'s split. The TRIM and the empty-string filter are not optional: "a, b," produces " b" and "" without them.',
      dialect: 'SQL Server: CROSS APPLY STRING_SPLIT(p.tags, \',\'). MySQL 8: JSON_TABLE over a JSON-ified string, or a numbers-table join. BigQuery: UNNEST(SPLIT(p.tags, \',\')).',
    },
    {
      id: 'p44-q2',
      difficulty: 'easy',
      prompt: 'Count how many tags each product carries.',
      tables: ['products'],
      think: 'Do you need to split at all, or can you count the separators?',
      hint: 'Both work — counting separators is cheaper but fails on empty elements.',
      approach: `Split the tags into rows and count them per product.\nAlso compute the count by counting separators, as a cross-check.\nCompare the two to reveal empty elements.\nOrder by the tag count.`,
      solution: `SELECT p.product_id,
       p.product_name,
       COUNT(*) FILTER (WHERE TRIM(t.tag) <> '') AS tag_count,
       CARDINALITY(string_to_array(p.tags, ','))  AS raw_element_count,
       p.tags
FROM products AS p
LEFT JOIN LATERAL unnest(string_to_array(p.tags, ',')) AS t(tag) ON TRUE
GROUP BY p.product_id, p.product_name, p.tags
ORDER BY tag_count DESC;`,
      explanation: 'Where the two counts disagree, the string contains empty elements from a trailing or doubled comma — a data-quality signal the naive count would hide. The LEFT JOIN LATERAL ... ON TRUE keeps products with no tags in the result with a count of zero.',
    },
    {
      id: 'p44-q3',
      difficulty: 'medium',
      prompt: 'Find all products tagged "sale", correctly, without matching "wholesale".',
      tables: ['products'],
      think: 'Why is LIKE \'%sale%\' wrong here, and what does splitting fix?',
      hint: 'Substring matching ignores element boundaries. Splitting restores them.',
      approach: `Split the tags into rows.\nCompare each trimmed element for exact equality against the target tag.\nKeep the products that have a matching element.\nContrast with the naive LIKE, which matches substrings across boundaries.`,
      solution: `SELECT DISTINCT p.product_id, p.product_name, p.tags
FROM products AS p
CROSS JOIN LATERAL unnest(string_to_array(p.tags, ',')) AS t(tag)
WHERE LOWER(TRIM(t.tag)) = 'sale'
ORDER BY p.product_id;

-- Wrong: also matches 'wholesale', 'presale', 'sales'
-- SELECT * FROM products WHERE tags LIKE '%sale%';`,
      explanation: 'Splitting restores the element boundaries that the packed string destroyed, so equality becomes meaningful again. The LIKE alternative can be patched with delimiters — \',\' || tags || \',\' LIKE \'%,sale,%\' — which works but is fragile against spacing.',
    },
    {
      id: 'p44-q4',
      difficulty: 'medium',
      prompt: 'Split the tags while preserving each tag\'s position in the original string.',
      tables: ['products'],
      think: 'Why might the order matter, and does the split function guarantee it?',
      hint: 'Position often encodes priority. Use the ordinality option rather than trusting output order.',
      approach: `Unnest the split array requesting an ordinality column.\nThat column gives each element its 1-based position.\nReturn the position alongside the trimmed tag.\nOrder by product then position.`,
      solution: `SELECT p.product_id,
       p.product_name,
       t.ord  AS tag_position,
       TRIM(t.tag) AS tag,
       CASE WHEN t.ord = 1 THEN 'primary' ELSE 'secondary' END AS tag_role
FROM products AS p
CROSS JOIN LATERAL unnest(string_to_array(p.tags, ',')) WITH ORDINALITY AS t(tag, ord)
WHERE p.tags IS NOT NULL
ORDER BY p.product_id, t.ord;`,
      explanation: 'WITH ORDINALITY is the only way to be sure of the original order — a set-returning function makes no guarantee about output row order otherwise. Position frequently carries meaning in these columns, with the first tag being the primary category.',
      dialect: 'WITH ORDINALITY is PostgreSQL. SQL Server 2022+: STRING_SPLIT(..., \',\', 1) adds an ordinal column; earlier versions have no ordering guarantee at all.',
    },
    {
      id: 'p44-q5',
      difficulty: 'medium',
      prompt: 'Produce a tag frequency report: how many products carry each tag.',
      tables: ['products'],
      think: 'Once the tags are rows, what kind of problem is this?',
      hint: 'An ordinary GROUP BY — which is exactly the point of splitting.',
      approach: `Split the tags into rows.\nNormalise each element by trimming and lowercasing.\nGroup by the normalised tag and count distinct products.\nOrder by frequency.`,
      solution: `WITH tagged AS (
    SELECT p.product_id,
           LOWER(TRIM(t.tag)) AS tag
    FROM products AS p
    CROSS JOIN LATERAL unnest(string_to_array(p.tags, ',')) AS t(tag)
    WHERE p.tags IS NOT NULL
      AND TRIM(t.tag) <> ''
)
SELECT tag,
       COUNT(DISTINCT product_id) AS products,
       ROUND(100.0 * COUNT(DISTINCT product_id)
             / (SELECT COUNT(*) FROM products), 1) AS pct_of_catalog
FROM tagged
GROUP BY tag
ORDER BY products DESC;`,
      explanation: 'Splitting first turns an awkward string problem into an ordinary aggregation, which is the whole argument for normalising. COUNT(DISTINCT product_id) rather than COUNT(*) guards against a product that lists the same tag twice.',
    },
    {
      id: 'p44-q6',
      difficulty: 'medium',
      prompt: 'Write the portable split using a numbers table, for an engine with no split function.',
      tables: ['products'],
      think: 'If you can generate 1..N, how do you extract the Nth element?',
      hint: 'A regex or substring expression picking the Nth field, joined to a numbers series bounded by the separator count.',
      approach: `Generate a series of positions from 1 up to the maximum possible element count.\nJoin each product to the positions that actually exist in its string, bounded by its separator count plus one.\nExtract the Nth element with a field-splitting function.\nTrim the result.`,
      solution: `WITH numbers AS (
    SELECT generate_series(1, 10) AS n
)
SELECT p.product_id,
       n.n AS position,
       TRIM(SPLIT_PART(p.tags, ',', n.n)) AS tag
FROM products AS p
JOIN numbers AS n
  ON n.n <= LENGTH(p.tags) - LENGTH(REPLACE(p.tags, ',', '')) + 1
WHERE p.tags IS NOT NULL
  AND TRIM(SPLIT_PART(p.tags, ',', n.n)) <> ''
ORDER BY p.product_id, n.n;`,
      explanation: 'LENGTH minus LENGTH-with-separators-removed counts the separators, so plus one is the element count — the bound that stops the join producing empty rows. This numbers-table shape is the fallback that works on any engine with a substring-by-position function.',
      dialect: 'SPLIT_PART is PostgreSQL. MySQL: SUBSTRING_INDEX(SUBSTRING_INDEX(tags, \',\', n), \',\', -1). SQL Server: a recursive CTE or STRING_SPLIT. The numbers table can be a permanent table rather than generate_series.',
    },
    {
      id: 'p44-q7',
      difficulty: 'hard',
      prompt: 'Find pairs of tags that frequently appear together on the same product.',
      tables: ['products'],
      think: 'Once tags are rows, what shape is a co-occurrence question?',
      hint: 'A self join within the product, with a strict inequality to avoid duplicate pairs.',
      approach: `Split the tags into normalised rows.\nSelf join that set on the product id.\nRequire the second tag to sort strictly after the first, removing self-pairs and mirrors.\nGroup by the pair and count the products.`,
      solution: `WITH tagged AS (
    SELECT DISTINCT p.product_id, LOWER(TRIM(t.tag)) AS tag
    FROM products AS p
    CROSS JOIN LATERAL unnest(string_to_array(p.tags, ',')) AS t(tag)
    WHERE p.tags IS NOT NULL AND TRIM(t.tag) <> ''
)
SELECT a.tag AS tag_a,
       b.tag AS tag_b,
       COUNT(*) AS products_with_both
FROM tagged AS a
JOIN tagged AS b
  ON  b.product_id = a.product_id
  AND b.tag > a.tag
GROUP BY a.tag, b.tag
HAVING COUNT(*) >= 2
ORDER BY products_with_both DESC
LIMIT 20;`,
      explanation: 'b.tag > a.tag does two jobs: it stops a tag pairing with itself and keeps only one of the two orderings of each pair. The DISTINCT in the CTE matters too — a product listing the same tag twice would otherwise inflate every pair it participates in.',
    },
    {
      id: 'p44-q8',
      difficulty: 'hard',
      prompt: 'Do the reverse: aggregate tags back into a comma-separated string per category.',
      tables: ['products'],
      think: 'Splitting and re-aggregating are inverses. What is the aggregate side?',
      hint: 'A string aggregate with an explicit ordering and DISTINCT.',
      approach: `Split the tags into normalised rows, carrying the category.\nGroup by the category.\nAggregate the distinct tags into an ordered comma-separated string.\nCount them alongside for context.`,
      solution: `WITH tagged AS (
    SELECT DISTINCT p.category, LOWER(TRIM(t.tag)) AS tag
    FROM products AS p
    CROSS JOIN LATERAL unnest(string_to_array(p.tags, ',')) AS t(tag)
    WHERE p.tags IS NOT NULL AND TRIM(t.tag) <> ''
)
SELECT category,
       COUNT(*) AS distinct_tags,
       STRING_AGG(tag, ', ' ORDER BY tag) AS all_tags
FROM tagged
GROUP BY category
ORDER BY distinct_tags DESC;`,
      explanation: 'The explicit ORDER BY inside STRING_AGG makes the output deterministic, which matters if the result is compared between runs or used as a key. Note this is a presentation step: re-packing into a string is fine for display and a mistake for storage.',
      dialect: 'STRING_AGG is PostgreSQL / SQL Server 2017+. MySQL: GROUP_CONCAT(DISTINCT tag ORDER BY tag SEPARATOR \', \'). Oracle: LISTAGG.',
    },
    {
      id: 'p44-q9',
      difficulty: 'hard',
      prompt: 'Find products whose tag list contains every one of a required set of tags.',
      tables: ['products'],
      think: '"Contains all of" is a universal quantifier. How do you express it after splitting?',
      hint: 'Count the matching tags per product and require the count to equal the size of the required set.',
      approach: `Split the tags into normalised rows.\nKeep only the rows whose tag is in the required set.\nGroup by product and count the distinct matches.\nKeep products whose match count equals the required set size.`,
      solution: `WITH required AS (
    SELECT * FROM (VALUES ('sale'), ('new'), ('featured')) AS r(tag)
),
tagged AS (
    SELECT DISTINCT p.product_id, p.product_name, LOWER(TRIM(t.tag)) AS tag
    FROM products AS p
    CROSS JOIN LATERAL unnest(string_to_array(p.tags, ',')) AS t(tag)
    WHERE p.tags IS NOT NULL AND TRIM(t.tag) <> ''
)
SELECT tg.product_id,
       tg.product_name,
       COUNT(*) AS required_tags_matched
FROM tagged AS tg
JOIN required AS r ON r.tag = tg.tag
GROUP BY tg.product_id, tg.product_name
HAVING COUNT(*) = (SELECT COUNT(*) FROM required)
ORDER BY tg.product_id;`,
      explanation: 'Counting matches and comparing against the required-set size is the relational-division idiom for "contains all of", and it generalises to any required list without changing the query shape. The DISTINCT in the CTE is essential — a duplicated tag would otherwise let one match count twice and satisfy the HAVING falsely.',
    },
    {
      id: 'p44-q10',
      difficulty: 'hard',
      prompt: 'Write the migration that normalises the tags column into a proper child table.',
      tables: ['products'],
      think: 'What do you gain that no amount of clever splitting can provide?',
      hint: 'Indexes, foreign keys, and joins that the planner can optimise.',
      approach: `Create a child table with one row per product and tag, with a composite primary key.\nPopulate it by splitting the existing column.\nAdd an index on the tag for lookup in the other direction.\nOnly then drop the packed column.`,
      solution: `-- 1. The normalised child table
CREATE TABLE product_tags (
    product_id INT  NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    tag        TEXT NOT NULL,
    position   INT  NOT NULL,
    PRIMARY KEY (product_id, tag)
);

-- 2. Backfill by splitting the existing column
INSERT INTO product_tags (product_id, tag, position)
SELECT p.product_id, LOWER(TRIM(t.tag)), t.ord
FROM products AS p
CROSS JOIN LATERAL unnest(string_to_array(p.tags, ',')) WITH ORDINALITY AS t(tag, ord)
WHERE p.tags IS NOT NULL
  AND TRIM(t.tag) <> ''
ON CONFLICT (product_id, tag) DO NOTHING;

-- 3. Index for lookups in the other direction
CREATE INDEX product_tags_tag_idx ON product_tags (tag);

-- 4. Only after verifying counts match: ALTER TABLE products DROP COLUMN tags;`,
      explanation: 'The index on tag turns "which products have this tag" from a full scan plus split into an index lookup, which is the gain no query-level workaround can replicate. ON CONFLICT DO NOTHING absorbs products that listed a tag twice, and dropping the old column last means the backfill can be verified before anything is lost.',
      dialect: 'ON CONFLICT is PostgreSQL / SQLite. MySQL: INSERT IGNORE. SQL Server: MERGE or a NOT EXISTS guard. A native array or JSONB column with a GIN index is a reasonable alternative to the child table.',
    },
  ],
};
