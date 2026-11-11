# Development and release packaging

The plugin source is split into domain rules, storage, assets, state/controller, UI, and Blockbench/desktop adapters. The two Python applications remain as unchanged compatibility references. `mcpskins_asset_manager.js` is generated; edit `src/` and rebuild instead of editing the bundle.

## Build and verify

Requirements: Python 3.9+ for bundling and Node 20+ for tests. The build and tests have no npm dependencies. Python compatibility tests also use the standard-library Tkinter module from the Python reference application.

```powershell
python tools/build.py
node --check mcpskins_asset_manager.js
node --test tests/*.test.js
```

Tests use temporary packs. The Vue rendering test reads a locally installed Blockbench bundle when available; it skips when that installation is unavailable. Other tests do not require a running Blockbench instance.

## Build release artifacts

Keep the version in `package.json`, `src/plugin.js`, and `CHANGELOG.md` consistent, run the tests, then:

```powershell
python tools/release.py
```

This rebuilds the plugin and creates:

```text
dist/
  MCPSkins-Manager-v<VERSION>.zip
  RELEASE_NOTES-v<VERSION>.md
  SHA256SUMS.txt
  v<VERSION>/
    mcpskins_asset_manager.js
    README.md
    CHANGELOG.md
    SHA256SUMS.txt
```

The ZIP uses an explicit file allowlist. It contains the plugin, user documentation, changelog, and checksums. It excludes source, tests, build tools, Python references, temporary files, settings, texture/model assets, and local pack data. No runtime libraries or extracted Blockbench code are redistributed. Archive metadata is fixed so identical inputs produce identical release files.

Upload the ZIP and/or the standalone `mcpskins_asset_manager.js` from the versioned directory to a GitHub release tagged `v<VERSION>`. Paste the generated release notes into the release description. Preserve the plugin's filename; Blockbench expects it to match its registered ID. Packaging does not publish anything or modify the installed plugin.

## Desktop acceptance check

Automated tests cover registry compatibility and simulated plugin interactions. Before publishing a release, check the installed desktop UI with a test pack: start-screen launch; pack selection; gun and melee editing; custom name prompts and overrides; cancellation with unsaved edits; opening single- and multi-geometry models; normal/specular imports; painting and saving; plugin reload with a draft; and window closing with unsaved model and registry edits.
