import {
  GestureRecognizer,
  DrawingUtils,
  GestureRecognizerResult,
} from "@mediapipe/tasks-vision";

export const displayLandmarks = (
  canvasCtx: CanvasRenderingContext2D,
  results: GestureRecognizerResult
) => {
  let pencil = new DrawingUtils(canvasCtx);

  if (!results?.landmarks || results.landmarks.length === 0) return;

  results.landmarks.forEach((landmarks, index) => {
    const handedness = results.handedness[index]?.[0];
    const hand = handedness?.displayName === "Right" ? "R" : "L";

    pencil.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
      color: hand === "L" ? "purple" : "yellow",
      lineWidth: 5,
    });

    pencil.drawLandmarks(landmarks, {
      color: hand === "R" ? "black" : "orange",
      fillColor: "white",
      radius: 4,
    });
  });
};