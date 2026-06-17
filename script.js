// ─── Canvas Setup ────────────────────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// ─── DOM References ──────────────────────────────────────────────────────────

const scoreEl         = document.getElementById('score');
const gameOverEl      = document.getElementById('game-over');
const finalScoreEl    = document.getElementById('final-score');
const finalWaveEl     = document.getElementById('final-wave');
const ammoTextEl      = document.getElementById('ammo-text');
const weaponIconEl    = document.getElementById('weapon-icon');
const healthBarFillEl = document.getElementById('health-bar-fill');
const healthTextEl    = document.getElementById('health-text');
const waveDisplayEl   = document.getElementById('wave-display');

// 主頁 / 裝備面板
const homeScreenEl    = document.getElementById('home-screen');
const loadoutScreenEl = document.getElementById('loadout-screen');
const weaponCardsEl   = document.getElementById('weapon-cards');
const uiContainerEl   = document.getElementById('ui-container');
const ammoContainerEl = document.getElementById('ammo-container');

// ─── Game State ──────────────────────────────────────────────────────────────

let animationId;
let homeAnimId;
let score = 0;
let frames = 0;
let lastTimestamp = 0;
let gameRunning = false;

// ─── Screen Shake ─────────────────────────────────────────────────────────────

let shakeTimeMs = 0;
let shakeIntensity = 0;

// ─── Weapon System ────────────────────────────────────────────────────────────

const weapons = [
    {
        name: 'pistol',
        fireMode: 'semi-auto',
        fireRateRPM: 60,
        semiAutoDelayMs: 400,
        maxMagazineAmmo: 13,
        reloadTimeMs: 1500,
        icon: 'public/assets/pistol.png',
        bulletColor: '#ffff00',
        bulletDamage: 10,
        currentAmmo: 13,
    },
    {
        name: 'm4',
        fireMode: 'full-auto',
        fireRateRPM: 950,
        semiAutoDelayMs: 0,
        maxMagazineAmmo: 30,
        reloadTimeMs: 2500,
        icon: 'public/assets/m4.png',
        bulletColor: '#ff8800',
        bulletDamage: 10,
        currentAmmo: 30,
    },
];

let currentWeaponIndex = 0;
let currentWeapon = weapons[0];
let currentMagazineAmmo = currentWeapon.currentAmmo;
let isReloading = false;
let reloadStartTime = 0;
let lastFiredTime = 0;
let wasMouseDown = false;
let mouseDownStartTime = 0;

// ─── Player HP State ──────────────────────────────────────────────────────────

const PLAYER_MAX_HP = 100;
let playerHP = PLAYER_MAX_HP;
let playerInvincibleUntil = 0; // requestAnimationFrame timestamp (ms)

// ─── Visual Effects State ─────────────────────────────────────────────────────

let hurtAlpha = 0;             // 受傷紅色 vignette 強度
let muzzleFlashTime = -Infinity;
let muzzleFlashAngle = 0;

// 波次公告動畫參數
const WAVE_FADE_IN  = 400;
const WAVE_HOLD     = 1200;
const WAVE_FADE_OUT = 600;
const WAVE_TOTAL    = WAVE_FADE_IN + WAVE_HOLD + WAVE_FADE_OUT;
let waveAnnouncementText = '';
let waveAnnouncementStart = -Infinity;

// ─── Wave System ──────────────────────────────────────────────────────────────

let waveNumber = 0;
let waveState = 'intermission';  // 'intermission' | 'active'
let intermissionStartTime = -Infinity; // -Infinity 使第一波立即開始
let waveEnemiesTotal = 0;
let waveEnemiesSpawned = 0;
let waveSpawnIntervalMs = 1000;
let lastWaveSpawnTime = -Infinity;

const INTERMISSION_DURATION_MS = 3000;

// ─── Input Tracking ───────────────────────────────────────────────────────────

