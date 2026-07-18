from pathlib import Path
import sys

from PIL import Image, ImageDraw


src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("docs/_qa/final-pages-v2")
out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("docs/_qa/contact-sheets-v2")
out.mkdir(parents=True, exist_ok=True)
pages = sorted(src.glob("page-*.png"))

for group_index in range(0, len(pages), 6):
    group = pages[group_index:group_index + 6]
    thumbs = []
    for path in group:
        img = Image.open(path).convert("RGB")
        img.thumbnail((408, 528), Image.Resampling.LANCZOS)
        thumbs.append((path.name, img.copy()))
    sheet = Image.new("RGB", (1224, 1110), "#d7e1e4")
    draw = ImageDraw.Draw(sheet)
    for i, (name, img) in enumerate(thumbs):
        x = (i % 3) * 408
        y = (i // 3) * 555
        sheet.paste(img, (x, y + 22))
        draw.text((x + 8, y + 4), name, fill="#08232d")
    sheet.save(out / f"pages-{group_index + 1:02d}-{group_index + len(group):02d}.png")

rows = []
for path in pages:
    img = Image.open(path).convert("RGB")
    crop = img.crop((0, int(img.height * .89), img.width, img.height))
    crop.thumbnail((612, 88), Image.Resampling.LANCZOS)
    rows.append((path.name, crop.copy()))

footer_height = max(104, ((len(rows) + 1) // 2) * 104)
footer_sheet = Image.new("RGB", (1224, footer_height), "white")
draw = ImageDraw.Draw(footer_sheet)
for i, (name, crop) in enumerate(rows):
    x = (i % 2) * 612
    y = (i // 2) * 104
    draw.text((x + 4, y + 2), name, fill="#08232d")
    footer_sheet.paste(crop, (x, y + 16))
footer_sheet.save(out / "footer-audit.png")
print(len(pages))
