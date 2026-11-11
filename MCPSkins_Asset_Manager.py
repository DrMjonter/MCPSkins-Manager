"""MCPSkins Asset Manager.

Desktop skin registry editor for MCPSkins resource packs.
Place this script in the outer mcpskins directory and run with Python 3.9+.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tkinter as tk
from pathlib import Path
from tkinter import colorchooser, filedialog, messagebox, ttk

try:
    from PIL import Image, ImageTk
except ImportError:
    Image = ImageTk = None


ROOT = Path(__file__).resolve().parent
DEFAULT_PACK_FOLDER = "Example"
DEFAULT_PACK_NAMESPACE = "example"
SETTINGS_FILE = ROOT / "skin_manager_settings.json"
BLOCKBENCH_SETTINGS_FILE = ROOT / "skin_manager_blockbench.json"


def load_settings():
    """Read saved pack selection; use defaults on first run or invalid settings."""
    defaults = (DEFAULT_PACK_FOLDER, DEFAULT_PACK_NAMESPACE)
    if not SETTINGS_FILE.is_file():
        return defaults
    try:
        with SETTINGS_FILE.open("r", encoding="utf-8") as handle:
            settings = json.load(handle)
        folder = settings["pack_folder"]
        namespace = settings["pack_namespace"]
        if (not isinstance(folder, str) or not isinstance(namespace, str)
                or not valid_component(folder) or not valid_component(namespace)):
            raise ValueError("Invalid saved pack folder or namespace")
        return folder, namespace
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"[WARNING] Could not load pack settings: {exc}")
        return defaults


def valid_component(value):
    """Allow one folder component, never absolute paths or path traversal."""
    return (bool(re.fullmatch(r"[a-zA-Z0-9_][a-zA-Z0-9_.-]*", value))
            and value not in (".", "..") and not value.endswith("."))


def save_settings(pack_folder, pack_namespace):
    """Write settings atomically beside the script."""
    tmp = SETTINGS_FILE.with_suffix(".json.tmp")
    try:
        with tmp.open("w", encoding="utf-8") as handle:
            json.dump({"pack_folder": pack_folder, "pack_namespace": pack_namespace}, handle, indent=2)
            handle.write("\n")
        tmp.replace(SETTINGS_FILE)
    finally:
        if tmp.exists():
            tmp.unlink()


def pack_directory(pack_folder):
    return ROOT / pack_folder


def data_directory(pack_folder, pack_namespace):
    return pack_directory(pack_folder) / "data" / pack_namespace / "skins"


def texture_directory(weapon_id, pack_folder):
    """<pack>/assets/mcpskins/textures/skins/<mod namespace>/<weapon name>/"""
    namespace, _, weapon_path = weapon_id.strip().lower().partition(":")
    if not namespace or not weapon_path:
        return None
    gun_id = weapon_path.split("/")[-1]
    if not re.fullmatch(r"[a-z0-9_.-]+", namespace) or not re.fullmatch(r"[a-z0-9_.-]+", gun_id):
        return None
    return pack_directory(pack_folder) / "assets" / "mcpskins" / "textures" / "skins" / namespace / gun_id


def get_blockbench_executable():
    """Use a saved executable path, then the standard per-user installation."""
    if BLOCKBENCH_SETTINGS_FILE.is_file():
        try:
            with BLOCKBENCH_SETTINGS_FILE.open("r", encoding="utf-8") as handle:
                saved = json.load(handle).get("executable")
            if isinstance(saved, str) and Path(saved).is_file():
                return Path(saved)
        except (OSError, ValueError, TypeError, AttributeError):
            pass


    default = Path.home() / "AppData" / "Local" / "Programs" / "Blockbench" / "Blockbench.exe"
    return default if default.is_file() else None


def save_blockbench_executable(path):
    """Remember a user-chosen Blockbench installation for future launches."""
    temp = BLOCKBENCH_SETTINGS_FILE.with_suffix(".json.tmp")
    try:
        with temp.open("w", encoding="utf-8") as handle:
            json.dump({"executable": str(path)}, handle, indent=2)
            handle.write("\n")
        temp.replace(BLOCKBENCH_SETTINGS_FILE)
    finally:
        temp.unlink(missing_ok=True)
def model_for_weapon(folder, gun_id):
    """Locate a native Bedrock geometry JSON, preferring the source _geo file."""
    candidates = [folder / f"{gun_id}_geo.json", folder / f"{gun_id}.geo.json"]
    for path in candidates:
        if path.is_file():
            return path
    for path in sorted(folder.glob("*.json")):

        if path.stem.endswith("_skins") or path.stem.startswith("."):
            continue
        try:
            with path.open("r", encoding="utf-8-sig") as handle:
                data = json.load(handle)
            if isinstance(data, dict) and "minecraft:geometry" in data:
                return path
        except (OSError, json.JSONDecodeError, UnicodeError):
            continue
    return None


def prepare_skin_blockbench_files(folder, gun_id, skin_id):
    """Prepare a skin-specific geometry and albedo texture without editing originals.

    Geometry output has a .geo.json extension so Blockbench recognizes the Bedrock format.
    Existing skin models and textures are always preserved.
    """
    if not re.fullmatch(r"[a-z0-9_]+", skin_id):
        raise ValueError("Skin ID must contain only lowercase letters, digits and underscores.")
    if not skin_id.startswith(gun_id + "_") or skin_id == gun_id + "_":
        raise ValueError("The selected skin ID must start with the weapon ID and an underscore.")
    if not folder.is_dir():
        raise FileNotFoundError(f"Texture folder does not exist:\n{folder}")

    source_model = model_for_weapon(folder, gun_id)
    if source_model is None:
        raise FileNotFoundError(f"No Bedrock geometry JSON found in:\n{folder}")


    model_output = folder / f"{skin_id}.geo.json"
    texture_output = folder / f"{skin_id}.png"
    source_texture = folder / f"{gun_id}.png"


    if not texture_output.is_file() and not source_texture.is_file():
        raise FileNotFoundError(
            f"Missing skin texture: {texture_output.name}\n"
            f"Missing default texture: {source_texture.name}\n"
            f"In folder: {folder}"
        )

    if not model_output.exists():
        if source_model.resolve() == model_output.resolve():
            raise ValueError("Could not distinguish base geometry from the skin geometry.")
        shutil.copy2(source_model, model_output)
    if not texture_output.exists():
        shutil.copy2(source_texture, texture_output)

    return model_output, texture_output


RARITIES = {
    "common": "0xFFFFFF",
    "uncommon": "0x17c40f",
    "rare": "0x3be1ff",
    "epic": "0xb33bff",
    "legendary": "0xE69138",
}

GUN_NAMES = {
    "aa12": "AA-12", "ai_awp": "AWM", "ak47": "AKM", "aug": "AUG",
    "b93r": "B93R", "cz75": "CZ75", "db_long": "DB-4", "db_short": "DB-2",
    "deagle": "Desert Eagle", "deagle_golden": "Desert Eagle",
    "fn_evolys": "FN Evolys", "fn_fal": "FAL", "g36k": "G36K",
    "glock_17": "Glock 17", "hk416d": "HK416", "hk_g3": "G3",
    "hk_mk23": "MK23", "hk_mp5a5": "MP5", "kar98": "Kar98k",
    "lonetrail": "Lonetrail", "m1014": "M1014", "m107": "M107",
    "m16a1": "M16A1", "m16a4": "M16A4", "m1911": "M1911",
    "m249": "M249", "m320": "M320", "m4a1": "M4A1",
    "m700": "M700", "m870": "M870", "m95": "M95", "m9a4": "M9A4",
    "minigun": "M134 Minigun", "mk14": "MK14 EBR", "p320": "P320",
    "p90": "P90", "qbz_191": "QBZ-191", "qbz_95": "QBZ-95",
    "rhino357": "Rhino 357", "rpg7": "RPG-7", "rpk": "RPK",
    "scar_h": "SCAR-H", "scar_l": "SCAR-L", "sks_tactical": "SKS",
    "spas_12": "SPAS-12", "springfield1873": "Springfield 1873",
    "spr15hb": "SPR-15", "taurus500": "Taurus 500",
    "taurus943": "Taurus 943", "timeless50": "Timeless .50",
    "type_81": "Type 81", "ump45": "UMP45", "uzi": "Uzi",
    "vector45": "Vector .45",
}


THEMES = {
    "Modern": {
        "window": "#0F141B", "panel": "#1B232E", "field": "#25303D",
        "heading": "#303D4D", "text": "#E9EEF5", "muted": "#9AA9BB",
        "accent": "#4C91D8", "selected": "#2A5378", "border": "#384757",
    },
    "Frutiger Aero": {

        "window": "#A8D5DF", "panel": "#C2E6E0", "field": "#D8F1E8",
        "heading": "#75BCC8", "text": "#163F4F", "muted": "#386D75",
        "accent": "#238F78", "selected": "#78C2AE", "border": "#68A9B1",
    },
    "Dark": {
        "window": "#090B10", "panel": "#121720", "field": "#1A202B",
        "heading": "#242C39", "text": "#F2F5F9", "muted": "#9BA7B9",
        "accent": "#7B80EF", "selected": "#3B3B70", "border": "#303A4B",
    },
    "Terminal": {

        "window": "#09120D", "panel": "#111E16", "field": "#192D20",
        "heading": "#244331", "text": "#C2F0C5", "muted": "#79AD84",
        "accent": "#37B96D", "selected": "#256A43", "border": "#37634A",
    },
    "Neo": {

        "window": "#DCE7ED", "panel": "#F0F5F7", "field": "#FFFFFF",
        "heading": "#BDD2DF", "text": "#233746", "muted": "#607B8B",
        "accent": "#D95B3C", "selected": "#B5D9EA", "border": "#9DBBCB",
    },
    "Soft": {

        "window": "#E9E7F0", "panel": "#F6F4FA", "field": "#FFFFFF",
        "heading": "#DCD7EA", "text": "#383449", "muted": "#777187",
        "accent": "#8670B8", "selected": "#D1C6E9", "border": "#C9C1D8",
    },
}
THEME = THEMES["Modern"].copy()
THEME_SETTINGS_FILE = ROOT / "skin_manager_theme.json"


def load_theme():
    try:
        with THEME_SETTINGS_FILE.open("r", encoding="utf-8") as stream:
            name = json.load(stream).get("theme", "Modern")
            return name if name in THEMES else "Modern"
    except (OSError, ValueError, AttributeError):
        return "Modern"


def save_theme(name):
    """Persist the theme separately from pack folder and namespace settings."""
    temp = THEME_SETTINGS_FILE.with_suffix(".json.tmp")
    try:
        with temp.open("w", encoding="utf-8") as stream:
            json.dump({"theme": name}, stream, indent=2)
            stream.write("\n")
        temp.replace(THEME_SETTINGS_FILE)
    finally:
        temp.unlink(missing_ok=True)


def set_theme_color(widget, *, bg=None, fg=None):
    """Configure traditional Tk widgets using the central theme palette."""
    widget.configure(bg=bg or THEME["field"], fg=fg or THEME["text"])


def slugify(value):
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def display_gun(weapon_id):
    name = weapon_id.split(":", 1)[-1].split("/")[-1]
    return GUN_NAMES.get(name, name.replace("_", " ").upper())


def weapon_filename(weapon_id, skins_directory):
    name = weapon_id.split(":", 1)[-1].split("/")[-1]
    return skins_directory / f"{name}_skins.json"


def load_json(path):
    try:
        with path.open("r", encoding="utf-8-sig") as stream:
            data = json.load(stream)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Unable to read {path.name}: {exc}") from exc
    if (not isinstance(data, dict) or not isinstance(data.get("skins"), list)
            or not ("base_gun" in data or "base_melee" in data)):
        raise ValueError(f"Invalid {path.name}: expected base_gun/base_melee and a skins list")
    return data


def save_json(path, data):
    temp = path.with_name(path.name + ".tmp")
    try:
        with temp.open("w", encoding="utf-8") as stream:
            json.dump(data, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
        temp.replace(path)
    finally:
        if temp.exists():
            temp.unlink()


class SkinManager(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("MCPSkins Asset Manager")
        self.geometry("1500x850")
        self.minsize(850, 520)
        self.theme_name = tk.StringVar(value=load_theme())
        THEME.update(THEMES[self.theme_name.get()])
        self.configure(bg=THEME["window"])
        self.rows = []
        folder, namespace = load_settings()
        self.applied_pack_folder = folder
        self.applied_pack_namespace = namespace
        self.pack_folder = tk.StringVar(value=folder)
        self.pack_namespace = tk.StringVar(value=namespace)
        self.skins_directory = data_directory(folder, namespace)
        self.current = None
        self.loading = False
        self.dirty = False

        self._preview_cache = {
            key: {"source": None, "original": None, "photo": None}
            for key in ("skin", "hud", "icon")
        }
        self._preview_after = None
        self.search = tk.StringVar()
        self.filter_rarity = tk.StringVar(value="All rarities")
        self.sort_column = "gun"
        self.sort_descending = False
        self.weapon = tk.StringVar()
        self.weapon_kind = tk.StringVar(value="gun")
        self.label = tk.StringVar()
        self.skin_id = tk.StringVar()
        self.rarity = tk.StringVar(value="common")
        self.hex_color = tk.StringVar(value="#FFFFFF")
        self.collection = tk.StringVar()
        self.is_new = tk.BooleanVar(value=True)
        self.locked_text = tk.StringVar()
        self.unlocked = tk.BooleanVar(value=False)
        self.include_weight = tk.BooleanVar(value=False)
        self.weight = tk.StringVar(value="1")
        self.summary = tk.StringVar()
        self.mode = tk.StringVar(value="Select a skin or click New Skin")
        self._configure_style()
        self._build_ui()
        self.reload()
        self.protocol("WM_DELETE_WINDOW", self.on_close)

    def _configure_style(self):
        colors = THEME
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TFrame", background=colors["window"])
        style.configure("Panel.TFrame", background=colors["panel"])
        style.configure("TLabel", background=colors["window"], foreground=colors["text"], font=("Segoe UI", 10))
        style.configure("Panel.TLabel", background=colors["panel"], foreground=colors["text"], font=("Segoe UI", 10))
        style.configure("Title.TLabel", font=("Segoe UI Semibold", 18), foreground=colors["text"])
        style.configure("Sub.TLabel", foreground=colors["muted"], font=("Segoe UI", 9))
        style.configure("PanelSub.TLabel", background=colors["panel"], foreground=colors["muted"], font=("Segoe UI", 9))
        style.configure("TEntry", fieldbackground=colors["field"], foreground=colors["text"],
                        insertcolor=colors["text"], bordercolor=colors["border"], padding=6)
        style.map("TEntry", fieldbackground=[("readonly", colors["heading"])],
                  foreground=[("readonly", colors["muted"])])
        style.configure("TCombobox", fieldbackground=colors["field"], background=colors["field"],
                        foreground=colors["text"], arrowcolor=colors["text"], padding=5)
        style.map("TCombobox", fieldbackground=[("readonly", colors["field"])],
                  foreground=[("readonly", colors["text"])])
        style.configure("TButton", background=colors["heading"], foreground=colors["text"],
                        padding=(12, 8), font=("Segoe UI", 10), borderwidth=0)
        style.map("TButton", background=[("active", colors["accent"])])
        style.configure("Accent.TButton", background=colors["accent"], foreground="#FFFFFF")
        style.map("Accent.TButton", background=[("active", colors["selected"])])
        style.configure("TCheckbutton", background=colors["panel"], foreground=colors["text"])
        style.configure("TRadiobutton", background=colors["panel"], foreground=colors["text"])
        style.configure("Treeview", background=colors["panel"], foreground=colors["text"],
                        fieldbackground=colors["panel"], rowheight=30, borderwidth=0,
                        font=("Segoe UI", 9))
        style.configure("Treeview.Heading", background=colors["heading"], foreground=colors["text"],
                        font=("Segoe UI Semibold", 9), padding=(7, 9), borderwidth=0)

        selected_rgb = [int(colors["selected"][i:i+2], 16) for i in (1, 3, 5)]
        selected_brightness = sum(a*b for a, b in zip(selected_rgb, (0.2126, 0.7152, 0.0722)))
        selected_text = "#173342" if selected_brightness >= 135 else "#FFFFFF"
        style.map("Treeview", background=[("selected", colors["selected"])],
                  foreground=[("selected", selected_text)])
        style.map("Treeview.Heading", background=[("active", colors["field"])])
        style.configure("TPanedwindow", background=colors["window"])
        style.configure("Sash", sashthickness=7, background=colors["border"])
        style.configure("TScrollbar", background=colors["heading"], troughcolor=colors["panel"],
                        arrowcolor=colors["text"])
        self.option_add("*TCombobox*Listbox.background", colors["field"])
        self.option_add("*TCombobox*Listbox.foreground", colors["text"])
        self.option_add("*TCombobox*Listbox.selectBackground", colors["selected"])

    def _build_ui(self):
        self.main_frame = main = ttk.Frame(self, padding=16)
        main.pack(fill="both", expand=True)

        header = ttk.Frame(main)
        header.pack(fill="x", pady=(0, 12))
        ttk.Label(header, text="MCPSkins Asset Manager", style="Title.TLabel").pack(anchor="w")
        ttk.Label(header, text="Made by Mjonter", style="Sub.TLabel").pack(anchor="w", pady=(2, 0))
        namespace_row = ttk.Frame(header)
        namespace_row.pack(fill="x", pady=(7, 0))
        ttk.Label(namespace_row, text="Pack Folder", style="TLabel").pack(side="left", padx=(0, 8))
        self.folder_entry = ttk.Entry(namespace_row, textvariable=self.pack_folder, width=22)
        self.folder_entry.pack(side="left", padx=(0, 18))
        self.folder_entry.bind("<Return>", lambda _event: self.apply_pack_settings())
        ttk.Label(namespace_row, text="Pack Namespace", style="TLabel").pack(side="left", padx=(0, 8))
        self.namespace_entry = ttk.Entry(namespace_row, textvariable=self.pack_namespace, width=22)
        self.namespace_entry.pack(side="left")
        self.namespace_entry.bind("<Return>", lambda _event: self.apply_pack_settings())
        ttk.Button(namespace_row, text="Apply", command=self.apply_pack_settings).pack(side="left", padx=(8, 0))
        self.json_directory_label = ttk.Label(header, style="Sub.TLabel")
        self.json_directory_label.pack(anchor="w", pady=(4, 0))
        self.update_json_directory_label()


        self.body = ttk.Panedwindow(main, orient="horizontal")
        self.body.pack(fill="both", expand=True)
        left = ttk.Frame(self.body, style="Panel.TFrame", padding=12)
        right = ttk.Frame(self.body, style="Panel.TFrame", padding=12)
        self.body.add(left, weight=1)
        self.body.add(right, weight=1)


        self.after(150, self._set_initial_pane_split)


        theme_footer = ttk.Frame(main)
        theme_footer.pack(fill="x", pady=(9, 0))
        ttk.Label(theme_footer, text="Theme", style="Sub.TLabel").pack(side="left", padx=(0, 8))
        self.theme_selector = ttk.Combobox(
            theme_footer, textvariable=self.theme_name, state="readonly",
            width=17, values=list(THEMES)
        )
        self.theme_selector.pack(side="left")
        self.theme_selector.bind("<<ComboboxSelected>>", self.change_theme)

        filters = ttk.Frame(left, style="Panel.TFrame")
        filters.pack(fill="x", pady=(0, 10))
        ttk.Entry(filters, textvariable=self.search).pack(side="left", fill="x", expand=True)
        ttk.Combobox(filters, textvariable=self.filter_rarity, state="readonly", width=14,
                     values=["All rarities"] + list(RARITIES)).pack(side="left", padx=(8, 0))
        self.search.trace_add("write", lambda *_: self.refresh_table())
        self.filter_rarity.trace_add("write", lambda *_: self.refresh_table())

        tablebox = ttk.Frame(left, style="Panel.TFrame")
        tablebox.pack(fill="both", expand=True)
        columns = ("gun", "name", "rarity", "collection", "file")
        self.table = ttk.Treeview(tablebox, columns=columns, show="headings", selectmode="browse")
        self.headings = {"gun": "Gun", "name": "Skin", "rarity": "Rarity",
                         "collection": "Collection", "file": "File"}
        for col, width in [("gun", 205), ("name", 180), ("rarity", 118),
                           ("collection", 105), ("file", 190)]:
            self.table.heading(col, text=self.headings[col], command=lambda key=col: self.sort_by(key))
            self.table.column(col, width=width, minwidth=70, stretch=(col == "file"))
        self.update_sort_headings()
        vscroll = ttk.Scrollbar(tablebox, orient="vertical", command=self.table.yview)
        hscroll = ttk.Scrollbar(tablebox, orient="horizontal", command=self.table.xview)
        self.table.configure(yscrollcommand=vscroll.set, xscrollcommand=hscroll.set)
        tablebox.columnconfigure(0, weight=1)
        tablebox.rowconfigure(0, weight=1)
        self.table.grid(row=0, column=0, sticky="nsew")
        vscroll.grid(row=0, column=1, sticky="ns")
        hscroll.grid(row=1, column=0, sticky="ew")
        self.table.bind("<<TreeviewSelect>>", self.on_select)

        self.entry_menu = tk.Menu(self, tearoff=0)
        self.entry_menu.add_command(label="Open File", command=self.open_context_file)
        self._context_row = None
        self.table.bind("<Button-3>", self.show_entry_menu)

        ttk.Label(left, text="Click headings to sort · Drag divider to resize panels",
                  style="PanelSub.TLabel").pack(anchor="w", pady=(7, 0))
        foot = ttk.Frame(left, style="Panel.TFrame")
        foot.pack(fill="x", pady=(10, 0))
        ttk.Label(foot, textvariable=self.summary, style="PanelSub.TLabel").pack(side="left")
        ttk.Button(foot, text="Refresh Files", command=self.reload).pack(side="right")
        ttk.Button(foot, text="New Skin", style="Accent.TButton", command=self.new_skin).pack(
            side="right", padx=(0, 8))


        titlearea = ttk.Frame(right, style="Panel.TFrame")
        titlearea.pack(fill="x")
        ttk.Label(titlearea, text="Asset Inspector", style="Panel.TLabel",
                  font=("Segoe UI Semibold", 16)).pack(anchor="w")
        ttk.Label(titlearea, textvariable=self.mode, style="PanelSub.TLabel").pack(anchor="w", pady=(3, 8))

        editor_area = ttk.Frame(right, style="Panel.TFrame")
        editor_area.pack(fill="both", expand=True)
        self.editor_canvas = tk.Canvas(editor_area, bg=THEME["panel"], highlightthickness=0,
                                       borderwidth=0)
        editor_scroll = ttk.Scrollbar(editor_area, orient="vertical", command=self.editor_canvas.yview)
        self.editor_canvas.configure(yscrollcommand=editor_scroll.set)
        self.editor_canvas.pack(side="left", fill="both", expand=True)
        editor_scroll.pack(side="right", fill="y")
        fields = ttk.Frame(self.editor_canvas, style="Panel.TFrame")
        self.editor_window = self.editor_canvas.create_window((0, 0), window=fields, anchor="nw")
        fields.bind("<Configure>", lambda _e: self.editor_canvas.configure(
            scrollregion=self.editor_canvas.bbox("all")))
        self.editor_canvas.bind("<Configure>", lambda e: self.editor_canvas.itemconfigure(
            self.editor_window, width=e.width))


        inspector_top = ttk.Frame(fields, style="Panel.TFrame")
        inspector_top.pack(fill="x", expand=True)
        inspector_top.columnconfigure(0, weight=1, minsize=230)
        inspector_top.columnconfigure(1, weight=0)

        form = ttk.Frame(inspector_top, style="Panel.TFrame")
        form.grid(row=0, column=0, sticky="new")

        preview_box = ttk.Frame(inspector_top, style="Panel.TFrame")
        preview_box.grid(row=0, column=1, sticky="ne", padx=(18, 0), pady=(4, 0))

        def field(label, variable, readonly=False):
            ttk.Label(form, text=label, style="Panel.TLabel").pack(anchor="w", pady=(9, 4))
            entry = ttk.Entry(form, textvariable=variable,
                              state="readonly" if readonly else "normal")
            entry.pack(fill="x")
            return entry

        self.weapon_entry = field("Weapon ID (e.g. tacz:ai_awp)", self.weapon)
        ttk.Label(form, text="Weapon type (new files only)", style="Panel.TLabel").pack(anchor="w", pady=(9, 4))
        kindrow = ttk.Frame(form, style="Panel.TFrame")
        kindrow.pack(fill="x")
        ttk.Radiobutton(kindrow, text="Gun", value="gun", variable=self.weapon_kind).pack(side="left")
        ttk.Radiobutton(kindrow, text="Melee", value="melee", variable=self.weapon_kind).pack(side="left", padx=(18, 0))

        self.skin_name_heading = ttk.Label(form, text="Skin Name: (...)", style="Panel.TLabel")
        self.skin_name_heading.pack(anchor="w", pady=(9, 4))
        self.skin_name_entry = ttk.Entry(form, textvariable=self.label)
        self.skin_name_entry.pack(fill="x")
        field("Skin ID (leave empty to generate new skin)", self.skin_id)

        ttk.Label(form, text="Rarity", style="Panel.TLabel").pack(anchor="w", pady=(9, 4))
        self.rarity_combo = ttk.Combobox(form, textvariable=self.rarity,
                                         state="readonly", values=list(RARITIES))
        self.rarity_combo.pack(fill="x")

        raritycolor = ttk.Frame(form, style="Panel.TFrame")
        raritycolor.pack(fill="x", pady=(7, 0))
        self.color_preview = tk.Button(
            raritycolor, text="", width=3, relief="flat", cursor="hand2",
            command=self.pick_color, font=("Segoe UI", 9), bd=0
        )
        self.color_preview.pack(side="left", padx=(0, 6), ipady=5)
        self.hex_entry = ttk.Entry(raritycolor, textvariable=self.hex_color, width=9,
                                   font=("Consolas", 10))
        self.hex_entry.pack(side="left", padx=(0, 6))
        ttk.Button(raritycolor, text="Reset to Default", command=self.reset_color).pack(side="left")
        self.rarity.trace_add("write", lambda *_: self.reset_color())
        self.hex_color.trace_add("write", lambda *_: self.refresh_color_preview())

        field("Collection", self.collection)
        ttk.Label(form, text="Description", style="Panel.TLabel").pack(anchor="w", pady=(9, 4))
        self.description = tk.Text(form, height=3, bg=THEME["field"], fg=THEME["text"],
                                   insertbackground=THEME["text"], relief="flat", padx=8, pady=7,
                                   wrap="word", font=("Segoe UI", 10))
        self.description.pack(fill="x")
        ttk.Checkbutton(form, text="Mark as new", variable=self.is_new).pack(anchor="w", pady=(10, 8))


        ttk.Label(form, text="Locked text (optional)", style="Panel.TLabel").pack(
            anchor="w", pady=(9, 4))
        ttk.Entry(form, textvariable=self.locked_text).pack(fill="x")

        ttk.Checkbutton(form, text="Unlocked", variable=self.unlocked).pack(
            anchor="w", pady=(12, 3))

        weight_row = ttk.Frame(form, style="Panel.TFrame")
        weight_row.pack(fill="x", pady=(8, 10))
        ttk.Checkbutton(weight_row, text="Include fusion weight",
                        variable=self.include_weight,
                        command=self.update_optional_controls).pack(side="left")
        self.weight_control = ttk.Entry(weight_row, textvariable=self.weight, width=7)
        self.weight_control.pack(side="left", padx=(10, 0))
        ttk.Label(weight_row, text="Positive integer, default 1",
                  style="PanelSub.TLabel").pack(side="left", padx=(8, 0))
        self.update_optional_controls()


        preview_buttons = ttk.Frame(preview_box, style="Panel.TFrame")
        preview_buttons.pack(fill="x", pady=(0, 10))
        self.open_blockbench_button = ttk.Button(
            preview_buttons, text="Open in Blockbench", command=self.open_blockbench
        )
        self.open_blockbench_button.pack(side="left", fill="x", expand=True, padx=(0, 4))
        self.open_folder_button = ttk.Button(
            preview_buttons, text="Open Folder", command=self.open_texture_folder
        )
        self.open_folder_button.pack(side="left", fill="x", expand=True)

        self.preview_canvases = {}
        self.preview_statuses = {}
        for kind, caption in (("skin", None), ("hud", "HUD"), ("icon", "Icon")):
            if caption:
                ttk.Label(preview_box, text=caption, style="Panel.TLabel").pack(
                    anchor="w", pady=(12, 4)
                )
            preview_width, preview_height = (255, 85) if kind == "hud" else (256, 256)
            canvas = tk.Canvas(
                preview_box, bg=THEME["field"], highlightthickness=0,
                borderwidth=0, width=preview_width, height=preview_height
            )
            canvas.pack(anchor="center")
            status = tk.Label(
                preview_box, text="", bg=THEME["panel"], fg=THEME["muted"],
                anchor="center", justify="center", wraplength=256,
                font=("Segoe UI", 9)
            )
            status.pack(fill="x", pady=(5, 7))
            self.preview_canvases[kind] = canvas
            self.preview_statuses[kind] = status
            canvas.bind("<Configure>", lambda _e: self.schedule_preview())


        controls = ttk.Frame(right, style="Panel.TFrame")
        controls.pack(fill="x", pady=(10, 0))
        ttk.Button(controls, text="Save Skin", style="Accent.TButton", command=self.save).pack(side="left")
        ttk.Button(controls, text="Discard Changes", command=self.revert).pack(side="left", padx=(8, 0))
        ttk.Label(right, text="Only saved changes are written to JSON.",
                  style="PanelSub.TLabel").pack(anchor="w", pady=(8, 0))
        self.reset_color()
        for variable in (self.weapon, self.weapon_kind, self.label, self.skin_id,
                         self.rarity, self.hex_color, self.collection, self.is_new,
                         self.locked_text, self.unlocked,
                         self.include_weight, self.weight):
            variable.trace_add("write", self.flag_dirty)
        self.description.bind("<<Modified>>", self.on_description_modified)
        for variable in (self.weapon, self.skin_id, self.label):
            variable.trace_add("write", lambda *_: self.schedule_preview())

        self.weapon.trace_add("write", lambda *_: self.update_skin_name_heading())
        self.label.trace_add("write", lambda *_: self.update_skin_name_heading())
        self.update_skin_name_heading()
        self.schedule_preview()

    def update_skin_name_heading(self):
        """Live preview of the final display title without changing the saved ID."""
        weapon_id = self.weapon.get().strip()
        skin_name = self.label.get().strip()
        if weapon_id:
            display_name = display_gun(weapon_id)
            title = f"{display_name} | {skin_name or '...'}"
        else:
            title = skin_name or "..."
        self.skin_name_heading.configure(text=f"Skin Name: ({title})")

    def change_theme(self, _event=None):
        """Apply a theme immediately, retaining selection and unsaved edits."""
        name = self.theme_name.get()
        if name not in THEMES:
            return
        old = dict(THEME)
        THEME.update(THEMES[name])
        self.configure(bg=THEME["window"])
        self._configure_style()


        bg_keys = ("window", "panel", "field", "heading", "border")
        fg_keys = ("text", "muted")

        def recolor(widget):
            if widget is not self.color_preview:
                config = widget.configure()
                updates = {}
                for option, keys in (("bg", bg_keys), ("fg", fg_keys),
                                     ("insertbackground", ("text",))):
                    if option not in config:
                        continue
                    old_value = widget.cget(option)
                    for key in keys:
                        if str(old_value).lower() == old[key].lower():
                            updates[option] = THEME[key]
                            break
                if updates:
                    widget.configure(**updates)
            for child in widget.winfo_children():
                recolor(child)

        recolor(self)
        self.refresh_color_preview()
        self.schedule_preview()
        try:
            save_theme(name)
        except OSError as exc:
            messagebox.showwarning("Theme not saved", str(exc))

    def update_json_directory_label(self):
        self.json_directory_label.configure(text=f"JSON directory: {self.skins_directory}")

    def apply_pack_settings(self):
        folder = self.pack_folder.get().strip()
        namespace = self.pack_namespace.get().strip().lower()
        if not valid_component(folder):
            messagebox.showerror("Invalid pack folder", "Use a single folder name (letters, digits, underscores, hyphens, or dots).")
            return
        if not valid_component(namespace):
            messagebox.showerror("Invalid namespace", "Use a single namespace (letters, digits, underscores, hyphens, or dots).")
            return
        new_directory = data_directory(folder, namespace)
        switching = new_directory != self.skins_directory
        if switching and not self.confirm_discard():
            return
        try:
            save_settings(folder, namespace)
        except OSError as exc:
            messagebox.showerror("Settings not saved", f"Could not save settings to {SETTINGS_FILE}:\n{exc}")
            return
        self.applied_pack_folder = folder
        self.applied_pack_namespace = namespace
        self.pack_folder.set(folder)
        self.pack_namespace.set(namespace)
        self.skins_directory = new_directory
        self.update_json_directory_label()
        if switching:
            self.dirty = False
            self.reload()
        else:
            self.schedule_preview()

    def schedule_preview(self):
        """Update after typing or resizing settles; keep the UI responsive."""
        if self._preview_after is not None:
            self.after_cancel(self._preview_after)
        self._preview_after = self.after(160, self.update_preview)

    def _set_initial_pane_split(self):
        """Start at a near-even split, without overriding user sash movements."""
        if not self.body.winfo_exists():
            return
        width = self.body.winfo_width()
        if width > 100:
            try:
                self.body.sashpos(0, round(width * 0.52))
            except tk.TclError:
                pass

    def _preview_message(self, kind, message):
        """Render a centered fallback message for one of the three atlases."""
        canvas = self.preview_canvases[kind]
        canvas.delete("all")
        width = max(1, canvas.winfo_width())
        canvas.create_text(
            width // 2, max(1, canvas.winfo_height()) // 2,
            text=message, fill=THEME["muted"],
            width=max(100, width - 32), justify="center",
            font=("Segoe UI", 10), tags="preview"
        )

    def _show_texture_preview(self, kind, image_path, unset=False):
        """Show each PNG within its dedicated square or 3:1 preview viewport."""
        canvas = self.preview_canvases[kind]
        status = self.preview_statuses[kind]
        cache = self._preview_cache[kind]
        if unset or not image_path.is_file():
            cache.update(source=None, original=None, photo=None)
            self._preview_message(
                kind, "Select a skin" if unset else f"No {kind} texture found"
            )
            status.configure(text="" if unset else image_path.name)
            return

        if cache["source"] != image_path:
            try:
                if Image is not None:
                    with Image.open(image_path) as im:
                        cache["original"] = im.convert("RGBA")
                else:
                    cache["original"] = tk.PhotoImage(file=str(image_path))
                cache["source"] = image_path
            except (OSError, tk.TclError, ValueError) as exc:
                cache.update(source=None, original=None, photo=None)
                self._preview_message(kind, "Couldn't open image")
                status.configure(text=str(exc))
                return

        original = cache["original"]
        available_width = max(1, canvas.winfo_width() - 12)
        available_height = max(1, canvas.winfo_height() - 12)
        if Image is not None:
            width, height = original.size


            scale = min(1.0, available_width / width, available_height / height)
            target_size = (max(1, round(width * scale)), max(1, round(height * scale)))
            rendered = (original.resize(target_size, Image.Resampling.NEAREST)
                        if target_size != original.size else original)
            cache["photo"] = ImageTk.PhotoImage(rendered, master=self)
        else:
            width, height = original.width(), original.height()
            factor = max(1, int(__import__("math").ceil(max(width / available_width, height / available_height))))
            cache["photo"] = original.subsample(int(factor))

        canvas.delete("all")
        canvas.create_image(canvas.winfo_width() // 2, canvas.winfo_height() // 2,
                            image=cache["photo"], anchor="center", tags="preview")
        status.configure(text=f"{image_path.name}  |  {width} x {height} px")

    def update_preview(self):
        self._preview_after = None
        weapon_id = self.weapon.get().strip().lower()
        folder = texture_directory(weapon_id, self.applied_pack_folder)
        gun_id = weapon_id.split(":", 1)[-1].split("/")[-1]
        skin_id = self.skin_id.get().strip().lower()
        if not skin_id and gun_id and self.label.get().strip():
            skin_id = f"{gun_id}_{slugify(self.label.get().strip())}"

        unset = folder is None or not skin_id
        for kind, suffix in (("skin", ""), ("hud", "_hud"), ("icon", "_icon")):
            path = folder / f"{skin_id}{suffix}.png" if not unset else None
            self._show_texture_preview(kind, path, unset=unset)

    def open_texture_folder(self):
        """Open the currently selected weapon's texture folder in the OS file manager."""
        weapon_id = self.weapon.get().strip().lower()
        folder = texture_directory(weapon_id, self.applied_pack_folder)
        if folder is None:
            messagebox.showinfo("Select a weapon", "Select a skin or enter a valid namespaced weapon ID first.")
            return
        if not folder.is_dir():
            messagebox.showwarning("Folder not found", f"No texture folder exists yet:\n{folder}")
            return
        try:
            if sys.platform == "win32":
                os.startfile(str(folder))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(folder)])
            else:
                subprocess.Popen(["xdg-open", str(folder)])
        except (OSError, RuntimeError) as exc:
            messagebox.showerror("Could not open folder", str(exc))

    def open_blockbench(self):
        """Prepare the selected skin model/texture and open the model in Blockbench."""
        weapon_id = self.weapon.get().strip().lower()
        folder = texture_directory(weapon_id, self.applied_pack_folder)
        if folder is None:
            messagebox.showinfo("Select a weapon", "Select a skin or enter a namespaced weapon ID first.", parent=self)
            return
        gun_id = weapon_id.split(":", 1)[-1].split("/")[-1]
        skin_id = self.skin_id.get().strip().lower()
        if not skin_id and self.label.get().strip():
            skin_id = f"{gun_id}_{slugify(self.label.get().strip())}"
        if not skin_id:
            messagebox.showwarning("No skin selected", "Select a skin, or enter a skin name first.", parent=self)
            return

        executable = get_blockbench_executable()
        if executable is None:
            messagebox.showinfo(
                "Locate Blockbench",
                "Blockbench was not found at its default installation path.\n"
                "Please select Blockbench.exe to continue.",
                parent=self,
            )
            selected = filedialog.askopenfilename(
                parent=self, title="Select Blockbench.exe",
                initialdir=str(Path.home() / "AppData" / "Local" / "Programs"),
                filetypes=[("Blockbench executable", "Blockbench.exe"), ("Executables", "*.exe")],
            )
            if not selected:
                return
            executable = Path(selected)
            if not executable.is_file() or executable.suffix.lower() != ".exe":
                messagebox.showerror("Invalid executable", "Please select a valid .exe file.", parent=self)
                return
            try:
                save_blockbench_executable(executable)
            except OSError as exc:
                messagebox.showwarning("Could not save Blockbench location", str(exc), parent=self)


        existing_models = (
            folder / f"{skin_id}.json",
            folder / f"{skin_id}.geo.json",
        )
        existing_model = next((p for p in existing_models if p.is_file()), None)
        if existing_model:
            model_file = existing_model
        else:
            try:
                model_file, _texture_file = prepare_skin_blockbench_files(folder, gun_id, skin_id)
            except (OSError, ValueError) as exc:
                messagebox.showerror("Could not prepare skin", str(exc), parent=self)
                return


        try:
            subprocess.Popen([str(executable), str(model_file)], cwd=str(executable.parent))
        except OSError as exc:
            messagebox.showerror("Could not launch Blockbench", str(exc), parent=self)
            return

        self.schedule_preview()

    def flag_dirty(self, *_):
        if not self.loading:
            self.dirty = True

    def update_optional_controls(self):
        """Keep optional values visible but inactive unless included in the JSON."""
        self.weight_control.configure(
            state="normal" if self.include_weight.get() else "disabled")

    def on_description_modified(self, _event):
        if self.description.edit_modified():
            if not self.loading:
                self.dirty = True
            self.description.edit_modified(False)

    def reset_color(self):
        """Restore the default LabPBR label color for the current rarity."""
        color = RARITIES.get(self.rarity.get().lower(), "0xFFFFFF")
        self.hex_color.set("#" + color[2:].upper())

    def refresh_color_preview(self):
        """Show a swatch for a valid #RRGGBB value, without changing its text."""
        color = self.hex_color.get().strip()
        if re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            self.color_preview.configure(bg=color, text="", activebackground=color)
        else:
            self.color_preview.configure(bg=THEME["heading"], fg=THEME["text"],
                                         text="", activebackground=THEME["heading"])

    def pick_color(self):
        """Open the system color picker; apply only after confirmation."""
        current = self.hex_color.get().strip()
        initial = current if re.fullmatch(r"#[0-9a-fA-F]{6}", current) else "#FFFFFF"
        _rgb, chosen = colorchooser.askcolor(color=initial, title="Choose skin label color", parent=self)
        if chosen:
            self.hex_color.set(chosen.upper())

    def confirm_discard(self):
        if self.dirty:
            return messagebox.askyesno("Discard unsaved changes?", "You have unsaved edits. Discard them?")
        return True

    def reload(self):
        if not self.confirm_discard():
            return
        self.rows = []
        warnings = []
        for path in sorted(self.skins_directory.glob("*_skins.json"), key=lambda p: p.name.lower()):
            try:
                data = load_json(path)
                for index, skin in enumerate(data["skins"]):
                    if isinstance(skin, dict):
                        self.rows.append((path, data, index, skin))
            except ValueError as exc:
                warnings.append(str(exc))
        self.current = None
        self.clear_editor()
        self.refresh_table()
        if warnings:
            messagebox.showwarning("Some files were skipped", "\n".join(warnings[:10]))

    def sort_by(self, column):
        """Sort the browser by the selected column; second click reverses it."""
        if self.sort_column == column:
            self.sort_descending = not self.sort_descending
        else:
            self.sort_column = column
            self.sort_descending = False
        self.update_sort_headings()
        self.refresh_table()

    def update_sort_headings(self):
        for column, title in self.headings.items():
            arrow = (" ▼" if self.sort_descending else " ▲") if column == self.sort_column else ""
            self.table.heading(column, text=title + arrow)

    def gun_for_row(self, data):
        base = str(data.get("base_gun", data.get("base_melee", "")))
        return display_gun(base)

    def refresh_table(self):


        selected = self.table.selection()
        self.table.delete(*self.table.get_children())
        term = self.search.get().strip().lower()
        rarity = self.filter_rarity.get()
        filtered = []
        for index, (path, data, _i, skin) in enumerate(self.rows):
            gun = self.gun_for_row(data)
            searchable = " ".join(str(skin.get(k, "")) for k in
                                  ("name", "id", "collection", "description")) + " " + path.name + " " + gun
            if term and term not in searchable.lower():
                continue
            if rarity != "All rarities" and str(skin.get("rarity", "")).lower() != rarity:
                continue
            filtered.append((index, path, data, skin, gun))

        def sort_key(item):
            _index, path, _data, skin, gun = item
            values = {
                "gun": gun,
                "name": skin.get("name", ""),
                "rarity": skin.get("rarity", ""),
                "collection": skin.get("collection", ""),
                "file": path.name,
            }
            primary = str(values[self.sort_column]).casefold()
            return (primary, gun.casefold(), str(skin.get("name", "")).casefold())

        filtered.sort(key=sort_key, reverse=self.sort_descending)
        for index, path, data, skin, gun in filtered:
            self.table.insert("", "end", iid=str(index), values=(
                gun, skin.get("name", ""), skin.get("rarity", ""),
                skin.get("collection", ""), path.name))
        if selected and self.table.exists(selected[0]):
            self.table.selection_set(selected[0])
        self.summary.set(f"{len(filtered)} of {len(self.rows)} skins · {len({r[0] for r in self.rows})} files")

    def show_entry_menu(self, event):
        """Show the file context menu for the row under the mouse pointer."""
        iid = self.table.identify_row(event.y)
        if not iid:
            return
        try:
            row_index = int(iid)
        except ValueError:
            return
        if not (0 <= row_index < len(self.rows)):
            return

        self._context_row = row_index
        try:
            self.entry_menu.tk_popup(event.x_root, event.y_root)
        finally:
            self.entry_menu.grab_release()

    def open_context_file(self):
        """Open the clicked skin's source JSON with the OS default application."""
        row_index = self._context_row
        self._context_row = None
        if row_index is None or not (0 <= row_index < len(self.rows)):
            return
        path = self.rows[row_index][0]
        if not path.is_file():
            messagebox.showwarning("File not found", f"The JSON file no longer exists:\n{path}")
            return
        try:
            if sys.platform == "win32":
                os.startfile(str(path))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(path)])
            else:
                subprocess.Popen(["xdg-open", str(path)])
        except (OSError, RuntimeError) as exc:
            messagebox.showerror("Could not open file", f"Could not open {path.name}:\n{exc}")

    def clear_editor(self):
        self.loading = True
        for v in (self.weapon, self.label, self.skin_id, self.collection):
            v.set("")
        self.weapon_kind.set("gun")
        self.rarity.set("common")
        self.reset_color()
        self.is_new.set(True)
        self.locked_text.set("")
        self.unlocked.set(False)
        self.include_weight.set(False)
        self.weight.set("1")
        self.update_optional_controls()
        self.description.delete("1.0", "end")
        self.description.edit_modified(False)
        self.mode.set("Select a skin or click New Skin")
        self.weapon_entry.configure(state="normal")
        self.loading = False
        self.dirty = False
        self.schedule_preview()

    def on_select(self, _event=None):
        selection = self.table.selection()
        if not selection:
            return
        row = int(selection[0])
        if self.current == row:
            return
        if not self.confirm_discard():
            if self.current is not None and self.table.exists(str(self.current)):
                self.table.selection_set(str(self.current))
            else:
                self.table.selection_remove(*selection)
            return
        self.current = row
        path, data, _idx, skin = self.rows[row]
        self.loading = True
        base_key = "base_melee" if "base_melee" in data else "base_gun"
        weapon_id = data[base_key]
        self.weapon.set(weapon_id)
        self.weapon_kind.set("melee" if base_key == "base_melee" else "gun")
        self.weapon_entry.configure(state="readonly")
        displayed = str(skin.get("name", ""))
        self.label.set(displayed.split(" | ", 1)[1] if " | " in displayed else displayed)
        self.skin_id.set(str(skin.get("id", "")))
        self.rarity.set(str(skin.get("rarity", "common")).lower())
        original_color = str(skin.get("label_color", RARITIES.get(self.rarity.get(), "0xFFFFFF"))).strip()
        if re.fullmatch(r"(?:0[xX]|#)[0-9a-fA-F]{6}", original_color):
            self.hex_color.set("#" + original_color[-6:].upper())
        else:
            self.reset_color()
        self.collection.set(str(skin.get("collection", "")))
        self.is_new.set(bool(skin.get("is_new", False)))
        self.locked_text.set(str(skin.get("locked_text", "")))
        self.unlocked.set(bool(skin.get("unlocked", False)))
        self.include_weight.set("weight" in skin)
        self.weight.set(str(skin.get("weight", 1)))
        self.update_optional_controls()
        self.description.delete("1.0", "end")
        self.description.insert("1.0", str(skin.get("description", "")))
        self.description.edit_modified(False)
        self.mode.set(f"Editing {skin.get('id', '?')} · {path.name}")
        self.loading = False
        self.dirty = False
        self.schedule_preview()

    def new_skin(self):
        if not self.confirm_discard():
            return
        self.table.selection_remove(*self.table.selection())
        self.current = None
        self.clear_editor()
        self.weapon_entry.configure(state="normal")
        self.mode.set("New skin · enter a namespaced weapon ID")
        self.weapon_entry.focus_set()

    def revert(self):

        if self.current is None:
            self.clear_editor()
            self.weapon_entry.configure(state="normal")
            self.mode.set("New skin · enter a namespaced weapon ID")
        else:
            row = self.current
            self.loading = True
            self.dirty = False
            self.current = None
            self.table.selection_set(str(row))
            self.loading = False
            self.on_select()

    def save(self):
        weapon_id = self.weapon.get().strip().lower()
        label = self.label.get().strip()
        skin_id = self.skin_id.get().strip()
        rarity = self.rarity.get().lower()
        collection = self.collection.get().strip()
        description = self.description.get("1.0", "end-1c").strip()
        label_color = self.hex_color.get().strip()
        locked_text = self.locked_text.get().strip()
        fusion_weight = None
        if self.include_weight.get():
            raw_weight = self.weight.get().strip()
            if not re.fullmatch(r"[0-9]+", raw_weight) or int(raw_weight) < 1:
                messagebox.showerror("Invalid fusion weight", "Weight must be a positive whole number (1 or higher).")
                return
            fusion_weight = int(raw_weight)
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", label_color):
            messagebox.showerror("Invalid label color", "Use a six-digit hex color such as #3BE1FF.")
            return
        if not re.fullmatch(r"[a-z0-9_.-]+:[a-z0-9_./-]+", weapon_id):
            messagebox.showerror("Invalid weapon ID", "Use a namespaced ID, e.g. tacz:ai_awp")
            return
        if not label or not collection or not description:
            messagebox.showerror("Missing information", "Skin name, description and collection are required.")
            return
        if rarity not in RARITIES:
            messagebox.showerror("Invalid rarity", "Choose a supported rarity.")
            return
        weapon_name = weapon_id.split(":", 1)[-1].split("/")[-1]
        if self.current is None and not skin_id:
            slug = slugify(label)
            if not slug:
                messagebox.showerror("Invalid skin name", "Skin name needs letters or digits.")
                return
            skin_id = f"{weapon_name}_{slug}"
        if not re.fullmatch(r"[a-z0-9_]+", skin_id):
            messagebox.showerror("Invalid skin ID", "Skin IDs may only contain lowercase letters, digits and underscores.")
            return

        if self.current is None:
            path = weapon_filename(weapon_id, self.skins_directory)
            if path.exists():
                try:
                    data = load_json(path)
                except ValueError as exc:
                    messagebox.showerror("Invalid JSON", str(exc))
                    return
                existing_base = data.get("base_gun", data.get("base_melee"))
                if existing_base != weapon_id:
                    messagebox.showerror("Weapon mismatch", f"{path.name} belongs to {existing_base}.")
                    return
            else:
                key = "base_melee" if self.weapon_kind.get() == "melee" else "base_gun"
                data = {key: weapon_id, "skins": []}
            index = None
            previous = None
        else:
            path, loaded_data, index, previous = self.rows[self.current]
            try:
                data = load_json(path)
            except ValueError as exc:
                messagebox.showerror("Invalid JSON", str(exc))
                return
            if index >= len(data["skins"]) or data["skins"][index] != previous:
                messagebox.showerror("File changed", "This entry changed on disk. Refresh the list before saving.")
                return
            if data.get("base_gun", data.get("base_melee")) != weapon_id:
                messagebox.showerror("Weapon mismatch", "The weapon ID cannot change during editing.")
                return
        if any(isinstance(item, dict) and item.get("id") == skin_id and i != index
               for i, item in enumerate(data["skins"])):
            messagebox.showerror("Duplicate skin ID", f"{skin_id} already exists in {path.name}.")
            return


        entry = dict(previous) if previous is not None else {}
        entry.update({
            "id": skin_id,
            "name": f"{display_gun(weapon_id)} | {label}",
            "label_color": "0x" + label_color[1:].upper(),
            "rarity": rarity,
            "collection": collection,
            "description": description,
            "is_new": self.is_new.get(),
        })
        if locked_text:
            entry["locked_text"] = locked_text
        else:
            entry.pop("locked_text", None)
        if self.unlocked.get():
            entry["unlocked"] = True
        else:
            entry.pop("unlocked", None)
        if self.include_weight.get():
            entry["weight"] = fusion_weight
        else:
            entry.pop("weight", None)
        if index is None:
            data["skins"].append(entry)
        else:
            data["skins"][index] = entry
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            save_json(path, data)
        except OSError as exc:
            messagebox.showerror("Save failed", str(exc))
            return
        self.dirty = False
        messagebox.showinfo("Saved", f"{skin_id} saved to {path.name}")
        self.reload()
        for row_idx, (row_path, _data, _index, skin) in enumerate(self.rows):
            if row_path == path and skin.get("id") == skin_id:
                self.search.set("")
                self.filter_rarity.set("All rarities")
                self.table.selection_set(str(row_idx))
                self.table.see(str(row_idx))
                self.on_select()
                break

    def on_close(self):
        if self.confirm_discard():
            self.destroy()


if __name__ == "__main__":
    SkinManager().mainloop()
