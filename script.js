const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const gameOverEl = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const ammoEl = document.getElementById('ammo-container');

// 設定畫布符合視窗大小
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// === 遊戲狀態管理 ===
let animationId;
let score = 0;
let frames = 0;
// 【修復 #1 / #2】使用 delta time 追蹤，讓速度脫離幀率依賴
let lastTimestamp = 0;
// 【修復 #5】加入 gameRunning flag，防止死後當幀繼續執行
let gameRunning = false;

// 螢幕晃動狀態（改為以毫秒計算，不依賴幀數）
let shakeTimeMs = 0;
let shakeIntensity = 0;

// === 彈藥與手槍設定 ===
const maxMagazineAmmo = 13;
let currentMagazineAmmo = 13;
let isReloading = false;
let reloadStartTime = 0;
const pistolReloadTimeMs = 1500;

// 射擊冷卻：以毫秒計算，不依賴幀數（8幀 @ 60fps ≈ 133ms）
const fireRateMs = 133;
let lastFiredTime = 0;

// 按鍵與滑鼠追蹤
const keys = { w: false, a: false, s: false, d: false };
const mouse = { x: canvas.width / 2, y: canvas.height / 2, isDown: false };

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
});
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', () => { mouse.isDown = true; });
window.addEventListener('mouseup', () => { mouse.isDown = false; });

// === 物件類別定義 ===

class Player {
    constructor(x, y, radius, color) {
        this.x = x; this.y = y; this.radius = radius; this.color = color;
        // 【修復 #1】速度改為像素/秒，60fps 下體感等同原本的 5px/幀
        this.speed = 300;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();

        // 換彈時的進度白圈
        if (isReloading) {
            const progress = (Date.now() - reloadStartTime) / pistolReloadTimeMs;
            if (progress >= 1) {
                finishReload();
            } else {
                ctx.save();
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius + 10, -Math.PI / 2, (progress * Math.PI * 2) - Math.PI / 2);
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.restore();
            }
        }
    }
    // 【修復 #1】update 接收 dt（以 60fps 為基準的倍率）
    update(dt) {
        const step = this.speed * dt / 60;
        if (keys.w && this.y - this.radius > 0) this.y -= step;
        if (keys.s && this.y + this.radius < canvas.height) this.y += step;
        if (keys.a && this.x - this.radius > 0) this.x -= step;
        if (keys.d && this.x + this.radius < canvas.width) this.x += step;
        this.draw();
    }
}

class Projectile {
    constructor(x, y, radius, color, velocity) {
        this.x = x; this.y = y; this.radius = radius; this.color = color; this.velocity = velocity;
        this.dead = false; // 【修復 #2】標記刪除用
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
    // 【修復 #1】velocity 已是像素/幀的概念，乘以 dt 保持一致性
    update(dt) {
        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;
        this.draw();
    }
}

class Enemy {
    constructor(x, y, radius, color) {
        this.x = x; this.y = y; this.radius = radius; this.color = color;
        // 【修復 #1】速度改為像素/秒，48px/s 在 60fps 下等同原本的 0.8px/幀
        this.speed = 48;
        this.velocity = { x: 0, y: 0 };
        // 【修復 #1】擊退衰減改為每幀 0.90 → 換算成時間基準的指數衰減
        this.speedMult = 0.90;
        this.dead = false; // 【修復 #2】標記刪除用
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
    update(dt) {
        // 1. 基礎追蹤移動（以秒為單位，不產生加速度）
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        const step = this.speed * dt / 60;
        this.x += Math.cos(angle) * step;
        this.y += Math.sin(angle) * step;

        // 2. 擊退物理：每幀衰減換算為 dt 基準
        const decayPerFrame = Math.pow(this.speedMult, dt);
        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;
        this.velocity.x *= decayPerFrame;
        this.velocity.y *= decayPerFrame;

        this.draw();
    }
}

class Particle {
    constructor(x, y, radius, color, velocity) {
        this.x = x; this.y = y; this.radius = radius; this.color = color; this.velocity = velocity; this.alpha = 1;
        this.dead = false; // 【修復 #2】標記刪除用
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
    update(dt) {
        this.velocity.x *= Math.pow(0.98, dt);
        this.velocity.y *= Math.pow(0.98, dt);
        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;
        this.alpha -= 0.02 * dt;
        if (this.alpha <= 0) this.dead = true;
        this.draw();
    }
}

// === 遊戲實體陣列 ===
let player = new Player(canvas.width / 2, canvas.height / 2, 15, '#00d4ff');
let projectiles = [];
let enemies = [];
let particles = [];
let lockedEnemy = null;

// === 功能函式 ===

const ammoTextEl = document.getElementById('ammo-text');

function updateUI() {
    ammoTextEl.innerHTML = `${currentMagazineAmmo} / ∞`;
}

function updateLockOn() {
    let minDist = 250;
    lockedEnemy = null;
    enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - mouse.x, enemy.y - mouse.y);
        if (dist < minDist) {
            minDist = dist;
            lockedEnemy = enemy;
        }
    });
}

