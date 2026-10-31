
const socket = io();

const $ = id => document.getElementById(id);

let mySymbol = null;
let roomCode = null;
let latestState = null;

const lobby = $("lobby");
const game = $("game");
const boardEl = $("board");

let toastTimer;

function showToast(message) {
    const el = $("toast");

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        el.classList.remove("show");
    }, 2500);
}

function playerName() {
    return $("playerName").value.trim() || "Người chơi";
}

function enterGame(code, symbol) {
    roomCode = code;
    mySymbol = symbol;

    $("roomCodeLabel").textContent = code;

    lobby.classList.add("hidden");
    game.classList.remove("hidden");
}

function createBoard() {
    boardEl.innerHTML = "";

    for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {

            const cell = document.createElement("button");

            cell.className = "cell";
            cell.type = "button";

            cell.addEventListener("click", () => {

                if (
                    !latestState ||
                    latestState.status !== "playing"
                ) return;

                socket.emit("makeMove", {
                    code: roomCode,
                    row: r,
                    col: c
                }, result => {
                    if (result && !result.ok) {
                        showToast(result.message);
                    }
                });

            });

            boardEl.appendChild(cell);
        }
    }
}

createBoard();

// TẠO PHÒNG
$("createBtn").onclick = () => {

    $("lobbyMessage").textContent = "";

    socket.emit("createRoom", {
        name: playerName()
    }, result => {

        if (!result.ok) {
            $("lobbyMessage").textContent =
                "Không thể tạo phòng!";
            return;
        }

        enterGame(result.code, result.symbol);
    });
};

// THAM GIA PHÒNG
$("joinBtn").onclick = () => {

    $("lobbyMessage").textContent = "";

    const code = $("roomCodeInput")
        .value.trim().toUpperCase();

    if (!code) {
        $("lobbyMessage").textContent =
            "Vui lòng nhập mã phòng!";
        return;
    }

    socket.emit("joinRoom", {
        code,
        name: playerName()
    }, result => {

        if (!result.ok) {
            $("lobbyMessage").textContent =
                result.message;
            return;
        }

        enterGame(result.code, result.symbol);
    });
};

// NHẬN TRẠNG THÁI GAME
socket.on("gameState", state => {

    if (state.code !== roomCode) return;

    latestState = state;

    $("nameX").textContent =
        state.players.find(p => p.symbol === "X")?.name
        || "Đang chờ...";

    $("nameO").textContent =
        state.players.find(p => p.symbol === "O")?.name
        || "Đang chờ...";

    $("youX").textContent =
        mySymbol === "X" ? "BẠN" : "";

    $("youO").textContent =
        mySymbol === "O" ? "BẠN" : "";

    $("playerX").classList.toggle(
        "active",
        state.turn === "X" && state.status === "playing"
    );

    $("playerO").classList.toggle(
        "active",
        state.turn === "O" && state.status === "playing"
    );

    $("restartBtn").disabled =
        state.players.length < 2;

    if (state.status === "waiting") {

        $("statusText").textContent =
            "Đang chờ người chơi thứ hai...";

    } else if (state.status === "playing") {

        $("statusText").textContent =
            state.turn === mySymbol
                ? "Đến lượt bạn!"
                : "Đang chờ đối thủ đánh...";

    } else if (state.status === "finished") {

        $("statusText").textContent =
            state.winner === mySymbol
                ? "🎉 Bạn đã chiến thắng!"
                : "Đối thủ đã chiến thắng!";

    } else {

        $("statusText").textContent =
            "Hai người hòa nhau!";
    }

    const winning = new Set(
        (state.winningCells || [])
        .map(([r, c]) => `${r},${c}`)
    );

    [...boardEl.children].forEach((cell, index) => {

        const r = Math.floor(index / 15);
        const c = index % 15;

        const value = state.board[r][c];

        cell.innerHTML = value
            ? `<span class="stone ${value.toLowerCase()}">${value}</span>`
            : "";

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
$("restartBtn").onclick = () => {

    socket.emit("restartGame", {
        code: roomCode
    }, result => {

        if (!result.ok) {
            showToast(result.message);
        }
    });
};

// SAO CHÉP MÃ PHÒNG
$("copyCodeBtn").onclick = async () => {

    try {
        await navigator.clipboard.writeText(roomCode);
        showToast("Đã sao chép mã phòng!");

    } catch {
        showToast("Mã phòng: " + roomCode);
    }
};

// RỜI PHÒNG
$("backBtn").onclick = () => {

    if (roomCode) {
        socket.emit("leaveRoom", {
            code: roomCode
        });
    }

    roomCode = null;
    mySymbol = null;
    latestState = null;

    game.classList.add("hidden");
    lobby.classList.remove("hidden");
};

// ĐỐI THỦ RỜI PHÒNG
socket.on("opponentLeft", () => {
    showToast("Đối thủ đã rời phòng!");
});

// MẤT KẾT NỐI
socket.on("disconnect", () => {
    showToast("Mất kết nối máy chủ!");
});
