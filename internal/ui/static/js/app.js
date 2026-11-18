import { Chess } from "../vendor/chess.js";
import { mountBoard } from "./board.js";
import { findMove, landingInDanger, LEVELS } from "./engine.js";
import { LESSONS, START_FEN, lessonById, succeeds } from "./lessons.js";
import { pieceName } from "./pieces.js";
import { PUZZLES, gradePuzzle } from "./puzzles.js";
import { isMuted, toggleMute, tone, unlock } from "./sound.js";

const app = document.querySelector("#app");

function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "value") node.value = String(value);
      else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function emptyProgress() {
  return { lessons: [], drills: [], wins: 0, losses: 0, draws: 0, highestBeaten: 0, familyGames: 0 };
}

function mergeProgress(a, b) {
  const left = a || emptyProgress();
  const right = b || emptyProgress();
  return {
    lessons: [...new Set([...(left.lessons || []), ...(right.lessons || [])])],
    drills: [...new Set([...(left.drills || []), ...(right.drills || [])])],
    wins: Math.max(Number(left.wins) || 0, Number(right.wins) || 0),
    losses: Math.max(Number(left.losses) || 0, Number(right.losses) || 0),
    draws: Math.max(Number(left.draws) || 0, Number(right.draws) || 0),
    highestBeaten: Math.max(Number(left.highestBeaten) || 0, Number(right.highestBeaten) || 0),
    familyGames: Math.max(Number(left.familyGames) || 0, Number(right.familyGames) || 0),
  };
}

function hasPractice(progress) {
  return Boolean(
    progress.lessons.length ||
      progress.drills.length ||
      progress.wins ||
      progress.losses ||
      progress.draws ||
      progress.familyGames,
  );
}

