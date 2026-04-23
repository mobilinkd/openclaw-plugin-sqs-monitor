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
export declare function createSqsClient(deps: SqsClientDeps): SqsClient;
//# sourceMappingURL=sqs-client.d.ts.map