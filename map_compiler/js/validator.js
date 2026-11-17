// validator.js
// Checks a parsed map (from pixel_parser.js) and reports problems.
// Requires tile_config.js (for UNKNOWN_TILE) to be loaded first.
//
// Checks run in this order:
//   1. unknown colors
//   2. exactly one player start and exactly one end
//   3. outer edge is only wall or void
//   4. (only if 1-3 found nothing) the end is reachable from the start
//
// Error codes:
//   unknown_tiles, no_start, multiple_start, no_end, multiple_end,
//   map_structure_edges_unidentified, no_path_to_end

// validator.js
// Checks a parsed map (from pixel_parser.js) and reports problems.
// Requires tile_config.js (for UNKNOWN_TILE) to be loaded first.
//
// Checks run in this order:
//   1. unknown colors
//   2. exactly one player start and exactly one end
//   3. outer edge is only wall or void
//   4. (only if 1-3 found nothing) the end is reachable from the start
//
// Error codes:
//   unknown_tiles, no_start, multiple_start, no_end, multiple_end,
//   map_structure_edges_unidentified, no_path_to_end

const WALKABLE_TILES = ["floor", "next_level"]; // enemy spawns are floor in the grid
const EDGE_SAFE_TILES = ["wall", "void"];
const MAX_REPORTED_POSITIONS = 20; // keep error output readable

/**
 * @param {ReturnType<typeof parsePixels>} parsed
 * @returns {{valid: boolean, errors: {code: string, message: string, positions?: {x:number,y:number}[]}[]}}
 */
function validateMap(parsed) {
    const errors = [];
    const { width, height, tiles, playerStarts } = parsed;

    // ---- 1. Unknown colors ----
    if (parsed.unknown.size > 0) {
        const positions = [];
        let total = 0;
        for (const u of parsed.unknown.values()) {
            total += u.count;
            positions.push(u.first);
        }
        // One row per unknown color, most common first, so the biggest offenders are easy to spot
        const details = [...parsed.unknown.values()]
            .sort((a, b) => b.count - a.count)
            .map(u => ({
                color: u.a >= MIN_ALPHA ? `rgb(${u.r}, ${u.g}, ${u.b})` : `transparent (alpha ${u.a})`,
                pixels: u.count,
                firstX: u.first.x,
                firstY: u.first.y
            }));

        errors.push({
            code: "unknown_tiles",
            message: `${total} pixel(s) use ${parsed.unknown.size} unrecognised color(s). Positions show the first pixel of each.`,
            positions: positions.slice(0, MAX_REPORTED_POSITIONS),
            details
        });
    }

    // ---- 2. Exactly one start and one end ----
    const ends = mergeTouching(findTiles(tiles, "next_level")); // a bled/blocky end counts once

    if (playerStarts.length === 0) {
        errors.push({ code: "no_start", message: "No player start found (expected exactly 1)." });
    } else if (playerStarts.length > 1) {
        errors.push({
            code: "multiple_start",
            message: `Found ${playerStarts.length} player starts (expected exactly 1).`,
            positions: playerStarts.slice(0, MAX_REPORTED_POSITIONS)
        });
    }

    if (ends.length === 0) {
        errors.push({ code: "no_end", message: "No end (next_level) found (expected exactly 1)." });
    } else if (ends.length > 1) {
        errors.push({
            code: "multiple_end",
            message: `Found ${ends.length} ends (expected exactly 1).`,
            positions: ends.slice(0, MAX_REPORTED_POSITIONS)
        });
    }

    // ---- 3. Edges must be wall or void ----
    const badEdges = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const onEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
            if (onEdge && !EDGE_SAFE_TILES.includes(tiles[y][x]) && tiles[y][x] !== UNKNOWN_TILE) {
                badEdges.push({ x, y });
            }
        }
    }
    if (badEdges.length > 0) {
        errors.push({
            code: "map_structure_edges_unidentified",
            message: `${badEdges.length} edge tile(s) are not wall or void, so the map is not enclosed.`,
            positions: badEdges.slice(0, MAX_REPORTED_POSITIONS)
        });
    }

    // ---- 4. Path from start to end (only when nothing above failed) ----
    if (errors.length === 0) {
        if (!isReachable(tiles, width, height, playerStarts[0], ends[0])) {
            errors.push({
                code: "no_path_to_end",
                message: "The end cannot be reached from the player start over floor tiles.",
                positions: [playerStarts[0], ends[0]]
            });
        }
    }

    return { valid: errors.length === 0, errors };
}

/** Returns every {x, y} whose tile equals `type`. */
function findTiles(tiles, type) {
    const found = [];
    for (let y = 0; y < tiles.length; y++) {
        for (let x = 0; x < tiles[y].length; x++) {
            if (tiles[y][x] === type) found.push({ x, y });
        }
    }
    return found;
}

/**
 * Breadth-first search over walkable tiles, 4 directions
 * (matches movePlayer, which only moves up/down/left/right).
 */
function isReachable(tiles, width, height, from, to) {
    const visited = new Uint8Array(width * height);
    const queue = [from];
    visited[from.y * width + from.x] = 1;

    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (let head = 0; head < queue.length; head++) {
        const { x, y } = queue[head];
        if (x === to.x && y === to.y) return true;

        for (const [dx, dy] of steps) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (visited[ny * width + nx]) continue;
            if (!WALKABLE_TILES.includes(tiles[ny][nx])) continue;

            visited[ny * width + nx] = 1;
            queue.push({ x: nx, y: ny });
        }
    }
    return false;
}