function readKey(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? mergeProgress(emptyProgress(), JSON.parse(raw)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

const state = {
  user: null,
  progress: readKey("firstboard.progress.anon"),
  family: [],
  claim: null,
  booting: Boolean(localStorage.getItem("firstboard.token")),
  accountTab: "create",
  accountError: "",
  form: { displayName: "", username: "", password: "" },
};

const study = { id: null };
const drill = { index: 0, fen: null, bound: null };
const play = {
  phase: "setup",
  mode: "coach",
  level: 1,
  color: "w",
  moves: [],
  fen: START_FEN,
  selected: null,
  thinking: false,
  hold: false,
  note: "",
  result: null,
  gen: 0,
  last: null,
  promo: null,
  flip: false,
  recorded: false,
  sans: [],
  shake: 0,
};

let saveTimer = 0;
let worker = null;
let jobId = 0;
const jobs = new Map();

function storageKey() {
  return state.user ? `firstboard.progress.${state.user.id}` : "firstboard.progress.anon";
}

function remember() {
  localStorage.setItem(storageKey(), JSON.stringify(state.progress));
  if (!state.user) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api("/api/progress", { method: "PUT", body: JSON.stringify(state.progress) }).catch(() => {});
  }, 250);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("firstboard.token");
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function route() {
  const path = location.pathname;
  if (path === "/drills") return { name: "drills" };
  if (path === "/play") return { name: "play" };
  if (path === "/account") return { name: "account" };
  const match = path.match(/^\/learn\/([a-z0-9-]+)$/);
  if (match) return { name: "lesson", id: match[1] };
  if (path === "/" || path === "") return { name: "home" };
  return { name: "missing" };
}

function go(path) {
  if (location.pathname !== path) history.pushState({}, "", path);
  render();
}

function nextLesson() {
  return LESSONS.find((lesson) => !state.progress.lessons.includes(lesson.id)) || LESSONS[0];
}

function readiness() {
  const progress = state.progress;
  if (progress.highestBeaten >= 4) {
    return { label: "You took the board", detail: "Dad's level is a win. Ask for the wooden set." };
  }
  if (progress.highestBeaten >= 3 || (progress.lessons.length >= 8 && progress.drills.length >= 4)) {
    return { label: "Close", detail: "The ideas are landing. Dad's level is the real test." };
  }
  if (progress.lessons.length >= 4) {
    return { label: "Building", detail: "The pieces are starting to feel normal." };
  }
  return { label: "Just starting", detail: "Begin with the board, then the pawn. The lessons are short." };
}

function levelName(id) {
  return LEVELS.find((level) => level.id === id)?.name || "the coach";
}

function shell(current, main) {
  const item = (path, label) =>
    el(
      "button",
      { type: "button", onclick: () => go(path), "aria-current": current === path ? "page" : null },
      label,
    );
  let account;
  if (state.booting) account = el("span", { class: "who" }, "…");
  else if (state.user) {
    account = el(
      "span",
      { class: "who-row" },
      el("span", { class: "who" }, state.user.displayName),
      el("button", { class: "linkish", type: "button", onclick: signOut }, "Sign out"),
    );
  } else {
    account = el("button", { class: "linkish", type: "button", onclick: () => go("/account") }, "Family accounts");
  }
  return el(
    "div",
    { class: "app" },
    el(
      "header",
      { class: "wrap top" },
      el(
        "button",
        { class: "brand", type: "button", onclick: () => go("/") },
        el("strong", {}, "First Board"),
        el("span", {}, "family chess school"),
      ),
      el("nav", { class: "nav" }, item("/", "Learn"), item("/drills", "Drills"), item("/play", "Play")),
      el(
        "div",
        { class: "account" },
        el(
          "button",
          {
            class: "linkish",
            type: "button",
            onclick: () => {
              toggleMute();
              render();
            },
          },
          isMuted() ? "Sound off" : "Sound on",
        ),
        account,
      ),
    ),
    el("main", { class: "wrap page" }, main),
  );
}

function homeView() {
  const ready = readiness();
  const upcoming = nextLesson();
  const stats = [
    [`${state.progress.lessons.length}/${LESSONS.length}`, "lessons"],
    [`${state.progress.drills.length}/${PUZZLES.length}`, "drills"],
    [String(state.progress.wins), "wins against the coach"],
    [state.progress.highestBeaten ? levelName(state.progress.highestBeaten) : "Not yet", "best level beaten"],
  ];
  const boardHost = el("div", {});
  mountBoard(boardHost, { fen: START_FEN, interactive: false });
  const path = el(
    "div",
    { class: "path" },
    LESSONS.map((lesson, index) => {
      const done = state.progress.lessons.includes(lesson.id);
      return el(
        "a",
        { href: `/learn/${lesson.id}`, onclick: (event) => { event.preventDefault(); go(`/learn/${lesson.id}`); } },
        el("span", { class: done ? "num done" : "num" }, String(index + 1)),
        el("span", {}, el("strong", {}, lesson.title), el("small", {}, " " + lesson.summary)),
        done ? el("span", { class: "tag" }, "Done") : el("span", {}),
      );
    }),
  );
  return el(
    "div",
    {},
    state.claim
      ? el(
          "div",
          { class: "banner" },
          el("p", {}, `This laptop has practice that is not on an account yet. Add it to ${state.user.displayName}?`),
          el(
            "div",
            { class: "row" },
            el("button", { class: "btn small", type: "button", onclick: claimPractice }, "Add it"),
            el("button", { class: "btn ghost small", type: "button", onclick: () => { state.claim = null; render(); } }, "Not this account"),
          ),
        )
      : null,
    el(
      "section",
      { class: "hero" },
      el(
        "div",
        {},
        el("p", { class: "kicker" }, ready.label),
        el("h1", {}, "Learn the pieces. Then take the board."),
        el(
          "p",
          { class: "lede" },
          ready.detail + " Ten short lessons, drills you can finish, and a coach who plays badly on purpose until you are ready for Dad.",
        ),
        el(
          "div",
          { class: "row" },
          el("button", { class: "btn", type: "button", onclick: () => go(`/learn/${upcoming.id}`) }, state.progress.lessons.length ? "Continue" : "Start with the board"),
          el("button", { class: "btn ghost", type: "button", onclick: () => go("/play") }, "Play a game"),
        ),
      ),
      boardHost,
    ),
    el("section", { class: "stats" }, stats.map(([value, label]) => el("div", { class: "stat" }, el("b", {}, value), el("span", {}, label)))),
    el("section", { class: "section" }, el("h2", {}, "The path"), el("p", { class: "lede" }, "Each lesson is a few moves. The rules are the real ones."), path),
    el(
      "section",
      { class: "section two" },
      el(
        "div",
        { class: "card" },
        el("h3", {}, "Drills"),
        el("p", {}, "Mate in one, and a few queens that should not be left loose. Hints if you want them."),
        el("button", { class: "btn small", type: "button", onclick: () => go("/drills") }, "Practice"),
      ),
      el(
        "div",
        { class: "card" },
        el("h3", {}, "The coach, or the family"),
        el("p", {}, "Play the computer at four strengths, or pass the laptop across the table. Only games against the coach change the score."),
        el("button", { class: "btn ghost small", type: "button", onclick: () => go("/play") }, "Choose a game"),
      ),
    ),
    state.user
      ? el(
          "section",
          { class: "section" },
          el("h2", {}, "On this board"),
          state.family.length
            ? el(
                "div",
                { class: "family" },
                state.family.map((member) =>
                  el(
                    "div",
                    { class: "member" },
                    el("strong", {}, member.displayName),
                    el("span", {}, `${member.lessons} lessons · ${member.wins} wins · best ${member.highestBeaten ? levelName(member.highestBeaten) : "not yet"}`),
                  ),
                ),
              )
            : el("p", { class: "help" }, "Family names show up here once someone is signed in."),
        )
      : el(
          "section",
          { class: "section" },
          el("h2", {}, "One account each"),
          el("p", { class: "lede" }, "No phone and no email. A username and a password are enough. Sign out before the next person sits down."),
          el("button", { class: "btn ghost", type: "button", onclick: () => go("/account") }, "Create accounts"),
        ),
  );
}

function resetStudy(id) {
  const lesson = lessonById(id);
  const step = lesson.steps[0];
  Object.assign(study, {
    id,
    step: 0,
    fen: step.fen,
    selected: null,
    note: null,
    noteKind: null,
    hint: false,
    done: false,
    finished: false,
    shake: 0,
    promo: null,
    last: null,
  });
}

function currentStep() {
  return lessonById(study.id).steps[study.step];
}

function lessonMarks(step) {
  const marks = {};
  const add = (square, flag) => {
    if (!square) return;
    marks[square] = marks[square] || [];
    if (!marks[square].includes(flag)) marks[square].push(flag);
  };
  if (step.type === "move" && step.from) add(step.from, "piece");
  if (step.type === "tap" && (step.reveal || study.hint)) add(step.square, "goal");
  if ((study.hint || step.revealDest) && step.solution) add(step.solution.to, "goal");
  if (study.selected) add(study.selected, "selected");
  if (study.last) {
    add(study.last.from, "last");
    add(study.last.to, "last");
  }
  if (study.selected && !study.done && step.type === "move") {
    try {
      const chess = new Chess(study.fen);
      for (const move of chess.moves({ square: study.selected, verbose: true })) {
        add(move.to, move.captured ? "capture" : "dot");
      }
    } catch {
      /* illegal square */
    }
  }
  return marks;
}

function finishLessonStep() {
  study.done = true;
  study.promo = null;
  study.selected = null;
  const lesson = lessonById(study.id);
  if (study.step === lesson.steps.length - 1) {
    study.finished = true;
    if (!state.progress.lessons.includes(lesson.id)) {
      state.progress.lessons.push(lesson.id);
      remember();
    }
  }
}

function commitLesson(spec) {
  const step = currentStep();
  if (!succeeds(study.fen, spec, step.goal)) {
    study.note = step.miss;
    study.noteKind = "bad";
    study.promo = null;
    study.shake += 1;
    tone("bad");
    render();
    return;
  }
  const chess = new Chess(study.fen);
  const move = chess.move(spec);
  study.fen = chess.fen();
  study.last = { from: move.from, to: move.to };
  study.note = step.success;
  study.noteKind = "good";
  tone(chess.isCheckmate() ? "win" : move.captured ? "capture" : "move");
  finishLessonStep();
  render();
}

function onLessonSquare(square) {
  const step = currentStep();
  if (study.done || step.type !== "move" && step.type !== "tap") return;
  if (step.type === "tap") {
    if (square === step.square) {
      study.note = step.success;
      study.noteKind = "good";
      tone("win");
      finishLessonStep();
    } else {
      study.note = step.miss;
      study.noteKind = "bad";
      study.shake += 1;
      tone("bad");
    }
    render();
    return;
  }
  const chess = new Chess(study.fen);
  const piece = chess.get(square);
  const own = piece && piece.color === chess.turn();
  const allowed = own && (!step.from || square === step.from) && (!step.piece || piece.type === step.piece);
  if (allowed) {
    study.selected = study.selected === square ? null : square;
    study.promo = null;
    render();
    return;
  }
  if (!study.selected) {
    study.note = step.wrongPiece || "Select the highlighted piece.";
    study.noteKind = "bad";
    render();
    return;
  }
  let legal = [];
  try {
    legal = chess.moves({ square: study.selected, verbose: true }).filter((move) => move.to === square);
  } catch {
    legal = [];
  }
  if (!legal.length) {
    const trap = (step.traps || []).find((item) => item.square === square);
    study.note = trap ? trap.say : "That is not a legal square for this piece.";
    study.noteKind = "bad";
    study.shake += 1;
    tone("bad");
    render();
    return;
  }
  if (legal.some((move) => move.promotion)) {
    study.promo = { from: study.selected, to: square };
    render();
    return;
  }
  commitLesson({ from: legal[0].from, to: legal[0].to });
}

function lessonView(id) {
  const lesson = lessonById(id);
  if (!lesson) {
    return el("div", {}, el("h1", {}, "That lesson is not on the board."), el("button", { class: "btn", type: "button", onclick: () => go("/") }, "Back to the path"));
  }
  if (study.id !== id) resetStudy(id);
  const step = currentStep();
  const host = el("div", { class: "board-slot" });
  mountBoard(host, {
    fen: study.fen,
    interactive: step.type !== "choose" && !study.done,
    marks: lessonMarks(step),
    shake: study.shake,
    onSquare: onLessonSquare,
  });
  const index = LESSONS.findIndex((item) => item.id === lesson.id);
  const following = LESSONS[index + 1];
  const actions = [];
  if (!study.done && step.type !== "choose") {
    actions.push(el("button", { class: "btn ghost small", type: "button", onclick: () => { study.hint = true; render(); } }, "Hint"));
  }
  if (study.done && !study.finished) {
    actions.push(
      el("button", { class: "btn small", type: "button", onclick: () => {
        const next = lesson.steps[study.step + 1];
        study.step += 1;
        study.fen = next.fen;
        study.selected = null;
        study.note = null;
        study.hint = false;
        study.done = false;
        study.promo = null;
        study.last = null;
        render();
      } }, "Next"),
    );
  }
  if (study.finished) {
    actions.push(
      following
        ? el("button", { class: "btn small", type: "button", onclick: () => go(`/learn/${following.id}`) }, "Next lesson")
        : el("button", { class: "btn small", type: "button", onclick: () => go("/drills") }, "Try the drills"),
    );
  }
  return el(
    "div",
    { class: "stage" },
    el(
      "section",
      { class: "coach float" },
      el("p", { class: "kicker" }, `Lesson ${index + 1} of ${LESSONS.length}`),
      el("div", { class: "steps" }, lesson.steps.map((_, i) => el("span", { class: "pip" + (i < study.step || study.finished ? " got" : i === study.step ? " on" : "") }))),
      el("h2", {}, step.title),
      el("p", {}, step.body),
      study.note ? el("p", { class: "note " + (study.noteKind || "") }, study.note) : null,
      study.promo
        ? el(
            "div",
            { class: "promo" },
            ["q", "r", "b", "n"].map((kind) =>
              el("button", { type: "button", onclick: () => commitLesson({ from: study.promo.from, to: study.promo.to, promotion: kind }) }, pieceName(kind)),
            ),
          )
        : null,
      step.type === "choose" && !study.done
        ? el(
            "div",
            { class: "row" },
            step.options.map((option) =>
              el("button", {
                class: "btn ghost",
                type: "button",
                onclick: () => {
                  if (option.id === step.answer) {
                    study.note = step.success;
                    study.noteKind = "good";
                    tone("win");
                    finishLessonStep();
                  } else {
                    study.note = step.miss;
                    study.noteKind = "bad";
                    tone("bad");
                  }
                  render();
                },
              }, option.label),
            ),
          )
        : null,
      el("div", { class: "row" }, actions),
    ),
    host,
  );
}

function ensureDrill() {
  const puzzle = PUZZLES[drill.index];
  if (drill.bound === puzzle.id) return;
  drill.bound = puzzle.id;
  drill.fen = puzzle.fen;
  drill.selected = null;
  drill.hint = 0;
  drill.note = null;
  drill.noteKind = null;
  drill.done = false;
  drill.promo = null;
  drill.shake = 0;
  drill.last = null;
}

function drillMarks(puzzle) {
  const marks = {};
  const add = (square, flag) => {
    if (!square) return;
    marks[square] = marks[square] || [];
    marks[square].push(flag);
  };
  if (drill.hint >= 1) add(puzzle.solution.from, "piece");
  if (drill.hint >= 2) add(puzzle.solution.to, "goal");
  if (drill.selected) add(drill.selected, "selected");
  if (drill.last) {
    add(drill.last.from, "last");
    add(drill.last.to, "last");
  }
  if (drill.selected && !drill.done) {
    try {
      const chess = new Chess(drill.fen);
      for (const move of chess.moves({ square: drill.selected, verbose: true })) {
        add(move.to, move.captured ? "capture" : "dot");
      }
    } catch {
      /* ignore */
    }
  }
  const king = checkSquare(drill.fen);
  if (king) add(king, "check");
  return marks;
}

function commitDrill(spec) {
  const puzzle = PUZZLES[drill.index];
  const graded = gradePuzzle(drill.fen, spec, puzzle);
  if (!graded.ok) {
    drill.note = graded.illegal ? "That move is not legal." : puzzle.miss;
    drill.noteKind = "bad";
    drill.promo = null;
    drill.shake += 1;
    tone("bad");
    render();
    return;
  }
  drill.fen = graded.fen;
  drill.last = { from: spec.from, to: spec.to };
  drill.done = true;
  drill.promo = null;
  drill.selected = null;
  drill.note = puzzle.why;
  drill.noteKind = "good";
  tone("win");
  if (!state.progress.drills.includes(puzzle.id)) {
    state.progress.drills.push(puzzle.id);
    remember();
  }
  render();
}

function onDrillSquare(square) {
  if (drill.done) return;
  const chess = new Chess(drill.fen);
  const piece = chess.get(square);
  if (piece && piece.color === chess.turn()) {
    drill.selected = drill.selected === square ? null : square;
    drill.promo = null;
    render();
    return;
  }
  if (!drill.selected) return;
  let legal = [];
  try {
    legal = chess.moves({ square: drill.selected, verbose: true }).filter((move) => move.to === square);
  } catch {
    legal = [];
  }
  if (!legal.length) {
    drill.note = "That move is not legal.";
    drill.noteKind = "bad";
    drill.shake += 1;
    tone("bad");
    render();
    return;
  }
  if (legal.some((move) => move.promotion)) {
    drill.promo = { from: drill.selected, to: square };
    render();
    return;
  }
  commitDrill({ from: legal[0].from, to: legal[0].to });
}

function drillsView() {
  ensureDrill();
  const puzzle = PUZZLES[drill.index];
  const host = el("div", { class: "board-slot" });
  mountBoard(host, {
    fen: drill.fen,
    interactive: !drill.done,
    marks: drillMarks(puzzle),
    shake: drill.shake,
    onSquare: onDrillSquare,
  });
  return el(
    "div",
    { class: "stage" },
    el(
      "section",
      { class: "coach float" },
      el("p", { class: "kicker" }, `Drill ${drill.index + 1} of ${PUZZLES.length}`),
      el("h2", {}, puzzle.title),
      el("p", {}, puzzle.prompt),
      drill.note ? el("p", { class: "note " + (drill.noteKind || "") }, drill.note) : null,
      drill.promo
        ? el(
            "div",
            { class: "promo" },
            ["q", "r", "b", "n"].map((kind) =>
              el("button", { type: "button", onclick: () => commitDrill({ ...drill.promo, promotion: kind }) }, pieceName(kind)),
            ),
          )
        : null,
      el(
        "div",
        { class: "row" },
        el("button", { class: "btn ghost small", type: "button", onclick: () => { drill.hint = Math.min(2, drill.hint + 1); render(); } }, drill.hint === 0 ? "Hint" : "Show the square"),
        drill.index > 0
          ? el("button", { class: "btn ghost small", type: "button", onclick: () => { drill.index -= 1; drill.bound = null; render(); } }, "Previous")
          : null,
        drill.done && drill.index < PUZZLES.length - 1
          ? el("button", { class: "btn small", type: "button", onclick: () => { drill.index += 1; drill.bound = null; render(); } }, "Next drill")
          : null,
      ),
    ),
    host,
  );
}

function line() {
  const chess = new Chess();
  for (const move of play.moves) chess.move(move);
  play.fen = chess.fen();
  const hist = chess.history({ verbose: true });
  play.last = hist.length ? { from: hist[hist.length - 1].from, to: hist[hist.length - 1].to } : null;
  play.sans = chess.history();
  return chess;
}

function orientation() {
  if (play.mode === "family") return play.flip ? "black" : "white";
  return play.color === "w" ? "white" : "black";
}

function checkSquare(fen) {
  try {
    const chess = new Chess(fen);
    if (!chess.isCheck()) return null;
    return chess.findPiece({ type: "k", color: chess.turn() })[0] || null;
  } catch {
    return null;
  }
}

function playMarks() {
  const marks = {};
  const add = (square, flag) => {
    if (!square) return;
    marks[square] = marks[square] || [];
    if (!marks[square].includes(flag)) marks[square].push(flag);
  };
  if (play.selected) add(play.selected, "selected");
  if (play.last) {
    add(play.last.from, "last");
    add(play.last.to, "last");
  }
  const king = checkSquare(play.fen);
  if (king) add(king, "check");
  if (play.selected && !play.thinking && !play.result) {
    try {
      const chess = new Chess(play.fen);
      for (const move of chess.moves({ square: play.selected, verbose: true })) {
        add(move.to, move.captured ? "capture" : "dot");
      }
    } catch {
      /* ignore */
    }
  }
  return marks;
}

function record(kind) {
  if (kind === "win") {
    state.progress.wins += 1;
    if (play.level > state.progress.highestBeaten) state.progress.highestBeaten = play.level;
  } else if (kind === "loss") state.progress.losses += 1;
  else if (kind === "draw") state.progress.draws += 1;
  else state.progress.familyGames += 1;
  remember();
}

function finishIfOver(chess) {
  if (!chess.isGameOver() || play.recorded) return;
  play.recorded = true;
  play.hold = false;
  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "b" : "w";
    if (play.mode === "family") {
      play.result = { title: winner === "w" ? "White wins" : "Black wins", detail: "Checkmate. The king is in check and has no way out." };
      record("family");
    } else if (winner === play.color) {
      play.result = {
        title: play.level === 4 ? "You took Dad's board" : `You beat ${levelName(play.level)}`,
        detail: "Checkmate, under the real rules.",
      };
      record("win");
    } else {
      play.result = { title: "Checkmate", detail: "The coach got there first. Look at the last move, then try again." };
      record("loss");
    }
    return;
  }
  if (chess.isStalemate()) {
    play.result = { title: "Stalemate", detail: "A draw. The king is not in check, but there is no legal move. That is not a win." };
  } else {
    play.result = { title: "Draw", detail: "Nobody won. Repetition, the fifty-move rule, or not enough pieces left." };
  }
  record(play.mode === "family" ? "family" : "draw");
}

