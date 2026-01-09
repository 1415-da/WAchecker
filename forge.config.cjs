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
    // App icon (without extension - Electron Packager adds .ico on Windows)
    icon: "assets/icon",
    asar: true,
    // Ignore files/folders that shouldn't be packaged
    ignore: [
      /^\/src$/,
      /^\/public$/,
      /^\/scripts$/,
      /^\/\.git$/,
      /^\/\.vscode$/,
      /^\/node_modules\/\.cache/,
      /\.map$/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        // Used in the installer metadata
        name: "WAchecker",
        authors: "pro-khar",
        description: "WhatsApp Number Validator",
        // Icon for the installer and installed app
        iconUrl: "https://raw.githubusercontent.com/pro-khar/WAchecker/main/assets/icon.ico",
        setupIcon: "assets/icon.ico",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      // NOTE: Disabled for Windows because the current zip maker dependency
      // (cross-zip@4.0.1) is not compatible with newer Node.js versions.
      platforms: ["darwin", "linux"],
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
