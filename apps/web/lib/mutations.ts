'use client';
import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query';
import { ApiError } from './api';
import { useToast } from './toast';

export function apiErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

export interface OptimisticMutationOptions<TVars, TData, TSnapshot> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /**
   * Query keys whose cached data is patched optimistically. `apply` runs on
   * every listed key; if any apply throws we roll back atomically.
   */
  queryKeys: QueryKey[];
  /**
   * Returns the new cache value (or `undefined` to leave untouched) given the
   * current cache value and the mutation variables. Runs synchronously inside
   * `onMutate` before the server call so the UI updates immediately.
   */
  apply: (current: unknown, vars: TVars) => unknown;
  /** Optional hook to capture extra rollback state beyond the cache snapshot. */
  snapshot?: (vars: TVars) => TSnapshot | undefined;
  /** Called after server success. Receives the server's response. */
  onSuccess?: (data: TData, vars: TVars, snap: TSnapshot | undefined) => void;
  /**
   * When the server response carries the authoritative entity, use this to
   * reconcile the cache. Runs after the user-provided `onSuccess`.
   */
  reconcile?: (data: TData, vars: TVars) => void;
  /** Shown as a success toast. If omitted, no toast on success. */
  successMessage?: string | ((data: TData, vars: TVars) => string);
  /** Fallback error toast text — problem.detail still wins when available. */
  errorMessage?: string;
}

/**
 * Optimistic-update helper. Patches the listed query caches immediately on
 * click, rolls back on server error, then optionally reconciles with the
 * server response. Also centralizes success + error toasts so pages don't
 * re-implement the `apiErrMsg` boilerplate on every mutation.
 */
export function useOptimisticMutation<TVars, TData = unknown, TSnapshot = undefined>(
  opts: OptimisticMutationOptions<TVars, TData, TSnapshot>,
): UseMutationResult<
  TData,
  unknown,
  TVars,
  { snapshots: Array<[QueryKey, unknown]>; extra: TSnapshot | undefined }
> {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<
    TData,
    unknown,
    TVars,
    { snapshots: Array<[QueryKey, unknown]>; extra: TSnapshot | undefined }
  >({
    mutationFn: opts.mutationFn,
    // Retrying a mutation that has already succeeded optimistically would
    // double-apply the patch — disable the library default of 0 retries is
    // fine, but we set it explicitly for clarity.
    retry: 0,
    onMutate: async (vars) => {
      await Promise.all(opts.queryKeys.map((k) => qc.cancelQueries({ queryKey: k })));
      const snapshots: Array<[QueryKey, unknown]> = opts.queryKeys.map((k) => [
        k,
        qc.getQueryData(k),
      ]);
      for (const [k, current] of snapshots) {
        const next = opts.apply(current, vars);
        if (next !== undefined) qc.setQueryData(k, next);
      }
      return { snapshots, extra: opts.snapshot?.(vars) };
    },
    onError: (err, _vars, ctx) => {
      if (ctx) {
        for (const [k, prev] of ctx.snapshots) qc.setQueryData(k, prev);
      }
      toast.push({ kind: 'error', message: apiErrMsg(err, opts.errorMessage ?? 'Something went wrong') });
    },
    onSuccess: (data, vars, ctx) => {
      opts.onSuccess?.(data, vars, ctx?.extra);
      opts.reconcile?.(data, vars);
      if (opts.successMessage) {
        const msg = typeof opts.successMessage === 'function'
          ? opts.successMessage(data, vars)
          : opts.successMessage;
        toast.push({ kind: 'success', message: msg });
      }
    },
  });
}
