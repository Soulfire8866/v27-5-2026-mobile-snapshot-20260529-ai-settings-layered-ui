import { Capacitor } from "@capacitor/core";
import { NativeFileSave } from "../plugins/nativeFileSave";
import { trackExportedFile } from "./exportedFilesRegistry";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Không thể chuyển blob sang base64."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Lỗi đọc blob."));
    reader.readAsDataURL(blob);
  });
}

const NATIVE_SAVE_CHUNK_BYTES = 128 * 1024;

export async function saveBlobWithNativeFallback(
  blob: Blob,
  fileName: string,
  mimeType: string
): Promise<{ cancelled: boolean; saved: boolean; uri?: string; bytesWritten?: number }> {
  if (Capacitor.isNativePlatform()) {
    const start = await NativeFileSave.startSave({ fileName, mimeType });
    if (start.cancelled || !start.sessionId) {
      return { cancelled: true, saved: false };
    }
    const sessionId = start.sessionId;
    let writtenTotal = 0;
    try {
      let offset = 0;
      while (offset < blob.size) {
        const next = Math.min(blob.size, offset + NATIVE_SAVE_CHUNK_BYTES);
        const chunk = blob.slice(offset, next);
        const base64Data = await blobToBase64(chunk);
        const res = await NativeFileSave.writeChunk({ sessionId, base64Data });
        writtenTotal += Math.max(0, Number(res?.written) || 0);
        offset = next;
      }
      await NativeFileSave.finishSave({ sessionId });
      if (start.uri) {
        try {
          await trackExportedFile({
            fileName,
            mimeType,
            bytesWritten: writtenTotal,
            uri: start.uri,
          });
        } catch (trackErr) {
          console.warn("[native-file-save] cannot track exported file", trackErr);
        }
      }
      return { cancelled: false, saved: true, uri: start.uri, bytesWritten: writtenTotal };
    } catch (err) {
      try {
        await NativeFileSave.cancelSave({ sessionId });
      } catch {
        // ignore secondary error
      }
      throw err;
    }
  }

  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    try {
      const handle = await (window as Window & {
        showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Tệp tải xuống",
            accept: { [mimeType]: [`.${fileName.split(".").pop() || "bin"}`] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { cancelled: false, saved: true, bytesWritten: blob.size };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { cancelled: true, saved: false };
      }
      console.warn("[native-file-save] showSaveFilePicker failed", err);
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return { cancelled: false, saved: true, bytesWritten: blob.size };
}

export async function deleteNativeExportedFile(uri: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }
  if (!uri || !uri.trim()) {
    return false;
  }
  try {
    const res = await NativeFileSave.deleteFile({ uri });
    return !!res?.ok;
  } catch (err) {
    console.warn("[native-file-save] delete failed", err);
    return false;
  }
}
