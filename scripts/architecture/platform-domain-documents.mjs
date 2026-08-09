import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { toString } from "mdast-util-to-string";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import YAML from "yaml";

export const DOSSIER_ROOT = "docs/domain/contexts";

const markdownParser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .freeze();

export function parseYaml(source, subject, errors) {
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  for (const error of document.errors) {
    errors.push(`DOMAIN-YAML-001 ${subject}: ${error.message}`);
  }
  return document.errors.length === 0 ? document.toJS() : null;
}

export async function readText(repositoryRoot, relativePath, errors) {
  try {
    return await readFile(path.join(repositoryRoot, relativePath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      errors.push(`DOMAIN-FILE-001 missing ${relativePath}`);
      return null;
    }
    throw error;
  }
}

export async function loadYaml(repositoryRoot, relativePath, errors) {
  const source = await readText(repositoryRoot, relativePath, errors);
  return source === null ? null : parseYaml(source, relativePath, errors);
}

export function parseMarkdown(source, relativePath, errors) {
  const tree = markdownParser.parse(source);
  const yamlNodes = tree.children.filter((node) => node.type === "yaml");
  if (yamlNodes.length !== 1 || tree.children[0] !== yamlNodes[0]) {
    errors.push(
      `DOMAIN-DOSSIER-001 ${relativePath} requires one leading YAML frontmatter block`,
    );
  }
  const headings = new Set();
  const rootHeadings = [];
  const links = new Set();
  visit(tree, "heading", (node, _index, parent) => {
    if (parent === tree) {
      const heading = { depth: node.depth, text: toString(node) };
      rootHeadings.push(heading);
      if (node.depth === 2) {
        headings.add(heading.text);
      }
    }
  });
  visit(tree, "link", (node) => {
    links.add(node.url);
  });
  return {
    content: source,
    headings,
    links,
    metadata:
      yamlNodes.length === 1
        ? parseYaml(yamlNodes[0].value, relativePath, errors)
        : null,
    path: relativePath,
    rootHeadings,
  };
}

export async function loadMarkdown(repositoryRoot, relativePath, errors) {
  const source = await readText(repositoryRoot, relativePath, errors);
  return source === null ? null : parseMarkdown(source, relativePath, errors);
}

export async function loadDossiers(repositoryRoot, errors) {
  let entries;
  try {
    entries = await readdir(path.join(repositoryRoot, DOSSIER_ROOT), {
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      errors.push(`DOMAIN-FILE-001 missing ${DOSSIER_ROOT}`);
      return [];
    }
    throw error;
  }
  const dossiers = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      errors.push(
        `DOMAIN-DOSSIER-007 symlink is forbidden under ${DOSSIER_ROOT}: ${entry.name}`,
      );
    }
  }
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .toSorted((left, right) => left.name.localeCompare(right.name, "en"));
  for (const directory of directories) {
    const relativePath = `${DOSSIER_ROOT}/${directory.name}/README.md`;
    const document = await loadMarkdown(repositoryRoot, relativePath, errors);
    if (document !== null) {
      dossiers.push({ ...document, slug: directory.name });
    }
  }
  return dossiers;
}
