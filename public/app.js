
const socket = io();

const $ = (id) => document.getElementById(id);

const nameInput = $("playerName");
const roomInput = $("roomCodeInput");

const createBtn = $("createBtn");
const joinBtn = $("joinBtn");
const backBtn = $("backBtn");
const copyCodeBtn = $("copyCodeBtn");
const restartBtn = $("restartBtn");
const playBotBtn = $("playBotBtn");
const botDifficultyEl = $("botDifficulty");

const lobbyEl = $("lobby");
const gameEl = $("game");
const boardEl = $("board");

const statusEl = $("statusText");
const roomCodeEl = $("roomCodeLabel");
const messageEl = $("lobbyMessage");
const gameMessageEl = $("gameMessage");
const toastEl = $("toast");

const playerXEl = $("playerX");
const playerOEl = $("playerO");
const nameXEl = $("nameX");
const nameOEl = $("nameO");
const youXEl = $("youX");
const youOEl = $("youO");

const SIZE = 15;
const WIN_LENGTH = 5;

let mySymbol = null;
let currentRoom = null;
let currentState = null;
let toastTimer = null;

let botMode = false;
let botThinking = false;
let botDifficulty = "medium";

// HIỂN THỊ THÔNG BÁO
function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastEl.classList.remove("show");
    }, 2200);
}

// TẠO BÀN CỜ
function createBoard() {
    boardEl.innerHTML = "";

    const fragment = document.createDocumentFragment();

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const cell = document.createElement("button");

            cell.type = "button";
            cell.className = "cell";
            cell.disabled = true;
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.setAttribute("aria-label", `Hàng ${r + 1}, cột ${c + 1}`);

            cell.addEventListener("click", () => {
                handleCellClick(r, c);
            });

            fragment.appendChild(cell);
        }
    }

    boardEl.appendChild(fragment);
}

createBoard();

// HIỂN THỊ BÀN CỜ
function renderBoard(state) {
    const winning = new Set(
        (state.winningCells || []).map(
            ([r, c]) => `${r},${c}`
        )
    );

    [...boardEl.children].forEach((cell, index) => {
        const r = Math.floor(index / SIZE);
        const c = index % SIZE;
        const value = state.board[r][c];

        let stone = cell.querySelector(".stone");

        if (value) {
            if (!stone) {
                stone = document.createElement("span");
                stone.className = "stone";
                cell.appendChild(stone);
            }

            stone.className = `stone ${String(value).toLowerCase()}`;
            stone.textContent = value;
        } else if (stone) {
            stone.remove();
        }

        cell.classList.toggle(
            "winning",
            winning.has(`${r},${c}`)
        );

        cell.disabled =
            Boolean(value) ||
            state.status !== "playing" ||
            (botMode
                ? state.turn !== "X" || botThinking
                : state.turn !== mySymbol);
    });
}

// HIỂN THỊ PHÒNG ONLINE
function showGame(data) {
    botMode = false;
    botThinking = false;

    currentRoom = data.code;
    mySymbol = data.symbol;

    roomCodeEl.textContent = currentRoom;

    lobbyEl.classList.add("hidden");
    gameEl.classList.remove("hidden");

    messageEl.textContent = "";
    gameMessageEl.textContent = "";

    showToast(`Đã vào phòng ${currentRoom}`);
}

// TẠO PHÒNG
createBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();

    if (!name) {
        messageEl.textContent = "Ông nhập tên người chơi trước nhé!";
        nameInput.focus();
        return;
    }

    createBtn.disabled = true;

    socket.emit("createRoom", { name }, (result) => {
        createBtn.disabled = false;

        if (!result || !result.ok) {
            messageEl.textContent =
                result?.message || "Không thể tạo phòng!";
            return;
        }

        showGame(result);
    });
});

// THAM GIA PHÒNG
joinBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const code = roomInput.value.trim().toUpperCase();

    if (!name) {
        messageEl.textContent = "Ông nhập tên người chơi trước nhé!";
        nameInput.focus();
        return;
    }

    if (!code) {
        messageEl.textContent = "Ông nhập mã phòng nhé!";
        roomInput.focus();
        return;
    }

    joinBtn.disabled = true;

    socket.emit("joinRoom", { name, code }, (result) => {
        joinBtn.disabled = false;

        if (!result || !result.ok) {
            messageEl.textContent =
                result?.message || "Không thể tham gia phòng!";
            return;
        }

        showGame(result);
    });
});

