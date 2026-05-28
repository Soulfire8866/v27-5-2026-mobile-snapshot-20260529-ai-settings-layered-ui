import { registerPlugin } from "@capacitor/core";

export type NativeFileSaveResult = {
  cancelled: boolean;
  sessionId?: string;
  uri?: string;
  bytesWritten?: number;
  fileName?: string;
};

export interface NativeFileSavePlugin {
  startSave(options: {
    fileName: string;
    mimeType: string;
  }): Promise<NativeFileSaveResult>;
  writeChunk(options: { sessionId: string; base64Data: string }): Promise<{ written: number }>;
  finishSave(options: { sessionId: string }): Promise<{ ok: boolean }>;
  cancelSave(options: { sessionId: string }): Promise<void>;
  deleteFile(options: { uri: string }): Promise<{ ok: boolean }>;
}

export const NativeFileSave = registerPlugin<NativeFileSavePlugin>("NativeFileSave");
