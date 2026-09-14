import { App, SecretComponent, Setting } from 'obsidian';
import { CredentialsHost, ProviderCredentials } from '../provider-credentials';
import { TaskProviderError } from '../task-provider-error';
import { isRecord } from '../../utils/type-guards';

const DISPLAY_NAME = 'API token';
const LINK_TEXT = 'Developer';
const TOKEN_URL = 'https://app.todoist.com/app/settings/integrations/developer';
const DESCRIPTION_START =
  'Kept in Obsidian’s secret storage, not in the plugin settings file. ' +
  'Create a token in Todoist under Settings → Integrations → ';
const DESCRIPTION_END = '. The token must be configured separately on every device.';
const NOTHING_SELECTED = 'Select an API token first.';

export class TodoistCredentials implements ProviderCredentials {
  private readonly app: App;
  private readonly save: () => Promise<void>;
  private secretName = '';

  constructor(app: App, save: () => Promise<void>) {
    this.app = app;
    this.save = save;
  }

  display(containerEl: HTMLElement, host: CredentialsHost): void {
    new Setting(containerEl)
      .setName(DISPLAY_NAME)
      .setDesc(describeSetting())
      .addComponent((el) =>
        new SecretComponent(this.app, el)
          .setValue(this.secretName)
          .onChange((value: unknown) => {
            void this.chooseSecret(value, host);
          }),
      );
  }

  describeWhatIsMissing(): string {
    return this.secretName.length === 0 ? NOTHING_SELECTED : '';
  }

  restore(stored: unknown): void {
    this.secretName = isRecord(stored) ? toSecretName(stored.apiTokenSecretName) : '';
  }

  toStored(): unknown {
    return { apiTokenSecretName: this.secretName };
  }

  /** Read at request time rather than held, so a secret revoked in Obsidian takes effect at once. */
  readToken(): string {
    if (this.secretName.length === 0) {
      throw new TaskProviderError('not-configured');
    }

    // A secret name with nothing behind it here means it was set up on another device: `data.json`
    // (and its secret name) is what a vault-sync tool propagates, secretStorage's actual value never is.
    const token = this.app.secretStorage.getSecret(this.secretName) ?? '';

    if (token.length === 0) {
      throw new TaskProviderError('token-missing-on-device');
    }

    return token;
  }

  private async chooseSecret(value: unknown, host: CredentialsHost): Promise<void> {
    this.secretName = toSecretName(value);
    await this.save();
    await host.onCredentialsChanged();
  }
}

// Obsidian types the secret value as a string but sends null when the field is cleared with "x".
function toSecretName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function describeSetting(): DocumentFragment {
  return createFragment((description) => {
    description.appendText(DESCRIPTION_START);
    description.createEl('a', { text: LINK_TEXT, href: TOKEN_URL });
    description.appendText(DESCRIPTION_END);
  });
}
