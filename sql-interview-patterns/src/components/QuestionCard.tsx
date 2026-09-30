import { useState } from 'react';
import type { Question } from '../data/types';
import { CodeBlock } from './CodeBlock';
import { getState, setState } from '../lib/progress';
import { useProgress } from '../lib/useProgress';

/**
 * Three-stage reveal. The order is the whole point of the site: you are
 * nudged, then given the plan in words, and only then the syntax — so the
 * concept has to be reasoned about before the SQL can be copied.
 */
type Stage = 0 | 1 | 2 | 3;

export function QuestionCard({ q, index }: { q: Question; index: number }) {
  const [stage, setStage] = useState<Stage>(0);
  useProgress();
  const state = getState(q.id);

  const open = (s: Stage) => {
    setStage((prev) => (prev >= s ? prev : s));
    // Seeing the SQL before marking it solved is "peeked", not a failure —
    // it just keeps the progress bar honest.
    if (s === 3 && getState(q.id) === 'unseen') setState(q.id, 'peeked');
  };

  return (
    <article
      className={`q ${state === 'solved' ? 'is-solved' : state === 'peeked' ? 'is-peeked' : ''}`}
      id={q.id}
    >
      <div className="q-head">
        <span className="q-idx">Q{index}</span>
        <p className="q-prompt">{q.prompt}</p>
      </div>

      <div className="q-meta">
        <span className={`tag ${q.difficulty}`}>{q.difficulty}</span>
        {q.tables.map((t) => (
          <span className="tag" key={t}>
            {t}
          </span>
        ))}
      </div>

      <div className="think">
        <b>Think first:</b> {q.think}
      </div>

      <div className="reveals">
        <div className="reveal-bar">
          <button className="btn outline" type="button" onClick={() => open(1)} disabled={stage >= 1}>
            {stage >= 1 ? '1 · Hint shown' : '1 · Show hint'}
          </button>
          <button className="btn outline" type="button" onClick={() => open(2)} disabled={stage >= 2}>
            {stage >= 2 ? '2 · Approach shown' : '2 · Show approach'}
          </button>
          <button className="btn primary" type="button" onClick={() => open(3)} disabled={stage >= 3}>
            {stage >= 3 ? '3 · Solution shown' : '3 · Show solution'}
          </button>
          {stage > 0 && (
            <button className="btn" type="button" onClick={() => setStage(0)}>
              Hide all
            </button>
          )}
        </div>

        {stage >= 1 && (
          <div className="stage">
            <div className="stage-label">Hint</div>
            <div className="stage-body">
              <p>{q.hint}</p>
            </div>
          </div>
        )}

        {stage >= 2 && (
          <div className="stage">
            <div className="stage-label">Approach — in plain English, before any syntax</div>
            <div className="stage-body">
              <ol>
                {q.approach.split('\n').map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {stage >= 3 && (
          <div className="stage">
            <div className="stage-label">Solution</div>
            <div className="stage-body">
              <CodeBlock code={q.solution} />
              <p style={{ marginTop: 10 }}>{q.explanation}</p>
              {q.dialect && <div className="dialect">Dialect note — {q.dialect}</div>}
            </div>
          </div>
        )}
      </div>

      <div className="q-foot">
        <button
          className={`btn outline ${state === 'solved' ? 'active' : ''}`}
          type="button"
          onClick={() => setState(q.id, state === 'solved' ? 'unseen' : 'solved')}
        >
          {state === 'solved' ? '✓ Solved' : 'Mark as solved'}
        </button>
        {state !== 'unseen' && (
          <button className="btn" type="button" onClick={() => setState(q.id, 'unseen')}>
            Reset
          </button>
        )}
        <span className={`status ${state}`}>
          {state === 'solved' ? 'solved' : state === 'peeked' ? 'solution revealed' : 'not attempted'}
        </span>
      </div>
    </article>
  );
}
