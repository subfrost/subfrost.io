import { Storage } from "@google-cloud/storage";

const LOCAL_MODE = !!process.env.LOCAL_MODE;
const GCS_BUCKET = process.env.GCS_BUCKET || "subfrost-live-streams";

let storage: Storage;
let bucket: ReturnType<Storage["bucket"]>;

if (!LOCAL_MODE) {
  storage = new Storage();
  bucket = storage.bucket(GCS_BUCKET);
}

export async function uploadSegment(
  sessionId: string,
  track: string,
  filename: string,
  localPath: string
): Promise<void> {
  const destination = `live/${sessionId}/${track}/${filename}`;

  if (LOCAL_MODE) {
    console.log(`[storage] LOCAL_MODE: would upload segment ${localPath} → gs://${GCS_BUCKET}/${destination}`);
    return;
  }

  await bucket.upload(localPath, {
    destination,
    metadata: {
      contentType: "video/MP2T",
      cacheControl: "max-age=86400",
    },
  });

  console.log(`[storage] Uploaded segment: ${destination}`);
}

export async function uploadPlaylist(
  sessionId: string,
  track: string,
  localPath: string
): Promise<void> {
  const destination = `live/${sessionId}/${track}/playlist.m3u8`;

  if (LOCAL_MODE) {
    console.log(`[storage] LOCAL_MODE: would upload playlist ${localPath} → gs://${GCS_BUCKET}/${destination}`);
    return;
  }

  await bucket.upload(localPath, {
    destination,
    metadata: {
      contentType: "application/vnd.apple.mpegurl",
      cacheControl: "max-age=2",
    },
  });

  console.log(`[storage] Uploaded playlist: ${destination}`);
}
