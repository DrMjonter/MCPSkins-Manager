# MCPSkins Manager

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
