import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PATTERN_META } from '../data/meta';
import { loadPattern } from '../data/loaders';
import type { Pattern } from '../data/types';
import { QuestionCard } from '../components/QuestionCard';
import { ProgressBar } from '../components/ProgressBar';
import { countFor } from '../lib/progress';
import { useProgress } from '../lib/useProgress';
import { NotFoundPage } from './NotFoundPage';

export function PatternPage() {
  const { slug } = useParams();
  useProgress();

  const idx = PATTERN_META.findIndex((p) => p.slug === slug);
  const meta = idx === -1 ? null : PATTERN_META[idx];

  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    setPattern(null);
    setFailed(false);
    loadPattern(meta.key)
      .then((p) => {
        if (!cancelled) setPattern(p);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [meta]);

  if (!meta) return <NotFoundPage />;

  const prev = idx > 0 ? PATTERN_META[idx - 1] : null;
  const next = idx < PATTERN_META.length - 1 ? PATTERN_META[idx + 1] : null;
  const ids = meta.questionIds;
  const c = countFor(ids);

  return (
    <>
      <div className="crumbs">
        <Link to="/">All patterns</Link> › {meta.category}
      </div>

      <div className="pattern-head">
        <div className="eyebrow">Pattern {String(meta.num).padStart(2, '0')} of 50</div>
        <h1>{meta.title}</h1>
        <span className="concept-big">{meta.concept}</span>
      </div>

      <div className="overall">
        <div className="overall-stat">
          <b>
            {c.solved}/{ids.length}
          </b>
          <span>Solved</span>
        </div>
        <div className="bar-wrap">
          <ProgressBar solved={c.solved} peeked={c.peeked} total={ids.length} />
        </div>
      </div>

      {failed && (
        <div className="panel pitfalls">
          <h2>Could not load this pattern</h2>
          <p>
            The questions failed to download. Check your connection and{' '}
            <a href={window.location.href}>reload</a>.
          </p>
        </div>
      )}

      {!pattern && !failed && <p className="empty">Loading questions…</p>}

      {pattern && (
        <>
          <div className="panel">
            <h2>The mental model</h2>
            {pattern.theory.split('\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <div className="panel pitfalls">
            <h2>What gets people rejected</h2>
            <ul>
              {pattern.pitfalls.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>

          <div className="group-head">
            <h2>{pattern.questions.length} questions</h2>
            <span>Commit to an approach before you reveal anything.</span>
          </div>

          {pattern.questions.map((q, i) => (
            <QuestionCard key={q.id} q={q} index={i + 1} />
          ))}
        </>
      )}

      <nav className="pager">
        {prev ? (
          <Link to={`/pattern/${prev.slug}`}>
            <span>← Previous</span>
            <b>
              {String(prev.num).padStart(2, '0')} · {prev.title}
            </b>
          </Link>
        ) : (
          <span style={{ flex: '1 1 220px' }} />
        )}
        {next ? (
          <Link className="next" to={`/pattern/${next.slug}`}>
            <span>Next →</span>
            <b>
              {String(next.num).padStart(2, '0')} · {next.title}
            </b>
          </Link>
        ) : (
          <span style={{ flex: '1 1 220px' }} />
        )}
      </nav>
    </>
  );
}
