import { displayLandmarks } from "./lib/display";
import { hasGetUserMedia } from "./lib/utils";
import "./main.css";

import {
  FilesetResolver,
  GestureRecognizer,
  GestureRecognizerResult
} from "@mediapipe/tasks-vision";

// Variabelen
declare type RunningMode = "IMAGE" | "VIDEO";
let runningMode: RunningMode = "VIDEO";
let gestureRecognizer: GestureRecognizer | undefined;
let isWebcamRunning: boolean = false;
let lastVideoTime = -1;
let results: GestureRecognizerResult | undefined = undefined;

// DOM-elementen
const video = document.querySelector("#webcam") as HTMLVideoElement;
const canvasElement = document.querySelector("#output_canvas") as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d") as CanvasRenderingContext2D;
const btnEnableWebcam = document.querySelector("#webcamButton") as HTMLButtonElement;
const gridCells = document.querySelectorAll(".grid-cell") as NodeListOf<HTMLDivElement>;
const progress = document.querySelector("#progress") as HTMLDivElement | null;
const winnerMessage = document.querySelector("#winner-message") as HTMLDivElement | null;
let selectedPiece: HTMLDivElement | null = document.querySelector(".puzzle-piece.active");
let placedPieces = 0;
let occupiedCells: Set<string> = new Set();

init();

async function init() {
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
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
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
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
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

  // Update the active puzzle piece position based on hand index finger
  selectedPiece.style.left = `${Math.max(10, Math.min(indexFinger.x * window.innerWidth, window.innerWidth - 100))}px`;
  selectedPiece.style.top = `${Math.max(10, Math.min(indexFinger.y * window.innerHeight, window.innerHeight - 100))}px`;

  highlightTargetCell(selectedPiece);
  checkIfInsideGrid(selectedPiece);
}

function highlightTargetCell(piece: HTMLDivElement) {
  gridCells.forEach(cell => {
    cell.classList.remove("highlight");

    if (piece.dataset.target === cell.id) {
      cell.classList.add("highlight");
    }
  });
}

function checkIfInsideGrid(piece: HTMLDivElement) {
  gridCells.forEach((cell) => {
    const cellRect = cell.getBoundingClientRect();
    const pieceRect = piece.getBoundingClientRect();

    if (
      pieceRect.left >= cellRect.left &&
      pieceRect.right <= cellRect.right &&
      pieceRect.top >= cellRect.top &&
      pieceRect.bottom <= cellRect.bottom
    ) {
      if (!occupiedCells.has(cell.id) && piece.dataset.target === cell.id) {
        occupiedCells.add(cell.id);
        cell.classList.remove("highlight");
        cell.classList.add("filled");

        // Snap the piece into the cell
        piece.style.position = "absolute";
        piece.style.left = `${cell.offsetLeft}px`;
        piece.style.top = `${cell.offsetTop}px`;
        piece.classList.remove("active");
        piece.classList.add("placed");

        placedPieces++;

        if (progress) {
          progress.style.width = `${(placedPieces / gridCells.length) * 100}%`;
        }

        // Stop updating this piece and load the next one
        selectedPiece = null;
        setTimeout(loadNextPiece, 500);
      }
    }
  });
}

function loadNextPiece() {
  // Only select pieces that are not yet placed.
  let nextPiece = document.querySelector(".puzzle-piece:not(.active):not(.placed)") as HTMLDivElement | null;
  if (nextPiece) {
    nextPiece.classList.add("active");
    selectedPiece = nextPiece;

    nextPiece.style.left = "150px";
    nextPiece.style.top = "250px";
    highlightTargetCell(nextPiece);
  } else {
    checkForWinner();
  }
}

function checkForWinner() {
  if (placedPieces === gridCells.length && winnerMessage) {
    winnerMessage.style.display = "block";
  }
}