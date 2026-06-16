const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const gameOverEl = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// 遊戲核心變數
let animationId;
let score = 0;
let frames = 0;
let lastFired = 0; // 紀錄上次開火的幀數

// 滑鼠與按鍵追蹤
const keys = { w: false, a: false, s: false, d: false };
const mouse = { x: canvas.width / 2, y: canvas.height / 2, isDown: false };

window.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', () => { mouse.isDown = true; });
window.addEventListener('mouseup', () => { mouse.isDown = false; });

// 實體陣列
let projectiles = [];
let enemies = [];
let particles = [];
let lockedEnemy = null; // 當前被鎖定的敵人

// 玩家類別
class Player {
    constructor(x, y, radius, color) {
        this.x = x; this.y = y; this.radius = radius; this.color = color;
        this.speed = 5;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }
    update() {
        if (keys.w && this.y - this.radius > 0) this.y -= this.speed;
        if (keys.s && this.y + this.radius < canvas.height) this.y += this.speed;
        if (keys.a && this.x - this.radius > 0) this.x -= this.speed;
        if (keys.d && this.x + this.radius < canvas.width) this.x += this.speed;
        this.draw();
    }
}
let player = new Player(canvas.width / 2, canvas.height / 2, 15, '#00d4ff');

// 子彈類別
class Projectile {
    constructor(x, y, radius, color, velocity) {
        this.x = x; this.y = y; this.radius = radius; this.color = color; this.velocity = velocity;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
    update() {
        this.x += this.velocity.x; this.y += this.velocity.y;
        this.draw();
    }
}

// 敵人類別
class Enemy {
    constructor(x, y, radius, color) {
        this.x = x; this.y = y; this.radius = radius; this.color = color;
        this.speed = 0.8; // 【修改】敵人移動速度變慢 (原本是 2)
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
    update() {
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.x += Math.cos(angle) * this.speed;
        this.y += Math.sin(angle) * this.speed;
        this.draw();
    }
}

// 粒子類別
class Particle {
    constructor(x, y, radius, color, velocity) {
        this.x = x; this.y = y; this.radius = radius; this.color = color; this.velocity = velocity; this.alpha = 1;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
    update() {
        this.velocity.x *= 0.98; this.velocity.y *= 0.98;
        this.x += this.velocity.x; this.y += this.velocity.y;
        this.alpha -= 0.02;
        this.draw();
    }
}

// 尋找離滑鼠最近的敵人進行鎖定
function updateLockOn() {
    let minDist = 250; // 鎖定範圍 (滑鼠周圍 250px 內)
    lockedEnemy = null;
    enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - mouse.x, enemy.y - mouse.y);
        if (dist < minDist) {
            minDist = dist;
            lockedEnemy = enemy;
        }
    });
}

// 繪製鎖定框 ┌ ┐ └ ┘
function drawReticle(enemy) {
    const r = enemy.radius + 8; // 框框距離敵人的距離
    const l = 8; // 框框四角的線條長度
    const x = enemy.x;
    const y = enemy.y;

    ctx.strokeStyle = '#00ff00'; // 螢光綠
    ctx.lineWidth = 2;
    ctx.beginPath();

    // 左上 ┌
    ctx.moveTo(x - r, y - r + l); ctx.lineTo(x - r, y - r); ctx.lineTo(x - r + l, y - r);
    // 右上 ┐
    ctx.moveTo(x + r - l, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x + r, y - r + l);
    // 左下 └
    ctx.moveTo(x - r, y + r - l); ctx.lineTo(x - r, y + r); ctx.lineTo(x - r + l, y + r);
    // 右下 ┘
    ctx.moveTo(x + r - l, y + r); ctx.lineTo(x + r, y + r); ctx.lineTo(x + r, y + r - l);

    ctx.stroke();
}

// 處理連續射擊
function handleShooting() {
    const fireRate = 8; // 數字越小射速越快 (每 8 幀發射一發)

    if (mouse.isDown && frames - lastFired > fireRate) {
        let angle;
        // 如果有鎖定的敵人，朝向敵人射擊；否則朝向滑鼠射擊
        if (lockedEnemy) {
            angle = Math.atan2(lockedEnemy.y - player.y, lockedEnemy.x - player.x);
        } else {
            angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
        }

        const velocity = { x: Math.cos(angle) * 15, y: Math.sin(angle) * 15 }; // 子彈速度加快
        projectiles.push(new Projectile(player.x, player.y, 5, '#ffff00', velocity));
        lastFired = frames;
    }
}

// 生成敵人
function spawnEnemies() {
    // 【修改】每 120 幀 (約 2 秒) 生成一隻 (原本是 60 幀)
    if (frames % 120 === 0) {
        const radius = Math.random() * (30 - 15) + 15;
        let x, y;
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? 0 - radius : canvas.width + radius;
            y = Math.random() * canvas.height;
        } else {
            x = Math.random() * canvas.width;
            y = Math.random() < 0.5 ? 0 - radius : canvas.height + radius;
        }
        const color = `hsl(${Math.random() * 360}, 60%, 50%)`;
        enemies.push(new Enemy(x, y, radius, color));
    }
}

// 遊戲主迴圈
function animate() {
    animationId = requestAnimationFrame(animate);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    player.update();
    spawnEnemies();
    updateLockOn(); // 更新鎖定目標
    handleShooting(); // 處理射擊邏輯

    // 繪製鎖定框
    if (lockedEnemy) {
        drawReticle(lockedEnemy);
    }

    frames++;

    particles.forEach((particle, index) => {
        if (particle.alpha <= 0) particles.splice(index, 1);
        else particle.update();
    });

    projectiles.forEach((projectile, pIndex) => {
        projectile.update();
        if (projectile.x + projectile.radius < 0 || projectile.x - projectile.radius > canvas.width ||
            projectile.y + projectile.radius < 0 || projectile.y - projectile.radius > canvas.height) {
            setTimeout(() => projectiles.splice(pIndex, 1), 0);
        }
    });

    enemies.forEach((enemy, eIndex) => {
        enemy.update();

        const distToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (distToPlayer - enemy.radius - player.radius < 0) {
            cancelAnimationFrame(animationId);
            gameOverEl.style.display = 'block';
            finalScoreEl.innerHTML = `最終分數: ${score}`;
        }

        projectiles.forEach((projectile, pIndex) => {
            const distToEnemy = Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y);
            if (distToEnemy - enemy.radius - projectile.radius < 0) {
                for (let i = 0; i < enemy.radius * 2; i++) {
                    particles.push(new Particle(projectile.x, projectile.y, Math.random() * 3, enemy.color, {
                        x: (Math.random() - 0.5) * (Math.random() * 8),
                        y: (Math.random() - 0.5) * (Math.random() * 8)
                    }));
                }

                if (enemy.radius - 10 > 10) {
                    score += 10;
                    enemy.radius -= 10;
                    setTimeout(() => projectiles.splice(pIndex, 1), 0);
                } else {
                    score += 25;
                    setTimeout(() => {
                        enemies.splice(eIndex, 1);
                        projectiles.splice(pIndex, 1);
                    }, 0);
                }
                scoreEl.innerHTML = `分數: ${score}`;
            }
        });
    });
}

// 重新開始
window.restartGame = function () {
    player = new Player(canvas.width / 2, canvas.height / 2, 15, '#00d4ff');
    projectiles = []; enemies = []; particles = [];
    score = 0; frames = 0; lastFired = 0; lockedEnemy = null;
    scoreEl.innerHTML = `分數: ${score}`;
    gameOverEl.style.display = 'none';
    animate();
};

animate();