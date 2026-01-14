import { extractNodeSource, indent, jsBuiltIns, memberToString } from './helpers.js';

/**
 * Extracts JavaScript code snippets based on analysis from JsAnalyzer.
 * Builds a self-contained IIFE that exports the extracted functions.
 */
export class JsExtractor {
  constructor(analyzer) {
    this.analyzer = analyzer;
  }

  /**
   * Check if arguments are safe (no side effects)
   */
  areSafeArgs(args, mode = 'strict') {
    return (args ?? []).every((arg) => {
      if (!arg) return false;
      if (arg.type === 'SpreadElement') return false;
      return this.isSafeInitializer(arg, mode);
    });
  }

  /**
   * Check if a node is safe to initialize without side effects
   */
  isSafeInitializer(node, mode = 'strict') {
    if (!node) return true;

    switch (node.type) {
      case 'Literal': {
        const literal = node;
        return (
          typeof literal.value === 'string' ||
          typeof literal.value === 'number' ||
          typeof literal.value === 'boolean' ||
          literal.value === null ||
          Boolean(literal.regex)
        );
      }
      case 'TemplateLiteral': {
        return node.expressions.every((expr) => this.isSafeInitializer(expr, mode));
      }
      case 'ArrayExpression': {
        return node.elements.every((elem) => {
          if (!elem) return true;
          if (elem.type === 'SpreadElement') return false;
          return this.isSafeInitializer(elem, mode);
        });
      }
      case 'ObjectExpression': {
        return node.properties.every((prop) => {
          if (prop.type !== 'Property') return false;
          if (prop.computed) return false;
          if (prop.kind !== 'init') return false;

          const value = prop.value;
          if (!value) return false;

          return (
            value.type === 'FunctionExpression' ||
            value.type === 'ArrowFunctionExpression' ||
            value.type === 'Literal'
          );
        });
      }
      case 'CallExpression': {
        if (node.callee.type === 'Identifier' && jsBuiltIns.has(node.callee.name)) {
          return this.areSafeArgs(node.arguments, mode);
        } else if (node.callee.type === 'MemberExpression') {
          if (!this.isSafeInitializer(node.callee.object, mode)) return false;

          if (mode === 'strict') {
            const propertyName = node.callee.property.type === 'Identifier' ? node.callee.property.name : '';
            if (node.callee.computed || !jsBuiltIns.has(propertyName)) {
              return false;
            }
          }

          return this.areSafeArgs(node.arguments, mode);
        }
        return false;
      }
      case 'NewExpression': {
        if (node.callee.type === 'Identifier') {
          if (jsBuiltIns.has(node.callee.name)) {
            return this.areSafeArgs(node.arguments, mode);
          }
          if (mode === 'loose') {
            return this.areSafeArgs(node.arguments, mode);
          }
        }
        return false;
      }
      case 'UnaryExpression': {
        return this.isSafeInitializer(node.argument, mode);
      }
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
      case 'Identifier': {
        return true;
      }
      case 'MemberExpression': {
        if (mode === 'loose') {
          if (node.computed && !this.isSafeInitializer(node.property, mode)) {
            return false;
          }
          return this.isSafeInitializer(node.object, mode);
        }
        return false;
      }
      case 'LogicalExpression':
      case 'BinaryExpression': {
        return this.isSafeInitializer(node.left, mode) && this.isSafeInitializer(node.right, mode);
      }
      case 'ConditionalExpression': {
        if (mode === 'loose') {
          return (
            this.isSafeInitializer(node.test, mode) &&
            this.isSafeInitializer(node.consequent, mode) &&
            this.isSafeInitializer(node.alternate, mode)
          );
        }
        return false;
      }
      case 'SequenceExpression': {
        if (mode === 'loose') {
          return node.expressions.every((expr) => this.isSafeInitializer(expr, mode));
        }
        return false;
      }
      case 'AssignmentExpression': {
        if (node.left.type === 'MemberExpression' && !node.left.computed) {
          const object = node.left.object;
          if (
            object.type === 'Identifier' &&
            this.analyzer.declaredVariables.get(object.name)?.node.init !== undefined
          ) {
            return this.isSafeInitializer(node.right, mode);
          }
        } else if (node.left.type === 'Identifier') {
          if (this.analyzer.declaredVariables.has(node.left.name)) {
            return this.isSafeInitializer(node.right, mode);
          }
        }
        return false;
      }
      default:
        return false;
    }
  }

  /**
   * Get a fallback initializer based on node type
   */
  getInitializerFallback(init) {
    switch (init?.type) {
      case 'ObjectExpression':
      case 'NewExpression':
      case 'MemberExpression':
      case 'LogicalExpression':
        return '{}';
      case 'ArrayExpression':
        return '[]';
      default:
        return 'undefined';
    }
  }

