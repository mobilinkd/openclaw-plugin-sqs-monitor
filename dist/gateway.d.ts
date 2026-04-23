/**
 * Gateway API client for spawning subagents.
 *
 * Uses the same gateway API that subagent-spawn.ts uses internally.
 * The gateway runs on localhost:18789 (from openclaw.json gateway.port).
 */
export interface GatewaySpawnParams {
    message: string;
    sessionKey?: string;
    channel?: string;
    to?: string;
    accountId?: string;
    threadId?: string;
    idempotencyKey?: string;
    label?: string;
    deliver?: boolean;
    lane?: string;
    thinking?: string;
    timeout?: number;
}
export interface GatewayClientDeps {
    gatewayPort: number;
    gatewayToken: string;
}
export interface GatewayClient {
    spawnAgent(params: GatewaySpawnParams): Promise<{
        runId?: string;
    }>;
}
export declare function createGatewayClient(deps: GatewayClientDeps): GatewayClient;
//# sourceMappingURL=gateway.d.ts.map