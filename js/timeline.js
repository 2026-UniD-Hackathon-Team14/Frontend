"use strict";
// Presentation order only: no message/card content is stored here.
// Without a server card timestamp, historical cross-device order cannot be reconstructed.
const roomTimeline = new Map();
function timelineOrder(roomId) {
  const key = String(roomId);
  if (!roomTimeline.has(key)) {
    let order = [];
    try {
      const saved = JSON.parse(localStorage.getItem("nunchichat.timeline.v1." + key));
      if (Array.isArray(saved))
        order = [...new Set(saved.filter((id) => /^(message|card):\d+$/.test(id)))];
    } catch {}
    roomTimeline.set(key, order);
  }
  return roomTimeline.get(key);
}
function saveTimeline(roomId, order) {
  roomTimeline.set(String(roomId), order);
  try {
    localStorage.setItem("nunchichat.timeline.v1." + roomId, JSON.stringify(order));
  } catch {}
}
function rememberTimelineCard(roomId, cardId) {
  const order = timelineOrder(roomId),
    key = "card:" + cardId;
  if (!order.includes(key)) saveTimeline(roomId, [...order, key]);
}
function mergeTimeline(roomId, messages, cards) {
  const entries = new Map();
  const time = (value) => {
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : null;
  };
  for (const m of messages)
    entries.set("message:" + m.id, { value: m, createdAt: time(m.createdAt) });
  for (const c of cards)
    entries.set("card:" + c.id, {
      value: { agreement: { id: String(c.id) } },
      createdAt: time(c.createdAt),
    });
  let order = [...timelineOrder(roomId)];
  const added = [...entries.keys()].filter((key) => !order.includes(key));
  // Sort new server-dated entries; unknown cards retain API order on their first observation.
  added.sort((a, b) => {
    const x = entries.get(a).createdAt,
      y = entries.get(b).createdAt;
    return x === null ? (y === null ? 0 : 1) : y === null ? -1 : x - y;
  });
  for (const key of added) {
    const timestamp = entries.get(key).createdAt;
    const before =
      timestamp === null
        ? -1
        : order.findIndex((id) => {
            const other = entries.get(id)?.createdAt;
            return other != null && other > timestamp;
          });
    if (before < 0) order.push(key);
    else order.splice(before, 0, key);
  }
  // When the server supplies every timestamp, it is authoritative over observation order.
  if ([...entries.values()].every((e) => e.createdAt !== null)) {
    order = order
      .filter((key) => entries.has(key))
      .sort((a, b) => entries.get(a).createdAt - entries.get(b).createdAt);
  }
  saveTimeline(roomId, order);
  return order.filter((key) => entries.has(key)).map((key) => entries.get(key).value);
}
