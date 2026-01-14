import type { ESTree } from 'meriyah';

export const WALK_STOP = Symbol('WALK_STOP');

// JavaScript built-in identifiers that should not be treated as dependencies
export const jsBuiltIns = new Set([
  'AbortController', 'Array', 'ArrayBuffer', 'BigInt', 'Boolean', 'console',
  'Date', 'decodeURI', 'decodeURIComponent', 'document', 'encodeURI',
  'encodeURIComponent', 'Error', 'eval', 'fetch', 'Function', 'globalThis',
  'Infinity', 'isFinite', 'isNaN', 'JSON', 'Map', 'Math', 'NaN', 'Number',
  'Object', 'parseFloat', 'parseInt', 'Promise', 'Proxy', 'Reflect', 'RegExp',
  'Set', 'String', 'Symbol', 'this', 'undefined', 'URL', 'URLSearchParams',
  'WeakMap', 'WeakSet', 'window', 'self', 'navigator', 'location', 'atob', 'btoa',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'arguments',
  'prototype', 'hasOwnProperty', 'toString', 'valueOf', 'split', 'parse', 'stringify'
]);

export const indent = '  ';

export type AstVisitResult = boolean | typeof WALK_STOP | void;
export type AstVisitFn = (node: ESTree.Node, parent: ESTree.Node | null, ancestors: ESTree.Node[]) => AstVisitResult;

export interface AstVisitObject {
  enter?(node: ESTree.Node, parent: ESTree.Node | null, ancestors: ESTree.Node[]): AstVisitResult;
  leave?(node: ESTree.Node, parent: ESTree.Node | null, ancestors: ESTree.Node[]): AstVisitResult;
}

export type AstVisitor = AstVisitFn | AstVisitObject;

/**
 * Non-recursive AST walker
 */
export function walkAst(root: ESTree.Node, visitor: AstVisitor): void {
  if (!root || typeof root !== 'object') return;

  const stack: {
    node: ESTree.Node;
    parent: ESTree.Node | null;
    exit: boolean;
  }[] = [{ node: root, parent: null, exit: false }];

  const ancestors: ESTree.Node[] = [];

  const enter = typeof visitor === 'function' ? visitor : visitor.enter ?? null;
  const leave = typeof visitor === 'function' ? null : visitor.leave ?? null;

  let shouldStop = false;

  while (!shouldStop && stack.length > 0) {
    const frame = stack.pop()!;
    const { node, parent, exit } = frame;

    if (exit) {
      ancestors.pop();
      if (leave && leave(node, parent, ancestors) === WALK_STOP) {
        shouldStop = true;
      }
      continue;
    }

    if (!node || typeof node.type !== 'string') continue;

    const result = enter ? enter(node, parent, ancestors) : undefined;

    if (result === WALK_STOP) {
      shouldStop = true;
      continue;
    }

    if (result === true) continue;

    stack.push({ node, parent, exit: true });
    ancestors.push(node);

    for (const key in node) {
      if (key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;

      // deno-lint-ignore no-explicit-any
      const value = (node as any)[key];
      if (!value) continue;

      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) {
          const item = value[i];
          // deno-lint-ignore no-explicit-any
          if (item && typeof (item as any).type === 'string') {
            stack.push({ node: item, parent: node, exit: false });
          }
        }
        // deno-lint-ignore no-explicit-any
      } else if (typeof value === 'object' && typeof (value as any).type === 'string') {
        stack.push({ node: value, parent: node, exit: false });
      }
    }
  }
}

/**
 * Get source range from an AST node
 */
export function getNodeSourceRange(node: ESTree.Node | null | undefined): [number, number] | null {
  if (!node) return null;
  if (Array.isArray(node.range)) return node.range;
  if (typeof node.start === 'number' && typeof node.end === 'number') return [node.start, node.end];
  return null;
}

/**
 * Extract source code for a node
 */
export function extractNodeSource(node: ESTree.Node | null | undefined, source: string): string | null {
  const range = getNodeSourceRange(node);
  return range ? source.slice(range[0], range[1]) : null;
}

/**
 * Convert member expression to string (e.g., "obj.prop.sub")
 */
export function memberToString(memberExpression: ESTree.Node, source: string): string | null {
  if (memberExpression.type !== 'MemberExpression') return null;

  const segments: string[] = [];
  let cur: ESTree.Node = memberExpression;

  while (cur && cur.type === 'MemberExpression') {
    const member = cur as ESTree.MemberExpression;
    const prop = member.property;
    if (!prop) return null;

    if (member.computed) {
      const propSource = extractNodeSource(prop, source);
      if (!propSource) return null;
      segments.unshift(`[${propSource.trim()}]`);
    } else {
      if (prop.type !== 'Identifier') return null;
      segments.unshift(`.${prop.name}`);
    }

    cur = member.object;
  }

  let base: string | null = null;

  if (cur?.type === 'Identifier') {
    base = cur.name;
  } else if (cur?.type === 'ThisExpression') {
    base = 'this';
  }

  return base ? base + segments.join('') : null;
}

/**
 * Get the base identifier name of a member expression
 */
export function memberBaseName(memberExpression: ESTree.MemberExpression, source: string): string | null {
  let target: ESTree.Node | null = memberExpression.object as ESTree.Node;

  while (target && target.type === 'MemberExpression') {
    const parentName = memberToString(target, source);
    if (parentName) return parentName;
    target = (target as ESTree.MemberExpression).object as ESTree.Node;
  }

  if (target?.type === 'Identifier') return target.name;
  if (target?.type === 'ThisExpression') return 'this';

  return null;
}
