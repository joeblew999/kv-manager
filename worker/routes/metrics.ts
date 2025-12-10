/**
 * KV Metrics Route Handler
 * 
 * Provides access to Cloudflare KV analytics via the GraphQL Analytics API.
 * Returns operation counts, latency percentiles, and usage data.
 */

import type { Env } from '../types';
import { logInfo, logError, logWarning, createErrorContext } from '../utils/error-logger';

// ============================================================================
// TYPES
// ============================================================================

interface KVOperationData {
    date: string;
    actionType: string;
    requests: number;
    latencyMsP50?: number;
    latencyMsP90?: number;
    latencyMsP99?: number;
}

interface KVMetricsSummary {
    namespaceId: string | null;
    startDate: string;
    endDate: string;
    totalOperations: number;
    operationsByType: Record<string, number>;
    avgLatencyMs: Record<string, { p50: number; p90: number; p99: number }>;
    dataPoints: KVOperationData[];
}

interface GraphQLResponse {
    data?: {
        viewer?: {
            accounts?: {
                kvOperationsAdaptiveGroups?: {
                    sum?: { requests?: number };
                    dimensions?: { date?: string; actionType?: string };
                    quantiles?: {
                        latencyMsP50?: number;
                        latencyMsP90?: number;
                        latencyMsP99?: number;
                    };
                }[];
            }[];
        };
    };
    errors?: { message: string }[];
}

// ============================================================================
// CACHING
// ============================================================================

const METRICS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes per project standards
const metricsCache = new Map<string, { data: KVMetricsSummary; timestamp: number }>();

function getCacheKey(accountId: string, namespaceId: string | null, startDate: string, endDate: string): string {
    return `metrics:${accountId}:${namespaceId ?? 'all'}:${startDate}:${endDate}`;
}

function getFromCache(key: string): KVMetricsSummary | null {
    const cached = metricsCache.get(key);
    if (cached && Date.now() - cached.timestamp < METRICS_CACHE_TTL) {
        return cached.data;
    }
    metricsCache.delete(key);
    return null;
}

function setCache(key: string, data: KVMetricsSummary): void {
    metricsCache.set(key, { data, timestamp: Date.now() });
}

// ============================================================================
// GRAPHQL QUERY
// ============================================================================

const KV_OPERATIONS_QUERY = `
query KvOperationsMetrics(
  $accountTag: string!
  $namespaceId: string
  $start: Date!
  $end: Date!
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      kvOperationsAdaptiveGroups(
        filter: { 
          namespaceId: $namespaceId
          date_geq: $start
          date_leq: $end
        }
        limit: 10000
        orderBy: [date_DESC]
      ) {
        sum {
          requests
        }
        dimensions {
          date
          actionType
        }
        quantiles {
          latencyMsP50
          latencyMsP90
          latencyMsP99
        }
      }
    }
  }
}
`;

const KV_OPERATIONS_ALL_QUERY = `
query KvOperationsAllMetrics(
  $accountTag: string!
  $start: Date!
  $end: Date!
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      kvOperationsAdaptiveGroups(
        filter: { 
          date_geq: $start
          date_leq: $end
        }
        limit: 10000
        orderBy: [date_DESC]
      ) {
        sum {
          requests
        }
        dimensions {
          date
          actionType
        }
        quantiles {
          latencyMsP50
          latencyMsP90
          latencyMsP99
        }
      }
    }
  }
}
`;

// ============================================================================
// RATE LIMITING
// ============================================================================