// CẬP NHẬT NGƯỜI CHƠI
function updatePlayers(players) {
    const playerX = players.find(p => p.symbol === "X");
    const playerO = players.find(p => p.symbol === "O");

    nameXEl.textContent = playerX?.name || "Đang chờ...";
    nameOEl.textContent = playerO?.name || "Đang chờ...";

    youXEl.textContent = playerX?.symbol === mySymbol ? "BẠN" : "";
    youOEl.textContent = playerO?.symbol === mySymbol ? "BẠN" : "";
}

// CẬP NHẬT TRẠNG THÁI
function updateStatus(state) {
    playerXEl.classList.toggle(
        "active",
        state.status === "playing" && state.turn === "X"
    );

    playerOEl.classList.toggle(
        "active",
        state.status === "playing" && state.turn === "O"
    );

    if (state.status === "waiting") {
        statusEl.textContent = "Đang chờ người chơi thứ hai...";
    } else if (state.status === "playing") {
        if (botMode) {
            statusEl.textContent = botThinking
                ? "🤖 Máy đang suy nghĩ..."
                : state.turn === "X"
                    ? "Đến lượt ông! Hãy chọn một ô."
                    : "Đến lượt máy...";
        } else {
            statusEl.textContent = state.turn === mySymbol
                ? "Đến lượt ông! Hãy chọn một ô."
                : `Đang chờ quân ${state.turn} đánh...`;
        }
    } else if (state.status === "finished") {
        statusEl.textContent = state.winner === mySymbol || (botMode && state.winner === "X")
            ? "🎉 Ông đã chiến thắng!"
            : botMode
                ? "🤖 Máy đã chiến thắng!"
                : `Quân ${state.winner} đã chiến thắng!`;

        gameMessageEl.textContent = "Ván đấu đã kết thúc.";
    } else if (state.status === "draw") {
        statusEl.textContent = "Ván đấu hòa!";
        gameMessageEl.textContent = "Hai bên hòa nhau.";
    }

    restartBtn.disabled = botMode
        ? false
        : state.status === "waiting" || state.players.length < 2;
}

// NHẬN TRẠNG THÁI ONLINE TỪ SERVER
socket.on("gameState", (state) => {
    if (botMode) return;

    currentState = state;

    updatePlayers(state.players || []);
    updateStatus(state);
    renderBoard(state);
});

// KIỂM TRA THẮNG
function checkWinner(board, row, col, symbol) {
    const directions = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1]
    ];

    const winningCells = [[row, col]];

    for (const [dr, dc] of directions) {
        const line = [[row, col]];

        for (const sign of [-1, 1]) {
            let r = row + dr * sign;
            let c = col + dc * sign;

            while (
                r >= 0 && r < SIZE &&
                c >= 0 && c < SIZE &&
                board[r][c] === symbol
            ) {
                line.push([r, c]);
                r += dr * sign;
                c += dc * sign;
            }
        }

        if (line.length >= WIN_LENGTH) {
            return line;
        }
    }

    return null;
}

// TẠO TRẠNG THÁI GAME MÁY
function startBotGame() {
    const name = nameInput.value.trim();

    if (!name) {
        messageEl.textContent = "Ông nhập tên người chơi trước nhé!";
        nameInput.focus();
        return;
    }

    botMode = true;
    botThinking = false;
    botDifficulty = botDifficultyEl?.value || "medium";

    currentRoom = null;
    mySymbol = "X";

    currentState = {
        board: Array.from(
            { length: SIZE },
            () => Array(SIZE).fill(null)
        ),
        players: [
            { name, symbol: "X" },
            { name: "Máy tính 🤖", symbol: "O" }
        ],
        turn: "X",
        status: "playing",
        winner: null,
        winningCells: []
    };

    roomCodeEl.textContent = "ĐẤU VỚI MÁY";

    lobbyEl.classList.add("hidden");
    gameEl.classList.remove("hidden");

    updatePlayers(currentState.players);
    updateStatus(currentState);
    renderBoard(currentState);

    showToast(`Đang chơi với máy - ${getDifficultyName()}`);
}

