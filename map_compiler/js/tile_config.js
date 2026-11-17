// tile_config.js
// The single place that defines what each PNG color means.
// To add or change a tile, edit only this file.
//
// kind:
//   "tile"   - becomes a tile in the map grid, using `tile` as its type name
//   "marker" - a spot that sits ON a floor tile and is recorded separately
//              (player start, enemy spawns). The grid gets `underTile` there.



// rgb(0, 0, 0) = void this is a tile that will kill the player if they move on to it!
// rgb(255, 0, 0) = wall actors can not move trough walls ever!
// rgb(43, 255, 0) = Floor tiles are walkeble and any actor can move on them
// rgb(0, 0, 255) = player span/ level start this is where a player starts the level! There can only be one of these per level never more!
// rgb(255, 255, 255) = is next level or end of level tile this is where the player needs to go to win! You can only ever have one of these per level!
// rgb(217, 255, 0) = Enemy spawn point this is the starting position for a enemy you can have multiple of these per map, no hard limit.

const TILE_CONFIG = [
    { name: "void",        color: [0,   0,   0],   kind: "tile",   tile: "void" },
    { name: "wall",        color: [255, 0,   0],   kind: "tile",   tile: "wall" },
    { name: "floor",       color: [43,  255, 0],   kind: "tile",   tile: "floor" },
    { name: "next_level",  color: [255, 255, 255], kind: "tile",   tile: "next_level" },

    { name: "player_start", color: [0,   0,   255], kind: "marker", underTile: "floor" },
    { name: "enemy_spawn",  color: [217, 255, 0],   kind: "marker", underTile: "floor" }
];

// Tile used for pixels whose color isn't in the table above.
// The validator should reject maps that still contain it.
const UNKNOWN_TILE = "unknown";

// Pixels with alpha below this are treated as unknown (transparent pixels
// can lose their RGB values in the browser, so they can't be trusted).
const MIN_ALPHA = 255;

/** Lookup table "r,g,b" -> config entry, built once. */
const COLOR_LOOKUP = (() => {
    const lookup = new Map();
    for (const entry of TILE_CONFIG) {
        const key = entry.color.join(",");
        if (lookup.has(key)) {
            console.warn(`tile_config: duplicate color ${key} for "${entry.name}"`);
        }
        lookup.set(key, entry);
    }
    return lookup;
})();