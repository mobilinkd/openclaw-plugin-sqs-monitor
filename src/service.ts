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
  type:
    | "hibernate_detected"
    | "max_in_flight_exceeded"
    | "consecutive_errors"
    | "queue_unreachable"
    | "config_error";
  message: string;
  details?: Record<string, unknown>;
}

export type SqsMonitorAlertHandler = (
  alert: SqsMonitorAlert,
) => void | Promise<void>;

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
  start(ctx: { config: SqsMonitorServiceConfig }): Promise<void>;
  stop(ctx: Record<string, never>): Promise<void>;
  getMetrics(): SqsMonitorMetrics;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(delayMs: number): number {
  const jitterFraction = 0.1;
  return delayMs + (Math.random() * 2 - 1) * delayMs * jitterFraction;
}

export function createSqsMonitorService(
  deps: SqsMonitorServiceDeps,
): SqsMonitorService {
  const { sqsClient, config, onAlert, onMessage, logger } = deps;

  let stopped = false;
  let lastPollTime = Date.now();
  let lastMessageTime = Date.now();
  let inFlight = 0;
  let consecutiveErrors = 0;
  let messagesReceived = 0;
  let messagesProcessed = 0;
  let messagesFailed = 0;
  let polls = 0;

  const BASE_BACKOFF_MS = 1_000;
  const MAX_BACKOFF_MS = 60_000;
  const CONSECUTIVE_ERRORS_BEFORE_ALERT = 5;

  async function handleMessage(message: SqsMessage): Promise<void> {
    if (config.dryRun) {
      logger.info("[sqs-monitor] [dry-run] Would spawn subagent for message", {
        messageId: message.MessageId,
        body: message.Body?.substring(0, 100),
      });
      return;
    }

    inFlight++;
    lastMessageTime = Date.now();

    try {
      if (onMessage) {
        await onMessage(message);
      }
      messagesProcessed++;
      consecutiveErrors = 0;
    } catch (err) {
      messagesFailed++;
      logger.error("[sqs-monitor] Message handler threw", {
        messageId: message.MessageId,
        error: String(err),
      });
      throw err;
    } finally {
      inFlight--;
    }
  }

  async function pollOnce(): Promise<boolean> {
    const messages = await sqsClient.receiveMessages({
      queueUrl: config.queueUrl,
      maxNumberOfMessages: 10,
      waitTimeSeconds: config.waitTimeSeconds,
      visibilityTimeout: config.visibilityTimeout,
    });

    polls++;
    lastPollTime = Date.now();

    if (messages.length === 0) {
      return false;
    }

    logger.debug(`[sqs-monitor] Received ${messages.length} message(s)`);
    messagesReceived += messages.length;

    for (const message of messages) {
      if (stopped) {break;}
      try {
        await handleMessage(message);
      } catch {
        // Error already counted in handleMessage
      }
    }

    return true;
  }

  async function runPollLoop(): Promise<void> {
    let backoffMs = BASE_BACKOFF_MS;

    while (!stopped) {
      try {
        const hasMessages = await pollOnce();

        if (stopped) {break;}

        // Hibernate detection
        const gap = Date.now() - lastPollTime;
        if (gap > config.maxPollGapMs) {
          const alert: SqsMonitorAlert = {
            type: "hibernate_detected",
            message: `Polling gap of ${gap}ms detected (threshold: ${config.maxPollGapMs}ms)`,
            details: { gapMs: gap, thresholdMs: config.maxPollGapMs },
          };
          logger.warn(alert.message, alert.details);
          void onAlert?.(alert);
        }

        // In-flight pause check
        if (inFlight >= config.maxInFlight) {
          const alert: SqsMonitorAlert = {
            type: "max_in_flight_exceeded",
            message: `In-flight (${inFlight}) >= max (${config.maxInFlight}), pausing`,
            details: { inFlight, maxInFlight: config.maxInFlight },
          };
          logger.warn(alert.message, alert.details);
          void onAlert?.(alert);

          while (inFlight >= config.maxInFlight && !stopped) {
            await sleep(1_000);
          }
        }

        if (hasMessages) {
          continue;
        }

        if (config.pollIntervalMs > 0) {
          await sleep(config.pollIntervalMs);
        }

        consecutiveErrors = 0;
        backoffMs = BASE_BACKOFF_MS;
      } catch (err) {
        consecutiveErrors++;
        logger.error(`[sqs-monitor] Poll error (consecutive=${consecutiveErrors})`, {
          error: String(err),
        });

        if (consecutiveErrors >= CONSECUTIVE_ERRORS_BEFORE_ALERT) {
          const alert: SqsMonitorAlert = {
            type: "consecutive_errors",
            message: `${consecutiveErrors} consecutive poll errors`,
            details: { consecutiveErrors, error: String(err) },
          };
          logger.error(alert.message);
          void onAlert?.(alert);
        }

        await sleep(jitter(backoffMs));
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      }
    }
  }

  return {
    async start() {
      logger.info("[sqs-monitor] Starting SQS monitor service", {
        queueUrl: config.queueUrl,
        region: config.region,
        pollIntervalMs: config.pollIntervalMs,
        maxPollGapMs: config.maxPollGapMs,
      });

      // Initial connectivity check
      try {
        await sqsClient.receiveMessages({
          queueUrl: config.queueUrl,
          maxNumberOfMessages: 1,
          waitTimeSeconds: 0,
        });
        logger.info("[sqs-monitor] Initial connectivity check passed");
      } catch (err) {
        const alert: SqsMonitorAlert = {
          type: "queue_unreachable",
          message: `Failed to connect to SQS queue: ${String(err)}`,
          details: { error: String(err) },
        };
        logger.error(alert.message);
        void onAlert?.(alert);
        throw err;
      }

      runPollLoop().catch((err) => {
        logger.error("[sqs-monitor] Fatal poll loop error", { error: String(err) });
      });
    },

    async stop() {
      logger.info("[sqs-monitor] Stopping SQS monitor service");
      stopped = true;
    },

    getMetrics() {
      return {
        messagesReceived,
        messagesProcessed,
        messagesFailed,
        polls,
        consecutiveErrors,
        lastPollAt: lastPollTime,
        lastMessageAt: lastMessageTime,
        inFlight,
      };
    },
  };
}