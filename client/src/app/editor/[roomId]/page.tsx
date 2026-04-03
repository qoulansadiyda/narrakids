"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";
import { isAuthed } from "@/lib/auth";
import type { ReactNode } from "react";

import { ASSET_REGISTRY } from "@/lib/assets/registry";
import { addAssetToCanvas } from "@/lib/canvas/addAsset";
import AssetLibrary from "@/components/AssetLibrary";
import { useDialog } from "@/components/DialogProvider";

/**
 * Delete selected object(s) in Fabric canvas.
 * Rules:
 * - only when it's my turn
 * - can't delete background object (category === 'background')
 */
function deleteSelectedFromCanvas(opts: {
  canvas: any; // fabric.Canvas
  isMyTurn: boolean;
  onAfterChange: () => void; // emit update
}) {
  const { canvas, isMyTurn, onAfterChange } = opts;
  if (!canvas) return;
  if (!isMyTurn) return;

  const active = canvas.getActiveObject?.();
  if (!active) return;

  const targets =
    active?.type === "activeSelection" && typeof active.getObjects === "function"
      ? active.getObjects()
      : [active];

  // block background deletion
  const deletables = targets.filter((o: any) => o?.data?.category !== "background");
  if (deletables.length === 0) return;

  // If activeSelection, remove child objects then discard selection
  if (active?.type === "activeSelection" && typeof active.forEachObject === "function") {
    active.forEachObject((obj: any) => {
      if (obj?.data?.category === "background") return;
      canvas.remove(obj);
    });
    canvas.discardActiveObject?.();
  } else {
    // single object
    if (active?.data?.category === "background") return;
    canvas.remove(active);
    canvas.discardActiveObject?.();
  }

  canvas.requestRenderAll?.();
  onAfterChange(); // broadcast
}

// ── Transform helpers ──
function rotateSelected(canvas: any, angle: number, sendUpdate: () => void) {
  const obj = canvas?.getActiveObject?.();
  if (!obj) return;
  if (obj?.data?.category === "background") return;
  obj.rotate((obj.angle ?? 0) + angle);
  canvas.requestRenderAll?.();
  sendUpdate();
}


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


function bringForwardSelected(canvas: any, sendUpdate: () => void) {
  const obj = canvas?.getActiveObject?.();
  if (!obj) return;
  if (obj?.data?.category === "background") return; // bg cannot move

  canvas.bringObjectForward(obj);
  canvas.requestRenderAll?.();
  sendUpdate();
}

function sendBackwardsSelected(canvas: any, sendUpdate: () => void) {
  const obj = canvas?.getActiveObject?.();
  if (!obj) return;
  if (obj?.data?.category === "background") return; // bg always back

  canvas.sendObjectBackwards(obj);
  
  // Enforce background stays at absolute bottom (index 0)
  const allObjects = canvas.getObjects();
  const bg = allObjects.find((o: any) => o?.data?.category === "background");
  const bgIndex = allObjects.indexOf(bg);
  const objIndex = allObjects.indexOf(obj);
  
  // If we accidentally pushed the object below the background, swap them
  if (bg && objIndex <= bgIndex) {
    canvas.sendObjectToBack(obj); // push it to 0
    canvas.sendObjectToBack(bg);  // push background to 0 (moving obj to 1)
  }
  
  canvas.requestRenderAll?.();
  sendUpdate();
}

type LeaderboardRow = { sid: string; total: number; username?: string };
type CanvasObjectPayload = any;

type Panel = {
  index: number;
  objects: CanvasObjectPayload[];
};

const SPREAD_GAP = 32;
const PAGE_RATIO = 3 / 4;

