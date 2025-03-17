declare var confetti: any;
import { displayLandmarks } from "./lib/display";
import { hasGetUserMedia } from "./lib/utils";
import "./cursor.ts";
import "./main.css";
import {
  FilesetResolver,
  GestureRecognizer,
  GestureRecognizerResult,
} from "@mediapipe/tasks-vision";

// ---------------------------
// GESTURE RECOGNIZER VARS
// ---------------------------
let runningMode: "IMAGE" | "VIDEO" = "VIDEO";
let gestureRecognizer: GestureRecognizer | undefined;
let isWebcamRunning = false;
let lastVideoTime = -1;
let results: GestureRecognizerResult | undefined;

// ---------------------------
// TIMER, SCORE & IDLE TIMER
// ---------------------------
/**
 * Keep all timing in milliseconds (ms).
 * - `accumulatedTime`: total ms of active gameplay so far
 * - `startTime`: ms timestamp when the current active session started
 */
let startTime = 0;         // In ms
let accumulatedTime = 0;   // In ms
let timerInterval: number | undefined;
let score = 0;
let idleTimer: number | undefined;

// NEW: Global game state flag. Idle checking is only active when true.
let isGameActive = false;

/** Update the on-screen timer every second */
function updateTimer() {
  const totalMs = accumulatedTime + (Date.now() - startTime);
  const seconds = Math.floor(totalMs / 1000);
  timerDisplay.innerText = `Tijd: ${seconds}s`;
}

/** Pause the timer (accumulate current session) */
function pauseTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = undefined;
    accumulatedTime += (Date.now() - startTime);
  }
}

/** Resume the timer (start a new active session) */
function resumeTimer() {
  if (!timerInterval) {
    startTime = Date.now();
    timerInterval = window.setInterval(updateTimer, 1000);
  }
}

/**
 * Resets the idle timer.
 * If no interactivity is detected within 10 seconds,
 * a popup will be shown and the page will reload.
 * This check only runs when the game is active.
 */
function resetIdleTimer() {
  if (!isGameActive) {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
    return;
  }
  if (idleTimer !== undefined) {
    clearTimeout(idleTimer);
  }
  idleTimer = window.setTimeout(() => {
    if (!isGameActive) return;
    showGameStoppedPopup();
    setTimeout(() => {
      location.reload();
    }, 2000);
  }, 10000); // 10 seconds idle timeout
}

/**
 * Sets up event listeners to monitor interactivity.
 * These events include mouse movements, key presses, touch events,
 * and any custom events (like 'handTrackingUpdate' from your gesture logic).
 */
function monitorInteractivity() {
  const events = ["mousemove", "keydown", "touchstart", "handTrackingUpdate"];
  events.forEach((event) => {
    document.addEventListener(event, resetIdleTimer);
  });
  resetIdleTimer();
}

/**
 * Creates and displays a temporary popup indicating the game has stopped.
 */
function showGameStoppedPopup() {
  const popup = document.createElement("div");
  popup.innerText = "Gestopt vanwege inactiviteit. Pagina wordt opnieuw geladen...";
  popup.style.width = "300px";
  popup.style.textAlign = "center";
  popup.style.position = "fixed";
  popup.style.top = "50%";
  popup.style.left = "50%";
  popup.style.transform = "translate(-50%, -50%)";
  popup.style.background = "#4caf50 linear-gradient(115deg, " +
      "rgba(30, 222, 104, 0.777), " +
      "rgba(40, 139, 81, 0.7), " +
      "rgba(29, 80, 40, 0.7))";
  popup.style.color = "#fff";
  popup.style.padding = "20px";
  popup.style.borderRadius = "8px";
  popup.style.zIndex = "1000";
  document.body.appendChild(popup);
  setTimeout(() => {
      popup.remove();
      location.reload(); //Added reload here.
  }, 5000);
}

// ---------------------------
// PUZZLE / GAME LOGIC
// ---------------------------
let puzzlesSolved = 0;
const imageSources = [
  "/werkstuk-infodag-ar-IMDVERSE-StefVB/img/github.svg",
  "/werkstuk-infodag-ar-IMDVERSE-StefVB/img/vitejs.svg",
  "/werkstuk-infodag-ar-IMDVERSE-StefVB/img/Unreal.png",
];
let availableImages = [...imageSources];
let currentLogoName = "";

