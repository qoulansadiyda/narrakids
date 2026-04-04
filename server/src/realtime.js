import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import {
  initializeTurnSystem,
  advanceTurn,
  getTurnSnapshot,
  validateCanvasUpdate,
} from "./turnSystem.js";
import { prisma } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// ====== SCORE CONFIG ======
const REQUIRED_CATEGORIES = [
  "background",
  "character",
  "bubble_text",
  "property",
];
const MAX_POINT = 100;

// ✅ normalisasi category biar konsisten (support alias)
function normalizeCategory(cat) {
  if (!cat) return null;
  const c = String(cat).trim().toLowerCase();

  // alias mapping (biar fleksibel)
  if (c === "bubble") return "bubble_text";
  if (c === "speech" || c === "speechbubble" || c === "speech_bubble")
    return "bubble_text";
  if (c === "prop") return "property";

  return c;
}

// ✅ normalisasi object payload dari Fabric JSON
function normalizeObjects(raw = []) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((o) => {
      if (!o) return null;

      const data = o.data ?? {};
      const rawCat = o.category ?? data.category;
      const category = normalizeCategory(rawCat);

      const id = o.id ?? data.id;

      return {
        ...o,
        id,
        category,
        data: { ...data, id, category },
      };
    })
    .filter(Boolean);
}

function computeTurnScore(objects = []) {
  const used = new Set(
    (objects ?? [])
      .map((o) => normalizeCategory(o?.category ?? o?.data?.category))
      .filter(Boolean)
  );

  const present = [...used];
  const fulfilled = REQUIRED_CATEGORIES.filter((cat) => used.has(cat)).length;

  const score = Math.round(
    (fulfilled / REQUIRED_CATEGORIES.length) * MAX_POINT
  );
  return { score, present };
}

function buildLeaderboard(scoresObj = {}, usersMap = new Map()) {
  return Object.entries(scoresObj)
    .map(([sid, total]) => {
      const u = usersMap.get(sid);
      return { sid, total, username: u?.username || sid.slice(0, 4) };
    })
    .sort((a, b) => b.total - a.total);
}

function getCurrentPanelKey(r) {
  return String(r.turnNumber ?? 0);
}

