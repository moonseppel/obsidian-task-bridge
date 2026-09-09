export interface ProviderAccount {
  id: string;
  displayName: string;
}

export interface TaskProvider {
  readonly displayName: string;
  connect(): Promise<ProviderAccount>;
}
