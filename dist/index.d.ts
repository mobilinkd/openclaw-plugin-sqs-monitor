/**
 * OpenClaw plugin entry point for the SQS Monitor plugin.
 *
 * Uses definePluginEntry from openclaw/plugin-sdk as a proper peer dependency.
 * The SDK is installed by the host OpenClaw deployment; this plugin only needs
 * it as a devDependency / type-time reference.
 */
declare const _default: {
    id: string;
    name: string;
    description: string;
    configSchema: import("openclaw/plugin-sdk/plugin-entry").OpenClawPluginConfigSchema;
    register: NonNullable<import("openclaw/plugin-sdk/plugin-entry").OpenClawPluginDefinition["register"]>;
} & Pick<import("openclaw/plugin-sdk/plugin-entry").OpenClawPluginDefinition, "kind" | "reload" | "nodeHostCommands" | "securityAuditCollectors">;
export default _default;
//# sourceMappingURL=index.d.ts.map