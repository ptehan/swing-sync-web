// gifUtils.js
// Handles GIF generation with gif.js.optimized
// Generates both highlighted (with flash) and raw (no overlay) versions

import GIF from "gif.js.optimized";

// Convert blob to base64 for persistence
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result); // reader.result is a base64 data URL
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate a GIF from a video file.
 *
 * @param {File} videoFile - input video file
 * @param {Object} options
 *   startFrame (number): first frame to capture
 *   endFrame (number): last frame to capture
 *   fps (number): frames per second (default: 30)
 *   highlight (boolean): whether to overlay flash at swing start
 *   swingStartFrame (number): frame to highlight (required if highlight=true)
 *   zoom (number): scale factor for output size (default: 1)
 *   scale (number): base scale reduction (default: 0.5)
 * @returns {Promise<string>} - resolves to base64-encoded GIF string
 */
export function generateGif(videoFile, {
  startFrame,
  endFrame,
  fps = 30,
  highlight = false,
  swingStartFrame = null,
  zoom = 1,
  scale = 0.5
}) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(videoFile);

    video.onloadedmetadata = () => {
      const fullW = video.videoWidth;
      const fullH = video.videoHeight;

      // Apply base scale and zoom
      const outW = Math.round(fullW * scale * zoom);
      const outH = Math.round(fullH * scale * zoom);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = outW;
      canvas.height = outH;

      const gif = new GIF({
        workers: 2,
        quality: 10,
        width: outW,
        height: outH,
      });

      let currentFrame = startFrame;

      function captureNext() {
        if (currentFrame > endFrame) {
          gif.addFrame(ctx, { copy: true, delay: 1000 }); // pause at end
          gif.render();
          return;
        }

        video.currentTime = currentFrame / fps;
        video.onseeked = () => {
          ctx.drawImage(video, 0, 0, outW, outH);

          // Highlight swing start
          if (highlight && swingStartFrame !== null &&
              currentFrame >= swingStartFrame && currentFrame < swingStartFrame + 3) {
            ctx.fillStyle = "rgba(255, 0, 0, 0.6)"; // stronger red flash
            ctx.fillRect(0, 0, outW, outH);
          }

          gif.addFrame(ctx, { copy: true, delay: 1000 / fps });
          currentFrame++;
          setTimeout(captureNext, 20);
        };
      }

      gif.on("finished", async (blob) => {
        try {
          const base64 = await blobToBase64(blob);
          resolve(base64);
        } catch (err) {
          reject(err);
        }
      });

      captureNext();
    };

    video.onerror = reject;
  });
}

/**
 * Generate both versions (highlighted + raw).
 *
 * @param {File} videoFile
 * @param {Object} options - same as generateGif, must include swingStartFrame
 * @returns {Promise<{ highlighted: string, raw: string }>}
 */
export async function generateBothGifs(videoFile, options) {
  const raw = await generateGif(videoFile, { ...options, highlight: false });
  const highlighted = await generateGif(videoFile, { ...options, highlight: true });
  return { raw, highlighted };
}