const keys = { w: false, a: false, s: false, d: false };
const mouse = { x: canvas.width / 2, y: canvas.height / 2, isDown: false };

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
    if (key === 'r') startReload();
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
});
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', () => {
    mouse.isDown = true;
    // 使用者互動後解除瀏覽器的 AudioContext 暫停限制
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
});
window.addEventListener('mouseup', () => { mouse.isDown = false; });
window.addEventListener('wheel', (e) => {
    if (!gameRunning) return;
    e.preventDefault();
    switchWeapon(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

// ─── Audio System (Web Audio API) ────────────────────────────────────────────

const audioCtx = (() => {
    try { return new (window.AudioContext || window.webkitAudioContext)(); }
    catch (_) { return null; }
})();

function playSound(type) {
    if (!audioCtx || audioCtx.state === 'closed') return;
    const t = audioCtx.currentTime;

    // 建立一個 oscillator + gain 並自動排程播放後釋放
    const makeOsc = (waveType, freqStart, freqEnd, gainStart, duration, startOffset = 0) => {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = waveType;
        const s = t + startOffset;
        osc.frequency.setValueAtTime(freqStart, s);
        osc.frequency.exponentialRampToValueAtTime(freqEnd, s + duration);
        gain.gain.setValueAtTime(gainStart, s);
        gain.gain.exponentialRampToValueAtTime(0.0001, s + duration);
        osc.start(s);
        osc.stop(s + duration + 0.01);
    };

    switch (type) {
        case 'shoot_pistol':
            makeOsc('sawtooth', 900, 200, 0.25, 0.08);
            break;
        case 'shoot_m4':
            makeOsc('sawtooth', 650, 150, 0.18, 0.05);
            break;
        case 'reload':
            makeOsc('square', 1400, 700, 0.12, 0.1);
            break;
        case 'enemy_die':
            makeOsc('sine', 220, 55, 0.35, 0.3);
            break;
        case 'player_hurt':
            makeOsc('sawtooth', 350, 80, 0.45, 0.35);
            break;
        case 'wave_start':
            // 三個上升音符依序播放
            [400, 520, 680].forEach((freq, i) => {
                makeOsc('sine', freq, freq * 1.08, 0.28, 0.3, i * 0.14);
            });
            break;
    }
}

// ─── Switch Weapon ────────────────────────────────────────────────────────────

function switchWeapon(direction) {
    weapons[currentWeaponIndex].currentAmmo = currentMagazineAmmo;
    currentWeaponIndex = (currentWeaponIndex + direction + weapons.length) % weapons.length;
    currentWeapon = weapons[currentWeaponIndex];
    currentMagazineAmmo = currentWeapon.currentAmmo;
    isReloading = false;
    lastFiredTime = 0;
    wasMouseDown = false;
    updateUI();
}

// ─── Enemy Configs ────────────────────────────────────────────────────────────

const ENEMY_CONFIGS = {
    normal: {
        getRadius: () => Math.random() * 10 + 15,               // 15–25
        getColor:  () => `hsl(${Math.random() * 360}, 60%, 50%)`,
        maxHP: 30, baseSpeed: 48, contactDamage: 20, scoreValue: 25, minWave: 1,
    },
    fast: {
        getRadius: () => Math.random() * 4 + 10,                // 10–14
        getColor:  () => `hsl(${100 + Math.random() * 60}, 80%, 55%)`,
        maxHP: 15, baseSpeed: 96, contactDamage: 15, scoreValue: 20, minWave: 3,
    },
    tank: {
        getRadius: () => Math.random() * 10 + 30,               // 30–40
        getColor:  () => `hsl(${Math.random() * 30}, 80%, 40%)`,
        maxHP: 100, baseSpeed: 24, contactDamage: 35, scoreValue: 100, minWave: 5,
    },
    splitter: {
        getRadius: () => Math.random() * 6 + 22,                // 22–28
        getColor:  () => `hsl(${270 + Math.random() * 30}, 70%, 55%)`,
        maxHP: 40, baseSpeed: 38, contactDamage: 20, scoreValue: 40, minWave: 4,
    },
};

// ─── Classes ──────────────────────────────────────────────────────────────────

class Player {
    constructor(x, y, radius, color) {
        this.x = x; this.y = y; this.radius = radius; this.color = color;
        this.speed = 300; // px/s
    }

    draw(now) {
        // 無敵時每 120ms 閃爍一次（交替顯示 / 隱藏）
        if (now < playerInvincibleUntil && Math.floor(now / 120) % 2 === 0) return;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();

        // 換彈進度圈（純繪製，不修改狀態）
        if (isReloading) {
            const progress = Math.min((Date.now() - reloadStartTime) / currentWeapon.reloadTimeMs, 1);
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 10, -Math.PI / 2, (progress * Math.PI * 2) - Math.PI / 2);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }
    }

    update(dt, now) {
        const step = this.speed * dt / 60;
        if (keys.w && this.y - this.radius > 0) this.y -= step;
        if (keys.s && this.y + this.radius < canvas.height) this.y += step;
        if (keys.a && this.x - this.radius > 0) this.x -= step;
        if (keys.d && this.x + this.radius < canvas.width) this.x += step;
        this.draw(now);
    }
}

class Projectile {
    constructor(x, y, radius, color, velocity, damage) {
        this.x = x; this.y = y; this.radius = radius; this.color = color;
        this.velocity = velocity;
        this.damage = damage;
        this.dead = false;
        this.prevX = x; this.prevY = y; // 用於繪製子彈拖尾
    }

    draw() {
        // 拖尾線段
        ctx.save();
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = this.radius * 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.prevX, this.prevY);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();
        ctx.restore();

        // 子彈本體
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }

    update(dt) {
        this.prevX = this.x;
        this.prevY = this.y;
        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;
        this.draw();
    }
}

class Enemy {
    constructor(type, waveNum, x, y, overrideRadius = null) {
        const cfg = ENEMY_CONFIGS[type];
        this.type = type;
        this.x = x; this.y = y;
        this.radius = overrideRadius !== null ? overrideRadius : cfg.getRadius();
        this.color = cfg.getColor();
        this.maxHP = cfg.maxHP;
        this.hp = this.maxHP;
        // 每波速度 +5%
        this.baseSpeed = cfg.baseSpeed * (1 + waveNum * 0.05);
        this.contactDamage = cfg.contactDamage;
        this.scoreValue = cfg.scoreValue;
        this.velocity = { x: 0, y: 0 };
        this.speedMult = 0.90; // 擊退衰減係數
        this.dead = false;
        this.isSplitterChild = false;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    }

    draw() {
        // 敵人本體
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();

        // 血條（受傷時才顯示）
        if (this.hp < this.maxHP) {
            const bw = this.radius * 2;
            const bh = 4;
            const bx = this.x - this.radius;
            const by = this.y - this.radius - 8;
            const ratio = this.hp / this.maxHP;

            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(bx, by, bw, bh);

            const barColor = ratio > 0.5 ? '#00ff44' : ratio > 0.25 ? '#ffaa00' : '#ff3333';
            ctx.fillStyle = barColor;
            ctx.fillRect(bx, by, bw * ratio, bh);
        }
    }

    update(dt) {
        // 追蹤移動
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        const step = this.baseSpeed * dt / 60;
        this.x += Math.cos(angle) * step;
        this.y += Math.sin(angle) * step;

        // 擊退衰減
        const decay = Math.pow(this.speedMult, dt);
        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;
        this.velocity.x *= decay;
        this.velocity.y *= decay;

        this.draw();
    }
}

class Particle {
    constructor(x, y, radius, color, velocity) {
        this.x = x; this.y = y; this.radius = radius; this.color = color;
        this.velocity = velocity; this.alpha = 1; this.dead = false;
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

// ─── Entity Arrays ────────────────────────────────────────────────────────────

let player = new Player(canvas.width / 2, canvas.height / 2, 15, '#00d4ff');
let projectiles = [];
let enemies = [];
let particles = [];
let lockedEnemy = null;

// ─── UI Functions ─────────────────────────────────────────────────────────────

function updateUI() {
    ammoTextEl.innerHTML = `${currentMagazineAmmo} / ∞`;
    weaponIconEl.src = currentWeapon.icon;
    weaponIconEl.alt = currentWeapon.name;
}

function updateHealthBar() {
    const ratio = playerHP / PLAYER_MAX_HP;
    healthBarFillEl.style.width = `${ratio * 100}%`;
    healthTextEl.textContent = playerHP;
    if (ratio > 0.5) {
        healthBarFillEl.style.background = 'linear-gradient(90deg, #00cc33, #00ff44)';
    } else if (ratio > 0.25) {
        healthBarFillEl.style.background = 'linear-gradient(90deg, #cc7700, #ffaa00)';
    } else {
        healthBarFillEl.style.background = 'linear-gradient(90deg, #cc1100, #ff3333)';
    }
}

function updateWaveDisplay() {
    waveDisplayEl.textContent = `WAVE ${waveNumber}`;
}

// ─── Lock-On ──────────────────────────────────────────────────────────────────

function updateLockOn() {
    let minDist = 250;
    lockedEnemy = null;
    enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - mouse.x, enemy.y - mouse.y);
        if (dist < minDist) { minDist = dist; lockedEnemy = enemy; }
    });
}