  /**
   * Render a node to JavaScript source code
   */
  renderNode(node, preDeclared, options = {}) {
    const source = this.analyzer.getSource();
    const declaredVariables = this.analyzer.declaredVariables;

    const sideEffectPolicy = options.disallowSideEffectInitializers;
    const sideEffectMode =
      typeof sideEffectPolicy === 'object' && sideEffectPolicy !== null
        ? sideEffectPolicy.mode ?? 'strict'
        : 'strict';
    const canDisallow = Boolean(sideEffectPolicy);

    const assignmentTarget =
      node.type === 'AssignmentExpression'
        ? node
        : node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression'
          ? node.expression
          : null;

    const init =
      assignmentTarget && assignmentTarget.operator === '='
        ? assignmentTarget.right
        : node.type === 'VariableDeclarator'
          ? node.init
          : null;

    const forceRemove = canDisallow && init && !this.isSafeInitializer(init, sideEffectMode);
    const initializerFallback = this.getInitializerFallback(init);

    let initSource = initializerFallback;

    if (!forceRemove && init) {
      if (!preDeclared && init.type === 'Identifier' && !declaredVariables.has(init.name)) {
        initSource = initializerFallback;
      } else {
        const left = assignmentTarget?.left;

        if (left?.type === 'MemberExpression' && init) {
          if (
            canDisallow &&
            left.object.type === 'Identifier' &&
            init.type !== 'FunctionExpression' &&
            init.type !== 'ArrowFunctionExpression' &&
            init.type !== 'LogicalExpression'
          ) {
            return `${indent}// Skipped ${memberToString(left, source)} assignment.`;
          }
        }

        initSource = extractNodeSource(init, source)?.trim().replace(/;\s*$/, '') || 'undefined';
      }
    }

    if (!forceRemove && init && init.type === 'SequenceExpression' && !initSource.startsWith('(')) {
      initSource = `(${initSource})`;
    }

    const idName =
      node.type === 'VariableDeclarator' && node.id.type === 'Identifier'
        ? node.id.name
        : assignmentTarget && assignmentTarget.left.type === 'Identifier'
          ? assignmentTarget.left.name
          : assignmentTarget?.type === 'AssignmentExpression'
            ? memberToString(assignmentTarget.left, source)?.trim()
            : 'unknown';

    const assignmentExpression = `${idName} = ${initSource};`;

    if (node.type === 'VariableDeclarator' && node.init && !preDeclared) {
      return `${indent}var ${assignmentExpression}`;
    }

    return `${indent}${assignmentExpression}`;
  }

