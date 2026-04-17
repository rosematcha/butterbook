import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely';
import { recordDbQuery } from '../plugins/metrics.js';

// Kysely assigns a unique queryId to each query; we correlate start and end
// through it to measure duration. Operation kind is derived from the root node
// so we can label the histogram with select / insert / update / delete.
const queryStarts = new Map<string, { start: bigint; kind: string }>();

function kindOf(node: RootOperationNode): string {
  // Kysely nodes have a kind like 'SelectQueryNode' — strip the suffix.
  const k = (node as { kind?: string }).kind ?? 'unknown';
  return k.replace(/QueryNode$/, '').toLowerCase();
}

export class QueryMetricsPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    queryStarts.set(args.queryId.queryId, { start: process.hrtime.bigint(), kind: kindOf(args.node) });
    return args.node;
  }

  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    const entry = queryStarts.get(args.queryId.queryId);
    if (entry !== undefined) {
      queryStarts.delete(args.queryId.queryId);
      const durSec = Number(process.hrtime.bigint() - entry.start) / 1e9;
      recordDbQuery(entry.kind, durSec);
    }
    return args.result;
  }
}
