/**
 * Error types and helpers for the SQS monitor plugin.
 */
/**
 * Determine if an AWS SQS/SNS error is retryable and compute backoff delay.
 */
export function classifyAwsError(err) {
    if (!(err instanceof Error)) {
        return null;
    }
    const name = err.name ?? "";
    const message = err.message ?? "";
    // Common retryable errors
    if (name === "ThrottlingException" ||
        name === "RequestTimeout" ||
        name === "ServiceUnavailable" ||
        name === "InternalError" ||
        name === "ServiceError") {
        return {
            code: name,
            message,
            retryable: true,
            retryDelayMs: 0,
        };
    }
    // Auth errors — not retryable without config change
    if (name === "AccessDenied" ||
        name === "InvalidAccessKeyId" ||
        name === "UnrecognizedClientException") {
        return {
            code: name,
            message,
            retryable: false,
            retryDelayMs: 0,
        };
    }
    // Queue not found — fatal
    if (name === "QueueDoesNotExist" ||
        name === "AWS.SimpleQueueService.NonExistentQueue" ||
        message.includes("Queue does not exist")) {
        return {
            code: "QueueDoesNotExist",
            message,
            retryable: false,
            retryDelayMs: 0,
        };
    }
    // Network/timeout errors — likely retryable
    if (name === "TimeoutError" ||
        name === "AbortError" ||
        name === "NetworkError" ||
        message.includes("fetch failed") ||
        message.includes("ECONNREFUSED") ||
        message.includes("ENOTFOUND")) {
        return {
            code: "RequestTimeout",
            message,
            retryable: true,
            retryDelayMs: 0,
        };
    }
    return null;
}
/**
 * Compute exponential backoff delay with jitter.
 */
export function computeBackoffDelay(attempt, baseDelayMs = 1_000, maxDelayMs = 60_000) {
    const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
    const jitterFraction = 0.1;
    const jitter = exponentialDelay * jitterFraction * (Math.random() * 2 - 1);
    return Math.round(exponentialDelay + jitter);
}
//# sourceMappingURL=errors.js.map