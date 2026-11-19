# MCPSkins Manager

## 1.2.0

- Add Save and Continue to unsaved-edit prompts, preserving edits when saving fails or is canceled and continuing with fresh saved entries.

- Allow Add Level before selecting variants; choosing a level reward adds its skin to the variant list automatically.

- Add independent skin-author, subtitle, and Limited fields, including shared-field bulk editing and search by author/subtitle.
- Add a same-file variant picker and ordered level editor for kills, headshots, and player kills, with safe validation and health-check diagnostics.
- Preserve pack-author separation and registry-file author defaults; keep variant links consistent when a skin ID changes and start duplicates without shared links.

- Discover installed TaCZ gun and attachment definitions from folders and ZIP packs, including cross-pack resource references.
- Add a configurable TaCZ directory, cached discovery, Rescan Gun Packs, and remembered source choices for conflicting resources.
- Populate weapon suggestions from installed packs while preserving default display names and custom inputs.
- Prepare independent skin geometry at the documented MCPSkins override path and copy missing default textures, normal/specular maps, icons, HUD variants, and LOD textures.
- Remember model locations in pack metadata, preserve existing skin files, and include resolved geometry in duplication and health checks.
- Support attachment registries and other base-item keys, discover arbitrary registry JSON filenames, and keep the manual asset workflow available.

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
