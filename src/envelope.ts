export type RawItem = Record<string, string>;

export interface OperationResult {
  totalCount: number;
  pageNo: number;
  items: RawItem[];
}

export interface RawBody {
  totalCount?: number;
  pageNo?: number;
  items?: RawItem[] | { item?: RawItem | RawItem[] } | "";
}

export interface RawApiResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: RawBody;
  };
}

export function normalizeItems(items: RawBody["items"]): RawItem[] {
  if (Array.isArray(items)) return items;
  if (items && typeof items === "object" && "item" in items) {
    const it = items.item;
    if (Array.isArray(it)) return it;
    if (it) return [it];
  }
  return [];
}