export default function EditorPage() {
  const { roomId } = useParams() as { roomId: string };
  const router = useRouter();
  const socket: Socket = getSocket();
  const { showAlert } = useDialog();

  const leftCanvasRef = useRef<any>(null);
  const rightCanvasRef = useRef<any>(null);
  const isSyncingRef = useRef(false);

  // ── Undo/redo history ──
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const isUndoRedoRef = useRef(false); // prevent saving state during undo/redo

  const leftWrapRef = useRef<HTMLDivElement | null>(null);
  const rightWrapRef = useRef<HTMLDivElement | null>(null);
  const spreadWrapRef = useRef<HTMLDivElement | null>(null);

  const [pageSize, setPageSize] = useState<{ w: number; h: number }>({ w: 520, h: 390 });
  const [canvasScale, setCanvasScale] = useState<number>(1);

  // ── Auth gate ──
  useEffect(() => {
    if (!isAuthed()) router.replace("/login");
  }, [router]);

  const [mySocketId, setMySocketId] = useState<string | null>(null);
  const [currentTurnUserId, setCurrentTurnUserId] = useState<string | null>(null);
  const [currentTurnUsername, setCurrentTurnUsername] = useState<string | null>(null);
  const [currentTurnNumber, setCurrentTurnNumber] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [bookTitle, setBookTitle] = useState<string>('');
  const [panels, setPanels] = useState<Panel[]>([]);

  // ── Audio state ──
  const [currentPageBgm, setCurrentPageBgm] = useState<{ id: string; src: string; name: string } | null>(null);
  const [currentPageSfx, setCurrentPageSfx] = useState<{ id: string; src: string; name: string } | null>(null);
  
  const currentPageBgmRef = useRef<{ id: string; src: string; name: string } | null>(null);
  useEffect(() => { currentPageBgmRef.current = currentPageBgm; }, [currentPageBgm]);
  
  const currentPageSfxRef = useRef<{ id: string; src: string; name: string } | null>(null);
  useEffect(() => { currentPageSfxRef.current = currentPageSfx; }, [currentPageSfx]);
  
  // Used to power the In-Place History Preview
  const [viewingHistorySpread, setViewingHistorySpread] = useState<(number | null)[] | null>(null);
  const viewingHistorySpreadRef = useRef<(number | null)[] | null>(null);
  useEffect(() => {
    viewingHistorySpreadRef.current = viewingHistorySpread;
  }, [viewingHistorySpread]);

  // ── Floating toolbar state ──
  const [floatingToolbar, setFloatingToolbar] = useState<{
    visible: boolean;
    x: number;
    y: number;
    side: "left" | "right";
    isText?: boolean;
    textProps?: {
      fontFamily: string;
      fontSize: number;
      fontStyle: string;
      fontWeight: string | number;
      underline: boolean;
      textAlign: string;
      fill: string;
    };
  }>({ visible: false, x: 0, y: 0, side: "left" });

  const [editableSide, setEditableSide] = useState<"left" | "right">("left");
  const editableSideRef = useRef<"left" | "right">("left");
  useEffect(() => {
    editableSideRef.current = editableSide;
  }, [editableSide]);

  const isMyTurn =
    mySocketId != null && currentTurnUserId != null ? mySocketId === currentTurnUserId : false;

  const isMyTurnRef = useRef(false);
  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  // ── Timer & Done SFX logic ──
  const clockSfxRef = useRef<HTMLAudioElement | null>(null);
  const doneSfxRef = useRef<HTMLAudioElement | null>(null);

  const playDoneSfx = () => {
    try {
      if (!doneSfxRef.current) {
        doneSfxRef.current = new Audio("/assets/audio/sfx-done.mp3");
      }
      doneSfxRef.current.currentTime = 0;
      let playPromise = doneSfxRef.current.play();
      if (playPromise !== undefined) {
         playPromise.catch(e => console.warn("playDoneSfx block:", e));
      }
    } catch (err) {}
  };

  const prevTimeLeft = useRef<number | null>(null);

  useEffect(() => {
    // Detect timeout race condition: If timer was <= 2 seconds and suddenly resets to null or > 5
    // It indicates the server triggered a timeout while our local setInterval was slightly behind
    const wasTickingLow = prevTimeLeft.current !== null && prevTimeLeft.current <= 2;
    const jumpedHigh = timeLeft === null || timeLeft > 5 || timeLeft === 0;

    if (wasTickingLow && jumpedHigh) {
      playDoneSfx();
    } else if (timeLeft === 0 && prevTimeLeft.current !== 0) {
      playDoneSfx(); // Normal 0 hit
    }

    prevTimeLeft.current = timeLeft;

    // Stop clock ticking if it's not my turn
    if (!isMyTurn) {
      if (clockSfxRef.current) {
        clockSfxRef.current.pause();
        clockSfxRef.current.currentTime = 0;
      }
      return;
    }

    if (timeLeft === 10) {
      if (!clockSfxRef.current) {
        clockSfxRef.current = new Audio("/assets/audio/sfx-clock.mp3");
      }
      clockSfxRef.current.currentTime = 0;
      clockSfxRef.current.play().catch(e => console.warn(e));
    }

    if (timeLeft === null || timeLeft <= 0) {
      if (clockSfxRef.current) {
        clockSfxRef.current.pause();
        clockSfxRef.current.currentTime = 0;
      }
    }
  }, [timeLeft, isMyTurn]);

  // Clean up timer sfx on unmount
  useEffect(() => {
    return () => {
      if (clockSfxRef.current) {
        clockSfxRef.current.pause();
        clockSfxRef.current = null;
      }
      if (doneSfxRef.current) {
        doneSfxRef.current.pause();
        doneSfxRef.current = null;
      }
    };
  }, []);

  // helper: get canvas by side
  const getCanvasBySide = (side: "left" | "right") =>
    side === "left" ? leftCanvasRef.current : rightCanvasRef.current;

  // helper: get wrapper by side
  const getWrapperBySide = (side: "left" | "right") =>
    side === "left" ? leftWrapRef.current : rightWrapRef.current;

  // helper: update floating toolbar position based on selected object
  const updateToolbarPosition = useCallback((canvas: any, side: "left" | "right") => {
    const active = canvas?.getActiveObject?.();
    if (!active || active?.data?.category === "background") {
      setFloatingToolbar(prev => ({ ...prev, visible: false }));
      return;
    }

    const bound = active.getBoundingRect();
    const wrapper = getWrapperBySide(side);
    if (!wrapper) return;

    // Account for canvas zoom
    const zoom = canvas.getZoom?.() ?? 1;

    // Calculate position relative to wrapper
    const x = (bound.left + bound.width / 2) * zoom;
    const y = bound.top * zoom - 8; // 8px gap above

    const isText = active.type === "textbox" || active.type === "i-text" || active.type === "text";
    let textProps = undefined;
    if (isText) {
      textProps = {
        fontFamily: active.fontFamily || "Inter",
        fontSize: active.fontSize || 18,
        fontStyle: active.fontStyle || "normal",
        fontWeight: active.fontWeight || "normal",
        underline: !!active.underline,
        textAlign: active.textAlign || "left",
        fill: active.fill || "#000000",
      };
    }

    setFloatingToolbar({ visible: true, x, y, side, isText, textProps });
  }, []);

  // ── Undo/redo helpers ──
  const getCanvasSnapshot = useCallback((canvas: any): string => {
    const objects = canvas.getObjects().map((obj: any) => {
      const json = obj.toObject() as any;
      json.data = obj.data;
      return json;
    });
    return JSON.stringify(objects);
  }, []);

  const saveHistoryState = useCallback((c: any) => {
    if (isSyncingRef.current || isUndoRedoRef.current || !isMyTurnRef.current) return;
    if (!c) return;

    const snapshot = getCanvasSnapshot(c);
    const stack = undoStackRef.current;

    // Initialize stack with empty/initial state if it's completely empty
    if (stack.length === 0) {
      stack.push(JSON.stringify([])); 
    }

    // Don't save if it's identical to the last state
    if (stack.length > 0 && stack[stack.length - 1] === snapshot) return;

    stack.push(snapshot);
    if (stack.length > 50) stack.shift(); // limit history size
    redoStackRef.current = []; // clear redo on new action
  }, [getCanvasSnapshot]);

  const performUndo = useCallback(async () => {
    if (!isMyTurnRef.current) return;
    const side = editableSideRef.current;
    const c = getCanvasBySide(side);
    if (!c) return;

    const undoStack = undoStackRef.current;
    // Need at least 2 states in stack to undo (the current state, and the previous state to revert to)
    // Or if there's 1 state, it's the initial state. 
    if (undoStack.length <= 1) return;

    // Pop the current state and move to redo stack
    const currentSnapshot = undoStack.pop()!;
    redoStackRef.current.push(currentSnapshot);

    // Peek at the previous state to restore it (do not pop it, it stays in undo stack)
    const prevSnapshot = undoStack[undoStack.length - 1];

    isUndoRedoRef.current = true;
    const objects = JSON.parse(prevSnapshot);
    await renderObjectsToSide(objects, side);
    isUndoRedoRef.current = false;

    // Emit update to other players
    const socket = getSocket();
    socket.emit("canvas:update", { roomId, objects });
  }, [roomId]);

  const performRedo = useCallback(async () => {
    if (!isMyTurnRef.current) return;
    const side = editableSideRef.current;
    const c = getCanvasBySide(side);
    if (!c) return;

    const redoStack = redoStackRef.current;
    if (redoStack.length === 0) return;

    // Pop the next state from redo stack
    const nextSnapshot = redoStack.pop()!;
    
    // Push it back to undo stack
    undoStackRef.current.push(nextSnapshot);

    isUndoRedoRef.current = true;
    const objects = JSON.parse(nextSnapshot);
    await renderObjectsToSide(objects, side);
    isUndoRedoRef.current = false;

    // Emit update to other players
    const socket = getSocket();
    socket.emit("canvas:update", { roomId, objects });
  }, [roomId]);

  // helper: detect typing (DOM input OR fabric textbox editing)
  const isTypingInInput = (): boolean => {
    const el = document.activeElement as HTMLElement | null;
    const tag = el?.tagName;
    const domTyping = tag === "INPUT" || tag === "TEXTAREA" || !!el?.isContentEditable;

    try {
      const c = getCanvasBySide(editableSideRef.current);
      const ao = c?.getActiveObject?.();
      const fabricTyping = !!ao?.isEditing;
      return domTyping || fabricTyping;
    } catch {
      return domTyping;
    }
  };

  // responsive size
  useEffect(() => {
    const el = spreadWrapRef.current;
    if (!el) return;

    const compute = () => {
      const containerW = el.clientWidth;
      if (!containerW) return;

      const marginMobile = window.innerWidth < 768 ? 16 : 48;
      const maxW = Math.max(280, containerW - marginMobile);
      const scale = Math.min(1, maxW / pageSize.w);
      setCanvasScale(scale);
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applyInteractivity = (canvas: any, canEdit: boolean) => {
    canvas.selection = canEdit;
    canvas.skipTargetFind = !canEdit;

    canvas.perPixelTargetFind = false;
    canvas.targetFindTolerance = 15;

    canvas.forEachObject((obj: any) => {
      const cat = obj?.data?.category;
      const isLocked = !!obj?.data?.locked;

      if (cat === "background") {
        obj.selectable = false;
        obj.evented = false;
        obj.hoverCursor = "default";
        return;
      }

      // bubble_text group needs these to allow editing child textbox
      if (cat === "bubble_text" && obj?.type === "group") {
        obj.subTargetCheck = true;
        obj.interactive = true;
        // enforce children flags too
        (obj._objects ?? []).forEach((ch: any) => {
          if (!ch) return;
          if (ch.type === "textbox" || ch.type === "i-text") {
            const childEditable = canEdit && !isLocked;
            ch.selectable = childEditable;
            ch.evented = childEditable;
            ch.editable = childEditable;
          } else {
            // bubble image
            ch.selectable = false;
            ch.evented = false;
          }
        });
      }

      obj.padding = 8;
      obj.hasControls = canEdit;

      // 🔑 Move rotate control handle to bottom for this object
      if (obj.controls && obj.controls.mtr) {
        obj.controls.mtr.y = 0.5;
        obj.controls.mtr.offsetY = 30; // 30px below bottom edge
        if (typeof obj.controls.mtr.withConnection !== "undefined") {
          obj.controls.mtr.withConnection = true;
        }
      }

      obj.selectable = canEdit;
      obj.evented = canEdit;
      obj.hoverCursor = canEdit ? (isLocked ? "not-allowed" : "move") : "default";

      // If locked, prevent all transforms but still allow selection
      obj.lockMovementX = !canEdit || isLocked;
      obj.lockMovementY = !canEdit || isLocked;
      obj.lockRotation = !canEdit || isLocked;
      obj.lockScalingX = !canEdit || isLocked;
      obj.lockScalingY = !canEdit || isLocked;

      // Visual hint for locked objects
      if (isLocked && canEdit) {
        obj.borderColor = "#f59e0b";
        obj.cornerColor = "#f59e0b";
        obj.hasControls = false;
      } else if (canEdit) {
        obj.borderColor = "#3b82f6";
        obj.cornerColor = "#3b82f6";
      }
    });

    if (!canEdit) canvas.discardActiveObject();
    canvas.requestRenderAll();
  };

  const applyReadonly = (canvas: any) => {
    canvas.selection = false;
    canvas.skipTargetFind = true;
    canvas.forEachObject((obj: any) => {
      obj.selectable = false;
      obj.evented = false;
      obj.hoverCursor = "default";
      // keep these stable
      if (obj?.data?.category === "bubble_text" && obj?.type === "group") {
        obj.subTargetCheck = true;
        obj.interactive = true;
        (obj._objects ?? []).forEach((ch: any) => {
          if (!ch) return;
          // readonly: no typing
          ch.selectable = false;
          ch.evented = false;
        });
      }
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  };

  const clearCanvas = (c: any) => {
    c.getObjects().forEach((o: any) => c.remove(o));
    c.discardActiveObject();
    c.requestRenderAll();
  };

  const renderObjectsToSide = async (objects: CanvasObjectPayload[], side: "left" | "right") => {
    const c = getCanvasBySide(side);
    if (!c) return;

    const fabricModule = await import("fabric");
    const fabric: any = (fabricModule as any).fabric || (fabricModule as any).default || (fabricModule as any);

    isSyncingRef.current = true;

    // ── Step 1: Enliven all new objects FIRST (offscreen, no visual change yet) ──
    let enlivened: any[] = [];
    try {
      const util = fabric.util;
      enlivened = await util.enlivenObjects(objects as any[]);
    } catch (e) {
      console.error("Failed to enliven objects", e);
      isSyncingRef.current = false;
      return;
    }

    // ── Step 2: Prepare enlivened objects (set properties before adding) ──
    for (const obj of enlivened) {
      if (!obj) continue;
      const anyObj = obj as any;

      // force bubble_text group to be interactive after enliven
      if (anyObj?.data?.category === "bubble_text" && anyObj?.type === "group") {
        anyObj.subTargetCheck = true;
        anyObj.interactive = true;
        (anyObj._objects ?? []).forEach((ch: any) => {
          if (!ch) return;
          if (ch.type === "textbox" || ch.type === "i-text") {
            ch.selectable = true;
            ch.evented = true;
            ch.editable = true;
          } else {
            ch.selectable = false;
            ch.evented = false;
          }
        });
      }
    }

    // ── Step 3: Atomic swap — disable rendering, clear old, add new, render once ──
    const prevRenderOnAdd = c.renderOnAddRemove;
    c.renderOnAddRemove = false;

    // clear old objects
    c.discardActiveObject();
    const oldObjs = c.getObjects().slice(); // copy array
    for (const o of oldObjs) c.remove(o);

    // add new objects
    for (const obj of enlivened) {
      if (!obj) continue;
      c.add(obj);

      if ((obj as any).data?.category === "background") {
        if (typeof c.sendObjectToBack === "function") c.sendObjectToBack(obj);
        else if (typeof c.sendToBack === "function") c.sendToBack(obj);
      }
    }

    c.renderOnAddRemove = prevRenderOnAdd;

    // ── Step 4: Apply interactivity and render once ──
    if (side === editableSideRef.current) applyInteractivity(c, isMyTurnRef.current);
    else applyReadonly(c);

    c.requestRenderAll();
    isSyncingRef.current = false;
  };


  // Keyboard shortcuts (Delete, Undo, Redo)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (viewingHistorySpread) return; // Disable shortcuts during history preview
      if (isTypingInInput()) return;

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        performUndo();
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        performRedo();
        return;
      }

      
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

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();

        const c = getCanvasBySide(editableSideRef.current);
        if (!c) return;

        deleteSelectedFromCanvas({
          canvas: c,
          isMyTurn,
          onAfterChange: () => {
            (c as any)._sendUpdate?.();
            saveHistoryState(c);
          },
        });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMyTurn, performUndo, performRedo, saveHistoryState, viewingHistorySpread]);

  // socket listeners
  useEffect(() => {
    const s = socket;

    const handleConnect = () => {
      setMySocketId(s.id ?? null);
      console.log("[CLIENT] editor connected with id", s.id);
    };

    if (s.connected) handleConnect();
    else s.on("connect", handleConnect);

    const emitAsync = <T,>(event: string, payload: any) =>
      new Promise<T>((resolve) => s.emit(event, payload, (resp: T) => resolve(resp)));

    const syncViewFromServer = async () => {
      const allResp: any = await emitAsync("panel:getAll", { roomId });
      if (!allResp?.ok) return;

      const list: Panel[] = (allResp.panels ?? []).map((p: any, idx: number) => ({
        index: idx,
        objects: p.objects ?? [],
      }));
      setPanels(list);

      const curResp: any = await emitAsync("panel:getCurrent", { roomId });
      if (!curResp?.ok) return;

      const turnNumber = typeof curResp.turnNumber === "number" ? curResp.turnNumber : 0;
      setCurrentTurnNumber(turnNumber);

      const side: "left" | "right" = turnNumber % 2 === 0 ? "left" : "right";
      setEditableSide(side);
      editableSideRef.current = side;

      if (side === "left") {
        await renderObjectsToSide(curResp.objects ?? [], "left");
        await renderObjectsToSide([], "right");
      } else {
        const last = list.length > 0 ? list[list.length - 1] : null;
        await renderObjectsToSide(last?.objects ?? [], "left");
        await renderObjectsToSide(curResp.objects ?? [], "right");
      }
    };

    // Export syncViewFromServer for use outside useEffect by storing it in a ref or just relying on the fact that handleTurnChanged calls it.
    // Actually we can redefine it outside or use a stable reference if we need to call it manually. Let's assign it to a ref.
    syncViewFromServerRef.current = syncViewFromServer;

    const handleTurnChanged = (snapshot: any) => {
      setCurrentTurnUserId(snapshot.currentTurnUserId ?? null);

      const nameFromCurrentUser =
        snapshot.currentUser && typeof snapshot.currentUser.username === "string"
          ? snapshot.currentUser.username
          : undefined;

      // Find username from the users array if not provided directly
      let name: string | null = nameFromCurrentUser ?? null;
      if (!name) {
        if (typeof snapshot.currentTurnUsername === "string") {
          name = snapshot.currentTurnUsername;
        } else if (Array.isArray(snapshot.users) && snapshot.currentTurnUserId) {
          const u = snapshot.users.find((x: any) => x.sid === snapshot.currentTurnUserId);
          if (u && u.username) name = u.username;
        }
      }

      setCurrentTurnUsername(name);

      if (snapshot.settings && snapshot.settings.bookTitle) {
        setBookTitle(snapshot.settings.bookTitle);
      }

      // 🔑 Reset undo/redo stacks on every turn change so history is scoped to the current panel only
      undoStackRef.current = [];
      redoStackRef.current = [];

      syncViewFromServer();
    };

    const handleScoreUpdate = (payload: any) => {
      setLeaderboard(payload?.leaderboard ?? []);
      syncViewFromServer();
    };

    const handleRejected = (payload: any) => {
      console.warn("[CLIENT] canvas:update REJECTED", payload);
    };

    const handleRemoteCanvasUpdate = async ({ objects }: { objects: any[] }) => {
      console.log("[CLIENT] received canvas:update from remote player, objects:", objects?.length);
      if (viewingHistorySpreadRef.current) return;
      const side = editableSideRef.current;
      await renderObjectsToSide(objects ?? [], side);
    };

    const handleRemoteTransform = ({ objectId, transform }: { objectId: string; transform: any }) => {
      if (viewingHistorySpreadRef.current) return;
      const side = editableSideRef.current;
      const c = getCanvasBySide(side);
      if (!c) return;

      const target = c.getObjects().find((o: any) => {
        const id = o?.data?.id ?? o?.id;
        return id && id === objectId;
      });
      if (!target) return;

      target.set({
        left: transform.left,
        top: transform.top,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
        angle: transform.angle,
        flipX: transform.flipX,
        flipY: transform.flipY,
      });
      target.setCoords();
      c.requestRenderAll();
    };

    const handleTimer = ({ durationSec }: { durationSec: number }) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (durationSec > 0) {
        setTimeLeft(durationSec);
        timerRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev === null || prev <= 1) {
              if (timerRef.current) clearInterval(timerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setTimeLeft(null); // Unlimited
      }
    };

    const handleRoomFinished = ({ bookId }: { bookId: string }) => {
      alert("🎉 Room selesai! Buku kolaborasi telah berhasil disimpan. Anda akan dialihkan ke buku...");
      router.replace(`/book/${bookId}`);
    };

    s.on("turn:changed", handleTurnChanged);
    s.on("score:update", handleScoreUpdate);
    s.on("turn:timeout_score", async (payload: any) => {
      await import("@/components/DialogProvider").then(m => m.useDialog).then(() => {
           console.log("Timeout score", payload);
      });
      showAlert(`Waktu Habis! Panel disimpan.\nSkor kamu turn ini: +${payload.score}\nTotal skormu sekarang: ${payload.totalScore}`);
      setCurrentPageSfx(null);
      setCurrentPageBgm(null);
    });
    s.on("canvas:update:rejected", handleRejected);
    s.on("canvas:update", handleRemoteCanvasUpdate);
    s.on("canvas:transform", handleRemoteTransform);
    s.on("turn:timer", handleTimer);
    s.on("room:finished", handleRoomFinished);

    s.emit("turn:get", { roomId }, (resp: any) => {
      if (resp?.ok && resp.snapshot) handleTurnChanged(resp.snapshot);
      else syncViewFromServer();
    });

    return () => {
      s.off("connect", handleConnect);
      s.off("turn:changed", handleTurnChanged);
      s.off("score:update", handleScoreUpdate);
      s.off("canvas:update:rejected", handleRejected);
      s.off("canvas:update", handleRemoteCanvasUpdate);
      s.off("canvas:transform", handleRemoteTransform);
      s.off("turn:timer", handleTimer);
      s.off("room:finished", handleRoomFinished);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [socket, roomId]);

  // keep interactivity updated when turn changes or history view changes
  useEffect(() => {
    const left = leftCanvasRef.current;
    const right = rightCanvasRef.current;
    if (!left || !right) return;

    if (viewingHistorySpread) {
      applyReadonly(left);
      applyReadonly(right);
      return;
    }

    // Normal active turn logic
    const side = editableSideRef.current;
    const editable = side === "left" ? left : right;
    const other = side === "left" ? right : left;

    applyInteractivity(editable, isMyTurn);
    applyReadonly(other);
  }, [isMyTurn, editableSide, currentTurnUserId, mySocketId, viewingHistorySpread]);

  // init canvases
  useEffect(() => {
    let isMounted = true;

    (async () => {
      const fabricModule = await import("fabric");
      const fabric: any = (fabricModule as any).fabric || (fabricModule as any).default || (fabricModule as any);

      if (!isMounted) return;

      if (!leftCanvasRef.current || !rightCanvasRef.current) {
        const leftEl = document.getElementById("left-canvas") as HTMLCanvasElement | null;
        const rightEl = document.getElementById("right-canvas") as HTMLCanvasElement | null;
        if (!leftEl || !rightEl) return;

        const bindToWrapper = (canvas: any, wrapper: HTMLDivElement) => {
          const applySize = () => {
            const w = wrapper.clientWidth;
            const h = wrapper.clientHeight;

            // 🔑 FIX: logical width/height stays fixed at 520x390.
            // Only change the CSS display size and the canvas zoom.
            const scale = w / 520;
            canvas.setDimensions({ width: "100%", height: "100%" }, { cssOnly: true });
            canvas.setZoom(scale);

            // Optional: resize background specifically if needed, but if it was added at 520x390 it will scale automatically with zoom.
            canvas.requestRenderAll();
          };

          applySize();
          const ro = new ResizeObserver(() => applySize());
          ro.observe(wrapper);
          return () => ro.disconnect();
        };

        // Base logical dimensions 520x390
        const left = new fabric.Canvas(leftEl, { backgroundColor: "#ffffff", width: 520, height: 390, preserveObjectStacking: true });
        const right = new fabric.Canvas(rightEl, { backgroundColor: "#ffffff", width: 520, height: 390, preserveObjectStacking: true });

        // ✅ double click to edit bubble_text textbox (even when object is group)
        const bindBubbleTextEditing = (c: any) => {
          c.on("mouse:dblclick", (opt: any) => {
            if (!isMyTurnRef.current) return;

            // try subTargets first
            let target =
              opt?.subTargets?.find((o: any) => o?.type === "textbox" || o?.type === "i-text") ??
              opt?.target;

            // if group bubble_text, pick child textbox
            if (target?.type === "group" && target?.data?.category === "bubble_text") {
              const child = (target._objects ?? []).find(
                (o: any) => o?.type === "textbox" || o?.type === "i-text"
              );
              if (child) target = child;
            }

            if (target?.type === "textbox" || target?.type === "i-text") {
              c.setActiveObject(target);
              target.enterEditing?.();
              target.selectAll?.();
              c.requestRenderAll();
            }
          });
        };

        bindBubbleTextEditing(left);
        bindBubbleTextEditing(right);

        const cleanupLeft = leftWrapRef.current ? bindToWrapper(left, leftWrapRef.current) : null;
        const cleanupRight = rightWrapRef.current ? bindToWrapper(right, rightWrapRef.current) : null;

        (left as any)._cleanupResize = cleanupLeft;
        (right as any)._cleanupResize = cleanupRight;

        leftCanvasRef.current = left;
        rightCanvasRef.current = right;

        applyReadonly(left);
        applyReadonly(right);

        // ── Debounced sendUpdate (150ms) to avoid flooding the network ──
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const sendUpdate = () => {
          if (isSyncingRef.current) return;
          if (!isMyTurnRef.current) return;

          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            const side = editableSideRef.current;
            const c = getCanvasBySide(side);
            if (!c) return;

            const objects = c.getObjects().map((obj: any) => {
              const json = obj.toObject() as any;
              json.data = obj.data;
              return json;
            });

            socket.emit("canvas:update", { roomId, objects });
            console.log("[CLIENT] sent canvas:update, objects:", objects.length);
          }, 150);
        };

        (left as any)._sendUpdate = sendUpdate;
        (right as any)._sendUpdate = sendUpdate;

        left.on("object:modified", sendUpdate);
        right.on("object:modified", sendUpdate);
        left.on("object:added", sendUpdate);
        right.on("object:added", sendUpdate);
        left.on("object:removed", sendUpdate);
        right.on("object:removed", sendUpdate);

        // ── Live transform: send lightweight position data during dragging ──
        let transformThrottleTimer: ReturnType<typeof setTimeout> | null = null;
        const sendTransform = (e: any) => {
          if (isSyncingRef.current) return;
          if (!isMyTurnRef.current) return;
          const obj = e?.target;
          if (!obj) return;
          const objectId = obj?.data?.id ?? obj?.id;
          if (!objectId) return;

          // Throttle to ~33ms (~30fps)
          if (transformThrottleTimer) return;
          transformThrottleTimer = setTimeout(() => { transformThrottleTimer = null; }, 33);

          socket.emit("canvas:transform", {
            roomId,
            objectId,
            transform: {
              left: obj.left,
              top: obj.top,
              scaleX: obj.scaleX,
              scaleY: obj.scaleY,
              angle: obj.angle,
              flipX: obj.flipX,
              flipY: obj.flipY,
            },
          });
        };

        left.on("object:moving", sendTransform);
        left.on("object:scaling", sendTransform);
        left.on("object:rotating", sendTransform);
        right.on("object:moving", sendTransform);
        right.on("object:scaling", sendTransform);
        right.on("object:rotating", sendTransform);

        (left as any)._sendTransform = sendTransform;
        (right as any)._sendTransform = sendTransform;

        // ── Undo/Redo: save state on modification ──
        const saveStateThrottledLeft = () => {
          if (isSyncingRef.current || !isMyTurnRef.current || isUndoRedoRef.current) return;
          saveHistoryState(left);
        };
        const saveStateThrottledRight = () => {
          if (isSyncingRef.current || !isMyTurnRef.current || isUndoRedoRef.current) return;
          saveHistoryState(right);
        };

        left.on("object:modified", saveStateThrottledLeft);
        right.on("object:modified", saveStateThrottledRight);
        left.on("object:added", saveStateThrottledLeft);
        right.on("object:added", saveStateThrottledRight);
        left.on("object:removed", saveStateThrottledLeft);
        right.on("object:removed", saveStateThrottledRight);

        (left as any)._saveStateThrottled = saveStateThrottledLeft;
        (right as any)._saveStateThrottled = saveStateThrottledRight;

        // Ensure initial state is captured after init
        setTimeout(() => {
          if (isMyTurnRef.current && undoStackRef.current.length === 0) {
            saveHistoryState(left);
          }
        }, 500);

        // ── Floating toolbar: track selection events ──
        const onSelectLeft = () => updateToolbarPosition(left, "left");
        const onSelectRight = () => updateToolbarPosition(right, "right");
        const onDeselectLeft = () => setFloatingToolbar(prev => ({ ...prev, visible: false }));
        const onDeselectRight = () => setFloatingToolbar(prev => ({ ...prev, visible: false }));
        const onMovingLeft = () => updateToolbarPosition(left, "left");
        const onMovingRight = () => updateToolbarPosition(right, "right");

        left.on("selection:created", onSelectLeft);
        left.on("selection:updated", onSelectLeft);
        left.on("selection:cleared", onDeselectLeft);
        left.on("object:moving", onMovingLeft);
        left.on("object:scaling", onMovingLeft);
        left.on("object:rotating", onMovingLeft);

        right.on("selection:created", onSelectRight);
        right.on("selection:updated", onSelectRight);
        right.on("selection:cleared", onDeselectRight);
        right.on("object:moving", onMovingRight);
        right.on("object:scaling", onMovingRight);
        right.on("object:rotating", onMovingRight);

        (left as any)._onSelect = onSelectLeft;
        (left as any)._onDeselect = onDeselectLeft;
        (left as any)._onMoving = onMovingLeft;
        (right as any)._onSelect = onSelectRight;
        (right as any)._onDeselect = onDeselectRight;
        (right as any)._onMoving = onMovingRight;

        // canvas:update listener is now in the socket useEffect above
        // (no need to register it here)
      }
    })();

    return () => {
      isMounted = false;

      const left = leftCanvasRef.current;
      if (left) {
        const anyL = left as any;
        if (anyL._sendUpdate) {
          left.off("object:modified", anyL._sendUpdate);
          left.off("object:added", anyL._sendUpdate);
          left.off("object:removed", anyL._sendUpdate);
        }
        if (anyL._sendTransform) {
          left.off("object:moving", anyL._sendTransform);
          left.off("object:scaling", anyL._sendTransform);
          left.off("object:rotating", anyL._sendTransform);
        }
        if (anyL._onSelect) {
          left.off("selection:created", anyL._onSelect);
          left.off("selection:updated", anyL._onSelect);
        }
        if (anyL._onDeselect) left.off("selection:cleared", anyL._onDeselect);
        if (anyL._onMoving) {
          left.off("object:moving", anyL._onMoving);
          left.off("object:scaling", anyL._onMoving);
          left.off("object:rotating", anyL._onMoving);
        }
        if (anyL._saveStateThrottled) {
          left.off("object:modified", anyL._saveStateThrottled);
          left.off("object:added", anyL._saveStateThrottled);
          left.off("object:removed", anyL._saveStateThrottled);
        }
        if (anyL._cleanupResize) anyL._cleanupResize();
        left.dispose();
        leftCanvasRef.current = null;
      }

      const right = rightCanvasRef.current;
      if (right) {
        const anyR = right as any;
        if (anyR._sendUpdate) {
          right.off("object:modified", anyR._sendUpdate);
          right.off("object:added", anyR._sendUpdate);
          right.off("object:removed", anyR._sendUpdate);
        }
        if (anyR._sendTransform) {
          right.off("object:moving", anyR._sendTransform);
          right.off("object:scaling", anyR._sendTransform);
          right.off("object:rotating", anyR._sendTransform);
        }
        if (anyR._onSelect) {
          right.off("selection:created", anyR._onSelect);
          right.off("selection:updated", anyR._onSelect);
        }
        if (anyR._onDeselect) right.off("selection:cleared", anyR._onDeselect);
        if (anyR._onMoving) {
          right.off("object:moving", anyR._onMoving);
          right.off("object:scaling", anyR._onMoving);
          right.off("object:rotating", anyR._onMoving);
        }
        if (anyR._saveStateThrottled) {
          right.off("object:modified", anyR._saveStateThrottled);
          right.off("object:added", anyR._saveStateThrottled);
          right.off("object:removed", anyR._saveStateThrottled);
        }
        if (anyR._cleanupResize) anyR._cleanupResize();
        right.dispose();
        rightCanvasRef.current = null;
      }
    };
  }, [roomId, socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSkip = async () => {
    if (!isMyTurn) { await showAlert("Sabar ya, ini bukan giliran kamu 🙂"); return; }
    socket.emit("turn:skip", { roomId }, async (resp: any) => {
      if (!resp?.ok) await showAlert(`Gagal melewati giliran: ${resp?.error ?? "UNKNOWN"}`);
    });
  };

  const handleDone = async () => {
    const c = getCanvasBySide(editableSideRef.current);
    if (!c) return;

    if (!isMyTurn) { await showAlert("Sabar ya, ini bukan giliran kamu 🙂"); return; }

    playDoneSfx(); // Play SFX on manual finish

    const objects: CanvasObjectPayload[] = c.getObjects().map((obj: any) => {
      const json = obj.toObject() as any;
      json.data = obj.data;
      return json;
    });

    socket.emit(
      "canvas:save", 
      { 
        roomId, 
        objects, 
        bgmSrc: currentPageBgmRef.current?.src || null,
        audioSrc: currentPageSfxRef.current?.src || null 
      }, 
      async (resp: any) => {
        if (!resp?.ok) { await showAlert("Yah! Gagal menyimpan panel! Coba lagi ya."); return; }

        // Reset turn state after save
        setCurrentPageSfx(null);
        setCurrentPageBgm(null);

        socket.emit("turn:finish", { roomId }, async (resp2: any) => {
          if (!resp2?.ok) await showAlert(`Gagal mengakhiri giliran: ${resp2?.error ?? "UNKNOWN"}`);
        });
      }
    );
  };

  // Helper to switch views
  const syncViewFromServerRef = useRef<() => Promise<void>>(async () => {});
  
  const handleSelectSpread = async (indices: number[]) => {
    setFloatingToolbar((prev) => ({ ...prev, visible: false })); // Hide toolbar
    if (indices.includes(currentTurnNumber)) {
      setViewingHistorySpread(null);
      await syncViewFromServerRef.current();
    } else {
      setViewingHistorySpread(indices);
      await renderObjectsToSide(panels[indices[0]]?.objects ?? [], "left");
      if (indices.length > 1) {
        await renderObjectsToSide(panels[indices[1]]?.objects ?? [], "right");
      } else {
        await renderObjectsToSide([], "right");
      }
      
      const leftCtx = getCanvasBySide("left");
      const rightCtx = getCanvasBySide("right");
      if (leftCtx) applyReadonly(leftCtx);
      if (rightCtx) applyReadonly(rightCtx);
    }
  };

  let turnStatus: ReactNode;
  if (!currentTurnUserId) {
    turnStatus = <span className="text-sky-400 font-bold animate-pulse">Menyiapkan meja gambar... ✨</span>;
  } else if (isMyTurn) {
    turnStatus = (
      <span className="text-emerald-500 font-black flex items-center gap-2">
        <span>🎨</span> GILIRAN KAMU! 
        {timeLeft !== null && timeLeft > 0 && (
          <span className="ml-2 text-rose-600 bg-rose-100 px-3 py-1 rounded-full text-xs font-black border-2 border-rose-200">
            ⏳ {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")} left
          </span>
        )}
      </span>
    );
  } else {
    const label =
      currentTurnUsername ?? (currentTurnUserId ? currentTurnUserId.slice(0, 4) : "other player");
    turnStatus = (
      <span className="text-slate-500 font-bold flex items-center gap-2">
        <span>👀</span> <span className="hidden sm:inline">Menunggu</span> <span className="text-sky-600 font-black uppercase bg-sky-100 px-2 py-0.5 rounded-md border border-sky-200">{label}</span>
        {timeLeft !== null && timeLeft > 0 && (
          <span className="ml-2 text-amber-500 bg-amber-50 px-3 py-1 rounded-full text-xs font-black border-2 border-amber-200">
            ⏳ {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
          </span>
        )}
      </span>
    );
  }

  return (
    <main className="w-full min-h-screen bg-sky-50 font-nunito flex flex-col relative overflow-hidden">
      {/* Decorative BG */}
      <div className="absolute -top-20 -right-20 text-[10rem] opacity-20 rotate-12 pointer-events-none z-0">☁️</div>

      {/* HEADER */}
      <header className="bg-white px-6 py-4 shadow-[0_4px_0_rgb(224,242,254)] border-b-4 border-sky-200 z-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl bg-sky-100 p-2 rounded-full border-2 border-sky-300">🦊</span>
          <div>
            <h1 className="text-2xl font-black text-sky-600 drop-shadow-sm leading-none">{bookTitle || "Ruang Karya"}</h1>
            <p className="font-bold text-slate-400 text-xs mt-1 uppercase tracking-widest">KODE: {roomId}</p>
          </div>
        </div>
        
        <div className="bg-white border-4 border-slate-100 px-5 py-2 rounded-2xl shadow-sm text-sm sm:text-base flex-1 md:flex-none flex items-center justify-center">
          {turnStatus}
        </div>
      </header>

      {/* MAIN PLAY AREA */}
      <div className="flex flex-col xl:flex-row gap-6 p-4 md:p-6 flex-1 w-full max-w-[1600px] mx-auto z-10">

      <div className="flex flex-col xl:flex-row gap-6 w-full">
        {/* LEFT SIDEBAR (LEADERBOARD & ASSET LIBRARY) */}
        <div className="flex flex-col gap-6 w-full xl:w-72 shrink-0">
          
          {/* Active Turn Audio Status */}
          {isMyTurn && (
            <div className="bg-white p-4 rounded-3xl border-4 border-slate-100 shadow-[0_8px_0_rgba(241,245,249)]">
              <div className="text-sm font-black mb-3 text-emerald-500 uppercase tracking-widest flex items-center gap-2 border-b-2 border-emerald-50 pb-2">
                <span>📻</span> Giliranmu
              </div>
              
              <div className="flex flex-col gap-2">
                {currentPageBgm ? (
                  <div className="bg-purple-50 border-2 border-purple-200 text-purple-600 px-3 py-2 rounded-2xl flex items-center justify-between text-xs font-bold shadow-sm group">
                    <span className="truncate flex-1">🎵 {currentPageBgm.name}</span>
                    <button onClick={() => setCurrentPageBgm(null)} className="ml-1 shrink-0 bg-white text-purple-400 group-hover:bg-purple-400 group-hover:text-white rounded-full w-5 h-5 flex items-center justify-center font-black transition-colors" title="Hapus BGM">✕</button>
                  </div>
                ) : (
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 text-slate-400 px-3 py-2 rounded-2xl text-[10px] font-bold shadow-inner">
                    🎵 Meneruskan BGM
                  </div>
                )}

                {currentPageSfx ? (
                  <div className="bg-blue-50 border-2 border-blue-200 text-blue-600 px-3 py-2 rounded-2xl flex items-center justify-between text-xs font-bold shadow-sm group">
                    <span className="truncate flex-1">🔊 {currentPageSfx.name}</span>
                    <button onClick={() => setCurrentPageSfx(null)} className="ml-1 shrink-0 bg-white text-blue-400 group-hover:bg-blue-400 group-hover:text-white rounded-full w-5 h-5 flex items-center justify-center font-black transition-colors" title="Hapus SFX">✕</button>
                  </div>
                ) : (
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 text-slate-400 px-3 py-2 rounded-2xl text-[10px] font-bold shadow-inner">
                    🔊 Tidak Ada Efek Suara
                  </div>
                )}
              </div>
            </div>
          )}

          {/* LEADERBOARD CARD */}
          <div className="bg-white p-5 rounded-3xl border-4 border-slate-100 shadow-[0_8px_0_rgba(241,245,249)]">
            <div className="text-sm font-black mb-4 text-sky-500 uppercase tracking-widest flex items-center gap-2 border-b-2 border-sky-50 pb-3">
              <span>🏆</span> Papan Peringkat
            </div>
            {leaderboard.length === 0 ? (
              <div className="text-slate-400 text-sm text-center italic font-bold my-4 bg-slate-50 py-3 rounded-2xl border-2 border-dashed border-slate-200">Belum ada skor 😢</div>
            ) : (
              <div className="flex flex-col gap-3">
                {leaderboard.map((p, idx) => (
                  <div key={p.sid} className="flex items-center justify-between bg-yellow-50 px-4 py-3 rounded-2xl border-2 border-yellow-100 cursor-default hover:bg-yellow-100 transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="font-black text-yellow-500 w-5 flex-shrink-0">{idx+1}.</span>
                      <span className="font-bold text-slate-700 truncate text-sm">
                        {p.username || p.sid.slice(0, 4)} {p.sid === mySocketId && <span className="text-[10px] bg-sky-200 text-sky-800 px-1.5 py-0.5 rounded-md ml-1 inline-block align-middle transform -translate-y-0.5 uppercase tracking-wider font-black">(Kamu)</span>}
                      </span>
                    </div>
                    <span className="font-black text-yellow-600 bg-yellow-200 px-3 py-1 rounded-xl text-sm ml-2 shadow-inner border border-yellow-300">{p.total}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ASSET LIBRARY CARD */}
          <div className="bg-white p-5 rounded-3xl border-4 border-slate-100 shadow-[0_8px_0_rgba(241,245,249)] flex-1 flex flex-col max-h-[700px]">
            <div className="text-sm font-black mb-4 text-sky-500 uppercase tracking-widest flex items-center gap-2 border-b-2 border-sky-50 pb-3 shrink-0">
              <span>📦</span> Stiker & Audio
            </div>

            <div className="flex-1 overflow-hidden" style={{ minHeight: "400px" }}>
              <AssetLibrary
                onPick={async (category, index) => {
                  if (viewingHistorySpread) { await showAlert("Ngintip buku dulu ya! Tutup layarnya di area bawah untuk nambahin karakter! 👀"); return; }
                  const c = getCanvasBySide(editableSideRef.current);
                  if (!c) return;

                  if (!isMyTurnRef.current) { await showAlert("Sabar ya, ini bukan giliran kamu 🙂"); return; }

                  const asset = (ASSET_REGISTRY as any)[category]?.[index];
                  if (!asset) return;

                  await addAssetToCanvas({
                    canvas: c,
                    asset,
                    canEdit: isMyTurnRef.current,
                  });

                  applyInteractivity(c, isMyTurnRef.current);
                  c.requestRenderAll();
                  (c as any)._sendUpdate?.();
                }}
                onPickAudio={async (category, assetId, src) => {
                  if (viewingHistorySpread) { await showAlert("Ngintip buku dulu ya! 👀"); return; }
                  if (!isMyTurnRef.current) { await showAlert("Sabar ya, ini bukan giliran kamu 🙂"); return; }

                  const name = assetId.replace(/^(bgm|sfx)-/, '').replace(/-/g, ' ');
                  if (category === "bgm") {
                    setCurrentPageBgm({ id: assetId, src, name });
                  } else {
                    setCurrentPageSfx({ id: assetId, src, name });
                  }
                }}
                onUpload={async (file) => {
                  if (viewingHistorySpread) { await showAlert("Ngintip buku dulu ya! 👀"); return; }
                  const c = getCanvasBySide(editableSideRef.current);
                  if (!c) return;

                  if (!isMyTurnRef.current) { await showAlert("Sabar ya, ini bukan giliran kamu 🙂"); return; }

                  try {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                      const dataUrl = e.target?.result as string;
                      if (!dataUrl) return;

                      const base64Asset = {
                        id: `custom-${Date.now()}`,
                        name: file.name,
                        src: dataUrl,
                        category: "property" as const, // Treat custom images as movable properties
                        defaultScale: 0.5,
                      };

                      await addAssetToCanvas({
                        canvas: c,
                        asset: base64Asset,
                        canEdit: isMyTurnRef.current,
                      });

                      applyInteractivity(c, isMyTurnRef.current);
                      c.requestRenderAll();
                      (c as any)._sendUpdate?.();
                    };
                    reader.readAsDataURL(file);
                  } catch (err) {
                    console.error("Upload error:", err);
                    await showAlert("Yah! Gagal Mengunggah Gambar... Coba Lagi Ya!");
                  }
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div ref={spreadWrapRef} className="w-full">
            <div className="flex flex-wrap items-start justify-center" style={{ gap: SPREAD_GAP }}>
              <div style={{ position: "relative" }}>
                <div className={`text-sm font-medium mb-2 ${editableSide === "left" && isMyTurn ? "text-purple-600" : ""}`}>
                  Left Page {viewingHistorySpread && <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-100 px-2 py-0.5 rounded">History Preview</span>}
                </div>

                <div
                  ref={leftWrapRef}
                  style={{ width: pageSize.w * canvasScale, height: pageSize.h * canvasScale, position: "relative" }}
                  className={`border rounded overflow-visible ${editableSide === "left" && !viewingHistorySpread ? "ring-4 ring-purple-600 border-transparent bg-white shadow-lg" : "bg-white"}`}
                >
                  <div style={{ transform: `scale(${canvasScale})`, transformOrigin: "top left", width: pageSize.w, height: pageSize.h }}><canvas id="left-canvas" /></div>
                  {/* Floating toolbar for left canvas */}
                  {floatingToolbar.visible && floatingToolbar.side === "left" && isMyTurn && (
                    <FloatingToolbar
                      x={floatingToolbar.x}
                      y={floatingToolbar.y}
                      isLocked={!!(leftCanvasRef.current?.getActiveObject?.()?.data?.locked)}
                      isText={floatingToolbar.isText}
                      textProps={floatingToolbar.textProps}
                      onTextPropChange={(key, value) => {
                        const c = leftCanvasRef.current;
                        if (!c) return;
                        const obj = c.getActiveObject();
                        if (!obj) return;
                        if (obj.type === "textbox" || obj.type === "i-text" || obj.type === "text") {
                          obj.set(key, value);
                          c.requestRenderAll();
                          (c as any)._sendUpdate?.();
                          saveHistoryState(c);
                          updateToolbarPosition(c, "left");
                        }
                      }}
                      onRotateLeft={() => {
                        const c = leftCanvasRef.current;
                        if (c) { rotateSelected(c, -90, () => (c as any)._sendUpdate?.()); updateToolbarPosition(c, "left"); }
                      }}
                      onRotateRight={() => {
                        const c = leftCanvasRef.current;
                        if (c) { rotateSelected(c, 90, () => (c as any)._sendUpdate?.()); updateToolbarPosition(c, "left"); }
                      }}
                      onFlipH={() => {
                        const c = leftCanvasRef.current;
                        if (c) flipSelected(c, "x", () => (c as any)._sendUpdate?.());
                      }}
                      onFlipV={() => {
                        const c = leftCanvasRef.current;
                        if (c) flipSelected(c, "y", () => (c as any)._sendUpdate?.());
                      }}
                      onLayerUp={() => {
                        const c = leftCanvasRef.current;
                        if (c) bringForwardSelected(c, () => (c as any)._sendUpdate?.());
                      }}
                      onLayerDown={() => {
                        const c = leftCanvasRef.current;
                        if (c) sendBackwardsSelected(c, () => (c as any)._sendUpdate?.());
                      }}
                      onLockToggle={() => {
                        const c = leftCanvasRef.current;
                        if (!c) return;
                        const obj = c.getActiveObject();
                        if (!obj) return;
                        const newLocked = !(obj as any).data?.locked;
                        if (!(obj as any).data) (obj as any).data = {};
                        (obj as any).data.locked = newLocked;
                        applyInteractivity(c, isMyTurnRef.current);
                        c.setActiveObject(obj);
                        c.requestRenderAll();
                        (c as any)._sendUpdate?.();
                      }}
                      onDelete={() => {
                        const c = leftCanvasRef.current;
                        if (c) {
                          deleteSelectedFromCanvas({ canvas: c, isMyTurn, onAfterChange: () => (c as any)._sendUpdate?.() });
                          setFloatingToolbar(prev => ({ ...prev, visible: false }));
                        }
                      }}
                    />
                  )}
                </div>
              </div>

              <div style={{ position: "relative", opacity: (!viewingHistorySpread && currentTurnNumber % 2 === 0) ? 0.3 : 1 }}>
                <div className={`text-sm font-medium mb-2 ${editableSide === "right" && isMyTurn && !viewingHistorySpread ? "text-purple-600" : ""}`}>
                  Right Page {viewingHistorySpread && <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-100 px-2 py-0.5 rounded">History Preview</span>}
                </div>

                <div
                  ref={rightWrapRef}
                  style={{ width: pageSize.w * canvasScale, height: pageSize.h * canvasScale, position: "relative" }}
                  className={`border rounded overflow-visible ${editableSide === "right" && !viewingHistorySpread ? "ring-4 ring-purple-600 border-transparent bg-white shadow-lg" : "bg-white"}`}
                >
                  <div style={{ transform: `scale(${canvasScale})`, transformOrigin: "top left", width: pageSize.w, height: pageSize.h }}><canvas id="right-canvas" /></div>
                  {/* Floating toolbar for right canvas */}
                  {floatingToolbar.visible && floatingToolbar.side === "right" && isMyTurn && (
                    <FloatingToolbar
                      x={floatingToolbar.x}
                      y={floatingToolbar.y}
                      isLocked={!!(rightCanvasRef.current?.getActiveObject?.()?.data?.locked)}
                      isText={floatingToolbar.isText}
                      textProps={floatingToolbar.textProps}
                      onTextPropChange={(key, value) => {
                        const c = rightCanvasRef.current;
                        if (!c) return;
                        const obj = c.getActiveObject();
                        if (!obj) return;
                        if (obj.type === "textbox" || obj.type === "i-text" || obj.type === "text") {
                          obj.set(key, value);
                          c.requestRenderAll();
                          (c as any)._sendUpdate?.();
                          saveHistoryState(c);
                          updateToolbarPosition(c, "right");
                        }
                      }}
                      onRotateLeft={() => {
                        const c = rightCanvasRef.current;
                        if (c) { rotateSelected(c, -90, () => (c as any)._sendUpdate?.()); updateToolbarPosition(c, "right"); }
                      }}
                      onRotateRight={() => {
                        const c = rightCanvasRef.current;
                        if (c) { rotateSelected(c, 90, () => (c as any)._sendUpdate?.()); updateToolbarPosition(c, "right"); }
                      }}
                      onFlipH={() => {
                        const c = rightCanvasRef.current;
                        if (c) flipSelected(c, "x", () => (c as any)._sendUpdate?.());
                      }}
                      onFlipV={() => {
                        const c = rightCanvasRef.current;
                        if (c) flipSelected(c, "y", () => (c as any)._sendUpdate?.());
                      }}
                      onLayerUp={() => {
                        const c = rightCanvasRef.current;
                        if (c) bringForwardSelected(c, () => (c as any)._sendUpdate?.());
                      }}
                      onLayerDown={() => {
                        const c = rightCanvasRef.current;
                        if (c) sendBackwardsSelected(c, () => (c as any)._sendUpdate?.());
                      }}
                      onLockToggle={() => {
                        const c = rightCanvasRef.current;
                        if (!c) return;
                        const obj = c.getActiveObject();
                        if (!obj) return;
                        const newLocked = !(obj as any).data?.locked;
                        if (!(obj as any).data) (obj as any).data = {};
                        (obj as any).data.locked = newLocked;
                        applyInteractivity(c, isMyTurnRef.current);
                        c.setActiveObject(obj);
                        c.requestRenderAll();
                        (c as any)._sendUpdate?.();
                      }}
                      onDelete={() => {
                        const c = rightCanvasRef.current;
                        if (c) {
                          deleteSelectedFromCanvas({ canvas: c, isMyTurn, onAfterChange: () => (c as any)._sendUpdate?.() });
                          setFloatingToolbar(prev => ({ ...prev, visible: false }));
                        }
                      }}
                    />
                  )}
                </div>

              </div>
            </div>

            <div className="mt-8 flex gap-3 flex-wrap items-center w-full px-4">
              <div className="flex bg-white rounded-2xl border-4 border-slate-100 overflow-hidden shadow-sm">
                <button
                  className="px-5 py-3 hover:bg-slate-50 transition-colors disabled:opacity-40 font-bold text-slate-500"
                  onClick={performUndo}
                  disabled={!isMyTurn}
                  title="Kembali ke sebelumnya (Ctrl+Z)"
                >
                  ↶ Urungkan
                </button>
                <div className="w-1 bg-slate-100" />
                <button
                  className="px-5 py-3 hover:bg-slate-50 transition-colors disabled:opacity-40 font-bold text-slate-500"
                  onClick={performRedo}
                  disabled={!isMyTurn}
                  title="Maju (Ctrl+Y)"
                >
                  ↷ Ulangi
                </button>
              </div>

              <button className="px-5 py-3 rounded-2xl bg-white border-4 border-slate-100 font-bold text-slate-500 hover:text-slate-700 hover:border-slate-200 transition-colors shadow-sm active:translate-y-1 active:shadow-none" onClick={() => router.push("/app")}>
                ← Balik ke Menu
              </button>

              <div className="flex-1" />

              <button 
                className={`px-5 py-3 rounded-2xl font-black text-white shadow-[0_4px_0_rgba(0,0,0,0.15)] active:translate-y-1 active:shadow-none transition-all ${isMyTurn ? "bg-rose-400 border-none hover:bg-rose-500 shadow-[0_4px_0_rgb(225,29,72)]" : "bg-slate-300 shadow-none opacity-50 cursor-not-allowed"}`} 
                onClick={handleSkip} 
                disabled={!isMyTurn}
              >
                ⏩ SKIP (Lewati!)
              </button>

              <button 
                className={`px-8 py-3 rounded-2xl font-black text-white shadow-[0_4px_0_rgba(0,0,0,0.15)] active:translate-y-1 active:shadow-none transition-all text-lg ${isMyTurn ? "bg-emerald-400 border-none shadow-[0_4px_0_rgb(4,120,87)] hover:bg-emerald-500" : "bg-slate-300 shadow-none opacity-50 cursor-not-allowed"}`} 
                onClick={handleDone} 
                disabled={!isMyTurn}
              >
                ✨ SELESAI
              </button>
            </div>
          </div>

          <div className="mt-8 bg-white border-4 border-slate-100 rounded-3xl p-6 shadow-sm">
            <div className="text-sm font-black mb-4 text-sky-500 uppercase tracking-widest flex items-center gap-2">
              <span>📖</span> Sejarah Karya Kalian (Preview)
            </div>

            {panels.length === 0 && currentTurnNumber === 0 ? (
              <div className="text-slate-400 text-sm italic py-4 text-center">Belum ada halaman yang tersimpan 🥲</div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                {Array.from({ length: Math.ceil((currentTurnNumber + 1) / 2) }).map((_, index) => {
                  const leftPanelIndex = index * 2;
                  const rightPanelIndex = index * 2 + 1;
                  
                  const isCurrentSpread = viewingHistorySpread !== null 
                    ? (viewingHistorySpread[0] === leftPanelIndex)
                    : (index === Math.floor(currentTurnNumber / 2));
                    
                  // Try to find background images for the thumbnails
                  const lBg = leftPanelIndex < panels.length ? panels[leftPanelIndex]?.objects.find((o: any) => o?.data?.category === "background")?.src : null;
                  const rBg = rightPanelIndex < panels.length ? panels[rightPanelIndex]?.objects.find((o: any) => o?.data?.category === "background")?.src : null;

                  return (
                    <button
                      key={index}
                      onClick={async () => {
                        const isCurrentActiveSpread = index === Math.floor(currentTurnNumber / 2);
                        
                        if (isCurrentActiveSpread || (viewingHistorySpread && viewingHistorySpread[0] === leftPanelIndex)) {
                          // Toggle off history view and return to drawing
                          setViewingHistorySpread(null);
                          if ((syncViewFromServerRef as any).current) (syncViewFromServerRef as any).current();
                        } else {
                          // View this past spread
                          setViewingHistorySpread([leftPanelIndex, rightPanelIndex]);
                          const lPanel = leftPanelIndex < panels.length ? panels[leftPanelIndex]?.objects ?? [] : [];
                          const rPanel = rightPanelIndex < panels.length ? panels[rightPanelIndex]?.objects ?? [] : [];
                          
                          await renderObjectsToSide(lPanel, "left");
                          await renderObjectsToSide(rPanel, "right");
                        }
                      }}
                      className={`flex flex-col items-center gap-2 min-w-[120px] transition-all shrink-0 group ${isCurrentSpread ? "scale-105" : "hover:scale-105"}`}
                    >
                      {/* Mini Two-Page Thumbnail */}
                      <div className={`w-32 h-24 p-1 rounded-2xl border-4 shadow-sm flex items-center justify-center transition-all overflow-hidden gap-1 ${isCurrentSpread ? "border-amber-400 bg-amber-100" : "border-slate-200 bg-slate-200 group-hover:border-sky-300 group-hover:bg-sky-100"}`}>
                        <div className="flex-1 h-full bg-white relative overflow-hidden rounded-l-lg border border-slate-100 flex items-center justify-center shadow-inner">
                          {lBg ? <img src={lBg} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="L" /> : <span className="text-2xl opacity-20 font-black text-slate-400">{leftPanelIndex + 1}</span>}
                        </div>
                        <div className="flex-1 h-full bg-white relative overflow-hidden rounded-r-lg border border-slate-100 flex items-center justify-center shadow-inner">
                          {rBg ? <img src={rBg} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="R" /> : <span className="text-2xl opacity-20 font-black text-slate-400">{rightPanelIndex + 1}</span>}
                        </div>
                      </div>
                      <div className={`text-xs font-black uppercase tracking-wider text-center ${isCurrentSpread ? "text-amber-500" : "text-slate-400 group-hover:text-sky-500"}`}>
                        Lembar {index + 1}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            
            {viewingHistorySpread && (
              <div className="mt-4 p-4 bg-amber-50 border-2 border-dashed border-amber-300 rounded-2xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
                  <span>👀</span> Kamu sedang melihat buku yang sudah jadi.
                </div>
                <button 
                  onClick={() => {
                    setViewingHistorySpread(null);
                    if ((syncViewFromServerRef as any).current) (syncViewFromServerRef as any).current();
                  }}
                  className="bg-amber-400 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-black transition-colors shadow-sm active:translate-y-1 active:shadow-none"
                >
                  Kembali Menggambar
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </main>
  );
}



// ── Floating Toolbar: appears above the selected object ──
function FloatingToolbar({
  x,
  y,
  isLocked,
  isText,
  textProps,
  onTextPropChange,
  onRotateLeft,
  onRotateRight,
  onFlipH,
  onFlipV,
  onLayerUp,
  onLayerDown,
  onLockToggle,
  onDelete,
}: {
  x: number;
  y: number;
  isLocked: boolean;
  isText?: boolean;
  textProps?: any;
  onTextPropChange?: (key: string, value: any) => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onLayerUp: () => void;
  onLayerDown: () => void;
  onLockToggle: () => void;
  onDelete: () => void;
}) {
  const btnClass =
    "w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-600 transition-colors text-sm cursor-pointer";
  const disabledBtnClass =
    "w-8 h-8 flex items-center justify-center rounded text-sm opacity-40 cursor-not-allowed";

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -100%)",
        zIndex: 1000,
        pointerEvents: "auto",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 bg-zinc-800 text-white rounded-lg shadow-xl px-2 py-1.5 border border-zinc-600">
        
        {/* TEXT CONTROLS */}
        {isText && textProps && onTextPropChange && !isLocked && (
          <>
            <div className="flex items-center gap-1 border-r border-zinc-600 pr-2 mr-1">
              {/* Font Family */}
              <select
                className="bg-zinc-700 text-white rounded px-1.5 py-1 text-sm outline-none cursor-pointer"
                value={textProps.fontFamily}
                onChange={(e) => onTextPropChange("fontFamily", e.target.value)}
              >
                <option value="Inter">Inter</option>
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times</option>
                <option value="Comic Sans MS">Comic Sans</option>
                <option value="Courier New">Courier</option>
              </select>

              {/* Font Size */}
              <input
                type="number"
                className="bg-zinc-700 text-white rounded px-1 min-w-[3.5rem] py-1 text-sm outline-none"
                value={textProps.fontSize}
                min={8}
                max={200}
                onChange={(e) => onTextPropChange("fontSize", parseInt(e.target.value) || 18)}
              />

              {/* Bold */}
              <button
                type="button"
                className={`${btnClass} ${textProps.fontWeight === "bold" ? "bg-zinc-600" : ""}`}
                onClick={() => onTextPropChange("fontWeight", textProps.fontWeight === "bold" ? "normal" : "bold")}
                title="Bold"
              >
                <span className="font-bold">B</span>
              </button>

              {/* Italic */}
              <button
                type="button"
                className={`${btnClass} ${textProps.fontStyle === "italic" ? "bg-zinc-600" : ""}`}
                onClick={() => onTextPropChange("fontStyle", textProps.fontStyle === "italic" ? "normal" : "italic")}
                title="Italic"
              >
                <span className="italic font-serif">I</span>
              </button>

              {/* Underline */}
              <button
                type="button"
                className={`${btnClass} ${textProps.underline ? "bg-zinc-600" : ""}`}
                onClick={() => onTextPropChange("underline", !textProps.underline)}
                title="Underline"
              >
                <span className="underline">U</span>
              </button>

              {/* Align Left */}
              <button
                type="button"
                className={`${btnClass} ${textProps.textAlign === "left" ? "bg-zinc-600" : ""}`}
                onClick={() => onTextPropChange("textAlign", "left")}
                title="Align Left"
              >
                ⇤
              </button>
              
              {/* Align Center */}
              <button
                type="button"
                className={`${btnClass} ${textProps.textAlign === "center" ? "bg-zinc-600" : ""}`}
                onClick={() => onTextPropChange("textAlign", "center")}
                title="Align Center"
              >
                ⇥⇤
              </button>

              {/* Text Color */}
              <input
                type="color"
                className="w-7 h-7 rounded border border-zinc-500 bg-transparent cursor-pointer ml-1"
                value={textProps.fill}
                onChange={(e) => onTextPropChange("fill", e.target.value)}
                title="Text Color"
              />
            </div>
          </>
        )}

        {!isText && (
          <>
            <button type="button" className={isLocked ? disabledBtnClass : btnClass} onClick={isLocked ? undefined : onRotateLeft} title="Rotate Left">
              ↺
            </button>
            <button type="button" className={isLocked ? disabledBtnClass : btnClass} onClick={isLocked ? undefined : onRotateRight} title="Rotate Right">
              ↻
            </button>

            <div className="w-px h-5 bg-zinc-600 mx-0.5" />

            <button type="button" className={isLocked ? disabledBtnClass : btnClass} onClick={isLocked ? undefined : onFlipH} title="Flip Horizontal">
              ↔
            </button>
            <button type="button" className={isLocked ? disabledBtnClass : btnClass} onClick={isLocked ? undefined : onFlipV} title="Flip Vertical">
              ↕
            </button>

            <div className="w-px h-5 bg-zinc-600 mx-0.5" />

            <button type="button" className={isLocked ? disabledBtnClass : btnClass} onClick={isLocked ? undefined : onLayerDown} title="Layer Turun">
              ⬇
            </button>
            <button type="button" className={isLocked ? disabledBtnClass : btnClass} onClick={isLocked ? undefined : onLayerUp} title="Layer Naik">
              ⬆
            </button>

            <div className="w-px h-5 bg-zinc-600 mx-0.5" />

            <button
              type="button"
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors text-sm cursor-pointer ${
                isLocked ? "bg-amber-500 hover:bg-amber-600" : "hover:bg-zinc-600"
              }`}
              onClick={onLockToggle}
              title={isLocked ? "Unlock" : "Lock"}
            >
              {isLocked ? "🔒" : "🔓"}
            </button>

            <div className="w-px h-5 bg-zinc-600 mx-0.5" />

            <button
              type="button"
              className={isLocked ? disabledBtnClass : "w-8 h-8 flex items-center justify-center rounded hover:bg-red-600 transition-colors text-sm cursor-pointer"}
              onClick={isLocked ? undefined : onDelete}
              title="Delete"
            >
              🗑
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Mini Canvas Thumbnail for History Slider ──
function ThumbnailCanvas({ objects }: { objects: any[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    let staticCanvas: any = null;

    (async () => {
      const fabricModule = await import("fabric");
      const fabric: any = (fabricModule as any).fabric || (fabricModule as any).default || (fabricModule as any);

      if (!isMounted || !canvasRef.current) return;

      staticCanvas = new fabric.StaticCanvas(canvasRef.current, {
        backgroundColor: "#ffffff",
        width: 520, // logical width matches editor logic
        height: 390, // logical height
      });

      const util = fabric.util;
      try {
        const enlivened = await util.enlivenObjects(objects as any[]);
        for (const obj of enlivened) {
          if (!obj) continue;
          staticCanvas.add(obj);
          if (obj.data?.category === "background") {
            if (typeof staticCanvas.sendObjectToBack === "function") staticCanvas.sendObjectToBack(obj);
            else if (typeof staticCanvas.sendToBack === "function") staticCanvas.sendToBack(obj);
          }
        }
      } catch (e) {
        console.error("Failed to enliven thumbnail objects", e);
      }

      // Scale the canvas element via CSS (StaticCanvas doesn't support setDimensions cssOnly)
      if (canvasRef.current) {
        canvasRef.current.style.width = "130px";
        canvasRef.current.style.height = "97.5px";
      }
      staticCanvas.requestRenderAll();
    })();

    return () => {
      isMounted = false;
      if (staticCanvas) {
        staticCanvas.dispose();
      }
    };
  }, [objects]);

  return <canvas ref={canvasRef} />;
}

// ── Horizontal Slider with Book Spread Grouping ──
function HistorySlider({
  panels,
  activeTurnNumber,
  viewingHistorySpread,
  onSelectSpread,
}: {
  panels: Panel[];
  activeTurnNumber?: number;
  viewingHistorySpread?: number[] | null;
  onSelectSpread: (indices: number[]) => void;
}) {
  const blocks: { type: "spread"; indices: number[]; label: string }[] = [];

  const totalLength = activeTurnNumber !== undefined && activeTurnNumber >= panels.length ? activeTurnNumber + 1 : panels.length;

  for (let i = 0; i < totalLength; i += 2) {
    const indices = [i];
    if (i + 1 < totalLength) {
      indices.push(i + 1);
    }
    // Label using 1-based page numbers
    blocks.push({ type: "spread", indices, label: indices.map((x) => x + 1).join(" & ") });
  }

  return (
    <div className="flex gap-6 overflow-x-auto pb-4 pt-2 items-center min-h-[140px] px-2 snap-x">
      {blocks.map((block, bIdx) => {
        return (
          <div key={`block-${bIdx}`} className="flex flex-col items-center gap-2 snap-center shrink-0">
            {/* Pages container */}
            <div className="flex bg-zinc-300 ring-1 ring-zinc-400 p-0.5 shadow-sm rounded-sm">
              {block.indices.map((pIndex) => {
                const p = panels[pIndex];
                const isActive = pIndex === activeTurnNumber;
                
                // If viewing a history spread, highlight the spread being viewed
                const isViewingHistory = viewingHistorySpread?.includes(pIndex);
                // If not viewing history, the active editing panel is highlighted
                const isHighlighted = viewingHistorySpread ? isViewingHistory : isActive;

                return (
                  <button
                    key={`p-${pIndex}`}
                    className={`relative overflow-hidden w-[130px] h-[97.5px] bg-white transition-all focus:outline-none group ${
                      isHighlighted 
                        ? (viewingHistorySpread 
                            ? "border-4 border-amber-500 ring-2 ring-amber-300" // viewing history styling
                            : "border-4 border-purple-600 ring-2 ring-purple-300") // active editing styling
                        : "border border-transparent hover:border-blue-500 hover:ring-2 hover:ring-blue-300"
                    }`}
                    onClick={() => { onSelectSpread(block.indices); }}
                    title={isActive ? `Panel ${pIndex} (Sedang diedit)` : `Lihat Panel ${pIndex}`}
                  >
                    {p ? (
                      <ThumbnailCanvas objects={p.objects} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-purple-50 text-purple-600 opacity-80">
                        <span className="text-xs font-semibold">In Progress</span>
                      </div>
                    )}
                    {/* Hover Overlay */}
                    {p && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span className="bg-black/60 text-white text-xs px-2 py-1 rounded">View</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Label below */}
            <span className="text-xs text-zinc-500 italic font-serif tracking-wide">{block.label}</span>
          </div>
        );
      })}
    </div>
  );
}
