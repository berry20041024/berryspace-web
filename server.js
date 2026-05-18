const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

let gameState = {
    commanderId: null,
    teamPoints: 0,
    players: {}
};

io.on('connection', (socket) => {
    console.log(`戰士加入: ${socket.id}`);

    // 初始化玩家資料：加入 XP 與 Level
    gameState.players[socket.id] = {
        id: socket.id,
        role: "GRUNT",
        points: 0,
        xp: 0,
        level: 1,
        x: 100, y: 450
    };

    if (!gameState.commanderId) {
        gameState.commanderId = socket.id;
        gameState.players[socket.id].role = "LEADER";
    }

    socket.emit('init', {
        id: socket.id,
        players: gameState.players,
        commanderId: gameState.commanderId,
        teamPoints: gameState.teamPoints
    });

    socket.broadcast.emit('newPlayer', gameState.players[socket.id]);

    // 處理點數轉帳
    socket.on('transferPoints', (amount) => {
        const p = gameState.players[socket.id];
        if (p && p.points >= amount) {
            p.points -= amount;
            gameState.teamPoints += amount;
            io.emit('pointsUpdated', {
                playerId: socket.id,
                personalPoints: p.points,
                teamPoints: gameState.teamPoints
            });
        }
    });

    // 處理擊殺、獲得 XP 與升級檢測
    socket.on('enemyKilled', (payout) => {
        const p = gameState.players[socket.id];
        if (p) {
            p.points += payout;
            p.xp += 25; // 每隻怪 25 XP

            // 升級邏輯：每 100 XP 升一級
            const nextLevel = Math.floor(p.xp / 100) + 1;
            if (nextLevel > p.level) {
                p.level = nextLevel;
                socket.emit('levelUp', p.level);
            }

            io.emit('pointsUpdated', {
                playerId: socket.id,
                personalPoints: p.points,
                teamPoints: gameState.teamPoints
            });
        }
    });

    socket.on('callStratagem', (type) => {
        if (socket.id === gameState.commanderId) {
            const costs = { 'airstrike': 500 };
            if (gameState.teamPoints >= costs[type]) {
                gameState.teamPoints -= costs[type];
                io.emit('triggerStratagem', { type, x: 400, teamPoints: gameState.teamPoints });
            }
        }
    });

    socket.on('playerMovement', (data) => {
        if (gameState.players[socket.id]) {
            gameState.players[socket.id].x = data.x;
            gameState.players[socket.id].y = data.y;
            socket.broadcast.emit('playerMoved', gameState.players[socket.id]);
        }
    });

    socket.on('disconnect', () => {
        if (gameState.commanderId === socket.id) gameState.commanderId = null;
        delete gameState.players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

http.listen(3000, () => console.log('伺服器運作中: http://localhost:3000'));