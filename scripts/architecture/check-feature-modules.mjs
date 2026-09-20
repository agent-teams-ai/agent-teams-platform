import { readFile } from "node:fs/promises";

const profile = JSON.parse(await readFile("architecture/foundation/feature-modules.json", "utf8"));
if (profile.schemaVersion !== 1 || profile.modules.length < 2) throw new Error("Feature profile must classify every production module.");
for (const module of profile.modules) {
  if (!module.sourceRoot || !module.features?.length) throw new Error(`Unclassified module: ${module.id}`);
  for (const feature of module.features) {
    if (!feature.testRoots?.length || !feature.layers?.length) throw new Error(`Incomplete feature: ${module.id}/${feature.id}`);
  }
}
console.log(`Feature module profile passed (${profile.modules.length} modules).`);
