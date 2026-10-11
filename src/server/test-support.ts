import { createServer as createPlasticityServer, type ServerOptions, type SessionLike } from "../server.ts";
import type { RuntimeState } from "../plasticity/runtime.ts";
import { PrintedThreadQualificationStore } from "../printing/thread-qualification.ts";
import { StepImportReferenceStore } from "../plasticity/import-reference-store.ts";
import type { MaterialCouponQualificationInput } from "../strength/material-qualification.ts";

export const createServer = (
  session?: SessionLike,
  strength?: Parameters<typeof createPlasticityServer>[1],
  qualifications?: PrintedThreadQualificationStore,
  references?: StepImportReferenceStore,
  options?: ServerOptions,
) => createPlasticityServer(session, strength, qualifications, references, null, undefined, options);

export function cohesiveCouponInput(process: MaterialCouponQualificationInput["process"], modulus: number): MaterialCouponQualificationInput {
  const properties = { youngModulusMPa: modulus, shearModulusMPa: 800, tensileStrengthMPa: 30, shearStrengthMPa: 20 };
  const keys = Object.entries(properties) as Array<[keyof typeof properties, number]>;
  const evidence = keys.map(([key, value], index) => ({
    id: `cohesive-coupon-${modulus}-${index}`, label: key, status: "measured" as const, value, unit: "MPa" as const,
    sourceUrl: "https://example.test/coupon.pdf", sourceHash: `${index + 1}`.repeat(64), sourceLocator: `coupon.pdf!${key}`, dependsOn: [],
  }));
  return {
    process, properties,
    propertyEvidence: {
      youngModulusMPa: [evidence[0]!.id], shearModulusMPa: [evidence[1]!.id],
      tensileStrengthMPa: [evidence[2]!.id], shearStrengthMPa: [evidence[3]!.id],
    },
    evidence, testStandard: "ISO-527", specimenCount: 5, testedAt: "2026-09-24T10:00:00.000Z",
    source: "physical-coupon-test", callerConfirmsPhysicalTests: true,
  };
}

export function unavailableConstruction() {
  return {
    constructionPlanes: { available: false, reason: "test" },
    activeWorkplane: { available: false, reason: "test" },
  };
}

export function parseToolJson(response: unknown): any {
  if (typeof response !== "object" || response === null || !("content" in response) || !Array.isArray(response.content)) throw new Error("Tool response has no content array");
  const item = response.content.find((entry): entry is { type: "text"; text: string } =>
    typeof entry === "object" && entry !== null && "type" in entry && entry.type === "text" && "text" in entry && typeof entry.text === "string");
  if (!item) throw new Error("Tool response has no JSON text");
  return JSON.parse(item.text);
}

export function emptyState(): RuntimeState {
  return {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [],
    construction: { planes: [], activePlaneId: null, planeStateToken: "p0", viewStateToken: "v0" }, bodies: [],
  };
}
