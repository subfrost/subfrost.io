import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { uploadSegment, uploadPlaylist } from "./storage";

const LOCAL_MODE = !!process.env.LOCAL_MODE;

export class Transcoder {
  private sessionId: string;
  private track: "screen" | "camera";
  private ffmpeg: ChildProcess | null = null;
  private outputDir: string;
  private watcher: fs.FSWatcher | null = null;
  private uploadedFiles: Set<string> = new Set();
  private stopped = false;

  constructor(sessionId: string, track: "screen" | "camera") {
    this.sessionId = sessionId;
    this.track = track;
    this.outputDir = `/tmp/segments/${sessionId}`;
    this.init();
  }

  private init(): void {
    // Ensure output directory exists
    fs.mkdirSync(this.outputDir, { recursive: true });

    const segmentPattern = path.join(this.outputDir, `${this.track}_%05d.ts`);
    const playlistPath = path.join(this.outputDir, `${this.track}_playlist.m3u8`);

    this.ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-tune", "zerolatency",
      "-c:a", "aac",
      "-b:a", "128k",
      "-f", "hls",
      "-hls_time", "4",
      "-hls_list_size", "10",
      "-hls_flags", "delete_segments+append_list",
      "-hls_segment_filename", segmentPattern,
      playlistPath,
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.ffmpeg.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        console.log(`[transcoder][${this.sessionId}][${this.track}] ${msg}`);
      }
    });

    this.ffmpeg.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        console.log(`[transcoder][${this.sessionId}][${this.track}] stdout: ${msg}`);
      }
    });

    this.ffmpeg.on("error", (err) => {
      console.error(`[transcoder][${this.sessionId}][${this.track}] ffmpeg error:`, err);
    });

    this.ffmpeg.on("close", (code) => {
      console.log(`[transcoder][${this.sessionId}][${this.track}] ffmpeg exited with code ${code}`);
      this.stopWatcher();
    });

    // Watch for new segments and playlist updates
    this.startWatcher();

    console.log(`[transcoder][${this.sessionId}][${this.track}] Started ffmpeg transcoder`);
  }

  private startWatcher(): void {
    // Small delay to let ffmpeg create the directory structure
    const checkAndWatch = () => {
      if (!fs.existsSync(this.outputDir)) {
        setTimeout(checkAndWatch, 500);
        return;
      }

      try {
        this.watcher = fs.watch(this.outputDir, (eventType, filename) => {
          if (!filename) return;

          // Only process files for this track
          if (!filename.startsWith(this.track)) return;

          const filePath = path.join(this.outputDir, filename);

          // Debounce: small delay to ensure file is fully written
          setTimeout(() => {
            this.handleFileChange(filename, filePath);
          }, 100);
        });

        this.watcher.on("error", (err) => {
          console.error(`[transcoder][${this.sessionId}][${this.track}] Watcher error:`, err);
        });
      } catch (err) {
        console.error(`[transcoder][${this.sessionId}][${this.track}] Failed to start watcher:`, err);
      }
    };

    checkAndWatch();
  }

  private async handleFileChange(filename: string, filePath: string): Promise<void> {
    try {
      if (!fs.existsSync(filePath)) return;

      if (filename.endsWith(".ts")) {
        // New segment file
        if (this.uploadedFiles.has(filename)) return;
        this.uploadedFiles.add(filename);

        console.log(`[transcoder][${this.sessionId}][${this.track}] New segment: ${filename}`);
        await uploadSegment(this.sessionId, this.track, filename, filePath);
      } else if (filename.endsWith(".m3u8")) {
        // Playlist updated
        console.log(`[transcoder][${this.sessionId}][${this.track}] Playlist updated: ${filename}`);
        await uploadPlaylist(this.sessionId, this.track, filePath);
      }
    } catch (err) {
      console.error(`[transcoder][${this.sessionId}][${this.track}] Upload error for ${filename}:`, err);
    }
  }

  private stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  write(chunk: Buffer): void {
    if (this.stopped) {
      console.warn(`[transcoder][${this.sessionId}][${this.track}] Cannot write: transcoder is stopped`);
      return;
    }

    if (this.ffmpeg?.stdin?.writable) {
      this.ffmpeg.stdin.write(chunk);
    } else {
      console.warn(`[transcoder][${this.sessionId}][${this.track}] ffmpeg stdin not writable`);
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    console.log(`[transcoder][${this.sessionId}][${this.track}] Stopping transcoder...`);

    return new Promise<void>((resolve) => {
      if (!this.ffmpeg) {
        this.stopWatcher();
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        console.warn(`[transcoder][${this.sessionId}][${this.track}] ffmpeg did not exit in time, killing`);
        this.ffmpeg?.kill("SIGKILL");
        this.stopWatcher();
        resolve();
      }, 10000);

      this.ffmpeg.on("close", () => {
        clearTimeout(timeout);
        this.stopWatcher();
        resolve();
      });

      // Close stdin to signal end of input
      if (this.ffmpeg.stdin) {
        this.ffmpeg.stdin.end();
      }
    });
  }
}
