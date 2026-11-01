const socket = io();

const $ = (id) => document.getElementById(id);

/* Lấy đúng các phần tử theo index.html */
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

const roomCodeEl = $("roomCodeLabel");
const statusEl = $("statusText");
const lobbyMessage = $("lobbyMessage");
const gameMessage = $("gameMessage");
const toastEl = $("toast");

const playerXEl = $("playerX");
const playerOEl = $("playerO");
const nameXEl = $("nameX");
const nameOEl = $("nameO");
const youXEl = $("youX");
const youOEl = $("youO");

const SIZE = 15;

let mySymbol = null;
let currentRoom = null;
let currentState = null;
let toastTimeout = null;

/* Thông báo nhỏ trên màn hình */
function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toastEl.classList.remove("show");
    }, 2200);
}

/* Hiển thị lỗi */
function showLobbyError(message) {
    lobbyMessage.textContent = message;
}

function showGameMessage(message) {
    gameMessage.textContent = message;
}

/* Gửi sự kiện có callback */
function emitWithAck(eventName, data, callback) {
    socket.emit(eventName, data, (result) => {
        if (!result) {
            callback({
                ok: false,
                message: "Không nhận được phản hồi từ máy chủ."
            });
            return;
        }

        callback(result);
    });
}

/* Tạo bàn cờ 15 x 15 đúng một lần */
function createBoard() {
    boardEl.innerHTML = "";

    const fragment = document.createDocumentFragment();

    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const cell = document.createElement("button");

            cell.type = "button";
            cell.className = "cell";
            cell.disabled = true;
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.setAttribute(
                "aria-label",
                `Hàng ${row + 1}, cột ${col + 1}`
            );

            cell.addEventListener("click", () => {
                makeMove(row, col);
            });

            fragment.appendChild(cell);
        }
    }

    boardEl.appendChild(fragment);
}

createBoard();

/* Cập nhật thông tin hai người chơi */
function updatePlayers(players = []) {
    const playerX = players.find(p => p.symbol === "X");
    const playerO = players.find(p => p.symbol === "O");

    nameXEl.textContent = playerX
        ? playerX.name
        : "Đang chờ người chơi...";

    nameOEl.textContent = playerO
        ? playerO.name
        : "Đang chờ người chơi...";

    youXEl.textContent = mySymbol === "X" ? "BẠN" : "";
    youOEl.textContent = mySymbol === "O" ? "BẠN" : "";
}

/* Đánh dấu người đang tới lượt */
function updateTurnDisplay(state) {
    playerXEl.classList.toggle(
        "active",
        state.status === "playing" && state.turn === "X"
    );

    playerOEl.classList.toggle(
        "active",
        state.status === "playing" && state.turn === "O"
    );
}

/* Tạo hoặc cập nhật quân cờ */
function updateBoard(state) {
    const winning = new Set(
        (state.winningCells || []).map(
            ([row, col]) => `${row},${col}`
        )
    );

    [...boardEl.children].forEach((cell, index) => {
        const row = Math.floor(index / SIZE);
        const col = index % SIZE;
        const value = state.board[row][col];

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
            winning.has(`${row},${col}`)
        );

        cell.disabled =
            Boolean(value) ||
            state.status !== "playing" ||
            state.turn !== mySymbol;
    });
}

/* Cập nhật trạng thái trận đấu */
function updateStatus(state) {
    if (state.status === "waiting") {
        statusEl.textContent = "Đang chờ người chơi thứ hai...";
    } else if (state.status === "playing") {
        statusEl.textContent = state.turn === mySymbol
            ? "Đến lượt ông! Hãy chọn một ô."
            : `Đang chờ quân ${state.turn} đánh...`;
    } else if (state.status === "finished") {
        statusEl.textContent = state.winner === mySymbol
            ? "🎉 Ông đã chiến thắng!"
            : `Quân ${state.winner} đã chiến thắng!`;
    } else if (state.status === "draw") {
        statusEl.textContent = "🤝 Hai bên hòa nhau!";
    }

    restartBtn.disabled =
        state.status !== "finished" &&
        state.status !== "draw";
}

/* Tạo phòng */
createBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();

    showLobbyError("");

    if (!name) {
        showLobbyError("Ông nhập tên người chơi trước nhé!");
        nameInput.focus();
        return;
    }

    createBtn.disabled = true;

    emitWithAck("createRoom", { name }, (result) => {
        createBtn.disabled = false;

        if (!result.ok) {
            showLobbyError(result.message || "Không tạo được phòng.");
            return;
        }

        enterGame(result);
        showToast("Đã tạo phòng thành công!");
    });
});

