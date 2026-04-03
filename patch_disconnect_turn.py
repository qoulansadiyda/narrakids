import re

with open("server/src/realtime.js", "r") as f:
    data = f.read()

# Replace disconnect with leave
data = data.replace('NS.sockets.get(oldSid)?.disconnect(true);', 'NS.sockets.get(oldSid)?.leave(roomId);')

with open("server/src/realtime.js", "w") as f:
    f.write(data)

