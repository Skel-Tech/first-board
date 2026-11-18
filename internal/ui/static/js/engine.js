import { Chess } from "../vendor/chess.js";

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;

// Tables are white's view, index 0 = a1.
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 8, 8, 8, 8, 8, 8, 8, 8, 10, 10, 16, 24, 24, 16, 10, 10, 12, 12, 20, 32,
    32, 20, 12, 12, 20, 20, 28, 40, 40, 28, 20, 20, 40, 40, 48, 56, 56, 48, 40, 40, 70, 70, 70, 70,
    70, 70, 70, 70, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -40, -30, -20, -20, -20, -20, -30, -40, -30, -10, 0, 5, 5, 0, -10, -30, -20, 0, 10, 15, 15, 10,
    0, -20, -20, 5, 15, 22, 22, 15, 5, -20, -20, 0, 15, 22, 22, 15, 0, -20, -20, 5, 10, 15, 15, 10,
    5, -20, -30, -10, 0, 0, 0, 0, -10, -30, -40, -30, -20, -20, -20, -20, -30, -40,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 4, 0, 0, 0, 0, 4, -10, -10, 0, 6, 8, 8, 6, 0, -10,
    -10, 4, 6, 10, 10, 6, 4, -10, -10, 0, 8, 10, 10, 8, 0, -10, -10, 8, 6, 8, 8, 6, 8, -10, -10, 4,
    0, 0, 0, 0, 4, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 4, 6, 6, 4, 0, 0, -6, 0, 0, 0, 0, 0, 0, -6, -6, 0, 0, 0, 0, 0, 0, -6, -6, 0, 0, 0, 0, 0,
    0, -6, -6, 0, 0, 0, 0, 0, 0, -6, -6, 0, 0, 0, 0, 0, 0, -6, 6, 10, 10, 10, 10, 10, 10, 6, 0, 0, 0,
    0, 0, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, -5, 0, 5, 5, 5, 5, 0, -5, -10, 0, 5, 5, 5, 5, 0, -10, -10, 0, 0,
    0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    18, 24, 8, -8, -8, 4, 26, 20, 8, 8, -4, -12, -12, -4, 8, 8, -8, -12, -18, -22, -22, -18, -12, -8,
    -16, -20, -24, -28, -28, -24, -20, -16, -16, -20, -24, -28, -28, -24, -20, -16, -8, -12, -18,
    -22, -22, -18, -12, -8, 8, 8, -4, -12, -12, -4, 8, 8, 12, 16, 8, -8, -8, 4, 18, 14,
  ],
};

export const LEVELS = [
  { id: 1, name: "Classroom", blurb: "Leaves pieces where they can be taken. A fair first win." },
  { id: 2, name: "Club night", blurb: "Looks ahead, then still slips." },
  { id: 3, name: "Tournament", blurb: "Holds an extra piece. You need a plan." },
  { id: 4, name: "Dad", blurb: "The one you came here to beat." },
];

function tableIndex(square, color) {
  const file = square.charCodeAt(0) - 97;
  let rank = square.charCodeAt(1) - 49;
  if (color === "b") rank = 7 - rank;
  return rank * 8 + file;
}

function evaluate(chess) {
  const board = chess.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      const square = String.fromCharCode(97 + f) + (8 - r);
      const table = PST[piece.type];
      const extra = table ? table[tableIndex(square, piece.color)] || 0 : 0;
      const value = (VAL[piece.type] || 0) + extra;
      score += piece.color === "w" ? value : -value;
    }
  }
  return score;
}

function sideScore(chess) {
  const score = evaluate(chess);
  return chess.turn() === "w" ? score : -score;
}

function moveRank(move) {
  let score = 0;
  if (move.captured) score += 10 * (VAL[move.captured] || 0) - (VAL[move.piece] || 0);
  if (move.promotion === "q") score += 800;
  else if (move.promotion) score += 300;
  if (move.san.includes("#")) score += 2000;
  else if (move.san.includes("+")) score += 40;
  return score;
}

function ordered(moves) {
  return moves.slice().sort((a, b) => moveRank(b) - moveRank(a));
}

function qsearch(chess, alpha, beta, ply) {
  if (chess.isCheckmate()) return -MATE;
  const stand = sideScore(chess);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (ply >= 2) return alpha;
  const captures = ordered(chess.moves({ verbose: true }).filter((move) => move.captured || move.promotion));
  for (const move of captures) {
    chess.move(move);
    const score = -qsearch(chess, -beta, -alpha, ply + 1);
    chess.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(chess, depth, alpha, beta, quiesce) {
  if (chess.isCheckmate()) return -MATE - depth;
  if (chess.isDraw()) return 0;
  if (depth <= 0) return quiesce ? qsearch(chess, alpha, beta, 0) : sideScore(chess);
  const moves = ordered(chess.moves({ verbose: true }));
  if (moves.length === 0) return chess.isCheck() ? -MATE - depth : 0;
  let best = -Infinity;
  for (const move of moves) {
    chess.move(move);
    const score = -negamax(chess, depth - 1, -beta, -alpha, quiesce);
    chess.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function pack(move) {
  if (!move) return null;
  const out = { from: move.from, to: move.to };
  if (move.promotion) out.promotion = move.promotion;
  return out;
}

export function findMove(fen, level) {
  const chess = new Chess(fen);
  const moves = ordered(chess.moves({ verbose: true }));
  if (moves.length === 0) return null;
  if (level <= 1) {
    if (Math.random() < 0.58) return pack(moves[Math.floor(Math.random() * moves.length)]);
    const captures = moves.filter((move) => move.captured);
    const pool = captures.length ? captures : moves;
    return pack(pool[Math.floor(Math.random() * pool.length)]);
  }
  const maxDepth = level === 2 ? 2 : level === 3 ? 2 : 3;
  const budget = level >= 4 ? 900 : level === 3 ? 450 : 220;
  const started = Date.now();
  let best = moves[0];
  let finished = 0;
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (finished > 0 && Date.now() - started > budget) break;
    let bestScore = -Infinity;
    const tied = [];
    let stopped = false;
    const quiesce = level >= 3 && depth === maxDepth;
    for (const move of moves) {
      if (finished > 0 && Date.now() - started > budget) {
        stopped = true;
        break;
      }
      chess.move(move);
      const score = -negamax(chess, depth - 1, -Infinity, Infinity, quiesce);
      chess.undo();
      if (score > bestScore + 0.5) {
        bestScore = score;
        tied.length = 0;
        tied.push(move);
      } else if (score >= bestScore - 10) {
        tied.push(move);
      }
    }
    if (!stopped && tied.length) {
      best = tied[Math.floor(Math.random() * tied.length)];
      finished = depth;
    }
  }
  if (level === 2 && Math.random() < 0.22) {
    best = moves[Math.floor(Math.random() * moves.length)];
  }
  return pack(best);
}

export function landingInDanger(fen, square) {
  const chess = new Chess(fen);
  const piece = chess.get(square);
  if (!piece) return null;
  const hits = chess.moves({ verbose: true }).filter((move) => move.to === square && move.captured);
  if (!hits.length) return null;
  const hit = hits.slice().sort((a, b) => (VAL[a.piece] || 0) - (VAL[b.piece] || 0))[0];
  if ((VAL[piece.type] || 0) < 300) return null;
  if ((VAL[hit.piece] || 0) > (VAL[piece.type] || 0)) return null;
  return { attacker: hit.piece, victim: piece.type, square };
}
