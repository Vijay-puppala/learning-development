import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="empty">
      <h1>404 — no rows returned</h1>
      <p>
        That pattern is not in the catalog. <Link to="/">Back to all 50 patterns</Link>.
      </p>
    </div>
  );
}
