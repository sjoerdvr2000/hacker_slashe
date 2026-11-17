// image_loader.js
// Loads a PNG (from a file input or drag-and-drop) and exposes its raw pixel data
// by drawing it onto an offscreen canvas.
//
// Load order: this file has no dependencies, so it can come first.

/**
 * Reads a File into an HTMLImageElement.
 * Uses an object URL (not a file path) so the canvas is never "tainted",
 * which means getImageData() will work even when opening index.html via file://.
 *
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        if (!file || file.type !== "image/png") {
            reject(new Error("Please choose a PNG file."));
            return;
        }

        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url); // pixels are decoded; free the URL
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Could not decode image: " + file.name));
        };

        img.src = url;
    });
}

/**
 * Draws an image 1:1 onto an offscreen canvas and returns its pixel data.
 * ImageData.data is a flat Uint8ClampedArray: [r, g, b, a, r, g, b, a, ...]
 * with one pixel every 4 entries, row by row from the top-left.
 *
 * @param {HTMLImageElement} img
 * @returns {ImageData}
 */
function getImageData(img) {
    const canvas = document.createElement("canvas");
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // willReadFrequently keeps the pixels CPU-side, which is faster for getImageData
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    // No smoothing: every source pixel must stay an exact, unblended color
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Convenience: File -> { width, height, data }.
 * This is what pixel_parser.js will consume.
 *
 * @param {File} file
 * @returns {Promise<{width:number, height:number, data:Uint8ClampedArray, image:HTMLImageElement}>}
 */
async function loadMapImage(file) {
    const image = await loadImageFromFile(file);
    const { width, height, data } = getImageData(image);
    return { width, height, data, image };
}

/**
 * Reads one pixel from the loaded data.
 *
 * @returns {{r:number, g:number, b:number, a:number}}
 */
function getPixel(data, width, x, y) {
    const i = (y * width + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

/**
 * Shows the loaded image on a visible canvas
 * so you can confirm the right file loaded.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement} img
 * @param {number} scale 
 */
function drawPreview(canvas, img, maxSize = 640) {
    // Largest whole-number scale that fits, minimum 1 (whole numbers keep pixels crisp)
    const scale = Math.max(1, Math.floor(maxSize / Math.max(img.naturalWidth, img.naturalHeight)));

    canvas.width  = img.naturalWidth  * scale;
    canvas.height = img.naturalHeight * scale;

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false; // keep pixels sharp when enlarged
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}
