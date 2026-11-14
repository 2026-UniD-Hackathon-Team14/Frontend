"use strict";
// Native STOMP 1.2 over /ws. REST polling remains active when the server or network rejects WebSocket.
window.RoomSync = (() => {
  let socket = null,
    roomId = null,
    reconnect = null,
    poll = null,
    watchdog = null,
    attempt = 0,
    lastSeen = 0,
    buffer = "",
    generation = 0;
  function stop() {
    generation++;
    clearTimeout(reconnect);
    clearInterval(poll);
    clearInterval(watchdog);
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
  }
  function connect(id) {
    stop();
    roomId = id;
    attempt = 0;
    const token = generation;
    poll = setInterval(() => {
      if (!document.hidden && ready) {
        refreshRoom({ quiet: true });
        if (workspaceTool !== "chat") loadWorkspaceTool({ quiet: true });
      }
    }, window.NUNCHI_API_CONFIG.pollInterval);
    function start() {
      if (token !== generation || !roomId) return;
      buffer = "";
      lastSeen = Date.now();
      try {
        socket = new WebSocket(window.NUNCHI_API_CONFIG.wsUrl, ["v12.stomp"]);
      } catch {
        schedule();
        return;
      }
      const connection = socket;
      connection.onopen = () =>
        connection.send(
          "CONNECT\naccept-version:1.2\nhost:" +
            new URL(window.NUNCHI_API_CONFIG.wsUrl).host +
            "\nheart-beat:0,10000\nX-User-Id:" +
            currentUser.id +
            "\n\n\0",
        );
      connection.onmessage = (event) => {
        if (token !== generation) return;
        lastSeen = Date.now();
        buffer += event.data;
        let end;
        while ((end = buffer.indexOf("\0")) >= 0) {
          const frame = buffer.slice(0, end).replace(/^\s+/, ""),
            body = frame.slice(frame.indexOf("\n\n") + 2);
          buffer = buffer.slice(end + 1);
          if (frame.startsWith("CONNECTED")) {
            attempt = 0;
            socket.send(
              "SUBSCRIBE\nid:room\ndestination:/topic/rooms/" + roomId + "\nack:auto\n\n\0",
            );
            refreshRoom({ quiet: true });
          }
          if (frame.startsWith("MESSAGE")) {
            try {
              const message = JSON.parse(body);
              if (message.type === "CARD_CREATED" && message.data?.id)
                rememberTimelineCard(roomId, message.data.id);
              if (message.type === "MEETING_ENDED" && message.data?.receiptId) {
                rememberReceipt(roomId, message.data.receiptId);
                saveState();
              }
              refreshRoom({ quiet: true });
              if (workspaceTool !== "chat") loadWorkspaceTool({ quiet: true });
            } catch {}
          }
          if (frame.startsWith("ERROR")) connection.close();
        }
        if (!buffer.trim()) buffer = "";
        if (buffer.length > 1000000) connection.close();
      };
      connection.onclose = () => {
        if (token !== generation || socket !== connection) return;
        clearInterval(watchdog);
        schedule();
      };
      connection.onerror = () => connection.close();
      watchdog = setInterval(() => {
        if (Date.now() - lastSeen > 45000) socket?.close();
      }, 15000);
    }
    function schedule() {
      if (token !== generation) return;
      clearTimeout(reconnect);
      reconnect = setTimeout(start, Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)));
    }
    start();
  }
  window.addEventListener("pagehide", stop);
  return { connect, stop };
})();
