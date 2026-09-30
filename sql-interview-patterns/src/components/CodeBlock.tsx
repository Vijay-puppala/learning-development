import { useState } from 'react';

const KEYWORDS = [
  'SELECT','FROM','WHERE','GROUP BY','ORDER BY','HAVING','JOIN','LEFT JOIN','RIGHT JOIN',
  'FULL OUTER JOIN','INNER JOIN','CROSS JOIN','LEFT OUTER JOIN','ON','AS','AND','OR','NOT',
  'IN','EXISTS','NOT EXISTS','CASE','WHEN','THEN','ELSE','END','WITH','RECURSIVE','UNION ALL',
  'UNION','INTERSECT','EXCEPT','DISTINCT','LIMIT','OFFSET','FETCH FIRST','ROWS ONLY','OVER',
  'PARTITION BY','BETWEEN','IS NULL','IS NOT NULL','NULL','ASC','DESC','INSERT INTO','UPDATE',
  'DELETE','SET','VALUES','MERGE','USING','MATCHED','CREATE','INDEX','EXPLAIN','ANALYZE',
  'ROWS','RANGE','UNBOUNDED','PRECEDING','FOLLOWING','CURRENT ROW','INTERVAL','CAST','TOP',
  'LATERAL','QUALIFY','FILTER','WITHIN GROUP','PIVOT','UNPIVOT','FOR','TRUE','FALSE','ILIKE','LIKE',
];

const FUNCS = [
  'ROW_NUMBER','RANK','DENSE_RANK','NTILE','LAG','LEAD','FIRST_VALUE','LAST_VALUE','NTH_VALUE',
  'SUM','AVG','COUNT','MIN','MAX','COALESCE','NULLIF','GREATEST','LEAST','ABS','ROUND','CEIL','FLOOR',
  'DATEDIFF','DATE_TRUNC','DATE_PART','EXTRACT','DATEADD','AGE','NOW','CURRENT_DATE','CURRENT_TIMESTAMP',
  'LENGTH','LEN','UPPER','LOWER','TRIM','SUBSTRING','CONCAT','CONCAT_WS','SPLIT_PART','STRING_SPLIT',
  'STRING_AGG','ARRAY_AGG','LISTAGG','REGEXP_REPLACE','REPLACE','POSITION','GENERATE_SERIES',
  'PERCENTILE_CONT','PERCENT_RANK','CUME_DIST','MODE','TO_CHAR','TO_DATE','CARDINALITY','UNNEST',
];

/** Longest-first so "LEFT JOIN" wins over "JOIN" and "UNION ALL" over "UNION". */
const kwRe = new RegExp(
  `\\b(${[...KEYWORDS].sort((a, b) => b.length - a.length).map((k) => k.replace(/ /g, '\\s+')).join('|')})\\b`,
  'gi',
);
const fnRe = new RegExp(`\\b(${FUNCS.join('|')})\\b(?=\\s*\\()`, 'gi');

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Deliberately small SQL highlighter. Strings and comments are masked out
 * first so a keyword inside a literal is never recolored.
 */
function highlight(sql: string): string {
  const masked: string[] = [];
  let out = escapeHtml(sql);

  const stash = (cls: string, text: string) => {
    masked.push(`<span class="${cls}">${text}</span>`);
    return `\u0000${masked.length - 1}\u0000`;
  };

  out = out.replace(/--[^\n]*/g, (m) => stash('cmt', m));
  out = out.replace(/'[^']*'/g, (m) => stash('str', m));
  out = out.replace(kwRe, (m) => stash('kw', m));
  out = out.replace(fnRe, (m) => stash('fn', m));
  out = out.replace(/\b\d+(\.\d+)?\b/g, (m) => stash('num', m));

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => masked[Number(i)]);
}

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — the code is selectable anyway */
    }
  };

  return (
    <div className="code">
      <button className="copy" onClick={copy} type="button">
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>
        <code dangerouslySetInnerHTML={{ __html: highlight(code) }} />
      </pre>
    </div>
  );
}
