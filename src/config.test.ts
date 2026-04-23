import { describe, it, expect, vi } from "vitest";
import { resolveConfig, type SqsMonitorConfig } from "./config.js";

describe("resolveConfig", () => {
  it("requires queueUrl", () => {
    expect(() =>
      resolveConfig({ queueUrl: "", region: "us-east-1" })
    ).toThrow("SQS_MONITOR_QUEUE_URL is required");
  });

  it("requires region", () => {
    expect(() =>
      resolveConfig({ queueUrl: "https://sqs.us-east-1.amazonaws.com/123/test", region: "" })
    ).toThrow("AWS_REGION is required");
  });

  it("applies defaults", () => {
    const cfg = resolveConfig({
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/test",
      region: "us-east-1",
    });
    expect(cfg.maxInFlight).toBe(10);
    expect(cfg.waitTimeSeconds).toBe(20);
    expect(cfg.visibilityTimeout).toBe(60);
    expect(cfg.pollIntervalMs).toBe(0);
    expect(cfg.maxPollGapMs).toBe(300_000);
    expect(cfg.logLevel).toBe("info");
    expect(cfg.dryRun).toBe(false);
  });

  it("rejects maxPollGapMs <= pollIntervalMs", () => {
    expect(() =>
      resolveConfig({
        queueUrl: "https://sqs.us-east-1.amazonaws.com/123/test",
        region: "us-east-1",
        pollIntervalMs: 10_000,
        maxPollGapMs: 5_000,
      })
    ).toThrow(/must be greater than/);
  });

  it("warns when maxPollGapMs <= 5 * pollIntervalMs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // maxPollGapMs=250k <= 5 * 60k=300k triggers warn
    resolveConfig({
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/test",
      region: "us-east-1",
      pollIntervalMs: 60_000,
      maxPollGapMs: 250_000,
    });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
