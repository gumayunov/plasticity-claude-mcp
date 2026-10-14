import { z } from "zod";
import { boundsCenter, quaternionFromXyzDegrees, rotateBoundsAroundPivot, unionBounds } from "../../plasticity/print-orientation.ts";
import { SplitSolidToVolumeRecipe } from "../../plasticity/split-solid-to-volume.ts";
import { PrintedThreadRecipes } from "../../plasticity/printed-thread-recipes.ts";
import { type RuntimeState } from "../../plasticity/runtime.ts";
import { resolveFastenerDesignation } from "../../fasteners/designation.ts";
import { printedThreadQualificationFilterSchema, printedThreadQualificationInputSchema, printedThreadQualificationMatchSchema } from "../../printing/thread-qualification.ts";
import { vector, positiveVector, revision, intent } from "../schemas/common.ts";
import { splitSolidToVolumeInputSchema, printedExternalThreadInputSchema, printedInternalThreadInputSchema, printedHexNutInputSchema, printedHexScrewInputSchema, printedHexPairInputSchema, printedThreadCalibrationInputSchema } from "../schemas/printing.ts";
import type { ToolContext } from "../context.ts";

export function registerPrintingTools(ctx: ToolContext): void {
  const { session, threadQualifications, tool, journaled } = ctx;
  tool("plasticity_record_printed_thread_qualification", "Persist an immutable physically tested rounded-print-v1 thread fit for one exact printer, material, slicer profile, nozzle, layer height, orientation, and thread definition. Requires explicit confirmation that a real specimen completed full-travel testing; geometric interference checks alone are not accepted. Repeating the same record is idempotent.", printedThreadQualificationInputSchema, async (input) =>
    await threadQualifications.record(input), false, { destructiveHint: false });
  tool("plasticity_list_printed_thread_qualifications", "List immutable local physical thread-fit qualifications, optionally filtered by printer, material, slicer profile, rounded thread dimensions, handedness, or fit class. This registry is available without Workbench and contains no inferred or geometry-only passes.", printedThreadQualificationFilterSchema, async (filter) =>
    ({ source: "immutable-local-physical-test-registry", records: await threadQualifications.list(filter) }), true);
  tool("plasticity_match_printed_thread_qualification", "Find a physical rounded-print-v1 thread-fit qualification for an exact process and thread definition. A record is eligible only when its tested engagement is at least the requested engagement. Conflicting qualified clearances return ambiguous and are never selected silently.", printedThreadQualificationMatchSchema, async (query) =>
    await threadQualifications.match(query), true);
  tool("plasticity_create_printed_external_thread", "Create a standalone exact one-start rounded thread intended for a matched printed part. It creates and preserves a native Helix, forms the ridge with Pipe and Boolean, and clips the result to the explicit crest diameter and length. Nominal diameter is geometry only: this rounded-print profile is not an ISO metric thread and needs printer/material/profile-qualified depth and pitch.", printedExternalThreadInputSchema, async ({ intent: purpose, ...input }) =>
    await journaled("recipe-printed-external-thread", purpose, input, () => new PrintedThreadRecipes(session.get()).createExternalThread(input)));
  tool("plasticity_cut_printed_internal_thread", "Cut an exact one-start rounded internal thread into one current Solid for a matched printed external thread. The bore, helical groove, normal profile clearance, material depth and overshoot are explicit. This custom rounded-print profile is not an ISO tap and must not be assumed compatible from an M designation alone.", printedInternalThreadInputSchema, async ({ intent: purpose, ...input }) =>
    await journaled("recipe-printed-internal-thread", purpose, input, () => new PrintedThreadRecipes(session.get()).cutInternalThread(input)));
  tool("plasticity_create_printed_hex_nut", "Create an exact extruded hex nut with a matched one-start rounded internal print thread. Across-flats size, thickness, minimum remaining wall, pitch, depth and normal profile clearance are explicit; the source hex Wire and Helix remain editable. It is a custom printed mating part, not an ISO nut unless a separate verified standard-profile workflow is used.", printedHexNutInputSchema, async ({ intent: purpose, ...input }) =>
    await journaled("recipe-printed-hex-nut", purpose, input, () => new PrintedThreadRecipes(session.get()).createHexNut(input)));
  tool("plasticity_create_printed_hex_screw", "Create an exact wrenchable hex-head screw with a standalone one-start rounded print thread. The thread is clipped to its explicit crest envelope and joined to an overlapping hex head; the source head Wire and Helix remain editable. This is a custom matched print profile and is not ISO metric hardware solely because its crest diameter is named M5 or similar.", printedHexScrewInputSchema, async ({ intent: purpose, ...input }) =>
    await journaled("recipe-printed-hex-screw", purpose, input, () => new PrintedThreadRecipes(session.get()).createHexScrew(input)));
  tool("plasticity_create_printed_hex_pair", "Create a complete matched printable hex screw and nut from a designation such as 'printed M5x10 pair'. The designation supplies only crest diameter and screw thread length; pitch, rounded-profile depth, normal clearance, head and nut envelopes remain explicit and shared. Printer, material, slicer profile, nozzle, layer height, orientation, clearance evidence and sizing basis are recorded. An optional immutable physical qualification ID is checked against the exact process, thread definition, clearance, and required engagement before mutation. Without it, the result remains marked as requiring a physical fit test. This custom rounded-print-v1 pair is not ISO metric hardware.", printedHexPairInputSchema, async ({ designation, process, sizingBasis, qualificationId, intent: purpose, ...input }) => {
    const resolved = resolveFastenerDesignation({
      designation,
      jointIntent: "printed-threaded-pair",
      mountingIntent: "fixed",
      analysisIntent: "geometry",
      decisionMode: "agent-may-select-qualified",
    });
    const nominalDiameterMm = resolved.thread.nominalDiameterMm;
    const threadLengthMm = resolved.lengthMm;
    if (resolved.issues.some((issue) => issue.code === "JOINT_INTENT_CONFLICT")) {
      throw new Error("Printed pair designation conflicts with a different receiving feature; resolve the joint intent before modifying CAD");
    }
    if (resolved.standard !== undefined) {
      throw new Error("Printed pair designation must not name an ISO, DIN, or GOST hardware standard; this tool creates only a custom rounded-print pair");
    }
    if (nominalDiameterMm === undefined || threadLengthMm === undefined || resolved.ambiguousTrailingValueMm !== undefined) {
      throw new Error("Printed pair designation must contain an unambiguous M-like crest diameter and screw length, for example M5x10");
    }
    if (resolved.thread.pitchMm !== undefined && Math.abs(resolved.thread.pitchMm - input.pitchMm) > 1e-9) {
      throw new Error(`Printed pair designation pitch ${resolved.thread.pitchMm} mm does not match the explicit custom profile pitch ${input.pitchMm} mm`);
    }
    let fitQualification: { status: "requires-physical-fit-test" } | { status: "user-qualified-physical-fit"; recordId: string; fitClass: string; testedEngagementLengthMm: number; cyclesCompleted: number } = { status: "requires-physical-fit-test" };
    if (qualificationId !== undefined) {
      const qualification = await threadQualifications.get(qualificationId);
      if (!qualification) throw new Error(`Unknown printed-thread qualification ID: ${qualificationId}`);
      const requiredEngagementLengthMm = Math.min(threadLengthMm, input.nutThicknessMm);
      const matching = await threadQualifications.match({
        process,
        thread: {
          profile: "rounded-print-v1",
          nominalCrestDiameterMm: nominalDiameterMm,
          pitchMm: input.pitchMm,
          threadDepthMm: input.threadDepthMm,
          handedness: input.handedness,
        },
        requiredEngagementLengthMm,
      });
      if (!matching.records.some((record) => record.id === qualificationId)) {
        throw new Error(`Printed-thread qualification ${qualificationId} does not match the exact process, thread definition, or required ${requiredEngagementLengthMm} mm engagement`);
      }
      if (Math.abs(qualification.profileClearanceMm - input.profileClearanceMm) > 1e-9) {
        throw new Error(`Printed-thread qualification clearance ${qualification.profileClearanceMm} mm does not match the requested ${input.profileClearanceMm} mm`);
      }
      fitQualification = {
        status: "user-qualified-physical-fit",
        recordId: qualification.id,
        fitClass: qualification.fitClass,
        testedEngagementLengthMm: qualification.testedEngagementLengthMm,
        cyclesCompleted: qualification.cyclesCompleted,
      };
    }
    const pair = await journaled("recipe-printed-hex-pair", purpose, { designation, nominalDiameterMm, threadLengthMm, process, sizingBasis, qualificationId, ...input }, () =>
      new PrintedThreadRecipes(session.get()).createHexPair({ ...input, nominalDiameterMm, threadLengthMm }));
    return {
      ...pair,
      designation: {
        original: designation,
        normalizedCustomDesignation: `custom-rounded Ø${nominalDiameterMm}×P${input.pitchMm}×L${threadLengthMm}`,
        nominalCrestDiameterMm: nominalDiameterMm,
        threadLengthMm,
      },
      process,
      sizingBasis,
      fitQualification,
    };
  });
  tool("plasticity_create_printed_thread_calibration_set", "Create one custom rounded-print-v1 hex screw and 2-8 separate hex nuts with explicit, unique normal profile clearances. Use this process-specific clearance ladder before choosing the working fit for a printer, material, slicing profile, and orientation. The result remains unqualified until the specimens are physically printed and tested; it is not ISO metric hardware even when the crest diameter is written like M5.", printedThreadCalibrationInputSchema, async ({ designation, process, sizingBasis, intent: purpose, ...input }) => {
    const resolved = resolveFastenerDesignation({
      designation,
      jointIntent: "printed-threaded-pair",
      mountingIntent: "fixed",
      analysisIntent: "geometry",
      decisionMode: "agent-may-select-qualified",
    });
    const nominalDiameterMm = resolved.thread.nominalDiameterMm;
    const threadLengthMm = resolved.lengthMm;
    if (resolved.issues.some((issue) => issue.code === "JOINT_INTENT_CONFLICT")) {
      throw new Error("Printed calibration designation conflicts with a different receiving feature; resolve the joint intent before modifying CAD");
    }
    if (resolved.standard !== undefined) {
      throw new Error("Printed calibration designation must not name an ISO, DIN, or GOST hardware standard; this tool creates only a custom rounded-print calibration set");
    }
    if (nominalDiameterMm === undefined || threadLengthMm === undefined || resolved.ambiguousTrailingValueMm !== undefined) {
      throw new Error("Printed calibration designation must contain an unambiguous M-like crest diameter and screw length, for example M5x10");
    }
    if (resolved.thread.pitchMm !== undefined && Math.abs(resolved.thread.pitchMm - input.pitchMm) > 1e-9) {
      throw new Error(`Printed calibration designation pitch ${resolved.thread.pitchMm} mm does not match the explicit custom profile pitch ${input.pitchMm} mm`);
    }
    const calibration = await journaled("recipe-printed-thread-calibration-set", purpose, { designation, nominalDiameterMm, threadLengthMm, process, sizingBasis, ...input }, () =>
      new PrintedThreadRecipes(session.get()).createCalibrationSet({ ...input, nominalDiameterMm, threadLengthMm }));
    return {
      ...calibration,
      designation: {
        original: designation,
        normalizedCustomDesignation: `custom-rounded Ø${nominalDiameterMm}×P${input.pitchMm}×L${threadLengthMm}`,
        nominalCrestDiameterMm: nominalDiameterMm,
        threadLengthMm,
      },
      process,
      sizingBasis,
      selectionInstruction: "Physically print the complete set with exactly this process, test full screw travel and the intended reuse/load behavior, then record the selected sample ID and profile clearance in the manufacturing profile before creating production geometry.",
    };
  });
  tool("plasticity_orient_bodies_for_print", "Apply a Workbench workbench_assess_printability rotationDeg to one or more exact native Solids as one rigid group in one Plasticity history step, around the union B-Rep bounding-box center. Pass the same expectedSizeMm from that DFM result; the tool refuses a rotation whose predicted group bounds disagree with it, then returns actual native group bounds and verification status. The orientation is rotation about X, then Y, then Z (Workbench Euler XYZ convention); it does not split the bodies or prove slicer fit, so re-run DFM and slicing afterward.", z.object({
    bodyIds: z.array(z.number().int().positive()).min(1).max(64).refine((values) => new Set(values).size === values.length, "Body IDs must be unique"),
    rotationDeg: vector.refine((angles) => angles.every((angle) => Math.abs(angle) <= 360), "Rotation angles must be within ±360 degrees"),
    expectedSizeMm: positiveVector,
    intent,
    revision,
  }).strict(), async ({ bodyIds, rotationDeg, expectedSizeMm, intent: purpose, revision: current }) => {
    const operations = session.get();
    const before = await operations.state();
    if (before.revision !== current) throw new Error(`Stale reference: expected revision ${current}, current revision is ${before.revision}`);
    const bodies = bodyIds.map((id) => before.bodies.find((candidate) => candidate.id === id));
    if (bodies.some((body) => !body || body.type !== "Solid" || !body.boundsMm)) throw new Error("Print orientation requires current bounded native Solids for every body ID");
    const beforeBounds = unionBounds(bodies.map((body) => body!.boundsMm!));
    const pivotMm = boundsCenter(beforeBounds);
    const quaternion = quaternionFromXyzDegrees(rotationDeg);
    if (Math.hypot(quaternion[0], quaternion[1], quaternion[2]) < 1e-12) throw new Error("Print orientation is zero; no CAD mutation is required");
    const expectedBoundsMm = rotateBoundsAroundPivot(beforeBounds, pivotMm, quaternion);
    const predictedSizeMm = expectedBoundsMm.max.map((value, axis) => value - expectedBoundsMm.min[axis]!) as [number, number, number];
    const dfmSizeMatches = predictedSizeMm.every((value, axis) => Math.abs(value - expectedSizeMm[axis]!) <= 0.01);
    if (!dfmSizeMatches) throw new Error(`Workbench orientation does not match these exact Solids: predicted ${predictedSizeMm.join(" × ")} mm, DFM reported ${expectedSizeMm.join(" × ")} mm`);
    let reconciled: RuntimeState | undefined;
    await journaled("orient-bodies-for-print", purpose, { bodyIds, rotationDeg, expectedSizeMm, pivotMm },
      () => operations.rotateBodiesByXyz(bodyIds, pivotMm, rotationDeg, current), (_, state) => { reconciled = state; });
    if (!reconciled) throw new Error("Print orientation completed without a captured scene snapshot; reconcile the construction journal before retrying");
    const after: RuntimeState = reconciled;
    const actualBodies = bodyIds.map((id) => after.bodies.find((candidate) => candidate.id === id));
    if (actualBodies.some((body) => !body || body.type !== "Solid" || !body.boundsMm)) throw new Error("An oriented Solid is missing from the current native B-Rep state");
    const measuredBoundsMm = unionBounds(actualBodies.map((body) => body!.boundsMm!));
    const deviationsMm = measuredBoundsMm.min.map((value, axis) => Math.max(
      Math.abs(value - expectedBoundsMm.min[axis]!),
      Math.abs(measuredBoundsMm.max[axis]! - expectedBoundsMm.max[axis]!),
    )) as [number, number, number];
    const maxDeviationMm = Math.max(...deviationsMm);
    return {
      status: maxDeviationMm <= 0.01 ? "verified" : "bounds-mismatch",
      measurementSource: "native-brep",
      bodyIds,
      documentToken: after.documentToken,
      revision: after.revision,
      rotationDeg,
      pivotMm,
      expectedBoundsMm,
      measuredBoundsMm,
      expectedSizeMm,
      measuredSizeMm: measuredBoundsMm.max.map((value, axis) => value - measuredBoundsMm.min[axis]!) as [number, number, number],
      deviationsMm,
      toleranceMm: 0.01,
      maxDeviationMm,
      slicerFitVerified: false,
      message: maxDeviationMm <= 0.01
        ? "Native B-Rep group bounds match the Workbench orientation; re-assess and slice this exact geometry before creating print approval."
        : "Plasticity applied the requested group orientation, but native bounds differ from the predicted result; inspect the geometry and do not repeat the command automatically.",
    };
  });
  tool("plasticity_split_solid_to_build_volume", "After orienting a current Solid to the printer's world X/Y/Z axes, split it into an even grid sized from its exact native B-Rep bounds and the selected profile's usable build volume in millimeters. The tool derives world-space cut planes, performs the bounded native multi-plane recipe, validates exact total volume and native Solids, and verifies every result's exact bounds fit the usable volume within 0.01 mm. It does not rotate the part or create assembly joints; a failed operation can leave confirmed earlier cuts, so inspect the revision and scene before continuing.", splitSolidToVolumeInputSchema, async (input) =>
    await journaled("split-solid-to-build-volume", input.intent, input, () => new SplitSolidToVolumeRecipe(session.get()).split(input)));
}
