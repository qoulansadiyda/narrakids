import re

with open("client/src/app/editor/[roomId]/page.tsx", "r") as f:
    data = f.read()

# 1. Provide the inner transform: scale div!
data = data.replace(
    '<canvas id="left-canvas" />',
    '<div style={{ transform: `scale(${canvasScale})`, transformOrigin: "top left", width: pageSize.w, height: pageSize.h }}><canvas id="left-canvas" /></div>'
)

data = data.replace(
    '<canvas id="right-canvas" />',
    '<div style={{ transform: `scale(${canvasScale})`, transformOrigin: "top left", width: pageSize.w, height: pageSize.h }}><canvas id="right-canvas" /></div>'
)

# 2. Prevent setDimensions and setZoom in bindToWrapper!
data = re.sub(
    r'const scale = w / 520;\s*canvas\.setDimensions\(\{ width: "100%", height: "100%" \}, \{ cssOnly: true \}\);\s*canvas\.setZoom\(scale\);\s*canvas\.requestRenderAll\(\);',
    '// Biarkan browser yang melakukan transform: scale, Fabric tetap murni 520x390\ncanvas.requestRenderAll();',
    data,
    flags=re.MULTILINE
)

with open("client/src/app/editor/[roomId]/page.tsx", "w") as f:
    f.write(data)
