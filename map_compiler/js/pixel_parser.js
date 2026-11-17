// pixel_parser.js
// Turns raw pixel data (from image_loader.js) into map data using TILE_CONFIG.
// Requires tile_config.js to be loaded first.

/**
 * Collapses groups of touching points (including diagonals) into one point each.
 * Illustrator can bleed a marker into neighbouring pixels; this makes a 2x2 block
 * count as a single marker. The kept point is the top-left-most of each group.
 * Input must be in scan order (top to bottom, left to right), which parsePixels gives.
 *
 * Side effect: two markers of the same type that touch are treated as one.
 *
 * @param {{x:number,y:number}[]} points
 * @returns {{x:number,y:number}[]}
 */
function mergeTouching(points) {
    const remaining = new Set(points.map(p => `${p.x},${p.y}`));
    const merged = [];

    for (const p of points) {
        const key = `${p.x},${p.y}`;
        if (!remaining.has(key)) continue; // already absorbed into an earlier group

        merged.push(p);

        // Flood-fill the whole touching group and remove it from the set
        const stack = [p];
        remaining.delete(key);
        while (stack.length) {
            const { x, y } = stack.pop();
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const k = `${x + dx},${y + dy}`;
                    if (remaining.delete(k)) {
                        const [nx, ny] = k.split(",").map(Number);
                        stack.push({ x: nx, y: ny });
                    }
                }
            }
        }
    }
    return merged;
}

/**
 * @param {{width:number, height:number, data:Uint8ClampedArray}} image
 * @returns {{
 *   width: number,
 *   height: number,
 *   tiles: string[][],                    // tiles[y][x], matches gameMap[y][x]
 *   playerStarts: {x:number, y:number}[],
 *   enemySpawns: {x:number, y:number}[],
 *   unknown: Map<string, {r:number,g:number,b:number,count:number,first:{x:number,y:number}}>
 * }}
 */
function parsePixels(image) {
    const { width, height, data } = image;

    const tiles = [];
    const playerStarts = [];
    const enemySpawns = [];
    const unknown = new Map();

    for (let y = 0; y < height; y++) {
        const row = [];

        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];

            const entry = a >= MIN_ALPHA ? COLOR_LOOKUP.get(`${r},${g},${b}`) : undefined;

            if (!entry) {
                // Unrecognised color: keep a placeholder and remember where it was
                row.push(UNKNOWN_TILE);
                const key = a >= MIN_ALPHA ? `${r},${g},${b}` : `transparent(a=${a})`;
                const seen = unknown.get(key);
                if (seen) seen.count++;
                else unknown.set(key, { r, g, b, a, count: 1, first: { x, y } });
                continue;
            }

            if (entry.kind === "tile") {
                row.push(entry.tile);
            } else {
                // Marker: the grid gets the floor underneath, the position is recorded
                row.push(entry.underTile);
                if (entry.name === "player_start") playerStarts.push({ x, y });
                if (entry.name === "enemy_spawn")  enemySpawns.push({ x, y });
            }
        }

        tiles.push(row);
    }

    // Merge bled markers, and remember how many extra pixels were absorbed
    const mergedStarts = mergeTouching(playerStarts);
    const mergedSpawns = mergeTouching(enemySpawns);
    const mergedAway = (playerStarts.length - mergedStarts.length) +
                       (enemySpawns.length - mergedSpawns.length);

    return {
        width, height, tiles,
        playerStarts: mergedStarts,
        enemySpawns: mergedSpawns,
        mergedAway,
        unknown
    };
}