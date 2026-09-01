from pathlib import Path
import sys

from PIL import Image, ImageDraw


source = Path(sys.argv[1])
output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
pages = sorted(source.glob("page-*.png"))

for index in range(0, len(pages), 2):
    pair = pages[index:index + 2]
    images = [Image.open(path).convert("RGB") for path in pair]
    width = sum(image.width for image in images)
    height = max(image.height for image in images) + 30
    sheet = Image.new("RGB", (width, height), "#dce7e9")
    draw = ImageDraw.Draw(sheet)
    x = 0
    for path, image in zip(pair, images):
        draw.text((x + 8, 7), path.name, fill="#08232d")
        sheet.paste(image, (x, 30))
        x += image.width
    first = index + 1
    last = index + len(pair)
    sheet.save(output / f"pages-{first:02d}-{last:02d}.png")

print(len(pages))
