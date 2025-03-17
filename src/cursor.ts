// Create the container element
const cursorContainer = document.createElement("div");
cursorContainer.id = "cursor-container";
cursorContainer.style.position = "absolute";
cursorContainer.style.left = "440px";
cursorContainer.style.top = "150px";
cursorContainer.style.width = "666px";
cursorContainer.style.height = "530px";
cursorContainer.style.pointerEvents = "none";
document.body.appendChild(cursorContainer);

// Create a custom cursor element
const customCursor = document.createElement("div");
customCursor.id = "custom-cursor";
customCursor.style.position = "absolute";
customCursor.style.left = "945px";
customCursor.style.top = "550px";
customCursor.style.width = "100px";
customCursor.style.height = "100px";
customCursor.style.backgroundImage =
  "url('/werkstuk-infodag-ar-IMDVERSE-StefVB/img/hand-cursor.png')";
customCursor.style.backgroundSize = "contain";
customCursor.style.backgroundRepeat = "no-repeat";
customCursor.style.pointerEvents = "none";
customCursor.style.zIndex = "1000";
document.body.appendChild(customCursor);

// Control whether the cursor updates its position
let cursorEnabled = true;

// Smoothing factor (adjust as needed, smaller values = smoother)
const smoothingFactor = 0.08; // Adjust this value

// Store the previous smoothed positions
let smoothedX = 0;
let smoothedY = 0;

// Store the previous smoothed positions for the second pass
let smoothedX2 = 0;
let smoothedY2 = 0;

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

    // Constrain X position within the container
    if (newX < containerRect.left) {
      newX = containerRect.left;
    } else if (newX + cursorWidth > containerRect.right) {
      newX = containerRect.right - cursorWidth;
    }

    // Constrain Y position within the container
    if (newY < containerRect.top) {
      newY = containerRect.top;
    } else if (newY + cursorHeight > containerRect.bottom) {
      newY = containerRect.bottom - cursorHeight;
    }

    // Apply first pass of EMA smoothing
    smoothedX = smoothedX + smoothingFactor * (newX - smoothedX);
    smoothedY = smoothedY + smoothingFactor * (newY - smoothedY);

    // Apply second pass of EMA smoothing
    smoothedX2 = smoothedX2 + smoothingFactor * (smoothedX - smoothedX2);
    smoothedY2 = smoothedY2 + smoothingFactor * (smoothedY - smoothedY2);

    // Update cursor position with doubly smoothed values
    customCursor.style.left = smoothedX2 + "px";
    customCursor.style.top = smoothedY2 + "px";

    // **Ensure the cursor stays within the viewport even when hand tracking is outside the container**
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (smoothedX2 < 0) {
      smoothedX2 = 0;
      customCursor.style.left = "0px";
    } else if (smoothedX2 + cursorWidth > viewportWidth) {
      smoothedX2 = viewportWidth - cursorWidth;
      customCursor.style.left = smoothedX2 + "px";
    }

    if (smoothedY2 < 0) {
      smoothedY2 = 0;
      customCursor.style.top = "0px";
    } else if (smoothedY2 + cursorHeight > viewportHeight) {
      smoothedY2 = viewportHeight - cursorHeight;
      customCursor.style.top = smoothedY2 + "px";
    }
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