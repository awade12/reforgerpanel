import fs from "fs";
import path from "path";

export type ChangelogSection = {
  title: string;
  items: string[];
};

export type ChangelogRelease = {
  version: string;
  date: string | null;
  sections: ChangelogSection[];
};

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  const blocks = markdown.split(/^## \[/m).slice(1);

  for (const block of blocks) {
    const headerEnd = block.indexOf("\n");
    if (headerEnd < 0) continue;
    const header = block.slice(0, headerEnd);
    const body = block.slice(headerEnd + 1);

    const versionMatch = header.match(/^([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/);
    if (!versionMatch) continue;

    const version = versionMatch[1].trim();
    const date = versionMatch[2]?.trim() ?? null;
    const sections: ChangelogSection[] = [];

    const sectionParts = body.split(/^### /m).slice(1);
    for (const part of sectionParts) {
      const lineEnd = part.indexOf("\n");
      if (lineEnd < 0) continue;
      const title = part.slice(0, lineEnd).trim();
      const items = part
        .slice(lineEnd + 1)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- "))
        .map((line) => line.slice(2).trim())
        .filter(Boolean);
      if (items.length) sections.push({ title, items });
    }

    releases.push({ version, date, sections });
  }

  return releases;
}

export function loadChangelog(): ChangelogRelease[] {
  try {
    const file = path.join(process.cwd(), "CHANGELOG.md");
    return parseChangelog(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}
