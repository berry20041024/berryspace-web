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
let lastFired = 0;

// 螢幕晃動狀態
let shakeTime = 0;
let shakeIntensity = 0;

// === 彈藥與手槍設定 ===
const maxMagazineAmmo = 13;
let currentMagazineAmmo = 13;
let isReloading = false;
let reloadStartTime = 0;
const pistolReloadTimeMs = 1500;

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
        this.speed = 5;
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
    update() {
        if (keys.w && this.y - this.radius > 0) this.y -= this.speed;
        if (keys.s && this.y + this.radius < canvas.height) this.y += this.speed;
        if (keys.a && this.x - this.radius > 0) this.x -= this.speed;
        if (keys.d && this.x + this.radius < canvas.width) this.x += this.speed;
        this.draw();
    }
}

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

class Enemy {
    constructor(x, y, radius, color) {
        this.x = x; this.y = y; this.radius = radius; this.color = color;
        this.speed = 0.8; // 基礎移動速度 (保持緩慢)
        this.velocity = { x: 0, y: 0 }; // 用於記錄擊退物理的獨立速度
        this.speedMult = 0.90; // 擊退力的衰減係數
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
    update() {
        // 1. 基礎追蹤移動 (固定速度，不產生加速度)
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.x += Math.cos(angle) * this.speed;
        this.y += Math.sin(angle) * this.speed;

        // 2. 擊退物理 (加上擊退力道，並每幀衰減)
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.velocity.x *= this.speedMult;
        this.velocity.y *= this.speedMult;

        this.draw();
    }
}

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
        this.velocity.x *= 0.98;
        this.velocity.y *= 0.98;
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= 0.02;
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

// 【修復】加入 UI 更新函式
function updateUI() {
    ammoEl.innerHTML = `${currentMagazineAmmo} / ∞`;
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

function handleShooting() {
    const fireRateFrames = 8;

    if (mouse.isDown && frames - lastFired > fireRateFrames && currentMagazineAmmo > 0 && !isReloading) {

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
        lastFired = frames;

        // 開火晃動
        shakeTime = 80;
        shakeIntensity = 4;
    }
}

function spawnEnemies() {
    if (frames % 120 === 0) { // 每兩秒一隻
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
function drawGameScene() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let shakeDx = 0; let shakeDy = 0;
    if (shakeTime > 0) {
        shakeDx = (Math.random() - 0.5) * shakeIntensity;
        shakeDy = (Math.random() - 0.5) * shakeIntensity;
        shakeTime -= (1000 / 60);
    }

    ctx.save();
    ctx.translate(shakeDx, shakeDy);

    player.update();
    spawnEnemies();
    updateLockOn();
    handleShooting();

    if (lockedEnemy) {
        drawLockReticle(lockedEnemy);
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

                // 【修復】正確的擊退疊加
                const knockbackAngle = Math.atan2(enemy.y - projectile.y, enemy.x - projectile.x);
                const knockbackIntensity = 5; // 微調擊退力道
                enemy.velocity.x += Math.cos(knockbackAngle) * knockbackIntensity;
                enemy.velocity.y += Math.sin(knockbackAngle) * knockbackIntensity;

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

    ctx.restore();
}

window.restartGame = function () {
    player = new Player(canvas.width / 2, canvas.height / 2, 15, '#00d4ff');
    projectiles = [];
    enemies = [];
    particles = [];
    score = 0;
    frames = 0;
    lastFired = 0;
    shakeTime = 0;
    currentMagazineAmmo = maxMagazineAmmo;
    isReloading = false;
    lockedEnemy = null;

    scoreEl.innerHTML = `分數: ${score}`;
    updateUI(); // 初始化右下角彈藥文字
    gameOverEl.style.display = 'none';
    animate();
};

function animate() {
    animationId = requestAnimationFrame(animate);
    drawGameScene();
}

// 首次開啟網頁初始化 UI
updateUI();
animate();