export const Skeleton = ({ h = 90 }) => <div className="skeleton" style={{ height: h }} aria-hidden="true" />;

export const Badge = ({ tone = 'info', children }) => <span className={`badge ${tone}`}>{children}</span>;

export const Stat = ({ label, value, hint }) => (
  <div className="card stat"><span className="muted">{label}</span><strong>{value}</strong>{hint && <small className="muted">{hint}</small>}</div>
);

// Handles loading, error and empty states for any API-driven block.
export function Async({ res, isEmpty, emptyText = 'Nothing to show yet.', children }) {
  if (res.loading) return <div aria-busy="true" aria-label="Loading"><Skeleton /><Skeleton /></div>;
  if (res.error && !res.data) {
    return (
      <div className="card state" role="alert">
        <p>Unable to load queue information. Please try again.</p>
        <button className="btn" onClick={res.reload}>Retry</button>
      </div>
    );
  }
  if (isEmpty && isEmpty(res.data)) return <div className="card state">{emptyText}</div>;
  return children(res.data);
}
