const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const gameOverEl = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const ammoEl = document.getElementById('ammo-container'); // 右下角彈藥 UI

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
let lastFired = 0; // 上次開火的幀數

// 螢幕晃動狀態
let shakeTime = 0;
let shakeIntensity = 0;

// === 彈藥與手槍設定 ===
const maxMagazineAmmo = 13; // 手槍彈匣 13 發
let currentMagazineAmmo = 13;
let isReloading = false; // 是否在換彈中
let reloadStartTime = 0; // 換彈開始時間 (毫秒)
const pistolReloadTimeMs = 1500; // 手槍換彈時間 1.5s

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

// 滑鼠連發偵測
window.addEventListener('mousedown', () => { mouse.isDown = true; });
window.addEventListener('mouseup', () => { mouse.isDown = false; });

// === 物件類別定義 ===

// 玩家物件
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

        // [核心新增] 換彈時的進度白圈
        if (isReloading) {
            const progress = (Date.now() - reloadStartTime) / pistolReloadTimeMs;

            // 進度完成
            if (progress >= 1) {
                finishReload();
            } else {
                ctx.save();
                ctx.beginPath();
                // 繪製一個從 -90 度開始順時針的圓弧代表進度
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
    constructor(x, y, radius, color, velocity) {
        this.x = x; this.y = y; this.radius = radius; this.color = color;
        this.velocity = velocity;
        // [核心新增] 用於物理擊退的速度衰減
        this.speedMult = 0.93; // 擊退力的衰減係數
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
    update() {
        // 自動追蹤玩家的基礎角度
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        const baseSpeed = 1.0; // 降低基礎移動速度

        // 將基礎追蹤速度加入現有物理速度
        this.velocity.x += Math.cos(angle) * baseSpeed;
        this.velocity.y += Math.sin(angle) * baseSpeed;

        // [核心修正] 應用擊退物理：速度緩慢衰減
        this.velocity.x *= this.speedMult;
        this.velocity.y *= this.speedMult;

        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.draw();
    }
}

// 爆炸粒子類別
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
        this.velocity.x *= 0.98; // 摩擦力
        this.velocity.y *= 0.98;
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= 0.02; // 漸隱效果
        this.draw();
    }
}

// === 遊戲實體陣列 ===
let player = new Player(canvas.width / 2, canvas.height / 2, 15, '#00d4ff');
let projectiles = [];
let enemies = [];
let particles = [];
let lockedEnemy = null; // 當前被鎖定的敵人

// === 功能函式 ===

// 尋找離滑鼠最近的敵人進行瞄準輔助鎖定
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

// 繪製瞄準鎖定框 ┌ ┐ └ ┘
function drawLockReticle(enemy) {
    const r = enemy.radius + 8; // 框框距離敵人的邊距
    const l = 8; // 四角的線條長度
    const x = enemy.x;
    const y = enemy.y;

    ctx.save();
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
    ctx.restore();
}

// [核心新增] 開始換彈
function startReload() {
    if (isReloading || currentMagazineAmmo === maxMagazineAmmo) return;
    isReloading = true;
    reloadStartTime = Date.now();
    updateUI(); // 可以在這裡隱藏彈藥 UI 或顯示換彈中 (但我們選擇用圓圈 UI)
}

// [核心新增] 完成換彈
function finishReload() {
    isReloading = false;
    currentMagazineAmmo = maxMagazineAmmo;
    updateUI();
}

// 處理射擊邏輯 (子彈消耗、換彈檢查、螢幕晃動)
function handleShooting() {
    const fireRateFrames = 8; // 每 8 幀發射一發 (連發速度)

    // 如果滑鼠長按 且 冷卻結束 且 有子彈 且 不在換彈中
    if (mouse.isDown && frames - lastFired > fireRateFrames && currentMagazineAmmo > 0 && !isReloading) {

        // --- 彈藥扣除 ---
        currentMagazineAmmo--;
        updateUI();

        // 彈藥歸零，自動換彈
        if (currentMagazineAmmo === 0) {
            startReload();
        }

        // --- 射擊角度計算 (鎖定 vs 滑鼠) ---
        let angle;
        // 如果有鎖定的敵人，子彈自動裝導航飛過去；否則朝向滑鼠發射
        if (lockedEnemy) {
            angle = Math.atan2(lockedEnemy.y - player.y, lockedEnemy.x - player.x);
        } else {
            angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
        }

        const bulletVelocity = { x: Math.cos(angle) * 15, y: Math.sin(angle) * 15 }; // 子彈飛得更快
        projectiles.push(new Projectile(player.x, player.y, 5, '#ffff00', bulletVelocity));
        lastFired = frames;

        // --- [核心新增] 開火物理效果：螢幕輕微晃動 ---
        shakeTime = 100; // 晃動持續時間 (毫秒)
        shakeIntensity = 5; // 晃動強度 (像素偏移)
    }
}

// 生成敵人
function spawnEnemies() {
    if (frames % 60 === 0) { // 每秒生成一隻 (假設 60FPS)
        const radius = Math.random() * (30 - 15) + 15;
        let x, y;
        // 隨機從螢幕邊界外部生成
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? 0 - radius : canvas.width + radius;
            y = Math.random() * canvas.height;
        } else {
            x = Math.random() * canvas.width;
            y = Math.random() < 0.5 ? 0 - radius : canvas.height + radius;
        }
        const color = `hsl(${Math.random() * 360}, 60%, 50%)`;
        // 初始化為靜止，後續物理加成
        enemies.push(new Enemy(x, y, radius, color, { x: 0, y: 0 }));
    }
}

