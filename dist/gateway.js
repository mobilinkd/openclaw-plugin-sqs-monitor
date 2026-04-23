/**
 * Gateway API client for spawning subagents.
 *
 * Uses the same gateway API that subagent-spawn.ts uses internally.
 * The gateway runs on localhost:18789 (from openclaw.json gateway.port).
 */
export function createGatewayClient(deps) {
    const { gatewayPort, gatewayToken } = deps;
    const baseUrl = `http://localhost:${gatewayPort}`;
    async function spawnAgent(params) {
        const { message, sessionKey, channel, to, accountId, threadId, idempotencyKey, label, deliver = false, lane = "subagent", thinking, timeout, } = params;
        const body = {
            method: "agent",
            params: {
                message,
                ...(sessionKey ? { sessionKey } : {}),
                ...(channel ? { channel } : {}),
                ...(to ? { to } : {}),
                ...(accountId ? { accountId } : {}),
                ...(threadId ? { threadId } : {}),
                ...(idempotencyKey ? { idempotencyKey } : {}),
                ...(label ? { label } : {}),
                deliver,
                lane,
                ...(thinking ? { thinking } : {}),
                ...(timeout ? { timeout } : {}),
            },
        };
        const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${gatewayToken}`,
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`Gateway API error: ${response.status} ${response.statusText}`);
        }
        const data = (await response.json());
        return { runId: data.runId };
    }
    return { spawnAgent };
}
//# sourceMappingURL=gateway.js.map