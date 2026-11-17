// this script is ment to read a jps file and asign the right tiles and create a map file that can be rendered,

// compiler.js
// Orchestrates the pipeline: image -> pixels -> tiles -> validate -> export.

const fileInput = document.getElementById("file-input");
const dropZone  = document.getElementById("drop-zone");
const preview   = document.getElementById("preview");
const info      = document.getElementById("info");
const exportBtn = document.getElementById("export-button");

let currentMap = null;    // { width, height, data, image }
let exportable = null;    // { parsed, fileName } - set only when the map is valid

if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.addEventListener("click", () => {
        if (!exportable) return;
        try {
            exportMap(exportable.parsed, exportable.fileName);
        } catch (err) {
            info.textContent = "Error: " + err.message;
        }
    });
}

/**
 * Draws a magenta box around every position listed in the validation errors,
 * so single stray pixels are easy to find on the preview.
 */
function highlightErrors(errors) {
    if (!currentMap) return;

    const scale = preview.width / currentMap.width;
    const ctx = preview.getContext("2d");

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ff00ff";

    for (const err of errors) {
        for (const p of err.positions || []) {
            const pad = Math.max(2, scale); // box a bit larger than the pixel itself
            ctx.strokeRect(p.x * scale - pad, p.y * scale - pad, scale + pad * 2, scale + pad * 2);
        }
    }
}

async function handleFile(file) {
    exportable = null;
    if (exportBtn) exportBtn.disabled = true;

    try {
        currentMap = await loadMapImage(file);
        drawPreview(preview, currentMap.image);

        const first = getPixel(currentMap.data, currentMap.width, 0, 0);
        info.textContent =
            `${file.name}: ${currentMap.width} x ${currentMap.height} px. ` +
            `Top-left pixel: rgba(${first.r}, ${first.g}, ${first.b}, ${first.a})`;

        const parsed = parsePixels(currentMap);
        console.log("Parsed map:", parsed);

        info.textContent +=
            ` | player starts: ${parsed.playerStarts.length}` +
            `, enemy spawns: ${parsed.enemySpawns.length}` +
            `, unknown colors: ${parsed.unknown.size}`;

        if (parsed.mergedAway > 0) {
            info.textContent += ` (merged ${parsed.mergedAway} touching marker pixel(s))`;
        }

        for (const [key, u] of parsed.unknown) {
            console.warn(`Unknown color ${key} x${u.count}, first at (${u.first.x}, ${u.first.y})`);
        }

        const result = validateMap(parsed);

        if (result.valid) {
            info.textContent += " | VALID MAP";
            exportable = { parsed, fileName: file.name };
            if (exportBtn) exportBtn.disabled = false;
        } else {
            for (const err of result.errors) {
                console.error(`[${err.code}] ${err.message}`, err.positions || "");
                if (err.details) console.table(err.details); // colors, counts, first position
            }
            info.textContent += " | INVALID: " +
                result.errors.map(e => `${e.code} (${e.message})`).join("; ");
            highlightErrors(result.errors);
        }

    } catch (err) {
        info.textContent = "Error: " + err.message;
    }
}

fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

// Drag and drop
dropZone.addEventListener("dragover", (e) => {
    e.preventDefault(); // required, otherwise the browser won't allow a drop
    dropZone.classList.add("hover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("hover"));
dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("hover");
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});