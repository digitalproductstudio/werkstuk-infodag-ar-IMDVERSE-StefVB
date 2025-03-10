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

let lastFingerY = 0;
let clickCooldown = false;

// Variables
let runningMode: "IMAGE" | "VIDEO" = "VIDEO";
let gestureRecognizer: GestureRecognizer | undefined;
let isWebcamRunning = false;
let lastVideoTime = -1;
let results: GestureRecognizerResult | undefined = undefined;

// Timer and score
let startTime = 0;
let timerInterval: number | undefined;
let score = 0;

// Variables for multiple puzzles
let puzzlesSolved = 0;
const imageSources = [
  "/werkstuk-infodag-ar-IMDVERSE-StefVB/img/github.svg",
  "/werkstuk-infodag-ar-IMDVERSE-StefVB/img/vitejs.svg",
  "/werkstuk-infodag-ar-IMDVERSE-StefVB/img/Unreal.png",
];
// Use each image exactly once
let availableImages = [...imageSources];
// Store current logo name (extracted from file name)
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

// Assign puzzle pieces to the grid cells (no shuffle)
const cellIds = Array.from(gridCells).map((cell) => cell.id);
pieces.forEach((piece, idx) => {
  piece.dataset.target = cellIds[idx];
});

// Start game via start menu
startButton.addEventListener("click", () => {
  // Dispatch event to hide the custom cursor during gameplay.
  document.dispatchEvent(new CustomEvent("gameStarted"));
  startMenu.style.display = "none";
  startGame();
});

async function startGame() {
  // (Camera and gesture recognizer are already running.)
  startTime = Date.now();
  // Pick a random image from availableImages and remove it from the list
  const randomIndex = Math.floor(Math.random() * availableImages.length);
  const selectedImage = availableImages.splice(randomIndex, 1)[0];
  currentLogoName = selectedImage.split("/").pop()?.split(".")[0] || "";
  splitLogoImage(selectedImage);
  loadNextPiece();
}

function updateTimer() {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  timerDisplay.innerText = `Tijd: ${seconds}s`;
}

async function initWebcamAndGesture() {
  try {
    await hasGetUserMedia();
    await createGestureRecognizer();
    // Automatically enable the webcam on page load.
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

function trackHandPosition(results: GestureRecognizerResult) {
  if (!results?.landmarks || results.landmarks.length === 0) return;
  const indexFinger = results.landmarks[0][8];
  if (!indexFinger) return;

  // Calculate hand coordinates in window space
  const xPosWindow = indexFinger.x * window.innerWidth;
  const yPosWindow = indexFinger.y * window.innerHeight;

  // If the coordinates appear invalid (e.g. near 0,0), assume no hand is in view
  if (xPosWindow < 10 && yPosWindow < 10) {
    return;
  }

  // If a puzzle piece is active, update its position.
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

  // Dispatch the hand tracking update event so the custom cursor follows the hand.
  document.dispatchEvent(
    new CustomEvent("handTrackingUpdate", {
      detail: { x: xPosWindow, y: yPosWindow },
    })
  );

  // --- New logic for a "tap" gesture based on downward finger movement ---
  // Check if the index finger moved downward by more than 20 pixels.
  if (lastFingerY !== 0 && !clickCooldown) {
    if ((yPosWindow - lastFingerY) > 20) {
      // Simulate a click event.
      document.dispatchEvent(new CustomEvent("handClick"));
      clickCooldown = true;
      // Set a cooldown to prevent multiple clicks from one tap.
      setTimeout(() => {
        clickCooldown = false;
      }, 500);
    }
  }
  // Update lastFingerY for the next frame.
  lastFingerY = yPosWindow;  
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
        score += 10;
        if (progress) {
          progress.style.width = `${(placedPieces / gridCells.length) * 100}%`;
        }
        playSound(placeSound);
        selectedPiece = null;
        // Load next piece after a short delay.
        setTimeout(loadNextPiece, 500);
      }
    }
  });
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

function loadNextPiece() {
  if (!timerInterval) {
    timerInterval = window.setInterval(updateTimer, 1000);
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
    // All pieces placed; check for puzzle completion.
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

// Facts about the IMD Course
const triviaByLogo: { [key: string]: string } = {
  github:
    "Wist je dat GitHub in 2008 is opgericht en inmiddels miljoenen ontwikkelaars wereldwijd ondersteunt?",
  vitejs:
    "Wist je dat ViteJS bekend staat om zijn razendsnelle build-tijden en gebruiksvriendelijke interface?",
  Unreal:
    "Wist je dat Unreal Engine niet alleen voor games, maar ook voor filmproducties wordt gebruikt?",
};

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
        }
      } else {
        if (winnerMessage) {
          winnerMessage.classList.add("show");
          const seconds = Math.floor((Date.now() - startTime) / 1000);
          const winnerText = document.querySelector("#winner-text") as HTMLParagraphElement;
          winnerText.innerHTML = `
            Je hebt alle puzzels voltooid in <strong>${seconds} seconden</strong>
            met een score van <strong>${score}</strong>!
          `;
          playSound(winSound);
          if (timerInterval) clearInterval(timerInterval);
          scoreDisplay.innerText = `Score: ${score}`;
          const playAgainButton = document.querySelector("#play-again-button") as HTMLButtonElement;
          playAgainButton.onclick = () => {
            location.reload();
          };
          // Dispatch event to re-enable the custom cursor now that the game has ended.
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

/**
 * Slices the selected image into puzzle pieces.
 * @param imageSrc - The URL of the image to be sliced.
 */
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

// Automatically initialize the camera and gesture recognizer on page load.
window.addEventListener("load", initWebcamAndGesture);
