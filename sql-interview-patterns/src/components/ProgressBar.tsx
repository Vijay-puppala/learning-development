export function ProgressBar({
  solved,
  peeked,
  total,
}: {
  solved: number;
  peeked: number;
  total: number;
}) {
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div
      className="bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={solved + peeked}
      aria-label={`${solved} solved, ${peeked} revealed, of ${total}`}
    >
      <i className="solved" style={{ width: `${pct(solved)}%` }} />
      <i className="peeked" style={{ width: `${pct(peeked)}%` }} />
    </div>
  );
}