function drawLockReticle(enemy) {
    const r = enemy.radius + 8;
    const l = 8;
    const x = enemy.x;
    const y = enemy.y;

    ctx.save();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();

    // ┌ ┐ └ ┘
    ctx.moveTo(x - r, y - r + l); ctx.lineTo(x - r, y - r); ctx.lineTo(x - r + l, y - r);
    ctx.moveTo(x + r - l, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x + r, y - r + l);
    ctx.moveTo(x - r, y + r - l); ctx.lineTo(x - r, y + r); ctx.lineTo(x - r + l, y + r);
    ctx.moveTo(x + r - l, y + r); ctx.lineTo(x + r, y + r); ctx.lineTo(x + r, y + r - l);

    ctx.stroke();
    ctx.restore();
}

function startReload() {
    if (isReloading || currentMagazineAmmo === maxMagazineAmmo) return;
    isReloading = true;
    reloadStartTime = Date.now();
    updateUI();
}

function finishReload() {
    isReloading = false;
    currentMagazineAmmo = maxMagazineAmmo;
    updateUI();
}

function handleShooting(now) {
    if (mouse.isDown && now - lastFiredTime > fireRateMs && currentMagazineAmmo > 0 && !isReloading) {
        currentMagazineAmmo--;
        updateUI();

        if (currentMagazineAmmo === 0) {
            startReload();
        }

        let angle;
        if (lockedEnemy) {
            angle = Math.atan2(lockedEnemy.y - player.y, lockedEnemy.x - player.x);
        } else {
            angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
        }

        const bulletVelocity = { x: Math.cos(angle) * 15, y: Math.sin(angle) * 15 };
        projectiles.push(new Projectile(player.x, player.y, 5, '#ffff00', bulletVelocity));
        lastFiredTime = now;

        // 開火晃動
        shakeTimeMs = 80;
        shakeIntensity = 4;
    }
}

// 【修復 #1】改為以 frames 換算為時間（秒）間隔
const spawnIntervalMs = 2000; // 每 2 秒生成一隻
let lastSpawnTime = -spawnIntervalMs; // 讓第一隻不在第 0ms 就出現

