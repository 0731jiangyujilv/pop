/**
 * Capability system for event prediction data sources.
 *
 * Each capability represents a way to fetch and validate data for resolving
 * event bets (e.g. reading X posts, calling a public API, reading on-chain state).
 */

/** Result of validating a data source config before creating a proposal. */
export interface ValidationResult {
  valid: boolean
  error?: string
  /** Extra metadata from validation (e.g. userId, recentPostCount). Stored in DB. */
  meta?: Record<string, any>
}

/** A single data item fetched from a source. */
export interface DataItem {
  text: string
  timestamp: string
  id?: string
}

/** Result of fetching data from a source for AI resolution. */
export interface FetchedData {
  items: DataItem[]
  /** Human-readable source description, e.g. "X posts from @cz_binance" */
  source: string
}

/** A data source capability that can validate configs and fetch data. */
export interface Capability {
  /** Unique type identifier, e.g. "X_POST", "PUBLIC_API" */
  readonly type: string

  /**
   * Validate that the data source config is usable.
   * Called at proposal creation time to give immediate feedback.
   */
  validate(config: any): Promise<ValidationResult>

  /**
   * Fetch data from the source within a time range.
   * Called at settlement time to gather evidence for AI resolution.
   */
  fetchData(config: any, since: Date, until: Date): Promise<FetchedData>
}
