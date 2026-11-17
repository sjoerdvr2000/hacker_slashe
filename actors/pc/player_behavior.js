// Player behavior: movement, attacking, blocking and animation state.
// IMPORTANT: this script must come BEFORE engine.js in the DOM.
// The player is rendered by engine.js; this file only sets state + CSS classes.

// ---- Tunable timings (ms) ----
const WALK_ANIM_MS     = 180;  // how long the walk class stays after a step
const ATTACK_ANIM_MS   = 300;  // length of the attack swing
const ATTACK_COOLDOWN  = 450;  // min time between attack starts
const MOVE_COOLDOWN_MS = 120;  // optional: stops held keys from moving too fast

// ---- Player combat tunables ----
const PLAYER_MAX_HP        = 5;
const PLAYER_IFRAMES_MS    = 700;  // invulnerable after being hit
const PLAYER_HIT_FLASH_MS  = 250;  // how long the hit flash shows

// ---- Shove (attack key while blocking) ----
const SHOVE_TILES       = 3;    // how far an enemy is pushed
const SHOVE_COOLDOWN_MS = 600;
const SHOVE_ANIM_MS     = 250;

/**
 * Adds behavior state to the player object.
 * engine.js must call this ONCE, right after `const player = {...}`,
 * because this script loads before engine.js and can't touch `player` yet.
 */
function initPlayerBehavior() {
    if (player.behaviorReady) return;
    player.behaviorReady = true;
    player.facing      = "down"; // "up" | "down" | "left" | "right"
    player.state       = "idle"; // "idle" | "walk" | "attack" | "block"
    player.isAttacking = false;
    player.isBlocking  = false;
    player.hp = PLAYER_MAX_HP;
    player.maxHp = PLAYER_MAX_HP;
    player.damage = 1;
    player.invulnerableUntil = 0;
    player.flashUntil = 0;
    player.setAnimation = playerSetAnimation;
    if (typeof initPlayerStats === "function") initPlayerStats(); // stamina, from player_stats_&_inventory.js
}

/** Safety net: sets up the player on first use if engine.js never called init. */
function ensurePlayerInit() {
    if (!player.behaviorReady) initPlayerBehavior();
}

let walkTimer = null;
let attackTimer = null;
let lastAttackTime = 0;
let lastMoveTime = 0;
let lastShoveTime = 0;
let shoveTimer = null;

/** Converts a movement delta into a facing direction. */
function directionFromDelta(dx, dy) {
    if (dx > 0) return "right";
    if (dx < 0) return "left";
    if (dy > 0) return "down";
    if (dy < 0) return "up";
    return player.facing;
}

/** Returns the {dx, dy} the player is currently facing. */
function facingVector() {
    switch (player.facing) {
        case "up":    return { dx: 0,  dy: -1 };
        case "down":  return { dx: 0,  dy: 1 };
        case "left":  return { dx: -1, dy: 0 };
        default:      return { dx: 1,  dy: 0 };
    }
}

/**
 * Applies the current state to the player's DOM element as CSS classes.
 * Call this after every renderMap(), since re-rendering can recreate the element.
 * Adjust the selector to match whatever engine.js renders.
 */
function applyPlayerVisuals() {
    const el = document.getElementById("player") || document.querySelector(".player");
    if (!el) return;

    el.classList.remove(
        "state-idle", "state-walk", "state-attack", "state-block",
        "face-up", "face-down", "face-left", "face-right", "player-hit",
        "state-shove", "guard-broken"
    );
    el.classList.add("state-" + player.state, "face-" + player.facing);
    if (performance.now() < (player.flashUntil || 0)) el.classList.add("player-hit");
    if (typeof isGuardBroken === "function" && isGuardBroken()) el.classList.add("guard-broken");
}

/** Sets the animation state. Walk auto-returns to idle; attack/block are handled elsewhere. */
function setPlayerState(state) {
    player.state = state;
    applyPlayerVisuals();
}

/** Called by movePlayer: faces the player and plays the walk animation. */
function playerSetAnimation(dx, dy) {
    player.facing = directionFromDelta(dx, dy);
    if (player.isAttacking || player.isBlocking) return;

    setPlayerState("walk");
    clearTimeout(walkTimer);
    walkTimer = setTimeout(() => {
        if (!player.isAttacking && !player.isBlocking) setPlayerState("idle");
    }, WALK_ANIM_MS);
}

/**
 * Moves the player if the destination tile is valid.
 * @param {number} dx - Horizontal movement
 * @param {number} dy - Vertical movement
 */
