// Create a custom cursor element
const customCursor = document.createElement("div");
customCursor.id = "custom-cursor";
customCursor.style.position = "absolute";
customCursor.style.width = "32px";
customCursor.style.height = "32px";
customCursor.style.backgroundImage =
  "url('/werkstuk-infodag-ar-IMDVERSE-StefVB/img/hand-cursor.png')"; // Adjust image URL as needed
customCursor.style.backgroundSize = "contain";
customCursor.style.pointerEvents = "none"; // Let clicks pass through
customCursor.style.zIndex = "1000";
document.body.appendChild(customCursor);

// Control whether the cursor updates its position
let cursorEnabled = true;

document.addEventListener("handTrackingUpdate", event => {
  const customEvent = event as CustomEvent<{ x: number; y: number }>;
  if (cursorEnabled) {
    customCursor.style.left = customEvent.detail.x + "px";
    customCursor.style.top = customEvent.detail.y + "px";
  }
});

// Listen for game state events to toggle the custom cursor
document.addEventListener("gameStarted", () => {
  cursorEnabled = false;
  customCursor.style.display = "none";
});

document.addEventListener("gameEnded", () => {
  cursorEnabled = true;
  customCursor.style.display = "block";
});

// When a "handClick" event is dispatched, simulate a click at the cursor's location.
document.addEventListener("handClick", () => {
  const x = parseFloat(customCursor.style.left);
  const y = parseFloat(customCursor.style.top);
  const element = document.elementFromPoint(x, y);
  if (element) {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
});

// (Optional) Keep the space bar handler for testing.
document.addEventListener("keydown", e => {
  if (e.code === "Space") {
    document.dispatchEvent(new CustomEvent("handClick"));
  }
});