function spawnEnemies(now) {
    if (now - lastSpawnTime >= spawnIntervalMs) {
        lastSpawnTime = now;
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

// === 遊戲主迴圈 ===
// 【修復 #1】接收 timestamp 以計算 dt
function drawGameScene(timestamp) {
    // 【修復 #5】若遊戲已結束，直接跳出，不繼續執行當幀邏輯
    if (!gameRunning) return;

    // 計算 dt（以 1.0 = 一個 60fps 幀 為基準）
    const deltaMs = lastTimestamp === 0 ? 16.667 : timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    const dt = deltaMs / 16.667;

    const now = timestamp; // 用於時間比較

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let shakeDx = 0; let shakeDy = 0;
    if (shakeTimeMs > 0) {
        shakeDx = (Math.random() - 0.5) * shakeIntensity;
        shakeDy = (Math.random() - 0.5) * shakeIntensity;
        shakeTimeMs -= deltaMs;
    }

    ctx.save();
    ctx.translate(shakeDx, shakeDy);

    player.update(dt);
    spawnEnemies(now);
    updateLockOn();
    handleShooting(now);

    if (lockedEnemy) {
        drawLockReticle(lockedEnemy);
    }

    frames++;

    // 【修復 #3】粒子：先 update，再用 filter 批次清除死亡粒子
    particles.forEach(particle => particle.update(dt));
    particles = particles.filter(p => !p.dead);

    // 【修復 #2/#3】子彈：先 update，標記出界的子彈，之後批次清除
    projectiles.forEach(projectile => {
        projectile.update(dt);
        if (projectile.x + projectile.radius < 0 || projectile.x - projectile.radius > canvas.width ||
            projectile.y + projectile.radius < 0 || projectile.y - projectile.radius > canvas.height) {
            projectile.dead = true;
        }
    });

    // 碰撞偵測
    enemies.forEach(enemy => {
        enemy.update(dt);

        // 玩家與敵人碰撞
        const distToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (distToPlayer - enemy.radius - player.radius < 0) {
            // 【修復 #5】立即標記遊戲結束並 return，防止繼續執行後續邏輯
            gameRunning = false;
            cancelAnimationFrame(animationId);
            gameOverEl.style.display = 'block';
            finalScoreEl.innerHTML = `最終分數: ${score}`;
            return;
        }

        // 子彈與敵人碰撞
        projectiles.forEach(projectile => {
            // 【修復 #2】略過已標記刪除的子彈，避免重複命中
            if (projectile.dead || enemy.dead) return;

            const distToEnemy = Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y);
            if (distToEnemy - enemy.radius - projectile.radius < 0) {
                // 擊退：疊加方向力
                const knockbackAngle = Math.atan2(enemy.y - projectile.y, enemy.x - projectile.x);
                const knockbackIntensity = 5;
                enemy.velocity.x += Math.cos(knockbackAngle) * knockbackIntensity;
                enemy.velocity.y += Math.sin(knockbackAngle) * knockbackIntensity;

                for (let i = 0; i < enemy.radius * 2; i++) {
                    particles.push(new Particle(projectile.x, projectile.y, Math.random() * 3, enemy.color, {
                        x: (Math.random() - 0.5) * (Math.random() * 8),
                        y: (Math.random() - 0.5) * (Math.random() * 8)
                    }));
                }

                // 【修復 #2】直接標記刪除，不用 setTimeout
                projectile.dead = true;

                if (enemy.radius - 10 > 10) {
                    score += 10;
                    enemy.radius -= 10;
                } else {
                    score += 25;
                    enemy.dead = true; // 【修復 #2】標記刪除
                }
                scoreEl.innerHTML = `分數: ${score}`;
            }
        });
    });

    // 【修復 #2/#3】批次清除所有死亡物件
    projectiles = projectiles.filter(p => !p.dead);
    enemies = enemies.filter(e => !e.dead);

    ctx.restore();
}

// 【修復 #4】重啟遊戲前先取消舊的 animation loop
window.restartGame = function () {
    cancelAnimationFrame(animationId);

    player = new Player(canvas.width / 2, canvas.height / 2, 15, '#00d4ff');
    projectiles = [];
    enemies = [];
    particles = [];
    score = 0;
    frames = 0;
    lastFiredTime = 0;
    lastTimestamp = 0;
    lastSpawnTime = -spawnIntervalMs;
    shakeTimeMs = 0;
    currentMagazineAmmo = maxMagazineAmmo;
    isReloading = false;
    lockedEnemy = null;

    scoreEl.innerHTML = `分數: ${score}`;
    updateUI();
    gameOverEl.style.display = 'none';

    gameRunning = true;
    animate();
};

function animate(timestamp = 0) {
    animationId = requestAnimationFrame(animate);
    drawGameScene(timestamp);
}

// 首次開啟網頁初始化 UI 並啟動遊戲
updateUI();
gameRunning = true;
animate();