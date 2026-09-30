import { Link, useParams } from 'react-router-dom';
import { PATTERNS } from '../data/patterns';
import { QuestionCard } from '../components/QuestionCard';
import { ProgressBar } from '../components/ProgressBar';
import { countFor } from '../lib/progress';
import { useProgress } from '../lib/useProgress';
import { NotFoundPage } from './NotFoundPage';

export function PatternPage() {
  const { slug } = useParams();
  useProgress();

  const idx = PATTERNS.findIndex((p) => p.slug === slug);
  if (idx === -1) return <NotFoundPage />;

  const pattern = PATTERNS[idx];
  const prev = idx > 0 ? PATTERNS[idx - 1] : null;
  const next = idx < PATTERNS.length - 1 ? PATTERNS[idx + 1] : null;
  const ids = pattern.questions.map((q) => q.id);
  const c = countFor(ids);

  return (
    <>
      <div className="crumbs">
        <Link to="/">All patterns</Link> › {pattern.category}
      </div>

      <div className="pattern-head">
        <div className="eyebrow">Pattern {String(pattern.num).padStart(2, '0')} of 50</div>
        <h1>{pattern.title}</h1>
        <span className="concept-big">{pattern.concept}</span>
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
        <h2>10 questions</h2>
        <span>Commit to an approach before you reveal anything.</span>
      </div>

      {pattern.questions.map((q, i) => (
        <QuestionCard key={q.id} q={q} index={i + 1} />
      ))}

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