// === 遊戲主迴圈 ===
function animate() {
    animationId = requestAnimationFrame(animate);

    // [核心修正] [清除背景] 完全清除 Canvas，不再保留殘影 (移除痕跡)
    ctx.fillStyle = 'black'; // 畫一個純黑背景覆蓋舊畫面
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // ctx.clearRect(0, 0, canvas.width, canvas.height); // 也可使用 clearRect

    frames++;

    // --- 應用螢幕晃動物理 ---
    if (shakeTime > 0) {
        // 如果還在晃動時間內，計算隨機平移
        const shakeX = (Math.random() - 0.5) * shakeIntensity;
        const shakeY = (Math.random() - 0.5) * shakeIntensity;

        // 核心原理：先平移畫布，繪製所有東西，最後還原
        ctx.save();
        ctx.translate(shakeX, shakeY);
        shakeTime -= (1000 / 60); // 假設 60 FPS，減少持續時間
    }

    // 依序更新所有遊戲元素
    player.update();
    spawnEnemies();
    updateLockOn(); // 更新鎖定目標
    handleShooting(); // 處理射擊與連發

    // 繪製鎖定輔助框 (如果存在鎖定敵人)
    if (lockedEnemy) {
        drawLockReticle(lockedEnemy);
    }

    // 更新粒子 (爆炸效果)
    particles.forEach((particle, index) => {
        if (particle.alpha <= 0) particles.splice(index, 1);
        else particle.update();
    });

    // 更新子彈
    projectiles.forEach((projectile, pIndex) => {
        projectile.update();
        // 移除飛出邊界的子彈
        if (projectile.x + projectile.radius < 0 || projectile.x - projectile.radius > canvas.width ||
            projectile.y + projectile.radius < 0 || projectile.y - projectile.radius > canvas.height) {
            setTimeout(() => projectiles.splice(pIndex, 1), 0);
        }
    });

    // 更新敵人與碰撞偵測
    enemies.forEach((enemy, eIndex) => {
        enemy.update();

        // 玩家被碰到 -> 遊戲結束
        const distToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (distToPlayer - enemy.radius - player.radius < 0) {
            cancelAnimationFrame(animationId);
            gameOverEl.style.display = 'block';
            finalScoreEl.innerHTML = `最終分數: ${score}`;
        }

        // 子彈打到敵人
        projectiles.forEach((projectile, pIndex) => {
            const distToEnemy = Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y);

            // 發生碰撞
            if (distToEnemy - enemy.radius - projectile.radius < 0) {

                // [核心新增] [敵人擊退物理]
                const knockbackAngle = Math.atan2(enemy.y - projectile.y, enemy.x - projectile.x);
                const knockbackIntensity = 8; // 擊退強度 (像素偏移速率)
                enemy.velocity.x += Math.cos(knockbackAngle) * knockbackIntensity;
                enemy.velocity.y += Math.sin(knockbackAngle) * knockbackIntensity;

                // 產生爆炸粒子
                for (let i = 0; i < enemy.radius * 2; i++) {
                    particles.push(new Particle(projectile.x, projectile.y, Math.random() * 3, enemy.color, {
                        x: (Math.random() - 0.5) * (Math.random() * 8),
                        y: (Math.random() - 0.5) * (Math.random() * 8)
                    }));
                }

                if (enemy.radius - 10 > 10) {
                    // 擊中縮小
                    score += 10;
                    enemy.radius -= 10;
                    setTimeout(() => projectiles.splice(pIndex, 1), 0);
                } else {
                    // 擊殺敵人
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

    // 螢幕晃動結束後還原畫布坐標系
    if (ctx.save.called) { ctx.restore(); } // 檢查是否需要還原 (簡單實作)
    if (animationId) { // 更穩健的還原方式
        try { ctx.restore(); } catch (e) { }
    }
}

// [核心修正] 清除背景痕跡的正確還原方法
function drawGameScene() {
    // 每次循環都重畫背景，不留痕跡
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 實作晃動物理的平移
    let shakeDx = 0; let shakeDy = 0;
    if (shakeTime > 0) {
        shakeDx = (Math.random() - 0.5) * shakeIntensity;
        shakeDy = (Math.random() - 0.5) * shakeIntensity;
        shakeTime -= (1000 / 60); // 假設 60 FPS 衰減
    }

    ctx.save();
    ctx.translate(shakeDx, shakeDy);

    // 繪製所有東西
    player.update();
    spawnEnemies();
    updateLockOn(); // 更新鎖定目標
    handleShooting(); // 處理射擊與連發

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
                // 击退物理
                const knockbackAngle = Math.atan2(enemy.y - projectile.y, enemy.x - projectile.x);
                const knockbackIntensity = 8;
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

    ctx.restore(); // 關鍵：繪製結束後還原坐標系，防止晃動累加
}

// === 遊戲初始化與重新開始 ===
window.restartGame = function () {
    player = new Player(canvas.width / 2, canvas.height / 2, 15, '#00d4ff');
    projectiles = [];
    enemies = [];
    particles = [];
    score = 0;
    frames = 0;
    lastFired = 0;
    shakeTime = 0; // 重置晃動
    currentMagazineAmmo = maxMagazineAmmo; // 重置子彈
    isReloading = false; // 重置換彈狀態
    lockedEnemy = null; // 重置鎖定

    scoreEl.innerHTML = `分數: ${score}`;
    gameOverEl.style.display = 'none';
    animate();
};

// 用新的繪製場景取代舊的 animate 內容
function animate() {
    animationId = requestAnimationFrame(animate);
    drawGameScene(); // 使用修正後的繪製邏輯
}

// 啟動遊戲
animate();