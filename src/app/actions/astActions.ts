'use server';

import * as parser from '@babel/parser';
// @ts-ignore
import _traverse from '@babel/traverse';
// @ts-ignore
import _generator from '@babel/generator';
import * as t from '@babel/types';
import { v4 as uuidv4 } from 'uuid';

const traverse = typeof _traverse === 'function' ? _traverse : (_traverse as any).default;
const generator = typeof _generator === 'function' ? _generator : (_generator as any).default;

function getElementPathById(ast: t.Node, elementId: string): any {
  let targetPath: any = null;
  traverse(ast, {
    JSXElement(path: any) {
      const openingElement = path.node.openingElement;
      const hasUnclashId = openingElement.attributes.some(
        (attr: any) => attr.type === 'JSXAttribute' && attr.name.name === 'data-unclash-id' && attr.value?.value === elementId
      );
      if (hasUnclashId) {
        targetPath = path;
        path.stop();
      }
    }
  });
  return targetPath;
}

function regenerateUUIDs(path: any) {
  // Replace UUIDs for descendants
  path.traverse({
    JSXAttribute(attrPath: any) {
      if (attrPath.node.name.name === 'data-unclash-id') {
        attrPath.node.value.value = uuidv4();
      }
    }
  });
  // Replace UUID for the root node of this path
  const openingElement = path.node.openingElement;
  if (openingElement) {
    const unclashIdAttr = openingElement.attributes.find(
      (attr: any) => attr.type === 'JSXAttribute' && attr.name.name === 'data-unclash-id'
    );
    if (unclashIdAttr) {
      unclashIdAttr.value.value = uuidv4();
    }
  }
}

export async function extractElementCode(code: string, elementId: string): Promise<string | null> {
  try {
    const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    const targetPath = getElementPathById(ast, elementId);
    if (targetPath) {
      return generator(targetPath.node).code;
    }
  } catch (err) {
    console.error("Failed to parse code for extraction:", err);
  }
  return null;
}

export async function insertElementCode(code: string, targetElementId: string, elementCode: string): Promise<string | null> {
  try {
    const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    const targetPath = getElementPathById(ast, targetElementId);
    
    if (!targetPath) return null;

    const pastedAst = parser.parseExpression(elementCode, { plugins: ['jsx', 'typescript'] });
    
    const tagName = targetPath.node.openingElement.name.name;
    const isContainer = ['div', 'section', 'main', 'header', 'footer', 'nav', 'aside', 'ul', 'ol', 'form', 'table', 'tbody', 'tr'].includes(tagName);
    
    let insertedPaths: any[] = [];
    if (isContainer && targetPath.node.closingElement) {
      targetPath.pushContainer('children', pastedAst);
      insertedPaths = [targetPath.get('children')[targetPath.node.children.length - 1]];
    } else {
      insertedPaths = targetPath.insertAfter(pastedAst);
    }
    
    for (const insertedPath of insertedPaths) {
      regenerateUUIDs(insertedPath);
    }
    
    return generator(ast).code;
  } catch (err) {
    console.error("Failed to insert code:", err);
    return null;
  }
}

export async function duplicateElementCode(code: string, elementId: string): Promise<string | null> {
  try {
    const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    const targetPath = getElementPathById(ast, elementId);
    if (!targetPath) return null;
    
    const clonedNode = t.cloneNode(targetPath.node);
    const insertedPaths = targetPath.insertAfter(clonedNode);
    
    for (const insertedPath of insertedPaths) {
      regenerateUUIDs(insertedPath);
    }
    
    return generator(ast).code;
  } catch (err) {
    console.error("Failed to duplicate code:", err);
    return null;
  }
}

export async function deleteElementCode(code: string, elementId: string): Promise<string | null> {
  try {
    const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    const targetPath = getElementPathById(ast, elementId);
    if (!targetPath) return null;
    
    targetPath.remove();
    return generator(ast).code;
  } catch (err) {
    console.error("Failed to delete code:", err);
    return null;
  }
}
