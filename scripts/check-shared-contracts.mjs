import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = resolve(process.argv[2] ?? join(root, "packages/shared"));
const src = join(sourceRoot, "src");
const entry = join(src, "index.ts");
const packageJson = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf8"));
// Check the shared source without ambient framework or Node types.
const program = ts.createProgram([entry], {
  strict: true, noEmit: true, target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.es2022.d.ts"], types: [],
});
const files = readdirSync(src).filter((file) => file.endsWith(".ts")).sort()
  .map((file) => program.getSourceFile(join(src, file)));
assert(files.every(Boolean), "All source modules must be reachable from the public entry point");
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => sourceRoot, getCanonicalFileName: (file) => file, getNewLine: () => "\n",
}));

const checker = program.getTypeChecker();
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const digest = (value) => createHash("sha256").update(value).digest("hex");
const print = (node) => printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile()).trim();
const entries = (values) => Object.fromEntries(values.sort(([first], [second]) => first.localeCompare(second, "en")));
const publicSymbols = checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(entry))).map((alias) => {
  const symbol = alias.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(alias) : alias;
  assert(symbol.declarations?.length, "Missing declaration for " + alias.name);
  return { name: alias.name, symbol };
});
const symbols = entries(publicSymbols.map(({ name, symbol }) => {
  const kind = symbol.flags & ts.SymbolFlags.Value ? "value" : "type";
  if (kind === "value") assert(!(symbol.flags & ts.SymbolFlags.Type), "Unexpected mixed export " + name);
  return [name, kind + ":" + digest(symbol.declarations.map(print).join("\n"))];
}));
// Include private contract helpers so changes hidden behind exported aliases are checked too.
const privateTypes = files.flatMap((file) => file.statements.filter((node) =>
  (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
  !node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
).map((node) => [node.name.text, digest(print(node))]));

const namespace = await import(pathToFileURL(entry).href);
for (const { name, symbol } of publicSymbols) {
  if (symbol.flags & ts.SymbolFlags.Value) {
    const owner = await import(pathToFileURL(symbol.valueDeclaration.getSourceFile().fileName).href);
    assert.equal(namespace[name], owner[symbol.name], "Public value has a different identity: " + name);
  }
}
const runtime = entries(Object.entries(namespace).map(([name, value]) => {
  if (value instanceof RegExp) return [name, { pattern: value.source, flags: value.flags }];
  if (typeof value === "function") {
    assert.equal(name, "departmentCommunityContent");
    return [name, Object.fromEntries(namespace.locales.map((locale) =>
      [locale, value(locale, "Centre $&")]
    ))];
  }
  return [name, value];
}));
assert.deepEqual(Object.keys(runtime), Object.keys(symbols).filter((name) => symbols[name].startsWith("value:")));

const graph = new Map(files.map((file) => [resolve(file.fileName), file.statements.flatMap((node) => {
  if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return [];
  const specifier = node.moduleSpecifier?.text;
  if (!specifier) return [];
  assert(specifier.startsWith("./"), "Shared contracts must have only local module edges");
  const target = ts.resolveModuleName(specifier, file.fileName, program.getCompilerOptions(), ts.sys).resolvedModule?.resolvedFileName;
  assert(target && dirname(resolve(target)) === src, "Unexpected shared dependency " + specifier);
  const typeOnly = ts.isExportDeclaration(node) ? node.isTypeOnly : node.importClause?.isTypeOnly;
  return [{ target: resolve(target), typeOnly }];
})]));
const visited = new Set();
const active = new Set();
function visit(file) {
  assert(!active.has(file), "Cycle in shared imports at " + file);
  if (visited.has(file)) return;
  active.add(file);
  for (const { target, typeOnly } of graph.get(file)) {
    if (process.argv[3] !== "--print" || !typeOnly) visit(target);
  }
  active.delete(file);
  visited.add(file);
}
for (const file of graph.keys()) visit(file);

const inventory = {
  package: { name: packageJson.name, type: packageJson.type, types: packageJson.types, exports: packageJson.exports },
  symbols,
  privateTypes: entries(privateTypes),
  runtime,
};
if (process.argv[3] === "--print") {
  process.stdout.write(JSON.stringify(inventory, null, 2) + "\n");
} else {
  const expected = JSON.parse(readFileSync(new URL("./fixtures/shared-contracts.json", import.meta.url), "utf8"));
  assert.deepEqual(inventory, expected);
  const runtimeCount = Object.keys(runtime).length;
  const typeEdges = [...graph.values()].flat().filter(({ typeOnly }) => typeOnly).length;
  console.log("Shared contracts match: %d exports (%d runtime, %d type-only), %d modules, %d type-only edges, no cycles.",
    Object.keys(symbols).length, runtimeCount, Object.keys(symbols).length - runtimeCount, files.length, typeEdges);
}
