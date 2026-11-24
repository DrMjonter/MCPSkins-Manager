# MCPSkins Manager v1.2.2

A Blockbench plugin for creating and managing MCPSkins packs. Made to make skin creation a less tedious and annoying process, with less digging through folders and editing JSON by hand.

Made by **Mjonter**. Requires **Blockbench desktop 5.1.0 or newer**.

## Getting started

1. Download `mcpskins_asset_manager.js` from [Releases](https://github.com/DrMjonter/MCPSkins-Manager/releases). If you downloaded the ZIP, extract it first.
2. In Blockbench, go to **File > Plugins > Load Plugin from File** and select the `.js` file.
3. Click **Open MCPSkins Manager** on the start screen, or open it from the **File** or **Tools** menu. You don't need a model open first.
4. Click **Select Pack** and choose your pack folder, for example `mcpskins/my_pack`. Check that the namespace matches the folder containing your skin registries.
5. Starting from scratch? Click **New Pack** in that window. Choose the parent directory, folder name, namespace, pack name, and author. The manager creates the folders and opens the pack. Existing folders are kept safe.

<img width="1250" alt="MCPSkins Manager in Blockbench" src="https://github.com/user-attachments/assets/ec405ac1-70f0-40de-8020-e9ad0d3f937f" />


## Making and editing skins

Select a skin from the list to edit it, or click **New Skin** to start one. The inspector is split into **Data**, **Skin**, and **Advanced**. Hover the little **?** icons if you're unsure what something does.

- Search by name and filter by rarity or collection. Click column headers to sort the list.
- Choose a discovered weapon ID, search the default TaCZ IDs, or type an ID from another pack.
- Custom weapons can have a remembered name prefix. You can also override it for an individual skin.
- Edit names, descriptions, collections, authors, subtitles, rarity colors, NEW and LIMITED badges, and unlock settings.
- Group skins as **variants**, then add level rewards with kill, headshot, or player-kill goals.

Right-click a skin and choose **Duplicate Skin** to make a copy. Adjust the suggested name and ID, then save it to copy the entry and its existing assets. Save any painting in Blockbench first so those changes are included.

Right-click a skin and choose **Delete Skin** to remove it. **Delete Entry** keeps its asset files; **Full Delete** also removes its related textures, icons, geometry, and animation files. Save and close any projects using those files before Full Delete. Variant links and level rewards pointing to the deleted skin are cleared; deleting a parent keeps its variants as separate skins.

For bulk edits, **Ctrl/Cmd-click** individual skins or **Shift-click** a range. Identity fields are disabled while editing multiple skins, and only the shared fields you change are applied.

**Save Skin saves metadata. Save models and painted textures separately using Blockbench's save commands.** If you try to leave an unsaved skin, you can save and continue, discard the changes, or cancel.

## Models and textures

**Open Model** opens an editing reference and imports the skin texture, plus normal and specular maps when available. New skins use the weapon's stock geometry in game. If you want to change its shape, save the skin and click **Use Custom Model** to enable the geometry override. Existing custom models stay enabled; **Use Stock Model** turns the override off and keeps your model for editing. Save and close the skin's model projects before switching back to stock. These controls are for TaCZ guns and attachments; LesRaisins geometry stays an editing reference.

If files are missing, the manager prepares skin-specific copies from the source assets. Existing skin files are kept, so reopening a model won't replace your painting.

The manager looks for TaCZ gun packs in the instance's `tacz` folder and installed LesRaisins JARs in `mods`. Use **Gun Packs...** to change the TaCZ directory or run a rescan. The results show counts for guns, attachments, melee weapons, throwables, consumables, and custom rarities.

**Open Folder** takes you to the item's skin assets and creates the folder if it doesn't exist. The circular-arrow button beside search refreshes the skin list.

## LOD models and textures

The gun inspector lists **LOD Texture** and **LOD Model** with a green check for valid files, a yellow exclamation for invalid files, and a red X for missing files. Hover the indicator for details.

Save the full model and painted textures, then click **Generate LODs**. The manager copies the full model, texture, and available normal/specular maps to the weapon's LOD paths. For example, `uzi_copper_s.png` becomes `uzi_copper_lod_s.png`, and the model is named `uzi__skin_uzi_copper.json`. Existing LOD files require confirmation before replacement.

The generator keeps the full model's geometry and UVs; it does not simplify the mesh. It uses the source gun pack's LOD reference when available. The weapon must have LOD support for the files to be used in game.

## Animated textures

Save the skin first, then open **Animated Textures (Advanced)** below the texture previews. Choose the texture you want to animate and click **Open Flipbook Editor** to use Blockbench's native frame editing tools. Apply your changes there, then save the texture in Blockbench.

Already have separate frames? **Import Multiple Frames** combines PNGs such as `_1.png`, `_2.png`, and `_3.png` into one vertical texture strip. Frames must have matching dimensions, and their filenames determine the order. Copies of the source frames stay in a working folder. You can also use **Import Texture Strip** for an existing strip. Native edits won't be overwritten by those imported frame copies.

Set the default frame time, interpolation, or individual frame durations, then click **Save Playback Settings**. The manager writes the matching `.png.mcmeta`. Times are in ticks: **20 ticks = 1 second**. Frame numbers start at **0**; a blank duration uses the default time. Existing playback order and repeated frames are preserved. Blockbench's native preview uses its FPS setting, so custom per-frame timings apply in game.

For quicker painting, add **Duplicate Current Frame** through Blockbench's toolbar customization or assign it a shortcut. It appends a copy of the current frame and selects the new one, so you can keep painting without reopening the Flipbook Editor. Save the texture afterward. Merge enabled texture layers before using this action.

## Rarities

Click **Rarities** to browse or create rarity tiers. You can edit their names, colors, ladder order, translation keys, fusion costs, and fusion targets, including weighted targets.

Editing a built-in tier saves an override inside your pack. Custom tiers are picked up by both rarity dropdowns, and the list changes when you switch packs.

## Collections Manager

If you use Collection Cases, click **Collections Manager** beside Rarities. The manager finds collections in your pack and lets you set their shop titles, descriptions, prices, case colors, and icon texture IDs.

Under **Advanced**, set key requirements, rarity weights, and excluded skins. Blank fields inherit **Global Defaults**, then the addon's defaults. A price of **0** disables purchasing. Global Defaults apply across all loaded packs. Exclusions from Global Defaults also apply to individual collections; edit the defaults to remove those exclusions.

The Collection field in the Asset Inspector lists collections found in the pack. Choose **+ New Collection** at the bottom to open a new collection draft. Saving it selects the new collection on your skin without losing your other edits.

The odds preview shows rarity and individual skin chances using saved skins from this pack, including skin weights, rarity weights, and exclusions. Other installed packs can change those odds. Renaming a collection updates its matching skin entries throughout this pack too.

Settings are saved in `data/<namespace>/collection_cases/*.json`; use `/reload` in game after saving. Collection Cases must be installed for these settings to take effect. Custom shop icon textures still need to reach clients through a resource pack or mod.

## Keeping your pack organized

Click the pack name beside **Select Pack** to rename it. The Select Pack window also keeps a list of recent packs so you don't have to browse to the same folder every time.

Right-click an entry and use **Status** to mark it **Planned** (red), **WIP** (yellow), or **Complete** (green). Choose **Unassigned** to clear a status, or **Custom Status** to save your own name, flag color, and sort order. Custom statuses are available across packs. You can apply a status to multiple selected skins and sort by the Progress column; both the menu and Progress sorting use the status sort order.

The small health button beside the pack name checks saved files automatically:

- **Red:** errors need attention.
- **Yellow:** warnings only.
- **Green:** no active issues.

Skins with status order 5 or lower, including Planned and Unassigned, are skipped by default. You can change this in **Settings > Debug**.

Click it to open the report. It checks saved registries, textures, geometry when present, animation metadata, and Collection Cases definitions. Missing optional geometry is fine, and HUD or icon aspect ratios do not produce warnings. Missing optional HUD or icon files can still appear as warnings. Individual findings can be ignored, then restored later under **Ignored findings**. Pack titles, authors, progress flags, and ignored findings are stored in `mcpskins_manager.json` inside the pack.

## Exporting packs

Click **Export...** to make a ZIP. Use the collection and status checkboxes to include or exclude groups, then adjust individual skins in the list. Mixed checkboxes mean only some skins in that group are selected.

- **Export Pack:** Includes only the selected skins and runtime files, including Collection Cases metadata and referenced resources. Leaves out editing models, `.bbmodel` files, animation working folders, and unused images.
- **Export Full:** Includes the entire pack, all skins, and project files, regardless of the selection.

The ZIP name starts as `<PackName>_<Author>_<version>.zip`. Set the pack version or type your own filename, then choose where to save it. The save dialog starts in `mcpskins/Packed`, beside your pack folder; the manager creates it if needed. Save textures and models in Blockbench first; export uses saved files and leaves the source pack alone. Links to excluded variants are removed from the exported copy.

## Settings

Click the settings icon beside **Select Pack** to make the manager work the way you like. Changes save automatically and apply across packs.

- **General:** Choose defaults for new skins and automatic asset preparation.
- **Appearance:** Adjust the list, texture previews, and theme.
- **Debug:** Customize health checks or restore the default settings with **Factory Reset**.

The help icons provide quick access to the plugin wiki, MCPSkins wiki, Discord, and template files.

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

The plugin checks GitHub for a newer release when it starts. If one is available, a small update icon appears beside the title. Click it to open the release page.

The [MCPSkins wiki](https://github.com/json-nn/mcpskins/wiki) covers how the mod loads packs and what the different fields and assets do.

Found a bug? [Open an issue](https://github.com/DrMjonter/MCPSkins-Manager/issues) and include what you were doing when it happened. Screenshots help.
