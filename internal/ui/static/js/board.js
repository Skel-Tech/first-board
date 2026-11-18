import { pieceMarkup, pieceName } from "./pieces.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function piecesFromFen(fen) {
  const map = new Map();
  const rows = fen.split(" ")[0].split("/");
  rows.forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
      } else {
        map.set(FILES[file] + (8 - r), {
          type: ch.toLowerCase(),
          color: ch === ch.toUpperCase() ? "w" : "b",
        });
        file += 1;
      }
    }
  });
  return map;
}

function isLight(square) {
  return (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0;
}

export function mountBoard(parent, options) {
  const orientation = options.orientation || "white";
  const files = orientation === "white" ? FILES : [...FILES].reverse();
  const ranks = orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const pieces = piecesFromFen(options.fen);
  const marks = options.marks || {};
  const frame = document.createElement("div");
  frame.className = "board-frame" + (options.shake ? " shake" : "");
  const grid = document.createElement("div");
  grid.className = "board-grid";
  const rankCol = document.createElement("div");
  rankCol.className = "ranks";
  const squares = document.createElement("div");
  squares.className = "squares";
  squares.setAttribute("role", "grid");
  squares.setAttribute("aria-label", "Chessboard");

  for (const rank of ranks) {
    const label = document.createElement("div");
    label.className = "coord";
    label.textContent = String(rank);
    rankCol.append(label);
  }

  for (const rank of ranks) {
    for (const file of files) {
      const square = file + rank;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sq " + (isLight(square) ? "light" : "dark");
      const flags = marks[square] || [];
      for (const flag of flags) button.classList.add("mark-" + flag);
      const piece = pieces.get(square);
      if (piece) button.insertAdjacentHTML("beforeend", pieceMarkup(piece.type, piece.color));
      if (flags.includes("dot")) {
        const dot = document.createElement("span");
        dot.className = "dot";
        button.append(dot);
      }
      if (flags.includes("capture")) {
        const ring = document.createElement("span");
        ring.className = "ring";
        button.append(ring);
      }
      const name = piece ? `${piece.color === "w" ? "white" : "black"} ${pieceName(piece.type)}` : "empty";
      button.setAttribute("aria-label", `${square}, ${name}`);
      button.disabled = !options.interactive;
      button.addEventListener("click", () => options.onSquare?.(square));
      squares.append(button);
    }
  }

  const fileRow = document.createElement("div");
  fileRow.className = "files";
  for (const file of files) {
    const label = document.createElement("div");
    label.className = "coord";
    label.textContent = file;
    fileRow.append(label);
  }
  grid.append(rankCol, squares);
  frame.append(grid, fileRow);
  parent.replaceChildren(frame);
}