// DOM elements
const video = document.querySelector("#webcam") as HTMLVideoElement;
const canvasElement = document.querySelector("#output_canvas") as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d") as CanvasRenderingContext2D;
const gridCells = document.querySelectorAll(".grid-cell") as NodeListOf<HTMLDivElement>;
const puzzleContainer = document.querySelector("#puzzle-container") as HTMLDivElement;
const progress = document.querySelector("#progress") as HTMLDivElement | null;
const winnerMessage = document.querySelector("#winner-message") as HTMLDivElement | null;
const timerDisplay = document.querySelector("#timer") as HTMLDivElement;
const scoreDisplay = document.querySelector("#score") as HTMLDivElement;
const startMenu = document.querySelector("#start-menu") as HTMLDivElement;
const startButton = document.querySelector("#start-button") as HTMLButtonElement;
const startSound = document.querySelector("#start-sound") as HTMLAudioElement;
const placeSound = document.querySelector("#place-sound") as HTMLAudioElement;
const correctSound = document.querySelector("#correct-sound") as HTMLAudioElement;
const winSound = document.querySelector("#win-sound") as HTMLAudioElement;

// Puzzle pieces
let pieces = Array.from(document.querySelectorAll(".puzzle-piece")) as HTMLDivElement[];
let selectedPiece: HTMLDivElement | null = null;
let placedPieces = 0;
let occupiedCells: Set<string> = new Set();

const cellIds = Array.from(gridCells).map((cell) => cell.id);
pieces.forEach((piece, idx) => {
  piece.dataset.target = cellIds[idx];
});

// Start game via start menu
startButton.addEventListener("click", () => {
  document.dispatchEvent(new CustomEvent("gameStarted"));
  startMenu.style.display = "none";
  playSound(startSound);
  startGame();
});

function startGame() {
  isGameActive = true; // Game is now active.
  accumulatedTime = 0;
  startTime = Date.now();
  score = 0;
  scoreDisplay.innerText = `Score: ${score}`;

  const randomIndex = Math.floor(Math.random() * availableImages.length);
  const selectedImage = availableImages.splice(randomIndex, 1)[0];
  currentLogoName = selectedImage.split("/").pop()?.split(".")[0] || "";
  splitLogoImage(selectedImage);
  loadNextPiece();
}

function loadNextPiece() {
  if (!timerInterval) {
    resumeTimer();
  }

  let nextPiece = document.querySelector(
    ".puzzle-piece:not(.active):not(.placed)"
  ) as HTMLDivElement | null;
  if (nextPiece) {
    nextPiece.classList.add("active");
    selectedPiece = nextPiece;
    nextPiece.style.left = "150px";
    nextPiece.style.top = "250px";
    highlightTargetCell(nextPiece);
  } else {
    checkForPuzzleCompletion();
  }
}

function checkForPuzzleCompletion() {
  if (placedPieces === gridCells.length) {
    puzzlesSolved++;
    fadeOutPuzzleLines();
    playSound(correctSound);
    setTimeout(() => {
      launchConfetti();
      const isFinalPuzzle = availableImages.length === 0;
      showPuzzleSolvedOverlay(isFinalPuzzle);
    }, 2000);
  }
}

// Trivia about each logo
const triviaByLogo: { [key: string]: string } = {
  github:
    "Wist je dat GitHub in 2008 is opgericht en inmiddels miljoenen ontwikkelaars wereldwijd ondersteunt?",
  vitejs:
    "Wist je dat ViteJS bekend staat om zijn razendsnelle build-tijden en gebruiksvriendelijke interface?",
  Unreal:
    "Wist je dat Unreal Engine niet alleen voor games, maar ook voor filmproducties wordt gebruikt?",
};

/** Show puzzle-solved overlay and handle final or next puzzle */
function showPuzzleSolvedOverlay(finalPuzzle = false) {
  const overlay = document.getElementById("puzzle-solved-overlay") as HTMLDivElement;
  const textElem = document.getElementById("puzzle-solved-text") as HTMLParagraphElement;
  if (overlay && textElem) {
    // Disable idle check while overlay is visible.
    isGameActive = false;
    
    const triviaText =
      triviaByLogo[currentLogoName] ||
      "Standaard weetje: tijdens de IMD opleiding leer je diverse programmeertalen zoals IOT, AR/VR, low-code platforms en AI-tools deskundig gebruiken.";
      
    textElem.innerHTML = `
      Puzzel Opgelost!<br>
      Logo: <strong>${currentLogoName}</strong><br>
      ${triviaText}
    `;
    overlay.style.display = "block";
    pauseTimer();

    setTimeout(() => {
      overlay.style.display = "none";
      if (!finalPuzzle) {
        resetPuzzle();
        if (availableImages.length > 0) {
          const randomIndex = Math.floor(Math.random() * availableImages.length);
          const selectedImage = availableImages.splice(randomIndex, 1)[0];
          currentLogoName = selectedImage.split("/").pop()?.split(".")[0] || "";
          splitLogoImage(selectedImage);
          loadNextPiece();
          resumeTimer();
          // Resume idle checking since the game is active again.
          isGameActive = true;
        }
      } else {
        if (winnerMessage) {
          winnerMessage.classList.add("show");
          const totalSeconds = Math.floor(accumulatedTime / 1000);
          const winnerText = document.querySelector("#winner-text") as HTMLParagraphElement;
          winnerText.innerHTML = `
            Je hebt alle puzzels voltooid in <strong>${totalSeconds} seconden</strong>
            met een score van <strong>${score}</strong>!
          `;
          playSound(winSound);
          if (timerInterval) clearInterval(timerInterval);
          scoreDisplay.innerText = `Score: ${score}`;
          const playAgainButton = document.querySelector("#play-again-button") as HTMLButtonElement;
          playAgainButton.onclick = () => {
            location.reload();
          };
          document.dispatchEvent(new CustomEvent("gameEnded"));
          // Game remains inactive.
        }
      }
    }, 5000);
  }
}

