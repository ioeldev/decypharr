import { Input } from '@/shared/components/ui/input';
import { NativeSelectOption, NativeSelect } from '@/shared/components/ui/native-select';
import type { QueueFilters as Filters } from '../../../queues.types';

interface QueueFiltersProps {
  filters: Filters;
  categories: string[];
  onChange: (filters: Filters) => void;
}

export default function QueueFilters({ filters, categories, onChange }: QueueFiltersProps) {
  return (
    <div className="flex gap-3 flex-wrap">
      <Input
        aria-label="Search queues"
        placeholder="Search queues…"
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value, page: 1 })}
      />
      <NativeSelect
        aria-label="State"
        value={filters.state}
        onChange={(event) => onChange({ ...filters, state: event.target.value, page: 1 })}
      >
        <NativeSelectOption value="">All States</NativeSelectOption>
        <NativeSelectOption value="pausedUP">Completed</NativeSelectOption>
        <NativeSelectOption value="downloading">Downloading</NativeSelectOption>
        <NativeSelectOption value="error">Error</NativeSelectOption>
      </NativeSelect>
      <NativeSelect
        aria-label="Category"
        value={filters.category}
        onChange={(event) => onChange({ ...filters, category: event.target.value, page: 1 })}
      >
        <NativeSelectOption value="">All Categories</NativeSelectOption>
        {categories.map((category) => (
          <NativeSelectOption key={category} value={category}>
            {category}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Sort queues"
        value={filters.sort}
        onChange={(event) => onChange({ ...filters, sort: event.target.value, page: 1 })}
      >
        <NativeSelectOption value="added_on:desc">Date Added (Newest First)</NativeSelectOption>
        <NativeSelectOption value="added_on:asc">Date Added (Oldest First)</NativeSelectOption>
        <NativeSelectOption value="name:asc">Name (A–Z)</NativeSelectOption>
        <NativeSelectOption value="name:desc">Name (Z–A)</NativeSelectOption>
        <NativeSelectOption value="size:desc">Size (Largest First)</NativeSelectOption>
        <NativeSelectOption value="size:asc">Size (Smallest First)</NativeSelectOption>
        <NativeSelectOption value="progress:desc">Progress (Most First)</NativeSelectOption>
        <NativeSelectOption value="progress:asc">Progress (Least First)</NativeSelectOption>
      </NativeSelect>
    </div>
  );
}
