import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PATTERNS } from '../data/patterns';
import { CATEGORY_ORDER, type Category } from '../data/types';
import { ProgressBar } from '../components/ProgressBar';
import { countFor, resetAll } from '../lib/progress';
import { useProgress } from '../lib/useProgress';

const METHOD = [
  {
    n: 'Step 1',
    h: 'Read the ask',
    p: 'Each question names the tables and states the business question — no syntax on screen yet.',
  },
  {
    n: 'Step 2',
    h: 'Answer "think first"',
    p: 'A prompt about the concept: what is the grain, what breaks ties, what happens to NULLs.',
  },
  {
    n: 'Step 3',
    h: 'Hint, then approach',
    p: 'A nudge, then the full plan in plain English. Write your SQL from the plan, not from memory.',
  },
  {
    n: 'Step 4',
    h: 'Reveal the solution',
    p: 'Compare. The explanation names the trap the query avoids, which is what interviewers probe.',
  },
];

export function HomePage() {
  useProgress();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');

  const allIds = useMemo(() => PATTERNS.flatMap((p) => p.questions.map((q) => q.id)), []);
  const overall = countFor(allIds);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PATTERNS.filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (!needle) return true;
      return (
        p.title.toLowerCase().includes(needle) ||
        p.concept.toLowerCase().includes(needle) ||
        p.tagline.toLowerCase().includes(needle) ||
        String(p.num) === needle
      );
    });
  }, [query, cat]);

  const groups = CATEGORY_ORDER.map((c) => ({
    cat: c,
    items: filtered.filter((p) => p.category === c),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <section className="hero">
        <h1>
          Master the <span className="grad">50 SQL patterns</span>
          <br />
          behind almost every interview question
        </h1>
        <p>
          Interviews do not test syntax — they test whether you can recognise which of a small set
          of shapes a problem has. Here are all 50 shapes, with 10 questions each, and the answer
          kept out of sight until you have committed to an approach.
        </p>
        <div className="method">
          {METHOD.map((m) => (
            <div className="method-step" key={m.n}>
              <div className="n">{m.n}</div>
              <h3>{m.h}</h3>
              <p>{m.p}</p>
            </div>
          ))}
        </div>

        <div className="overall">
          <div className="overall-stat">
            <b>{overall.solved}</b>
            <span>Solved</span>
          </div>
          <div className="overall-stat">
            <b>{overall.peeked}</b>
            <span>Revealed</span>
          </div>
          <div className="overall-stat">
            <b>{allIds.length}</b>
            <span>Questions</span>
          </div>
          <div className="bar-wrap">
            <ProgressBar solved={overall.solved} peeked={overall.peeked} total={allIds.length} />
          </div>
          {overall.solved + overall.peeked > 0 && (
            <button
              className="btn outline"
              type="button"
              onClick={() => {
                if (confirm('Clear all progress stored in this browser?')) resetAll();
              }}
            >
              Reset progress
            </button>
          )}
        </div>
      </section>

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search a pattern, a function, or a number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search patterns"
        />
        <div className="chips">
          <button
            className="chip"
            aria-pressed={cat === 'all'}
            onClick={() => setCat('all')}
            type="button"
          >
            All 50
          </button>
          {CATEGORY_ORDER.map((c) => (
            <button
              key={c}
              className="chip"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              type="button"
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 && <p className="empty">No pattern matches “{query}”.</p>}

      {groups.map((g) => (
        <section key={g.cat}>
          <div className="group-head">
            <h2>{g.cat}</h2>
            <span>
              {g.items.length} pattern{g.items.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid">
            {g.items.map((p) => {
              const ids = p.questions.map((q) => q.id);
              const c = countFor(ids);
              return (
                <Link className="card" to={`/pattern/${p.slug}`} key={p.slug}>
                  <div className="card-top">
                    <span className="card-num">{String(p.num).padStart(2, '0')}</span>
                    <h3>{p.title}</h3>
                  </div>
                  <span className="concept">{p.concept}</span>
                  <p className="tagline">{p.tagline}</p>
                  <div className="card-foot">
                    <ProgressBar solved={c.solved} peeked={c.peeked} total={ids.length} />
                    <span className="count">
                      {c.solved}/{ids.length}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
