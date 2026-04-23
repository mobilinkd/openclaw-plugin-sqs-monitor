/**
 * OpenClaw plugin entry point for the SQS Monitor plugin.
 *
 * Uses definePluginEntry from openclaw/plugin-sdk as a proper peer dependency.
 * The SDK is installed by the host OpenClaw deployment; this plugin only needs
 * it as a devDependency / type-time reference.
 */
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { resolveConfigFromEnv } from "./config.js";
import { createSqsClient } from "./sqs-client.js";
import { createSqsMonitorService } from "./service.js";
// Gateway token from openclaw.json is already a plaintext string
function normalizeSecretInput(value) {
    if (typeof value !== "string") {
        return "";
    }
    return value.replace(/[\r\n\u2028\u2029]+/g, "").trim();
}
function createConsoleLogger(level) {
    const levels = ["debug", "info", "warn", "error"];
    const minLevel = levels.indexOf(level);
    return {
        debug: (msg, meta) => {
            if (minLevel <= 0) {
                console.debug(`[sqs-monitor] ${msg}`, meta ?? "");
            }
        },
        info: (msg, meta) => {
            if (minLevel <= 1) {
                console.info(`[sqs-monitor] ${msg}`, meta ?? "");
            }
        },
        warn: (msg, meta) => {
            if (minLevel <= 2) {
                console.warn(`[sqs-monitor] ${msg}`, meta ?? "");
            }
        },
        error: (msg, meta) => {
            if (minLevel <= 3) {
                console.error(`[sqs-monitor] ${msg}`, meta ?? "");
            }
        },
    };
}
// Module-scoped service reference so stop() can reach it
let runningService = null;
export default definePluginEntry({
    id: "sqs-monitor",
    name: "SQS Monitor",
    description: "Polls an AWS SQS queue and spawns subagents to process messages. " +
        "Content-agnostic — knows nothing about SNS envelopes or message schema.",
    register(api) {
        api.registerService({
            id: "sqs-monitor",
            start: async (ctx) => {
                const pluginConfig = ctx.config.plugins?.entries?.sqsMonitor;
                const gatewayToken = normalizeSecretInput(ctx.config.gateway?.remote?.token);
                if (!gatewayToken) {
                    throw new Error("[sqs-monitor] gateway.remote.token not configured — cannot spawn subagents");
                }
                const resolved = resolveConfigFromEnv(process.env, pluginConfig);
                const logger = createConsoleLogger(resolved.logLevel);
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
                        logger.warn(`[sqs-monitor] Alert: ${alert.type} — ${alert.message}`, alert.details);
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
                    logger,
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
//# sourceMappingURL=index.js.map