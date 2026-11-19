# Development and release packaging

The plugin source is split into domain rules, storage, assets, state/controller, UI, and Blockbench/desktop adapters. The original standalone Python applications are excluded from Git. Optional local copies can be kept in the root folder for compatibility checks. `mcpskins_asset_manager.js` is generated; edit `src/` and rebuild instead of editing the bundle.

## Build and verify

Requirements: Python 3.9+ for bundling and Node 20+ for tests. The build and tests have no npm dependencies. The two optional Python reference comparisons require a local `MCPSkins_Asset_Manager.py` and its standard-library Tkinter module; they skip when that reference is absent.

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

## Blockbench compatibility

The minimum supported desktop version is 5.1.0. API review used the official `v5.1.0` tagged source for plugin-scoped native modules, filesystem methods, dialogs, panels, texture imports, codec events, Undo texture ordering, and start-screen sections. A feature-detected adapter uses `addStartScreenSection` in 5.1 and `StartScreen.addSection` in 5.2. Blockbench 5.0 lacks the plugin `shell` module used by Open File and Open Folder, so it is outside the supported range.

The tagged sources are available at https://github.com/JannisX11/blockbench/tree/v5.1.0 and https://github.com/JannisX11/blockbench/blob/v5.0.0/js/native_apis.ts. Automated tests exercise both start-screen API shapes and use the installed 5.2.2 Vue runtime. This API review is not a full desktop acceptance run on 5.1.0; perform the desktop acceptance check above on that version before publishing a release.

## Installed TaCZ pack discovery

The rollback checkpoint before this work is `e131641852f419c53c6453165b6aa79ae58bd906`, pushed to `main`. The new local build is v1.2.0.

`src/gunpacks/` contains the JSONC reader, bounded ZIP reader, and resource catalog. Sources are read through a separate folder-scoped native filesystem and are never written. The inferred source directory is `<parent of mcpskins>/tacz`; **Gun Packs...** overrides it and **Rescan Gun Packs** rebuilds the in-memory catalog. Directory overrides and explicit source choices are stored locally under `mcpskins_asset_manager.gunpacks.v1`, separately from the original pack settings schema.

Gun and attachment IDs come from `data/<namespace>/index/guns|attachments/*.json`. Their display references resolve through `assets/<namespace>/display/guns|attachments/`. Models, textures, and companion assets are resolved across all indexed sources by their exact resource locations. Identical duplicate resources are accepted; differing ambiguous resources prompt for a source, with coherent assets preferred from the defining pack. Folder sources and single-wrapper ZIP layouts are supported. ZIP entries use stored or deflate compression, CRC checks, a 256 MB archive limit, and a 64 MB expanded-asset limit; ZIP64, multipart, encrypted archives, and unsafe paths are rejected with diagnostics. ZIP data is read on demand with a single-archive cache.

`prepareSkin` creates MCPSkins geometry overrides under `assets/<model namespace>/geo_models/<base model path>__skin_<skin ID>.json`. The pack metadata `weapon_models` map records the exact model reference by `<item kind>:<base ID>` for later opening, duplication, and health checks, even with the source packs unavailable. Existing skin geometry and painting take precedence. A legacy skin geometry file can be copied into the canonical location; an open legacy project with unsaved model or texture edits must first be saved. Missing base, normal, specular, icon, HUD, empty-HUD, and LOD textures are copied when provided; the base PNG animation metadata is copied too. The old manually prepared model/texture workflow remains available.

Definitions for virtual attachments without standalone geometry cannot open a 3D model. Melee, throwable, and consumable registries can be edited, but automatic source discovery currently targets TaCZ gun and attachment index formats. Malformed third-party display JSON is reported rather than rewritten. Full LOD model generation and addon-specific model discovery are outside this update.

Tests: `node --test --test-isolation=none tests/*.test.js`. Fixtures cover folder/ZIP sources, JSONC, cross-pack resources, source conflicts, cancellation/unload, changed/corrupt archives, canonical paths, rollback, offline reopening, attachment registries, and preserving source packs and existing artwork. Real installed-pack smoke tests should write only to `.test-artifacts/`, never the user's live pack.

## Skin metadata, variants, and level goals

Pack author remains exclusively in the manager's `mcpskins_manager.json` metadata. The inspector's Skin author writes `skins[i].author`; no value is copied from the pack author into a registry or skin. An existing registry-level `author` is preserved and shown as a default, inherited when the individual skin author is omitted. `subtitle` and `limited` are optional per-skin fields; blank strings and false/empty optional values are omitted when saved.

`src/domain/variants.js` normalizes positive integer goal counters and validates relationships against the target registry file. Add Level can create a row before any variant is checked. Its reward dropdown lists eligible same-file skins and automatically adds the chosen reward to the root's variants. The inspector also selects same-file skins directly as variants and adds ordered levels with `variant` and `requires` (`kills`, `headshots`, `player_kills`). Requirements are cumulative counters that must all be met; the root is level 1 and array entries represent levels 2 onward. Cross-file links, self-links, default skins, nested variants, shared children, missing level targets, and invalid counters are rejected before writes. Renaming a referenced skin updates its root's variant and level links in the same atomic file save. Unrelated unknown JSON properties remain intact.

`src/ui/variant-editor.js` emits immutable draft updates, removes linked level goals when a variant is unchecked, and allows level order changes. Relationship editing is single-skin only; author, subtitle, and Limited support bulk editing. Duplicates retain simple metadata and art but clear variant/level relationships. Recovery supports the new arrays and rejects malformed cached shapes. Health Check reports invalid new fields and relationships. No custom animation editor or animation-file handling was added in this update.

## Unsaved-edit transitions

The transition prompt offers Save and Continue, Discard, and Cancel. Save uses the normal validated save and name-prefix flow before running the pending action. Validation errors, write conflicts/failures, canceled prefix prompts, or plugin disposal prevent continuation and retain recovery data. Filtering is preserved where still valid. Selection and duplication resolve their source rows again after saving, Select All includes newly saved entries, and health navigation follows a skin renamed during the save. Transition-based commands return false on failure so keyboard focus does not advance on a blocked action.
