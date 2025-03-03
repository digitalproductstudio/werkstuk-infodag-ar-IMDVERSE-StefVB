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

let startTime: number = 0;
let timerInterval: number | undefined;
let score: number = 0;

// Extra: Interval voor het triggeren van obstakels
let difficultyInterval: number | undefined;

// Obstakel-collisions
let obstacleHits = 0;
let lastCollisionTime = 0;
const collisionCooldown = 2000; // ms
let gameOverState = false;

// DOM-elementen
const video = document.querySelector("#webcam") as HTMLVideoElement;
const canvasElement = document.querySelector("#output_canvas") as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d") as CanvasRenderingContext2D;
const btnEnableWebcam = document.querySelector("#webcamButton") as HTMLButtonElement;
const gridCells = document.querySelectorAll<HTMLDivElement>(".grid-cell");
const progress = document.querySelector("#progress") as HTMLDivElement | null;
const timerDisplay = document.querySelector("#timer") as HTMLDivElement;
const scoreDisplay = document.querySelector("#score") as HTMLDivElement;
const startMenu = document.querySelector("#start-menu") as HTMLDivElement;
const startButton = document.querySelector("#start-button") as HTMLButtonElement;
const placeSound = document.querySelector("#place-sound") as HTMLAudioElement;
const winSound = document.querySelector("#win-sound") as HTMLAudioElement;

// Social share knoppen (worden alleen gebruikt bij winst)
let shareFacebookBtn: HTMLButtonElement | null = null;
let shareTwitterBtn: HTMLButtonElement | null = null;

// Puzzelstukken
const pieces = Array.from(document.querySelectorAll<HTMLDivElement>(".puzzle-piece"));
let selectedPiece: HTMLDivElement | null = null;
let placedPieces = 0;
let occupiedCells: Set<string> = new Set();

// Dynamische puzzel: Shuffle cell doelen
const cellIds = Array.from(gridCells).map((cell: HTMLDivElement) => cell.id);
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
  // Reset voor een nieuw spel
  placedPieces = 0;
  occupiedCells.clear();
  score = 0;
  obstacleHits = 0;
  gameOverState = false;
  if (progress) progress.style.width = "0%";
  timerDisplay.innerText = "Tijd: 0s";
  scoreDisplay.innerText = "Score: 0";

  await initWebcamAndGesture();
  loadNextPiece();

  // Elke 5 seconden spawnen we een obstakel (geen random meer)
  difficultyInterval = window.setInterval(() => {
    spawnObstacle();
  }, 5000);

  // Plaats persistente obstakels over de hele viewport (met een cluster-gebied)
  spawnPersistentObstacles();
}

function spawnPersistentObstacles() {
  // Maak of gebruik een container voor obstakels met een hoge z-index zodat deze boven de webcam-wrapper komen
  let container = document.getElementById("persistent-obstacles");
  if (!container) {
    container = document.createElement("div");
    container.id = "persistent-obstacles";
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.pointerEvents = "none";
    container.style.zIndex = "150"; // Hoger dan de webcam-wrapper (z-index 100)
    document.body.appendChild(container);
  }
  container.innerHTML = "";

  const numObstacles = 3;
  // Definieer een clustergebied: bv. de centrale helft van de viewport
  const clusterWidth = window.innerWidth / 2;
  const clusterHeight = window.innerHeight / 2;
  const offsetX = (window.innerWidth - clusterWidth) / 2;
  const offsetY = (window.innerHeight - clusterHeight) / 2;

  for (let i = 0; i < numObstacles; i++) {
    const obstacle = document.createElement("div");
    obstacle.className = "persistent-obstacle";
    obstacle.style.position = "absolute";
    obstacle.style.width = "50px";
    obstacle.style.height = "50px";
    obstacle.style.backgroundColor = "rgba(255, 0, 0, 0.8)";
    obstacle.style.borderRadius = "50%";

    // Kies een willekeurige positie binnen het clustergebied
    const x = offsetX + Math.random() * clusterWidth;
    const y = offsetY + Math.random() * clusterHeight;
    obstacle.style.left = `${x}px`;
    obstacle.style.top = `${y}px`;

    // Obstakel beweegt langzaam heen en weer binnen het clustergebied
    const endX = offsetX + Math.random() * clusterWidth;
    const endY = offsetY + Math.random() * clusterHeight;
    obstacle.animate(
      [
        { transform: "translate(0, 0)" },
        { transform: `translate(${endX - x}px, ${endY - y}px)` }
      ],
      { duration: 15000, iterations: Infinity, direction: "alternate", easing: "ease-in-out" }
    );

    container.appendChild(obstacle);
  }
}

