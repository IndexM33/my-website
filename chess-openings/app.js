/* global Chess */
const pieceMap = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚"
};

const sampleRepertoire = `Italian Game: 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4
Ruy Lopez: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7
Scotch Game: 1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Nf6
Queen's Gambit Declined: 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7
London System: 1. d4 d5 2. Bf4 Nf6 3. e3 e6 4. Nf3 c5`;

const state = {
  chess: null,
  root: createNode(),
  currentNode: null,
  selectedSquare: null,
  boardFlipped: false,
  loadedLineCount: 0,
  maxDepth: 0,
  userMoveCount: 0,
  autoPlaying: false
};

const els = {
  board: document.getElementById("board"),
  fileCoords: document.getElementById("fileCoords"),
  rankCoords: document.getElementById("rankCoords"),
  repertoireFile: document.getElementById("repertoireFile"),
  fileName: document.getElementById("fileName"),
  repertoireText: document.getElementById("repertoireText"),
  loadBtn: document.getElementById("loadBtn"),
  sampleBtn: document.getElementById("sampleBtn"),
  restartBtn: document.getElementById("restartBtn"),
  undoBtn: document.getElementById("undoBtn"),
  flipBtn: document.getElementById("flipBtn"),
  sideSelect: document.getElementById("sideSelect"),
  replySelect: document.getElementById("replySelect"),
  statusCard: document.getElementById("statusCard"),
  statusTitle: document.getElementById("statusTitle"),
  statusText: document.getElementById("statusText"),
  expectedMoves: document.getElementById("expectedMoves"),
  moveList: document.getElementById("moveList"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  lineCount: document.getElementById("lineCount")
};

function createNode() {
  return {
    children: new Map(),
    parent: null,
    move: null,
    depth: 0,
    lineNames: new Set()
  };
}

function requireChessJs() {
  if (typeof Chess === "undefined") {
    setStatus("Chess engine failed to load", "This page uses chess.js from a CDN. Check your internet connection, or download chess.js and host it next to these files.", "error");
    return false;
  }
  return true;
}

function init() {
  if (!requireChessJs()) return;
  state.chess = new Chess();
  state.currentNode = state.root;
  bindEvents();
  renderAll();
}

function bindEvents() {
  els.repertoireFile.addEventListener("change", handleFileUpload);
  els.loadBtn.addEventListener("click", loadRepertoireFromTextarea);
  els.sampleBtn.addEventListener("click", () => {
    els.repertoireText.value = sampleRepertoire;
    loadRepertoire(sampleRepertoire);
  });
  els.restartBtn.addEventListener("click", restartPractice);
  els.undoBtn.addEventListener("click", undoMove);
  els.flipBtn.addEventListener("click", () => {
    state.boardFlipped = !state.boardFlipped;
    renderAll();
  });
  els.sideSelect.addEventListener("change", restartPractice);
  els.replySelect.addEventListener("change", restartPractice);
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  els.fileName.textContent = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    els.repertoireText.value = text;
    loadRepertoire(text);
  };
  reader.onerror = () => setStatus("Could not read file", "Try copying the PGN or lines into the text box instead.", "error");
  reader.readAsText(file);
}

function loadRepertoireFromTextarea() {
  loadRepertoire(els.repertoireText.value);
}

function loadRepertoire(text) {
  if (!requireChessJs()) return;
  const parsedLines = extractCandidateLines(text);
  const root = createNode();
  let loaded = 0;
  let maxDepth = 0;
  const errors = [];

  parsedLines.forEach((entry, index) => {
    const parsed = parseLineToSanMoves(entry.movesText);
    if (parsed.moves.length === 0) return;
    if (parsed.error) {
      errors.push(`Line ${index + 1}: stopped at "${parsed.error.token}"`);
    }
    addLineToTree(root, parsed.moves, entry.name || `Line ${index + 1}`);
    loaded += 1;
    maxDepth = Math.max(maxDepth, parsed.moves.length);
  });

  state.root = root;
  state.currentNode = root;
  state.loadedLineCount = loaded;
  state.maxDepth = maxDepth;
  state.userMoveCount = 0;
  state.chess.reset();
  state.selectedSquare = null;

  els.lineCount.textContent = String(loaded);

  if (loaded === 0) {
    setStatus("No usable lines found", "Try one opening per row, such as: 1. e4 e5 2. Nf3 Nc6 3. Bb5", "error");
  } else {
    const warning = errors.length ? ` ${errors.slice(0, 3).join(". ")}${errors.length > 3 ? "." : ""}` : "";
    setStatus("Repertoire loaded", `${loaded} line${loaded === 1 ? "" : "s"} ready. Choose a side and start practising.${warning}`, errors.length ? "warn" : "success");
  }

  renderAll();
  maybeAutoPlayOpponent();
}

