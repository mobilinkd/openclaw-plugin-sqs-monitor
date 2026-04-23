/**
 * Configuration for the SQS monitor plugin.
 *
 * Reads from plugin entry config or environment variables.
 * Environment variables take precedence.
 */
export interface SqsMonitorConfig {
    /** Full URL of the SQS queue to monitor. */
    queueUrl?: string;
    /** AWS region for SQS (e.g., us-east-1). */
    region?: string;
    /** Maximum messages to have in-flight before pausing spawns. Default: 10. */
    maxInFlight?: number;
    /** Long-poll wait time in seconds. Default: 20. */
    waitTimeSeconds?: number;
    /** Message visibility timeout in seconds. Default: 60. */
    visibilityTimeout?: number;
    /** Fixed poll interval in ms. 0 = continuous. Default: 0. */
    pollIntervalMs?: number;
    /** Gap threshold for polling gap alert. Default: 300000 (5 min). */
    maxPollGapMs?: number;
    /** URL of the DLQ for permanently failed messages. */
    dlqUrl?: string;
    /** Notification channel for alerts (e.g., telegram). */
    notifyChannel?: string;
    /** Log level. Default: info. */
    logLevel?: "debug" | "info" | "warn" | "error";
    /** Dry-run mode: log actions without executing. Default: false. */
    dryRun?: boolean;
}
export interface ResolvedSqsMonitorConfig {
    queueUrl: string;
    region: string;
    maxInFlight: number;
    waitTimeSeconds: number;
    visibilityTimeout: number;
    pollIntervalMs: number;
    maxPollGapMs: number;
    dlqUrl?: string;
    notifyChannel?: string;
    logLevel: "debug" | "info" | "warn" | "error";
    dryRun: boolean;
}
export declare function resolveConfig(raw: SqsMonitorConfig): ResolvedSqsMonitorConfig;
/**
 * Read config from plugin entry config object or environment variables.
 * Env vars take precedence.
 */
export declare function resolveConfigFromEnv(env: Record<string, string | undefined>, pluginConfig?: SqsMonitorConfig): ResolvedSqsMonitorConfig;
//# sourceMappingURL=config.d.ts.map