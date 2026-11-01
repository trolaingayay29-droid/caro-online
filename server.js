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

/* Danh sách phòng đang hoạt động */
const rooms = new Map();

/* Tạo mã phòng */
function createCode() {
    let code;

    do {
        code = crypto.randomBytes(3)
            .toString("hex")
            .toUpperCase();
    } while (rooms.has(code));

    return code;
}

/* Tạo bàn cờ 15 x 15 */
function newBoard() {
    return Array.from(
        { length: SIZE },
        () => Array(SIZE).fill(null)
    );
}

/* Làm sạch tên người chơi */
function cleanName(name) {
    return String(name || "Người chơi")
        .trim()
        .slice(0, 18) || "Người chơi";
}

/* Gửi trạng thái phòng */
function sendState(room) {
    io.to(room.code).emit("gameState", {
        code: room.code,
        board: room.board,
        players: room.players.map(player => ({
            symbol: player.symbol,
            name: player.name
        })),
        turn: room.turn,
        status: room.status,
        winner: room.winner,
        winningCells: room.winningCells
    });
}

/* Kiểm tra thắng */
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
                r >= 0 &&
                r < SIZE &&
                c >= 0 &&
                c < SIZE &&
                board[r][c] === symbol
            ) {
                cells.push([r, c]);

                r += dr * sign;
                c += dc * sign;
            }
        }

        if (cells.length >= 5) {
            return cells;
        }
    }

    return null;
}

/* Xử lý người chơi rời phòng */
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

    /* Báo cho người rời phòng */
    socket.emit("roomLeft");

    if (room.players.length === 0) {
        rooms.delete(room.code);
    } else {
        /* Đưa ván đấu về trạng thái chờ */
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

/* Kết nối người chơi */
io.on("connection", socket => {
    console.log("Người chơi kết nối:", socket.id);

    /* TẠO PHÒNG */
    socket.on("createRoom", ({ name } = {}, callback = () => {}) => {
        const code = createCode();

        const room = {
            code,
            board: newBoard(),

            players: [
                {
                    id: socket.id,
                    symbol: "X",
                    name: cleanName(name)
                }
            ],

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

    /* THAM GIA PHÒNG */
    socket.on("joinRoom", ({ code, name } = {}, callback = () => {}) => {
        code = String(code || "").trim().toUpperCase();

        const room = rooms.get(code);

        if (!room) {
            return callback({
                ok: false,
                message: "Không tìm thấy phòng!"
            });
        }

        if (room.players.length >= 2) {
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

    /* ĐÁNH CỜ */
    socket.on("makeMove", ({ code, row, col } = {}, callback = () => {}) => {
        code = String(code || "").trim().toUpperCase();

        const room = rooms.get(code);

        if (!room) {
            return callback({
                ok: false,
                message: "Phòng không tồn tại!"
            });
        }

        const player = room.players.find(
            p => p.id === socket.id
        );

        if (!player) {
            return callback({
                ok: false,
                message: "Bạn không thuộc phòng này!"
            });
        }

        if (room.status !== "playing") {
            return callback({
                ok: false,
                message: "Ván chơi chưa sẵn sàng!"
            });
        }

        if (player.symbol !== room.turn) {
            return callback({
                ok: false,
                message: "Chưa đến lượt bạn!"
            });
        }

        if (
            !Number.isInteger(row) ||
            !Number.isInteger(col) ||
            row < 0 ||
            row >= SIZE ||
            col < 0 ||
            col >= SIZE
        ) {
            return callback({
                ok: false,
                message: "Vị trí không hợp lệ!"
            });
        }

        if (room.board[row][col] !== null) {
            return callback({
                ok: false,
                message: "Ô này đã có quân!"
            });
        }

        /* Đặt quân */
        room.board[row][col] = player.symbol;

        /* Kiểm tra thắng */
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
        } else if (
            room.board.every(line =>
                line.every(cell => cell !== null)
            )
        ) {
            room.status = "draw";
        } else {
            room.turn = room.turn === "X" ? "O" : "X";
        }

        callback({ ok: true });

        sendState(room);
    });

    /* CHƠI LẠI */
    socket.on("restartGame", ({ code } = {}, callback = () => {}) => {
        code = String(code || "").trim().toUpperCase();

        const room = rooms.get(code);

        if (!room) {
            return callback({
                ok: false,
                message: "Phòng không tồn tại!"
            });
        }

        const playerExists = room.players.some(
            player => player.id === socket.id
        );

        if (!playerExists) {
            return callback({
                ok: false,
                message: "Bạn không thuộc phòng này!"
            });
        }

        if (room.players.length < 2) {
            return callback({
                ok: false,
                message: "Cần đủ 2 người chơi!"
            });
        }

        room.board = newBoard();
        room.turn = "X";
        room.status = "playing";
        room.winner = null;
        room.winningCells = [];

        callback({ ok: true });

        sendState(room);
    });

    /* RỜI PHÒNG */
    socket.on("leaveRoom", ({ code } = {}, callback = () => {}) => {
        const result = leaveRoom(socket, code);

        callback(result);
    });

    /* NGẮT KẾT NỐI */
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

/* Khởi chạy server */
server.listen(PORT, () => {
    console.log(`Caro Online đang chạy tại cổng ${PORT}`);
});
