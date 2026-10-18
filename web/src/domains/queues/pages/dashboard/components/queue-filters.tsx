import type { QueueFilters as Filters } from '../../../queues.types';

interface QueueFiltersProps {
  filters: Filters;
  categories: string[];
  onChange: (filters: Filters) => void;
}

export default function QueueFilters({ filters, categories, onChange }: QueueFiltersProps) {
  return (
    <div className="flex gap-3">
      <input aria-label="Search queues" className="input input-sm" placeholder="Search queues…"
        value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value, page: 1 })} />
      <select aria-label="State" className="select select-sm" value={filters.state}
        onChange={(event) => onChange({ ...filters, state: event.target.value, page: 1 })}>
        <option value="">All States</option>
        <option value="pausedUP">Completed</option>
        <option value="downloading">Downloading</option>
        <option value="error">Error</option>
      </select>
      <select aria-label="Category" className="select select-sm" value={filters.category}
        onChange={(event) => onChange({ ...filters, category: event.target.value, page: 1 })}>
        <option value="">All Categories</option>
        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
      <select aria-label="Sort queues" className="select select-sm" value={filters.sort}
        onChange={(event) => onChange({ ...filters, sort: event.target.value, page: 1 })}>
        <option value="added_on:desc">Date Added (Newest First)</option>
        <option value="added_on:asc">Date Added (Oldest First)</option>
        <option value="name:asc">Name (A–Z)</option>
        <option value="name:desc">Name (Z–A)</option>
        <option value="size:desc">Size (Largest First)</option>
        <option value="size:asc">Size (Smallest First)</option>
        <option value="progress:desc">Progress (Most First)</option>
        <option value="progress:asc">Progress (Least First)</option>
      </select>
    </div>
  );
}