function spawnObstacle() {
  // Tijdelijk obstakel binnen de puzzel-container
  const obstacle = document.createElement("div");
  obstacle.className = "obstacle";
  obstacle.style.position = "absolute";
  obstacle.style.width = "100px";
  obstacle.style.height = "100px";
  obstacle.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
  obstacle.style.zIndex = "1000";
  const puzzleContainer = document.getElementById("puzzle-container");
  if (puzzleContainer) {
    const containerRect = puzzleContainer.getBoundingClientRect();
    const startX = Math.random() * (containerRect.width - 100);
    const startY = Math.random() * (containerRect.height - 100);
    obstacle.style.left = `${startX}px`;
    obstacle.style.top = `${startY}px`;
    puzzleContainer.appendChild(obstacle);
    const endX = Math.random() * (containerRect.width - 100);
    obstacle.animate(
      [
        { left: `${startX}px` },
        { left: `${endX}px` }
      ],
      { duration: 3000, easing: "linear" }
    );
    setTimeout(() => {
      if (obstacle.parentElement) {
        obstacle.parentElement.removeChild(obstacle);
      }
    }, 3000);
  }
}

function updateTimer() {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  timerDisplay.innerText = `Tijd: ${seconds}s`;
}

function shuffleArray(array: string[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
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
  if (gameOverState) return;
  if (!results?.landmarks || results.landmarks.length === 0 || !selectedPiece) return;
  const indexFinger = results.landmarks[0][8];
  if (!indexFinger) return;
  const normalizedX = indexFinger.x;
  const normalizedY = indexFinger.y;
  const xPos = normalizedX * window.innerWidth;
  const yPos = normalizedY * window.innerHeight;
  const pieceHalfWidth = selectedPiece.offsetWidth / 2;
  const pieceHalfHeight = selectedPiece.offsetHeight / 2;
  selectedPiece.style.left = `${xPos - pieceHalfWidth}px`;
  selectedPiece.style.top = `${yPos - pieceHalfHeight}px`;

  // Check voor botsingen met persistente obstakels
  checkPersistentObstaclesCollision(selectedPiece);

  checkIfInsideGrid(selectedPiece);
}

function highlightTargetCell(piece: HTMLDivElement) {
  gridCells.forEach((cell: HTMLDivElement) => {
    cell.classList.remove("highlight");
    if (piece.dataset.target === cell.id) {
      cell.classList.add("highlight");
    }
  });
}

function checkIfInsideGrid(piece: HTMLDivElement) {
  let inCell = false;
  let correctCell: HTMLDivElement | null = null;
  let wrongCell: HTMLDivElement | null = null;
  gridCells.forEach((cell: HTMLDivElement) => {
    const cellRect = cell.getBoundingClientRect();
    const pieceRect = piece.getBoundingClientRect();
    if (
      pieceRect.left >= cellRect.left &&
      pieceRect.right <= cellRect.right &&
      pieceRect.top >= cellRect.top &&
      pieceRect.bottom <= cellRect.bottom
    ) {
      inCell = true;
      if (piece.dataset.target === cell.id && !occupiedCells.has(cell.id)) {
        correctCell = cell;
      } else {
        wrongCell = cell;
      }
    }
  });

  if (inCell) {
    if (correctCell !== null) {
      occupiedCells.add((correctCell as HTMLDivElement).id);
      (correctCell as HTMLDivElement).classList.remove("highlight");
      (correctCell as HTMLDivElement).classList.add("filled");
      piece.style.position = "absolute";
      piece.style.left = `${(correctCell as HTMLDivElement).offsetLeft}px`;
      piece.style.top = `${(correctCell as HTMLDivElement).offsetTop}px`;
      piece.classList.remove("active");
      piece.classList.add("placed");
      placedPieces++;
      score += 10;
      if (progress) {
        progress.style.width = `${(placedPieces / gridCells.length) * 100}%`;
      }
      playSound(placeSound);
      piece.classList.add("bounce-animation");
      setTimeout(() => {
        piece.classList.remove("bounce-animation");
      }, 500);
      // Zorg dat bij een correcte plaatsing ook een obstakel (tijdelijk) verschijnt
      spawnObstacle();
      selectedPiece = null;
      setTimeout(loadNextPiece, 500);
    } else if (wrongCell !== null) {
      if (!piece.classList.contains("penalized")) {
        piece.classList.add("penalized");
        score -= 5;
        scoreDisplay.innerText = `Score: ${score}`;
        piece.classList.add("shake-animation");
        piece.style.border = "2px solid red";
        setTimeout(() => {
          piece.classList.remove("shake-animation");
          piece.style.border = "";
          piece.classList.remove("penalized");
        }, 500);
      }
    }
  }
}

function isIntersecting(rect1: DOMRect, rect2: DOMRect): boolean {
  return !(
    rect2.left > rect1.right ||
    rect2.right < rect1.left ||
    rect2.top > rect1.bottom ||
    rect2.bottom < rect1.top
  );
}

function checkPersistentObstaclesCollision(piece: HTMLDivElement) {
  const container = document.getElementById("persistent-obstacles");
  if (!container) return;
  const obstacles = container.children;
  const pieceRect = piece.getBoundingClientRect();
  for (let i = 0; i < obstacles.length; i++) {
    const obsRect = obstacles[i].getBoundingClientRect();
    if (isIntersecting(pieceRect, obsRect)) {
      if (Date.now() - lastCollisionTime > collisionCooldown) {
        lastCollisionTime = Date.now();
        handleObstacleCollision();
        break;
      }
    }
  }
}

function handleObstacleCollision() {
  obstacleHits++;
  showCollisionWarning(obstacleHits);
  // Voeg een smooth animatie toe voor de botsing
  if (selectedPiece) {
    selectedPiece.classList.add("smooth-hit");
    setTimeout(() => {
      selectedPiece?.classList.remove("smooth-hit");
    }, 800);
  }
  if (obstacleHits >= 3) {
    gameOver();
  }
}

function showCollisionWarning(hitCount: number) {
  let warningDiv = document.getElementById("collision-warning");
  if (!warningDiv) {
    warningDiv = document.createElement("div");
    warningDiv.id = "collision-warning";
    warningDiv.style.position = "absolute";
    warningDiv.style.top = "10px";
    warningDiv.style.left = "50%";
    warningDiv.style.transform = "translateX(-50%)";
    warningDiv.style.padding = "10px 20px";
    warningDiv.style.backgroundColor = "rgba(255, 0, 0, 0.8)";
    warningDiv.style.color = "#fff";
    warningDiv.style.fontSize = "1.2rem";
    warningDiv.style.zIndex = "1000";
    warningDiv.style.borderRadius = "10px";
    document.body.appendChild(warningDiv);
  }
  warningDiv.innerText = `Warning: Obstacle hit ${hitCount} of 3!`;
  setTimeout(() => {
    if (warningDiv.parentElement) {
      warningDiv.parentElement.removeChild(warningDiv);
    }
  }, 2000);
}

function gameOver() {
  gameOverState = true;
  if (difficultyInterval) clearInterval(difficultyInterval);
  if (timerInterval) clearInterval(timerInterval);

  // Maak een lost message container aan
  let lostMessage = document.getElementById("lost-message") as HTMLDivElement;
  if (!lostMessage) {
    lostMessage = document.createElement("div");
    lostMessage.id = "lost-message";
    lostMessage.innerHTML = `
      <div id="lost-content">
        <h2>Game Over!</h2>
        <p id="lost-text">Je hebt te vaak obstakels geraakt. Probeer het opnieuw!</p>
        <button id="play-again-button">Opnieuw Spelen</button>
      </div>
    `;
    document.body.appendChild(lostMessage);

    // Zorg dat de "Opnieuw Spelen" knop werkt
    const playAgainButton = lostMessage.querySelector("#play-again-button") as HTMLButtonElement;
    playAgainButton.addEventListener("click", () => {
      location.reload();
    });
  }

  // Speel het lose-geluid af
  const loseSound = document.querySelector("#lose-sound") as HTMLAudioElement;
  playSound(loseSound);
}

function randomEvent() {
  const eventType = Math.random() < 0.5 ? "swap" : "hide";
  if (eventType === "swap") {
    const availableCells = Array.from(gridCells)
      .filter((cell: HTMLDivElement) => !occupiedCells.has(cell.id)) as HTMLDivElement[];
    if (availableCells.length >= 2) {
      const idx1 = Math.floor(Math.random() * availableCells.length);
      let idx2 = Math.floor(Math.random() * availableCells.length);
      while (idx2 === idx1) {
        idx2 = Math.floor(Math.random() * availableCells.length);
      }
      const cell1 = availableCells[idx1];
      const cell2 = availableCells[idx2];
      pieces.forEach(piece => {
        if (piece.dataset.target === cell1.id) {
          piece.dataset.target = cell2.id;
        } else if (piece.dataset.target === cell2.id) {
          piece.dataset.target = cell1.id;
        }
      });
      if (selectedPiece) {
        highlightTargetCell(selectedPiece);
      }
    }
  } else if (eventType === "hide") {
    const availableCells = Array.from(gridCells)
      .filter((cell: HTMLDivElement) => !cell.classList.contains("filled")) as HTMLDivElement[];
    if (availableCells.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableCells.length);
      const cell = availableCells[randomIndex];
      cell.style.visibility = "hidden";
      setTimeout(() => {
        cell.style.visibility = "visible";
      }, 3000);
    }
  }
  setTimeout(randomEvent, 10000);
}

// call randomEvent
randomEvent();

function loadNextPiece() {
  if (!timerInterval) {
    startTime = Date.now();
    timerInterval = window.setInterval(updateTimer, 1000);
  }
  let nextPiece = document.querySelector<HTMLDivElement>(
    ".puzzle-piece:not(.active):not(.placed)"
  );
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
  if (placedPieces === gridCells.length) {
    if (difficultyInterval) clearInterval(difficultyInterval);
    launchConfetti();
    // Gebruik de bestaande winner-message voor winst (game over is via lost-message)
    const winnerMessage = document.getElementById("winner-message");
    if (winnerMessage) {
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
}

function launchConfetti() {
  const duration = 3000;
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