function queueAI() {
  if (play.phase !== "game" || play.mode !== "coach" || play.result || play.hold) return;
  const chess = line();
  const ai = play.color === "w" ? "b" : "w";
  if (chess.turn() !== ai || chess.isGameOver()) return;
  const gen = ++play.gen;
  play.thinking = true;
  play.note = play.level === 4 ? "Dad is thinking." : "The coach is thinking.";
  render();
  think(play.fen, play.level).then((move) => {
    if (gen !== play.gen || play.phase !== "game") return;
    play.thinking = false;
    if (!move) {
      finishIfOver(line());
      render();
      return;
    }
    play.moves.push(move);
    const next = line();
    tone(next.isCheckmate() ? "win" : next.isCheck() ? "check" : "move");
    finishIfOver(next);
    if (!play.result) {
      play.note = next.isCheck() ? "Check. Your king is attacked, so the next move has to answer it." : "Your move.";
    }
    render();
  });
}

function playerMoved(spec, made) {
  play.moves.push(spec);
  play.selected = null;
  play.promo = null;
  const chess = line();
  tone(chess.isCheck() ? "check" : made.captured ? "capture" : "move");
  finishIfOver(chess);
  if (play.result) {
    render();
    return;
  }
  if (play.mode === "coach" && play.level <= 2) {
    const danger = landingInDanger(chess.fen(), made.to);
    if (danger) {
      play.hold = true;
      play.note = `Your ${pieceName(danger.victim)} on ${danger.square} can be taken by a ${pieceName(danger.attacker)}. Undo, or play it anyway.`;
      render();
      return;
    }
  }
  if (play.mode === "family") {
    play.note = (chess.turn() === "w" ? "White" : "Black") + " to move.";
    render();
    return;
  }
  queueAI();
}

