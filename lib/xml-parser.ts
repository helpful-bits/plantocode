import { DOMParser } from "@xmldom/xmldom";

interface ParsedFileChange {
  file_summary: string;
  file_operation: string;
  file_path: string;
  file_code?: string;
}

export async function parseXmlString(xmlString: string): Promise<ParsedFileChange[] | null> {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");

    const changedFilesNode = doc.getElementsByTagName("changed_files")[0];
    if (!changedFilesNode) {
      return null;
    }

    const fileNodes = changedFilesNode.getElementsByTagName("file");
    const changes: ParsedFileChange[] = [];

    for (let i = 0; i < fileNodes.length; i++) {
      const fileNode = fileNodes[i];

      const fileSummaryNode = fileNode.getElementsByTagName("file_summary")[0];
      const fileOperationNode = fileNode.getElementsByTagName("file_operation")[0];
      const filePathNode = fileNode.getElementsByTagName("file_path")[0];
      const fileCodeNode = fileNode.getElementsByTagName("file_code")[0];

      if (!fileOperationNode || !filePathNode) {
        continue;
      }

      const file_summary = fileSummaryNode?.textContent?.trim() ?? "";
      const file_operation = fileOperationNode.textContent?.trim() ?? "";
      const file_path = filePathNode.textContent?.trim() ?? "";

      let file_code: string | undefined = undefined;
      if (fileCodeNode && fileCodeNode.firstChild) {
        file_code = fileCodeNode.textContent?.trim() ?? "";
      }

      changes.push({
        file_summary,
        file_operation,
        file_path,
        file_code
      });
    }

    return changes;
  } catch (error: unknown) {
    console.error("Error parsing XML:", error);
    return null;
  }
}