function resetPuzzle() {
  pieces.forEach((piece) => {
    piece.classList.remove("active", "placed");
    piece.style.left = "150px";
    piece.style.top = "250px";
  });
  gridCells.forEach((cell) => {
    cell.classList.remove("highlight", "filled");
  });
  placedPieces = 0;
  occupiedCells.clear();
  puzzleContainer.classList.remove("completed");
}

function fadeOutPuzzleLines() {
  puzzleContainer.classList.add("completed");
}

function launchConfetti() {
  const duration = 3 * 1000;
  const end = Date.now() + duration;
  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
    });
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}

function playSound(audioElement: HTMLAudioElement) {
  if (audioElement) {
    audioElement.currentTime = 0;
    audioElement.play();
  }
}

// ---------------------------
// HAND / GESTURE RECOGNITION
// ---------------------------
async function initWebcamAndGesture() {
  try {
    await hasGetUserMedia();
    await createGestureRecognizer();
    if (!isWebcamRunning) {
      await enableWebcam();
    }
  } catch (e) {
    console.error("Initialisatie fout:", e);
  }
}

async function createGestureRecognizer() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
      numHands: 1,
      runningMode: runningMode,
      baseOptions: {
        delegate: "GPU",
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
      },
    });
  } catch (error) {
    console.error("Kon Gesture Recognizer niet maken:", error);
  }
}

async function enableWebcam() {
  if (isWebcamRunning) return;
  isWebcamRunning = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
    });
    video.srcObject = stream;
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
        resolve();
      };
    });
    predictWebcam();
  } catch (e) {
    console.error("Fout bij het inschakelen van de webcam:", e);
  }
}

async function predictWebcam() {
  if (!isWebcamRunning || !video) return;
  const now = Date.now();
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      results = gestureRecognizer?.recognizeForVideo(video, now);
    } catch (error) {
      console.error("Hand tracking fout:", error);
      return;
    }
  }
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (results && results.landmarks.length > 0) {
    displayLandmarks(canvasCtx, results);
    trackHandPosition(results);
  }
  requestAnimationFrame(predictWebcam);
}

let lastFingerY = 0;
let clickCooldown = false;

function trackHandPosition(results: GestureRecognizerResult) {
  if (!results?.landmarks || results.landmarks.length === 0) return;
  const indexFinger = results.landmarks[0][8];
  if (!indexFinger) return;

  // Calculate raw coordinates
  const xPosRaw = indexFinger.x * window.innerWidth;
  const yPosRaw = indexFinger.y * window.innerHeight;

  // Determine x-coordinate mirroring logic
  const containerRect = puzzleContainer.getBoundingClientRect();
  const mirroredXPosRaw = window.innerWidth - xPosRaw;
  const xPos = mirroredXPosRaw - containerRect.left;
  const yPos = yPosRaw - containerRect.top;

  if (xPosRaw < 10 && yPosRaw < 10) return;

  if (selectedPiece) {
      const pieceHalfWidth = selectedPiece.offsetWidth / 2;
      const pieceHalfHeight = selectedPiece.offsetHeight / 2;
      selectedPiece.style.left = `${xPos - pieceHalfWidth}px`;
      selectedPiece.style.top = `${yPos - pieceHalfHeight}px`;
      // Removed automatic snapping – piece placement now occurs on explicit hand click.
  }

  document.dispatchEvent(
      new CustomEvent("handTrackingUpdate", {
          detail: { x: xPosRaw, y: yPosRaw },
      })
  );

  if (lastFingerY !== 0 && !clickCooldown) {
      if ((yPosRaw - lastFingerY) > 40) { // Increased threshold from 20 to 40 pixels
          document.dispatchEvent(new CustomEvent("handClick"));
          clickCooldown = true;
          setTimeout(() => {
              clickCooldown = false;
          }, 500);
      }
  }
  lastFingerY = yPosRaw;
}

