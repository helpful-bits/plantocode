"use server";

import path from "path";
import { getAllNonIgnoredFiles } from "@/lib/git-utils";

interface TreeNode { // Keep interface definition
  name: string; // Keep name property
  children: TreeNode[]; // Keep children property
  isDirectory: boolean;
}

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = { name: '', children: [], isDirectory: true };

  for (const filePath of files) {
    const parts = filePath.split('/');
    let currentNode = root; // Start at the root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isDirectory = i < parts.length - 1;
      
      let child = currentNode.children.find(c => c.name === part);
      
      if (!child) {
        child = { name: part, children: [], isDirectory };
        currentNode.children.push(child);
        // Sort directories first, then files alphabetically
        currentNode.children.sort((a, b) => {
          if (a.isDirectory === b.isDirectory) {
            return a.name.localeCompare(b.name);
          }
          return a.isDirectory ? -1 : 1;
        });
      }
      
      currentNode = child;
    }
  }

  return root;
}

function treeToString(node: TreeNode, prefix = '', isLast = true): string {
  if (!node.name && node.children.length === 0) return ''; // Handle empty root case

  let result = '';
  
  if (node.name) {
    result += prefix;
    result += isLast ? '└── ' : '├── ';
    result += node.name + '\n';
  }

  const childPrefix = prefix + (node.name ? (isLast ? '    ' : '│   ') : '');
  
  node.children.forEach((child, index) => {
    const isLastChild = index === node.children.length - 1;
    result += treeToString(child, childPrefix, isLastChild);
  });

  return result;
}

export async function generateDirectoryTree(projectDir: string): Promise<string> {
  try {
    if (!projectDir?.trim()) {
      return ''; // Return empty string if no project directory
    }
    const { files } = await getAllNonIgnoredFiles(projectDir); // Destructure files from result
    const tree = buildTree(files);
    // Generate string representation
    return treeToString(tree).trim();
  } catch (error) {
    console.error('Error generating directory tree:', error);
    return '';
  }
} 