function onPlaySquare(square) {
  if (play.phase !== "game" || play.thinking || play.result || play.hold) return;
  const chess = new Chess(play.fen);
  if (play.mode === "coach" && chess.turn() !== play.color) return;
  const piece = chess.get(square);
  if (piece && piece.color === chess.turn()) {
    play.selected = play.selected === square ? null : square;
    play.promo = null;
    render();
    return;
  }
  if (!play.selected) return;
  let legal = [];
  try {
    legal = chess.moves({ square: play.selected, verbose: true }).filter((move) => move.to === square);
  } catch {
    legal = [];
  }
  if (!legal.length) {
    play.selected = null;
    render();
    return;
  }
  if (legal.some((move) => move.promotion)) {
    play.promo = { from: play.selected, to: square };
    render();
    return;
  }
  playerMoved({ from: legal[0].from, to: legal[0].to }, legal[0]);
}

function undoPlay() {
  if (play.thinking || play.result || !play.moves.length) return;
  play.gen += 1;
  play.moves.pop();
  if (play.mode === "coach" && !play.hold && play.moves.length) {
    const mid = line();
    if (mid.turn() !== play.color) play.moves.pop();
  }
  play.hold = false;
  play.result = null;
  play.selected = null;
  play.promo = null;
  line();
  play.note = "Taken back.";
  render();
}

