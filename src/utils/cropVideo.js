import { createFFmpeg } from "@ffmpeg/ffmpeg";

// fallback fetchFile if not bundled in your ffmpeg build
async function fetchFile(input) {
  if (input instanceof Blob || input instanceof File) {
    return new Uint8Array(await input.arrayBuffer());
  }
  if (typeof input === "string") {
    const res = await fetch(input);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error("Unsupported input type for fetchFile");
}

let ffmpeg;

export async function ensureFFmpeg() {
  if (!ffmpeg) {
    ffmpeg = createFFmpeg({ log: true });
    await ffmpeg.load();
  }
  return ffmpeg;
}

/**
 * Crop a video using ffmpeg.wasm
 * @param {File|Blob|string} inputFile
 * @param {{x:number,y:number,w:number,h:number}} crop
 * @returns {Promise<Blob>} cropped video blob
 */
export async function cropVideo(inputFile, crop) {
  const ffmpeg = await ensureFFmpeg();

  const inputName = "input.mp4";
  const outputName = "output.mp4";

  ffmpeg.FS("writeFile", inputName, await fetchFile(inputFile));

  const filter = `crop=${Math.round(crop.w)}:${Math.round(crop.h)}:${Math.round(
    crop.x
  )}:${Math.round(crop.y)}`;

  await ffmpeg.run("-i", inputName, "-vf", filter, "-c:a", "copy", outputName);

  const data = ffmpeg.FS("readFile", outputName);
  return new Blob([data.buffer], { type: "video/mp4" });
}
