/**
 * OpenClaw plugin entry point for the SQS Monitor plugin.
 *
 * Uses definePluginEntry from openclaw/plugin-sdk as a proper peer dependency.
 * The SDK is installed by the host OpenClaw deployment; this plugin only needs
 * it as a devDependency / type-time reference.
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { SqsMonitorConfig } from "./config.js";
import { resolveConfigFromEnv } from "./config.js";
import { createSqsClient } from "./sqs-client.js";
import { createSqsMonitorService, type SqsMonitorService } from "./service.js";

// Gateway token from openclaw.json is already a plaintext string
function normalizeSecretInput(value: unknown): string {
  if (typeof value !== "string") {return "";}
  return value.replace(/[\r\n\u2028\u2029]+/g, "").trim();
}

function pickFirstDefined<T>(values: (T | undefined)[]): T | undefined {
  return values.find((v) => v !== undefined);
}

function createConsoleLogger(
  level: "debug" | "info" | "warn" | "error",
): {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
} {
  const levels = ["debug", "info", "warn", "error"] as const;
  const minLevel = levels.indexOf(level);

  return {
    debug: (msg: string, meta?: Record<string, unknown>) => {
      if (minLevel <= 0) {console.debug(`[sqs-monitor] ${msg}`, meta ?? "");}
    },
    info: (msg: string, meta?: Record<string, unknown>) => {
      if (minLevel <= 1) {console.info(`[sqs-monitor] ${msg}`, meta ?? "");}
    },
    warn: (msg: string, meta?: Record<string, unknown>) => {
      if (minLevel <= 2) {console.warn(`[sqs-monitor] ${msg}`, meta ?? "");}
    },
    error: (msg: string, meta?: Record<string, unknown>) => {
      if (minLevel <= 3) {console.error(`[sqs-monitor] ${msg}`, meta ?? "");}
    },
  };
}

// Module-scoped service reference so stop() can reach it
let runningService: SqsMonitorService | null = null;

export default definePluginEntry({
  id: "sqs-monitor",
  name: "SQS Monitor",
  description:
    "Polls an AWS SQS queue and spawns subagents to process messages. " +
    "Content-agnostic — knows nothing about SNS envelopes or message schema.",
  register(api: OpenClawPluginApi) {
    const logger = api.logger;
    api.registerService({
      id: "sqs-monitor",
      start: async (ctx) => {
        // Check if the user has configured this plugin at all before doing any work
        const pluginConfig = ctx.config.plugins?.entries?.sqsMonitor as
          | SqsMonitorConfig
          | undefined;
        const raw: SqsMonitorConfig = {
          queueUrl:
            process.env.SQS_MONITOR_QUEUE_URL ?? process.env.SQS_QUEUE_URL ?? pluginConfig?.queueUrl,
          region: process.env.AWS_REGION ?? pluginConfig?.region,
        };
        const hasQueueUrl = raw.queueUrl?.trim();
        const hasRegion = raw.region?.trim();

        // Not configured yet — skip service start silently
        if (!hasQueueUrl || !hasRegion) {
          logger.info("Plugin not configured (no queueUrl/region); skipping start.");
          return;
        }

        const rawToken =
          pickFirstDefined([
            process.env.OPENCLAW_GATEWAY_TOKEN,
            ctx.config.gateway?.auth?.token as string | undefined,
          ]);
        const gatewayToken = normalizeSecretInput(rawToken);
        if (!gatewayToken) {
          logger.info("Gateway token not set — skipping start.");
          return;
        }

        const resolved = resolveConfigFromEnv(
          process.env as Record<string, string>,
          pluginConfig,
        );
        const pluginLogger = createConsoleLogger(resolved.logLevel);
        const sqsClient = createSqsClient({ region: resolved.region });
        const gatewayPort = ctx.config.gateway?.port ?? 18789;

        const service = createSqsMonitorService({
          sqsClient,
          config: {
            queueUrl: resolved.queueUrl,
            region: resolved.region,
            maxInFlight: resolved.maxInFlight,
            waitTimeSeconds: resolved.waitTimeSeconds,
            visibilityTimeout: resolved.visibilityTimeout,
            pollIntervalMs: resolved.pollIntervalMs,
            maxPollGapMs: resolved.maxPollGapMs,
            dlqUrl: resolved.dlqUrl,
            notifyChannel: resolved.notifyChannel,
            logLevel: resolved.logLevel,
            dryRun: resolved.dryRun,
          },
          onAlert: (alert) => {
            pluginLogger.warn(
              `[sqs-monitor] Alert: ${alert.type} — ${alert.message}`,
              alert.details,
            );
            if (alert.type === "config_error" || alert.type === "queue_unreachable") {
              throw new Error(`[sqs-monitor] Fatal alert: ${alert.message}`);
            }
          },
          onMessage: async (message) => {
            const { createGatewayClient } = await import("./gateway.js");
            const gatewayClient = createGatewayClient({ gatewayPort, gatewayToken });

            // Pass the raw SQS message as a JSON string so subagents can access
            // message body, attributes, and metadata. Subagents should parse JSON.
            const rawMessage = JSON.stringify(message);
            await gatewayClient.spawnAgent({
              message: rawMessage,
              deliver: false,
              lane: "subagent",
            });


            // Delete message from queue after successful spawn
            if (message.ReceiptHandle && !resolved.dryRun) {
              await sqsClient.deleteMessage(resolved.queueUrl, message.ReceiptHandle);
            }
          },
          logger: pluginLogger,
        });

        runningService = service;
        await service.start({ config: resolved });
      },
      stop: async () => {
        if (runningService) {
          await runningService.stop({});
          runningService = null;
        }
      },
    });
  },
});
