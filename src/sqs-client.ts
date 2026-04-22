import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  type ReceiveMessageCommandOutput,
} from "@aws-sdk/client-sqs";

export interface SqsMessage {
  MessageId?: string;
  ReceiptHandle?: string;
  Body?: string;
  MD5OfBody?: string;
  MD5OfMessageAttributes?: string;
  MessageAttributes?: Record<string, unknown>;
  Attributes?: Record<string, string>;
  MD5OfMessageSystemAttributes?: string;
  MessageSystemAttributes?: Record<string, unknown>;
}

export interface SqsReceiveOptions {
  queueUrl: string;
  maxNumberOfMessages?: number;
  waitTimeSeconds?: number;
  visibilityTimeout?: number;
}

export interface SqsClient {
  receiveMessages(options: SqsReceiveOptions): Promise<SqsMessage[]>;
  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void>;
}

export interface SqsClientDeps {
  region: string;
}

export function createSqsClient(deps: SqsClientDeps): SqsClient {
  const { region } = deps;

  const client = new SQSClient({ region });

  async function receiveMessages(
    options: SqsReceiveOptions,
  ): Promise<SqsMessage[]> {
    const { queueUrl, maxNumberOfMessages = 10, waitTimeSeconds = 20 } = options;

    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxNumberOfMessages,
      WaitTimeSeconds: waitTimeSeconds,
      ...(options.visibilityTimeout !== undefined
        ? { VisibilityTimeout: options.visibilityTimeout }
        : {}),
      MessageAttributeNames: ["All"],
      MessageSystemAttributeNames: ["All"],
    });

    const response: ReceiveMessageCommandOutput = await client.send(command);
    return (response.Messages ?? []) as SqsMessage[];
  }

  async function deleteMessage(
    queueUrl: string,
    receiptHandle: string,
  ): Promise<void> {
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });
    await client.send(command);
  }

  return {
    receiveMessages,
    deleteMessage,
  };
}