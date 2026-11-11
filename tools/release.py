"""Create an allowlisted, reproducible release package using the standard library."""
import hashlib
import json
from pathlib import Path
import re
import runpy
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = "mcpskins_asset_manager.js"
FILES = (PLUGIN, "README.md", "CHANGELOG.md")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def release():
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
        raise ValueError("Invalid release version")
    source = (ROOT / "src/plugin.js").read_text(encoding="utf-8")
    registered = re.search(r"version:\s*['\"]([^'\"]+)['\"]", source)
    if not registered or registered[1] != version:
        raise ValueError("package.json and plugin registration versions differ")
    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    if not re.search(r"^## " + re.escape(version) + r"\s*$", changelog, re.MULTILINE):
        raise ValueError("The current version is missing from CHANGELOG.md")

    runpy.run_path(str(ROOT / "tools/build.py"), run_name="__main__")
    payload = {name: (ROOT / name).read_bytes() for name in FILES}
    plugin = payload[PLUGIN].decode("utf-8")
    if "Plugin.register('mcpskins_asset_manager'" not in plugin:
        raise ValueError("The plugin ID does not match its loadable filename")
    if re.search(r"\bdebugger\s*;|console\.(?:log|debug)\s*\(|localhost|127\.0\.0\.1|[A-Za-z]:\\", plugin):
        raise ValueError("The production bundle contains debugging code or a local path")
    if re.search(r"(?im)^## Development\s*$|[A-Za-z]:\\", payload["README.md"].decode("utf-8")):
        raise ValueError("The user README contains development-only or machine-specific content")

    sums = "".join(f"{digest(data)}  {name}\n" for name, data in payload.items())
    payload["SHA256SUMS.txt"] = sums.encode("utf-8")
    output = ROOT / "dist"
    staging = output / f"v{version}"
    staging.mkdir(parents=True, exist_ok=True)
    expected = set(payload)
    unexpected = [p.name for p in staging.iterdir() if p.name not in expected or not p.is_file()]
    if unexpected:
        raise ValueError(f"Unexpected files in release staging directory: {unexpected}")
    for name, data in payload.items():
        (staging / name).write_bytes(data)

    archive = output / f"MCPSkins-Manager-v{version}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for name, data in payload.items():
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            package.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(archive) as package:
        if set(package.namelist()) != expected or package.testzip() is not None:
            raise ValueError("Release archive verification failed")
        for name, data in payload.items():
            if package.read(name) != data:
                raise ValueError(f"Archive content mismatch: {name}")

    external_sums = f"{digest(archive.read_bytes())}  {archive.name}\n"
    external_sums += f"{digest(payload[PLUGIN])}  v{version}/{PLUGIN}\n"
    (output / "SHA256SUMS.txt").write_text(external_sums, encoding="utf-8", newline="\n")
    notes = f"""# MCPSkins Manager v{version}

Add, edit, and browse MCPSkins in Blockbench desktop **5.2.2 or newer**.

Download `MCPSkins-Manager-v{version}.zip` and extract it, or download the standalone `{PLUGIN}`. In Blockbench, open **File → Plugins → Load Plugin from File** and select `{PLUGIN}`. Keep that filename unchanged. No Python, Node, or separate dependencies are needed to use the plugin.

Open **MCPSkins Manager** on the start screen or through the File menu. Click **Select Pack**, choose your pack directory, and confirm the namespace. The pack's parent is automatically used as the MCPSkins root.

Includes a dockable manager, searchable TaCZ/custom weapon IDs, remembered name prefixes, per-skin prefix overrides, metadata editing, texture previews, model preparation, and normal/specular map imports. See the included README and changelog for details.

**Save Skin saves metadata. Save models and painted textures separately through Blockbench.**

When updating, save pending edits, replace the previous plugin file, and reload the local plugin. Existing pack settings and remembered names continue to use the same storage locations.
"""
    (output / f"RELEASE_NOTES-v{version}.md").write_text(notes, encoding="utf-8", newline="\n")
    print(f"Release: {archive.relative_to(ROOT)} ({archive.stat().st_size:,} bytes)")
    print(f"Standalone: {(staging / PLUGIN).relative_to(ROOT)}")
    print(f"Archive files: {', '.join(payload)}")
    print(f"SHA-256: {digest(archive.read_bytes())}")


if __name__ == "__main__":
    release()
