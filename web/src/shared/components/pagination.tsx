export default function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return <div className="join">
    <button className="btn btn-sm join-item" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
    <span className="btn btn-sm join-item">{page} / {totalPages}</span>
    <button className="btn btn-sm join-item" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
  </div>;
}
