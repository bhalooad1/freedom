import { parseScript } from 'meriyah';
import { jsBuiltIns, memberBaseName, memberToString, walkAst } from './helpers.js';

/**
 * Analyzes JavaScript code to extract specific functions and their dependencies.
 * Used for extracting signature decipher and n-transform functions from YouTube's player.js.
 */
export class JsAnalyzer {
  constructor(code, options = {}) {
    this.source = code;
    this.dependentsTracker = new Map();
    this.declaredVariables = new Map();
    this.iifeParamName = null;

    const extractionConfigs = options.extractions
      ? Array.isArray(options.extractions)
        ? options.extractions
        : [options.extractions]
      : [];

    this.extractionStates = extractionConfigs.map((config) => ({
      config: { collectDependencies: true, stopWhenReady: true, ...config },
      dependencies: new Set(),
      dependents: new Set(),
      ready: false,
    }));

    this.hasExtractions = this.extractionStates.length > 0;

    this.programAst = parseScript(code, {
      ranges: true,
      loc: false,
      module: false,
    });

    this.analyzeAst();
  }

  /**
   * Walk the AST to collect declarations and resolve targets
   */
  analyzeAst() {
    let iifeBody;

    // Find the IIFE body in the player.js
    for (const statement of this.programAst.body) {
      if (statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression') {
        const callExpr = statement.expression;
        if (callExpr.callee.type === 'FunctionExpression') {
          const funcExpr = callExpr.callee;
          const firstParam = funcExpr.params.length > 0 ? funcExpr.params[0] : null;

          if (!this.iifeParamName && firstParam?.type === 'Identifier') {
            this.iifeParamName = firstParam.name;
          }

          if (funcExpr.body?.type === 'BlockStatement') {
            iifeBody = funcExpr.body;
            break;
          }
        }
      }
    }

    if (!iifeBody) return;

    for (const currentNode of iifeBody.body) {
      switch (currentNode.type) {
        case 'ExpressionStatement': {
          const assignment = currentNode.expression;
          if (assignment.type !== 'AssignmentExpression') continue;

          const left = assignment.left;
          const right = assignment.right;

          if (left.type === 'Identifier') {
            const existingVariable = this.declaredVariables.get(left.name);
            if (!existingVariable) continue;

            existingVariable.node.init = right;

            if (this.needsDependencyAnalysis(right)) {
              existingVariable.dependencies = this.findDependencies(assignment.right, left.name);
            }

            if (this.onMatch(existingVariable.node, existingVariable)) return;
          } else if (assignment.left.type === 'MemberExpression') {
            const memberName = memberToString(assignment.left, this.source);
            if (!memberName || this.declaredVariables.has(memberName)) continue;

            const metadata = {
              name: memberName,
              node: currentNode,
              dependents: this.dependentsTracker.get(memberName) || new Set(),
              predeclared: false,
              dependencies: this.findDependencies(right, memberName),
            };

            const baseName = memberBaseName(assignment.left, this.source);
            if (baseName && baseName !== memberName && !baseName.startsWith('this.')) {
              metadata.dependencies.add(baseName.replace('.prototype', ''));
            }

            if (this.dependentsTracker.has(memberName)) {
              this.dependentsTracker.delete(memberName);
            }

            this.declaredVariables.set(memberName, metadata);

            if (this.onMatch(currentNode, metadata)) return;
          }
          break;
        }
        case 'VariableDeclaration': {
          for (const declaration of currentNode.declarations) {
            if (declaration.id.type !== 'Identifier') continue;

            const metadata = {
              name: declaration.id.name,
              node: declaration,
              dependents: this.dependentsTracker.get(declaration.id.name) || new Set(),
              dependencies: new Set(),
              predeclared: false,
            };

            const init = declaration.init;

            if (!init && currentNode.kind === 'var') {
              metadata.predeclared = true;
            } else if (init && this.needsDependencyAnalysis(init)) {
              metadata.dependencies = this.findDependencies(init, metadata.name);
            }

            if (this.dependentsTracker.has(metadata.name)) {
              this.dependentsTracker.delete(metadata.name);
            }

            this.declaredVariables.set(metadata.name, metadata);

            if (this.onMatch(declaration, metadata)) return;
          }
          break;
        }
      }
    }
  }

