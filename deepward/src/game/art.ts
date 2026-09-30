import { CanvasTexture, SRGBColorSpace } from "three";

export const PALETTE = {
  wall: "#38504f", panel: "#263837", floor: "#18282c", steel: "#82918b", brass: "#cca46c",
  cyan: "#84e8d0", amber: "#eab379", danger: "#ee7361", ink: "#b69be0", black: "#0b171b",
};
/** Original Deepward signs and surface artwork. No asset fetches or external art. */
export function signTexture(title: string, subtitle: string, color = PALETTE.cyan): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768; canvas.height = 256;
  const c = canvas.getContext("2d");
  if (c === null) throw new Error("Deepward signage needs a canvas context");
  c.fillStyle = PALETTE.black; c.fillRect(0, 0, 768, 256);
  c.strokeStyle = color; c.lineWidth = 5; c.strokeRect(12, 12, 744, 232);
  c.fillStyle = color; c.fillRect(32, 40, 10, 170);
  c.font = "bold 54px monospace"; c.fillText(title, 65, 103);
  c.fillStyle = "#d5d9c9"; c.font = "27px monospace"; c.fillText(subtitle, 65, 169);
  c.fillStyle = color; c.font = "19px monospace"; c.fillText("BW / MAINTENANCE DIVISION", 65, 214);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  return texture;
}
