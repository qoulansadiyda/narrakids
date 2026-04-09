import { ASSET_REGISTRY } from "../assets/registry";

export async function addAssetToCanvas(opts: {
  canvas: any;
  asset: any;
  canEdit: boolean;
}) {
  const { canvas, asset, canEdit } = opts;
  if (!canvas || !asset) return;

  const fabricModule = await import("fabric");
  const fabric: any = (fabricModule as any).fabric || (fabricModule as any).default || (fabricModule as any);

  return new Promise<void>(async (resolve) => {
    try {
      // Fallback dimensi kanvas agar terhindar dari NaN (bila setDimensions dihapus)
      const cw = typeof canvas.getWidth === "function" ? canvas.getWidth() : (canvas.width || 520);
      const ch = typeof canvas.getHeight === "function" ? canvas.getHeight() : (canvas.height || 390);

      // ── TEXT ONLY (tanpa gambar bubble) ──
      if (asset.category === "bubble_text" && !asset.src) {
        const text = new fabric.Textbox("Ketik di sini", {
          fontSize: 32,
          fontFamily: "Nunito",
          fill: "#333333",
          textAlign: "center",
          width: cw * 0.5,
          left: cw / 2,
          top: ch / 2,
          originX: "center",
          originY: "center",
          editable: canEdit,
          selectable: canEdit,
          evented: canEdit,
        });
        text.data = { category: asset.category, id: asset.id };
        canvas.add(text);
        if (canEdit) canvas.setActiveObject(text);
        canvas.requestRenderAll();
        return resolve();
      }

      let img: any;
      const loadHtmlImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const imgEl = new window.Image();
        imgEl.crossOrigin = "anonymous";
        imgEl.onload = () => resolve(imgEl);
        imgEl.onerror = () => reject(new Error("Failed to load image from " + src));
        imgEl.src = src;
      });

      const el = await loadHtmlImage(asset.src);
      // Mendukung Fabric 5 (fabric.Image) maupun Fabric 6+ (fabric.FabricImage)
      const ImgClass = fabric.FabricImage || fabric.Image;
      img = new ImgClass(el);

      if (!img) return resolve();

      if (asset.category === "bubble_text") {
        let sc = asset.defaultScale ?? 0.5;
        const maxBW = cw * 0.6;
        const maxBH = ch * 0.6;
        const sX = maxBW / img.width;
        const sY = maxBH / img.height;
        const safeScale = Math.min(sc, sX, sY);
        img.scale(safeScale);

        const groupW = img.getScaledWidth();
        const groupH = img.getScaledHeight();

        // Posisi teks tepat di tengah bubble
        const text = new fabric.Textbox("Ketik di sini", {
          fontSize: 28,
          fontFamily: "Nunito",
          fill: "#000000",
          textAlign: "center",
          width: groupW * 0.65,
          originX: "center",
          originY: "center",
          left: 0,
          top: 0,
          editable: canEdit,
          selectable: canEdit,
        });

        img.set({
          originX: "center",
          originY: "center",
          left: 0,
          top: 0,
        });

        const grp = new fabric.Group([img, text], {
          left: cw / 2,
          top: ch / 2,
          originX: "center",
          originY: "center",
          subTargetCheck: true,
          interactive: true,
        });

        grp.data = { category: asset.category, id: asset.id };
        canvas.add(grp);
        if (canEdit) canvas.setActiveObject(grp);
        canvas.requestRenderAll();
        resolve();

      } else {
        let sc = asset.defaultScale ?? 0.5;

        if (asset.category === "background") {
          const sX = cw / img.width;
          const sY = ch / img.height;
          const sCover = Math.max(sX, sY); // Aspect cover
          img.set({
            scaleX: sCover,
            scaleY: sCover,
            left: cw / 2,
            top: ch / 2,
            originX: "center",
            originY: "center",
            selectable: false,
            evented: false,
          });
        } else {
          // Bounding box protection for stickers & characters
          const maxW = cw * 0.8;
          const maxH = ch * 0.8;
          const sX = maxW / img.width;
          const sY = maxH / img.height;
          const safeScale = Math.min(sc, sX, sY);

          img.set({
            scaleX: safeScale,
            scaleY: safeScale,
            left: cw / 2,
            top: ch / 2,
            originX: "center",
            originY: "center",
            selectable: canEdit,
            evented: canEdit,
          });
        }

        img.data = { category: asset.category, id: asset.id };

        if (asset.category === "background") {
          if (typeof canvas.sendToBack === "function") canvas.sendToBack(img);
          else if (typeof canvas.sendObjectToBack === "function") canvas.sendObjectToBack(img);
        }

        canvas.add(img);
        if (canEdit && asset.category !== "background") {
          canvas.setActiveObject(img);
        }
        canvas.requestRenderAll();
        resolve();
      }
    } catch (err) {
      console.error("[addAssetToCanvas] Load failed:", err);
      resolve();
    }
  });
}