function getDifficultyName() {
    if (botDifficulty === "easy") return "Dễ";
    if (botDifficulty === "hard") return "Khó";
    return "Trung bình";
}

if (playBotBtn) {
    playBotBtn.addEventListener("click", startBotGame);
}

// ĐÁNH CỜ
function handleCellClick(row, col) {
    if (!currentState) return;

    if (botMode) {
        makeBotGameMove(row, col);
        return;
    }

    if (!currentRoom) return;

    socket.emit("makeMove", {
        code: currentRoom,
        row,
        col
    }, (result) => {
        if (result && !result.ok) {
            showToast(result.message);
        }
    });
}

// NGƯỜI CHƠI ĐÁNH TRONG CHẾ ĐỘ MÁY
function makeBotGameMove(row, col) {
    if (
        !botMode ||
        botThinking ||
        currentState.status !== "playing" ||
        currentState.turn !== "X" ||
        currentState.board[row][col]
    ) return;

    placeBotGameMove(row, col, "X");

    if (currentState.status !== "playing") return;

    botThinking = true;
    updateStatus(currentState);
    renderBoard(currentState);

    setTimeout(() => {
        if (!botMode || currentState.status !== "playing") return;

        const move = chooseBotMove(currentState.board);

        botThinking = false;

        if (move) {
            placeBotGameMove(move.row, move.col, "O");
        }

        updateStatus(currentState);
        renderBoard(currentState);
    }, botDifficulty === "easy" ? 350 : 650);
}

// ĐẶT QUÂN CHO GAME MÁY
function placeBotGameMove(row, col, symbol) {
    const board = currentState.board;

    if (board[row][col]) return;

    board[row][col] = symbol;

    const winningCells = checkWinner(board, row, col, symbol);

    if (winningCells) {
        currentState.status = "finished";
        currentState.winner = symbol;
        currentState.winningCells = winningCells;
    } else if (board.every(line => line.every(Boolean))) {
        currentState.status = "draw";
    } else {
        currentState.turn = symbol === "X" ? "O" : "X";
    }

    updateStatus(currentState);
    renderBoard(currentState);
}

// TÌM Ô TRỐNG GẦN QUÂN ĐÃ ĐÁNH
function getCandidateMoves(board) {
    const moves = [];
    const seen = new Set();

    const hasMove = board.some(row => row.some(Boolean));

    if (!hasMove) {
        return [{ row: 7, col: 7 }];
    }

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (!board[r][c]) continue;

            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;

                    if (
                        nr < 0 || nr >= SIZE ||
                        nc < 0 || nc >= SIZE ||
                        board[nr][nc]
                    ) continue;

                    const key = `${nr},${nc}`;

                    if (!seen.has(key)) {
                        seen.add(key);
                        moves.push({ row: nr, col: nc });
                    }
                }
            }
        }
    }

    return moves;
}

// KIỂM TRA NẾU ĐÁNH VÀO Ô NÀY THÌ CÓ THẮNG KHÔNG
function isWinningMove(board, row, col, symbol) {
    board[row][col] = symbol;
    const result = checkWinner(board, row, col, symbol);
    board[row][col] = null;
    return Boolean(result);
}

// ĐẾM ĐỘ NGUY HIỂM CỦA MỘT ĐƯỜNG
function evaluateDirection(board, row, col, symbol, dr, dc) {
    let count = 1;
    let openEnds = 0;

    for (const sign of [-1, 1]) {
        let r = row + dr * sign;
        let c = col + dc * sign;

        while (
            r >= 0 && r < SIZE &&
            c >= 0 && c < SIZE &&
            board[r][c] === symbol
        ) {
            count++;
            r += dr * sign;
            c += dc * sign;
        }

        if (
            r >= 0 && r < SIZE &&
            c >= 0 && c < SIZE &&
            !board[r][c]
        ) {
            openEnds++;
        }
    }

    if (count >= 5) return 1000000;
    if (count === 4 && openEnds === 2) return 100000;
    if (count === 4 && openEnds === 1) return 12000;
    if (count === 3 && openEnds === 2) return 5000;
    if (count === 3 && openEnds === 1) return 700;
    if (count === 2 && openEnds === 2) return 300;
    if (count === 2 && openEnds === 1) return 50;

    return count * 5;
}

