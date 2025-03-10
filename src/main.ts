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
// TIMER AND SCORE
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

/** Update the on-screen timer every second */
function updateTimer() {
  // Total active time in ms = accumulatedTime + time since current session started
  const totalMs = accumulatedTime + (Date.now() - startTime);
  const seconds = Math.floor(totalMs / 1000);
  timerDisplay.innerText = `Tijd: ${seconds}s`;
}

/** Pause the timer (accumulate current session) */
function pauseTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = undefined;
    // Add the time from the current session to the accumulated total
    accumulatedTime += (Date.now() - startTime);
  }
}

/** Resume the timer (start a new active session) */
function resumeTimer() {
  if (!timerInterval) {
    // Mark a new "start time" for this session
    startTime = Date.now();
    timerInterval = window.setInterval(updateTimer, 1000);
  }
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
const placeSound = document.querySelector("#place-sound") as HTMLAudioElement;
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
  startGame();
});

function startGame() {
  // Reset timing
  accumulatedTime = 0;
  startTime = Date.now();
  score = 0;
  scoreDisplay.innerText = `Score: ${score}`;

  // Pick a random image
  const randomIndex = Math.floor(Math.random() * availableImages.length);
  const selectedImage = availableImages.splice(randomIndex, 1)[0];
  currentLogoName = selectedImage.split("/").pop()?.split(".")[0] || "";
  splitLogoImage(selectedImage);
  loadNextPiece();
}

function loadNextPiece() {
  // If timer isn't running, resume it
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
    const triviaText =
      triviaByLogo[currentLogoName] ||
      "Standaard weetje: tijdens de IMD opleiding leer je diverse programmeertalen zoals IOT, AR/VR, low-code platforms en AI-tools deskundig gebruiken.";

    textElem.innerHTML = `
      Puzzel Opgelost!<br>
      Logo: <strong>${currentLogoName}</strong><br>
      ${triviaText}
    `;
    overlay.style.display = "block";

    // Pause the timer while overlay is shown
    pauseTimer();

    setTimeout(() => {
      overlay.style.display = "none";
      if (!finalPuzzle) {
        // Not the final puzzle, reset puzzle and load next
        resetPuzzle();
        if (availableImages.length > 0) {
          const randomIndex = Math.floor(Math.random() * availableImages.length);
          const selectedImage = availableImages.splice(randomIndex, 1)[0];
          currentLogoName = selectedImage.split("/").pop()?.split(".")[0] || "";
          splitLogoImage(selectedImage);
          loadNextPiece();
          resumeTimer();
        }
      } else {
        // Final puzzle solved
        if (winnerMessage) {
          winnerMessage.classList.add("show");

          // We already paused the timer, so 'accumulatedTime' is the complete active time
          // DO NOT add (Date.now() - startTime) again
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

  // Convert from [0..1] to window coordinates
  const xPosWindow = indexFinger.x * window.innerWidth;
  const yPosWindow = indexFinger.y * window.innerHeight;

  if (xPosWindow < 10 && yPosWindow < 10) {
    return;
  }

  // Move active puzzle piece
  if (selectedPiece) {
    const containerRect = puzzleContainer.getBoundingClientRect();
    const xPos = xPosWindow - containerRect.left;
    const yPos = yPosWindow - containerRect.top;
    const pieceHalfWidth = selectedPiece.offsetWidth / 2;
    const pieceHalfHeight = selectedPiece.offsetHeight / 2;
    selectedPiece.style.left = `${xPos - pieceHalfWidth}px`;
    selectedPiece.style.top = `${yPos - pieceHalfHeight}px`;
    checkIfInsideGrid(selectedPiece);
  }

  // Dispatch event for custom cursor
  document.dispatchEvent(
    new CustomEvent("handTrackingUpdate", {
      detail: { x: xPosWindow, y: yPosWindow },
    })
  );

  // Simple "tap" gesture logic: if the finger moves down quickly
  if (lastFingerY !== 0 && !clickCooldown) {
    if ((yPosWindow - lastFingerY) > 20) {
      document.dispatchEvent(new CustomEvent("handClick"));
      clickCooldown = true;
      setTimeout(() => {
        clickCooldown = false;
      }, 500);
    }
  }
  lastFingerY = yPosWindow;
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
      // If the correct cell is not yet occupied, place the piece
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

// Automatically initialize the camera and gesture recognizer on page load
window.addEventListener("load", initWebcamAndGesture);