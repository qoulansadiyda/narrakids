import re

with open("client/src/app/editor/[roomId]/page.tsx", "r") as f:
    code = f.read()

# 1. Canvas Scale State
if "const [canvasScale" not in code:
    code = code.replace(
        "const [pageSize, setPageSize] = useState<{ w: number; h: number }>({ w: 520, h: 390 });",
        "const [pageSize, setPageSize] = useState<{ w: number; h: number }>({ w: 520, h: 390 });\n  const [canvasScale, setCanvasScale] = useState<number>(1);"
    )

# 2. Compute Resize for Responsiveness
code = re.sub(
    r"let w = Math\.floor\(\(containerW - SPREAD_GAP\) / 2\);\s*w = Math\.max\(260, w\);\s*// We no longer set dynamic logical pageSize.*?\}",
    r"""const marginMobile = window.innerWidth < 768 ? 16 : 48;
      const maxW = Math.max(280, containerW - marginMobile);
      const scale = Math.min(1, maxW / pageSize.w);
      setCanvasScale(scale);
    }""",
    code,
    flags=re.DOTALL
)

# 3. Spread wrap Flex layout
code = code.replace(
    '<div className="flex items-start" style={{ gap: SPREAD_GAP }}>',
    '<div className="flex flex-wrap items-start justify-center" style={{ gap: SPREAD_GAP }}>'
)
code = code.replace(
    'style={{ width: pageSize.w, height: pageSize.h, position: "relative" }}',
    'style={{ width: pageSize.w * canvasScale, height: pageSize.h * canvasScale, position: "relative" }}'
)
code = code.replace(
    '<canvas id="left-canvas" />',
    '<div style={{ transform: `scale(${canvasScale})`, transformOrigin: "top left", width: pageSize.w, height: pageSize.h }}><canvas id="left-canvas" /></div>'
)
code = code.replace(
    '<canvas id="right-canvas" />',
    '<div style={{ transform: `scale(${canvasScale})`, transformOrigin: "top left", width: pageSize.w, height: pageSize.h }}><canvas id="right-canvas" /></div>'
)

# 4. Flip Filter (Task 6)
flip_code = """
function flipSelected(canvas: any, axis: "x" | "y", sendUpdate: () => void) {
  const obj = canvas?.getActiveObject?.();
  if (!obj) return;
  if (obj?.data?.category === "background") return;
  
  if (obj.data?.category === "bubble_text" && obj.type === "group") {
    const img = (obj as any).item(0);
    if (img) {
       img.set(axis === "x" ? "flipX" : "flipY", !img[axis === "x" ? "flipX" : "flipY"]);
    }
  } else {
    if (axis === "x") obj.set("flipX", !obj.flipX);
    else obj.set("flipY", !obj.flipY);
  }
  canvas.requestRenderAll?.();
  sendUpdate();
}
"""
code = re.sub(r'function flipSelected\(.*?\).*?\n}', flip_code, code, flags=re.DOTALL)

# 5. Ctrl+D Shortcut (Task 4)
ctrl_d = """
      // Duplicate: Ctrl+D
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const c = getCanvasBySide(editableSideRef.current);
        if (!c || !isMyTurn) return;
        const active = c.getActiveObject();
        if (!active || active?.data?.category === "background") return;
        
        active.clone((cloned: any) => {
          c.discardActiveObject();
          cloned.set({
            left: (cloned.left || 0) + 20,
            top: (cloned.top || 0) + 20,
            evented: true,
            selectable: true
          });
          if (cloned.type === 'activeSelection') {
            cloned.canvas = c;
            cloned.forEachObject((obj: any) => c.add(obj));
            cloned.setCoords();
          } else {
            cloned.data = JSON.parse(JSON.stringify(active.data || {}));
            c.add(cloned);
          }
          c.setActiveObject(cloned);
          c.requestRenderAll();
          (c as any)._sendUpdate?.();
          saveHistoryState(c);
        });
        return;
      }

      // Delete: Delete or Backspace
"""
code = code.replace("// Delete: Delete or Backspace", ctrl_d)

# 6. Book Title (Task 7)
if "const [bookTitle" not in code:
    code = code.replace(
        "const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);",
        "const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);\n  const [bookTitle, setBookTitle] = useState<string>('');"
    )

code = code.replace(
    "setCurrentTurnUsername(name);",
    "setCurrentTurnUsername(name);\n\n      if (snapshot.settings && snapshot.settings.bookTitle) {\n        setBookTitle(snapshot.settings.bookTitle);\n      }"
)

code = code.replace(
    '<h1 className="text-2xl font-black text-sky-600 drop-shadow-sm leading-none">Ruang Karya</h1>',
    '<h1 className="text-2xl font-black text-sky-600 drop-shadow-sm leading-none">{bookTitle || "Ruang Karya"}</h1>'
)

# 7. Modal Skor Listener (Task 5 score UI)
code = code.replace(
    's.on("score:update", handleScoreUpdate);',
    's.on("score:update", handleScoreUpdate);\n    s.on("turn:timeout_score", async (payload: any) => {\n      await import("@/components/DialogProvider").then(m => m.useDialog).then(() => {\n           console.log("Timeout score", payload);\n      });\n      showAlert(`Waktu Habis! Panel disimpan.\\nSkor kamu turn ini: +${payload.score}\\nTotal skormu sekarang: ${payload.totalScore}`);\n      setCurrentPageSfx(null);\n      setCurrentPageBgm(null);\n    });'
)

with open("client/src/app/editor/[roomId]/page.tsx", "w") as f:
    f.write(code)

print("Patch applied successfully.")