  /**
   * Check if a node requires dependency analysis
   */
  needsDependencyAnalysis(node) {
    if (!node) return false;
    switch (node.type) {
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
      case 'ArrayExpression':
      case 'LogicalExpression':
      case 'CallExpression':
      case 'NewExpression':
      case 'MemberExpression':
      case 'BinaryExpression':
      case 'ConditionalExpression':
      case 'ObjectExpression':
      case 'SequenceExpression':
      case 'Identifier':
        return true;
      default:
        return false;
    }
  }

  /**
   * Handle a match and update extraction state
   */
  onMatch(node, metadata) {
    if (!this.hasExtractions) return false;

    let matched = false;
    let result = false;

    for (const state of this.extractionStates) {
      if (!state.node) {
        if (node.type === 'VariableDeclarator' && !node.init) continue;
        result = state.config.match(node);
        if (!result) continue;
        state.node = node;
      } else if (state.node !== node) {
        this.refreshExtractionState(state);

        if (this.shouldStopTraversal()) {
          return true;
        }

        continue;
      }

      matched = true;

      if (metadata) {
        state.metadata = metadata;
        state.dependents = metadata.dependents;
        state.dependencies = metadata.dependencies;
        if (typeof result !== 'boolean') state.matchContext = result;
      }

      this.refreshExtractionState(state);
    }

    if (!matched) return false;

    return this.shouldStopTraversal();
  }

  /**
   * Refresh extraction state based on dependencies
   */
  refreshExtractionState(state) {
    if (!state.node) {
      state.ready = false;
      return;
    }

    if (state.config.collectDependencies === false) {
      state.ready = true;
      return;
    }

    if (!state.metadata) {
      state.ready = false;
      return;
    }

    state.ready = this.areDependenciesResolved(state.dependencies);
  }

  /**
   * Check if traversal should stop
   */
  shouldStopTraversal() {
    if (!this.hasExtractions) return false;

    let hasStoppingTarget = false;

    for (const state of this.extractionStates) {
      if (state.config.stopWhenReady === false) continue;

      hasStoppingTarget = true;

      if (!state.node) return false;
      if (!state.ready) return false;
    }

    return hasStoppingTarget;
  }

