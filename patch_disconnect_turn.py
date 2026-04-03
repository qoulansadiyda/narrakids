import re

with open("server/src/realtime.js", "r") as f:
    code = f.read()

# I need to find the specific area in disconnect handler!
target_logic = """        if (r.started && r.currentTurnUserId === socket.id) {
          r.turnOrder = (r.turnOrder || []).filter((sid) => sid !== socket.id);"""

replacement_logic = """        if (r.started) {
          // ALWAYS remove the dead socket from the turnOrder so it never gets rotated to!
          r.turnOrder = (r.turnOrder || []).filter((sid) => sid !== socket.id);
          
          // And ONLY if they were the active one holding the turn right now, do we advance seamlessly
          if (r.currentTurnUserId === socket.id) {
            if (r.turnOrder.length > 0) {
              r.currentTurnIndex = r.currentTurnIndex % r.turnOrder.length;
              r.currentTurnUserId = r.turnOrder[r.currentTurnIndex];
              NS.to(roomId).emit("turn:changed", getTurnSnapshot(r));
            } else {
              r.currentTurnUserId = null;
              r.turnOrder = [];
              NS.to(roomId).emit("turn:changed", getTurnSnapshot(r)); // tell client there's NO ONE left
            }
          }
        }"""

code = code.replace(target_logic, replacement_logic)

with open("server/src/realtime.js", "w") as f:
    f.write(code)

print("Patched disconnect logic!")
