/** The minimum `major.minor` this project runs on. */
export declare const FLOOR: number[];

/** Is `version` (`26.8.2`, `v26.4.0`) at or above `floor`? */
export declare function atLeast(version: string, floor?: number[]): boolean;

/** Stop with a clear message when the runtime is older than the floor. */
export declare function assertNodeFloor(version?: string): void;