  /**
   * Check if all dependencies are resolved
   */
  areDependenciesResolved(dependencies, seen = new Set()) {
    if (!dependencies || dependencies.size === 0) return true;

    for (const dependency of dependencies) {
      if (!dependency) continue;
      if (jsBuiltIns.has(dependency)) continue;
      if (dependency === this.iifeParamName) continue;

      if (seen.has(dependency)) continue;

      const depMeta = this.declaredVariables.get(dependency);
      if (!depMeta) return false;

      seen.add(dependency);

      if (!this.areDependenciesResolved(depMeta.dependencies, seen)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Find all dependencies of a node
   */
  findDependencies(rootNode, identifierName) {
    const dependencies = new Set();
    if (!rootNode) return dependencies;

    const scopeStack = [
      {
        names: new Set(),
        type: 'block',
      },
    ];

    const currentScope = () => scopeStack[scopeStack.length - 1];

    const isInScope = (name) => {
      for (let i = scopeStack.length - 1; i >= 0; i--) {
        if (scopeStack[i].names.has(name)) return true;
      }
      return false;
    };

    const rootIdentifierName =
      'id' in rootNode && rootNode?.id?.type === 'Identifier' ? rootNode.id.name : undefined;

    const collectBindingIdentifiers = (pattern, target) => {
      if (!pattern) return;

      switch (pattern.type) {
        case 'Identifier':
          target.add(pattern.name);
          break;
        case 'ObjectPattern':
          for (const prop of pattern.properties) {
            if (prop.type === 'RestElement') {
              collectBindingIdentifiers(prop.argument, target);
            } else if (prop.type === 'Property') {
              collectBindingIdentifiers(prop.value, target);
            }
          }
          break;
        case 'ArrayPattern':
          for (const el of pattern.elements) {
            if (el) collectBindingIdentifiers(el, target);
          }
          break;
        case 'RestElement':
          collectBindingIdentifiers(pattern.argument, target);
          break;
        case 'AssignmentPattern':
          collectBindingIdentifiers(pattern.left, target);
          break;
      }
    };

    const collectParams = (fnNode, target) => {
      if (!fnNode?.params) return;
      for (const p of fnNode.params) collectBindingIdentifiers(p, target);
    };

    walkAst(rootNode, {
      enter: (n, parent) => {
        switch (n.type) {
          case 'FunctionDeclaration':
          case 'FunctionExpression':
          case 'ArrowFunctionExpression': {
            const isDecl = n.type === 'FunctionDeclaration';
            const fnName = 'id' in n ? n.id?.name : undefined;

            if (isDecl && fnName) {
              currentScope().names.add(fnName);
            }

            const fnScope = { names: new Set(), type: 'function' };

            if (n.type === 'FunctionExpression' && fnName) {
              fnScope.names.add(fnName);
            }

            collectParams(n, fnScope.names);
            scopeStack.push(fnScope);
            break;
          }
          case 'BlockStatement': {
            scopeStack.push({ names: new Set(), type: 'block' });
            break;
          }
          case 'CatchClause': {
            const s = new Set();
            if (n.param) collectBindingIdentifiers(n.param, s);
            scopeStack.push({ names: s, type: 'block' });
            break;
          }
          case 'VariableDeclaration': {
            const scope = currentScope();
            for (const d of n.declarations) {
              collectBindingIdentifiers(d.id, scope.names);
            }
            break;
          }
          case 'ClassDeclaration': {
            if (n.id?.name) {
              currentScope().names.add(n.id.name);
            }
            break;
          }
          case 'LabeledStatement': {
            if (n.label?.type === 'Identifier') currentScope().names.add(n.label.name);
            break;
          }
          case 'Identifier': {
            if (n.name === rootIdentifierName) return;

            if (parent?.type === 'Property' && parent.key === n && !parent.computed) return;
            if (parent?.type === 'MemberExpression' && parent.property === n && !parent.computed) {
              if (parent.object.type === 'ThisExpression') return;

              const full = memberToString(parent, this.source);
              if (!full) return;

              const declaredVariable = this.declaredVariables.get(full);
              if (declaredVariable) {
                declaredVariable.dependents.add(identifierName);
                dependencies.add(full);
              } else if (parent.object.type === 'Identifier') {
                const baseName = parent.object.name;
                const declaredBaseVariable = this.declaredVariables.get(baseName);
                if (
                  (declaredBaseVariable || baseName === this.iifeParamName) &&
                  !isInScope(baseName) &&
                  !jsBuiltIns.has(baseName)
                ) {
                  declaredBaseVariable?.dependents.add(identifierName);
                  dependencies.add(full);

                  const existingTracker = this.dependentsTracker.get(full);
                  if (existingTracker) {
                    existingTracker.add(identifierName);
                  } else {
                    this.dependentsTracker.set(full, new Set([identifierName]));
                  }
                }
              }
              return;
            }

            if (isInScope(n.name) || jsBuiltIns.has(n.name)) return;

            dependencies.add(n.name);

            const declaredVariable = this.declaredVariables.get(n.name);
            if (declaredVariable) {
              declaredVariable.dependents.add(identifierName);
            } else {
              const existing = this.dependentsTracker.get(n.name);
              if (existing) {
                existing.add(identifierName);
              } else {
                this.dependentsTracker.set(n.name, new Set([identifierName]));
              }
            }
            break;
          }
        }
      },
      leave: (n) => {
        switch (n.type) {
          case 'FunctionDeclaration':
          case 'FunctionExpression':
          case 'ArrowFunctionExpression':
          case 'BlockStatement':
          case 'CatchClause':
            if (scopeStack.length > 1) scopeStack.pop();
            break;
        }
      },
    });

    return dependencies;
  }

  /**
   * Get all extracted matches
   */
  getExtractedMatches() {
    return this.extractionStates.filter((state) => !!state.node);
  }

  /**
   * Get the source code
   */
  getSource() {
    return this.source;
  }
}