const RATE_LIMIT = {
    INITIAL_BACKOFF: 2000,
    MAX_BACKOFF: 8000,
    BACKOFF_MULTIPLIER: 2,
    RETRY_CODES: [429, 503, 504],
};

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithBackoff(
    url: string,
    options: RequestInit,
    maxRetries = 3
): Promise<Response> {
    let lastError: Error | null = null;
    let backoff = RATE_LIMIT.INITIAL_BACKOFF;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);

            if (!RATE_LIMIT.RETRY_CODES.includes(response.status)) {
                return response;
            }

            if (attempt < maxRetries) {
                await sleep(backoff);
                backoff = Math.min(backoff * RATE_LIMIT.BACKOFF_MULTIPLIER, RATE_LIMIT.MAX_BACKOFF);
            }
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxRetries) {
                await sleep(backoff);
                backoff = Math.min(backoff * RATE_LIMIT.BACKOFF_MULTIPLIER, RATE_LIMIT.MAX_BACKOFF);
            }
        }
    }

    throw lastError ?? new Error('Max retries exceeded');
}

// ============================================================================
// METRICS FETCHING
// ============================================================================

async function fetchKVMetrics(
    env: Env,
    namespaceId: string | null,
    startDate: string,
    endDate: string,
    isLocalDev: boolean
): Promise<KVMetricsSummary> {
    const ctx = createErrorContext('metrics', 'fetch_metrics', {
        ...(namespaceId !== null && { namespaceId }),
        metadata: { startDate, endDate }
    });

    if (!env.ACCOUNT_ID || !env.API_KEY) {
        logWarning('Missing API credentials for metrics', ctx);
        return createEmptyMetrics(namespaceId, startDate, endDate);
    }

    const cacheKey = getCacheKey(env.ACCOUNT_ID, namespaceId, startDate, endDate);
    const cached = getFromCache(cacheKey);
    if (cached) {
        logInfo('Returning cached metrics', ctx);
        return cached;
    }

    logInfo('Fetching KV metrics from GraphQL API', ctx);

    const query = namespaceId ? KV_OPERATIONS_QUERY : KV_OPERATIONS_ALL_QUERY;
    const variables: Record<string, string | null> = {
        accountTag: env.ACCOUNT_ID,
        start: startDate,
        end: endDate,
    };

    if (namespaceId) {
        variables['namespaceId'] = namespaceId;
    }

    try {
        const response = await fetchWithBackoff(
            'https://api.cloudflare.com/client/v4/graphql',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.API_KEY}`,
                },
                body: JSON.stringify({ query, variables }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GraphQL API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json() as GraphQLResponse;

        if (result.errors && result.errors.length > 0) {
            throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
        }

        const groups = result.data?.viewer?.accounts?.[0]?.kvOperationsAdaptiveGroups ?? [];
        const metrics = processMetricsData(groups, namespaceId, startDate, endDate);

        setCache(cacheKey, metrics);
        logInfo(`Fetched ${groups.length} metrics data points`, ctx);

        return metrics;
    } catch (error) {
        await logError(env, error instanceof Error ? error : String(error), ctx, isLocalDev);
        return createEmptyMetrics(namespaceId, startDate, endDate);
    }
}

function processMetricsData(
    groups: NonNullable<NonNullable<NonNullable<NonNullable<GraphQLResponse['data']>['viewer']>['accounts']>[0]['kvOperationsAdaptiveGroups']>,
    namespaceId: string | null,
    startDate: string,
    endDate: string
): KVMetricsSummary {
    const dataPoints: KVOperationData[] = [];
    const operationsByType: Record<string, number> = {};
    const latencyByType: Record<string, { p50: number[]; p90: number[]; p99: number[] }> = {};

    for (const group of groups) {
        const date = group.dimensions?.date ?? '';
        const actionType = group.dimensions?.actionType ?? 'unknown';
        const requests = group.sum?.requests ?? 0;

        const dataPoint: KVOperationData = {
            date,
            actionType,
            requests,
        };
        if (group.quantiles?.latencyMsP50 !== undefined) {
            dataPoint.latencyMsP50 = group.quantiles.latencyMsP50;
        }
        if (group.quantiles?.latencyMsP90 !== undefined) {
            dataPoint.latencyMsP90 = group.quantiles.latencyMsP90;
        }
        if (group.quantiles?.latencyMsP99 !== undefined) {
            dataPoint.latencyMsP99 = group.quantiles.latencyMsP99;
        }
        dataPoints.push(dataPoint);

        operationsByType[actionType] = (operationsByType[actionType] ?? 0) + requests;

        if (!latencyByType[actionType]) {
            latencyByType[actionType] = { p50: [], p90: [], p99: [] };
        }
        if (group.quantiles?.latencyMsP50 !== undefined) {
            latencyByType[actionType].p50.push(group.quantiles.latencyMsP50);
        }
        if (group.quantiles?.latencyMsP90 !== undefined) {
            latencyByType[actionType].p90.push(group.quantiles.latencyMsP90);
        }
        if (group.quantiles?.latencyMsP99 !== undefined) {
            latencyByType[actionType].p99.push(group.quantiles.latencyMsP99);
        }
    }

    const avgLatencyMs: Record<string, { p50: number; p90: number; p99: number }> = {};
    for (const [actionType, latencies] of Object.entries(latencyByType)) {
        avgLatencyMs[actionType] = {
            p50: latencies.p50.length > 0 ? latencies.p50.reduce((a, b) => a + b, 0) / latencies.p50.length : 0,
            p90: latencies.p90.length > 0 ? latencies.p90.reduce((a, b) => a + b, 0) / latencies.p90.length : 0,
            p99: latencies.p99.length > 0 ? latencies.p99.reduce((a, b) => a + b, 0) / latencies.p99.length : 0,
        };
    }

    const totalOperations = Object.values(operationsByType).reduce((a, b) => a + b, 0);

    return {
        namespaceId,
        startDate,
        endDate,
        totalOperations,
        operationsByType,
        avgLatencyMs,
        dataPoints,
    };
}

function createEmptyMetrics(
    namespaceId: string | null,
    startDate: string,
    endDate: string
): KVMetricsSummary {
    return {
        namespaceId,
        startDate,
        endDate,
        totalOperations: 0,
        operationsByType: {},
        avgLatencyMs: {},
        dataPoints: [],
    };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleMetricsRoutes(
    request: Request,
    env: Env,
    url: URL,
    corsHeaders: HeadersInit,
    isLocalDev: boolean,
    _userEmail: string
): Promise<Response> {
    const ctx = createErrorContext('metrics', 'handle_request');

    // Only GET requests allowed
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }

    // Parse route: /api/metrics or /api/metrics/:namespaceId
    const pathParts = url.pathname.replace('/api/metrics', '').split('/').filter(Boolean);
    const namespaceId = pathParts.length > 0 ? pathParts[0] : null;

    // Parse query parameters
    const daysParam = url.searchParams.get('days');
    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');
    const skipCache = url.searchParams.get('skipCache') === 'true';

    // Calculate date range
    let startDate: string;

    const now = new Date();
    const endDate = endDateParam ?? now.toISOString().split('T')[0] ?? '';

    if (startDateParam) {
        startDate = startDateParam;
    } else {
        const days = daysParam ? parseInt(daysParam, 10) : 7;
        const start = new Date(now);
        start.setDate(start.getDate() - days);
        startDate = start.toISOString().split('T')[0] ?? '';
    }

    logInfo(`Metrics request for ${namespaceId ?? 'all namespaces'} from ${startDate} to ${endDate}`, ctx);

    // Clear cache if requested
    if (skipCache && env.ACCOUNT_ID) {
        const cacheKey = getCacheKey(env.ACCOUNT_ID, namespaceId ?? null, startDate, endDate);
        metricsCache.delete(cacheKey);
    }

    try {
        const metrics = await fetchKVMetrics(env, namespaceId ?? null, startDate, endDate, isLocalDev);

        return new Response(JSON.stringify(metrics), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    } catch (error) {
        await logError(env, error instanceof Error ? error : String(error), ctx, isLocalDev);

        return new Response(
            JSON.stringify({
                error: 'Failed to fetch metrics',
                message: error instanceof Error ? error.message : 'Unknown error',
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            }
        );
    }
}
