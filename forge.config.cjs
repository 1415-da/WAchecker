// Electron Forge config
// - Uses your existing Electron entry: electron/main.js
// - Builds Vite output to dist/ (handled by npm run build)
//
// Windows .exe options:
// - maker-squirrel => creates a Windows installer (.exe)
// - maker-zip => creates a zipped portable app
//
// Note: Windows artifacts must be built on Windows (recommended) or via CI.

module.exports = {
  packagerConfig: {
    // You can set icon later, e.g. "assets/icon" (without extension)
    // icon: "assets/icon",
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        // Used in the installer metadata
        name: "WAchecker",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32", "darwin", "linux"],
    },
    {
      name: "@electron-forge/maker-deb",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
    },
  ],
};