function extractCandidateLines(rawText) {
  const text = rawText.replace(/\r/g, "").trim();
  if (!text) return [];

  if (/\[[A-Za-z0-9_]+\s+"/.test(text)) {
    return splitPgnGames(text).map((game, idx) => {
      const event = (game.match(/\[Event\s+"([^"]+)"\]/) || [])[1];
      return { name: event || `PGN ${idx + 1}`, movesText: removePgnHeaders(game) };
    });
  }

  return text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const parts = line.split(/:\s+/);
      if (parts.length > 1 && /\d+\.|\b(?:O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8])\b/.test(parts.slice(1).join(":"))) {
        return { name: parts[0].trim(), movesText: parts.slice(1).join(":").trim() };
      }
      return { name: `Line ${idx + 1}`, movesText: line };
    });
}

function splitPgnGames(text) {
  const marker = "\n\n[Event ";
  const normalised = text.replace(/\r/g, "");
  if (!normalised.includes("[Event ")) return [normalised];
  return normalised
    .replace(/\n\n\[Event /g, `${marker}`)
    .split(marker)
    .map((part, idx) => idx === 0 ? part : `[Event ${part}`)
    .map(part => part.trim())
    .filter(Boolean);
}

function removePgnHeaders(text) {
  return text
    .split("\n")
    .filter(line => !line.trim().startsWith("["))
    .join(" ");
}

function parseLineToSanMoves(text) {
  const temp = new Chess();
  const tokens = sanitiseMoveText(text);
  const moves = [];

  for (const token of tokens) {
    const move = temp.move(token, { sloppy: true });
    if (!move) {
      return { moves, error: { token } };
    }
    moves.push(move.san);
  }

  return { moves, error: null };
}

function sanitiseMoveText(text) {
  return text
    .replace(/\{[^}]*\}/g, " ")
    .replace(/;[^\n]*/g, " ")
    .replace(/\([^()]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\d+\.\.\./g, " ")
    .replace(/\d+\./g, " ")
    .replace(/[!?]+/g, "")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
    .filter(token => !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

function addLineToTree(root, moves, lineName) {
  let node = root;
  moves.forEach((san, index) => {
    if (!node.children.has(san)) {
      const child = createNode();
      child.parent = node;
      child.move = san;
      child.depth = index + 1;
      node.children.set(san, child);
    }
    node = node.children.get(san);
    node.lineNames.add(lineName);
  });
}

function restartPractice() {
  if (!state.chess) return;
  state.chess.reset();
  state.currentNode = state.root;
  state.selectedSquare = null;
  state.userMoveCount = 0;

  if (state.loadedLineCount > 0) {
    setStatus("Practice restarted", "Follow one of the uploaded lines. I will flag anything off-book.", "success");
  }

  renderAll();
  maybeAutoPlayOpponent();
}

function isUsersTurn() {
  const side = els.sideSelect.value;
  const turn = state.chess.turn();
  return side === "both" || side[0] === turn;
}

function chooseOpponentMove() {
  const allowed = Array.from(state.currentNode.children.keys());
  if (allowed.length === 0) return null;
  if (els.replySelect.value === "first") return allowed[0];
  return allowed[Math.floor(Math.random() * allowed.length)];
}

function maybeAutoPlayOpponent() {
  if (state.autoPlaying || state.loadedLineCount === 0) return;
  if (isUsersTurn()) {
    updateExpectedMoves();
    return;
  }

  const san = chooseOpponentMove();
  if (!san) {
    setStatus("Line complete", "No more uploaded moves from this position. Restart or add longer lines.", "success");
    updateExpectedMoves();
    return;
  }

  state.autoPlaying = true;
  window.setTimeout(() => {
    const move = state.chess.move(san, { sloppy: true });
    if (move && state.currentNode.children.has(move.san)) {
      state.currentNode = state.currentNode.children.get(move.san);
    }
    state.autoPlaying = false;
    renderAll();
    maybeAutoPlayOpponent();
  }, 300);
}

function onSquareClick(square) {
  if (state.loadedLineCount === 0 || state.autoPlaying) return;
  if (!isUsersTurn()) return;

  const piece = state.chess.get(square);

  if (!state.selectedSquare) {
    if (!piece || piece.color !== state.chess.turn()) return;
    state.selectedSquare = square;
    renderAll();
    return;
  }

  if (state.selectedSquare === square) {
    state.selectedSquare = null;
    renderAll();
    return;
  }

  if (piece && piece.color === state.chess.turn()) {
    state.selectedSquare = square;
    renderAll();
    return;
  }

  attemptMove(state.selectedSquare, square);
}

function attemptMove(from, to) {
  const move = state.chess.move({ from, to, promotion: "q" });
  state.selectedSquare = null;

  if (!move) {
    setStatus("Illegal chess move", "That move is not legal in the current position.", "error");
    renderAll();
    return;
  }

  const expected = state.currentNode.children;
  if (!expected.has(move.san)) {
    state.chess.undo();
    const expectedText = Array.from(expected.keys()).join(", ") || "no moves, this line is finished";
    setStatus("Off-book move", `${move.san} does not follow your uploaded opening. Expected: ${expectedText}.`, "error");
    renderAll();
    return;
  }

  state.currentNode = expected.get(move.san);
  state.userMoveCount += 1;
  setStatus("Correct", `${move.san} matches your uploaded repertoire.`, "success");
  renderAll();
  maybeAutoPlayOpponent();
}

function undoMove() {
  if (!state.chess || state.chess.history().length === 0) return;

  const side = els.sideSelect.value;
  let undone = 0;
  const targetUndoCount = side === "both" ? 1 : 2;

  while (undone < targetUndoCount && state.chess.history().length > 0 && state.currentNode.parent) {
    state.chess.undo();
    state.currentNode = state.currentNode.parent;
    undone += 1;
  }

  state.selectedSquare = null;
  state.userMoveCount = Math.max(0, state.userMoveCount - 1);
  setStatus("Move undone", "Try that part again.", "warn");
  renderAll();
}

function renderAll() {
  renderBoard();
  renderMoveList();
  updateExpectedMoves();
  updateProgress();
  els.undoBtn.disabled = !state.chess || state.chess.history().length === 0;
}

function renderBoard() {
  if (!state.chess) return;
  els.board.innerHTML = "";
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
  const displayFiles = state.boardFlipped ? [...files].reverse() : files;
  const displayRanks = state.boardFlipped ? [...ranks].reverse() : ranks;
  const legalTargets = getLegalTargets(state.selectedSquare);

  displayRanks.forEach(rank => {
    displayFiles.forEach(file => {
      const square = `${file}${rank}`;
      const squareEl = document.createElement("button");
      squareEl.type = "button";
      squareEl.className = `square ${isLightSquare(file, rank) ? "light" : "dark"}`;
      squareEl.dataset.square = square;
      squareEl.setAttribute("aria-label", square);

      if (state.selectedSquare === square) squareEl.classList.add("selected");
      if (legalTargets.has(square)) {
        const targetPiece = state.chess.get(square);
        squareEl.classList.add(targetPiece ? "capture" : "legal");
      }

      const piece = state.chess.get(square);
      if (piece) {
        const pieceEl = document.createElement("span");
        pieceEl.className = `piece ${piece.color === "w" ? "white" : "black"}`;
        pieceEl.textContent = pieceMap[`${piece.color}${piece.type}`];
        squareEl.appendChild(pieceEl);
      }

      squareEl.addEventListener("click", () => onSquareClick(square));
      els.board.appendChild(squareEl);
    });
  });

  els.fileCoords.innerHTML = displayFiles.map(file => `<span>${file}</span>`).join("");
  els.rankCoords.innerHTML = displayRanks.map(rank => `<span>${rank}</span>`).join("");
}

function getLegalTargets(from) {
  if (!from || !state.chess) return new Set();
  return new Set(state.chess.moves({ square: from, verbose: true }).map(move => move.to));
}

function isLightSquare(file, rank) {
  const fileIndex = file.charCodeAt(0) - 97;
  const rankIndex = Number(rank) - 1;
  return (fileIndex + rankIndex) % 2 === 1;
}

function renderMoveList() {
  const history = state.chess.history();
  els.moveList.innerHTML = "";
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${Math.floor(i / 2) + 1}.</strong><span>${history[i] || ""}</span><span>${history[i + 1] || ""}</span>`;
    els.moveList.appendChild(li);
  }
}

function updateExpectedMoves() {
  if (state.loadedLineCount === 0) {
    els.expectedMoves.textContent = "No repertoire loaded";
    return;
  }

  const moves = Array.from(state.currentNode.children.keys());
  if (moves.length === 0) {
    els.expectedMoves.textContent = "Line complete";
    return;
  }

  els.expectedMoves.innerHTML = moves.map(move => `<span class="pill">${escapeHtml(move)}</span>`).join("");
}

function updateProgress() {
  const depth = state.currentNode ? state.currentNode.depth : 0;
  const pct = state.maxDepth ? Math.min(100, Math.round((depth / state.maxDepth) * 100)) : 0;
  els.progressBar.style.width = `${pct}%`;
  els.progressText.textContent = `${depth} move${depth === 1 ? "" : "s"} followed`;
}

function setStatus(title, text, type = "") {
  els.statusCard.className = `status-card ${type}`.trim();
  els.statusTitle.textContent = title;
  els.statusText.textContent = text;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.addEventListener("DOMContentLoaded", init);
