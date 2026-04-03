const { io } = require("socket.io-client");
const socket1 = io("http://localhost:4000/collab", { auth: { userId: "test-user-123", username: "qoqo" } });

socket1.on("connect", () => {
    console.log("S1 connected", socket1.id);
    socket1.emit("room:create", { min: 2 }, (resp) => {
        console.log("S1 room:create", resp);
        
        // Emulate Next.js router.replace which calls room:join immediately on SAME socket
        socket1.emit("room:join", { roomId: resp.roomId }, (joinResp1) => {
            console.log("S1 room:join inside same socket", joinResp1);
            
            // Emulate opening a new tab
            const socket2 = io("http://localhost:4000/collab", { auth: { userId: "test-user-123", username: "qoqo" } });
            socket2.on("connect", () => {
                console.log("S2 connected", socket2.id);
                socket2.emit("room:join", { roomId: resp.roomId }, (joinResp2) => {
                    console.log("S2 room:join", joinResp2);
                    process.exit(0);
                });
            });
        });
    });
});
setTimeout(() => process.exit(1), 3000);