function startGame() {
  play.phase = "game";
  play.moves = [];
  play.selected = null;
  play.thinking = false;
  play.hold = false;
  play.result = null;
  play.recorded = false;
  play.promo = null;
  play.gen += 1;
  line();
  play.note = play.mode === "family"
    ? "White moves first. Say the move out loud if you are sharing the laptop."
    : `You have the ${play.color === "w" ? "white" : "black"} pieces.`;
  render();
  if (play.mode === "coach" && play.color === "b") queueAI();
}

function playView() {
  if (play.phase === "setup") {
    return el(
      "div",
      { class: "two" },
      el(
        "section",
        { class: "coach" },
        el("p", { class: "kicker" }, "A game"),
        el("h2", {}, "Who are you playing?"),
        el(
          "div",
          { class: "levels" },
          el("button", { class: "level", type: "button", "aria-pressed": play.mode === "coach" ? "true" : "false", onclick: () => { play.mode = "coach"; render(); } }, el("b", {}, "The coach"), el("span", {}, "A computer that gets harder when you do.")),
          el("button", { class: "level", type: "button", "aria-pressed": play.mode === "family" ? "true" : "false", onclick: () => { play.mode = "family"; render(); } }, el("b", {}, "Pass the laptop"), el("span", {}, "Two people, one board. This does not change the coach score.")),
        ),
      ),
      el(
        "section",
        { class: "coach" },
        play.mode === "coach"
          ? el(
              "div",
              {},
              el("h3", {}, "How strong?"),
              el(
                "div",
                { class: "levels" },
                LEVELS.map((level) =>
                  el(
                    "button",
                    { class: "level", type: "button", "aria-pressed": play.level === level.id ? "true" : "false", onclick: () => { play.level = level.id; render(); } },
                    el("b", {}, level.name),
                    el("span", {}, level.blurb),
                  ),
                ),
              ),
              el(
                "div",
                { class: "row" },
                el("button", { class: "btn ghost small", type: "button", "aria-pressed": play.color === "w" ? "true" : "false", onclick: () => { play.color = "w"; render(); } }, "Play White"),
                el("button", { class: "btn ghost small", type: "button", "aria-pressed": play.color === "b" ? "true" : "false", onclick: () => { play.color = "b"; render(); } }, "Play Black"),
              ),
            )
          : el("p", {}, "Sit on the same side or take turns turning the laptop. The board can be flipped after you start."),
        el("button", { class: "btn", type: "button", onclick: startGame }, "Start"),
      ),
    );
  }
  const host = el("div", { class: "board-slot" });
  mountBoard(host, {
    fen: play.fen,
    orientation: orientation(),
    interactive: !play.thinking && !play.result && !play.hold,
    marks: playMarks(),
    shake: play.shake,
    onSquare: onPlaySquare,
  });
  const moves = el(
    "div",
    { class: "moves" },
    play.sans.map((san, index) => el("span", {}, index % 2 === 0 ? el("b", {}, `${index / 2 + 1}. ${san}`) : san)),
  );
  return el(
    "div",
    { class: "stage" },
    el(
      "section",
      { class: "coach float" },
      el("p", { class: "kicker" }, play.mode === "family" ? "At the table" : levelName(play.level)),
      el("h2", {}, play.result ? play.result.title : play.thinking ? "Thinking" : "Your game"),
      play.thinking ? el("p", { class: "thinking" }, play.note) : el("p", {}, play.result ? play.result.detail : play.note),
      play.promo
        ? el(
            "div",
            { class: "promo" },
            ["q", "r", "b", "n"].map((kind) =>
              el("button", { type: "button", onclick: () => playerMoved({ ...play.promo, promotion: kind }, { captured: true }) }, pieceName(kind)),
            ),
          )
        : null,
      el(
        "div",
        { class: "row" },
        play.hold ? el("button", { class: "btn small", type: "button", onclick: () => { play.hold = false; queueAI(); } }, "Play it anyway") : null,
        el("button", { class: "btn ghost small", type: "button", onclick: undoPlay }, "Undo"),
        play.mode === "family" ? el("button", { class: "btn ghost small", type: "button", onclick: () => { play.flip = !play.flip; render(); } }, "Flip board") : null,
        !play.result ? el("button", { class: "btn ghost small", type: "button", onclick: () => {
          play.result = { title: "Resigned", detail: play.mode === "family" ? "That game is over." : "The coach keeps this one." };
          if (!play.recorded) {
            play.recorded = true;
            record(play.mode === "family" ? "family" : "loss");
          }
          render();
        } }, "Resign") : null,
        el("button", { class: "btn ghost small", type: "button", onclick: () => { play.phase = "setup"; play.gen += 1; render(); } }, "New game"),
      ),
      moves,
    ),
    host,
  );
}

