"""Exercise the unchanged Python save method without starting Tkinter."""
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("reference", Path(__file__).resolve().parents[1] / "MCPSkins_Asset_Manager.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
root = Path(sys.argv[1])
values = json.loads(sys.argv[2])
app.ROOT = root / "python_reference"


class Value:
    def __init__(self, value):
        self.value = value

    def get(self, *_args):
        return self.value


def fail(title, message):
    raise ValueError(f"{title}: {message}")


app.messagebox.showerror = fail
app.messagebox.showinfo = lambda *_args: None
manager = SimpleNamespace(current=None, rows=[], dirty=True, skins_directory=app.data_directory("Example", "example"))
mapping = {"weapon": "weapon", "weapon_kind": "kind", "label": "label", "skin_id": "id", "rarity": "rarity",
           "collection": "collection", "description": "description", "hex_color": "color", "locked_text": "locked_text",
           "is_new": "is_new", "unlocked": "unlocked", "include_weight": "include_weight", "weight": "weight"}
for attribute, field in mapping.items():
    setattr(manager, attribute, Value(values[field]))
manager.reload = lambda: None
app.SkinManager.save(manager)
file = next(manager.skins_directory.glob("*_skins.json"))
print(json.dumps(app.load_json(file)))
