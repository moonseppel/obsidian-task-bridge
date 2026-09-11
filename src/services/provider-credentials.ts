/**
 * How a provider is authenticated is the part that varies most between them: a token, a sign-in
 * flow, a server address and a key, or nothing at all. So the provider draws those rows itself
 * rather than the settings tab assuming any particular shape.
 */
export interface CredentialsHost {
  /** Run after the credentials changed, so the plugin can reconnect and redraw the tab. */
  onCredentialsChanged(): Promise<void>;
}

export interface ProviderCredentials {
  display(containerEl: HTMLElement, host: CredentialsHost): void;
  /** Empty once a connection could be attempted, otherwise what the user still has to supply. */
  describeWhatIsMissing(): string;
  restore(stored: unknown): void;
  toStored(): unknown;
}
