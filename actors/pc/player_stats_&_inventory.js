// player_stats_&_inventory.js
// Player stamina (inventory will live here later).
// Load order: any time before engine.js. Only functions/constants are defined at load.
//
// How stamina works:
//   - Holding block drains it slowly.
//   - Every blocked hit costs a chunk (about 2-3 blocked hits from a full bar).
//   - A shove (attack key while blocking) costs stamina too.
//   - Running out mid-guard, or being hit with too little left to block, is a GUARD BREAK:
//     the block drops, the hit lands, and you can't block for a moment.
//   - Stamina refills shortly after you stop blocking.

// ---- Tunables (100-point bar) ----
const STAMINA = {
    max: 100,
    blockHoldPerSec: 10,   // drain while the guard is up
    blockedHitCost: 25,    // each hit you block
    shoveCost: 35,         // the shove attack
    regenPerSec: 20,
    regenDelayMs: 800,     // wait after blocking/spending before refilling starts
    guardBreakMs: 1000     // how long the guard is locked after a break
};
const STAMINA_TICK_MS = 100;

let lastStaminaTickAt = null;
let lastStaminaPct = -1;

/** Adds stamina fields to the player. Called by initPlayerBehavior(). */
function initPlayerStats() {
    player.maxStamina = STAMINA.max;
    player.stamina = STAMINA.max;
    player.regenResumeAt = 0;
    player.guardBrokenUntil = 0;
    updateStaminaBar();
}

/** Full stamina and no guard break, e.g. at the start of a level. */
function resetStamina() {
    if (player.stamina === undefined) return;
    player.stamina = player.maxStamina;
    player.regenResumeAt = 0;
    player.guardBrokenUntil = 0;
    updateStaminaBar();
}

function isGuardBroken(now = performance.now()) {
    return now < (player.guardBrokenUntil || 0);
}

/**
 * Spends stamina if the player has enough.
 * @returns {boolean} false (and spends nothing) if there isn't enough
 */
function spendStamina(amount, now = performance.now()) {
    if (player.stamina < amount) return false;
    player.stamina -= amount;
    player.regenResumeAt = now + STAMINA.regenDelayMs;
    updateStaminaBar();
    return true;
}

/** Drops the guard, empties stamina and locks blocking for a moment. */
function breakGuard(now = performance.now()) {
    player.stamina = 0;
    player.guardBrokenUntil = now + STAMINA.guardBreakMs;
    player.regenResumeAt = player.guardBrokenUntil;

    if (typeof playerBlock === "function") playerBlock(false); // lowers the guard
    applyPlayerVisuals();
    setTimeout(applyPlayerVisuals, STAMINA.guardBreakMs);      // clears the broken look
    updateStaminaBar();
}

/** Runs every STAMINA_TICK_MS: drains while blocking, refills otherwise. */
function staminaTick() {
    if (player.stamina === undefined) return;

    const now = performance.now();
    // Cap dt so switching tabs doesn't cause a huge jump
    const dt = lastStaminaTickAt === null ? 0 : Math.min(now - lastStaminaTickAt, 250);
    lastStaminaTickAt = now;

    if (player.isBlocking) {
        player.stamina -= STAMINA.blockHoldPerSec * dt / 1000;
        player.regenResumeAt = now + STAMINA.regenDelayMs;
        if (player.stamina <= 0) breakGuard(now);
    } else if (now >= player.regenResumeAt && player.stamina < player.maxStamina) {
        player.stamina = Math.min(player.maxStamina, player.stamina + STAMINA.regenPerSec * dt / 1000);
    }

    updateStaminaBar();
}

/** Draws the stamina bar under the hearts. Orange = can't afford a block, red = guard broken. */
function updateStaminaBar() {
    if (player.stamina === undefined || typeof document === "undefined") return;

    const pct = Math.round(100 * Math.max(0, player.stamina) / player.maxStamina);
    const broken = isGuardBroken();
    const low = player.stamina < STAMINA.blockedHitCost;
    const stateKey = pct + (broken ? "b" : low ? "l" : "n");
    if (stateKey === lastStaminaPct) return; // nothing changed, skip DOM work
    lastStaminaPct = stateKey;

    let bar = document.getElementById("stamina-bar");
    if (!bar) {
        bar = document.createElement("div");
        bar.id = "stamina-bar";
        const fill = document.createElement("div");
        fill.id = "stamina-fill";
        bar.appendChild(fill);
        document.body.appendChild(bar);
    }

    const fill = bar.children[0];
    fill.style.width = pct + "%";
    bar.className = broken ? "broken" : low ? "low" : "";
}

setInterval(staminaTick, STAMINA_TICK_MS);