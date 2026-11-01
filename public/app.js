
const socket = io();

const $ = (id) => document.getElementById(id);

const nameInput = $("playerName");
const roomInput = $("roomCodeInput");

const createBtn = $("createBtn");
const joinBtn = $("joinBtn");
const backBtn = $("backBtn");
const copyCodeBtn = $("copyCodeBtn");
const restartBtn = $("restartBtn");

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

let mySymbol = null;
let currentRoom = null;
let currentState = null;
let toastTimer = null;

// HIỂN THỊ THÔNG BÁO
function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastEl.classList.remove("show");
    }, 2200);
}

// TẠO BÀN CỜ 15 X 15
function createBoard() {
    boardEl.innerHTML = "";

    const fragment = document.createDocumentFragment();

    for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
            const cell = document.createElement("button");

            cell.type = "button";
            cell.className = "cell";
            cell.disabled = true;
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.setAttribute("aria-label", `Hàng ${r + 1}, cột ${c + 1}`);

            cell.addEventListener("click", () => {
                if (!currentRoom || !currentState) return;

                socket.emit("makeMove", {
                    code: currentRoom,
                    row: r,
                    col: c
                }, (result) => {
                    if (result && !result.ok) {
                        showToast(result.message);
                    }
                });
            });

            fragment.appendChild(cell);
        }
    }

    boardEl.appendChild(fragment);
}

createBoard();

// HIỂN THỊ PHÒNG
function showGame(data) {
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

    socket.emit("joinRoom", {
        name,
        code
    }, (result) => {
        joinBtn.disabled = false;

        if (!result || !result.ok) {
            messageEl.textContent =
                result?.message || "Không thể tham gia phòng!";
            return;
        }

        showGame(result);
    });
});

// CẬP NHẬT THÔNG TIN NGƯỜI CHƠI
function updatePlayers(players) {
    const playerX = players.find(p => p.symbol === "X");
    const playerO = players.find(p => p.symbol === "O");

    nameXEl.textContent = playerX?.name || "Đang chờ...";
    nameOEl.textContent = playerO?.name || "Đang chờ...";

    youXEl.textContent = playerX?.symbol === mySymbol ? "BẠN" : "";
    youOEl.textContent = playerO?.symbol === mySymbol ? "BẠN" : "";
}

// CẬP NHẬT TRẠNG THÁI TRẬN ĐẤU
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
        statusEl.textContent = state.turn === mySymbol
            ? "Đến lượt ông! Hãy chọn một ô."
            : `Đang chờ quân ${state.turn} đánh...`;
    } else if (state.status === "finished") {
        statusEl.textContent =
            state.winner === mySymbol
                ? "🎉 Ông đã chiến thắng!"
                : `Quân ${state.winner} đã chiến thắng!`;

        gameMessageEl.textContent = "Ván đấu đã kết thúc.";
    } else if (state.status === "draw") {
        statusEl.textContent = "Ván đấu hòa!";
        gameMessageEl.textContent = "Hai người chơi hòa nhau.";
    }

    restartBtn.disabled =
        state.status === "waiting" ||
        state.players.length < 2;
}

// NHẬN TRẠNG THÁI TỪ SERVER
socket.on("gameState", (state) => {
    currentState = state;

    updatePlayers(state.players || []);
    updateStatus(state);

    const winning = new Set(
        (state.winningCells || []).map(
            ([r, c]) => `${r},${c}`
        )
    );

    [...boardEl.children].forEach((cell, index) => {
        const r = Math.floor(index / 15);
        const c = index % 15;
        const value = state.board[r][c];

        let stone = cell.querySelector(".stone");

        if (value) {
            if (!stone) {
                stone = document.createElement("span");
                stone.className = "stone";
                cell.appendChild(stone);
            }

            stone.className =
                `stone ${String(value).toLowerCase()}`;

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
            state.turn !== mySymbol;
    });
});

// CHƠI LẠI
restartBtn.addEventListener("click", () => {
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

// RỜI PHÒNG
function leaveCurrentRoom() {
    if (!currentRoom) return;

    socket.emit("leaveRoom", {
        code: currentRoom
    });

    currentRoom = null;
    mySymbol = null;
    currentState = null;

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
        statusEl.textContent = "Đối thủ đã rời phòng. Đang chờ người mới...";
    }
});

// KẾT NỐI
socket.on("connect", () => {
    console.log("Đã kết nối máy chủ:", socket.id);
});

socket.on("disconnect", () => {
    statusEl.textContent = "Mất kết nối máy chủ...";
});

socket.on("connect_error", () => {
    messageEl.textContent = "Không thể kết nối máy chủ. Thử tải lại trang nhé!";
});
