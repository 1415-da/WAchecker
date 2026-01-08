import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("waChecker", {
  // For now we keep the renderer calling the backend via HTTP.
  // This hook just helps prove preload is wired.
  ping: () => "pong",
});
