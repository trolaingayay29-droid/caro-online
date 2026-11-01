
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const SIZE = 15;

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function createCode() {
    let code;

    do {
        code = crypto.randomBytes(3).toString("hex").toUpperCase();
    } while (rooms.has(code));

    return code;
}

function newBoard() {
    return Array.from(
        { length: SIZE },
        () => Array(SIZE).fill(null)
    );
}

function cleanName(name) {
    return String(name || "Người chơi")
        .trim()
        .slice(0, 18) || "Người chơi";
}

function publicPlayers(room) {
    return room.players.map(player => ({
        symbol: player.symbol,
        name: player.name
    }));
}

function sendState(room) {
    io.to(room.code).emit("gameState", {
        code: room.code,
        board: room.board,
        players: publicPlayers(room),
        turn: room.turn,
        status: room.status,
        winner: room.winner,
        winningCells: room.winningCells
    });
}

function checkWinner(board, row, col, symbol) {
    const directions = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1]
    ];

    for (const [dr, dc] of directions) {
        const cells = [[row, col]];

        for (const sign of [-1, 1]) {
            let r = row + dr * sign;
            let c = col + dc * sign;

            while (
                r >= 0 && r < SIZE &&
                c >= 0 && c < SIZE &&
                board[r][c] === symbol
            ) {
                cells.push([r, c]);
                r += dr * sign;
                c += dc * sign;
            }
        }

        if (cells.length >= 5) return cells;
    }

    return null;
}

function isBoardFull(board) {
    return board.every(row =>
        row.every(cell => cell !== null)
    );
}

/* Đánh giá một nước đi cho máy */
function scoreMove(board, row, col, symbol) {
    const directions = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1]
    ];

    let score = 0;

    for (const [dr, dc] of directions) {
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
                board[r][c] === null
            ) {
                openEnds++;
            }
        }

        if (count >= 5) score += 100000;
        else if (count === 4) score += openEnds === 2 ? 20000 : 10000;
        else if (count === 3) score += openEnds === 2 ? 3000 : 500;
        else if (count === 2) score += openEnds === 2 ? 300 : 50;
        else score += 5;
    }

    return score;
}

/* Máy chọn nước đi */
function getBotMove(board) {
    const candidates = [];

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (board[r][c] !== null) continue;

            // Ưu tiên các ô gần quân đã đánh
            let near = false;

            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;

                    if (
                        nr >= 0 && nr < SIZE &&
                        nc >= 0 && nc < SIZE &&
                        board[nr][nc] !== null
                    ) {
                        near = true;
                    }
                }
            }

            if (near || board.every(row => row.every(v => v === null))) {
                candidates.push([r, c]);
            }
        }
    }

    let bestMove = null;
    let bestScore = -Infinity;

    for (const [r, c] of candidates) {
        board[r][c] = "O";

        const attack = scoreMove(board, r, c, "O");

        board[r][c] = "X";

        const defense = scoreMove(board, r, c, "X");

        board[r][c] = null;

        const centerBonus =
            15 - Math.abs(7 - r) - Math.abs(7 - c);

        const score = attack * 1.15 + defense + centerBonus;

        if (score > bestScore) {
            bestScore = score;
            bestMove = [r, c];
        }
    }

    return bestMove;
}

/* Thực hiện nước đi của máy */
function botMove(room) {
    if (
        !room ||
        !room.isBot ||
        room.status !== "playing" ||
        room.turn !== "O"
    ) return;

    const move = getBotMove(room.board);

    if (!move) {
        room.status = "draw";
        sendState(room);
        return;
    }

    const [row, col] = move;

    room.board[row][col] = "O";

    const winningCells = checkWinner(
        room.board,
        row,
        col,
        "O"
    );

    if (winningCells) {
        room.status = "finished";
        room.winner = "O";
        room.winningCells = winningCells;
    } else if (isBoardFull(room.board)) {
        room.status = "draw";
    } else {
        room.turn = "X";
    }

    sendState(room);
}

/* Rời phòng */
function leaveRoom(socket, code) {
    code = String(code || "").trim().toUpperCase();

    const room = rooms.get(code);

    if (!room) {
        return {
            ok: false,
            message: "Phòng không tồn tại!"
        };
    }

    const playerExists = room.players.some(
        player => player.id === socket.id
    );

    if (!playerExists) {
        return {
            ok: false,
            message: "Bạn không thuộc phòng này!"
        };
    }

    room.players = room.players.filter(
        player => player.id !== socket.id
    );

    socket.leave(room.code);
    socket.emit("roomLeft");

    if (room.players.length === 0) {
        rooms.delete(room.code);
    } else {
        room.board = newBoard();
        room.turn = "X";
        room.status = "waiting";
        room.winner = null;
        room.winningCells = [];

        io.to(room.code).emit("opponentLeft");
        sendState(room);
    }

    return { ok: true };
}

