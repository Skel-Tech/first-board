const PATHS = {
  p: `<circle cx="22.5" cy="13" r="5.3"/><path d="M16.5 30c1.6-5 2.7-6.8 2.7-9.6 0-1.2-.4-2.2-1.1-2.9 2.3-1.5 5.6-1.5 8 0-.7.7-1.1 1.7-1.1 2.9 0 2.8 1.1 4.6 2.7 9.6z"/><rect x="13.4" y="31" width="18.2" height="2.5" rx="1"/><rect x="11.6" y="34.3" width="21.8" height="3.3" rx="1"/>`,
  r: `<path d="M11.5 10.5h5.2v4.2h3.3v-4.2h4.5v4.2h3.3v-4.2H33v8H11.5v-8zm2.3 8h17.4V31H13.8V18.5zM11 31.6h23v4.4H11z"/>`,
  n: `<path fill-rule="evenodd" d="M12 37.2h22.2v-3.4h-2.4c.2-2.6.2-5.2-.8-7.6 2.6-1.6 5.2-4.6 4.6-8.6-.6-3.4-3.4-5.2-6.4-5.6-.6-2.2-2.6-4.2-5.4-4.6-3.4.4-5.2 3-4.4 6.2-3.6 2.2-6.2 5.6-6.6 10.4-.2 3.2.6 6.2 1.4 8.8H12v4.4zM24.2 14.2c.9.7 1.2 1.6.6 2.4-.6.7-1.6.6-2.3-.1-.6-.8-.4-1.7.4-2.3.7-.3.9-.3 1.3 0z"/>`,
  b: `<circle cx="22.5" cy="8.8" r="2.35"/><path fill-rule="evenodd" d="M22.5 12.2c-5.6 3.2-8 8-8 13.2 0 3.4 1.6 5.6 4 6.8h8c2.4-1.2 4-3.4 4-6.8 0-5.2-2.4-10-8-13.2zM21.3 17.6h2.4v7.2h-2.4z"/><rect x="14" y="32.4" width="17" height="2.4" rx="1"/><rect x="12" y="35.4" width="21" height="3.2" rx="1"/>`,
  q: `<circle cx="8.8" cy="15.2" r="2.15"/><circle cx="15.6" cy="10" r="2.15"/><circle cx="22.5" cy="7" r="2.3"/><circle cx="29.4" cy="10" r="2.15"/><circle cx="36.2" cy="15.2" r="2.15"/><path d="M10.6 17.2 15.2 30h14.6l4.6-12.8-5.6 2.4L22.5 15.2l-6.3 4.4z"/><rect x="14" y="30.8" width="17" height="2.4" rx="1"/><rect x="12" y="34" width="21" height="3.4" rx="1"/>`,
  k: `<rect x="20.6" y="3.2" width="3.8" height="8.6" rx="0.7"/><rect x="16.2" y="5.8" width="12.6" height="3.5" rx="0.7"/><path d="M14.8 18.2c2.2-3.1 4.7-4.6 7.7-4.6s5.5 1.5 7.7 4.6l2.6 11.4H12.2z"/><rect x="13.2" y="30.4" width="18.6" height="2.4" rx="1"/><rect x="11.4" y="33.6" width="22.2" height="3.4" rx="1"/>`,
};

const NAMES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

export function pieceName(type) {
  return NAMES[type] || "piece";
}

export function pieceMarkup(type, color) {
  const path = PATHS[type];
  if (!path) return "";
  return `<svg class="piece piece-${color}" viewBox="0 0 45 45" width="45" height="45" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${path}</svg>`;
}
