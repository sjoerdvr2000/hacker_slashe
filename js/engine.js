// engine.js
// Renders the map and handles keyboard input.
// Load order: player_behavior.js, enemies.js, then your generated map file(s) in play order
// (each pushes a level onto window.LEVELS), then this file.

// ---- Camera / grid sizing ----
// The camera shows VIEW_COLS x VIEW_ROWS tiles and follows the player.
// Maps smaller than the view are shown whole (the camera shrinks to fit).
const VIEW_COLS       = 21;   // odd numbers keep the player exactly centred
const VIEW_ROWS       = 15;
const MIN_TILE_PX     = 16;   // tile size limits when fitting the view to the window
const MAX_TILE_PX     = 64;
const GRID_MARGIN     = 16;   // space kept free around the camera (px)
const CAMERA_GLIDE_MS = 150;  // how smoothly the camera follows each step

// Cached grid state, so a step only touches 2 tiles instead of rebuilding everything
let gridEl = null;         // the .window element
let cameraEl = null;       // the .camera wrapper around it (created automatically)
let builtMap = null;       // the map array the grid was built for
let tileEls = [];          // tileEls[y][x] -> tile element
let lastPlayerPos = null;  // {x, y} of the tile currently marked as player
let tilePx = 32;           // current tile size in px
let viewPxW = 0, viewPxH = 0; // camera size in px

/**
 * Builds the tile elements once for a map, and tells CSS how big the grid is.
 * CSS reads --cols, --rows and --tile-size (see game.css).
 */
function buildGrid(grid, map) {
    const rows = map.length;
    const cols = map[0].length;

    const fragment = document.createDocumentFragment();
    tileEls = [];

    for (let y = 0; y < rows; y++) {
        const rowEls = [];
        for (let x = 0; x < cols; x++) {
            const el = document.createElement("div");
            el.className = `tile ${map[y][x]}`;
            fragment.appendChild(el);
            rowEls.push(el);
        }
        tileEls.push(rowEls);
    }

    grid.replaceChildren(fragment);

    grid.style.setProperty("--cols", cols);
    grid.style.setProperty("--rows", rows);

    gridEl = grid;
    cameraEl = ensureCamera(grid);
    builtMap = map;
    lastPlayerPos = null;

    gridEl.style.transition = "transform " + CAMERA_GLIDE_MS + "ms ease-out";
    fitTileSize();
}

/** Wraps the grid in a .camera element (once) so it can be clipped and scrolled. */
function ensureCamera(grid) {
    const parent = grid.parentNode;
    if (!parent) return null;
    if (parent.classList && parent.classList.contains("camera")) return parent;

    const cam = document.createElement("div");
    cam.className = "camera";
    parent.insertBefore(cam, grid);
    cam.appendChild(grid);
    return cam;
}

/** Picks the tile size so VIEW_COLS x VIEW_ROWS tiles fit the window, and sizes the camera. */
function fitTileSize() {
    if (!gridEl || !builtMap) return;

    const rows = builtMap.length;
    const cols = builtMap[0].length;

    const byWidth  = (window.innerWidth  - GRID_MARGIN * 2) / VIEW_COLS;
    const byHeight = (window.innerHeight - GRID_MARGIN * 2) / VIEW_ROWS;
    tilePx = Math.min(MAX_TILE_PX, Math.max(MIN_TILE_PX, Math.floor(Math.min(byWidth, byHeight))));
    gridEl.style.setProperty("--tile-size", tilePx + "px");

    // The camera is as big as the view, or the whole map if the map is smaller
    viewPxW = Math.min(cols, VIEW_COLS) * tilePx;
    viewPxH = Math.min(rows, VIEW_ROWS) * tilePx;
    if (cameraEl) {
        cameraEl.style.width  = viewPxW + "px";
        cameraEl.style.height = viewPxH + "px";
    }

    updateCamera(true);
}

/**
 * Scrolls the grid so the player is centred, without showing anything past the map edge.
 * @param {boolean} snap - jump instantly (new level, resize) instead of gliding
 */
function updateCamera(snap = false) {
    if (!cameraEl || !gridEl || !builtMap) return;

    const maxX = builtMap[0].length * tilePx - viewPxW;
    const maxY = builtMap.length    * tilePx - viewPxH;

    const x = Math.min(Math.max(player.x * tilePx + tilePx / 2 - viewPxW / 2, 0), maxX);
    const y = Math.min(Math.max(player.y * tilePx + tilePx / 2 - viewPxH / 2, 0), maxY);

    if (snap) gridEl.style.transition = "none";
    gridEl.style.transform = `translate(${-x}px, ${-y}px)`;
    if (snap) {
        void gridEl.offsetWidth; // flush, so the jump isn't animated
        gridEl.style.transition = "transform " + CAMERA_GLIDE_MS + "ms ease-out";
    }
}

