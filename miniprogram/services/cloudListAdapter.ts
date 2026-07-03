export interface ListResult<T = any> {
  list: T[];
  total: number;
}

export interface CloudListPayload<T = any> {
  data?: T[];
  total?: number;
}

export function createEmptyListResult<T>(): ListResult<T> {
  return { list: [], total: 0 };
}

export function adaptCloudListResult<T>(result?: CloudListPayload<T> | null): ListResult<T> {
  if (!result) {
    return createEmptyListResult<T>();
  }
  return {
    list: Array.isArray(result.data) ? result.data : [],
    total: typeof result.total === 'number' ? result.total : 0,
  };
}
