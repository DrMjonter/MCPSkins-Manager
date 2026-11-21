# MCPSkins Manager

## 1.3.0

### Major Changes

- Add animated texture tools with native Blockbench Flipbook editing and importing multiple PNG frames into a stitched texture.
- Support per-frame timing in `.png.mcmeta`, including repeated frames and preserving timing through frame reordering and duplication.
- Add New Pack to Select Pack to create the folder structure and save the pack title and author.

### Quality of Life

- Add Duplicate Current Frame as a toolbar action for quickly extending animated textures while painting.
- Keep animation preparation, duplication, and health checks aware of animated texture files.

## 1.2.0

### Major Changes

- **Gun pack scanning:** Find weapons and attachments in TaCZ folders and ZIP packs, plus melee weapons, throwables, and consumables from installed LesRaisins JARs. Discovered IDs appear in the weapon dropdown.
- **Automatic asset preparation:** Finds the source geometry and creates skin-specific copies of missing textures, normal/specular maps, icons, and available HUD/LOD textures. Existing skin files are kept.
- **LesRaisins editing:** Prepare geometry, UV textures, icons, and available maps for melee weapons, throwables, and consumables. Geometry is a Blockbench editing reference; MCPSkins currently applies texture and icon changes to these items.
- **Variants and leveling:** Group skins as variants and set level rewards using kill, headshot, and player-kill goals. Renaming a skin updates its variant links, and duplicates start with empty variant and level lists.
- **More skin fields:** Add skin authors, subtitles, and Limited Edition badges. Skin authors stay separate from the pack author, with support for registry-file author defaults.
- **Rarity manager:** Create custom tiers or override built-in ones. Edit names, colors, order, translation keys, fusion costs, and fusion targets, including weighted targets. Rarity dropdowns, sorting, and default colors use the selected pack's definitions.
- **Live pack health:** The header icon updates automatically as saved files change: red for errors, yellow for warnings, and green when there are no active issues. Ignore individual warnings per pack and restore them later if you need to.
- **Update checker:** Notifies you when a new version is pushed to github.

### Quality of Life

- Split the Asset Inspector into **Data**, **Skin**, and a collapsible **Advanced** section, with clearer headings and subtle field separators.
- Add hover help beside field titles and red asterisks for required fields.
- Hide the fusion-weight input until **Override Fusion Weight** is checked.
- Add **Save and Continue** to unsaved-edit prompts so you can save before switching skins or packs.
- Let **Add Level** create a row before variants are selected. Choosing a reward adds that skin to the variant list automatically.
- Mark variants with a purple diamond in the list. Hover it to see their parent skin.
- Move Health Check beside the pack title and Refresh beside search as small icon buttons.
- Move Rescan into **Gun Packs...** and show a completion summary by item type, including custom rarities.
- Make **Open Folder** create the asset folder when it doesn't exist.
- Remember source choices when packs provide conflicting assets, and keep prepared assets usable when their source pack is unavailable.
- Support different registry filenames and all supported item families while keeping the manual asset workflow available.
- Show the plugin version in its title and update the README for the current workflow.

## 1.1.0

- Make Ctrl/Cmd+A select all pack skins, including filtered-out entries, with a hidden-selection count.

- Add scoped keyboard navigation, selection, duplication, search/save/pack shortcuts, and an in-plugin shortcut guide.

- Add a sortable Progress column, ordered Planned, WIP, Complete, then unassigned.
- Lower the desktop minimum to Blockbench 5.1.0 and support its legacy start-screen section API.

- Add Pack Health Check with saved-file diagnostics and issue navigation.
- Add auto-saving WIP, Planned, and Complete status flags through a context submenu, including multi-selection support.

- Extend the glass design to Neo and Soft with matching light surfaces and coral or lavender accents.

- Rework Frutiger Aero with sky-blue glass surfaces, glossy buttons, readable text, and a matching header and table.

- Sort rarity by common, uncommon, rare, epic, legendary instead of alphabetically.

- Add an automatically populated collection filter beside the rarity filter.

- Add an auto-saving Author field above Recent Packs, updating pack metadata and the remembered author.

- Add a persistent Recent Packs table to Select Pack with Name, Author, Path, and remembered namespaces.

- Add an inline editable pack title with automatic per-pack metadata saving in `mcpskins_manager.json`.

- Add a sortable New column at the right edge of the skin list.

- Add Duplicate Skin to the entry context menu, with unique copy IDs and copies of existing geometry and textures on save.
- Add Ctrl/Cmd and Shift multi-selection with shared metadata editing, mixed-value indicators, and disabled identity controls.
- Preserve untouched fields during bulk saves, check all selected entries for conflicts, and recover batch drafts.
- Show subtle 3:1 HUD and 1:1 icon aspect ratio hints when their images are missing.

## 1.0.8

- Fix Open Model importing shared default normal and specular maps. Missing skin maps are now copied from the defaults to `<skin_id>_n.png` and `<skin_id>_s.png` before import.
- Preserve existing skin maps and original default files, including when reopening an existing skin geometry.

## 1.0.7

- Native dockable panel and start-screen access for Blockbench desktop 5.2.2 or newer.
- Search, rarity filters, sorting, skin metadata editing, and texture previews.
- Direct pack-directory selection with compatible MCPSkins pack settings.
- Searchable suggestions for 54 default TaCZ gun IDs and support for custom IDs.
- Remembered custom weapon-name prefixes and per-skin prefix overrides.
- Open existing skin geometry or create missing model and base-texture copies.
- Import matching normal and specular maps in base-color, normal, specular order.
- Preserve loaded painting, unknown registry fields, and existing asset files.
- Unsaved-draft recovery, discard confirmations, and checks for entries changed on disk.

Save Skin saves registry metadata. Save model and painted texture changes separately through Blockbench.
