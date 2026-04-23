import type { SqsClient, SqsMessage } from "./sqs-client.js";
export interface SqsMonitorServiceConfig {
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
export interface SqsMonitorMetrics {
    messagesReceived: number;
    messagesProcessed: number;
    messagesFailed: number;
    polls: number;
    consecutiveErrors: number;
    lastPollAt: number;
    lastMessageAt: number;
    inFlight: number;
}
export interface SqsMonitorAlert {
    type: "hibernate_detected" | "max_in_flight_exceeded" | "consecutive_errors" | "queue_unreachable" | "config_error";
    message: string;
    details?: Record<string, unknown>;
}
export type SqsMonitorAlertHandler = (alert: SqsMonitorAlert) => void | Promise<void>;
export interface SqsMonitorMessageHandler {
    (message: SqsMessage): void | Promise<void>;
}
export interface SqsMonitorServiceDeps {
    sqsClient: SqsClient;
    config: SqsMonitorServiceConfig;
    onAlert?: SqsMonitorAlertHandler;
    onMessage?: SqsMonitorMessageHandler;
    logger: {
        debug: (msg: string, meta?: Record<string, unknown>) => void;
        info: (msg: string, meta?: Record<string, unknown>) => void;
        warn: (msg: string, meta?: Record<string, unknown>) => void;
        error: (msg: string, meta?: Record<string, unknown>) => void;
    };
}
export interface SqsMonitorService {
    start(ctx: {
        config: SqsMonitorServiceConfig;
    }): Promise<void>;
    stop(ctx: Record<string, never>): Promise<void>;
    getMetrics(): SqsMonitorMetrics;
}
export declare function createSqsMonitorService(deps: SqsMonitorServiceDeps): SqsMonitorService;
//# sourceMappingURL=service.d.ts.map