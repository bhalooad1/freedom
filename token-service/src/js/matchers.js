import { WALK_STOP, walkAst } from './helpers.js';

/**
 * Matcher for the signature decipher function.
 * Looks for a function with 3 parameters that contains a decodeURIComponent call.
 * Pattern: function(a, b, c) { ... b && (b = sigFn(64, decodeURIComponent(sig))) ... }
 */
export function sigMatcher(node) {
  if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
    const initNode = node.init;

    if (initNode?.type === 'FunctionExpression' && initNode.params.length === 3) {
      const functionBody = initNode.body;
      if (!functionBody || functionBody.type !== 'BlockStatement') return false;

      for (const st of functionBody.body) {
        if (st?.type === 'ExpressionStatement') {
          const expression = st.expression;
          if (
            expression.type === 'LogicalExpression' &&
            expression.operator === '&&' &&
            expression.left.type === 'Identifier' &&
            expression.right.type === 'SequenceExpression'
          ) {
            const firstExp = expression.right.expressions[0];
            if (
              firstExp.type === 'AssignmentExpression' &&
              firstExp.operator === '=' &&
              firstExp.left.type === 'Identifier' &&
              firstExp.right.type === 'CallExpression' &&
              firstExp.right.callee.type === 'Identifier'
            ) {
              const rightArguments = firstExp.right.arguments;
              if (rightArguments.length >= 1) {
                const callExpression = rightArguments.find((exp) => exp.type === 'CallExpression');
                if (
                  callExpression?.type === 'CallExpression' &&
                  callExpression?.callee.type === 'Identifier' &&
                  callExpression.callee.name === 'decodeURIComponent' &&
                  callExpression.arguments[0].type === 'Identifier'
                ) {
                  return firstExp.right;
                }
              }
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * Matcher for the n-transform function.
 * Looks for a variable that's initialized to an array with an identifier as first element.
 * Pattern: var someVar = [nTransformFunc, ...];
 */
export function nMatcher(node) {
  if (node.type !== 'VariableDeclarator') return false;

  if (
    node.id.type === 'Identifier' &&
    node.init?.type === 'ArrayExpression' &&
    node.init.elements[0]?.type === 'Identifier'
  ) {
    return node.init.elements[0];
  }

  return false;
}

/**
 * Matcher for the signature timestamp.
 * Looks for an object property named 'signatureTimestamp'.
 */
export function timestampMatcher(node) {
  if (node.type !== 'VariableDeclarator' || node.init?.type !== 'FunctionExpression') {
    return false;
  }

  const funcBody = node.init.body;
  if (!funcBody) return false;

  let foundObject = null;

  walkAst(funcBody, (innerNode) => {
    if (innerNode.type === 'ObjectExpression') {
      for (const prop of innerNode.properties) {
        if (prop.type === 'Property' && prop.key.type === 'Identifier' && prop.key.name === 'signatureTimestamp') {
          foundObject = prop;
          return WALK_STOP;
        }
      }
    }
  });

  return foundObject || false;
}
