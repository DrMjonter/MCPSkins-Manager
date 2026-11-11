# MCPSkins Manager for Blockbench

Native dockable desktop plugin for **Blockbench 5.2.2 or newer**, based on the supplied Python MCPSkins Asset Manager. Made by Mjonter.

## Load the plugin

1. In Blockbench, open **File → Plugins** and use **Load Plugin from File** to select `mcpskins_asset_manager.js` in this directory.
2. No model needs to be open. Click **Open MCPSkins Manager** on Blockbench's start screen, or choose **File → MCPSkins Manager**. With a model selected, the File/Tools menu command opens the dockable panel. Drag its header to dock, resize, or float it using Blockbench's panel controls.
3. Click **Select Pack**. Select your pack directory directly, for example `mcpskins/my_pack`. The plugin uses its parent as the `mcpskins` root and the selected folder name as Pack Folder.
4. Check Pack Namespace, then apply the dialog. Existing `skin_manager_settings.json` is read from the parent directory; the namespace defaults to `example` when no settings exist. Grant Blockbench's folder permission for that parent when requested so the plugin can access the pack and shared settings.

The plugin file is self-contained; Python and Node are not required to use it. If you downloaded the release ZIP, extract it first, then load `mcpskins_asset_manager.js`. Keep that filename unchanged. Loading the plugin is a manual step and does not modify your resource pack until you apply pack settings, save a skin, prepare missing model/texture copies, or choose a legacy theme preset.

The start-screen view and dockable panel share the same selection, filters, and unsaved registry draft. Opening a model from the start screen switches to Blockbench's editor, where you can continue using the panel. **Back to start screen** collapses the start-screen manager without discarding your draft. Ctrl/Cmd+S saves registry edits while focus is inside either manager view.

## Using the panel

Search matches skin name, ID, collection, description, registry filename, and weapon display name. Filter by rarity and click column headings to sort. Right-click an entry to open its registry JSON in the default desktop application or reveal its directory.

Select an entry to edit metadata, or choose **New Skin**. Weapon ID is a searchable dropdown with all 54 guns from the TaCZ 1.1.8 default pack. Search by display name (for example `AWM`) or namespaced ID (`tacz:ai_awp`), or use the arrow button to browse the full list. Arrow keys and Enter select a suggestion; Escape dismisses the list. Custom namespaced IDs such as `mypack:custom_rifle` can be typed directly and are not restricted to the suggestions. Weapon IDs remain read-only for existing entries. Leaving a new skin's ID empty generates `<weapon_basename>_<skin_name_slug>`. Save Skin writes metadata; Discard Changes restores the loaded entry. Ctrl/Cmd+S saves the registry only while keyboard focus is inside this panel. Elsewhere, Blockbench's shortcuts retain their normal behavior.

When you finish entering an unknown custom weapon ID, the plugin asks for its display-name prefix. For example, enter `Karambit` for `cs2_wt:karambit` to produce `Karambit | Oceania`. Prefixes are remembered in Blockbench local storage by the complete weapon ID and reused across packs and restarts. Default TaCZ name mappings are unchanged. **Override name prefix** reveals a per-skin prefix field; this changes only the current skin's saved `name` and does not replace the remembered weapon name. Existing saved prefixes are retained when editing. No new fields are added to the skin JSON schema.

The skin, HUD, and icon previews show existing PNGs with nearest-neighbor rendering. Refresh Files reloads the registries and previews, with a discard prompt when metadata edits are pending. Renaming a registry ID changes metadata only; it does not rename assets.

**Open Model** prefers `<skin_id>.json`, then `<skin_id>.geo.json`. If neither exists, it finds the base weapon geometry and creates `<skin_id>.geo.json`. It also copies the default `<weapon_basename>.png` to `<skin_id>.png` whenever that skin texture is missing, including when the skin geometry already exists. For example, weapon `ai_awp` and skin `Aurora` use `ai_awp_aurora.png`. Explicit skin IDs remain the filenames used by the registry and previews. Existing geometry and skin PNGs are preserved. This action can create assets before registry metadata is saved. It does not create HUD or icon images.

The skin texture is automatically imported and applied using an undoable Blockbench edit after the model finishes loading, including after a multi-geometry selection dialog. If the model is already open, its tab is selected and the skin texture is imported if missing; a skin texture already loaded in memory is reused so unsaved painting is preserved. Save/export model edits and save painted textures with Blockbench's normal commands; **Save Skin does not export models or save texture painting**.

Open Model also imports skin-specific normal (`_n.png`) and specular (`_s.png`) maps when present. If `<skin_id>_n.png` or `<skin_id>_s.png` is missing, it copies the corresponding `<weapon_basename>_n.png` or `<weapon_basename>_s.png` to that skin-specific filename first. Only the skin copies are imported; shared default maps remain unchanged. Existing skin maps are never overwritten. This also applies when the skin geometry already exists. Missing optional maps are skipped. The Texture panel is ordered base color, normal, then specular. Only the base color is applied to faces and selected for display; auxiliary maps remain separate texture entries rather than being blended over the skin. Unrelated skins' maps are ignored and existing in-memory painting is reused.

Open Folder and Open File may request Blockbench's separate desktop shell permission. No executable path or external Blockbench process is needed.

## Compatibility and persistence

Registry locations remain:

```text
<root>/<pack_folder>/data/<pack_namespace>/skins/<weapon_basename>_skins.json
<root>/<pack_folder>/assets/mcpskins/textures/skins/<weapon_namespace>/<weapon_basename>/
```

The plugin preserves `base_gun` / `base_melee`, the `skins` array, all 54 weapon display mappings, five rarity defaults, unknown properties, and unrelated entries. It retains optional `locked_text`, `unlocked`, and fusion `weight` behavior. Colors save as uppercase `0xRRGGBB`. UTF-8 BOM input is supported; output uses two-space indentation, Unicode, a trailing newline, and temporary-file replacement. It re-reads the registry before saving and refuses to overwrite a selected entry changed on disk. Matching-basename files belonging to another weapon are rejected.

Pack settings keep the original two-key `skin_manager_settings.json` format in the selected pack's parent directory. The `pack_folder` value is derived from the selected directory's name; `pack_namespace` comes from the namespace field. The derived root and panel theme are stored separately in Blockbench local storage, so previous selections continue to load. The native Blockbench theme is the default; all six original palettes are optional panel-scoped presets. Selecting a legacy preset also updates `skin_manager_theme.json` for the Python app.

Unsaved drafts are backed up in Blockbench local storage and restored after plugin reload/re-enable for the matching pack. They are not written to pack JSON until Save Skin. Normal window closing prompts for Save Skin, Discard, or Cancel separately from model prompts. Plugin unload retains draft recovery because Blockbench's unload callback cannot veto unloading. Recovery depends on local storage remaining available.

JavaScript cannot represent arbitrary Python integers exactly. Existing JSON containing unsafe integer values is rejected rather than silently rounded; fusion weights must be positive safe integers. Path components that would escape the selected root are rejected. The optimistic save check, like the Python app's, is not an inter-process lock; avoid simultaneous writes from multiple manager instances.

## Updating

Save pending edits before updating. Replace the previous plugin file with the new `mcpskins_asset_manager.js`, then reload the local plugin from Blockbench's Plugins dialog. Your pack settings, remembered custom weapon names, and draft recovery use the existing storage locations.

Development and release-building instructions are in `docs/DEVELOPMENT.md` in the source repository.
