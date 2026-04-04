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

      // Fallback dimensi kanvas agar terhindar dari NaN (bila setDimensions dihapus)
      const cw = typeof canvas.getWidth === "function" ? canvas.getWidth() : (canvas.width || 520);
      const ch = typeof canvas.getHeight === "function" ? canvas.getHeight() : (canvas.height || 390);

      if (asset.category === "bubble_text") {
        img.scale(asset.defaultScale ?? 0.5);

        const groupW = img.getScaledWidth();
        const groupH = img.getScaledHeight();

        const text = new fabric.Textbox("Ketik di sini", {
          fontSize: 28,
          fontFamily: "Nunito",
          fill: "#000000",
          textAlign: "center",
          width: groupW * 0.7,
          originX: "center",
          originY: "center",
          left: groupW / 2,
          top: groupH / 2,
          editable: canEdit,
          selectable: canEdit,
        });

        img.set({
          originX: "center",
          originY: "center",
          left: groupW / 2,
          top: groupH / 2,
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
        const sc = asset.defaultScale ?? 0.5;

        if (asset.category === "background") {
          const sX = cw / img.width;
          const sY = ch / img.height;
          const sCover = Math.max(sX, sY);
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
          img.set({
            scaleX: sc,
            scaleY: sc,
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
