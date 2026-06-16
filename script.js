const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const gameOverEl = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');

// 設定畫布符合視窗大小
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

// 按鍵追蹤
const keys = { w: false, a: false, s: false, d: false };
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
});

// 玩家物件
class Player {
    constructor(x, y, radius, color) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
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
        // 邊界碰撞與移動邏輯
        if (keys.w && this.y - this.radius > 0) this.y -= this.speed;
        if (keys.s && this.y + this.radius < canvas.height) this.y += this.speed;
        if (keys.a && this.x - this.radius > 0) this.x -= this.speed;
        if (keys.d && this.x + this.radius < canvas.width) this.x += this.speed;
        this.draw();
    }
}

// 實體陣列
let player = new Player(canvas.width / 2, canvas.height / 2, 15, '#00d4ff');
let projectiles = [];
let enemies = [];
let particles = [];

// 子彈類別
class Projectile {
    constructor(x, y, radius, color, velocity) {
        this.x = x; this.y = y;
        this.radius = radius; this.color = color;
        this.velocity = velocity;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.draw();
    }
}

// 敵人類別
class Enemy {
    constructor(x, y, radius, color, velocity) {
        this.x = x; this.y = y;
        this.radius = radius; this.color = color;
        this.velocity = velocity;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
    update() {
        // 自動追蹤玩家
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.velocity.x = Math.cos(angle) * 2;
        this.velocity.y = Math.sin(angle) * 2;
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.draw();
    }
}

// 爆炸粒子類別
class Particle {
    constructor(x, y, radius, color, velocity) {
        this.x = x; this.y = y;
        this.radius = radius; this.color = color;
        this.velocity = velocity;
        this.alpha = 1;
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

// 滑鼠射擊事件
window.addEventListener('mousedown', (event) => {
    const angle = Math.atan2(event.clientY - player.y, event.clientX - player.x);
    const velocity = {
        x: Math.cos(angle) * 10,
        y: Math.sin(angle) * 10
    };
    projectiles.push(new Projectile(player.x, player.y, 5, '#ffff00', velocity));
});

// 生成敵人邏輯
function spawnEnemies() {
    if (frames % 60 === 0) { // 每秒生成一隻 (假設 60FPS)
        const radius = Math.random() * (30 - 10) + 10;
        let x, y;
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? 0 - radius : canvas.width + radius;
            y = Math.random() * canvas.height;
        } else {
            x = Math.random() * canvas.width;
            y = Math.random() < 0.5 ? 0 - radius : canvas.height + radius;
        }
        const color = `hsl(${Math.random() * 360}, 50%, 50%)`;
        enemies.push(new Enemy(x, y, radius, color, { x: 0, y: 0 }));
    }
}

// 遊戲主迴圈
function animate() {
    animationId = requestAnimationFrame(animate);

    // 製作殘影特效 (取代 ctx.clearRect)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    player.update();
    spawnEnemies();
    frames++;

    // 更新粒子
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
            if (distToEnemy - enemy.radius - projectile.radius < 0) {
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
}

// 初始化與重新開始 (暴露到全域以便 HTML 呼叫)
window.restartGame = function () {
    player = new Player(canvas.width / 2, canvas.height / 2, 15, '#00d4ff');
    projectiles = [];
    enemies = [];
    particles = [];
    score = 0;
    frames = 0;
    scoreEl.innerHTML = `分數: ${score}`;
    gameOverEl.style.display = 'none';
    animate();
};

// 啟動遊戲
animate();