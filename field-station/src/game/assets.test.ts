import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AnimationClip, AnimationMixer, Bone, Box3, Texture } from "three";
import { cloneModelScene } from "@jgengine/shell/render/modelRender";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { classifyAssetResponse } from "@jgengine/core/scene/assetDiagnostics";
import { validateAssetSpace } from "@jgengine/core/scene/assetSpace";

import { assets, assetCredits, FIELD_RESEARCHER_ASSET_ID } from "./assets";
import researcher from "./researcher.asset.json";

const bytes = readFileSync(new URL("../../public/models/explorer.glb", import.meta.url));
const glbJson = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());

describe("Field Station committed researcher", () => {
  test("clean checkout resolves real model bytes with embedded resources and credit", () => {
    const model = assets.resolve(FIELD_RESEARCHER_ASSET_ID)!;
    const diagnosis = classifyAssetResponse({ url: model.url, logicalId: FIELD_RESEARCHER_ASSET_ID, status: 200, contentType: "model/gltf-binary", bytes });
    expect(diagnosis.ok).toBe(true);
    expect(model.url).toBe("/models/explorer.glb");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(researcher.sha256);
    expect(bytes.length).toBeLessThan(600_000);
    expect(glbJson.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(true);
    expect(glbJson.images.every((image: { bufferView?: number }) => image.bufferView !== undefined)).toBe(true);
    expect(glbJson.images.length).toBe(1);
    expect(glbJson.skins.length).toBe(1);
    expect(glbJson.nodes.some((node: { skin?: number }) => node.skin === 0)).toBe(true);
    expect(glbJson.nodes.map((node: { name: string }) => node.name)).not.toContain("Knife");
    expect(glbJson.nodes.map((node: { name: string }) => node.name)).not.toContain("Knife_Offhand");
    expect(glbJson.nodes.map((node: { name: string }) => node.name)).not.toContain("1H_Crossbow");
    expect(glbJson.nodes.map((node: { name: string }) => node.name)).not.toContain("2H_Crossbow");
    expect(glbJson.nodes.map((node: { name: string }) => node.name)).not.toContain("Throwable");
    expect(glbJson.nodes.map((node: { name: string }) => node.name)).not.toContain("Rogue_Cape");
    expect(glbJson.nodes.filter((node: { mesh?: number; skin?: number }) => node.mesh !== undefined && node.skin === 0).map((node: { name: string }) => node.name).sort()).toEqual([
      "Rogue_ArmLeft", "Rogue_ArmRight", "Rogue_Body", "Rogue_Head", "Rogue_LegLeft", "Rogue_LegRight",
    ]);
    expect(glbJson.animations.map((animation: { name: string }) => animation.name)).toEqual(model.clips);
    expect(validateAssetSpace(model.space)).toEqual([]);
    expect(assetCredits.sections[0]?.entries[0]?.href).toBe(researcher.source.homepage);
  });

  test("render loader geometry agrees with catalog dimensions and grounded authoring", async () => {
    const loader = new GLTFLoader();
    loader.register(() => ({ name: "bounds-test", loadTexture: async () => new Texture() }));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const model = await loader.parseAsync(buffer, "");
    model.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model.scene, true);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(researcher.dims.maxY - researcher.dims.minY, 4);
    expect(bounds.min.y).toBeCloseTo(0, 4);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(researcher.dims.footprint.w, 4);
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(researcher.dims.footprint.d, 4);
    expect(model.animations.map((clip) => clip.name)).toEqual(researcher.clips);
  });

  test("movement clips preserve authored scale and grounded asset bounds", async () => {
    const loader = new GLTFLoader();
    loader.register(() => ({ name: "pose-test", loadTexture: async () => new Texture() }));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const model = await loader.parseAsync(buffer, "");
    const authoredHeight = researcher.dims.maxY - researcher.dims.minY;
    for (const name of ["Idle", "Walking_A", "Running_A"]) {
      const scene = cloneModelScene(model.scene);
      const bones: Bone[] = [];
      scene.traverse((node) => { if (node instanceof Bone) bones.push(node); });
      const root = bones[0]!;
      const rootBindPosition = root.position.clone();
      const authorScale = scene.children[0]!.scale.toArray();
      const clip = AnimationClip.findByName(model.animations, name)!;
      const mixer = new AnimationMixer(scene);
      const action = mixer.clipAction(clip);
      action.paused = true;
      action.weight = 1;
      action.play();
      for (let frame = 0; frame < 32; frame++) {
        action.time = clip.duration * frame / 32;
        mixer.update(0);
        // The published graph driver removes clip root translation after sampling.
        root.position.copy(rootBindPosition);
        scene.updateMatrixWorld(true);
        const posed = new Box3().setFromObject(scene, true);
        const height = posed.max.y - posed.min.y;
        expect(height).toBeGreaterThan(authoredHeight * 0.9);
        expect(height).toBeLessThan(authoredHeight * 1.05);
        expect(posed.min.y).toBeGreaterThan(-0.03);
        expect(posed.min.y).toBeLessThan(0.1);
        expect(scene.children[0]!.scale.toArray()).toEqual(authorScale);
      }
      mixer.stopAllAction();
    }
  });
});