function accountView() {
  const create = state.accountTab === "create";
  const field = (label, name, type) =>
    el(
      "label",
      { class: "field" },
      label,
      el("input", {
        type,
        autocomplete: name === "password" ? (create ? "new-password" : "current-password") : name,
        value: state.form[name] || "",
        oninput: (event) => {
          state.form[name] = event.target.value;
        },
      }),
    );
  return el(
    "div",
    { class: "two" },
    el(
      "section",
      { class: "coach" },
      el("p", { class: "kicker" }, "The family"),
      el("h2", {}, "An account for each person"),
      el("p", {}, "No email and no phone. Pick a username and a password. On the shared laptop, sign out before the next person plays, so the lessons stay with the right name."),
      el(
        "div",
        { class: "tabs" },
        el("button", { type: "button", "aria-pressed": create ? "true" : "false", onclick: () => { state.accountTab = "create"; state.accountError = ""; render(); } }, "Create"),
        el("button", { type: "button", "aria-pressed": !create ? "true" : "false", onclick: () => { state.accountTab = "in"; state.accountError = ""; render(); } }, "Sign in"),
      ),
      el(
        "form",
        {
          class: "form",
          onsubmit: async (event) => {
            event.preventDefault();
            state.accountError = "";
            try {
              const path = create ? "/api/signup" : "/api/login";
              const body = {
                username: state.form.username,
                password: state.form.password,
                displayName: state.form.displayName || state.form.username,
              };
              const data = await api(path, { method: "POST", body: JSON.stringify(body) });
              await signedIn(data.user, data.token);
            } catch (error) {
              state.accountError = error.message;
              render();
            }
          },
        },
        create ? field("What should we call you?", "displayName", "text") : null,
        field("Username", "username", "text"),
        field("Password", "password", "password"),
        state.accountError ? el("p", { class: "note bad" }, state.accountError) : null,
        el("button", { class: "btn", type: "submit" }, create ? "Create account" : "Sign in"),
      ),
    ),
    el(
      "section",
      {},
      el("h2", {}, "Where the games live"),
      el("p", { class: "help" }, "This board runs on the home computer. The laptop only opens it in a browser. Lessons and wins are stored in a SQLite file there, and Goose applies database updates when the server starts."),
    ),
  );
}

