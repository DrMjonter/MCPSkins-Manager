# MCPSkins Manager for Blockbench

Plugin for **Blockbench desktop 5.1.0 or newer**. Made by Mjonter.
Intended to make skin creation and management a much less tedious and annoying process.

## Load the plugin

1. In Blockbench, open **File → Plugins** and use **Load Plugin from File** to select `mcpskins_asset_manager.js` in this directory.
2. Click **Open MCPSkins Manager** on Blockbench's start screen, or choose **File → MCPSkins Manager**. With a model selected, the File/Tools menu command opens the dockable panel. Drag its header to dock, resize, or float it using Blockbench's panel controls.
3. Click **Select Pack**. Select your pack directory directly, for example `mcpskins/example`
<img width="1250" height="1942" alt="Untitled-1" src="https://github.com/user-attachments/assets/ec405ac1-70f0-40de-8020-e9ad0d3f937f" />


## Duplicate and edit multiple skins

Right-click an entry and choose **Duplicate Skin**. The editor suggests a unique copy name and ID. Adjust them, then click **Save Skin** to create the entry and copy its existing geometry, skin texture, normal/specular maps, HUD, and icon. Existing destination files are never overwritten. Save painted source textures in Blockbench first to include those changes in the copy.

Use **Ctrl-click** (or **Cmd-click**) to toggle individual entries, and **Shift-click** to select a range in the current filtered and sorted list. A regular click returns to one entry. With multiple skins selected, name, ID, weapon, and prefix controls are disabled. Change shared metadata and click **Save Selected Skins**; only the fields you change are applied, preserving each skin's other values. Different values are marked as mixed. **Discard Changes** resets the shared editor.

Missing HUD previews show a recommended **3:1** aspect ratio; missing icon previews show **1:1**.

## Pack metadata

Click the pack title beside **Select Pack** to edit it. New packs display **Pack Name**. Press Enter or click outside the field to save automatically; Escape cancels the edit. A blank title returns to **Pack Name**.

Metadata is stored inside the selected pack in `mcpskins_manager.json`, starting with a `title` field. It travels with the pack, is independent of skin drafts, and preserves additional metadata fields when the title changes.

## Recent packs

**Select Pack** shows the 12 most recently opened packs with **Name**, **Author**, and **Path**. Click an entry or focus it and press Enter to reopen it with its remembered namespace. History is saved locally in Blockbench. Folder selection remains available above the list.

Edit **Author** above Recent Packs; changes save automatically to the directory selected in the popup and update its recent entry.

Name uses the metadata `title`; Author uses the optional `author` field in the pack's `mcpskins_manager.json`. Packs without an author display **Not specified**. Metadata edits made through the manager update the remembered entry.

The collection dropdown beside rarity defaults to **All** and lists the selected pack's collections automatically. It works together with search and rarity filtering, and updates when skins are saved or files refreshed.

## Status flags and pack health

Right-click a skin and hover **Status** to choose **WIP** (yellow), **Planned** (red), or **Complete** (green), or clear its flag. If the clicked skin belongs to a multi-selection, the status applies to all selected skins. Flags save automatically in the pack's `mcpskins_manager.json` and do not change the skin registry schema.

Click **Health Check** below the list to inspect saved registry files, duplicate IDs, registry filenames, required metadata, missing geometry/textures, geometry JSON, PNG headers, and HUD/icon aspect ratios. The report lists errors and warnings with **Select Skin** and **Reveal Registry** actions. Missing optional HUD/icon images are warnings; PNG checks inspect headers and dimensions rather than fully decoding images. The check does not repair or modify files, and does not include unsaved Blockbench model/texture edits or skin drafts.

Click **Progress** to sort Planned, WIP, Complete, then unassigned skins; click again to reverse.

## Keyboard shortcuts

Focus the manager to use its shortcuts. **Keyboard Shortcuts** beside the theme selector opens the full guide.

| Shortcut | Action |
| --- | --- |
| Up / Down | Previous / next visible skin |
| Home / End | First / last visible skin |
| Page Up / Page Down | Move one visible page |
| Shift + navigation | Extend the selection |
| Ctrl/Cmd + navigation | Move focus without changing selection |
| Ctrl/Cmd + A | Select all pack skins, including filtered-out entries, while in the list |
| Enter or Ctrl/Cmd + Enter | Open the focused skin model from the list |
| Ctrl/Cmd + D | Duplicate one selected skin outside text fields |
| Ctrl/Cmd + F | Focus search |
| Ctrl/Cmd + S | Save skin metadata; saves the pack title while editing it |
| Ctrl/Cmd + Shift + N | New Skin |
| Ctrl/Cmd + Shift + O | Select Pack |
| Ctrl/Cmd + Shift + R | Refresh Files |
| Ctrl/Cmd + Shift + H | Health Check |
| Escape in search | Clear search |
| Down in search | Move into the list |
| ? in the list | Show the shortcut guide |

Navigation follows the current filters and sort order. Ctrl/Cmd+A selects the entire loaded pack without clearing filters; the inspector shows how many selected skins are hidden. Unsaved-change prompts still apply. New and duplicate shortcuts focus the skin name for editing. Normal text-editing shortcuts remain available in inputs, and keys outside the manager retain Blockbench's normal behavior.