// ─── Draw Utilities ───────────────────────────────────────────────────────────

function drawLockReticle(enemy) {
    const r = enemy.radius + 8, l = 8, x = enemy.x, y = enemy.y;
    ctx.save();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r + l); ctx.lineTo(x - r, y - r); ctx.lineTo(x - r + l, y - r);
    ctx.moveTo(x + r - l, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x + r, y - r + l);
    ctx.moveTo(x - r, y + r - l); ctx.lineTo(x - r, y + r); ctx.lineTo(x - r + l, y + r);
    ctx.moveTo(x + r - l, y + r); ctx.lineTo(x + r, y + r); ctx.lineTo(x + r, y + r - l);
    ctx.stroke();
    ctx.restore();
}

function drawCrosshair() {
    const x = mouse.x, y = mouse.y, s = 10, g = 4;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(x - s - g, y); ctx.lineTo(x - g, y);
    ctx.moveTo(x + g,     y); ctx.lineTo(x + s + g, y);
    ctx.moveTo(x, y - s - g); ctx.lineTo(x, y - g);
    ctx.moveTo(x, y + g);     ctx.lineTo(x, y + s + g);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();
}

function drawMuzzleFlash(now) {
    const elapsed = now - muzzleFlashTime;
    if (elapsed > 60) return;

    const alpha = 1 - elapsed / 60;
    const dist = player.radius + 6;
    const fx = player.x + Math.cos(muzzleFlashAngle) * dist;
    const fy = player.y + Math.sin(muzzleFlashAngle) * dist;

    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 10);
    g.addColorStop(0,   '#ffffff');
    g.addColorStop(0.4, '#ffaa00');
    g.addColorStop(1,   'rgba(255,80,0,0)');
    ctx.beginPath();
    ctx.arc(fx, fy, 10, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
}

