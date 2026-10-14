import { applyMixins } from "../mixins.ts";
import { RecipesBase } from "./base.ts";
import { HolesRecipes } from "./holes.ts";
import { InsertsRecipes } from "./inserts.ts";
import { FeaturesRecipes } from "./features.ts";
import { JointsRecipes } from "./joints.ts";

export class PlasticityRecipes extends RecipesBase {}
export interface PlasticityRecipes extends HolesRecipes, InsertsRecipes, FeaturesRecipes, JointsRecipes {}
applyMixins(PlasticityRecipes, [HolesRecipes, InsertsRecipes, FeaturesRecipes, JointsRecipes]);

export * from "./errors.ts";
export * from "./types.ts";
export * from "./helpers.ts";
