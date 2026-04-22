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

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {return fallback;}
  return value === "true";
}

export function resolveConfig(raw: SqsMonitorConfig): ResolvedSqsMonitorConfig {
  const queueUrl = raw.queueUrl?.trim();
  const region = raw.region?.trim();

  if (!queueUrl) {
    throw new Error("SQS_MONITOR_QUEUE_URL is required");
  }
  if (!region) {
    throw new Error("AWS_REGION is required");
  }

  const pollIntervalMs = raw.pollIntervalMs ?? 0;
  const maxPollGapMs =
    raw.maxPollGapMs ?? (pollIntervalMs > 0 ? pollIntervalMs * 5 : 300_000);

  if (maxPollGapMs <= pollIntervalMs) {
    throw new Error(
      `SQS_MAX_POLL_GAP_MS (${maxPollGapMs}) must be greater than SQS_POLL_INTERVAL_MS (${pollIntervalMs})`,
    );
  }

  if (pollIntervalMs > 0 && maxPollGapMs <= pollIntervalMs * 5) {
    console.warn(
      `[sqs-monitor] Warning: SQS_MAX_POLL_GAP_MS (${maxPollGapMs}) is within 5x of SQS_POLL_INTERVAL_MS (${pollIntervalMs}). ` +
        "Hibernate detection may fire frequently.",
    );
  }

  return {
    queueUrl,
    region,
    maxInFlight: raw.maxInFlight ?? 10,
    waitTimeSeconds: raw.waitTimeSeconds ?? 20,
    visibilityTimeout: raw.visibilityTimeout ?? 60,
    pollIntervalMs,
    maxPollGapMs,
    dlqUrl: raw.dlqUrl?.trim(),
    notifyChannel: raw.notifyChannel?.trim(),
    logLevel: raw.logLevel ?? "info",
    dryRun: raw.dryRun ?? false,
  };
}

/**
 * Read config from plugin entry config object or environment variables.
 * Env vars take precedence.
 */
export function resolveConfigFromEnv(
  env: Record<string, string | undefined>,
  pluginConfig?: SqsMonitorConfig,
): ResolvedSqsMonitorConfig {
  const raw: SqsMonitorConfig = {
    queueUrl:
      env.SQS_MONITOR_QUEUE_URL ?? env.SQS_QUEUE_URL ?? pluginConfig?.queueUrl,
    region: env.AWS_REGION ?? pluginConfig?.region,
    maxInFlight: env.SQS_MAX_IN_FLIGHT
      ? parseInt(env.SQS_MAX_IN_FLIGHT, 10)
      : pluginConfig?.maxInFlight,
    waitTimeSeconds: env.SQS_WAIT_TIME_SECONDS
      ? parseInt(env.SQS_WAIT_TIME_SECONDS, 10)
      : pluginConfig?.waitTimeSeconds,
    visibilityTimeout: env.SQS_VISIBILITY_TIMEOUT
      ? parseInt(env.SQS_VISIBILITY_TIMEOUT, 10)
      : pluginConfig?.visibilityTimeout,
    pollIntervalMs: env.SQS_POLL_INTERVAL_MS
      ? parseInt(env.SQS_POLL_INTERVAL_MS, 10)
      : pluginConfig?.pollIntervalMs,
    maxPollGapMs: env.SQS_MAX_POLL_GAP_MS
      ? parseInt(env.SQS_MAX_POLL_GAP_MS, 10)
      : pluginConfig?.maxPollGapMs,
    dlqUrl: env.SQS_DLQ_URL ?? pluginConfig?.dlqUrl,
    notifyChannel: env.SQS_NOTIFY_CHANNEL ?? pluginConfig?.notifyChannel,
    logLevel: (env.SQS_LOG_LEVEL ?? pluginConfig?.logLevel) as
      | "debug"
      | "info"
      | "warn"
      | "error",
    dryRun: env.SQS_DRY_RUN
      ? parseBool(env.SQS_DRY_RUN, pluginConfig?.dryRun ?? false)
      : pluginConfig?.dryRun,
  };

  return resolveConfig(raw);
}