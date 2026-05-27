import { registerPlugin } from "@capacitor/core";

export interface SystemChromePlugin {
  setSystemBars(options: { color: string; lightBarIcons: boolean }): Promise<void>;
}

export const SystemChrome = registerPlugin<SystemChromePlugin>("SystemChrome");
