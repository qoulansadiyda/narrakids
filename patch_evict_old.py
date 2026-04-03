import re

with open("server/src/realtime.js", "r") as f:
    code = f.read()

bad_logic = """      // 2. Block duplicate userId — same account already in this room via ANOTHER tab/socket
      console.log(`[IO] room:join attempt | room=${roomId} sid=${socket.id} userId=${userId} username=${username}`);
      console.log(`[IO]   current users:`, [...r.users.entries()].map(([sid, u]) => `${sid}=${u.userId}(${u.username})`).join(', '));
      for (const [existingSid, u] of r.users) {
        if (u.userId === userId) {
          console.log(`[IO]   ❌ BLOCKED duplicate userId=${userId} (existing sid=${existingSid})`);
          return cb && cb({ ok: false, error: "ALREADY_JOINED" });
        }
      }"""

good_logic = """      // 2. EVICT old socket if the same userId tries to join again
      // (This prevents ghost connection bugs on page refresh, and brilliantly acts as "kick old tab" if they open 2 tabs!)
      console.log(`[IO] room:join attempt | room=${roomId} sid=${socket.id} userId=${userId} username=${username}`);
      for (const [existingSid, u] of r.users) {
        if (u.userId === userId) {
          console.log(`[IO]   ⚠ EVICTING old socket sid=${existingSid} for userId=${userId} to allow new join`);
          const oldSocket = NS.sockets.get(existingSid);
          if (oldSocket) {
             oldSocket.emit("error:kicked", { reason: "Kamu telah masuk dari tab atau perangkat lain!" });
             oldSocket.disconnect(true);
          }
          r.users.delete(existingSid);
          
          if (r.hostId === existingSid) r.hostId = socket.id; // transfer host seamlessly
          if (r.started && r.currentTurnUserId === existingSid) {
             r.turnOrder = (r.turnOrder || []).map(id => id === existingSid ? socket.id : id);
             r.currentTurnUserId = socket.id;
          }
        }
      }"""

code = code.replace(bad_logic, good_logic)

with open("server/src/realtime.js", "w") as f:
    f.write(code)

print("Patched evict logic!")
