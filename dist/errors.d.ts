/**
 * Error types and helpers for the SQS monitor plugin.
 */
export type AwsErrorCode = string;
export interface SqsMonitorError {
    code: AwsErrorCode;
    message: string;
    retryable: boolean;
    retryDelayMs: number;
}
/**
 * Determine if an AWS SQS/SNS error is retryable and compute backoff delay.
 */
export declare function classifyAwsError(err: unknown): SqsMonitorError | null;
/**
 * Compute exponential backoff delay with jitter.
 */
export declare function computeBackoffDelay(attempt: number, baseDelayMs?: number, maxDelayMs?: number): number;
//# sourceMappingURL=errors.d.ts.map