function highlightTargetCell(piece: HTMLDivElement) {
  const targetCellId = piece.dataset.target;
  gridCells.forEach((cell) => {
    if (cell.id === targetCellId) {
      cell.classList.add("highlight");
    } else {
      cell.classList.remove("highlight");
    }
  });
}

function checkIfInsideGrid(piece: HTMLDivElement) {
  const containerRect = puzzleContainer.getBoundingClientRect();
  const pieceRect = piece.getBoundingClientRect();
  const pieceCenterX = pieceRect.left + pieceRect.width / 2;
  const pieceCenterY = pieceRect.top + pieceRect.height / 2;
  gridCells.forEach((cell) => {
    const cellRect = cell.getBoundingClientRect();
    if (
      pieceCenterX >= cellRect.left &&
      pieceCenterX <= cellRect.right &&
      pieceCenterY >= cellRect.top &&
      pieceCenterY <= cellRect.bottom
    ) {
      if (!occupiedCells.has(cell.id) && piece.dataset.target === cell.id) {
        occupiedCells.add(cell.id);
        cell.classList.remove("highlight");
        cell.classList.add("filled");
        const snapLeft = cellRect.left - containerRect.left;
        const snapTop = cellRect.top - containerRect.top;
        piece.style.left = `${snapLeft}px`;
        piece.style.top = `${snapTop}px`;
        piece.classList.remove("active");
        piece.classList.add("placed");
        placedPieces++;
        score += 3;
        scoreDisplay.innerText = `Score: ${score}`;
        if (progress) {
          progress.style.width = `${(placedPieces / gridCells.length) * 100}%`;
        }
        playSound(placeSound);
        selectedPiece = null;
        setTimeout(loadNextPiece, 500);
      }
    }
  });
}

/** Slice the selected image into puzzle pieces */
function splitLogoImage(imageSrc: string) {
  const logoImage = new Image();
  logoImage.src = imageSrc;
  logoImage.onload = () => {
    const rows = 2;
    const cols = 2;
    const pieceWidth = logoImage.width / cols;
    const pieceHeight = logoImage.height / rows;
    pieces.forEach((piece, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = pieceWidth;
      canvas.height = pieceHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const row = Math.floor(index / cols);
      const col = index % cols;
      ctx.drawImage(
        logoImage,
        col * pieceWidth,
        row * pieceHeight,
        pieceWidth,
        pieceHeight,
        0,
        0,
        pieceWidth,
        pieceHeight
      );
      const dataURL = canvas.toDataURL();
      piece.style.backgroundImage = `url(${dataURL})`;
      piece.style.backgroundSize = "cover";
    });
  };
  logoImage.onerror = (error) => {
    console.error("Error loading image:", error);
  };
}

// ---------------------------
// INFO OVERLAY / INFO BUTTON
// ---------------------------
const infoOverlay = document.getElementById("info-overlay") as HTMLDivElement;
const infoButton = document.getElementById("info-button") as HTMLButtonElement;
const closeInfoButton = document.getElementById("close-info-button") as HTMLButtonElement;

let handCursorX: number = 0;
let handCursorY: number = 0;

// Update hand cursor coordinates when hand tracking updates
document.addEventListener("handTrackingUpdate", (event: Event) => {
  const customEvent = event as CustomEvent<{ x: number; y: number }>;
  handCursorX = customEvent.detail.x;
  handCursorY = customEvent.detail.y;
});

// Function to show the info overlay
function showInfoOverlay(): void {
  if (infoOverlay) {
    infoOverlay.style.display = "block";
  }
}

// Function to hide the info overlay
function hideInfoOverlay(): void {
  if (infoOverlay) {
    infoOverlay.style.display = "none";
  }
}

// Mouse click event for the info button
if (infoButton) {
  infoButton.addEventListener("click", showInfoOverlay);
}

// Mouse click event for the close button on the overlay
if (closeInfoButton) {
  closeInfoButton.addEventListener("click", hideInfoOverlay);
}

// Hand click event: check if the hand click occurs over the info button, otherwise drop the piece.
document.addEventListener("handClick", () => {
  const infoRect = infoButton.getBoundingClientRect();
  if (
      handCursorX >= infoRect.left &&
      handCursorX <= infoRect.right &&
      handCursorY >= infoRect.top &&
      handCursorY <= infoRect.bottom
  ) {
      showInfoOverlay();
  } else if (selectedPiece) {
      checkIfInsideGrid(selectedPiece);
  }
});

// Start monitoring for interactivity when the page loads
window.addEventListener("load", () => {
  monitorInteractivity();
});

// Automatically initialize the camera and gesture recognizer on page load
window.addEventListener("load", initWebcamAndGesture);