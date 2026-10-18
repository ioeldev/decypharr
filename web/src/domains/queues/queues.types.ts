export interface QueueEntry {
  info_hash: string;
  name: string;
  category?: string;
  protocol?: string;
  active_provider?: string;
  state?: string;
  size?: number;
  progress?: number;
  speed?: number;
  dlspeed?: number;
  num_seeds?: number;
}

export interface QueuePage {
  torrents: QueueEntry[];
  categories: string[];
  total: number;
  total_pages: number;
}

export interface QueueFilters {
  page: number;
  search: string;
  category: string;
  state: string;
  sort: string;
}
