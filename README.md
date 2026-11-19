# MCPSkins Manager v1.2.0

A Blockbench plugin for creating and managing MCPSkins packs. Made to make skin creation a less tedious and annoying process, with less digging through folders and editing JSON by hand.

Made by **Mjonter**. Requires **Blockbench desktop 5.1.0 or newer**.

## Getting started

1. Download `mcpskins_asset_manager.js` from [Releases](https://github.com/DrMjonter/MCPSkins-Manager/releases). If you downloaded the ZIP, extract it first.
2. In Blockbench, go to **File > Plugins > Load Plugin from File** and select the `.js` file.
3. Click **Open MCPSkins Manager** on the start screen, or open it from the **File** or **Tools** menu. You don't need a model open first.
4. Click **Select Pack** and choose your pack folder, for example `mcpskins/my_pack`. Check that the namespace matches the folder containing your skin registries.

<img width="1250" alt="MCPSkins Manager in Blockbench" src="https://github.com/user-attachments/assets/ec405ac1-70f0-40de-8020-e9ad0d3f937f" />


## Making and editing skins

Select a skin from the list to edit it, or click **New Skin** to start one. The inspector is split into **Data**, **Skin**, and **Advanced**. Hover the little **?** icons if you're unsure what something does.

- Search by name and filter by rarity or collection. Click column headers to sort the list.
- Choose a discovered weapon ID, search the default TaCZ IDs, or type an ID from another pack.
- Custom weapons can have a remembered name prefix. You can also override it for an individual skin.
- Edit names, descriptions, collections, authors, subtitles, rarity colors, NEW and LIMITED badges, and unlock settings.
- Group skins as **variants**, then add level rewards with kill, headshot, or player-kill goals.

Right-click a skin and choose **Duplicate Skin** to make a copy. Adjust the suggested name and ID, then save it to copy the entry and its existing assets. Save any painting in Blockbench first so those changes are included.

For bulk edits, **Ctrl/Cmd-click** individual skins or **Shift-click** a range. Identity fields are disabled while editing multiple skins, and only the shared fields you change are applied.

**Save Skin saves metadata. Save models and painted textures separately using Blockbench's save commands.** If you try to leave an unsaved skin, you can save and continue, discard the changes, or cancel.

## Models and textures

**Open Model** opens the skin's geometry and imports its texture, plus normal and specular maps when available. If the files are missing, the manager prepares skin-specific copies from the source assets. Existing skin files are kept, so reopening a model won't replace your painting.

The manager looks for TaCZ gun packs in the instance's `tacz` folder and installed LesRaisins JARs in `mods`. Use **Gun Packs...** to change the TaCZ directory or run a rescan. The results show counts for guns, attachments, melee weapons, throwables, consumables, and custom rarities.

**Open Folder** takes you to the item's skin assets and creates the folder if it doesn't exist. The circular-arrow button beside search refreshes the skin list.

## Rarities

Click **Rarities** to browse or create rarity tiers. You can edit their names, colors, ladder order, translation keys, fusion costs, and fusion targets, including weighted targets.

Editing a built-in tier saves an override inside your pack. Custom tiers are picked up by both rarity dropdowns, and the list changes when you switch packs.

## Keeping your pack organized

Click the pack name beside **Select Pack** to rename it. The Select Pack window also keeps a list of recent packs so you don't have to browse to the same folder every time.

Right-click an entry and use **Status** to mark it **Planned** (red), **WIP** (yellow), or **Complete** (green). You can apply a status to multiple selected skins and sort by the Progress column.

The small health button beside the pack name checks saved files automatically:

- **Red:** errors need attention.
- **Yellow:** warnings only.
- **Green:** no active issues.

Click it to open the report. Individual findings can be ignored, then restored later under **Ignored findings**. Pack titles, authors, progress flags, and ignored findings are stored in `mcpskins_manager.json` inside the pack.

## Handy shortcuts

Focus the manager to use these. Normal typing shortcuts still work in text fields.

| Shortcut | Action |
| --- | --- |
| Up / Down | Move through the skin list |
| Shift + navigation | Extend your selection |
| Ctrl/Cmd + A | Select all skins in the loaded pack, including ones hidden by filters |
| Enter | Open the focused skin's model from the list |
| Ctrl/Cmd + D | Duplicate a skin |
| Ctrl/Cmd + S | Save skin metadata |
| Ctrl/Cmd + F | Jump to search |
| Ctrl/Cmd + Shift + N | New Skin |
| Ctrl/Cmd + Shift + R | Refresh the list |
| ? | Open the full shortcut guide while in the list |

The **Keyboard Shortcuts** button at the bottom opens the same guide.

## More info

The [MCPSkins wiki](https://github.com/json-nn/mcpskins/wiki) covers how the mod loads packs and what the different fields and assets do.

Found a bug? [Open an issue](https://github.com/DrMjonter/MCPSkins-Manager/issues) and include what you were doing when it happened. Screenshots help.
