import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { BarChart3, RefreshCw, Loader2, AlertCircle, Clock, Activity, Database, TrendingUp } from 'lucide-react';
import { api, type KVNamespace, type KVMetricsSummary } from '../services/api';
import { logger } from '../lib/logger';

interface KVMetricsProps {
    namespaces: KVNamespace[];
}

type DateRangePreset = '7' | '14' | '30' | '90';

const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
    { value: '7', label: 'Last 7 days' },
    { value: '14', label: 'Last 14 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
];

const OPERATION_LABELS: Record<string, string> = {
    read: 'Read',
    write: 'Write',
    delete: 'Delete',
    list: 'List',
};

const OPERATION_COLORS: Record<string, string> = {
    read: 'bg-blue-500',
    write: 'bg-green-500',
    delete: 'bg-red-500',
    list: 'bg-purple-500',
};

export function KVMetrics({ namespaces }: KVMetricsProps): React.JSX.Element {
    const [selectedNamespace, setSelectedNamespace] = useState<string>('all');
    const [dateRange, setDateRange] = useState<DateRangePreset>('7');
    const [metrics, setMetrics] = useState<KVMetricsSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const loadMetrics = useCallback(async (skipCache = false): Promise<void> => {
        try {
            setLoading(true);
            setError('');

            const options: Parameters<typeof api.getMetrics>[0] = {
                days: parseInt(dateRange, 10),
                skipCache,
            };

            if (selectedNamespace !== 'all') {
                options.namespaceId = selectedNamespace;
            }

            const data = await api.getMetrics(options);
            setMetrics(data);
            setLastUpdated(new Date());
        } catch (err) {
            logger.error('Failed to load metrics', err);
            setError(err instanceof Error ? err.message : 'Failed to load metrics');
        } finally {
            setLoading(false);
        }
    }, [selectedNamespace, dateRange]);

    // Load metrics when filters change
    useEffect(() => {
        loadMetrics();
    }, [loadMetrics]);

    const handleRefresh = (): void => {
        loadMetrics(true);
    };

    const formatNumber = (num: number): string => {
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
        return num.toString();
    };

    const formatLatency = (ms: number): string => {
        if (ms < 1) return '<1ms';
        if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
        return `${ms.toFixed(1)}ms`;
    };

    const getOperationPercentage = (type: string): number => {
        if (!metrics || metrics.totalOperations === 0) return 0;
        return ((metrics.operationsByType[type] ?? 0) / metrics.totalOperations) * 100;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-card rounded-lg border p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <BarChart3 className="h-6 w-6 text-primary" />
                        <h2 className="text-2xl font-bold">KV Metrics</h2>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={loading}
                        aria-label="Refresh metrics"
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                {/* Info Banner */}
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-900 dark:text-blue-100">
                        <strong>About Metrics:</strong> Data is from Cloudflare's Analytics API and may have a delay of a few minutes.
                        Metrics are cached for 2 minutes. Use Refresh to fetch the latest data.
                    </p>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="metrics-namespace">Namespace</Label>
                        <Select
                            value={selectedNamespace}
                            onValueChange={setSelectedNamespace}
                        >
                            <SelectTrigger id="metrics-namespace" name="metrics-namespace" aria-label="Select namespace">
                                <SelectValue placeholder="Select namespace" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Namespaces</SelectItem>
                                {namespaces.map((ns) => (
                                    <SelectItem key={ns.id} value={ns.id}>
                                        {ns.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="metrics-date-range">Date Range</Label>
                        <Select
                            value={dateRange}
                            onValueChange={(value) => setDateRange(value as DateRangePreset)}
                        >
                            <SelectTrigger id="metrics-date-range" name="metrics-date-range" aria-label="Select date range">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DATE_RANGE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Last updated */}
                {lastUpdated && !loading && (
                    <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last updated: {lastUpdated.toLocaleTimeString()}
                    </p>
                )}
            </div>

            {/* Error State */}
            {error && (
                <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                </div>
            )}

            {/* Loading State */}
            {loading && !metrics && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* Metrics Display */}
            {metrics && (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Total Operations */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Operations</CardTitle>
                                <Activity className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatNumber(metrics.totalOperations)}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {metrics.startDate} to {metrics.endDate}
                                </p>
                            </CardContent>
                        </Card>

                        {/* Reads */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Reads</CardTitle>
                                <Database className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatNumber(metrics.operationsByType['read'] ?? 0)}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {getOperationPercentage('read').toFixed(1)}% of operations
                                </p>
                            </CardContent>
                        </Card>

                        {/* Writes */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Writes</CardTitle>
                                <TrendingUp className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatNumber(metrics.operationsByType['write'] ?? 0)}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {getOperationPercentage('write').toFixed(1)}% of operations
                                </p>
                            </CardContent>
                        </Card>

                        {/* Data Points */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Data Points</CardTitle>
                                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{metrics.dataPoints.length}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Metric records collected
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Operations Breakdown */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Operations by Type</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {Object.keys(metrics.operationsByType).length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    No operations recorded in this time period
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    {Object.entries(metrics.operationsByType)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([type, count]) => (
                                            <div key={type} className="space-y-2">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="font-medium">{OPERATION_LABELS[type] ?? type}</span>
                                                    <span className="text-muted-foreground">
                                                        {formatNumber(count)} ({getOperationPercentage(type).toFixed(1)}%)
                                                    </span>
                                                </div>
                                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${OPERATION_COLORS[type] ?? 'bg-gray-500'}`}
                                                        style={{ width: `${getOperationPercentage(type)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Latency Stats */}
                    {Object.keys(metrics.avgLatencyMs).length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Average Latency by Operation</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b">
                                                <th className="text-left py-2 font-medium">Operation</th>
                                                <th className="text-right py-2 font-medium">P50</th>
                                                <th className="text-right py-2 font-medium">P90</th>
                                                <th className="text-right py-2 font-medium">P99</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(metrics.avgLatencyMs).map(([type, latency]) => (
                                                <tr key={type} className="border-b last:border-0">
                                                    <td className="py-2 font-medium">{OPERATION_LABELS[type] ?? type}</td>
                                                    <td className="text-right py-2 text-muted-foreground">{formatLatency(latency.p50)}</td>
                                                    <td className="text-right py-2 text-muted-foreground">{formatLatency(latency.p90)}</td>
                                                    <td className="text-right py-2 text-muted-foreground">{formatLatency(latency.p99)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Empty State */}
                    {metrics.totalOperations === 0 && (
                        <div className="text-center py-12 bg-card rounded-lg border">
                            <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                            <h3 className="text-xl font-semibold mb-2">No metrics data</h3>
                            <p className="text-muted-foreground mb-4">
                                {selectedNamespace === 'all'
                                    ? 'No operations recorded across any namespace in this time period.'
                                    : 'No operations recorded for this namespace in this time period.'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Metrics may take a few minutes to appear after operations are performed.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
