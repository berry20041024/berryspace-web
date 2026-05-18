const config = {
    type: Phaser.AUTO,
    width: 800, height: 600,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 1000 }, debug: false }
    },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);
let socket, player, keys;
let enemies, bullets, ropes, platforms;
let myPoints = 0, teamPoints = 0, commanderId;
let playerHP = 100, jumpCount = 0, lastFired = 0;
let isClimbing = false, isDead = false;

let playerStats = {
    moveSpeed: 220,
    jumpPower: -420,
    fireRate: 250,
    bulletSpeed: 650,
    bulletScale: 1
};

function preload() {
    this.load.image('ball', 'https://labs.phaser.io/assets/sprites/blue_ball.png');
    this.load.image('enemy', 'https://labs.phaser.io/assets/sprites/red_ball.png');
    this.load.image('bullet', 'https://labs.phaser.io/assets/sprites/bullets/bullet1.png');
}

function create() {
    const self = this;
    socket = io();

    keys = this.input.keyboard.addKeys({
        up: 'W', left: 'A', down: 'S', right: 'D',
        jump: 'SPACE', transfer: 'T', ult: 'R'
    });

    enemies = this.physics.add.group();
    bullets = this.physics.add.group();
    ropes = this.physics.add.staticGroup();
    platforms = this.physics.add.staticGroup();

    // 1. 地板
    const ground = this.add.rectangle(400, 580, 800, 40, 0x333333);
    this.physics.add.existing(ground, true);
    platforms.add(ground);

    // 2. 繩索
    const rope = this.add.rectangle(400, 300, 15, 600, 0xffff00, 0.3);
    ropes.add(rope);

    // 3. 繩索頂端平台 (單向平台)
    const topPlatform = this.add.rectangle(400, 150, 150, 20, 0x555555);
    this.physics.add.existing(topPlatform, true);
    topPlatform.body.checkCollision.down = false;
    platforms.add(topPlatform);

    socket.on('init', (data) => {
        commanderId = data.commanderId;
        createPlayer(self, 100, 450);
        updateUI();
    });

    socket.on('pointsUpdated', (data) => {
        teamPoints = data.teamPoints;
        if (data.playerId === socket.id) myPoints = data.personalPoints;
        updateUI();
    });

    // 怪物生成
    this.time.addEvent({
        delay: 2500, loop: true,
        callback: () => {
            if (isDead) return;
            const enemy = enemies.create(780, 540, 'enemy');
            enemy.setTint(0xff3333);
            enemy.hp = 3;
            enemy.lastAttack = 0;
            self.physics.add.collider(enemy, platforms);
        }
    });

    // 射擊怪物
    this.physics.add.collider(bullets, enemies, (bullet, enemy) => {
        bullet.destroy();
        enemy.hp--;
        enemy.setTint(0xffffff);
        self.time.delayedCall(50, () => enemy.clearTint());
        if (enemy.hp <= 0) {
            self.cameras.main.shake(100, 0.005);
            enemy.destroy();
            socket.emit('enemyKilled', 15);
        }
    });

    socket.on('triggerStratagem', () => {
        self.cameras.main.flash(500, 255, 0, 0);
        enemies.clear(true, true);
    });
}

function createPlayer(scene, x, y) {
    player = scene.physics.add.sprite(x, y, 'ball');
    player.setCollideWorldBounds(true);
    scene.physics.add.collider(player, platforms);

    scene.physics.add.overlap(player, ropes, () => {
        if (!isDead && (keys.up.isDown || keys.down.isDown)) isClimbing = true;
    });
}

