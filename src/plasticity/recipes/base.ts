import { type RecipeOperations } from "./types.ts";

export abstract class RecipesBase {
  protected readonly operations: RecipeOperations;

  constructor(operations: RecipeOperations) {
    this.operations = operations;
  }
}