async function signedIn(user, token) {
  localStorage.setItem("firstboard.token", token);
  state.user = user;
  state.booting = false;
  const remote = await api("/api/progress").catch(() => emptyProgress());
  const local = readKey(`firstboard.progress.${user.id}`);
  state.progress = mergeProgress(remote, local);
  const anon = readKey("firstboard.progress.anon");
  state.claim = hasPractice(anon) ? anon : null;
  remember();
  const family = await api("/api/family").catch(() => ({ members: [] }));
  state.family = family.members || [];
  state.form = { displayName: "", username: "", password: "" };
  go("/");
}

function claimPractice() {
  state.progress = mergeProgress(state.progress, state.claim);
  state.claim = null;
  localStorage.removeItem("firstboard.progress.anon");
  remember();
  render();
}

async function signOut() {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
  } catch {
    /* still leave the screen */
  }
  localStorage.removeItem("firstboard.token");
  state.user = null;
  state.family = [];
  state.claim = null;
  state.progress = readKey("firstboard.progress.anon");
  go("/");
}

function ensureWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL("./engine-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const job = jobs.get(event.data.id);
      if (!job) return;
      jobs.delete(event.data.id);
      job(event.data.move);
    };
    worker.onerror = () => {
      worker = false;
    };
  } catch {
    worker = false;
  }
  return worker;
}

