import { mutationOutcomeIsUncertain } from "../runtime.ts";
import { type RecipeStep } from "./types.ts";

export class CountersinkRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Countersink recipe failed after ${completedSteps.length}/4 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "CountersinkRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class CountersinkPatternRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Countersink pattern recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "CountersinkPatternRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class HexNutPocketRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Hex nut pocket recipe failed after ${completedSteps.length}/3 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "HexNutPocketRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class HexNutPocketPatternRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Hex nut pocket pattern recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "HexNutPocketPatternRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class SlottedHoleRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Slotted hole recipe failed after ${completedSteps.length}/5 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "SlottedHoleRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class SlottedHolePatternRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Slotted hole pattern recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "SlottedHolePatternRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class CounterboreRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Counterbore recipe failed after ${completedSteps.length}/3 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "CounterboreRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class CounterborePatternRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Counterbore pattern recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "CounterborePatternRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class ThroughHoleRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Through-hole recipe failed after ${completedSteps.length}/2 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "ThroughHoleRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class ThroughHolePatternRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Through-hole pattern recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "ThroughHolePatternRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class BlindHoleRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Blind-hole recipe failed after ${completedSteps.length}/2 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "BlindHoleRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class BlindHolePatternRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Blind-hole pattern recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "BlindHolePatternRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class HeatSetInsertPocketRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Heat-set insert pocket recipe failed after ${completedSteps.length}/4 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "HeatSetInsertPocketRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class HeatSetInsertPocketPatternRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Heat-set insert pocket pattern recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "HeatSetInsertPocketPatternRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class ScrewBossRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Screw boss recipe failed after ${completedSteps.length}/4 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "ScrewBossRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class ScrewBossPatternRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Screw boss pattern recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "ScrewBossPatternRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class RibRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Rib recipe failed after ${completedSteps.length}/3 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "RibRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class RoundVentArrayRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Round vent array recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "RoundVentArrayRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class CantileverSnapFitRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause) || (cause instanceof RibRecipeError && cause.uncertain);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Cantilever snap-fit recipe failed after ${completedSteps.length}/3 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "CantileverSnapFitRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class HingeBarrelRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Hinge barrel recipe failed after ${completedSteps.length}/4 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "HingeBarrelRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class CableChannelRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Cable channel recipe failed after ${completedSteps.length}/2 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "CableChannelRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class ConnectorOpeningRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Connector opening recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "ConnectorOpeningRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class MatingEnclosureJointRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Mating enclosure joint recipe failed after ${completedSteps.length}/8 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "MatingEnclosureJointRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class LocatingPinPairRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Locating pin pair recipe failed after ${completedSteps.length}/4 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "LocatingPinPairRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class LocatingPinPairPatternRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Locating pin pattern recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "LocatingPinPairPatternRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class SplitScrewInsertJointRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string, totalSteps: number) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Split screw-and-insert recipe failed after ${completedSteps.length}/${totalSteps} confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "SplitScrewInsertJointRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class TongueGrooveJointRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Tongue and groove joint recipe failed after ${completedSteps.length}/6 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "TongueGrooveJointRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}

export class DovetailJointRecipeError extends Error {
  readonly completedSteps: RecipeStep[];
  readonly lastConfirmedRevision: string;
  readonly uncertain: boolean;

  constructor(cause: unknown, completedSteps: RecipeStep[], lastConfirmedRevision: string) {
    const uncertain = mutationOutcomeIsUncertain(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const state = uncertain ? "the last native result is uncertain" : "partial geometry remains";
    super(`Dovetail joint recipe failed after ${completedSteps.length}/6 confirmed steps; ${state}; last confirmed revision ${lastConfirmedRevision}: ${detail}`, { cause });
    this.name = "DovetailJointRecipeError";
    this.completedSteps = [...completedSteps];
    this.lastConfirmedRevision = lastConfirmedRevision;
    this.uncertain = uncertain;
  }
}
