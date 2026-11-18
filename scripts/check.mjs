import { Chess } from "../../node_modules/chess.js/dist/esm/chess.js";
import { LESSONS, succeeds } from "../internal/ui/static/js/lessons.js";
import { PUZZLES, gradePuzzle } from "../internal/ui/static/js/puzzles.js";

let failed = 0;
function bad(message) {
  failed += 1;
  console.error(message);
}

for (const lesson of LESSONS) {
  for (const [index, step] of lesson.steps.entries()) {
    const label = `${lesson.id}#${index}`;
    try {
      new Chess(step.fen);
    } catch (error) {
      bad(`${label} fen ${error.message}`);
      continue;
    }
    if (step.type === "move") {
      if (!succeeds(step.fen, step.solution, step.goal)) bad(`${label} solution does not meet the goal`);
    }
    if (step.type === "choose" && step.answer === "stalemate") {
      const chess = new Chess(step.fen);
      if (!chess.isStalemate()) bad(`${label} is not stalemate`);
    }
    if (step.type === "choose" && step.answer === "no") {
      const chess = new Chess(step.fen);
      if (chess.moves().includes("O-O")) bad(`${label} still allows castling`);
    }
  }
}

for (const puzzle of PUZZLES) {
  try {
    new Chess(puzzle.fen);
  } catch (error) {
    bad(`${puzzle.id} fen ${error.message}`);
    continue;
  }
  const graded = gradePuzzle(puzzle.fen, puzzle.solution, puzzle);
  if (!graded.ok) bad(`${puzzle.id} solution failed`);
  if (puzzle.kind === "mate") {
    const chess = new Chess(graded.fen);
    if (!chess.isCheckmate()) bad(`${puzzle.id} is not mate`);
  }
}

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log(`ok ${LESSONS.length} lessons, ${PUZZLES.length} drills`);