function think(fen, level) {
  const engine = ensureWorker();
  if (!engine) return Promise.resolve(findMove(fen, level));
  const id = ++jobId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!jobs.has(id)) return;
      jobs.delete(id);
      resolve(findMove(fen, level));
    }, 5000);
    jobs.set(id, (move) => {
      clearTimeout(timer);
      resolve(move);
    });
    engine.postMessage({ id, fen, level });
  });
}

function render() {
  const current = route();
  const path = current.name === "lesson" ? "/learn" : current.name === "home" ? "/" : `/${current.name === "missing" ? "" : current.name}`;
  let main;
  if (current.name === "home") main = homeView();
  else if (current.name === "lesson") main = lessonView(current.id);
  else if (current.name === "drills") main = drillsView();
  else if (current.name === "play") main = playView();
  else if (current.name === "account") main = accountView();
  else main = el("div", {}, el("h1", {}, "That page is not on the board."), el("button", { class: "btn", type: "button", onclick: () => go("/") }, "Home"));
  app.replaceChildren(shell(path === "/learn" ? "/" : path, main));
}

document.addEventListener("pointerdown", () => unlock(), { once: true });
window.addEventListener("popstate", render);
render();

async function boot() {
  const token = localStorage.getItem("firstboard.token");
  if (!token) {
    state.booting = false;
    render();
    return;
  }
  try {
    const me = await api("/api/me");
    state.user = me.user;
    const remote = await api("/api/progress");
    state.progress = mergeProgress(remote, readKey(`firstboard.progress.${me.user.id}`));
    remember();
    const family = await api("/api/family");
    state.family = family.members || [];
  } catch {
    localStorage.removeItem("firstboard.token");
    state.user = null;
    state.progress = readKey("firstboard.progress.anon");
  }
  state.booting = false;
  render();
}

boot();
