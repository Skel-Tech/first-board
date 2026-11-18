import { Chess } from "../vendor/chess.js";

export const PUZZLES = [
  {
    id: "back-rank",
    title: "Back rank",
    kind: "mate",
    fen: "6k1/5ppp/8/8/8/8/8/4Q2K w - - 0 1",
    solution: { from: "e1", to: "e8" },
    prompt: "White to move. Checkmate in one.",
    hint: "The queen can reach the eighth rank.",
    miss: "Not mate. The king needs to be in check with nowhere to go.",
    why: "The queen on e8 attacks the king, and the black pawns block the escape squares.",
  },
  {
    id: "queen-help",
    title: "Queen and king",
    kind: "mate",
    fen: "7k/8/5KQ1/8/8/8/8/8 w - - 0 1",
    solution: { from: "g6", to: "g7" },
    prompt: "White to move. The king helps the queen. Mate in one.",
    hint: "The queen steps next to the black king, and your king protects her.",
    miss: "He can still get out, or he can take the queen. Try g7.",
    why: "Qg7 is check, the white king protects the queen, and g8, g7, and h7 are all covered.",
  },
  {
    id: "beside",
    title: "Protected queen",
    kind: "mate",
    fen: "6k1/4Q3/6K1/8/8/8/8/8 w - - 0 1",
    solution: { from: "e7", to: "g7" },
    prompt: "White to move. Step the queen beside the king, where your own king protects her.",
    hint: "g7 is check, and the king on g6 guards the queen.",
    miss: "If the queen is not protected, the king can take her.",
    why: "Qg7 is protected by the king. f7, f8, g8, h7, and h8 are all covered.",
  },
  {
    id: "open-file",
    title: "Open file",
    kind: "mate",
    fen: "6k1/8/6K1/8/8/8/8/R7 w - - 0 1",
    solution: { from: "a1", to: "a8" },
    prompt: "White to move. The rook has a whole file. Mate in one.",
    hint: "a8 checks along the eighth rank. Your king already covers the escape squares.",
    miss: "Slide the rook to the eighth rank.",
    why: "Ra8 checks, and the king on g6 covers f7, g7, and h7.",
  },
  {
    id: "quiet-queen",
    title: "One square away",
    kind: "mate",
    fen: "7k/4Q3/6K1/8/8/8/8/8 w - - 0 1",
    solution: { from: "e7", to: "e8" },
    prompt: "White to move. Mate in one. Do not put the queen where the king can take her.",
    hint: "e8 is check along the rank, and the queen is not next to the king.",
    miss: "If the queen stands beside the king, he may be able to capture her.",
    why: "Qe8 checks from a distance. The white king covers the squares the queen does not.",
  },
  {
    id: "loose-queen",
    title: "Loose queen",
    kind: "capture",
    fen: "6qk/8/8/8/8/8/B7/4K3 w - - 0 1",
    solution: { from: "a2", to: "g8" },
    prompt: "The black queen is on the bishop's diagonal. Take her.",
    hint: "The bishop on a2 looks toward g8.",
    miss: "There is a bigger piece to take.",
    why: "A queen left on an open diagonal does not stay there.",
  },
  {
    id: "knight-takes",
    title: "Knight jump",
    kind: "capture",
    fen: "6k1/5q2/8/6N1/8/8/8/4K3 w - - 0 1",
    solution: { from: "g5", to: "f7" },
    prompt: "The knight can take the queen. A knight for a queen is a trade you take.",
    hint: "The knight on g5 jumps to f7.",
    miss: "Look for the jump that lands on the queen.",
    why: "The king can recapture the knight, and you are still a queen ahead.",
  },
  {
    id: "last-rank",
    title: "Last rank",
    kind: "mate",
    fen: "7k/5P2/6K1/8/8/8/8/8 w - - 0 1",
    solution: { from: "f7", to: "f8", promotion: "q" },
    prompt: "White to move. Promote the pawn to a queen and mate.",
    hint: "f8, and choose the queen.",
    miss: "A rook or a bishop does not finish it. Promote to a queen.",
    why: "The new queen checks along the eighth rank, and the king on g6 covers the escape squares.",
  },
];

export function gradePuzzle(fen, spec, puzzle) {
  const chess = new Chess(fen);
  let move;
  try {
    move = chess.move({ from: spec.from, to: spec.to, promotion: spec.promotion });
  } catch {
    return { ok: false, illegal: true };
  }
  if (!move) return { ok: false, illegal: true };
  if (puzzle.kind === "mate" && chess.isCheckmate()) {
    return { ok: true, san: move.san, fen: chess.fen() };
  }
  const sol = puzzle.solution;
  if (move.from === sol.from && move.to === sol.to && (move.promotion || null) === (sol.promotion || null)) {
    return { ok: true, san: move.san, fen: chess.fen() };
  }
  return { ok: false, illegal: false };
}
