declare var confetti: any;

import { displayLandmarks } from "./lib/display";
import { hasGetUserMedia } from "./lib/utils";
import "./main.css";

import {
  FilesetResolver,
  GestureRecognizer,
  GestureRecognizerResult,
} from "@mediapipe/tasks-vision";

// Variables
declare type RunningMode = "IMAGE" | "VIDEO";
let runningMode: RunningMode = "VIDEO";
let gestureRecognizer: GestureRecognizer | undefined;
let isWebcamRunning: boolean = false;
let lastVideoTime = -1;
let results: GestureRecognizerResult | undefined = undefined;

// Timer and score
let startTime: number = 0;
let timerInterval: number | undefined;
let score: number = 0;

// New variables to handle multiple puzzles
let puzzlesSolved = 0;
const imageSources = [
  "/werkstuk-infodag-ar-IMDVERSE-StefVB/img/github.svg",
  "/werkstuk-infodag-ar-IMDVERSE-StefVB/img/vitejs.svg",
  "/werkstuk-infodag-ar-IMDVERSE-StefVB/img/Unreal.png"
];
// Create a copy of imageSources to keep track of available images
let availableImages = [...imageSources]; // Use each image exactly once

// DOM elements
const video = document.querySelector("#webcam") as HTMLVideoElement;
const canvasElement = document.querySelector("#output_canvas") as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d") as CanvasRenderingContext2D;
const btnEnableWebcam = document.querySelector("#webcamButton") as HTMLButtonElement;
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
// Social share buttons
let shareFacebookBtn: HTMLButtonElement | null = null;
let shareTwitterBtn: HTMLButtonElement | null = null;

// Puzzle pieces
let pieces = Array.from(document.querySelectorAll(".puzzle-piece")) as HTMLDivElement[];
let selectedPiece: HTMLDivElement | null = null;
let placedPieces = 0;
let occupiedCells: Set<string> = new Set();

// Assign puzzle pieces to the grid cells in order (no shuffle)
const cellIds = Array.from(gridCells).map((cell) => cell.id);
pieces.forEach((piece, idx) => {
  piece.dataset.target = cellIds[idx];
});

// Start game via start menu
startButton.addEventListener("click", () => {
  startMenu.style.display = "none";
  startGame();
});

async function startGame() {
  await initWebcamAndGesture();
  // Record the start time for the first puzzle.
  startTime = Date.now();
  // Pick a random image from availableImages and remove it from the list
  const randomIndex = Math.floor(Math.random() * availableImages.length);
  const selectedImage = availableImages.splice(randomIndex, 1)[0];
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
    btnEnableWebcam?.addEventListener("click", enableWebcam);
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
  if (!results?.landmarks || results.landmarks.length === 0 || !selectedPiece) return;

  const indexFinger = results.landmarks[0][8];
  if (!indexFinger) return;

  // Get the puzzle container's bounding rectangle
  const containerRect = puzzleContainer.getBoundingClientRect();

  // Calculate the position based on window dimensions
  const xPosWindow = indexFinger.x * window.innerWidth;
  const yPosWindow = indexFinger.y * window.innerHeight;

  // Translate window coordinates into coordinates relative to the puzzle container
  const xPos = xPosWindow - containerRect.left;
  const yPos = yPosWindow - containerRect.top;

  const pieceHalfWidth = selectedPiece.offsetWidth / 2;
  const pieceHalfHeight = selectedPiece.offsetHeight / 2;

  selectedPiece.style.left = `${xPos - pieceHalfWidth}px`;
  selectedPiece.style.top = `${yPos - pieceHalfHeight}px`;

  checkIfInsideGrid(selectedPiece);
}

/** 
 * Snaps a puzzle piece inside puzzle-container coordinates.
 */
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
        // Load next piece (if any) after a short delay
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
    // Timer already started in startGame()
    timerInterval = window.setInterval(updateTimer, 1000);
  }

  // If there are still pieces to place for the current puzzle:
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

/**
 * Checks if the current puzzle is complete and either resets for the next puzzle or shows the final win message.
 */
function checkForPuzzleCompletion() {
  if (placedPieces === gridCells.length) {
    puzzlesSolved++;
    fadeOutPuzzleLines();

    setTimeout(() => {
      launchConfetti();

      if (availableImages.length > 0) {
        // More puzzles available: reset puzzle state and load a new puzzle
        resetPuzzle();
        const randomIndex = Math.floor(Math.random() * availableImages.length);
        const selectedImage = availableImages.splice(randomIndex, 1)[0];
        splitLogoImage(selectedImage);
        loadNextPiece();
      } else {
        // No more images left: final puzzle completed, show winner message.
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

          shareFacebookBtn = document.querySelector("#share-facebook") as HTMLButtonElement;
          shareTwitterBtn = document.querySelector("#share-twitter") as HTMLButtonElement;

          if (shareFacebookBtn) {
            shareFacebookBtn.addEventListener("click", () => {
              const shareUrl = encodeURIComponent(window.location.href);
              const shareText = encodeURIComponent(
                `Ik heb alle puzzels voltooid in ${seconds} seconden met een score van ${score}!`
              );
              window.open(
                `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}&quote=${shareText}`,
                "_blank"
              );
            });
          }

          if (shareTwitterBtn) {
            shareTwitterBtn.addEventListener("click", () => {
              const shareText = encodeURIComponent(
                `Ik heb alle puzzels voltooid in ${seconds} seconden met een score van ${score}!`
              );
              window.open(
                `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(
                  window.location.href
                )}`,
                "_blank"
              );
            });
          }
        }
      }
    }, 2000);
  }
}

/**
 * Resets puzzle-specific state so a new puzzle can begin.
 */
function resetPuzzle() {
  // Reset puzzle piece classes and positions
  pieces.forEach((piece) => {
    piece.classList.remove("active", "placed");
    piece.style.left = "150px";
    piece.style.top = "250px";
  });
  // Clear grid cell highlights and filled classes
  gridCells.forEach((cell) => {
    cell.classList.remove("highlight", "filled");
  });
  // Reset puzzle counters
  placedPieces = 0;
  occupiedCells.clear();
  // Remove the "completed" class from the puzzle container
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