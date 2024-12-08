"use server";

import { applyFileChanges } from "@/lib/apply-changes";
import { parseXmlString } from "@/lib/xml-parser";

export async function applyChangesAction(xml: string, projectDirectory: string) {
  const changes = await parseXmlString(xml);

  if (!changes || !Array.isArray(changes)) {
    throw new Error("Invalid XML format. Could not find changed_files.");
  }

  let finalDirectory = projectDirectory && projectDirectory.trim() !== "" ? projectDirectory.trim() : process.env.PROJECT_DIRECTORY;

  if (!finalDirectory) {
    throw new Error("No project directory provided and no fallback found in environment.");
  }

  for (const file of changes) {
    await applyFileChanges(file, finalDirectory);
  }
}