function drawHurtVignette(deltaMs) {
    if (hurtAlpha <= 0) return;
    const g = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.25,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.8
    );
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(255,0,0,${Math.min(hurtAlpha, 0.65)})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    hurtAlpha = Math.max(0, hurtAlpha - deltaMs / 1000 * 1.6);
}

function drawWaveAnnouncement(now) {
    if (waveAnnouncementStart === -Infinity) return;
    const elapsed = now - waveAnnouncementStart;
    if (elapsed > WAVE_TOTAL) return;

    let alpha;
    if (elapsed < WAVE_FADE_IN) {
        alpha = elapsed / WAVE_FADE_IN;
    } else if (elapsed < WAVE_FADE_IN + WAVE_HOLD) {
        alpha = 1;
    } else {
        alpha = 1 - (elapsed - WAVE_FADE_IN - WAVE_HOLD) / WAVE_FADE_OUT;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = 'bold 78px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(waveAnnouncementText, canvas.width / 2, canvas.height / 2);
    ctx.restore();
}

function drawIntermissionCountdown(now) {
    if (waveState !== 'intermission') return;
    const remaining = Math.ceil((intermissionStartTime + INTERMISSION_DURATION_MS - now) / 1000);
    if (remaining <= 0) return;
    ctx.save();
    ctx.font = '22px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`Next wave in ${remaining}…`, canvas.width / 2, canvas.height / 2 + 64);
    ctx.restore();
}

// ─── Reload System ────────────────────────────────────────────────────────────

function startReload() {
    if (isReloading || currentMagazineAmmo === currentWeapon.maxMagazineAmmo) return;
    isReloading = true;
    reloadStartTime = Date.now();
    updateUI();
}

function finishReload() {
    isReloading = false;
    currentMagazineAmmo = currentWeapon.maxMagazineAmmo;
    updateUI();
    playSound('reload');
}

function checkReloadComplete() {
    if (!isReloading) return;
    if ((Date.now() - reloadStartTime) / currentWeapon.reloadTimeMs >= 1) finishReload();
}

// ─── Shooting System ──────────────────────────────────────────────────────────

function fireProjectile(now) {
    currentMagazineAmmo--;
    updateUI();
    if (currentMagazineAmmo === 0) startReload();

    let angle;
    if (lockedEnemy) {
        angle = Math.atan2(lockedEnemy.y - player.y, lockedEnemy.x - player.x);
    } else {
        angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    }

    projectiles.push(new Projectile(
        player.x, player.y, 5,
        currentWeapon.bulletColor,
        { x: Math.cos(angle) * 15, y: Math.sin(angle) * 15 },
        currentWeapon.bulletDamage
    ));
    lastFiredTime = now;

    muzzleFlashTime  = now;
    muzzleFlashAngle = angle;

    // M4 的晃動幅度較小（射速快，太抖會影響遊玩）
    shakeTimeMs    = currentWeapon.name === 'm4' ? 35 : 80;
    shakeIntensity = currentWeapon.name === 'm4' ? 2.5 : 4;

    playSound(`shoot_${currentWeapon.name}`);
}

function handleShooting(now) {
    const canFire = currentMagazineAmmo > 0 && !isReloading;

    if (!mouse.isDown) { wasMouseDown = false; return; }

    if (!wasMouseDown) {
        wasMouseDown = true;
        mouseDownStartTime = now;
        if (canFire) fireProjectile(now);
        return;
    }

    // 半自動需等待 semiAutoDelayMs 後才開始連射
    if (currentWeapon.fireMode === 'semi-auto' && now - mouseDownStartTime < currentWeapon.semiAutoDelayMs) return;

    if (now - lastFiredTime > 60000 / currentWeapon.fireRateRPM && canFire) {
        fireProjectile(now);
    }
}

// ─── Wave System ──────────────────────────────────────────────────────────────

function getRandomEnemyType() {
    // 篩出本波可用的敵人類型，並以加權隨機選擇
    const available = Object.entries(ENEMY_CONFIGS).filter(([, cfg]) => waveNumber >= cfg.minWave);
    const typeWeights = { normal: 3, fast: 2, splitter: 1.5, tank: 1 };
    const total = available.reduce((sum, [type]) => sum + (typeWeights[type] ?? 1), 0);
    let r = Math.random() * total;
    for (const [type] of available) {
        r -= (typeWeights[type] ?? 1);
        if (r <= 0) return type;
    }
    return 'normal';
}

function spawnEnemy() {
    const type = getRandomEnemyType();
    const radius = ENEMY_CONFIGS[type].getRadius();
    let x, y;
    if (Math.random() < 0.5) {
        x = Math.random() < 0.5 ? -radius : canvas.width + radius;
        y = Math.random() * canvas.height;
    } else {
        x = Math.random() * canvas.width;
        y = Math.random() < 0.5 ? -radius : canvas.height + radius;
    }
    enemies.push(new Enemy(type, waveNumber, x, y, radius));
}

function startWave(now) {
    waveNumber++;
    waveState = 'active';
    waveEnemiesTotal    = 5 + waveNumber * 3;
    waveEnemiesSpawned  = 0;
    waveSpawnIntervalMs = Math.max(400, 1200 - waveNumber * 80);
    lastWaveSpawnTime   = -Infinity; // 第一隻立即生成

    waveAnnouncementText  = `WAVE ${waveNumber}`;
    waveAnnouncementStart = now;

    updateWaveDisplay();
    playSound('wave_start');
}

function startIntermission(now) {
    waveState = 'intermission';
    intermissionStartTime = now;
}

function updateWave(now) {
    if (waveState === 'intermission') {
        if (now - intermissionStartTime >= INTERMISSION_DURATION_MS) startWave(now);
        return;
    }

    // 本波內依間隔生成敵人
    if (waveEnemiesSpawned < waveEnemiesTotal && now - lastWaveSpawnTime >= waveSpawnIntervalMs) {
        spawnEnemy();
        waveEnemiesSpawned++;
        lastWaveSpawnTime = now;
    }

    // 所有原始敵人已生成且場上無敵人 → 進入間歇
    if (waveEnemiesSpawned >= waveEnemiesTotal && enemies.length === 0) {
        startIntermission(now);
    }
}

// ─── Home Screen (Lobby) ──────────────────────────────────────────────────────

// 大廳背景漂浮粒子
const homeParticles = [];

function initHomeParticles() {
    homeParticles.length = 0;
    for (let i = 0; i < 80; i++) {
        homeParticles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.8 + 0.5,
            vx: (Math.random() - 0.5) * 0.25,
            vy: (Math.random() - 0.5) * 0.25,
            alpha: Math.random() * 0.4 + 0.08,
        });
    }
}

