# hacker_slashe
Hacker_slache exists as two projects: a 2D game with a simple engine and a map creation tool. The engine: You'll find the engine under js. It handles basic movement and rendering the game's map.

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
compiler
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
Map compiler: Under map_compiler, you'll find the setup for a map-making tool, as well as the files and an index.html 
by uploading a png to the map_compiler you can create your own map without having to whrite everthing out in js the compiler should do it for you.

To see how to make a map go to map_compiler/js/tile_config.js this script interperts uploaded maps, each pixle being one tile.
Mapping error codes and how to fix:

Unknown colors the map_compiler can only use the following colours make sure your colours are corect:
// rgb(0, 0, 0) = void this is a tile that will kill the player if they move on to it!
// rgb(255, 0, 0) = wall actors can not move trough walls ever!
// rgb(43, 255, 0) = Floor tiles are walkeble and any actor can move on them
// rgb(0, 0, 255) = player span/ level start this is where a player starts the level! There can only be one of these per level never more!
// rgb(255, 255, 255) = is next level or end of level tile this is where the player needs to go to win! You can only ever have one of these per level!
// rgb(217, 255, 0) = Enemy spawn point this is the starting position for a enemy you can have multiple of these per map, no hard limit.

no_start && no_end
If you see this error it means you have no end or start in your map their needs to be one of each

multiple_start && multiple_end
There can only ever be one start and one end, your map contains more than one.

map_structure_edges_unidentified
The edge of a map need to be serouned by walls or by voids this is to stop the player walking of the map or somthing 
silly like that.

no_path_to_end

This means its not posible to draw a path from you player spawn to the player end 
make sure that there are floor tiles conecting the start to the end, spawns do count as floor tiles for this error



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
Styling
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

Styling: Currently, the project uses 4 style sheets style.css (general style, interface and so on)| player.css (everthing to do whith the player) | npc.css (npc's non player actors) | and tiles.css (for the tiles used in the games maps)
Each of these files will handles its exclusive section of the game, making maintenance much easier. tiles.css hasn't been implemented yet and is still handeled at style.css!





Why build this project to begin with? 
I have always wanted to make my own game engine, 
no matter how basic or strange. The goal of the project is mainly to serve as a portfolio piece, 
allowing me to show off my skills as a developer and designer in an interesting and fun way, 
while also demonstrating that I am able to build purpose-built software and tools that enable and simplify processes.