export function attachRealtime(io) {
  const NS = io.of("/collab");
  const rooms = new Map();

  function snapshot(roomId) {
    const r = rooms.get(roomId);
    if (!r) return null;

    return {
      roomId,
      hostId: r.hostId,
      min: r.min,
      max: r.max,
      started: r.started,
      users: [...r.users].map(([sid, u]) => ({ sid, ...u })),
      canStart: r.users.size >= r.min,
      isFull: r.users.size >= r.max,
      settings: r.settings || {},
    };
  }

  NS.on("connection", (socket) => {
    // ── Verify JWT if provided ──
    const token = socket.handshake.auth?.token;
    let userId = socket.handshake.auth?.userId || null;
    let username = socket.handshake.auth?.username || null;

    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        userId = payload.sub ?? userId;
        username = payload.username ?? username;
      } catch (err) {
        console.warn("[IO] invalid token, disconnecting", socket.id, err.message);
        socket.emit("auth:error", { error: "INVALID_TOKEN" });
        socket.disconnect(true);
        return;
      }
    }

    // Fallback for dev/testing without token
    if (!userId) userId = randomUUID();
    if (!username) username = `user-${userId.slice(0, 4)}`;

    console.log("[IO] connected", socket.id, "as", username);

    // ===== TURN: GET =====
    socket.on("turn:get", ({ roomId }, cb) => {
      const r = rooms.get(roomId);
      if (!r) return cb && cb({ ok: false, error: "ROOM_NOT_FOUND" });

      cb && cb({ ok: true, snapshot: getTurnSnapshot(r) });

      if (r.started && r.settings?.turnDuration) {
        const elapsedSec = Math.floor((Date.now() - (r.turnStartTime || Date.now())) / 1000);
        const remaining = Math.max(0, r.settings.turnDuration - elapsedSec);
        socket.emit("turn:timer", { durationSec: remaining });
      }
    });

    // ===== ROOM: CREATE =====
    socket.on("room:create", ({ min = 2, max = 4 } = {}, cb) => {
      const roomId = randomUUID().slice(0, 6);

      rooms.set(roomId, {
        hostId: socket.id,
        min,
        max,
        started: false,
        users: new Map(),
        panels: [],
        currentObjects: [],
        panelDrafts: {},
        turnNumber: 0,
      });

      const r = rooms.get(roomId);
      r.users.set(socket.id, { userId, username });
      socket.join(roomId);

      const snap = snapshot(roomId);
      NS.to(roomId).emit("room:state", snap);
      socket.emit("room:joined", { roomId, you: socket.id });

      cb && cb({ roomId, snapshot: snap, you: socket.id });
    });

    // ===== ROOM: JOIN =====
    socket.on("room:join", (payload, cb) => {
      const { roomId } = payload;
      const currentUserId = payload.userId || userId;
      const currentUsername = payload.username || username;

      const r = rooms.get(roomId);
      if (!r) return cb && cb({ ok: false, error: "ROOM_NOT_FOUND" });

      const activeEntries = Array.from(r.users.entries());
      const oldSocketEntry = activeEntries.find(([sid, u]) => u.userId === currentUserId);

      // Block jika bukan pemain yang sedang reconnect, dan sesi sudah main atau penuh
      if (r.started && !oldSocketEntry) return cb && cb({ ok: false, error: "ALREADY_STARTED" });
      if (r.users.size >= r.max && !oldSocketEntry)
        return cb && cb({ ok: false, error: "ROOM_FULL", max: r.max });

      // Jika React strict mode "double-fire" pada socket yang SAMA, skip & sukseskan
      if (r.users.has(socket.id)) {
        const snap = snapshot(roomId);
        return cb && cb({ ok: true, snapshot: snap, you: socket.id });
      }

      if (oldSocketEntry) {
         // Solusi elegan: Ganti socket lama dengan yang baru. Super berguna untuk Refresh tab / putus koneksi Polling
         const oldSid = oldSocketEntry[0];
         r.users.delete(oldSid);
         
         // Jika yang tertendang adalah ketua (Host), pindahkan mahkotanya ke tab yang baru ini!
         if (r.hostId === oldSid) {
             r.hostId = socket.id;
         }

         // Selamatkan rekam jejak gilirannya agar canvas tetap bisa dipakai!
         if (r.turnOrder) {
            const idx = r.turnOrder.indexOf(oldSid);
            if (idx !== -1) r.turnOrder[idx] = socket.id;
         }
         if (r.currentTurnUserId === oldSid) {
            r.currentTurnUserId = socket.id;
         }

         // Kirim sinyal tendang, lalu putuskan paksa agar benar-benar keluar dari room broadcast
         NS.to(oldSid).emit("room:kicked", { reason: "Kamu telah merefresh halaman atau masuk dari perangkat lain." });
         NS.sockets.get(oldSid)?.leave(roomId);
      } else {
         // Cuma periksa nama ganda jika ini user dengan ID berbeda
         if (activeEntries.some(([sid, u]) => u.username === currentUsername)) {
           return cb && cb({ ok: false, error: "NAME_TAKEN" });
         }
      }

      r.users.set(socket.id, { userId: currentUserId, username: currentUsername });
      socket.join(roomId);

      const snap = snapshot(roomId);
      NS.to(roomId).emit("room:state", snap);
      socket.emit("room:joined", { roomId, you: socket.id });

      cb && cb({ ok: true, snapshot: snap, you: socket.id });
    });

    // ===== ROOM: START =====
    socket.on("room:start", ({ roomId, settings }, cb) => {
      const r = rooms.get(roomId);
      if (!r) return cb && cb({ ok: false, error: "ROOM_NOT_FOUND" });

      if (r.users.size < r.min)
        return cb && cb({ ok: false, error: "NOT_ENOUGH" });

      r.started = true;
      r.settings = settings || { turnDuration: 0, canvasQuota: 2 };

      initializeTurnSystem(r);
      if (typeof r.currentTurnIndex !== "number") r.currentTurnIndex = 0;
      if (typeof r.turnNumber !== "number") r.turnNumber = 0;

      NS.to(roomId).emit("room:start", { roomId });
      NS.to(roomId).emit("turn:changed", getTurnSnapshot(r));

      startTurnTimer(roomId);

      cb && cb({ ok: true });
    });

    // ===== ROOM: LEAVE =====
    socket.on("room:leave", ({ roomId }) => {
      const r = rooms.get(roomId);
      if (!r) return;

      if (r.users.delete(socket.id)) {
        if (r.hostId === socket.id) r.hostId = [...r.users.keys()][0] || null;

        if (r.started && r.currentTurnUserId === socket.id) {
          r.turnOrder = (r.turnOrder || []).filter((sid) => sid !== socket.id);

          if (r.turnOrder.length > 0) {
            r.currentTurnIndex = r.currentTurnIndex % r.turnOrder.length;
            r.currentTurnUserId = r.turnOrder[r.currentTurnIndex];
            NS.to(roomId).emit("turn:changed", getTurnSnapshot(r));
          } else {
            r.currentTurnUserId = null;
            r.turnOrder = [];
          }
        }

        NS.to(roomId).emit("room:state", snapshot(roomId));
      }
    });

    // ===== ROOM: TRANSFER HOST =====
    socket.on("room:transferHost", ({ roomId, targetSid }, cb) => {
      const r = rooms.get(roomId);
      if (!r) return cb && cb({ ok: false, error: "ROOM_NOT_FOUND" });

      if (r.hostId !== socket.id) {
        return cb && cb({ ok: false, error: "NOT_HOST" });
      }

      if (!r.users.has(targetSid)) {
        return cb && cb({ ok: false, error: "USER_NOT_FOUND" });
      }

      r.hostId = targetSid;
      NS.to(roomId).emit("room:state", snapshot(roomId));
      cb && cb({ ok: true });
    });

    // ===== ROOM: SETTINGS UPDATE (Live Sync) =====
    socket.on("room:settings_update", ({ roomId, settings }) => {
      const r = rooms.get(roomId);
      if (!r) return;
      if (r.started) return; // tidak bisa ganti pengaturan setelah mulai
      if (r.hostId !== socket.id) return; // hanya ketua yang bisa merubah

      r.settings = { ...(r.settings || {}), ...settings };
      NS.to(roomId).emit("room:state", snapshot(roomId));
    });

    // ===== DISCONNECT =====
    socket.on("disconnect", () => {
      for (const [roomId, r] of rooms) {
        if (!r.users.delete(socket.id)) continue;

        if (r.hostId === socket.id) r.hostId = [...r.users.keys()][0] || null;

        if (r.started && r.currentTurnUserId === socket.id) {
          r.turnOrder = (r.turnOrder || []).filter((sid) => sid !== socket.id);

          if (r.turnOrder.length > 0) {
            r.currentTurnIndex = r.currentTurnIndex % r.turnOrder.length;
            r.currentTurnUserId = r.turnOrder[r.currentTurnIndex];
            NS.to(roomId).emit("turn:changed", getTurnSnapshot(r));
          } else {
            r.currentTurnUserId = null;
            r.turnOrder = [];
          }
        }

        NS.to(roomId).emit("room:state", snapshot(roomId));
      }
    });

    // ===== TURN: FINISH =====
    // Note: Called manually by the client *after* canvas:save
    // But since canvas:save now triggers checkRoomFinished (which advances the turn),
    // we actually don't need turn:finish to advance the turn anymore to prevent double-skipping.
    // Kept for backward compatibility if client explicitly calls it.
    socket.on("turn:finish", ({ roomId }, cb) => {
      // Do nothing, already handled by checkRoomFinished in canvas:save
      cb && cb({ ok: true });
    });

    // ===== TURN: SKIP =====
    socket.on("turn:skip", ({ roomId }, cb) => {
      const r = rooms.get(roomId);
      if (!r) return cb && cb({ ok: false, error: "ROOM_NOT_FOUND" });
      if (!r.started || !r.turnOrder)
        return cb && cb({ ok: false, error: "SESSION_NOT_STARTED" });

      if (socket.id !== r.currentTurnUserId)
        return cb && cb({ ok: false, error: "NOT_YOUR_TURN" });

      if (!r.scores) r.scores = {};
      if (!r.scores[socket.id]) r.scores[socket.id] = 0;

      const score = 0;

      r.panels.push({
        id: randomUUID().slice(0, 8),
        turnNumber: r.turnNumber ?? 0,
        createdBy: socket.id,
        objects: [],
        score,
        presentCategories: [],
        skipped: true,
        timestamp: Date.now(),
        updatedAt: Date.now(),
      });

      const leaderboard = buildLeaderboard(r.scores, r.users);
      NS.to(roomId).emit("score:update", { leaderboard });

      cb &&
        cb({
          ok: true,
          score: 0,
          totalScore: r.scores[socket.id],
          leaderboard,
        });

      checkRoomFinished(roomId);
    });

    // ===== CANVAS: UPDATE (draft realtime) =====
    socket.on("canvas:update", ({ roomId, objects }) => {
      const r = rooms.get(roomId);

      const validation = validateCanvasUpdate(socket.id, r, { objects });
      if (!validation.allowed) {
        socket.emit("canvas:update:rejected", {
          reason: validation.reason,
          currentTurnUserId: validation.currentTurnUserId,
        });
        return;
      }

      const normalized = normalizeObjects(objects);

      if (!r.panelDrafts) r.panelDrafts = {};
      const key = getCurrentPanelKey(r);

      r.panelDrafts[key] = {
        objects: normalized,
        updatedAt: Date.now(),
        by: socket.id,
      };

      r.currentObjects = normalized;

      socket.to(roomId).emit("canvas:update", { objects: normalized });
    });

    // ===== CANVAS: TRANSFORM (lightweight live position/scale/rotate relay) =====
    socket.on("canvas:transform", ({ roomId, objectId, transform }) => {
      const r = rooms.get(roomId);
      if (!r || !r.started) return;
      if (r.currentTurnUserId !== socket.id) return; // only active player

      socket.to(roomId).emit("canvas:transform", { objectId, transform });
    });

    // ===== ROOM: SET BGM (REMOVED: now per-panel) =====

    // ===== CANVAS: SAVE (DONE) =====
    socket.on("canvas:save", ({ roomId, objects, audioSrc, bgmSrc }, cb) => {
      const r = rooms.get(roomId);
      if (!r) return cb && cb({ ok: false, error: "ROOM_NOT_FOUND" });

      if (!r.panels) r.panels = [];
      if (!r.scores) r.scores = {};
      if (!r.scores[socket.id]) r.scores[socket.id] = 0;

      const normalized = normalizeObjects(objects);

      const { score, present } = computeTurnScore(normalized);
      r.scores[socket.id] += score;

      const panelId = randomUUID().slice(0, 8);
      const panel = {
        id: panelId,
        turnNumber: r.turnNumber ?? 0,
        createdBy: socket.id,
        objects: normalized ?? [],
        audioSrc: audioSrc || null,
        bgmSrc: bgmSrc || null,
        score,
        presentCategories: present,
        timestamp: Date.now(),
        updatedAt: Date.now(),
      };

      r.panels.push(panel);

      // draft turn ini juga disimpan dalam bentuk normalized
      if (!r.panelDrafts) r.panelDrafts = {};
      const key = String(r.turnNumber ?? 0);
      r.panelDrafts[key] = {
        objects: normalized,
        updatedAt: Date.now(),
        by: socket.id,
      };

      const leaderboard = buildLeaderboard(r.scores, r.users);
      NS.to(roomId).emit("score:update", { leaderboard });

      cb &&
        cb({
          ok: true,
          panelId,
          score,
          totalScore: r.scores[socket.id],
          present,
          leaderboard,
        });

      checkRoomFinished(roomId);
    });

    // ===== PANEL: GET CURRENT (draft) =====
    socket.on("panel:getCurrent", ({ roomId }, cb) => {
      const r = rooms.get(roomId);
      if (!r) return cb && cb({ ok: false, error: "ROOM_NOT_FOUND" });

      const turnNumber = r.turnNumber ?? 0;
      const key = String(turnNumber);

      const objects = r.panelDrafts?.[key]?.objects ?? [];
      return cb && cb({ ok: true, turnNumber, objects });
    });

    // ===== PANEL: GET ALL (history) =====
    socket.on("panel:getAll", ({ roomId }, cb) => {
      const r = rooms.get(roomId);
      if (!r) return cb && cb({ ok: false, error: "ROOM_NOT_FOUND" });

      cb &&
        cb({
          ok: true,
          panels: r.panels ?? [],
          activePanelId: r.activePanelId ?? null,
        });
    });

    // (opsional) Spread (last saved + draft)
    socket.on("panel:getSpread", ({ roomId }, cb) => {
      const r = rooms.get(roomId);
      if (!r) return cb && cb({ ok: false, error: "ROOM_NOT_FOUND" });

      const leftPanel =
        r.panels.length > 0 ? r.panels[r.panels.length - 1] : null;

      cb &&
        cb({
          ok: true,
          left: leftPanel ? leftPanel.objects : [],
          right: r.currentObjects ?? [],
          leftIndex: r.panels.length > 0 ? r.panels.length : null,
          rightIndex: r.panels.length + 1,
        });
    });

    // ===== AUTO-SKIP TIMER =====
    function startTurnTimer(roomId) {
      const r = rooms.get(roomId);
      if (!r || !r.started || !r.settings?.turnDuration) return;

      if (r.turnTimer) clearTimeout(r.turnTimer);

      r.turnStartTime = Date.now();
      NS.to(roomId).emit("turn:timer", { durationSec: r.settings.turnDuration });

      r.turnTimer = setTimeout(() => {
        // Auto-skip
        const currentSid = r.currentTurnUserId;
        if (!currentSid) return;

        if (!r.scores) r.scores = {};
        if (!r.scores[currentSid]) r.scores[currentSid] = 0;
        
        r.panels.push({
          id: randomUUID().slice(0, 8),
          turnNumber: r.turnNumber ?? 0,
          createdBy: currentSid,
          objects: r.currentObjects || [], // save whatever they had
          score: 0,
          presentCategories: [],
          skipped: true,
          timestamp: Date.now(),
          updatedAt: Date.now(),
        });

        const leaderboard = buildLeaderboard(r.scores, r.users);
        NS.to(roomId).emit("score:update", { leaderboard });

        checkRoomFinished(roomId);
      }, r.settings.turnDuration * 1000);
    }

    // ===== CHECK QUOTA / AUTOMATIC FINISH =====
    async function checkRoomFinished(roomId) {
      const r = rooms.get(roomId);
      if (!r || !r.started) return;

      if (r.turnTimer) clearTimeout(r.turnTimer);

      const maxPanels = r.users.size * (r.settings?.canvasQuota || 2);

      if (r.panels.length >= maxPanels) {
        r.started = false;
        const finalLeaderboard = buildLeaderboard(r.scores || {}, r.users);
        const bookTitle = r.settings?.bookTitle || `Kolaborasi Room ${roomId}`;
        const pageData = r.panels.map((p, idx) => ({
          pageNum: idx,
          objects: JSON.stringify(p.objects || []),
          audioSrc: p.audioSrc || null,
          bgmSrc: p.bgmSrc || null,
        }));

        // Collect all unique userIds from the room
        const userIds = new Set();
        for (const [, userData] of r.users) {
          if (userData.userId) userIds.add(userData.userId);
        }

        let firstBookId = null;
        // Create a personal copy of the book for EVERY authenticated player
        for (const uid of userIds) {
          try {
            const book = await prisma.book.create({
              data: {
                title: bookTitle,
                roomId,
                userId: uid,
                leaderboard: JSON.stringify(finalLeaderboard),
                pages: { create: pageData.map(p => ({ ...p })) },
              },
            });
            console.log(`[SERVER] Auto-saved book ${book.id} for user ${uid} in room ${roomId}`);
            if (!firstBookId) firstBookId = book.id;
          } catch (e) {
            console.error(`[SERVER] Failed to auto-save book for user ${uid} in room ${roomId}`, e);
          }
        }

        if (firstBookId) {
          NS.to(roomId).emit("room:finished", { bookId: firstBookId });
        }
      } else {
        // Just advance turn since we're not done
        r.turnNumber = (r.turnNumber ?? 0) + 1;
        advanceTurn(r);
        r.currentObjects = [];
        NS.to(roomId).emit("turn:changed", getTurnSnapshot(r));
        startTurnTimer(roomId);
      }
    }
  });
}
