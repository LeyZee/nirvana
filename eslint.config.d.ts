// Types of what eslint.config.js exports for the boundaries test (apps/api/src/__tests__/boundaries.test.ts).
export declare const MODULE_DEPENDENCIES: Readonly<Record<string, readonly string[]>>;
export declare const moduleNames: readonly string[];
export declare function boundaryElements(modulesRoot?: string): readonly Readonly<Record<string, unknown>>[];

declare const config: readonly unknown[];
export default config;
