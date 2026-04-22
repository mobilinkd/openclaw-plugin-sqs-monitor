# @openclaw/sqs-monitor

Polls an AWS SQS queue and spawns subagents to process each message.

**Content-agnostic** — this plugin knows nothing about SNS envelopes or message schemas. Each SQS message is serialized as a JSON string and passed to a subagent in its entirety. Subagents receive the full message object including `Body`, `MessageId`, `ReceiptHandle`, `Attributes`, and `MessageAttributes`. Parse the JSON to extract what you need.

## Installation

### ClawHub (recommended)

ClawHub is checked first during plugin install. Authenticate once, then publish:

```bash
npm i -g clawhub          # install CLI
clawhub login             # authenticate (needed for publish only)
clawhub publish . --slug sqs-monitor --name "SQS Monitor" --version 0.1.0
```

To install into an OpenClaw deployment that already has the CLI:

```bash
clawhub install sqs-monitor
```

### npm (fallback)

If ClawHub doesn't have the package, install via npm:

```bash
pnpm add @openclaw/sqs-monitor
# or
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

Environment variables take precedence over `plugins.entries` config. A minimal setup can rely entirely on env vars with no `plugins.entries.sqsMonitor` entry.

## AWS Credentials

The plugin uses the AWS SDK default credential chain. Ensure your environment has one of:

- **IAM role** attached to the EC2/ECS/Lambda running OpenClaw
- **Environment variables**: `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
- **Shared credentials file**: `~/.aws/credentials`

## How It Works

1. Polls the SQS queue using [long polling](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html) to minimize API calls
2. For each message, serializes the full SQS `Message` object to JSON and spawns a subagent with it
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

## ClawHub Publishing

This package is published to [ClawHub](https://clawhub.com). OpenClaw checks ClawHub first during plugin resolution, falling back to npm.

**Prerequisites:**
- Node.js 18+
- `npm i -g clawhub`
- `clawhub login` (must be authenticated)

**Publish a new version:**

```bash
cd /path/to/openclaw-plugin-sqs-monitor

# Bump version in package.json first, then:
clawhub publish . \
  --slug sqs-monitor \
  --name "SQS Monitor" \
  --version 0.1.0 \
  --changelog "Initial release"
```

**Install locally for testing:**

```bash
clawhub install ./path/to/openclaw-plugin-sqs-monitor
```

**Check publish status:**

```bash
clawhub list
```

## Example: SNS → SQS Pipeline

To process SNS notifications delivered to SQS:

1. Create an SQS queue
2. Subscribe the queue to an SNS topic
3. Set the plugin to poll the SQS queue
4. The subagent receives the full SQS message as JSON. Parse it to extract the SNS envelope:


```javascript
const msg = JSON.parse(rawMessage);
// msg.Body contains the raw SNS notification as a JSON string
// (e.g. '{"Type":"Notification","Message":"{\"text\":\"hello\"}",...}')
const sns = JSON.parse(msg.Body);
// sns.TopicArn, sns.MessageId, sns.Message (the actual payload), etc.
```

## License

MIT