  /**
   * Create a wrapper function for an extracted function
   */
  createWrapperFunction(name, node) {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      this.analyzer.declaredVariables.has(node.callee.name)
    ) {
      const params = this.parseFunctionArguments(node.arguments);
      return this.generateWrapper(name, node.callee.name, params);
    } else if (
      node.type === 'VariableDeclarator' &&
      node.init?.type === 'FunctionExpression' &&
      node.id.type === 'Identifier'
    ) {
      const params = this.parseFunctionArguments(node.init.params);
      return this.generateWrapper(name, node.id.name, params);
    } else if (node.type === 'Identifier') {
      const identifierName = node.name;
      const decl = this.analyzer.declaredVariables.get(identifierName);

      if (decl?.node?.type === 'VariableDeclarator' && decl.node.init?.type === 'FunctionExpression') {
        const params = this.parseFunctionArguments(decl.node.init.params);
        return this.generateWrapper(name, identifierName, params);
      } else if (decl || this.analyzer.declaredVariables.has(identifierName)) {
        return this.generateWrapper(name, identifierName, 'input');
      }
    }
  }

  /**
   * Generate wrapper function code
   */
  generateWrapper(functionName, targetFunction, args) {
    return [
      `${indent}function ${functionName}(input) {`,
      `${indent}${indent}return ${targetFunction}(${args});`,
      `${indent}}`,
    ].join('\n');
  }

  /**
   * Parse function arguments to a string
   */
  parseFunctionArguments(args) {
    const params = [];

    for (const arg of args) {
      if (arg.type === 'Identifier' && this.analyzer.declaredVariables.has(arg.name)) {
        params.push(arg.name);
      } else if (arg.type === 'Literal' && (typeof arg.value === 'string' || typeof arg.value === 'number')) {
        params.push(JSON.stringify(arg.value));
      } else if (!params.includes('input')) {
        params.push('input');
      }
    }

    return params.join(', ');
  }

  /**
   * Build the extracted script with all dependencies
   */
  buildScript(config) {
    const {
      maxDepth = Infinity,
      forceVarPredeclaration = false,
      exportRawValues = false,
      rawValueOnly: skipEmitFor = [],
    } = config;

    const extractions = this.analyzer.getExtractedMatches();
    const seen = new Set(extractions.map((e) => e.metadata?.name || ''));

    const snippets = [];
    const predeclaredVarSet = new Set();
    const exported = new Map();
    const exportedRawValues = {};

    const registerPredeclaredVar = (name) => {
      if (!name || name.includes('.')) return;
      predeclaredVarSet.add(name);
    };

    const visit = (metadata, depth = 0) => {
      if (!metadata || depth > maxDepth) return;

      for (const dependency of metadata.dependencies) {
        if (seen.has(dependency)) continue;

        seen.add(dependency);

        const dependencyMetadata = this.analyzer.declaredVariables.get(dependency);

        if (!dependencyMetadata) continue;

        const shouldPredeclare = forceVarPredeclaration || dependencyMetadata.predeclared;
        if (shouldPredeclare) {
          registerPredeclaredVar(dependency);
        }

        if (!dependency.includes('.')) {
          visit(dependencyMetadata, depth + 1);
        }

        snippets.push(this.renderNode(dependencyMetadata.node, shouldPredeclare, config));
      }
    };

    for (const extraction of extractions) {
      const fname = extraction.config.friendlyName;
      const shouldSkip = fname && skipEmitFor.includes(fname);

      if (extraction.metadata) {
        if (!shouldSkip) snippets.push(`${indent}//#region --- start [${fname || 'Unknown'}] ---`);

        const shouldPredeclare = (forceVarPredeclaration || extraction.metadata.predeclared) && !shouldSkip;

        if (shouldPredeclare) {
          registerPredeclaredVar(extraction.metadata.name);
        }

        if (extraction.config.collectDependencies && !shouldSkip) {
          visit(extraction.metadata);
        }

        if (extraction.matchContext && fname) {
          exported.set(fname, extraction.matchContext);

          if (exportRawValues) {
            const ctx = extraction.matchContext;
            const src = this.analyzer.getSource();
            let rawValue = null;

            if (ctx.type === 'Property') {
              rawValue = extractNodeSource(ctx.value, src);
            } else if (ctx.type === 'Identifier') {
              rawValue = ctx.name;
            } else {
              rawValue = extractNodeSource(ctx, src);
            }

            exportedRawValues[fname] = rawValue;
          }
        }

        if (!shouldSkip) {
          snippets.push(this.renderNode(extraction.metadata.node, shouldPredeclare, config));
          snippets.push(`${indent}//#endregion --- end [${fname || 'Unknown'}] ---\n`);
        }
      }
    }

    const output = [];

    output.push('const window = Object.assign({}, globalThis);');
    output.push('const document = {};');
    output.push('const self = window;\n');

    output.push(`const exportedVars = (function(${this.analyzer.iifeParamName}) {`);
    if (predeclaredVarSet.size > 0) {
      output.push(`${indent}var ${Array.from(predeclaredVarSet).join(', ')};\n`);
    }

    output.push(snippets.join('\n'));

    const exportedVars = [];

    for (const [friendlyName, node] of exported) {
      let currentFunctionNode = null;

      if (node.type === 'Identifier') {
        const decl = this.analyzer.declaredVariables.get(node.name);
        if (decl?.node?.type === 'VariableDeclarator' && decl.node.init?.type === 'FunctionExpression') {
          currentFunctionNode = decl.node;
        }
      } else if (node.type === 'CallExpression') {
        currentFunctionNode = node;
      }

      if (currentFunctionNode) {
        const wrapper = this.createWrapperFunction(friendlyName, currentFunctionNode);
        if (wrapper) {
          output.push(`${wrapper}\n`);
          exportedVars.push(friendlyName);
        }
      }
    }

    if (exportRawValues) {
      const rawJson = JSON.stringify(exportedRawValues, null, indent.length);
      const rawJsonLines = rawJson.split('\n');

      const formattedRawJson = `${rawJsonLines[0]}\n${rawJsonLines.slice(1).map((line) => indent + line).join('\n')}`;

      output.push(`${indent}const rawValues = ${formattedRawJson};\n`);

      exportedVars.push('rawValues');
    }

    output.push(`${indent}return { ${exportedVars.join(', ')} };`);
    output.push('})({});\n');

    return {
      output: output.join('\n'),
      exported: exportedVars,
      exportedRawValues: exportRawValues ? exportedRawValues : undefined,
    };
  }
}
