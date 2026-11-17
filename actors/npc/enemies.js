// enemies.js
// Enemy spawning, AI, damage to/from the player, and the health HUD.
// Load order: player_behavior.js, enemies.js, your level files, engine.js.
//
// How a fight works:
//   - Enemies chase the player along floor tiles once the player is within aggroRange steps.
//   - Next to the player (up/down/left/right) an enemy winds up, then strikes.
//   - Blocking toward the enemy cancels the damage and staggers it.
//   - The player hits the tile in front of them (the "player-attack" event from playerAttack()).

// ---- Tunables ----
const ENEMY = {
    hp: 3,
    damage: 1,
    aggroRange: 8,          // how many steps away an enemy notices the player
    moveMs: 450,            // time between enemy steps
    windupMs: 450,          // warning time before a strike lands
    recoverMs: 600,         // pause after a strike
    blockedStaggerMs: 800,  // pause after hitting a block
    knockbackTiles: 1,      // how far a blocked strike pushes the enemy back
    shoveStunMs: 1000,      // how long a shoved enemy is stunned
    staggerMs: 350,         // pause after being hit
    hitFlashMs: 200
};
const TICK_MS = 100;        // how often the enemy AI runs

// ---- State ----
let enemies = [];
let nextEnemyId = 1;
let drawnEnemyEls = [];     // [{el, base}] tiles currently carrying enemy classes
let playerDead = false;

/** Replaces the current enemies with fresh ones at the given spawn points. */
function spawnEnemies(spawns) {
    enemies = (spawns || []).map(s => ({
        id: nextEnemyId++,
        x: s.x, y: s.y,
        hp: ENEMY.hp, maxHp: ENEMY.hp,
        state: "chase",         // "chase" | "windup" | "recover"
        nextMoveAt: 0, strikeAt: 0, recoverUntil: 0, hitUntil: 0
    }));
}

/** Returns the enemy standing on (x, y), or null. */
function enemyAt(x, y) {
    return enemies.find(e => e.x === x && e.y === y) || null;
}

/** Enemies only walk on plain floor, never on each other or on the player. */
function isEnemyWalkable(x, y) {
    if (y < 0 || x < 0 || y >= gameMap.length || x >= gameMap[0].length) return false;
    if (gameMap[y][x] !== "floor") return false;
    if (enemyAt(x, y)) return false;
    return !(player.x === x && player.y === y);
}

/**
 * Breadth-first search toward the player, limited to aggroRange steps.
 * @returns {{x:number,y:number}|null} the first step to take, or null if no path
 */
function nextStepToward(enemy) {
    const w = gameMap[0].length;
    const key = (x, y) => y * w + x;
    const start = key(enemy.x, enemy.y);
    const goal = key(player.x, player.y);

    const parent = new Map([[start, -1]]);
    const depth = new Map([[start, 0]]);
    const queue = [[enemy.x, enemy.y]];

    for (let head = 0; head < queue.length; head++) {
        const [x, y] = queue[head];
        const k = key(x, y);

        if (k === goal) {
            let step = k;
            while (parent.get(step) !== start) step = parent.get(step);
            return { x: step % w, y: Math.floor(step / w) };
        }

        const d = depth.get(k);
        if (d >= ENEMY.aggroRange) continue;

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            const nk = key(nx, ny);
            if (parent.has(nk)) continue;
            const isGoal = nx === player.x && ny === player.y;
            if (!isGoal && !isEnemyWalkable(nx, ny)) continue;
            parent.set(nk, k);
            depth.set(nk, d + 1);
            queue.push([nx, ny]);
        }
    }
    return null;
}

/** Runs every TICK_MS: moves, winds up and strikes. */
function enemyTick() {
    if (typeof gameFinished !== "undefined" && gameFinished) return;
    if (playerDead || !gameMap || enemies.length === 0) return;

    const now = performance.now();
    let changed = false;

    for (const e of enemies) {
        const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);

        if (e.state === "chase") {
            if (dist === 1) {
                e.state = "windup";
                e.strikeAt = now + ENEMY.windupMs;
                changed = true;
            } else if (now >= e.nextMoveAt) {
                e.nextMoveAt = now + ENEMY.moveMs;
                const step = nextStepToward(e);
                if (step) { e.x = step.x; e.y = step.y; changed = true; }
            }
        } else if (e.state === "windup") {
            if (now >= e.strikeAt) {
                const blocked = resolveStrike(e, now);
                e.state = "recover";
                e.recoverUntil = now + (blocked ? ENEMY.blockedStaggerMs : ENEMY.recoverMs);
                changed = true;
            }
        } else if (e.state === "recover") {
            if (now >= e.recoverUntil) { e.state = "chase"; changed = true; }
        }

        if (e.hitUntil && now >= e.hitUntil) { e.hitUntil = 0; changed = true; }
    }

    if (changed) renderEnemies();
}

/**
 * The enemy's strike lands: misses if the player stepped away,
 * does nothing if blocked, otherwise hurts the player.
 * @returns {boolean} true if the strike was blocked
 */
