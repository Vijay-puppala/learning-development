import type { Pattern } from '../types';

export const p47: Pattern = {
  num: 47,
  slug: 'string-pattern-matching',
  title: 'String Pattern Matching',
  concept: 'LIKE',
  category: 'Reshaping & Text',
  tagline: 'Wildcards, case, escapes and the index cliff — matching text is easy to write and easy to get wrong.',
  theory: `LIKE has exactly two wildcards: **%** matches any sequence of characters including none, and **_** matches exactly one. Everything else is literal. That is the whole grammar, and the subtleties are all around it.

**Case sensitivity depends on the engine and the collation.** PostgreSQL's LIKE is case-sensitive and ILIKE is not. MySQL is case-insensitive by default under its usual collations. SQL Server follows the column's collation. The portable answer is LOWER(col) LIKE LOWER(pattern) — at the cost of the index.

**Index behaviour is the thing that matters at scale.** A pattern anchored at the start — 'abc%' — can use a B-tree index range scan. A leading wildcard — '%abc' — cannot, and forces a full scan. That single distinction explains most LIKE performance questions. Trigram indexes (pg_trgm) or a full-text index are the real fixes for contains-style search.

**Escaping.** To match a literal % or _ you need an ESCAPE clause, otherwise a user searching for "50%" matches everything.

When the pattern needs alternation, repetition or anchoring, LIKE runs out and you want a regex — PostgreSQL's ~, MySQL's REGEXP, Oracle's REGEXP_LIKE. SQL Server has none, which is worth knowing before you promise one.`,
  pitfalls: [
    'A leading wildcard, which makes the predicate unable to use a B-tree index.',
    'Assuming case behaviour. It depends on the engine and the collation, not on LIKE itself.',
    'Forgetting to escape a literal % or _ in user-supplied search terms.',
    'Wrapping the column in LOWER() and losing the index — index the expression instead.',
    'Using LIKE on a comma-separated column, where \'%sale%\' also matches \'wholesale\'.',
  ],
  questions: [
    {
      id: 'p47-q1',
      difficulty: 'easy',
      prompt: 'Find customers whose email is at a gmail.com address.',
      tables: ['customers'],
      think: 'Where does the wildcard go, and what does that do to index usability?',
      hint: 'A trailing pattern needs a leading wildcard, which cannot use a plain index.',
      approach: `Match any sequence of characters followed by the domain.\nUse a leading wildcard, since the domain is at the end.\nNote that this cannot use a B-tree index on email.\nReturn the matching customers.`,
      solution: `SELECT customer_id,
       customer_name,
       email
FROM customers
WHERE email LIKE '%@gmail.com'
ORDER BY customer_id;`,
      explanation: 'The leading % forces a full scan because a B-tree index is ordered by the start of the value. If this query matters, index the reversed string or extract the domain into its own indexed column — both turn it back into an anchored match.',
    },
    {
      id: 'p47-q2',
      difficulty: 'easy',
      prompt: 'Find products whose name starts with "Pro", case-insensitively.',
      tables: ['products'],
      think: 'An anchored pattern can use an index — unless something else prevents it.',
      hint: 'LOWER(col) breaks the index on col. Use ILIKE, or index the expression.',
      approach: `Match the prefix followed by any characters.\nUse a case-insensitive operator rather than wrapping the column in LOWER.\nNote that an anchored pattern is index-friendly.\nReturn the matching products.`,
      solution: `SELECT product_id, product_name, category, price
FROM products
WHERE product_name ILIKE 'Pro%'
ORDER BY product_name;

-- Portable but index-hostile unless you index the expression:
-- WHERE LOWER(product_name) LIKE LOWER('Pro%')
-- CREATE INDEX products_name_lower_idx ON products (LOWER(product_name));`,
      explanation: 'An anchored pattern is the one case where LIKE can seek rather than scan, so preserving that is worth some effort. LOWER(product_name) destroys the index on product_name — but an index on the expression LOWER(product_name) restores it exactly.',
      dialect: 'ILIKE is PostgreSQL. MySQL is case-insensitive by default under ci collations. SQL Server follows the column collation, or use COLLATE explicitly.',
    },
    {
      id: 'p47-q3',
      difficulty: 'medium',
      prompt: 'Find products whose name has exactly five characters and starts with "A".',
      tables: ['products'],
      think: 'Which wildcard counts characters rather than matching any number of them?',
      hint: 'Underscore matches exactly one character.',
      approach: `Match a literal A followed by exactly four single-character wildcards.\nThat fixes the total length at five.\nReturn the matching products.\nCross-check with a length comparison.`,
      solution: `SELECT product_id,
       product_name,
       LENGTH(product_name) AS len
FROM products
WHERE product_name LIKE 'A____'
ORDER BY product_name;`,
      explanation: 'Four underscores after the A means exactly four more characters, so the pattern is anchored at both ends by construction. LENGTH(product_name) = 5 AND product_name LIKE \'A%\' is the equivalent and is easier to read once the count gets large.',
    },
    {
      id: 'p47-q4',
      difficulty: 'medium',
      prompt: 'Find products whose name literally contains a percent sign.',
      tables: ['products'],
      think: 'The character you are searching for is also the wildcard. What resolves that?',
      hint: 'An ESCAPE clause naming an escape character.',
      approach: `Choose an escape character that cannot appear in the data.\nPrefix the literal percent sign with it in the pattern.\nDeclare the escape character with an ESCAPE clause.\nWrap the whole thing in wildcards to search anywhere in the name.`,
      solution: `SELECT product_id, product_name
FROM products
WHERE product_name LIKE '%!%%' ESCAPE '!'
ORDER BY product_name;

-- Without ESCAPE, '%%%' means "anything", and every row matches.`,
      explanation: 'Without the escape, the pattern is three wildcards and matches every row — which is exactly the bug that appears when a user searches for "50%" in an unescaped search box. Any user-supplied LIKE term must have %, _ and the escape character itself escaped before it reaches the query.',
    },
    {
      id: 'p47-q5',
      difficulty: 'medium',
      prompt: 'Find customers whose email is malformed: missing an @, missing a dot after it, or containing a space.',
      tables: ['customers'],
      think: 'Several independent rules over one column. How do you report which rule each row broke?',
      hint: 'One NOT LIKE or LIKE per rule, combined with OR, plus a CASE naming the failure.',
      approach: `Test for the absence of an at sign.\nTest for the absence of a dot after the at sign.\nTest for a space anywhere in the value.\nCombine with OR and label which rule failed first.`,
      solution: `SELECT customer_id,
       email,
       CASE WHEN email NOT LIKE '%@%'      THEN 'no @'
            WHEN email NOT LIKE '%@%.%'    THEN 'no domain dot'
            WHEN email LIKE '% %'          THEN 'contains a space'
            WHEN email LIKE '@%'           THEN 'starts with @'
            ELSE                                'other' END AS problem
FROM customers
WHERE email IS NOT NULL
  AND (email NOT LIKE '%@%.%'
    OR email LIKE '% %'
    OR email LIKE '@%')
ORDER BY problem, customer_id;`,
      explanation: 'LIKE-based validation catches the obvious failures cheaply and will never be a full email validator — the real grammar needs a regex or a library. Naming the specific rule each row broke turns a rejection list into something someone can actually fix.',
    },
    {
      id: 'p47-q6',
      difficulty: 'medium',
      prompt: 'Search products for any of several keywords in one query.',
      tables: ['products'],
      think: 'Several OR-ed LIKE clauses, or something more compact?',
      hint: 'A keyword table plus a join, or a regex alternation.',
      approach: `Put the keywords in a small VALUES list rather than in the WHERE clause.\nJoin products to that list with a LIKE condition.\nDeduplicate products matching several keywords, or count the matches.\nThis keeps the keyword list data rather than code.`,
      solution: `WITH keywords AS (
    SELECT * FROM (VALUES ('pro'), ('max'), ('ultra')) AS k(word)
)
SELECT p.product_id,
       p.product_name,
       COUNT(*)                                   AS keywords_matched,
       STRING_AGG(k.word, ', ' ORDER BY k.word)   AS matched_words
FROM products AS p
JOIN keywords AS k ON LOWER(p.product_name) LIKE '%' || k.word || '%'
GROUP BY p.product_id, p.product_name
ORDER BY keywords_matched DESC, p.product_name;`,
      explanation: 'Treating the keyword list as data rather than as a hand-written chain of ORs means the list can come from a table or a parameter without rewriting the query. It also gives you the match count for free, which is a crude but useful relevance score.',
    },
    {
      id: 'p47-q7',
      difficulty: 'hard',
      prompt: 'Show why a leading wildcard is slow, and what actually fixes it.',
      tables: ['products'],
      think: 'What does a B-tree index let you do, and why does a leading wildcard prevent it?',
      hint: 'The index is sorted by the start of the value, so a prefix can be seeked and a suffix cannot.',
      approach: `Compare an anchored pattern against one with a leading wildcard using EXPLAIN.\nObserve the index scan in one and the sequential scan in the other.\nIntroduce a trigram index, which supports contains-style matching.\nRe-check the plan.`,
      solution: `EXPLAIN ANALYZE
SELECT * FROM products WHERE product_name LIKE 'Pro%';     -- can use a B-tree index

EXPLAIN ANALYZE
SELECT * FROM products WHERE product_name LIKE '%Pro%';    -- cannot: full scan

-- The real fix for contains-style search:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX products_name_trgm_idx
--     ON products USING gin (product_name gin_trgm_ops);
-- The '%Pro%' query can now use the trigram index.`,
      explanation: 'A B-tree stores values in sorted order, so a known prefix identifies a contiguous range while a known suffix could be anywhere — that asymmetry is the whole explanation. A trigram index indexes every three-character sequence instead, which is why it can answer a contains query that a B-tree cannot.',
      dialect: 'pg_trgm is PostgreSQL. MySQL and SQL Server offer full-text indexes for word-based search; neither indexes arbitrary substrings.',
    },
    {
      id: 'p47-q8',
      difficulty: 'hard',
      prompt: 'Use a regular expression to find product names matching a code pattern: three letters, a dash, then four digits.',
      tables: ['products'],
      think: 'What can a regex express that LIKE cannot?',
      hint: 'Character classes, repetition counts and anchoring.',
      approach: `Write a regex with an anchor at each end.\nUse a character class with a repetition count for the letters and the digits.\nApply it with the engine's regex operator.\nExtract the parts for verification.`,
      solution: `SELECT product_id,
       product_name,
       SUBSTRING(product_name FROM '^([A-Z]{3})') AS code_prefix,
       SUBSTRING(product_name FROM '([0-9]{4})$') AS code_number
FROM products
WHERE product_name ~ '^[A-Z]{3}-[0-9]{4}$'
ORDER BY product_name;`,
      explanation: 'The ^ and $ anchors make this an exact-shape test rather than a contains test, which LIKE could only approximate with a long chain of underscores and no character classes. SUBSTRING with a capture group extracts the parts, turning validation into parsing in the same pass.',
      dialect: 'The ~ operator and SUBSTRING ... FROM pattern are PostgreSQL. MySQL: REGEXP and REGEXP_SUBSTR. Oracle: REGEXP_LIKE and REGEXP_SUBSTR. SQL Server has no regex support.',
    },
    {
      id: 'p47-q9',
      difficulty: 'hard',
      prompt: 'Build a safe search query for a user-supplied term, escaping wildcards.',
      tables: ['products'],
      think: 'What happens if the user types "%" or "_" or the escape character itself?',
      hint: 'Escape all three before building the pattern, in the right order.',
      approach: `Take the raw search term as a parameter.\nEscape the escape character first, then the two wildcards.\nBuild the pattern by wrapping the escaped term in wildcards.\nDeclare the ESCAPE clause.`,
      solution: `WITH params AS (
    SELECT '50%_off' AS raw_term          -- pretend this came from a user
),
escaped AS (
    SELECT raw_term,
           REPLACE(REPLACE(REPLACE(raw_term, '!', '!!'), '%', '!%'), '_', '!_')
             AS safe_term
    FROM params
)
SELECT p.product_id, p.product_name, e.raw_term, e.safe_term
FROM products AS p
CROSS JOIN escaped AS e
WHERE LOWER(p.product_name) LIKE '%' || LOWER(e.safe_term) || '%' ESCAPE '!'
ORDER BY p.product_name;`,
      explanation: 'The escape character must be escaped first, or escaping the wildcards would then double-escape the escapes it just inserted. Without this, a user searching for "50%" gets every row back and concludes the search is broken — which is the LIKE equivalent of an injection bug.',
    },
    {
      id: 'p47-q10',
      difficulty: 'hard',
      prompt: 'Rank search results by match quality: exact match first, then prefix, then contains.',
      tables: ['products'],
      think: 'Three match types with an implied priority. How do you turn that into a sortable score?',
      hint: 'A CASE assigning a score per match type, then order by it.',
      approach: `Test the product name against the search term at three levels of specificity.\nAssign a score in a CASE, most specific first.\nFilter to rows that matched at any level.\nOrder by the score, then by a secondary criterion such as name length.`,
      solution: `WITH params AS (SELECT 'pro' AS term)
SELECT p.product_id,
       p.product_name,
       CASE WHEN LOWER(p.product_name) =         LOWER(pr.term)         THEN 1
            WHEN LOWER(p.product_name) LIKE LOWER(pr.term) || '%'       THEN 2
            WHEN LOWER(p.product_name) LIKE '%' || LOWER(pr.term) || '%' THEN 3
       END AS match_rank,
       CASE WHEN LOWER(p.product_name) =         LOWER(pr.term)         THEN 'exact'
            WHEN LOWER(p.product_name) LIKE LOWER(pr.term) || '%'       THEN 'prefix'
            ELSE                                                             'contains'
       END AS match_type,
       LENGTH(p.product_name) AS name_length
FROM products AS p
CROSS JOIN params AS pr
WHERE LOWER(p.product_name) LIKE '%' || LOWER(pr.term) || '%'
ORDER BY match_rank, name_length, p.product_name;`,
      explanation: 'The CASE arms are evaluated top to bottom, so ordering them most-specific-first is what makes an exact match score 1 rather than falling through to 3. Using name length as the secondary sort is a cheap relevance heuristic — in a short name the search term is a larger fraction of the whole.',
    },
  ],
};
