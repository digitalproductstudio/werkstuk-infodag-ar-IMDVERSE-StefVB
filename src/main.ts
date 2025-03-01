declare var confetti: any;

import { displayLandmarks } from "./lib/display";
import { hasGetUserMedia } from "./lib/utils";
import "./main.css";

import {
  FilesetResolver,
  GestureRecognizer,
  GestureRecognizerResult,
} from "@mediapipe/tasks-vision";

// Variabelen
declare type RunningMode = "IMAGE" | "VIDEO";
let runningMode: RunningMode = "VIDEO";
let gestureRecognizer: GestureRecognizer | undefined;
let isWebcamRunning: boolean = false;
let lastVideoTime = -1;
let results: GestureRecognizerResult | undefined = undefined;

// Timer en score
let startTime: number = 0;
let timerInterval: number | undefined;
let score: number = 0;

// DOM-elementen
const video = document.querySelector("#webcam") as HTMLVideoElement;
const canvasElement = document.querySelector("#output_canvas") as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d") as CanvasRenderingContext2D;
const btnEnableWebcam = document.querySelector("#webcamButton") as HTMLButtonElement;
const gridCells = document.querySelectorAll(".grid-cell") as NodeListOf<HTMLDivElement>;
const progress = document.querySelector("#progress") as HTMLDivElement | null;
const winnerMessage = document.querySelector("#winner-message") as HTMLDivElement | null;
const timerDisplay = document.querySelector("#timer") as HTMLDivElement;
const scoreDisplay = document.querySelector("#score") as HTMLDivElement;
const startMenu = document.querySelector("#start-menu") as HTMLDivElement;
const startButton = document.querySelector("#start-button") as HTMLButtonElement;
const placeSound = document.querySelector("#place-sound") as HTMLAudioElement;
const winSound = document.querySelector("#win-sound") as HTMLAudioElement;

// Social share knoppen
let shareFacebookBtn: HTMLButtonElement | null = null;
let shareTwitterBtn: HTMLButtonElement | null = null;

// Puzzelstukken
let pieces = Array.from(document.querySelectorAll(".puzzle-piece")) as HTMLDivElement[];
let selectedPiece: HTMLDivElement | null = null;
let placedPieces = 0;
let occupiedCells: Set<string> = new Set();

// Dynamische puzzel: Shuffle cell doelen
const cellIds = Array.from(gridCells).map(cell => cell.id);
shuffleArray(cellIds);
pieces.forEach((piece, idx) => {
  piece.dataset.target = cellIds[idx];
});

// Start spel via startmenu
startButton.addEventListener("click", () => {
  startMenu.style.display = "none";
  startGame();
});

async function startGame() {
  await initWebcamAndGesture();
  loadNextPiece();
}

// Timer functie: wordt pas gestart bij het eerste puzzelstuk
function updateTimer() {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  timerDisplay.innerText = `Tijd: ${seconds}s`;
}

// Shuffle functie (Fisher-Yates)
function shuffleArray(array: string[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Initialisatie van webcam en gesture recognizer
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

  // indexFinger.x en indexFinger.y zijn meestal genormaliseerd (tussen 0 en 1)
  const normalizedX = indexFinger.x; // 0..1
  const normalizedY = indexFinger.y; // 0..1

  // Schaal deze naar de volledige browserbreedte/hoogte
  const xPos = normalizedX * window.innerWidth;
  const yPos = normalizedY * window.innerHeight;

  // Puzzelstuk centreren
  const pieceHalfWidth = selectedPiece.offsetWidth / 2;
  const pieceHalfHeight = selectedPiece.offsetHeight / 2;

  // Zet het puzzelstuk op die positie
  selectedPiece.style.left = `${xPos - pieceHalfWidth}px`;
  selectedPiece.style.top = `${yPos - pieceHalfHeight}px`;

  checkIfInsideGrid(selectedPiece);
}


function highlightTargetCell(piece: HTMLDivElement) {
  gridCells.forEach((cell) => {
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

        // Snap het stuk in de cel
        piece.style.position = "absolute";
        piece.style.left = `${cell.offsetLeft}px`;
        piece.style.top = `${cell.offsetTop}px`;
        piece.classList.remove("active");
        piece.classList.add("placed");

        placedPieces++;
        score += 10;
        if (progress) {
          progress.style.width = `${(placedPieces / gridCells.length) * 100}%`;
        }
        playSound(placeSound);

        // Stop met updaten en laad het volgende stuk
        selectedPiece = null;
        setTimeout(loadNextPiece, 500);
      }
    }
  });
}

function loadNextPiece() {
  if (!timerInterval) {
    startTime = Date.now();
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
    checkForWinner();
  }
}

function checkForWinner() {
  if (placedPieces === gridCells.length && winnerMessage) {
    launchConfetti();
    winnerMessage.classList.add("show");

    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const winnerText = document.querySelector("#winner-text") as HTMLParagraphElement;
    winnerText.innerHTML = `
      Je hebt de puzzel voltooid in <strong>${seconds} seconden</strong>
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
          `Ik heb zojuist de puzzel voltooid in ${seconds} seconden met een score van ${score}!`
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
          `Ik heb zojuist de puzzel voltooid in ${seconds} seconden met een score van ${score}!`
        );
        window.open(
          `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(window.location.href)}`,
          "_blank"
        );
      });
    }
  }
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