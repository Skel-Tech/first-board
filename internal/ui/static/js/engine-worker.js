import { findMove } from "./engine.js";

self.onmessage = (event) => {
  const { id, fen, level } = event.data;
  try {
    const move = findMove(fen, level);
    self.postMessage({ id, move });
  } catch (error) {
    self.postMessage({ id, move: null, error: error instanceof Error ? error.message : "engine" });
  }
};
