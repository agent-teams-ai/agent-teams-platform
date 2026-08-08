import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import YAML from "yaml";

import {
  loadReviewDocuments,
  validatePlatformOrchestratorReview,
  validateReviewDocuments,
} from "./validate-platform-orchestrator-review.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

test("accepts the canonical Platform-Orchestrator review", async () => {
  assert.deepEqual(await validatePlatformOrchestratorReview(repositoryRoot), []);
});

test("rejects confirmed rows without accepted evidence", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "01-authority-ownership-matrix.md";
  documents.set(
    file,
    documents
      .get(file)
      .replace("Platform ADR-0004 |", "Review proposal |"),
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-CONFIRMED-00[12]/u,
  );
});

test("rejects unknown ADR labels as confirmation evidence", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "01-authority-ownership-matrix.md";
  documents.set(
    file,
    documents.get(file).replace("Platform ADR-0004 |", "Platform ADR-9999 |"),
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-CONFIRMED-001/u,
  );
});

test("rejects non-canonical CONFIRMED formatting without losing source checks", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "01-authority-ownership-matrix.md";
  documents.set(
    file,
    documents
      .get(file)
      .replace("| `CONFIRMED` | Product project", "  | **CONFIRMED** | Product project")
      .replace("Platform ADR-0004 |", "Review proposal |"),
  );
  const errors = validateReviewDocuments(documents).join("\n");
  assert.match(errors, /REVIEW-STATUS-003/u);
  assert.match(errors, /REVIEW-CONFIRMED-00[12]/u);
});

test("rejects linked or misspelled values in declared status columns", async () => {
  for (const replacement of ["[CONFIRMED](#status)", "`CONFRIMED`"]) {
    const documents = await loadReviewDocuments(repositoryRoot);
    const file = "01-authority-ownership-matrix.md";
    documents.set(
      file,
      documents.get(file).replace("| `CONFIRMED` | Product project", `| ${replacement} | Product project`),
    );
    assert.match(
      validateReviewDocuments(documents).join("\n"),
      /REVIEW-STATUS-003/u,
    );
  }
});

test("rejects a formatted or missing status header", async () => {
  for (const replacement of ["**Status**", "Decision"]) {
    const documents = await loadReviewDocuments(repositoryRoot);
    const file = "01-authority-ownership-matrix.md";
    documents.set(
      file,
      documents
        .get(file)
        .replace("| Status | Capability |", `| ${replacement} | Capability |`),
    );
    assert.match(
      validateReviewDocuments(documents).join("\n"),
      /REVIEW-STATUS-00[56]/u,
    );
  }
});

test("reads acceptance evidence only from the source cell", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "01-authority-ownership-matrix.md";
  documents.set(
    file,
    documents
      .get(file)
      .replace(
        "| `CONFIRMED` | Product project",
        "| `CONFIRMED` | Product project (see Platform ADR-0004)",
      )
      .replace("Platform ADR-0004 |", "Review proposal |"),
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-CONFIRMED-00[12]/u,
  );
});

test("rejects prose CONFIRMED claims without accepted evidence", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "01-authority-ownership-matrix.md";
  documents.set(
    file,
    `${documents.get(file)}\n- \`CONFIRMED\`: Platform ADR-9999 invents a rule.\n`,
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-CONFIRMED-003/u,
  );
});

test("rejects non-canonical prose CONFIRMED claims", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "01-authority-ownership-matrix.md";
  documents.set(
    file,
    `${documents.get(file)}\nThis is CONFIRMED by Platform ADR-0004.\n`,
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-STATUS-004/u,
  );
});

test("rejects CONFIRMED claims hidden in a non-status table", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "01-authority-ownership-matrix.md";
  documents.set(
    file,
    `${documents.get(file)}\n| Decision | Claim | Source |\n| --- | --- | --- |\n| CONFIRMED | Invented claim | Review proposal |\n`,
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-STATUS-007/u,
  );
});

test("reads status only from YAML frontmatter", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "01-authority-ownership-matrix.md";
  documents.set(
    file,
    documents
      .get(file)
      .replace("status: proposed", "status: accepted")
      .concat("\nstatus: proposed\n"),
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-STATUS-001/u,
  );
});

test("rejects a missing required failure trace", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "concurrency-failure-traces.md";
  documents.set(file, documents.get(file).replace("## CF-03", "## Missing-03"));
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-TRACE-002 missing CF-03/u,
  );
});

test("rejects empty trace and conformance sections", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "concurrency-failure-traces.md";
  const traces = documents.get(file);
  const start = traces.indexOf("## CF-03");
  const end = traces.indexOf("## CF-04");
  documents.set(
    file,
    `${traces.slice(0, start)}## CF-03 Empty\n\n### CF-03 conformance evidence\n\n${traces.slice(end)}`,
  );
  const errors = validateReviewDocuments(documents).join("\n");
  assert.match(errors, /REVIEW-TRACE-004/u);
  assert.match(errors, /REVIEW-TRACE-005/u);
});

