import { DIALECT_NOTE, SCHEMA } from '../data/schema';

export function SchemaPage() {
  return (
    <>
      <div className="crumbs">Reference</div>
      <div className="pattern-head">
        <h1>The one schema behind all 500 questions</h1>
      </div>
      <div className="panel">
        <p>
          Every question on the site runs against these tables. Learning one schema well is closer
          to a real interview than re-reading a new one each time — by pattern 20 you should be
          reaching for the right table without looking.
        </p>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>{DIALECT_NOTE}</p>
      </div>
      {SCHEMA.map((t) => (
        <div className="table-card" key={t.name}>
          <h3>{t.name}</h3>
          <p className="purpose">{t.purpose}</p>
          <ul>
            {t.columns.map((c) => (
              <li key={c}>· {c}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
