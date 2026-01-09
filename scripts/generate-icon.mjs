// Script to convert SVG to ICO for Windows app icon
import sharp from "sharp";
import pngToIco from "png-to-ico";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgPath = path.join(__dirname, "..", "public", "logo-alt.svg");
const outputDir = path.join(__dirname, "..", "assets");
const pngPath = path.join(outputDir, "icon.png");
const icoPath = path.join(outputDir, "icon.ico");

async function generateIcon() {
  // Ensure assets directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("Converting SVG to PNG...");
  
  // Convert SVG to PNG at 256x256 (standard Windows icon size)
  await sharp(svgPath)
    .resize(256, 256)
    .png()
    .toFile(pngPath);

  console.log("Converting PNG to ICO...");
  
  // Convert PNG to ICO
  const icoBuffer = await pngToIco([pngPath]);
  fs.writeFileSync(icoPath, icoBuffer);

  console.log(`✅ Icon generated at: ${icoPath}`);
}

generateIcon().catch(console.error);