test("rejects long placeholder traces without required semantics and evidence", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "concurrency-failure-traces.md";
  const traces = documents.get(file);
  const start = traces.indexOf("## CF-03");
  const end = traces.indexOf("## CF-04");
  const filler = "placeholder ".repeat(35);
  documents.set(
    file,
    `${traces.slice(0, start)}## CF-03 Placeholder\n\n1. ${filler}\n\n### CF-03 conformance evidence\n\n- ${filler}\n\n${traces.slice(end)}`,
  );
  const errors = validateReviewDocuments(documents).join("\n");
  assert.match(errors, /REVIEW-TRACE-006 CF-03/u);
  assert.match(errors, /REVIEW-TRACE-005 CF-03/u);
});

test("does not accept required trace structure hidden inside a code fence", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "concurrency-failure-traces.md";
  const traces = documents.get(file);
  const start = traces.indexOf("## RT-02");
  const end = traces.indexOf("## Remaining open decisions");
  documents.set(
    file,
    `${traces.slice(0, start)}\`\`\`\`text\n${traces.slice(start, end)}\`\`\`\`\n${traces.slice(end)}`,
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-TRACE-002 missing RT-02/u,
  );
});

test("does not accept required trace structure hidden in an HTML comment", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "concurrency-failure-traces.md";
  const traces = documents.get(file);
  const start = traces.indexOf("## RT-02");
  const end = traces.indexOf("## Remaining open decisions");
  documents.set(
    file,
    `${traces.slice(0, start)}<!--\n${traces.slice(start, end)}-->\n${traces.slice(end)}`,
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-TRACE-002 missing RT-02/u,
  );
});

test("does not treat a fenced info string as a closing fence", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "concurrency-failure-traces.md";
  const traces = documents.get(file);
  const start = traces.indexOf("## RT-02");
  const end = traces.indexOf("## Remaining open decisions");
  documents.set(
    file,
    `${traces.slice(0, start)}\`\`\`text\n\`\`\`not-a-close\n${traces.slice(start, end)}\`\`\`\n${traces.slice(end)}`,
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-TRACE-002 missing RT-02/u,
  );
});

test("requires every matrix and trace to be a deployment review input", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const manifest = "../deployment-profiles.yaml";
  documents.set(
    manifest,
    documents
      .get(manifest)
      .replace(
        "      - docs/architecture/platform-orchestrator-review/04-capability-authorization-port-catalog.md\n",
        "",
      ),
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-EVIDENCE-001.*04-capability-authorization-port-catalog/u,
  );
});

test("requires review inputs to be reachable from a deployment profile", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const manifest = "../deployment-profiles.yaml";
  const catalog = YAML.parse(documents.get(manifest));
  const baseline = catalog.designEvidenceSets.find(
    (evidenceSet) => evidenceSet.id === "cross-system-profile-baseline-v1",
  );
  const reviewInputRefs = baseline.reviewInputRefs;
  baseline.reviewInputRefs = [];
  catalog.designEvidenceSets.push({
    evidenceRefs: ["docs/decisions/0001-deployment-profile-lifecycle-and-v1-scope.md"],
    extendsEvidenceSetIds: [],
    id: "unused-review-inputs-v1",
    reviewInputRefs,
  });
  documents.set(manifest, YAML.stringify(catalog));
  const errors = validateReviewDocuments(documents).join("\n");
  assert.match(errors, /REVIEW-EVIDENCE-004 unused-review-inputs-v1/u);
  assert.match(errors, /REVIEW-EVIDENCE-001/u);
});

test("reports missing review artifacts instead of throwing", async () => {
  const emptyRoot = await mkdtemp(path.join(os.tmpdir(), "platform-review-"));
  try {
    const errors = await validatePlatformOrchestratorReview(emptyRoot);
    assert.match(errors.join("\n"), /REVIEW-ARTIFACT-001/u);
    assert.match(errors.join("\n"), /REVIEW-TRACE-001/u);
  } finally {
    await rm(emptyRoot, { force: true, recursive: true });
  }
});

test("reports a malformed design evidence collection instead of throwing", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  documents.set(
    "../deployment-profiles.yaml",
    "schemaVersion: 2\ndesignEvidenceSets: {}\n",
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-EVIDENCE-003/u,
  );
});

test("reports non-object evidence-set entries instead of throwing", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  documents.set(
    "../deployment-profiles.yaml",
    "schemaVersion: 2\ndesignEvidenceSets: [null]\nprofiles: []\n",
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-EVIDENCE-006/u,
  );
});

test("reports non-object profile entries instead of throwing", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  documents.set(
    "../deployment-profiles.yaml",
    "schemaVersion: 2\ndesignEvidenceSets: []\nprofiles: [null]\n",
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-EVIDENCE-007/u,
  );
});

test("does not treat a sibling review directory as proposed evidence", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const manifest = "../deployment-profiles.yaml";
  const catalog = documents.get(manifest);
  documents.set(
    manifest,
    catalog.replace(
      "    evidenceRefs:\n",
      "    evidenceRefs:\n      - docs/architecture/platform-orchestrator-review-notes/accepted.md\n",
    ),
  );
  assert.doesNotMatch(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-EVIDENCE-002/u,
  );
});

test("rejects obsolete wording that collapses authority boundaries", async () => {
  const documents = await loadReviewDocuments(repositoryRoot);
  const file = "05-decision-freshness-failure-matrix.md";
  documents.set(
    file,
    `${documents.get(file)}\nRevalidate immediately before effect\n`,
  );
  assert.match(
    validateReviewDocuments(documents).join("\n"),
    /REVIEW-STALE-001/u,
  );
});