function animateHome() {
    homeAnimId = requestAnimationFrame(animateHome);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    homeParticles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = '#00d4ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function showHomeScreen() {
    // 停止遊戲迴圈
    cancelAnimationFrame(animationId);
    gameRunning = false;

    // 顯示主頁，隱藏遊戲 HUD
    homeScreenEl.style.display = 'flex';
    loadoutScreenEl.style.display = 'none';
    gameOverEl.style.display = 'none';
    uiContainerEl.style.display = 'none';
    waveDisplayEl.style.display = 'none';
    ammoContainerEl.style.display = 'none';
    canvas.classList.remove('in-game');

    // 啟動大廳背景動畫
    initHomeParticles();
    animateHome();
}

window.startGame = function () {
    // 停止大廳動畫
    cancelAnimationFrame(homeAnimId);

    // 隱藏主頁 / 裝備，顯示遊戲 HUD
    homeScreenEl.style.display = 'none';
    loadoutScreenEl.style.display = 'none';
    gameOverEl.style.display = 'none';
    uiContainerEl.style.display = '';
    waveDisplayEl.style.display = '';
    ammoContainerEl.style.display = '';
    canvas.classList.add('in-game');

    // 重設遊戲狀態
    player      = new Player(canvas.width / 2, canvas.height / 2, 15, '#00d4ff');
    projectiles = []; enemies = []; particles = [];
    score = 0; frames = 0; lastTimestamp = 0; shakeTimeMs = 0;

    weapons.forEach(w => { w.currentAmmo = w.maxMagazineAmmo; });
    currentWeaponIndex = 0;
    currentWeapon      = weapons[0];
    currentMagazineAmmo = currentWeapon.maxMagazineAmmo;
    isReloading = false; lastFiredTime = 0;
    wasMouseDown = false; mouseDownStartTime = 0;
    lockedEnemy = null;

    playerHP = PLAYER_MAX_HP;
    playerInvincibleUntil = 0;
    hurtAlpha = 0;
    muzzleFlashTime = -Infinity;

    waveNumber            = 0;
    waveState             = 'intermission';
    intermissionStartTime = -Infinity;
    waveAnnouncementStart = -Infinity;

    scoreEl.innerHTML = `分數: ${score}`;
    waveDisplayEl.textContent = 'WAVE -';
    updateUI();
    updateHealthBar();

    gameRunning = true;
    animate();
};

