import { Image as FabricImage, type Canvas } from "fabric";
import type { AssetItem } from "@/lib/assets/registry";

type AddAssetOpts = {
  canvas: Canvas;
  asset: AssetItem;
  panelId?: string;
  socket?: { emit: (event: string, payload: any) => void };
  canEdit: boolean;
};

function putLayer(canvas: Canvas, obj: any, category: AssetItem["category"]) {
  if (category === "background") {
    obj.selectable = false;
    obj.evented = false;
    canvas.sendObjectToBack(obj);
  } else {
    canvas.bringObjectToFront(obj);
  }
}

export async function addAssetToCanvas(opts: AddAssetOpts) {
  const { canvas, asset, panelId, socket, canEdit } = opts;
  if (!canEdit) return;

  // ================================
  // SPECIAL CASE: bubble_text (group = bubble + editable textbox)
  // ================================
  if (asset.category === "bubble_text") {
    const fabricModule = await import("fabric");
    const fabric: any =
      (fabricModule as any).fabric ||
      (fabricModule as any).default ||
      (fabricModule as any);

    const cw = canvas.getWidth();
    const ch = canvas.getHeight();

    // Text Only Case
    if (!asset.src) {
      const text = new fabric.Textbox("Ketik teks bebas di sini...", {
        width: 300,
        fontSize: 28,
        fontFamily: "Inter",
        textAlign: "center",
        editable: true,
        fill: "#000",
        originX: "center",
        originY: "center",
        selectable: true,
        evented: true,
        left: cw / 2,
        top: ch / 2,
      });

      (text as any).data = {
        id: crypto.randomUUID().slice(0, 8),
        assetId: asset.id,
        category: "bubble_text",
        name: asset.name,
      };

      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.bringObjectToFront(text);
      canvas.requestRenderAll();

      if (socket && panelId) {
        const objectJSON = text.toObject() as any;
        objectJSON.data = (text as any).data;
        socket.emit("canvas:addObject", { panelId, objectJSON });
      }

      return;
    }

    // Default Bubble + Text Case
    const bubble = await fabric.Image.fromURL(asset.src, {
      crossOrigin: "anonymous",
    });

    bubble.set({
      originX: "center",
      originY: "center",
      selectable: false, // klik jangan nyangkut di bubble doang
      evented: false,
    });

    const text = new fabric.Textbox("Type here...", {
      width: 220,
      fontSize: 18,
      fontFamily: "Inter",
      textAlign: "center",
      editable: true,
      fill: "#000",
      originX: "center",
      originY: "center",
      selectable: true,
      evented: true,
    });

    const group = new fabric.Group([bubble, text], {
      left: cw / 2,
      top: ch / 2,
      originX: "center",
      originY: "center",
      subTargetCheck: true,
      interactive: true, // 🔑 penting biar subTargets kebaca & textbox bisa diedit
      selectable: true,
      evented: true,
      lockUniScaling: true, // 🔑 MENCEGAH STRETCHING (Harus scaling proporsional)
    });

    (group as any).data = {
      id: crypto.randomUUID().slice(0, 8),
      assetId: asset.id,
      category: asset.category,
      name: asset.name,
    };

    // calculate bounding limits to ensure it doesn't spawn huge
    let targetScale = asset.defaultScale ?? 1;
    const maxW = cw * 0.6;
    const maxH = ch * 0.6;
    if (group.width! * targetScale > maxW) targetScale = maxW / group.width!;
    if (group.height! * targetScale > maxH) targetScale = maxH / group.height!;

    group.scale(targetScale);

    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.bringObjectToFront(group);
    canvas.requestRenderAll();

    // optional emit custom
    if (socket && panelId) {
      const objectJSON = group.toObject() as any;
      objectJSON.data = (group as any).data;
      socket.emit("canvas:addObject", { panelId, objectJSON });
    }

    return;
  }

  // ================================
  // DEFAULT: image asset
  // ================================
  const img = await FabricImage.fromURL(asset.src, {
    crossOrigin: "anonymous",
  });

  const cw = canvas.getWidth();
  const ch = canvas.getHeight();

  img.set({
    left: cw / 2,
    top: ch / 2,
    originX: "center",
    originY: "center",
    lockUniScaling: true, // 🔑 Mencegah stretching
  });

  (img as any).data = {
    id: crypto.randomUUID().slice(0, 8),
    assetId: asset.id,
    category: asset.category,
    name: asset.name,
  };

  if (asset.category === "background") {
    canvas.getObjects().forEach((o) => {
      if ((o as any).data?.category === "background") canvas.remove(o);
    });

    const w = img.width ?? 1;
    const h = img.height ?? 1;
    const fitScale = Math.max(cw / w, ch / h);
    img.scale(fitScale);
  } else {
    // calculate bounding limits to ensure it doesn't spawn huge
    let targetScale = asset.defaultScale ?? 1;
    const maxW = cw * 0.6;
    const maxH = ch * 0.6;
    if (img.width! * targetScale > maxW) targetScale = maxW / img.width!;
    if (img.height! * targetScale > maxH) targetScale = maxH / img.height!;

    img.scale(targetScale);
  }

  canvas.add(img);
  putLayer(canvas, img, asset.category);
  canvas.requestRenderAll();

  const objectJSON = img.toObject() as any;
  objectJSON.data = (img as any).data;

  if (socket && panelId) {
    socket.emit("canvas:addObject", { panelId, objectJSON });
  }
}

