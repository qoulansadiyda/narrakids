import { ASSET_REGISTRY } from "./registry";

export async function addAssetToCanvas(opts: {
  canvas: any;
  asset: any;
  canEdit: boolean;
}) {
  const { canvas, asset, canEdit } = opts;
  if (!canvas || !asset) return;

  const fabricModule = await import("fabric");
  const fabric: any = (fabricModule as any).fabric || (fabricModule as any).default || (fabricModule as any);

  return new Promise<void>((resolve) => {
    if (asset.category === "bubble_text") {
      fabric.Image.fromURL(asset.src, (img: any) => {
        img.scale(asset.defaultScale ?? 0.5);

        const groupW = img.getScaledWidth();
        const groupH = img.getScaledHeight();

        // TASK 6: Font default size increased from 18 to 28 for better proportion
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

        // Posisi Image agar origin di tengah juga untuk Textbox
        img.set({
          originX: "center",
          originY: "center",
          left: groupW / 2,
          top: groupH / 2,
        });

        const grp = new fabric.Group([img, text], {
          left: canvas.width / 2,
          top: canvas.height / 2,
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
      });
    } else {
      fabric.Image.fromURL(asset.src, (img: any) => {
        const sc = asset.defaultScale ?? 0.5;
        // Background scale to cover canvas
        if (asset.category === "background") {
          const sX = canvas.width / img.width;
          const sY = canvas.height / img.height;
          // cover
          const sCover = Math.max(sX, sY);
          img.set({
            scaleX: sCover,
            scaleY: sCover,
            left: canvas.width / 2,
            top: canvas.height / 2,
            originX: "center",
            originY: "center",
            selectable: false,
            evented: false,
          });
        } else {
          img.scale(sc);
          img.set({
            left: canvas.width / 2,
            top: canvas.height / 2,
            originX: "center",
            originY: "center",
            selectable: canEdit,
            evented: canEdit,
          });
        }

        img.data = { category: asset.category, id: asset.id };

        if (asset.category === "background") {
          // ensure bg goes to back
          if (typeof canvas.sendToBack === "function") canvas.sendToBack(img);
          else if (typeof canvas.sendObjectToBack === "function") canvas.sendObjectToBack(img);
        }

        canvas.add(img);
        if (canEdit && asset.category !== "background") {
          canvas.setActiveObject(img);
        }
        canvas.requestRenderAll();
        resolve();
      });
    }
  });
}