window.addEventListener("resize", fitTileSize);


/**
 * Renders the game map.
 * The first call (or a new map array) builds the grid; later calls only move the player marker.
 *
 * @param {TileType[][]} map
 * @returns {void}
 */
function renderMap(map) {

    const grid = document.querySelector(".window");

    if (!grid) return;

    // (Re)build when this is a different grid element or a different map
    const rebuilt = grid !== gridEl || map !== builtMap;
    if (rebuilt) {
        buildGrid(grid, map);
    }

    // Clear the old player tile back to a plain tile (drops player + state/face classes)
    if (lastPlayerPos) {
        const { x, y } = lastPlayerPos;
        tileEls[y][x].className = `tile ${map[y][x]}`;
    }

    // Draw enemies (never touches the player's tile)
    if (typeof renderEnemies === "function") renderEnemies();

    // Mark the new player tile
    const playerTile = tileEls[player.y] && tileEls[player.y][player.x];
    if (playerTile) {
        playerTile.classList.add("player");
        lastPlayerPos = { x: player.x, y: player.y };
    }

    // Re-apply animation state classes (state-walk, face-left, ...)
    if (typeof applyPlayerVisuals === "function") applyPlayerVisuals();

    updateCamera(rebuilt); // glide after a step, snap after loading a new map
}


// ---- Levels ----
// Each generated map file pushes one level onto window.LEVELS (order = <script> order).
let currentLevelIndex = 0;
let gameMap = null;      // current level's tiles; movePlayer reads this
let enemySpawns = [];    // current level's enemy spawn points
let gameFinished = false;

const player = { x: 0, y: 0 }; // position is set by loadLevel

/**
 * Switches to the level at `index`: swaps the map, moves the player to the
 * start and redraws. Returns false if that level doesn't exist.
 */
function loadLevel(index) {
    const level = window.LEVELS && window.LEVELS[index];
    if (!level) return false;

    currentLevelIndex = index;
    gameMap = level.gameMap;
    enemySpawns = level.enemySpawns;

    player.x = level.playerStart.x;
    player.y = level.playerStart.y;

    if (typeof resetPlayerState === "function") resetPlayerState();
    if (typeof spawnEnemies === "function") spawnEnemies(enemySpawns);
    if (typeof updateHud === "function") updateHud();

    renderMap(gameMap); // a new map array makes renderMap rebuild the grid
    return true;
}

/** Called by movePlayer when the player steps on a next_level tile. */
function loadNextLevel() {
    if (gameFinished) return;
    if (!loadLevel(currentLevelIndex + 1)) onGameComplete();
}

/** Runs after the last level. Replace this with a redirect if you prefer, e.g. "game_won.html". */
function onGameComplete() {
    gameFinished = true;

    const overlay = document.createElement("div");
    overlay.textContent = "You completed every level!";
    overlay.style.cssText =
        "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
        "background:rgba(0,0,0,0.85);color:#fff;font:bold 2rem sans-serif;z-index:10;";
    document.body.appendChild(overlay);
}

// Add animation/combat state to the player (from player_behavior.js)
if (typeof initPlayerBehavior === "function") {
    initPlayerBehavior();
} else {
    console.error(
        "player_behavior.js is missing, failed to load, or is loaded AFTER engine.js. " +
        "Animations/combat are disabled."
    );
}


// Hotkeys: change them here ONLY (lowercase event.key values)
const ATTACK_KEYS = [" ", "j"];
const BLOCK_KEYS  = ["q"];


// Keyboard controls
document.addEventListener("keydown", (event) => {

    if (gameFinished) return;

    const key = event.key.toLowerCase();

    if (ATTACK_KEYS.includes(key)) {
        event.preventDefault(); // stop Space from scrolling the page
        if (!event.repeat) playerAttack();
        return;
    }

    if (BLOCK_KEYS.includes(key)) {
        playerBlock(true);
        return;
    }

    switch (key) {

        case "w":
        case "arrowup":
            movePlayer(0, -1);
            break;

        case "s":
        case "arrowdown":
            movePlayer(0, 1);
            break;

        case "a":
        case "arrowleft":
            movePlayer(-1, 0);
            break;

        case "d":
        case "arrowright":
            movePlayer(1, 0);
            break;
    }

});

document.addEventListener("keyup", (event) => {

    if (BLOCK_KEYS.includes(event.key.toLowerCase())) {
        playerBlock(false);
    }

});

// If the window loses focus mid-hold, the keyup never arrives: release the guard
window.addEventListener("blur", () => playerBlock(false));

// Start the first level
if (!loadLevel(0)) {
    console.error(
        "No levels found. Load at least one generated map file (the ones that push onto " +
        "window.LEVELS) BEFORE engine.js."
    );
}