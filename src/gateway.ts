/**
 * Gateway API client for spawning subagents via WebSocket ACP protocol.
 *
 * The gateway runs on localhost:18789 and communicates via WebSocket
 * using the ACP (Agent Communication Protocol) over JSON frames.
 *
 * Protocol flow:
 * 1. Client connects → server sends connect.challenge event with nonce
 * 2. Client sends connect request with auth
 * 3. Server responds with hello-ok
 * 4. Client sends agent request
 * 5. Server responds with result
 */

import { randomUUID } from "node:crypto";
import WebSocket from "ws";

export interface GatewaySpawnParams {
  message: string;
  agent?: string;
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
  spawnAgent(params: GatewaySpawnParams): Promise<{ runId?: string }>;
}

// ACP protocol constants
const PROTOCOL_VERSION = 3 as const;

interface RequestFrame {
  type: "req";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface ResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string };
}

interface EventFrame {
  type: "event";
  event: string;
  payload?: unknown;
}

type IncomingMessage = RequestFrame | ResponseFrame | EventFrame;

export function createGatewayClient(deps: GatewayClientDeps): GatewayClient {
  const { gatewayPort, gatewayToken } = deps;
  const url = `ws://localhost:${gatewayPort}`;

  async function spawnAgent(
    params: GatewaySpawnParams,
  ): Promise<{ runId?: string }> {
    const {
      message,
      agent,
      sessionKey,
      channel,
      to,
      accountId,
      threadId,
      idempotencyKey = randomUUID(),
      label,
      deliver = false,
      lane,
      thinking,
      timeout,
    } = params;

    return await new Promise((resolve, reject) => {
      let ws: WebSocket;
      let nonce: string | null = null;
      let helloOk = false;
      let done = false;

      const cleanup = () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close(1000, "done");
        }
      };

      const handleMessage = (data: WebSocket.Data) => {
        if (done) return;

        let msg: IncomingMessage;
        try {
          msg = JSON.parse(data.toString()) as IncomingMessage;
        } catch {
          return;
        }

        // Handle connect.challenge event
        if (msg.type === "event" && (msg as EventFrame).event === "connect.challenge") {
          const eventFrame = msg as EventFrame;
          const payload = eventFrame.payload as { nonce?: string };
          nonce = payload.nonce ?? null;
          if (nonce) {
            sendConnectRequest();
          } else {
            cleanup();
            reject(new Error("missing nonce in connect.challenge"));
          }
          return;
        }

        // Handle response frame
        if (msg.type === "res") {
          const res = msg as ResponseFrame;

          // If we haven't received hello-ok yet, this must be the connect response
          if (!helloOk) {
            if (!res.ok) {
              cleanup();
              reject(new Error(`connect failed: ${res.error?.message ?? res.error}`));
              return;
            }
            helloOk = true;
            sendAgentRequest();
            return;
          }

          // Agent response
          done = true;
          cleanup();
          if (!res.ok) {
            reject(new Error(`agent error: ${res.error?.message ?? "unknown"}`));
            return;
          }
          const payload = res.payload as { runId?: string } | undefined;
          resolve({ runId: payload?.runId });
          return;
        }
      };

      const sendConnectRequest = () => {
        if (!nonce) return;
        const connectReq: RequestFrame = {
          type: "req",
          id: randomUUID(),
          method: "connect",
          params: {
            client: {
              id: "gateway-client",
              displayName: "SQS Monitor Plugin",
              version: "0.1.0",
              platform: "linux",
              mode: "backend",
            },
            auth: {
              token: gatewayToken,
            },
            role: "operator",
            scopes: ["operator.write"],
            minProtocol: PROTOCOL_VERSION,
            maxProtocol: PROTOCOL_VERSION,
          },
        };
        ws.send(JSON.stringify(connectReq));
      };

      const sendAgentRequest = () => {
        const agentReq: RequestFrame = {
          type: "req",
          id: randomUUID(),
          method: "agent",
          params: {
            message,
            ...(agentId ? { agentId } : {}),
            ...(sessionKey ? { sessionKey } : {}),
            ...(channel ? { channel } : {}),
            ...(to ? { to } : {}),
            ...(accountId ? { accountId } : {}),
            ...(threadId ? { threadId } : {}),
            idempotencyKey,
            ...(label ? { label } : {}),
            ...(deliver ? { deliver } : {}),
            ...(lane ? { lane } : {}),
            ...(thinking ? { thinking } : {}),
            ...(timeout ? { timeout } : {}),
          },
        };
        ws.send(JSON.stringify(agentReq));
      };

      // Connect to gateway
      ws = new WebSocket(url);

      ws.on("open", () => {
        // Waiting for connect.challenge from server
      });

      ws.on("message", handleMessage);

      ws.on("error", (err) => {
        if (!done) {
          done = true;
          reject(new Error(`WebSocket error: ${err.message}`));
        }
      });

      ws.on("close", (code, reason) => {
        if (!done) {
          done = true;
          reject(new Error(`Connection closed: ${code} ${reason?.toString() ?? ""}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!done) {
          done = true;
          cleanup();
          reject(new Error("Gateway request timed out"));
        }
      }, 30_000);
    });
  }

  return { spawnAgent };
}