function update(time) {
    if (!player || isDead || document.getElementById('upgrade-overlay').style.display === 'flex') return;

    const ropeObj = ropes.getChildren()[0];
    const isTouchingRope = Phaser.Geom.Intersects.RectangleToRectangle(player.getBounds(), ropeObj.getBounds());
    if (!isTouchingRope) isClimbing = false;

    if (isClimbing) {
        player.body.allowGravity = false;

        // 【新增機制】在繩索上按 A/D 切換左右側
        const ropeX = ropeObj.x;
        if (keys.left.isDown) {
            player.x = ropeX - 15; // 固定在左側
        } else if (keys.right.isDown) {
            player.x = ropeX + 15; // 固定在右側
        } else {
            player.x = ropeX;      // 回到中間
        }

        // 上下爬行
        if (keys.up.isDown) player.setVelocityY(-200);
        else if (keys.down.isDown) player.setVelocityY(200);
        else player.setVelocityY(0);

        // 【新增機制】按跳躍跳出繩索
        if (Phaser.Input.Keyboard.JustDown(keys.jump)) {
            isClimbing = false;
            player.body.allowGravity = true;
            player.setVelocityY(playerStats.jumpPower);

            // 根據目前所在側邊，給予跳出的橫向力道
            if (keys.left.isDown) player.setVelocityX(-200);
            else if (keys.right.isDown) player.setVelocityX(200);

            jumpCount = 1; // 標記已完成第一跳，可進行二段跳
        }
    } else {
        player.body.allowGravity = true;
        if (keys.left.isDown) player.setVelocityX(-playerStats.moveSpeed);
        else if (keys.right.isDown) player.setVelocityX(playerStats.moveSpeed);
        else player.setVelocityX(0);

        if (player.body.touching.down) jumpCount = 0;
        if (Phaser.Input.Keyboard.JustDown(keys.jump)) {
            if (player.body.touching.down || jumpCount < 2) {
                player.setVelocityY(playerStats.jumpPower);
                jumpCount++;
            }
        }
        if (keys.down.isDown && !player.body.touching.down) player.setVelocityY(650);
    }

    // 滑鼠射擊
    if (this.input.activePointer.isDown && time > lastFired) {
        fireBulletAtPointer(this, time);
    }

    // 怪物 AI
    enemies.children.entries.forEach(enemy => {
        if (!enemy.active) return;
        const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
        if (dist > 45) {
            if (enemy.x > player.x) enemy.setVelocityX(-100);
            else enemy.setVelocityX(100);
        } else {
            enemy.setVelocityX(0);
            if (time > enemy.lastAttack) {
                playerHP -= 20;
                this.cameras.main.flash(100, 200, 0, 0);
                enemy.lastAttack = time + 1000;
                if (playerHP <= 0) handleDeath(this);
                updateUI();
            }
        }
    });

    if (player.x !== player.oldX || player.y !== player.oldY) {
        socket.emit('playerMovement', { x: player.x, y: player.y });
    }
    player.oldX = player.x; player.oldY = player.y;
}

function fireBulletAtPointer(scene, time) {
    const pointer = scene.input.activePointer;
    const angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);
    const b = bullets.create(player.x, player.y, 'bullet');
    b.body.allowGravity = false;
    b.setScale(playerStats.bulletScale);
    scene.physics.velocityFromAngle(Phaser.Math.RadToDeg(angle), playerStats.bulletSpeed, b.body.velocity);
    b.rotation = angle;
    b.setCollideWorldBounds(false);
    b.checkWorldBounds = true;
    b.outOfBoundsKill = true;
    lastFired = time + playerStats.fireRate;
}

function handleDeath(scene) {
    isDead = true;
    player.destroy();
    scene.cameras.main.fadeOut(1000);
    const ui = document.getElementById('game-ui');
    ui.innerHTML = `<h2 style="color:red; text-align:center;">戰亡！重新部署中...</h2>`;
    scene.time.delayedCall(3000, () => respawnPlayer(scene));
}

function respawnPlayer(scene) {
    isDead = false;
    playerHP = 100;
    enemies.clear(true, true);
    createPlayer(scene, 100, 450);
    scene.cameras.main.fadeIn(500);
    updateUI();
}

function updateUI() {
    const ui = document.getElementById('game-ui') || createUI();
    if (isDead) return;
    const hpColor = playerHP > 30 ? '#00ff00' : '#ff0000';
    ui.innerHTML = `
        <div style="color: white; background: rgba(0,0,0,0.7); padding: 15px; border-radius: 10px; border: 1px solid #444; width: 300px;">
            <div style="background:#333; height:10px; width:100%; border-radius:5px; margin-bottom:10px; border: 1px solid #555;">
                <div style="background:${hpColor}; height:100%; width:${Math.max(0, playerHP)}%; border-radius:5px; transition:0.3s;"></div>
            </div>
            <span style="color:#00d4ff">點數: ${myPoints}</span> | <span style="color:#ffcc00">小隊: ${teamPoints}</span><br>
            <div style="font-size: 11px; margin-top: 5px; color: #aaa;">
                [W/S] 爬繩 | [A/D] 側身 | [空白] 跳離繩索
            </div>
        </div>
    `;
}

function createUI() {
    const div = document.createElement('div');
    div.id = 'game-ui';
    div.style.position = 'absolute'; div.style.top = '10px'; div.style.left = '10px';
    document.body.appendChild(div);
    return div;
}