// CHẤM ĐIỂM MỘT NƯỚC ĐI
function scoreMove(board, row, col, symbol) {
    const directions = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1]
    ];

    let score = 0;

    board[row][col] = symbol;

    for (const [dr, dc] of directions) {
        score += evaluateDirection(
            board, row, col, symbol, dr, dc
        );
    }

    board[row][col] = null;

    return score;
}

// AI CHỌN NƯỚC ĐI
function chooseBotMove(board) {
    const candidates = getCandidateMoves(board);

    if (!candidates.length) return null;

    // DỄ: CHỌN NGẪU NHIÊN
    if (botDifficulty === "easy") {
        return candidates[
            Math.floor(Math.random() * candidates.length)
        ];
    }

    // ƯU TIÊN THẮNG NGAY
    for (const move of candidates) {
        if (isWinningMove(board, move.row, move.col, "O")) {
            return move;
        }
    }

    // ƯU TIÊN CHẶN NGƯỜI CHƠI THẮNG NGAY
    for (const move of candidates) {
        if (isWinningMove(board, move.row, move.col, "X")) {
            return move;
        }
    }

    const scoredMoves = candidates.map(move => {
        const attack = scoreMove(
            board, move.row, move.col, "O"
        );

        const defense = scoreMove(
            board, move.row, move.col, "X"
        );

        const centerBonus =
            15 - (
                Math.abs(move.row - 7) +
                Math.abs(move.col - 7)
            );

        let score = attack * 1.15 + defense * 1.05 + centerBonus;

        if (botDifficulty === "hard") {
            score = attack * 1.3 + defense * 1.2 + centerBonus;
        }

        return { ...move, score };
    });

    scoredMoves.sort((a, b) => b.score - a.score);

    // TRUNG BÌNH: ĐÔI KHI CHỌN NƯỚC ĐI KHÁC
    if (botDifficulty === "medium" && Math.random() < 0.18) {
        const topMoves = scoredMoves.slice(0, Math.min(3, scoredMoves.length));

        return topMoves[
            Math.floor(Math.random() * topMoves.length)
        ];
    }

    // KHÓ: CHỌN NƯỚC CÓ ĐIỂM CAO NHẤT
    return scoredMoves[0];
}

// CHƠI LẠI
restartBtn.addEventListener("click", () => {
    if (botMode) {
        startBotGame();
        return;
    }

    if (!currentRoom) return;

    restartBtn.disabled = true;

    socket.emit("restartGame", {
        code: currentRoom
    }, (result) => {
        if (!result || !result.ok) {
            showToast(result?.message || "Không thể chơi lại!");
        }
    });
});

// SAO CHÉP MÃ PHÒNG
copyCodeBtn.addEventListener("click", async () => {
    if (!currentRoom) return;

    try {
        await navigator.clipboard.writeText(currentRoom);
        showToast("Đã sao chép mã phòng!");
    } catch {
        showToast(`Mã phòng: ${currentRoom}`);
    }
});

// RỜI PHÒNG / THOÁT GAME
function leaveCurrentRoom() {
    if (currentRoom) {
        socket.emit("leaveRoom", {
            code: currentRoom
        });
    }

    currentRoom = null;
    mySymbol = null;
    currentState = null;

    botMode = false;
    botThinking = false;

    gameEl.classList.add("hidden");
    lobbyEl.classList.remove("hidden");

    gameMessageEl.textContent = "";
    statusEl.textContent = "Đã rời phòng";

    createBoard();
}

backBtn.addEventListener("click", leaveCurrentRoom);

// ĐỐI THỦ RỜI PHÒNG
socket.on("opponentLeft", () => {
    showToast("Đối thủ đã rời phòng!");

    if (currentRoom) {
        statusEl.textContent =
            "Đối thủ đã rời phòng. Đang chờ người mới...";
    }
});

// KẾT NỐI
socket.on("connect", () => {
    console.log("Đã kết nối máy chủ:", socket.id);
});

socket.on("disconnect", () => {
    if (!botMode) {
        statusEl.textContent = "Mất kết nối máy chủ...";
    }
});

socket.on("connect_error", () => {
    messageEl.textContent =
        "Không thể kết nối máy chủ. Thử tải lại trang nhé!";
});