window.backToLobby = function () {
    cancelAnimationFrame(animationId);
    gameRunning = false;
    showHomeScreen();
};

// ─── Loadout (Equipment) Panel ────────────────────────────────────────────────

window.openLoadout = function () {
    homeScreenEl.style.display = 'none';
    loadoutScreenEl.style.display = 'flex';
    generateLoadoutCards();
};

window.closeLoadout = function () {
    loadoutScreenEl.style.display = 'none';
    homeScreenEl.style.display = 'flex';
};

function generateLoadoutCards() {
    weaponCardsEl.innerHTML = '';
    weapons.forEach(w => {
        const isAuto = w.fireMode === 'full-auto';
        const card = document.createElement('div');
        card.className = 'weapon-card';
        card.innerHTML = `
            <img src="${w.icon}" alt="${w.name}">
            <h3>${w.name.toUpperCase()}</h3>
            <span class="fire-mode-badge ${isAuto ? 'badge-auto' : 'badge-semi'}">
                ${isAuto ? '全自動' : '半自動'}
            </span>
            <div class="weapon-stat"><span>射速</span><span>${w.fireRateRPM} RPM</span></div>
            <div class="weapon-stat"><span>彈匣</span><span>${w.maxMagazineAmmo} 發</span></div>
            <div class="weapon-stat"><span>傷害</span><span>${w.bulletDamage}</span></div>
            <div class="weapon-stat"><span>換彈</span><span>${(w.reloadTimeMs / 1000).toFixed(1)}s</span></div>
        `;
        weaponCardsEl.appendChild(card);
    });
}