function movePlayer(dx, dy) {
    ensurePlayerInit();
    // Can't walk mid-swing or while guarding
    if (player.isAttacking || player.isBlocking) return;

    // Throttle held keys
    const now = performance.now();
    if (now - lastMoveTime < MOVE_COOLDOWN_MS) return;
    lastMoveTime = now;

    // Always turn to face the input direction, even if the move is blocked
    player.facing = directionFromDelta(dx, dy);

    const newX = player.x + dx;
    const newY = player.y + dy;

    const mapHeight = gameMap.length;
    const mapWidth = gameMap[0].length;

    // Boundary check
    if (newX < 0 || newX >= mapWidth || newY < 0 || newY >= mapHeight) {
        applyPlayerVisuals();
        return;
    }

    const tile = gameMap[newY][newX];

    // Enemies block the way (you still turn to face them)
    if (typeof enemyAt === "function" && enemyAt(newX, newY)) {
        applyPlayerVisuals();
        return;
    }

    // Collision checks
    if (tile === "wall") {
        applyPlayerVisuals(); // turned, but didn't move
        return;
    }
    if (tile === "void") {
        window.location.replace("game_over.html");
        return;
    }
    if (tile === "next_level") {
        loadNextLevel(); // defined in engine.js
        return;
    }

    // Update position
    player.x = newX;
    player.y = newY;

    playerSetAnimation(dx, dy);

    renderMap(gameMap);
    applyPlayerVisuals(); // re-apply classes to the freshly rendered element
}

/** Attack trigger. Hits the tile in front of the player. */
function playerAttack() {
    ensurePlayerInit();

    // While guarding, the attack key is a shove instead of a swing
    if (player.isBlocking) {
        playerShove();
        return;
    }

    const now = performance.now();
    if (player.isAttacking) return;
    if (now - lastAttackTime < ATTACK_COOLDOWN) return;

    lastAttackTime = now;
    player.isAttacking = true;
    clearTimeout(walkTimer);
    setPlayerState("attack");

    // Hit detection: the tile directly in front of the player
    const { dx, dy } = facingVector();
    const targetX = player.x + dx;
    const targetY = player.y + dy;

    // Hook into your enemy system here, e.g.:
    // if (typeof damageEnemyAt === "function") damageEnemyAt(targetX, targetY, player.damage || 1);
    document.dispatchEvent(new CustomEvent("player-attack", {
        detail: { x: targetX, y: targetY, facing: player.facing }
    }));

    clearTimeout(attackTimer);
    attackTimer = setTimeout(() => {
        player.isAttacking = false;
        setPlayerState(player.isBlocking ? "block" : "idle");
    }, ATTACK_ANIM_MS);
}

/** Block trigger: call with true on key down, false on key up. */
function playerBlock(active) {
    ensurePlayerInit();
    if (active) {
        if (player.isAttacking || player.isBlocking) return;
        if (typeof isGuardBroken === "function" && isGuardBroken()) return; // guard is broken
        player.isBlocking = true;
        clearTimeout(walkTimer);
        setPlayerState("block");
    } else {
        if (!player.isBlocking) return;
        player.isBlocking = false;
        if (!player.isAttacking) setPlayerState("idle");
    }
}

/**
 * Shove: only while blocking. Costs stamina, deals no damage, and pushes the
 * enemy in front of you up to SHOVE_TILES tiles (enemies.js does the pushing).
 * The guard stays up afterwards.
 */
function playerShove() {
    ensurePlayerInit();
    const now = performance.now();

    if (!player.isBlocking || player.isAttacking) return;
    if (now - lastShoveTime < SHOVE_COOLDOWN_MS) return;
    if (typeof spendStamina === "function" && !spendStamina(STAMINA.shoveCost, now)) return;

    lastShoveTime = now;
    setPlayerState("shove");

    const { dx, dy } = facingVector();
    document.dispatchEvent(new CustomEvent("player-shove", {
        detail: { x: player.x + dx, y: player.y + dy, dx, dy, tiles: SHOVE_TILES }
    }));

    clearTimeout(shoveTimer);
    shoveTimer = setTimeout(() => {
        if (player.state === "shove") setPlayerState(player.isBlocking ? "block" : "idle");
    }, SHOVE_ANIM_MS);
}

/**
 * Use this when enemies hit the player, so blocking actually matters.
 * Only blocks hits coming from the front.
 * @returns {boolean} true if the hit was blocked
 */
function playerCanBlockHitFrom(enemyX, enemyY) {
    if (!player.isBlocking) return false;
    const { dx, dy } = facingVector();
    return enemyX === player.x + dx && enemyY === player.y + dy;
}

/*
 * ---- Add this to the keyboard handler in engine.js ----
 *
 * document.addEventListener("keydown", (e) => {
 *     if (e.repeat && (e.code === "Space" || e.code === "KeyK")) return;
 *     if (e.code === "Space" || e.code === "KeyJ") playerAttack();
 *     if (e.code === "KeyK"  || e.code === "ShiftLeft") playerBlock(true);
 * });
 * document.addEventListener("keyup", (e) => {
 *     if (e.code === "KeyK" || e.code === "ShiftLeft") playerBlock(false);
 * });
 */

/** Clears combat/animation state, e.g. when a new level loads. */
function resetPlayerState() {
    clearTimeout(walkTimer);
    clearTimeout(attackTimer);
    clearTimeout(shoveTimer);
    if (typeof resetStamina === "function") resetStamina();
    player.isAttacking = false;
    player.isBlocking  = false;
    player.facing = "down";
    player.state  = "idle";
}