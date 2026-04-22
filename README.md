# @openclaw/sqs-monitor

Polls an AWS SQS queue and spawns subagents to process each message.

**Content-agnostic** — this plugin knows nothing about SNS envelopes or message schemas. It reads the `Body` field from each SQS message and passes it to a subagent as plain text. Decode SNS notifications, JSON payloads, or any other format inside the subagent.

## Installation

```bash
pnpm add @openclaw/sqs-monitor
```

Or with npm:

```bash
npm install @openclaw/sqs-monitor
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SQS_MONITOR_QUEUE_URL` | Yes | Full URL of the SQS queue to monitor |
| `AWS_REGION` | Yes | AWS region for SQS (e.g., `us-east-1`) |
| `SQS_MAX_IN_FLIGHT` | No | Max concurrent message handlers (default: `10`) |
| `SQS_WAIT_TIME_SECONDS` | No | Long-poll wait time, 0–20 (default: `20`) |
| `SQS_VISIBILITY_TIMEOUT` | No | Message visibility timeout in seconds (default: `60`) |
| `SQS_POLL_INTERVAL_MS` | No | Fixed poll interval in ms. `0` = continuous (default: `0`) |
| `SQS_MAX_POLL_GAP_MS` | No | Polling gap alert threshold in ms (default: `300000`) |
| `SQS_DLQ_URL` | No | Dead-letter queue URL for failed messages |
| `SQS_NOTIFY_CHANNEL` | No | Notification channel for alerts (e.g., `telegram`) |
| `SQS_LOG_LEVEL` | No | Log level: `debug`, `info`, `warn`, `error` (default: `info`) |
| `SQS_DRY_RUN` | No | Set `true` to log actions without executing |

### OpenClaw Config (`openclaw.json`)

The plugin reads `gateway.remote.token` from your OpenClaw config to authenticate subagent spawns. Ensure this is set:

```json
{
  "gateway": {
    "port": 18789,
    "remote": {
      "token": "your-gateway-token"
    }
  },
  "plugins": {
    "entries": {
      "sqsMonitor": {
        "queueUrl": "https://sqs.us-east-1.amazonaws.com/123456789/my-queue",
        "region": "us-east-1",
        "maxInFlight": 10,
        "logLevel": "info"
      }
    }
  }
}
```

Or configure via environment variables only (no `plugins.entries` needed):

```bash
export SQS_MONITOR_QUEUE_URL="https://sqs.us-east-1.amazonaws.com/123456789/my-queue"
export AWS_REGION="us-east-1"
```

## AWS Credentials

The plugin uses the AWS SDK default credential chain. Ensure your environment has one of:

- **IAM role** attached to the EC2/ECS/Lambda running OpenClaw
- **Environment variables**: `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
- **Shared credentials file**: `~/.aws/credentials`

## How It Works

1. Polls the SQS queue using [long polling](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html) to minimize API calls
2. For each message, spawns a subagent with the message `Body` as input
3. Deletes the message from the queue after the subagent is successfully spawned
4. Tracks in-flight messages and pauses polling if `maxInFlight` is exceeded
5. Emits alerts for hibernate detection, consecutive errors, and queue unreachable conditions

## Alerts

| Type | Description | Fatal? |
|---|---|---|
| `hibernate_detected` | Polling gap exceeds `maxPollGapMs` | No |
| `max_in_flight_exceeded` | Too many concurrent handlers | No |
| `consecutive_errors` | 5+ consecutive poll errors | No |
| `queue_unreachable` | Initial connectivity check failed | Yes |
| `config_error` | Configuration is invalid | Yes |

## Example: SNS → SQS Pipeline

To process SNS notifications delivered to SQS:

1. Create an SQS queue
2. Subscribe the queue to an SNS topic
3. Set the plugin to poll the SQS queue
4. Inside your subagent, decode the SNS notification envelope:

```
Process this SQS message:
{"Type":"Notification","Message":"{\"text\":\"hello\"}","MessageId":"...","TopicArn":"..."}
```

The subagent can parse the SNS `Message` JSON field to extract the actual payload.

## License

MIT