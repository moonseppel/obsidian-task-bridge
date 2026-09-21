# Style Guide for AI Agents

## 1. TypeScript & JavaScript Rules

### 1.1 Type Safety & Strictness
* **Enable Strict Mode:** Always assume `strict: true` in `tsconfig.json`.
* **No `any`:** Explicitly define types and interfaces for all settings, states, API payloads, and AST elements. Use `unknown` with type guards if types are dynamically inferred.
* **Return Types:** Include explicit return types on all functions, methods, and asynchronous operations.

### 1.2 Application State & Context Access
* **No Global `app` Reference:** Never access `app` or `window.app` globally.
* **Use `this.app`:** Always reference the Obsidian `App` instance via `this.app` within your `Plugin`, `ItemView`, or `Modal` classes.

### 1.3 Resource Management & Lifecycle Safety
* **Automatic Garbage Collection:** Never attach event listeners or DOM intervals directly without registering them to Obsidian’s component lifecycle.
* **Register Events:** Use `this.registerEvent(this.app.workspace.on('...', ...))` so events are automatically unsubscribed on plugin unload.
* **Register Intervals:** Use `this.registerInterval(window.setInterval(...))` instead of raw `setInterval`.
* **Custom Disposal:** Use `this.register(() => ...)` for custom cleanup callbacks that must run during `onunload()`.

### 1.4 File System, Paths & Cross-Platform Rules
* **Avoid Raw Node `fs`:** Do not use Node.js `fs` or `path` modules for vault file operations. They break mobile compatibility (iOS/Android).
* **Mark Desktop-Only:** If native Node APIs or binary dependencies are strictly required, set `"isDesktopOnly": true` in `manifest.json`.
* **Path Normalization:** Always pass file and folder paths through Obsidian’s built-in `normalizePath()` helper to resolve cross-platform separator differences (`/` vs `\`).

### 1.5 Safe Vault & Editor Operations
* **Prefer Editor API for Active Notes:** When operating on the open note, use the `Editor` object (`this.app.workspace.getActiveViewOfType(MarkdownView)?.editor`) to maintain cursor location, undo history, and scroll positioning.
* **Use `vault.process()` for Atomic Writes:** Avoid calling `this.app.vault.modify()` directly on background files. Use `this.app.vault.process(file, (data) => ...)` to prevent race conditions and concurrent edit conflicts.
* **Frontmatter Management:** Always manipulate note metadata via `this.app.fileManager.processFrontMatter(file, (frontmatter) => ...)`. Do not parse or string-replace YAML headers manually using regex.

---

## 2. Styling & CSS Rules

### 2.1 Dynamic Theming via CSS Variables
* **No Hardcoded Colors:** Never hardcode HEX, RGB, or fixed pixel color values for UI elements.
* **Use Theme Variables:** Always leverage native Obsidian CSS custom properties:
  * Text: `var(--text-normal)`, `var(--text-muted)`, `var(--text-faint)`
  * Backgrounds: `var(--background-primary)`, `var(--background-secondary)`, `var(--background-secondary-alt)`
  * Accents: `var(--interactive-accent)`, `var(--interactive-accent-hover)`
  * Borders: `var(--divider-color)`, `var(--border-width)`

### 2.2 Namespacing & Scoping
* **Plugin-Specific Prefixes:** Prefix every CSS selector with the plugin's unique ID to avoid visual leakage or theme conflicts (e.g., `.my-plugin-sidebar-container`, `.my-plugin-button`).
* **View Container Scoping:** Attach custom classes directly to container elements (`this.containerEl.addClass('my-plugin-view')`) rather than styling generic DOM selectors like `div` or `.workspace-leaf`.

---

## 3. DOM & HTML Rules

### 3.1 Safe DOM Construction
* **No `innerHTML`:** Avoid `innerHTML` or string interpolation when building UI to prevent Cross-Site Scripting (XSS) vulnerabilities.
* **Use Built-in Helpers:** Build HTML elements programmatically using Obsidian’s DOM helper methods:
  ```typescript
  const container = parentEl.createDiv({ cls: 'my-plugin-container' });
  container.createEl('h4', { text: 'Title' });
  container.createSpan({ text: 'Description', cls: 'my-plugin-desc' });
  ```

### 3.2 UI Framework Integration (React / Svelte)
* **Lifecycle Binding:** If mounting UI frameworks inside custom `ItemView` leaves or `Modal` popups, ensure component mount occurs in `onOpen()` and complete unmount/destruction occurs in `onClose()` or `onunload()`.
* **DOM Cleanup:** Call `el.empty()` before re-rendering complex vanilla DOM trees to ensure proper memory cleanup.

---

## 4. Code Architecture & Formatting

### 4.1 Project Directory Layout
Maintain a clean, modular source layout rather than putting all logic in `main.ts`:

```
my-plugin/
├── src/
│   ├── main.ts              # Lifecycle & command registration only
│   ├── settings.ts          # Settings interface, defaults, and setting tab
│   ├── views/               # Custom ItemViews, modals, and suggest views
│   ├── services/            # Core business logic and external integrations
│   └── utils/               # Pure helper functions and path handlers
├── styles.css               # Namespaced plugin styles
├── manifest.json
└── tsconfig.json
```

### 4.2 Settings Management Pattern
* Define a single structured settings interface and defaults object:
  ```typescript
  export interface MyPluginSettings {
      apiKey: string;
      enableAutoSync: boolean;
      syncIntervalSeconds: number;
  }

  export const DEFAULT_SETTINGS: MyPluginSettings = {
      apiKey: '',
      enableAutoSync: false,
      syncIntervalSeconds: 300,
  };
  ```
* Load settings cleanly using `Object.assign()`:
  ```typescript
  async loadSettings() {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  ```

### 4.3 Naming Conventions
* **Files:** Use kebab-case (`custom-modal.ts`, `settings-tab.ts`).
* **Classes & Interfaces:** Use PascalCase (`MyPluginSettingsTab`, `SyncEngine`).
* **Methods & Variables:** Use camelCase (`registerCommands`, `activeFile`).
* **Constants:** Use UPPER_SNAKE_CASE (`DEFAULT_TIMEOUT_MS`).

---

## 5. UX, Ideation & Native Standards

### 5.1 Native Visual Integration
* **Use Native UI Components:** Build settings screens using Obsidian's `Setting` class. Use standard `Modal` or `SuggestModal` helpers for user input instead of custom popups.
* **Command Palette Hygiene:** Pass clean titles to `this.addCommand()`. Do not repeat the plugin name inside the `name` field; Obsidian automatically prefixes commands with the plugin name in settings and palette lists.
  * **Good:** `name: 'Toggle sidebar view'`
  * **Bad:** `name: 'My Plugin: Toggle sidebar view'`

### 5.2 Mobile-First & Responsive UX
* Touch targets must be sufficiently large for mobile users.
* Do not rely solely on hover interactions (`:hover`), as mobile viewports do not support hover states natively.
* Provide command palette equivalents for all sidebar or toolbar actions.

### 5.3 Safety & Non-Destructive Defaults
* Default settings must prefer safe, non-destructive behavior.
* Destructive actions (such as mass updating notes, deleting files, or overwriting frontmatter) must display a confirmation `Modal` before proceeding.