/* Tham gia phòng */
joinBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const code = roomInput.value.trim().toUpperCase();

    showLobbyError("");

    if (!name) {
        showLobbyError("Ông nhập tên người chơi trước nhé!");
        nameInput.focus();
        return;
    }

    if (!code) {
        showLobbyError("Ông nhập mã phòng nhé!");
        roomInput.focus();
        return;
    }

    joinBtn.disabled = true;

    emitWithAck("joinRoom", { name, code }, (result) => {
        joinBtn.disabled = false;

        if (!result.ok) {
            showLobbyError(result.message || "Không vào được phòng.");
            return;
        }

        enterGame(result);
        showToast("Đã vào phòng thành công!");
    });
});

/* Vào giao diện trận đấu sau khi server xác nhận */
function enterGame(result) {
    currentRoom = result.code;
    mySymbol = result.symbol;

    roomCodeEl.textContent = currentRoom;

    lobbyEl.classList.add("hidden");
    gameEl.classList.remove("hidden");

    showGameMessage("");

    createBoard();

    statusEl.textContent = `Ông đang chơi quân ${mySymbol}`;
}

/* Gửi nước đi */
function makeMove(row, col) {
    if (!currentRoom || !currentState) return;
    if (currentState.status !== "playing") return;
    if (currentState.turn !== mySymbol) return;

    const value = currentState.board[row][col];

    if (value !== null) return;

    emitWithAck(
        "makeMove",
        {
            code: currentRoom,
            row,
            col
        },
        (result) => {
            if (!result.ok) {
                showToast(result.message || "Nước đi không hợp lệ.");
            }
        }
    );
}

/* Nhận trạng thái mới từ server */
socket.on("gameState", (state) => {
    currentState = state;

    updatePlayers(state.players || []);
    updateTurnDisplay(state);
    updateBoard(state);
    updateStatus(state);
});

/* Chơi ván mới */
restartBtn.addEventListener("click", () => {
    if (!currentRoom) return;

    restartBtn.disabled = true;

    emitWithAck(
        "restartGame",
        { code: currentRoom },
        (result) => {
            if (!result.ok) {
                showToast(result.message || "Không thể chơi lại.");
                restartBtn.disabled = false;
            } else {
                showGameMessage("");
                showToast("Đã bắt đầu ván mới!");
            }
        }
    );
});

/* Sao chép mã phòng */
copyCodeBtn.addEventListener("click", async () => {
    if (!currentRoom) return;

    try {
        await navigator.clipboard.writeText(currentRoom);
        showToast("Đã sao chép mã phòng!");
    } catch {
        showToast(`Mã phòng: ${currentRoom}`);
    }
});

/* Rời phòng và quay về sảnh */
backBtn.addEventListener("click", () => {
    if (!currentRoom) {
        returnToLobby();
        return;
    }

    backBtn.disabled = true;

    emitWithAck("leaveRoom", { code: currentRoom }, (result) => {
        backBtn.disabled = false;

        if (!result.ok) {
            showToast(result.message || "Không thể rời phòng.");
        }
    });
});

/* Trở về sảnh */
function returnToLobby() {
    currentRoom = null;
    mySymbol = null;
    currentState = null;

    gameEl.classList.add("hidden");
    lobbyEl.classList.remove("hidden");

    roomCodeEl.textContent = "------";
    statusEl.textContent = "Đang chờ người chơi thứ hai...";

    showGameMessage("");
    restartBtn.disabled = true;

    createBoard();
}

/* Server xác nhận đã rời phòng */
socket.on("roomLeft", () => {
    returnToLobby();
    showToast("Đã rời phòng.");
});

/* Đối thủ rời phòng */
socket.on("opponentLeft", () => {
    showToast("Đối thủ đã rời phòng.");
});

/* Lỗi từ server */
socket.on("errorMessage", (message) => {
    showToast(message);
});

/* Mất kết nối */
socket.on("disconnect", () => {
    if (currentRoom) {
        statusEl.textContent = "Mất kết nối máy chủ...";
    }
});

/* Kết nối lại */
socket.on("connect", () => {
    if (currentRoom) {
        statusEl.textContent =
            "Đã kết nối lại. Nếu phòng không còn, hãy tạo phòng mới.";
    }
});
