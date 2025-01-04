"use server";

import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface TreeNode {
  name: string;
  children: TreeNode[];
  isDirectory: boolean;
}

async function getAllNonIgnoredFiles(dir: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git ls-files --cached --others --exclude-standard', { cwd: dir });
    return stdout.split('\n').filter(Boolean);
  } catch (error) {
    console.error('Error getting non-ignored files:', error);
    return [];
  }
}

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = { name: '', children: [], isDirectory: true };

  for (const filePath of files) {
    const parts = filePath.split('/');
    let currentNode = root;

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
  if (!node.name && node.children.length === 0) return '';

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
    const files = await getAllNonIgnoredFiles(projectDir);
    const tree = buildTree(files);
    return treeToString(tree).trim();
  } catch (error) {
    console.error('Error generating directory tree:', error);
    return '';
  }
} 