// ─── Main Game Loop ───────────────────────────────────────────────────────────

function drawGameScene(timestamp) {
    if (!gameRunning) return;

    // 計算 dt，並限制最大值避免 tab 切換後的跳躍
    const deltaMs = lastTimestamp === 0 ? 16.667 : Math.min(timestamp - lastTimestamp, 50);
    lastTimestamp = timestamp;
    const dt  = deltaMs / 16.667;
    const now = timestamp;

    // 背景
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 螢幕晃動
    let shakeDx = 0, shakeDy = 0;
    if (shakeTimeMs > 0) {
        shakeDx = (Math.random() - 0.5) * shakeIntensity;
        shakeDy = (Math.random() - 0.5) * shakeIntensity;
        shakeTimeMs -= deltaMs;
    }

    ctx.save();
    ctx.translate(shakeDx, shakeDy);

    // 波次更新（生成敵人 / 判斷波次結束）
    updateWave(now);

    // 換彈完成檢查（從 draw 中獨立出來）
    checkReloadComplete();

    // 玩家
    player.update(dt, now);

    // 槍口火焰
    drawMuzzleFlash(now);

    // 鎖定 + 射擊
    updateLockOn();
    handleShooting(now);

    if (lockedEnemy) drawLockReticle(lockedEnemy);

    frames++;

    // 粒子
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);

    // 子彈：更新 + 標記出界
    projectiles.forEach(proj => {
        proj.update(dt);
        if (proj.x + proj.radius < 0 || proj.x - proj.radius > canvas.width ||
            proj.y + proj.radius < 0 || proj.y - proj.radius > canvas.height) {
            proj.dead = true;
        }
    });

    // 敵人 + 碰撞偵測
    const newEnemies = []; // 分裂怪產生的子代，在 forEach 後才加入避免迭代錯誤

    enemies.forEach(enemy => {
        if (!gameRunning) return; // 本幀已觸發 game over，跳過剩餘敵人

        enemy.update(dt);

        // 玩家碰撞
        if (Math.hypot(player.x - enemy.x, player.y - enemy.y) - enemy.radius - player.radius < 0) {
            if (now >= playerInvincibleUntil) {
                playerHP = Math.max(0, playerHP - enemy.contactDamage);
                playerInvincibleUntil = now + 1500;
                hurtAlpha = 0.65;
                updateHealthBar();
                playSound('player_hurt');
                enemy.dead = true;

                if (playerHP <= 0) {
                    gameRunning = false;
                    cancelAnimationFrame(animationId);
                    gameOverEl.style.display = 'block';
                    finalScoreEl.innerHTML = `最終分數: ${score}`;
                    finalWaveEl.innerHTML  = `最終波次: ${waveNumber}`;
                    return;
                }
            }
        }

        // 子彈碰撞
        projectiles.forEach(proj => {
            if (proj.dead || enemy.dead) return;
            if (Math.hypot(proj.x - enemy.x, proj.y - enemy.y) - enemy.radius - proj.radius < 0) {
                // 擊退
                const kbAngle = Math.atan2(enemy.y - proj.y, enemy.x - proj.x);
                enemy.velocity.x += Math.cos(kbAngle) * 6;
                enemy.velocity.y += Math.sin(kbAngle) * 6;

                // 擊中粒子
                const pCount = Math.min(Math.floor(enemy.radius * 1.5), 30);
                for (let i = 0; i < pCount; i++) {
                    particles.push(new Particle(proj.x, proj.y, Math.random() * 3, enemy.color, {
                        x: (Math.random() - 0.5) * (Math.random() * 8),
                        y: (Math.random() - 0.5) * (Math.random() * 8),
                    }));
                }

                proj.dead = true;
                enemy.takeDamage(proj.damage);

                if (enemy.dead) {
                    score += enemy.scoreValue;
                    scoreEl.innerHTML = `分數: ${score}`;
                    playSound('enemy_die');

                    // 分裂怪：生成兩個速度較快的小怪
                    if (enemy.type === 'splitter' && !enemy.isSplitterChild) {
                        for (let i = 0; i < 2; i++) {
                            const child = new Enemy('normal', waveNumber, enemy.x, enemy.y, enemy.radius * 0.5);
                            child.maxHP = 15; child.hp = 15;
                            child.baseSpeed = enemy.baseSpeed * 1.3;
                            child.color = enemy.color;
                            child.scoreValue = 15;
                            child.isSplitterChild = true;
                            const spawnAngle = (i === 0 ? 1 : -1) * (Math.PI / 4) + Math.random() * 0.5;
                            child.velocity = { x: Math.cos(spawnAngle) * 10, y: Math.sin(spawnAngle) * 10 };
                            newEnemies.push(child);
                        }
                    }
                }
            }
        });
    });

    // 批次清除死亡物件，加入分裂子代
    projectiles = projectiles.filter(p => !p.dead);
    enemies     = enemies.filter(e => !e.dead);
    if (newEnemies.length > 0) enemies.push(...newEnemies);

    // 受傷 vignette（在 ctx.save() 範圍內，受晃動影響是刻意的）
    drawHurtVignette(deltaMs);

    // 波次公告 + 間歇倒數
    drawWaveAnnouncement(now);
    drawIntermissionCountdown(now);

    ctx.restore(); // 結束晃動 transform

    // 準心不受晃動影響，在 restore 後繪製
    drawCrosshair();
}

// ─── Animate ─────────────────────────────────────────────────────────────────

function animate(timestamp = 0) {
    animationId = requestAnimationFrame(animate);
    drawGameScene(timestamp);
}

// ─── Init ────────────────────────────────────────────────────────────────────

showHomeScreen();