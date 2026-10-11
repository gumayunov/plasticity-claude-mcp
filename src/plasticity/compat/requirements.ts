import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export interface Requirements { bindings: string[]; commands: string[] }
export interface RequirementsManifest { tools: Record<string, { methods: string[] } & Requirements> }

interface MutableRequirements { bindings: Set<string>; commands: Set<string>; calls: Set<string> }

const parse = (path: string) => ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const empty = (): MutableRequirements => ({ bindings: new Set(), commands: new Set(), calls: new Set() });

function collect(node: ts.Node, into: MutableRequirements): void {
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isPropertyAccessExpression(callee) && (callee.name.text === "mutate" || callee.name.text === "readNative")) {
      const list = node.arguments[1];
      if (list && ts.isArrayLiteralExpression(list)) for (const element of list.elements) if (ts.isStringLiteral(element)) into.bindings.add(element.text);
    }
    if (ts.isIdentifier(callee) && callee.text === "commandStart") {
      const first = node.arguments[0];
      if (first && ts.isStringLiteralLike(first)) into.commands.add(first.text);
    }
    if (ts.isIdentifier(callee)) into.calls.add(callee.text);
  }
  node.forEachChild((child) => collect(child, into));
}

function helperRequirements(paths: string[]): Map<string, MutableRequirements> {
  const result = new Map<string, MutableRequirements>();
  for (const path of paths) {
    for (const statement of parse(path).statements) {
      if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
      const requirements = result.get(statement.name.text) ?? empty();
      collect(statement, requirements);
      result.set(statement.name.text, requirements);
    }
  }
  return result;
}

function classMethods(paths: string[], visit: (method: ts.MethodDeclaration) => void): void {
  for (const path of paths) {
    for (const statement of parse(path).statements) {
      if (!ts.isClassDeclaration(statement)) continue;
      for (const member of statement.members) if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) visit(member);
    }
  }
}

function invokedMethods(node: ts.Node, out: { operations: Set<string>; recipes: Set<string> }): void {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const target = node.expression.expression;
    const name = node.expression.name.text;
    if (ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression) && target.expression.name.text === "get") out.operations.add(name);
    if (ts.isNewExpression(target) && ts.isIdentifier(target.expression) && target.expression.text === "PlasticityRecipes") out.recipes.add(name);
  }
  node.forEachChild((child) => invokedMethods(child, out));
}

function toolNames(statement: ts.Statement): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tool") {
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first)) names.push(first.text);
    }
    node.forEachChild(visit);
  };
  visit(statement);
  if (ts.isForOfStatement(statement) && ts.isArrayLiteralExpression(statement.expression.kind === ts.SyntaxKind.AsExpression ? (statement.expression as ts.AsExpression).expression : statement.expression)) {
    const list = (statement.expression.kind === ts.SyntaxKind.AsExpression ? (statement.expression as ts.AsExpression).expression : statement.expression) as ts.ArrayLiteralExpression;
    for (const element of list.elements) if (ts.isStringLiteral(element)) names.push(element.text);
  }
  return names;
}

export function extractRequirements(sources: { helpers: string[]; operations: string[]; recipes: string[]; tools: string[] }): RequirementsManifest {
  const helpers = helperRequirements(sources.helpers);
  const methods = new Map<string, Requirements>();
  classMethods(sources.operations, (method) => {
    const own = empty();
    collect(method, own);
    for (const call of own.calls) {
      const helper = helpers.get(call);
      if (!helper) continue;
      helper.bindings.forEach((name) => own.bindings.add(name));
      helper.commands.forEach((name) => own.commands.add(name));
    }
    methods.set((method.name as ts.Identifier).text, { bindings: [...own.bindings].sort(), commands: [...own.commands].sort() });
  });
  const recipes = new Map<string, Set<string>>();
  classMethods(sources.recipes, (method) => {
    const calls = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ts.isPropertyAccessExpression(node.expression.expression) && node.expression.expression.name.text === "operations"
        && node.expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword) calls.add(node.expression.name.text);
      node.forEachChild(visit);
    };
    visit(method);
    recipes.set((method.name as ts.Identifier).text, calls);
  });
  const tools: RequirementsManifest["tools"] = {};
  for (const path of sources.tools) {
    const visitStatements = (statements: ts.NodeArray<ts.Statement>): void => {
      for (const statement of statements) {
        if (ts.isFunctionDeclaration(statement) && statement.body) { visitStatements(statement.body.statements); continue; }
        const names = toolNames(statement);
        if (names.length === 0) continue;
        const invoked = { operations: new Set<string>(), recipes: new Set<string>() };
        invokedMethods(statement, invoked);
        for (const recipe of invoked.recipes) (recipes.get(recipe) ?? new Set()).forEach((name) => invoked.operations.add(name));
        const used = [...invoked.operations].filter((name) => methods.has(name)).sort();
        const bindings = new Set<string>();
        const commands = new Set<string>();
        for (const name of used) {
          methods.get(name)!.bindings.forEach((binding) => bindings.add(binding));
          methods.get(name)!.commands.forEach((command) => commands.add(command));
        }
        for (const name of names) tools[name] = { methods: used, bindings: [...bindings].sort(), commands: [...commands].sort() };
      }
    };
    visitStatements(parse(path).statements);
  }
  return { tools: Object.fromEntries(Object.entries(tools).sort(([a], [b]) => a.localeCompare(b))) };
}

const tsFiles = (directory: string) => readdirSync(directory)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .sort()
  .map((name) => join(directory, name));

export function defaultRequirementSources(projectRoot: string): { helpers: string[]; operations: string[]; recipes: string[]; tools: string[] } {
  const plasticity = join(projectRoot, "src", "plasticity");
  return {
    helpers: [...tsFiles(plasticity), join(plasticity, "operations", "helpers.ts")],
    operations: tsFiles(join(plasticity, "operations")),
    recipes: tsFiles(join(plasticity, "recipes")),
    tools: tsFiles(join(projectRoot, "src", "server", "tools")),
  };
}