function resolveStrike(enemy, now) {
    const dist = Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y);
    if (dist !== 1) return false; // player moved out of reach

    if (playerCanBlockHitFrom(enemy.x, enemy.y)) {
        // Each blocked hit costs stamina; with too little left the guard breaks and the hit lands
        if (typeof spendStamina !== "function" || spendStamina(STAMINA.blockedHitCost, now)) {
            // Shove the attacker away from the player; a void tile behind it is fatal
            pushEnemy(enemy, Math.sign(enemy.x - player.x), Math.sign(enemy.y - player.y), ENEMY.knockbackTiles);
            return true;
        }
        if (typeof breakGuard === "function") breakGuard(now);
    }

    damagePlayer(ENEMY.damage, now);
    return false;
}

/**
 * Pushes an enemy up to `tiles` tiles in direction (dx, dy), one tile at a time.
 * - floor: it slides onto it
 * - void: it falls in and is removed
 * - wall, next_level, another enemy, the player, or the map edge: it stops
 * @returns {"moved"|"fell"|"blocked"}
 */
function pushEnemy(enemy, dx, dy, tiles) {
    let result = "blocked";

    for (let i = 0; i < tiles; i++) {
        const nx = enemy.x + dx, ny = enemy.y + dy;

        if (ny < 0 || nx < 0 || ny >= gameMap.length || nx >= gameMap[0].length) break;
        if (enemyAt(nx, ny) || (player.x === nx && player.y === ny)) break;

        const tile = gameMap[ny][nx];
        if (tile === "void") {
            enemies = enemies.filter(e => e !== enemy);
            return "fell";
        }
        if (tile !== "floor") break;

        enemy.x = nx;
        enemy.y = ny;
        result = "moved";
    }
    return result;
}

/** The player's shove lands on (x, y): push the enemy there and stun it. */
function shoveEnemyAt(x, y, dx, dy, tiles) {
    const e = enemyAt(x, y);
    if (!e) return false;

    const outcome = pushEnemy(e, dx, dy, tiles);
    if (outcome !== "fell") {
        e.state = "recover";                       // cancels any windup
        e.recoverUntil = performance.now() + ENEMY.shoveStunMs;
    }

    renderEnemies();
    return true;
}

/** Applies damage to the player, with a short invulnerability window. */
function damagePlayer(amount, now = performance.now()) {
    if (playerDead || now < (player.invulnerableUntil || 0)) return;

    player.hp -= amount;
    player.invulnerableUntil = now + PLAYER_IFRAMES_MS;
    player.flashUntil = now + PLAYER_HIT_FLASH_MS;

    updateHud();
    applyPlayerVisuals();
    setTimeout(applyPlayerVisuals, PLAYER_HIT_FLASH_MS); // drop the flash class when it ends

    if (player.hp <= 0) {
        playerDead = true;
        window.location.replace("game_over.html");
    }
}

/** Damages the enemy on (x, y), if any. Returns true if something was hit. */
function damageEnemyAt(x, y, amount = 1) {
    const e = enemyAt(x, y);
    if (!e) return false;

    const now = performance.now();
    e.hp -= amount;

    if (e.hp <= 0) {
        enemies = enemies.filter(other => other !== e);
    } else {
        e.hitUntil = now + ENEMY.hitFlashMs;
        e.state = "recover";                 // being hit interrupts a windup
        e.recoverUntil = now + ENEMY.staggerMs;
    }

    renderEnemies();
    return true;
}

// The player's swing (from playerAttack) lands on the tile in front of them
document.addEventListener("player-attack", (event) => {
    damageEnemyAt(event.detail.x, event.detail.y, player.damage || 1);
});

// The player's shove (from playerShove) pushes the enemy in front of them
document.addEventListener("player-shove", (event) => {
    const d = event.detail;
    shoveEnemyAt(d.x, d.y, d.dx, d.dy, d.tiles);
});

/**
 * Draws enemies by adding classes to their tiles (enemy, enemy-windup, enemy-hit)
 * and sets --hp (0-100) for the health bar. Safe to call at any time; it never
 * touches the player's tile.
 */
function renderEnemies() {
    for (const d of drawnEnemyEls) {
        d.el.className = d.base;
        d.el.style.removeProperty("--hp");
    }
    drawnEnemyEls = [];

    if (typeof tileEls === "undefined") return;

    const now = performance.now();
    for (const e of enemies) {
        const el = tileEls[e.y] && tileEls[e.y][e.x];
        if (!el) continue;

        drawnEnemyEls.push({ el, base: el.className });
        el.classList.add("enemy");
        if (e.state === "windup") el.classList.add("enemy-windup");
        if (now < e.hitUntil) el.classList.add("enemy-hit");
        el.style.setProperty("--hp", Math.round(100 * e.hp / e.maxHp));
    }
}

/** Shows the player's health as hearts in the top-left corner. */
function updateHud() {
    if (player.hp === undefined) return;

    let hud = document.getElementById("hud");
    if (!hud) {
        hud = document.createElement("div");
        hud.id = "hud";
        document.body.appendChild(hud);
    }
    const full = Math.max(0, player.hp);
    hud.textContent = "♥".repeat(full) + "♡".repeat(Math.max(0, player.maxHp - full));
}

setInterval(enemyTick, TICK_MS);