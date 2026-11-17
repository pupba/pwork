"""Render the Workspace product emblem without modifying the LABS master assets."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
icons = root / "src-tauri/icons"
icons.mkdir(parents=True, exist_ok=True)
master = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
draw = ImageDraw.Draw(master)
draw.rounded_rectangle((36, 36, 988, 988), radius=212, fill="#202125")
draw.rounded_rectangle((277, 398, 566, 776), radius=40, outline="#ffffff", width=45)
draw.line([(500, 249), (687, 249), (718, 280), (718, 575)], fill="#ffffff", width=45, joint="curve")
for size in (192, 512):
    icon = master.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(root / f"public/icon-{size}.png")
    if size == 512:
        icon = icon.resize((256, 256), Image.Resampling.LANCZOS)
        icon.save(icons / "icon.png")
        icon.save(icons / "icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

