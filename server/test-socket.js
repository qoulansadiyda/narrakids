import { io } from "socket.io-client";
const socket1 = io("http://localhost:4000/collab", { auth: { userId: "test-user-123", username: "qoqo" } });

socket1.on("connect", () => {
    socket1.emit("room:create", { min: 2 }, (resp) => {
        console.log("Socket 1 room:create", resp);
        
        const socket2 = io("http://localhost:4000/collab", { auth: { userId: "test-user-123", username: "qoqo" } });
        socket2.on("connect", () => {
            socket2.emit("room:join", { roomId: resp.roomId }, (resp2) => {
                console.log("Socket 2 room:join", resp2);
                process.exit(0);
            });
        });
    });
});