io.on("connection", socket => {
    console.log("Người chơi kết nối:", socket.id);

    /* Tạo phòng online */
    socket.on("createRoom", ({ name } = {}, callback = () => {}) => {
        const code = createCode();

        const room = {
            code,
            board: newBoard(),
            players: [{
                id: socket.id,
                symbol: "X",
                name: cleanName(name)
            }],
            isBot: false,
            turn: "X",
            status: "waiting",
            winner: null,
            winningCells: []
        };

        rooms.set(code, room);
        socket.join(code);

        callback({
            ok: true,
            code,
            symbol: "X"
        });

        sendState(room);
    });

    /* Tạo phòng chơi với máy */
    socket.on("createBotRoom", ({ name } = {}, callback = () => {}) => {
        const code = createCode();

        const room = {
            code,
            board: newBoard(),
            players: [
                {
                    id: socket.id,
                    symbol: "X",
                    name: cleanName(name)
                },
                {
                    id: "BOT",
                    symbol: "O",
                    name: "Máy tính"
                }
            ],
            isBot: true,
            turn: "X",
            status: "playing",
            winner: null,
            winningCells: []
        };

        rooms.set(code, room);
        socket.join(code);

        callback({
            ok: true,
            code,
            symbol: "X"
        });

        sendState(room);
    });

    /* Tham gia phòng online */
    socket.on("joinRoom", ({ code, name } = {}, callback = () => {}) => {
        code = String(code || "").trim().toUpperCase();

        const room = rooms.get(code);

        if (!room) {
            return callback({
                ok: false,
                message: "Không tìm thấy phòng!"
            });
        }

        if (room.players.length >= 2 || room.isBot) {
            return callback({
                ok: false,
                message: "Phòng đã đủ người!"
            });
        }

        if (room.status !== "waiting") {
            return callback({
                ok: false,
                message: "Phòng không thể tham gia lúc này!"
            });
        }

        room.players.push({
            id: socket.id,
            symbol: "O",
            name: cleanName(name)
        });

        room.status = "playing";
        socket.join(code);

        callback({
            ok: true,
            code,
            symbol: "O"
        });

        sendState(room);
    });

    /* Đánh cờ */
    socket.on("makeMove", ({ code, row, col } = {}, callback = () => {}) => {
        code = String(code || "").trim().toUpperCase();

        const room = rooms.get(code);

        if (!room) {
            return callback({ ok: false, message: "Phòng không tồn tại!" });
        }

        const player = room.players.find(p => p.id === socket.id);

        if (!player) {
            return callback({ ok: false, message: "Bạn không thuộc phòng này!" });
        }

        if (room.status !== "playing") {
            return callback({ ok: false, message: "Ván chơi chưa sẵn sàng!" });
        }

        if (player.symbol !== room.turn) {
            return callback({ ok: false, message: "Chưa đến lượt bạn!" });
        }

        if (
            !Number.isInteger(row) ||
            !Number.isInteger(col) ||
            row < 0 || row >= SIZE ||
            col < 0 || col >= SIZE
        ) {
            return callback({ ok: false, message: "Vị trí không hợp lệ!" });
        }

        if (room.board[row][col] !== null) {
            return callback({ ok: false, message: "Ô này đã có quân!" });
        }

        room.board[row][col] = player.symbol;

        const winningCells = checkWinner(
            room.board,
            row,
            col,
            player.symbol
        );

        if (winningCells) {
            room.status = "finished";
            room.winner = player.symbol;
            room.winningCells = winningCells;
        } else if (isBoardFull(room.board)) {
            room.status = "draw";
        } else {
            room.turn = player.symbol === "X" ? "O" : "X";
        }

        callback({ ok: true });
        sendState(room);

        if (room.isBot && room.status === "playing") {
            setTimeout(() => botMove(room), 650);
        }
    });

    /* Chơi lại */
    socket.on("restartGame", ({ code } = {}, callback = () => {}) => {
        code = String(code || "").trim().toUpperCase();

        const room = rooms.get(code);

        if (!room) {
            return callback({ ok: false, message: "Phòng không tồn tại!" });
        }

        if (!room.players.some(p => p.id === socket.id)) {
            return callback({ ok: false, message: "Bạn không thuộc phòng này!" });
        }

        if (!room.isBot && room.players.length < 2) {
            return callback({ ok: false, message: "Cần đủ 2 người chơi!" });
        }

        room.board = newBoard();
        room.turn = "X";
        room.status = room.isBot ? "playing" : "playing";
        room.winner = null;
        room.winningCells = [];

        callback({ ok: true });
        sendState(room);
    });

    /* Rời phòng */
    socket.on("leaveRoom", ({ code } = {}, callback = () => {}) => {
        const result = leaveRoom(socket, code);
        callback(result);
    });

    /* Ngắt kết nối */
    socket.on("disconnect", () => {
        console.log("Người chơi ngắt kết nối:", socket.id);

        for (const room of rooms.values()) {
            if (room.players.some(p => p.id === socket.id)) {
                leaveRoom(socket, room.code);
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Caro Online đang chạy tại cổng ${PORT}`);
});
