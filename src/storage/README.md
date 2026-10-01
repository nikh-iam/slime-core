UI-facing persistence contracts belong here as needed. Phase 0 settings are exposed by
SettingsService; the SQLite connection and schema are owned by `src-tauri/src/storage`.
Never store credentials in settings or expose arbitrary SQL to the webview.
