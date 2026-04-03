import re

with open("server/src/realtime.js", "r") as f:
    code = f.read()

bad_logic = """      // Block duplicate userId — same account already in this room via another tab/socket
      console.log(`[IO] room:join attempt | room=${roomId} sid=${socket.id} userId=${userId} username=${username}`);
      console.log(`[IO]   current users:`, [...r.users.entries()].map(([sid, u]) => `${sid}=${u.userId}(${u.username})`).join(', '));
      for (const [existingSid, u] of r.users) {
        if (u.userId === userId) {
          console.log(`[IO]   ❌ BLOCKED duplicate userId=${userId} (existing sid=${existingSid})`);
          return cb && cb({ ok: false, error: "ALREADY_JOINED" });
        }
      }

      // Also skip if this exact socket.id is already registered (edge case: double-emit)
      if (r.users.has(socket.id)) {
        console.log(`[IO]   ⚠ socket.id already in room, returning current state`);
        const snap = snapshot(roomId);
        return cb && cb({ ok: true, snapshot: snap, you: socket.id });
      }"""

good_logic = """      // 1. Skip if this exact socket.id is already registered
      // (Edge case: Frontend router.replace() causes room:join right after room:create on the same socket)
      if (r.users.has(socket.id)) {
        console.log(`[IO]   ⚠ socket.id already in room, returning current state silently`);
        const snap = snapshot(roomId);
        return cb && cb({ ok: true, snapshot: snap, you: socket.id });
      }

      // 2. Block duplicate userId — same account already in this room via ANOTHER tab/socket
      console.log(`[IO] room:join attempt | room=${roomId} sid=${socket.id} userId=${userId} username=${username}`);
      console.log(`[IO]   current users:`, [...r.users.entries()].map(([sid, u]) => `${sid}=${u.userId}(${u.username})`).join(', '));
      for (const [existingSid, u] of r.users) {
        if (u.userId === userId) {
          console.log(`[IO]   ❌ BLOCKED duplicate userId=${userId} (existing sid=${existingSid})`);
          return cb && cb({ ok: false, error: "ALREADY_JOINED" });
        }
      }"""

code = code.replace(bad_logic, good_logic)

with open("server/src/realtime.js", "w") as f:
    f.write(code)

print("Patched duplicate logic!")
