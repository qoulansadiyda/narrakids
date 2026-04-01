// server/src/turnSystem.js
// Utility helpers to manage turn order for a room.

export function initializeTurnSystem(room) {
  const order = [...room.users.keys()];
  room.turnOrder = order;
  room.currentTurnIndex = order.length > 0 ? 0 : -1;
  room.currentTurnUserId = order.length > 0 ? order[0] : null;
}

export function isCurrentTurn(socketId, room) {
  if (!room || !room.started) return false;
  return room.currentTurnUserId === socketId;
}

export function advanceTurn(room) {
  if (!room || !room.turnOrder || room.turnOrder.length === 0) {
    return { nextTurnUserId: null, nextUser: null };
  }

  room.currentTurnIndex =
    (room.currentTurnIndex + 1) % room.turnOrder.length;
  room.currentTurnUserId = room.turnOrder[room.currentTurnIndex];

  const nextUser = room.users.get(room.currentTurnUserId) || null;

  return {
    nextTurnUserId: room.currentTurnUserId,
    nextUser,
  };
}

export function getTurnSnapshot(room) {
  return {
    turnOrder: room.turnOrder || [],
    currentTurnIndex: room.currentTurnIndex ?? 0,
    currentTurnUserId: room.currentTurnUserId || null,
    users:
      room.turnOrder?.map((sid) => {
        const u = room.users.get(sid);
        return { sid, username: u?.username, userId: u?.userId };
      }) || [],
  };
}

export function validateCanvasUpdate(socketId, room, _payload) {
  if (!room) {
    return { allowed: false, reason: "ROOM_NOT_FOUND", currentTurnUserId: null };
  }
  if (!room.started) {
    return {
      allowed: false,
      reason: "SESSION_NOT_STARTED",
      currentTurnUserId: room.currentTurnUserId || null,
    };
  }
  if (!room.turnOrder || room.turnOrder.length === 0) {
    return {
      allowed: false,
      reason: "NO_TURN_ORDER",
      currentTurnUserId: room.currentTurnUserId || null,
    };
  }
  if (room.currentTurnUserId !== socketId) {
    return {
      allowed: false,
      reason: "NOT_YOUR_TURN",
      currentTurnUserId: room.currentTurnUserId || null,
    };
  }

  return { allowed: true, reason: null, currentTurnUserId: room.currentTurnUserId };
}
