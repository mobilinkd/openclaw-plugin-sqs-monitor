import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, } from "@aws-sdk/client-sqs";
export function createSqsClient(deps) {
    const { region } = deps;
    const client = new SQSClient({ region });
    async function receiveMessages(options) {
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
        const response = await client.send(command);
        return (response.Messages ?? []);
    }
    async function deleteMessage(queueUrl, receiptHandle) {
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
//# sourceMappingURL=sqs-client.js.map