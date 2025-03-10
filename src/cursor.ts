// Create the container element
const cursorContainer = document.createElement("div");
cursorContainer.id = "cursor-container";
cursorContainer.style.position = "absolute";
cursorContainer.style.left = "440px";
cursorContainer.style.top = "180px";
cursorContainer.style.width = "666px";
cursorContainer.style.height = "420px";
// cursorContainer.style.border = "2px solid red"; // For debugging
cursorContainer.style.pointerEvents = "none";
document.body.appendChild(cursorContainer);

// Create a custom cursor element
const customCursor = document.createElement("div");
customCursor.id = "custom-cursor";
customCursor.style.position = "absolute";
customCursor.style.width = "100px";
customCursor.style.height = "100px";
customCursor.style.backgroundImage =
  "url('/werkstuk-infodag-ar-IMDVERSE-StefVB/img/hand-cursor.png')";
customCursor.style.backgroundSize = "contain";
customCursor.style.backgroundRepeat = "no-repeat";
customCursor.style.backgroundPosition = "center";
customCursor.style.pointerEvents = "none";
customCursor.style.zIndex = "1000";
document.body.appendChild(customCursor);

// Control whether the cursor updates its position
let cursorEnabled = true;

document.addEventListener("handTrackingUpdate", event => {
  const customEvent = event as CustomEvent<{ x: number; y: number }>;
  if (cursorEnabled) {
    let newX = customEvent.detail.x;
    let newY = customEvent.detail.y;

    // Get container boundaries
    const containerRect = cursorContainer.getBoundingClientRect();

    // Get cursor size
    const cursorWidth = customCursor.offsetWidth;
    const cursorHeight = customCursor.offsetHeight;

    // Invert the X coordinate
    newX = containerRect.right - (newX - containerRect.left) - cursorWidth;

    // Constrain X position
    if (newX < containerRect.left) {
      newX = containerRect.left;
    } else if (newX + cursorWidth > containerRect.right) {
      newX = containerRect.right - cursorWidth;
    }

    // Constrain Y position
    if (newY < containerRect.top) {
      newY = containerRect.top;
    } else if (newY + cursorHeight > containerRect.bottom) {
      newY = containerRect.bottom - cursorHeight;
    }

    // Update cursor position
    customCursor.style.left = newX + "px";
    customCursor.style.top = newY + "px";
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