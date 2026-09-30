/**
 * A deliberately small SQL highlighter. Kept in its own module so
 * scripts/check-highlighter.mjs can assert against the same code the UI runs.
 */
const KEYWORDS = [
  'SELECT','FROM','WHERE','GROUP BY','ORDER BY','HAVING','INNER JOIN','LEFT OUTER JOIN',
  'RIGHT OUTER JOIN','FULL OUTER JOIN','LEFT JOIN','RIGHT JOIN','CROSS JOIN','CROSS APPLY',
  'JOIN','ON','AS','AND','OR','NOT','IN','EXISTS','CASE','WHEN','THEN','ELSE','END','WITH',
  'RECURSIVE','UNION ALL','UNION','INTERSECT ALL','INTERSECT','EXCEPT ALL','EXCEPT','MINUS',
  'DISTINCT ON','DISTINCT','LIMIT','OFFSET','FETCH','FIRST','NEXT','ROWS ONLY','OVER',
  'PARTITION BY','BETWEEN','IS NOT DISTINCT FROM','IS DISTINCT FROM','IS NOT NULL','IS NULL',
  'IS NOT TRUE','IS','NULL','ASC','DESC','INSERT INTO','UPDATE','DELETE','SET','VALUES',
  'MERGE','USING','MATCHED','BY SOURCE','CREATE','UNIQUE','INDEX','TABLE','TEMP','EXTENSION',
  'ALTER','DROP','COLUMN','ADD','PRIMARY KEY','REFERENCES','FOREIGN KEY','CASCADE','EXPLAIN',
  'ANALYZE','BUFFERS','VERBOSE','ROWS','RANGE','GROUPS','UNBOUNDED','PRECEDING','FOLLOWING',
  'CURRENT ROW','INTERVAL','CAST','TOP','LATERAL','QUALIFY','FILTER','WITHIN GROUP','PIVOT',
  'UNPIVOT','FOR','TRUE','FALSE','ILIKE','LIKE','ESCAPE','WINDOW','GROUPING SETS','ROLLUP',
  'CUBE','NULLS FIRST','NULLS LAST','BEGIN','COMMIT','ROLLBACK','CONFLICT','DO','NOTHING',
  'INCLUDE','INHERITS','ALL','ANY','SOME','EXCLUDE','DATE','INT','BIGINT','TEXT','NUMERIC',
  'VARCHAR','BOOLEAN','TIMESTAMP','DEFAULT','CONSTRAINT','IF','WHILE','RETURNING',
];

const FUNCS = [
  'ROW_NUMBER','RANK','DENSE_RANK','NTILE','LAG','LEAD','FIRST_VALUE','LAST_VALUE','NTH_VALUE',
  'SUM','AVG','COUNT','MIN','MAX','COALESCE','NULLIF','GREATEST','LEAST','ABS','ROUND','CEIL',
  'FLOOR','DATEDIFF','DATE_TRUNC','DATE_PART','EXTRACT','DATEADD','DATEPART','AGE','NOW',
  'CURRENT_DATE','CURRENT_TIMESTAMP','LENGTH','LEN','DATALENGTH','OCTET_LENGTH','UPPER','LOWER',
  'TRIM','SUBSTRING','SUBSTR','CONCAT','CONCAT_WS','SPLIT_PART','STRING_SPLIT','STRING_AGG',
  'ARRAY_AGG','LISTAGG','GROUP_CONCAT','REGEXP_REPLACE','REPLACE','POSITION','GENERATE_SERIES',
  'PERCENTILE_CONT','PERCENT_RANK','CUME_DIST','MODE','TO_CHAR','TO_DATE','CARDINALITY','UNNEST',
  'STRING_TO_ARRAY','MD5','STDDEV','STDEV','VARIANCE','FORMAT','REPEAT','ARRAY_LENGTH',
  'GROUPING','PG_SIZE_PRETTY','PG_RELATION_SIZE','APPROX_COUNT_DISTINCT','HASHBYTES','QUOTENAME',
];

/** Longest-first so "LEFT JOIN" beats "JOIN" and "UNION ALL" beats "UNION". */
const alt = (words: string[]) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'))
    .join('|');

/**
 * One pass, one regex, in priority order: comments, string literals, keywords,
 * function names, numbers. Matching in a single pass is what keeps a keyword
 * inside a string literal from being recoloured — an earlier alternative wins,
 * so the literal is consumed whole before the keyword rule ever sees it.
 */
const TOKEN_RE = new RegExp(
  [
    '(--[^\\n]*)',                    // 1 comment
    "('(?:[^']|'')*')",               // 2 string literal, '' escape included
    `\\b(${alt(KEYWORDS)})\\b`,       // 3 keyword
    `\\b(${alt(FUNCS)})\\b(?=\\s*\\()`, // 4 function call
    '\\b(\\d+(?:\\.\\d+)?)\\b',       // 5 number
  ].join('|'),
  'gi',
);

const CLASS_BY_GROUP = ['cmt', 'str', 'kw', 'fn', 'num'];

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function highlight(sql: string): string {
  let out = '';
  let last = 0;

  for (const m of sql.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    out += escapeHtml(sql.slice(last, start));
    // Groups 1..5 map to the classes above; exactly one is defined per match.
    const groupIndex = CLASS_BY_GROUP.findIndex((_, i) => m[i + 1] !== undefined);
    out += `<span class="${CLASS_BY_GROUP[groupIndex]}">${escapeHtml(m[0])}</span>`;
    last = start + m[0].length;
  }

  return out + escapeHtml(sql.slice(last));
}
