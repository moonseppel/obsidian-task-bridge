/** A checkbox state the user defined beyond open and done, e.g. `/` for "In Progress". */
export interface UserStatus {
  /** The single character standing between a task line's checkbox brackets. */
  readonly symbol: string;
  readonly name: string;
}
