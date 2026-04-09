((app) => {  
  const TEMPLATE_VERSION = '20260409p';

  app.component('queryEditor', {
    templateUrl: `components/query-editor.html?v=${TEMPLATE_VERSION}`,
    bindings: {
      query: '=',
      schema: '<',
      api: '=?',
      onChange: '&?'
    },
    controller: ['$element', function ($element) {
      const $ctrl = this;
      let editor = null;
      let tooltipElement = null;
      let hideTooltipTimeout = null;
      let resizeHandler = null;
      const graphqlKeywords = [
        'query',
        'mutation',
        'subscription',
        'fragment',
        'on',
        'schema',
        'type',
        'interface',
        'union',
        'enum',
        'input',
        'scalar',
        'directive',
        'implements',
        'extend',
        'true',
        'false',
        'null'
      ];

      function ensureGraphqlMode() {
        if (typeof window.CodeMirror === 'undefined') {
          return;
        }

        if (window.CodeMirror.modes && window.CodeMirror.modes['graphql-playground']) {
          return;
        }

        const operationKeywordPattern = /^(?:query|mutation|subscription|fragment|on)\b/;
        const schemaKeywordPattern = /^(?:schema|type|interface|union|enum|input|scalar|directive|implements|extend)\b/;
        const atomPattern = /^(?:true|false|null)\b/;

        window.CodeMirror.defineMode('graphql-playground', function () {
          return {
            startState() {
              return {
                inString: false,
                blockString: false,
                blockComment: false,
                expectField: false,
                expectArgument: false,
                expectType: false,
                argumentDepth: 0,
                selectionDepth: 0
              };
            },
            token(stream, state) {
              if (state.blockComment) {
                if (stream.match(/.*?\*\//)) {
                  state.blockComment = false;
                } else {
                  stream.skipToEnd();
                }

                return 'comment';
              }

              if (state.blockString) {
                if (stream.match(/.*?"""/)) {
                  state.blockString = false;
                } else {
                  stream.skipToEnd();
                }

                return 'string';
              }

              if (state.inString) {
                let escaped = false;
                let next;

                while ((next = stream.next()) != null) {
                  if (next === '"' && !escaped) {
                    state.inString = false;
                    break;
                  }

                  escaped = !escaped && next === '\\';
                }

                return 'string';
              }

              if (stream.eatSpace()) {
                return null;
              }

              if (stream.match(/^#.*/)) {
                return 'comment';
              }

              if (stream.match('/*')) {
                state.blockComment = true;
                return 'comment';
              }

              if (stream.match('"""')) {
                state.blockString = true;
                return 'string';
              }

              if (stream.peek() === '"') {
                stream.next();
                state.inString = true;
                return 'string';
              }

              if (stream.match(atomPattern)) {
                return 'atom';
              }

              if (stream.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)) {
                return 'number';
              }

              if (stream.match(/^@[A-Za-z_][A-Za-z0-9_]*/)) {
                return 'meta';
              }

              if (stream.match(/^\$[A-Za-z_][A-Za-z0-9_]*/)) {
                state.expectArgument = false;
                return 'variable-2';
              }

              if (stream.match(/^!/)) {
                return 'non-null-modifier';
              }

              if (stream.match(/^[()\[\]{}]/)) {
                const bracket = stream.current();

                if (bracket === '(') {
                  state.argumentDepth += 1;
                  state.expectArgument = true;
                } else if (bracket === ')') {
                  state.argumentDepth = Math.max(0, state.argumentDepth - 1);
                  state.expectArgument = state.argumentDepth > 0;
                } else if (bracket === '{') {
                  state.selectionDepth += 1;
                } else if (bracket === '}') {
                  state.selectionDepth = Math.max(0, state.selectionDepth - 1);
                }

                if (bracket === '[' || bracket === ']') {
                  return 'list-modifier';
                }

                return 'bracket';
              }

              if (stream.match(/^,/)) {
                if (state.argumentDepth > 0) {
                  state.expectArgument = true;
                  state.expectType = false;
                }

                return 'operator';
              }

              if (stream.match(/^[:=|&!]/)) {
                const operator = stream.current();

                if (operator === ':') {
                  state.expectType = true;
                } else if (operator === '=') {
                  state.expectType = false;
                } else if (operator === '|') {
                  state.expectType = true;
                }

                return 'operator';
              }

              if (stream.match(/^[A-Z][A-Za-z0-9_]*/)) {
                state.expectType = false;
                return 'type-name';
              }

              if (stream.match(/^[a-z_][A-Za-z0-9_]*/i)) {
                const identifier = stream.current();

                if (state.expectArgument) {
                  state.expectArgument = false;
                  return 'variable';
                }

                if (state.expectField) {
                  state.expectField = false;
                  return 'def';
                }

                if (state.selectionDepth === 0 && state.argumentDepth === 0 && operationKeywordPattern.test(identifier)) {
                  state.expectField = true;
                  state.expectArgument = false;
                  state.expectType = false;
                  return 'keyword';
                }

                if (state.selectionDepth === 0 && state.argumentDepth === 0 && schemaKeywordPattern.test(identifier)) {
                  state.expectField = false;
                  state.expectArgument = false;
                  state.expectType = true;
                  return 'keyword';
                }

                return 'property';
              }

              stream.next();
              return null;
            },
            lineComment: '#'
          };
        });
      }

      function createCompletion(text, meta, renderText, completionType) {
        return {
          text,
          displayText: renderText || text,
          className: completionType ? `cm-hint-${completionType}` : '',
          hint(cm, data, completion) {
            const from = data.from || cm.getCursor();
            const to = data.to || cm.getCursor();

            if (typeof completion.apply === 'function') {
              completion.apply(cm, from, to, completion);
              return;
            }

            cm.replaceRange(completion.text, from, to);

            const cursorOffset = completion.cursorOffset;

            if (typeof cursorOffset === 'number') {
              const startIndex = cm.indexFromPos(from);
              cm.setCursor(cm.posFromIndex(startIndex + cursorOffset));
            }
          }
        };
      }

      function getNamedType(typeRef) {
        if (!typeRef) {
          return null;
        }

        if (typeRef.name) {
          return typeRef;
        }

        return typeRef.ofType ? getNamedType(typeRef.ofType) : null;
      }

      function getTypeMap(schema) {
        if (!schema || !Array.isArray(schema.types)) {
          return new Map();
        }

        return new Map(schema.types.filter((type) => type && type.name).map((type) => [type.name, type]));
      }

      function getRootTypeName(schema, operation) {
        if (!schema) {
          return null;
        }

        if (operation === 'mutation') {
          return schema.mutationType && schema.mutationType.name;
        }

        if (operation === 'subscription') {
          return schema.subscriptionType && schema.subscriptionType.name;
        }

        return schema.queryType && schema.queryType.name;
      }

      function getFieldMap(typeRef) {
        if (!typeRef || !Array.isArray(typeRef.fields)) {
          return new Map();
        }

        return new Map(typeRef.fields.filter((field) => field && field.name).map((field) => [field.name, field]));
      }

      function getFieldByName(typeMap, typeName, fieldName) {
        if (!typeName || !fieldName) {
          return null;
        }

        const typeRef = typeMap.get(typeName);
        const fieldMap = getFieldMap(typeRef);

        return fieldMap.get(fieldName) || null;
      }

      function typeRefToString(typeRef) {
        if (!typeRef) {
          return '';
        }

        if (typeRef.kind === 'NON_NULL') {
          return `${typeRefToString(typeRef.ofType)}!`;
        }

        if (typeRef.kind === 'LIST') {
          return `[${typeRefToString(typeRef.ofType)}]`;
        }

        return typeRef.name || '';
      }

      function buildTypeTokens(typeRef) {
        if (!typeRef) {
          return [];
        }

        if (typeRef.kind === 'LIST') {
          return [
            { text: '[', className: 'field-type-prefix' },
            ...buildTypeTokens(typeRef.ofType),
            { text: ']', className: 'field-type-suffix' }
          ];
        }

        if (typeRef.kind === 'NON_NULL') {
          return [
            ...buildTypeTokens(typeRef.ofType),
            { text: '!', className: 'field-type-non-null' }
          ];
        }

        return [{
          text: typeRef.name || '',
          className: 'field-type'
        }];
      }

      function ensureTooltipElement() {
        if (tooltipElement || typeof document === 'undefined') {
          return tooltipElement;
        }

        tooltipElement = document.createElement('div');
        tooltipElement.className = 'schema-tooltip';
        tooltipElement.style.display = 'none';
        document.body.appendChild(tooltipElement);
        return tooltipElement;
      }

      function renderTooltip(payload, eventTarget, event) {
        const tooltip = ensureTooltipElement();

        if (!tooltip || !payload || !eventTarget || typeof eventTarget.getBoundingClientRect !== 'function') {
          return;
        }

        const rect = eventTarget.getBoundingClientRect();
        const tooltipWidth = 320;
        const gap = 8;
        const maxLeft = Math.max(gap, window.innerWidth - tooltipWidth - gap);
        const anchorLeft = event && typeof event.clientX === 'number' ? event.clientX : rect.left;
        const anchorTop = event && typeof event.clientY === 'number' ? event.clientY : rect.bottom;
        const top = Math.min(window.innerHeight - 120, anchorTop + gap);
        const left = Math.min(anchorLeft, maxLeft);
        const typeTokens = buildTypeTokens(payload.typeRef);
        const nameClass = payload.labelClass || 'field';

        tooltip.innerHTML = `
          <div class="schema-tooltip-signature">
            <span class="schema-tooltip-name schema-tooltip-name-${nameClass}"></span>
            ${Array.isArray(payload.arguments) && payload.arguments.length ? '<span class="schema-tooltip-inline-args"></span>' : ''}
            ${typeTokens.length ? '<span>:</span><span class="schema-tooltip-type-tokens"></span>' : ''}
          </div>
          ${Array.isArray(payload.usages) && payload.usages.length ? '<div class="schema-tooltip-usage-list"></div>' : ''}
          ${payload.description ? '<div class="schema-tooltip-description"></div>' : ''}
        `;

        const nameElement = tooltip.querySelector('.schema-tooltip-name');
        if (nameElement) {
          nameElement.textContent = payload.label || '';
        }

        const typeTokensContainer = tooltip.querySelector('.schema-tooltip-type-tokens');
        if (typeTokensContainer) {
          typeTokens.forEach((token) => {
            const tokenElement = document.createElement('span');
            tokenElement.className = token.className;
            tokenElement.textContent = token.text;
            typeTokensContainer.appendChild(tokenElement);
          });
        }

        const descriptionElement = tooltip.querySelector('.schema-tooltip-description');
        if (descriptionElement) {
          descriptionElement.textContent = payload.description || '';
        }

        const argsElement = tooltip.querySelector('.schema-tooltip-inline-args');
        if (argsElement) {
          const openParen = document.createElement('span');
          openParen.textContent = '(';
          argsElement.appendChild(openParen);

          payload.arguments.forEach((arg, index) => {
            const name = document.createElement('span');
            name.className = 'schema-tooltip-name schema-tooltip-name-argument';
            name.textContent = arg.name;
            argsElement.appendChild(name);

            const separator = document.createElement('span');
            separator.textContent = ':';
            argsElement.appendChild(separator);

            const typeContainer = document.createElement('span');
            typeContainer.className = 'schema-tooltip-type-tokens';
            buildTypeTokens(arg.typeRef).forEach((token) => {
              const tokenElement = document.createElement('span');
              tokenElement.className = token.className;
              tokenElement.textContent = token.text;
              typeContainer.appendChild(tokenElement);
            });
            argsElement.appendChild(typeContainer);

            if (index < payload.arguments.length - 1) {
              const comma = document.createElement('span');
              comma.textContent = ',';
              argsElement.appendChild(comma);
            }
          });

          const closeParen = document.createElement('span');
          closeParen.textContent = ')';
          argsElement.appendChild(closeParen);
        }

        const usageListElement = tooltip.querySelector('.schema-tooltip-usage-list');
        if (usageListElement) {
          payload.usages.forEach((usage) => {
            const usageItem = document.createElement('div');
            usageItem.className = 'schema-tooltip-usage-item';

            const fieldName = document.createElement('span');
            fieldName.className = 'schema-tooltip-name schema-tooltip-name-field';
            fieldName.textContent = usage.fieldName;
            usageItem.appendChild(fieldName);

            if (Array.isArray(usage.arguments) && usage.arguments.length) {
              const inlineArgs = document.createElement('span');
              inlineArgs.className = 'schema-tooltip-inline-args';

              const openParen = document.createElement('span');
              openParen.className = 'schema-tooltip-muted';
              openParen.textContent = '(';
              inlineArgs.appendChild(openParen);

              usage.arguments.forEach((arg, index) => {
                const argName = document.createElement('span');
                argName.className = arg.isHighlighted
                  ? 'schema-tooltip-name schema-tooltip-name-argument'
                  : 'schema-tooltip-muted';
                argName.textContent = arg.name;
                inlineArgs.appendChild(argName);

                const separator = document.createElement('span');
                separator.className = 'schema-tooltip-muted';
                separator.textContent = ':';
                inlineArgs.appendChild(separator);

                const typeContainer = document.createElement('span');
                typeContainer.className = 'schema-tooltip-type-tokens';

                buildTypeTokens(arg.typeRef).forEach((token) => {
                  const tokenElement = document.createElement('span');
                  tokenElement.className = arg.isHighlighted
                    ? token.className
                    : `${token.className} schema-tooltip-muted`;
                  tokenElement.textContent = token.text;
                  typeContainer.appendChild(tokenElement);
                });
                inlineArgs.appendChild(typeContainer);

                if (index < usage.arguments.length - 1) {
                  const comma = document.createElement('span');
                  comma.className = 'schema-tooltip-muted';
                  comma.textContent = ',';
                  inlineArgs.appendChild(comma);
                }
              });

              const closeParen = document.createElement('span');
              closeParen.className = 'schema-tooltip-muted';
              closeParen.textContent = ')';
              inlineArgs.appendChild(closeParen);
              usageItem.appendChild(inlineArgs);
            }

            if (usage.returnTypeRef) {
              const returnSeparator = document.createElement('span');
              returnSeparator.className = 'schema-tooltip-muted';
              returnSeparator.textContent = ':';
              usageItem.appendChild(returnSeparator);

              const returnType = document.createElement('span');
              returnType.className = 'schema-tooltip-type-tokens';
              buildTypeTokens(usage.returnTypeRef).forEach((token) => {
                const tokenElement = document.createElement('span');
                tokenElement.className = `${token.className} schema-tooltip-muted`;
                tokenElement.textContent = token.text;
                returnType.appendChild(tokenElement);
              });
              usageItem.appendChild(returnType);
            }

            usageListElement.appendChild(usageItem);
          });
        }

        tooltip.style.top = `${Math.max(gap, top)}px`;
        tooltip.style.left = `${Math.max(gap, left)}px`;
        tooltip.style.display = 'block';
        tooltip.classList.remove('is-visible');

        if (hideTooltipTimeout) {
          window.clearTimeout(hideTooltipTimeout);
          hideTooltipTimeout = null;
        }

        window.requestAnimationFrame(() => {
          if (tooltip) {
            tooltip.classList.add('is-visible');
          }
        });
      }

      function hideTooltip() {
        if (tooltipElement) {
          tooltipElement.classList.remove('is-visible');

          if (hideTooltipTimeout) {
            window.clearTimeout(hideTooltipTimeout);
          }

          hideTooltipTimeout = window.setTimeout(() => {
            if (tooltipElement) {
              tooltipElement.style.display = 'none';
            }
            hideTooltipTimeout = null;
          }, 300);
        }
      }

      function toVariableNameSuffix(typeRef) {
        const typeText = typeRefToString(typeRef);

        if (!typeText) {
          return 'Value';
        }

        return typeText
          .replace(/[\[\]!]/g, ' ')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join('') || 'Value';
      }

      function buildOperationArgumentBindings(args, existingVariables) {
        const variableRegistry = new Map();
        const bindings = [];

        (existingVariables || []).forEach((variable) => {
          if (!variable || !variable.name) {
            return;
          }

          variableRegistry.set(variable.name, variable.typeString || '');
        });

        (args || []).forEach((arg) => {
          if (!arg || !arg.name) {
            return;
          }

          const typeString = typeRefToString(arg.type);
          const baseVariableName = arg.name;
          const existingType = variableRegistry.get(baseVariableName);
          let variableName = baseVariableName;

          if (existingType && existingType !== typeString) {
            variableName = `${baseVariableName}${toVariableNameSuffix(arg.type)}`;

            let duplicateIndex = 2;
            while (variableRegistry.has(variableName) && variableRegistry.get(variableName) !== typeString) {
              variableName = `${baseVariableName}${toVariableNameSuffix(arg.type)}${duplicateIndex}`;
              duplicateIndex += 1;
            }
          }

          if (!variableRegistry.has(variableName)) {
            variableRegistry.set(variableName, typeString);
          }

          bindings.push({
            argumentName: arg.name,
            variableName,
            typeString
          });
        });

        return bindings;
      }

      function parseOperationVariables(headerText) {
        const variables = [];
        const variablePattern = /\$([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([!\[\]A-Za-z0-9_]+)/g;
        let match = variablePattern.exec(headerText);

        while (match) {
          variables.push({
            name: match[1],
            typeString: match[2]
          });
          match = variablePattern.exec(headerText);
        }

        return variables;
      }

      function resolveOperationVariable(schema, queryText, variableName) {
        const operationHeaderMatch = /(query|mutation|subscription)\b([\s\S]*?)\{/.exec(queryText || '');

        if (!operationHeaderMatch) {
          return null;
        }

        const variables = parseOperationVariables(operationHeaderMatch[2] || '');
        const variable = variables.find((item) => item.name === variableName);

        if (!variable) {
          return null;
        }

        return {
          label: `$${variable.name}`,
          labelClass: 'argument',
          typeRef: parseTypeRefFromString(variable.typeString, schema),
          usages: collectVariableUsages(schema, queryText, variableName),
          description: ''
        };
      }

      function collectVariableUsages(schema, text, variableName) {
        const typeMap = getTypeMap(schema);
        let operation = 'query';
        let rootTypeName = getRootTypeName(schema, operation);
        const typeStack = rootTypeName ? [rootTypeName] : [];
        let pendingFieldRef = null;
        let currentArgumentField = null;
        let currentArgumentName = null;
        let parenDepth = 0;
        let i = 0;
        const usages = [];

        while (i < text.length) {
          const char = text[i];
          const nextThree = text.slice(i, i + 3);

          if (nextThree === '"""') {
            const end = text.indexOf('"""', i + 3);
            i = end === -1 ? text.length : end + 3;
            continue;
          }

          if (text.slice(i, i + 2) === '/*') {
            const end = text.indexOf('*/', i + 2);
            i = end === -1 ? text.length : end + 2;
            continue;
          }

          if (char === '#') {
            const end = text.indexOf('\n', i + 1);
            i = end === -1 ? text.length : end + 1;
            continue;
          }

          if (char === '"') {
            i += 1;
            while (i < text.length) {
              const stringChar = text[i];

              if (stringChar === '\\') {
                i += 2;
                continue;
              }

              if (stringChar === '"') {
                i += 1;
                break;
              }

              i += 1;
            }

            continue;
          }

          if (/\s/.test(char)) {
            i += 1;
            continue;
          }

          if (isNameStart(char)) {
            let end = i + 1;

            while (end < text.length && isNamePart(text[end])) {
              end += 1;
            }

            const word = text.slice(i, end);

            if (word === 'query' || word === 'mutation' || word === 'subscription') {
              operation = word;
              rootTypeName = getRootTypeName(schema, operation);
              typeStack.length = 0;
              if (rootTypeName) {
                typeStack.push(rootTypeName);
              }
              pendingFieldRef = null;
              currentArgumentField = null;
              currentArgumentName = null;
              parenDepth = 0;
              i = end;
              continue;
            }

            if (parenDepth > 0 && currentArgumentField) {
              const argumentRef = (currentArgumentField.args || []).find((arg) => arg && arg.name === word);

              if (argumentRef) {
                currentArgumentName = word;
              }
            } else {
              const currentTypeName = typeStack[typeStack.length - 1];
              pendingFieldRef = getFieldByName(typeMap, currentTypeName, word);
            }

            i = end;
            continue;
          }

          if (char === '$') {
            let end = i + 1;

            while (end < text.length && isNamePart(text[end])) {
              end += 1;
            }

            const usedVariableName = text.slice(i + 1, end);

            if (usedVariableName === variableName && currentArgumentField && currentArgumentName) {
              usages.push({
                fieldName: currentArgumentField.name,
                arguments: (currentArgumentField.args || []).map((arg) => ({
                  name: arg.name,
                  typeRef: arg.type,
                  isHighlighted: arg.name === currentArgumentName
                })),
                returnTypeRef: currentArgumentField.type
              });
            }

            i = end;
            continue;
          }

          if (char === '(') {
            parenDepth += 1;
            if (pendingFieldRef) {
              currentArgumentField = pendingFieldRef;
            }
            i += 1;
            continue;
          }

          if (char === ')') {
            parenDepth = Math.max(0, parenDepth - 1);
            if (parenDepth === 0) {
              currentArgumentField = null;
              currentArgumentName = null;
            }
            i += 1;
            continue;
          }

          if (char === '{') {
            if (pendingFieldRef) {
              const childType = getNamedType(pendingFieldRef.type);
              if (childType && childType.name) {
                typeStack.push(childType.name);
              }
            }
            pendingFieldRef = null;
            i += 1;
            continue;
          }

          if (char === '}') {
            if (typeStack.length > 1) {
              typeStack.pop();
            }
            pendingFieldRef = null;
            i += 1;
            continue;
          }

          if (char === ',') {
            currentArgumentName = null;
            i += 1;
            continue;
          }

          i += 1;
        }

        return usages;
      }

      function parseTypeRefFromString(typeString) {
        if (!typeString) {
          return null;
        }

        let index = 0;

        function parseInner() {
          if (typeString[index] === '[') {
            index += 1;
            const inner = parseInner();

            if (typeString[index] === ']') {
              index += 1;
            }

            let listType = { kind: 'LIST', ofType: inner };

            if (typeString[index] === '!') {
              index += 1;
              listType = { kind: 'NON_NULL', ofType: listType };
            }

            return listType;
          }

          const nameMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(typeString.slice(index));

          if (!nameMatch) {
            return null;
          }

          index += nameMatch[0].length;
          let namedType = getTypeMap($ctrl.schema).get(nameMatch[0]) || { kind: 'NAMED', name: nameMatch[0] };

          if (typeString[index] === '!') {
            index += 1;
            namedType = { kind: 'NON_NULL', ofType: namedType };
          }

          return namedType;
        }

        return parseInner();
      }

      function resolveQueryHoverPayload(cm, position) {
        const token = cm.getTokenAt(position);

        if (!token || !token.string || !token.type) {
          return null;
        }

        const tokenText = token.string.replace(/^"+|"+$/g, '');
        const textBeforeToken = cm.getValue().slice(0, cm.indexFromPos({ line: position.line, ch: token.start }));
        const context = resolveQueryContext($ctrl.schema, textBeforeToken);

        if (token.type.indexOf('variable-2') !== -1) {
          return resolveOperationVariable($ctrl.schema, cm.getValue(), tokenText.replace(/^\$/, ''));
        }

        if (token.type.indexOf('type-name') !== -1) {
          const schemaType = getTypeMap($ctrl.schema).get(tokenText);

          if (!schemaType) {
            return null;
          }

          return {
            label: schemaType.name,
            labelClass: 'type',
            typeRef: schemaType,
            description: schemaType.description || ''
          };
        }

        if (token.type.indexOf('variable') !== -1 && context.inArguments && context.currentArgumentField) {
          const arg = (context.currentArgumentField.args || []).find((item) => item.name === tokenText);

          if (!arg) {
            return null;
          }

          return {
            label: arg.name,
            labelClass: 'argument',
            typeRef: arg.type,
            description: arg.description || ''
          };
        }

        if ((token.type.indexOf('property') !== -1 || token.type.indexOf('def') !== -1) && context.parentTypeName) {
          const field = getFieldByName(getTypeMap($ctrl.schema), context.parentTypeName, tokenText);

          if (!field) {
            return null;
          }

          return {
            label: field.name,
            labelClass: 'field',
            typeRef: field.type,
            arguments: Array.isArray(field.args)
              ? field.args.map((arg) => ({
                name: arg.name,
                typeRef: arg.type,
                description: arg.description || ''
              }))
              : [],
            description: field.description || ''
          };
        }

        return null;
      }

      function bindHoverHandlers(cm) {
        const wrapper = cm.getWrapperElement();
        let lastTooltipKey = '';
        let hoverTimer = null;

        function clearHoverTimer() {
          if (hoverTimer) {
            window.clearTimeout(hoverTimer);
            hoverTimer = null;
          }
        }

        wrapper.addEventListener('mousemove', (event) => {
          const target = event.target;

          if (!target || !(target instanceof HTMLElement) || !target.closest('.CodeMirror-lines')) {
            clearHoverTimer();
            hideTooltip();
            lastTooltipKey = '';
            return;
          }

          const position = cm.coordsChar({ left: event.clientX, top: event.clientY }, 'window');
          const payload = resolveQueryHoverPayload(cm, position);

          if (!payload) {
            clearHoverTimer();
            hideTooltip();
            lastTooltipKey = '';
            return;
          }

          const nextKey = `${payload.label}|${payload.description}|${typeRefToString(payload.typeRef)}`;

          if (lastTooltipKey !== nextKey) {
            clearHoverTimer();
            hideTooltip();
            lastTooltipKey = nextKey;
            hoverTimer = window.setTimeout(() => {
              renderTooltip(payload, target, event);
              hoverTimer = null;
            }, 1000);
            return;
          }
        });

        wrapper.addEventListener('mouseleave', () => {
          clearHoverTimer();
          lastTooltipKey = '';
          hideTooltip();
        });
      }

      function isNameStart(char) {
        return /[A-Za-z_]/.test(char);
      }

      function isNamePart(char) {
        return /[A-Za-z0-9_]/.test(char);
      }

      function resolveQueryContext(schema, text) {
        const typeMap = getTypeMap(schema);
        let operation = 'query';
        let rootTypeName = getRootTypeName(schema, operation);
        const typeStack = rootTypeName ? [rootTypeName] : [];
        const fieldStack = [];
        let pendingFieldName = null;
        let pendingFieldRef = null;
        let currentArgumentField = null;
        let parenDepth = 0;
        let selectionDepth = 0;
        let lastOperationKeywordIndex = 0;
        let operationHeader = null;
        let i = 0;

        while (i < text.length) {
          const char = text[i];
          const nextThree = text.slice(i, i + 3);

          if (nextThree === '"""') {
            const end = text.indexOf('"""', i + 3);
            i = end === -1 ? text.length : end + 3;
            continue;
          }

          if (text.slice(i, i + 2) === '/*') {
            const end = text.indexOf('*/', i + 2);
            i = end === -1 ? text.length : end + 2;
            continue;
          }

          if (char === '#') {
            const end = text.indexOf('\n', i + 1);
            i = end === -1 ? text.length : end + 1;
            continue;
          }

          if (char === '"') {
            i += 1;
            while (i < text.length) {
              const stringChar = text[i];

              if (stringChar === '\\') {
                i += 2;
                continue;
              }

              if (stringChar === '"') {
                i += 1;
                break;
              }

              i += 1;
            }

            continue;
          }

          if (/\s/.test(char)) {
            i += 1;
            continue;
          }

          if (char === '$') {
            i += 1;
            while (i < text.length && isNamePart(text[i])) {
              i += 1;
            }
            continue;
          }

          if (char === '@') {
            i += 1;
            while (i < text.length && isNamePart(text[i])) {
              i += 1;
            }
            continue;
          }

          if (isNameStart(char)) {
            let end = i + 1;

            while (end < text.length && isNamePart(text[end])) {
              end += 1;
            }

            const word = text.slice(i, end);

            if (word === 'query' || word === 'mutation' || word === 'subscription') {
              operation = word;
              rootTypeName = getRootTypeName(schema, operation);
              typeStack.length = 0;
              fieldStack.length = 0;
              if (rootTypeName) {
                typeStack.push(rootTypeName);
              }
              pendingFieldName = null;
              pendingFieldRef = null;
              currentArgumentField = null;
              parenDepth = 0;
              selectionDepth = 0;
              lastOperationKeywordIndex = i;
              operationHeader = null;
              i = end;
              continue;
            }

            if (word === 'fragment' || word === 'on') {
              i = end;
              continue;
            }

            if (parenDepth === 0) {
              const currentTypeName = typeStack[typeStack.length - 1];
              const fieldRef = getFieldByName(typeMap, currentTypeName, word);

              if (fieldRef) {
                pendingFieldName = word;
                pendingFieldRef = fieldRef;
              }
            }

            i = end;
            continue;
          }

          if (char === '(') {
            parenDepth += 1;
            currentArgumentField = pendingFieldRef;
            i += 1;
            continue;
          }

          if (char === ')') {
            parenDepth = Math.max(0, parenDepth - 1);
            if (parenDepth === 0) {
              currentArgumentField = null;
            }
            i += 1;
            continue;
          }

          if (char === '{') {
            selectionDepth += 1;

            if (selectionDepth === 1 && lastOperationKeywordIndex <= i) {
              operationHeader = {
                operation,
                keywordIndex: lastOperationKeywordIndex,
                openBraceIndex: i
              };
            }

            if (pendingFieldRef) {
              const childType = getNamedType(pendingFieldRef.type);

              if (childType && childType.name) {
                typeStack.push(childType.name);
                fieldStack.push(pendingFieldRef.name);
              }
            }

            pendingFieldName = null;
            pendingFieldRef = null;
            i += 1;
            continue;
          }

          if (char === '}') {
            selectionDepth = Math.max(0, selectionDepth - 1);

            if (typeStack.length > 1) {
              typeStack.pop();
              fieldStack.pop();
            }

            pendingFieldName = null;
            pendingFieldRef = null;
            i += 1;
            continue;
          }

          if (char === ',') {
            if (parenDepth === 0) {
              pendingFieldName = null;
              pendingFieldRef = null;
            }
            i += 1;
            continue;
          }

          i += 1;
        }

        return {
          operation,
          parentTypeName: typeStack[typeStack.length - 1] || rootTypeName,
          currentArgumentField,
          inArguments: parenDepth > 0 && Boolean(currentArgumentField),
          inSelectionSet: selectionDepth > 0 && parenDepth === 0,
          operationHeader
        };
      }

      function supportsSelectionSet(field) {
        const namedType = getNamedType(field && field.type);

        return Boolean(namedType && ['OBJECT', 'INTERFACE'].includes(namedType.kind));
      }

      function hasRequiredArguments(field) {
        return Boolean(field && Array.isArray(field.args) && field.args.some((arg) => arg && arg.type && arg.type.kind === 'NON_NULL'));
      }

      function buildExpandedSelectionSet(typeRef, indentLevel, visitedTypes) {
        const namedType = getNamedType(typeRef);
        const typeMap = getTypeMap($ctrl.schema);
        const schemaType = namedType ? typeMap.get(namedType.name) : null;

        if (!schemaType || !Array.isArray(schemaType.fields) || !schemaType.fields.length) {
          return [];
        }

        const nextVisited = new Set(visitedTypes || []);
        if (namedType && namedType.name) {
          nextVisited.add(namedType.name);
        }

        return schemaType.fields
          .filter((childField) => childField && childField.name && !hasRequiredArguments(childField))
          .flatMap((childField) => {
            if (!supportsSelectionSet(childField)) {
              return [`${indentLevel}${childField.name}`];
            }

            const childNamedType = getNamedType(childField.type);
            if (!childNamedType || nextVisited.has(childNamedType.name)) {
              return [];
            }

            const nestedLines = buildExpandedSelectionSet(childField.type, `${indentLevel}  `, nextVisited);

            if (!nestedLines.length) {
              return [];
            }

            return [
              `${indentLevel}${childField.name} {`,
              ...nestedLines,
              `${indentLevel}}`
            ];
          });
      }

      function buildFieldInsertion(field) {
        if (!field || !Array.isArray(field.args) || field.args.length === 0) {
          return {
            text: field && field.name ? field.name : '',
            cursorOffset: field && field.name ? field.name.length : 0
          };
        }

        const argsText = field.args.map((arg) => `${arg.name}: `).join(', ');
        const text = `${field.name}(${argsText})`;

        return {
          text,
          cursorOffset: field.name.length + 1
        };
      }

      function buildFieldApply(field) {
        return function applyFieldCompletion(cm, from, to, completion) {
          const insertion = buildFieldInsertion(field);
          const baseText = insertion.text;
          const operation = completion && completion.operation ? completion.operation : 'query';
          const shouldWrapInOperation = Boolean(completion && completion.wrapInOperation);
          const shouldBindOperationVariables = Boolean(completion && completion.bindOperationVariables);
          const shouldIncludeAllFields = Boolean(completion && completion.includeAllFields);

          if (shouldWrapInOperation) {
            const currentValue = cm.getValue();
            const plainText = currentValue
              .replace(/\/\*[\s\S]*?\*\//g, '')
              .replace(/#.*/g, '')
              .trim();
            const shouldReplaceWholeEditor = plainText === '';
            const rootIndent = '';
            const fieldIndent = '  ';
            const childIndent = '    ';
            const argumentBindings = buildOperationArgumentBindings(field.args);
            const variableDefinitions = argumentBindings.length
              ? ` (${argumentBindings.map((binding) => `$${binding.variableName}: ${binding.typeString}`).join(', ')})`
              : '';
            const fieldArguments = argumentBindings.length
              ? `(${argumentBindings.map((binding) => `${binding.argumentName}: $${binding.variableName}`).join(', ')})`
              : '';
            const fieldCall = `${field.name}${fieldArguments}`;
            const expandedLines = shouldIncludeAllFields ? buildExpandedSelectionSet(field.type, childIndent, new Set()) : [];
            const blockText = supportsSelectionSet(field)
              ? `${operation}${variableDefinitions} {\n${fieldIndent}${fieldCall} {\n${expandedLines.length ? `${expandedLines.join('\n')}\n` : `${childIndent}\n`}${fieldIndent}}\n${rootIndent}}`
              : `${operation}${variableDefinitions} {\n${fieldIndent}${fieldCall}\n${rootIndent}}`;
            const replaceFrom = shouldReplaceWholeEditor ? { line: 0, ch: 0 } : from;
            const replaceTo = shouldReplaceWholeEditor ? { line: cm.lastLine(), ch: cm.getLine(cm.lastLine()).length } : to;
            const startIndex = cm.indexFromPos(replaceFrom);
            const cursorIndex = supportsSelectionSet(field)
              ? startIndex + `${operation}${variableDefinitions} {\n${fieldIndent}${fieldCall} {\n${expandedLines.length ? expandedLines[0] : childIndent}`.length
              : startIndex + `${operation}${variableDefinitions} {\n${fieldIndent}${fieldCall}`.length;

            cm.replaceRange(blockText, replaceFrom, replaceTo);
            cm.setCursor(cm.posFromIndex(cursorIndex));
            return;
          }

          if (shouldBindOperationVariables && Array.isArray(field.args) && field.args.length) {
            const currentValue = cm.getValue();
            const context = resolveQueryContext($ctrl.schema, currentValue.slice(0, cm.indexFromPos(from)));
            const header = context.operationHeader;
            const headerText = header ? currentValue.slice(header.keywordIndex, header.openBraceIndex) : '';
            const existingVariables = parseOperationVariables(headerText);
            const argumentBindings = buildOperationArgumentBindings(field.args, existingVariables);
            const fieldArguments = argumentBindings.length
              ? `(${argumentBindings.map((binding) => `${binding.argumentName}: $${binding.variableName}`).join(', ')})`
              : '';
            const fieldCall = `${field.name}${fieldArguments}`;

            cm.replaceRange(fieldCall, from, to);

            if (header) {
              const nextValue = cm.getValue();
              const updatedHeaderText = nextValue.slice(header.keywordIndex, header.openBraceIndex);
              const nextExistingVariables = parseOperationVariables(updatedHeaderText);
              const newBindings = argumentBindings.filter((binding) => !nextExistingVariables.some((variable) => variable.name === binding.variableName));

              if (newBindings.length) {
                const definitionsText = newBindings.map((binding) => `$${binding.variableName}: ${binding.typeString}`).join(', ');
                const openParenIndex = updatedHeaderText.indexOf('(');
                const insertIndex = header.keywordIndex + updatedHeaderText.length;

                if (openParenIndex === -1) {
                  cm.replaceRange(` (${definitionsText})`, cm.posFromIndex(insertIndex), cm.posFromIndex(insertIndex));
                } else {
                  const closeParenIndex = updatedHeaderText.lastIndexOf(')');
                  const absoluteCloseParenIndex = header.keywordIndex + closeParenIndex;
                  const prefixVariables = updatedHeaderText.slice(openParenIndex + 1, closeParenIndex).trim();
                  const separator = prefixVariables ? ', ' : '';
                  cm.replaceRange(`${separator}${definitionsText}`, cm.posFromIndex(absoluteCloseParenIndex), cm.posFromIndex(absoluteCloseParenIndex));
                }
              }
            }

            if (!supportsSelectionSet(field)) {
              cm.setCursor(cm.posFromIndex(cm.indexFromPos(from) + fieldCall.length));
              return;
            }

            const updatedFrom = from;
            const lineText = cm.getLine(updatedFrom.line) || '';
            const lineIndent = (lineText.match(/^\s*/) || [''])[0];
            const indentUnit = cm.getOption('indentUnit') || 2;
            const childIndent = `${lineIndent}${' '.repeat(indentUnit)}`;
            const expandedLines = shouldIncludeAllFields ? buildExpandedSelectionSet(field.type, childIndent, new Set()) : [];
            const blockText = `${fieldCall} {\n${expandedLines.length ? `${expandedLines.join('\n')}\n` : `${childIndent}\n`}${lineIndent}}`;
            const startIndex = cm.indexFromPos(updatedFrom);
            const cursorIndex = startIndex + `${fieldCall} {\n${expandedLines.length ? expandedLines[0] : childIndent}`.length;

            cm.replaceRange(blockText, updatedFrom, cm.posFromIndex(startIndex + fieldCall.length));
            cm.setCursor(cm.posFromIndex(cursorIndex));
            return;
          }

          if (!supportsSelectionSet(field)) {
            cm.replaceRange(baseText, from, to);
            cm.setCursor(cm.posFromIndex(cm.indexFromPos(from) + insertion.cursorOffset));
            return;
          }

          const lineText = cm.getLine(from.line) || '';
          const lineIndent = (lineText.match(/^\s*/) || [''])[0];
          const indentUnit = cm.getOption('indentUnit') || 2;
          const childIndent = `${lineIndent}${' '.repeat(indentUnit)}`;
          const blockText = `${baseText} {\n${childIndent}\n${lineIndent}}`;
          const startIndex = cm.indexFromPos(from);
          const cursorIndex = startIndex + `${baseText} {\n${childIndent}`.length;

          cm.replaceRange(blockText, from, to);
          cm.setCursor(cm.posFromIndex(cursorIndex));
        };
      }

      function buildOperationNameApply(field) {
        return function applyOperationNameCompletion(cm, from, to) {
          const operationName = field && field.name ? field.name : '';

          if (!operationName) {
            return;
          }

          cm.replaceRange(operationName, from, to);
          cm.setCursor(cm.posFromIndex(cm.indexFromPos(from) + operationName.length));
        };
      }

      function buildArgInsertion(arg) {
        return {
          text: `${arg.name}: `,
          cursorOffset: arg.name.length + 2
        };
      }

      function getSchemaCompletions(schema) {
        const completionsByKey = new Map();
        const rootQueryTypeName = getRootTypeName(schema, 'query');
        const rootMutationTypeName = getRootTypeName(schema, 'mutation');
        const rootSubscriptionTypeName = getRootTypeName(schema, 'subscription');

        function pushCompletion(completion) {
          if (!completion || !completion.text) {
            return;
          }

          const key = `${completion.text}::${completion.displayText || ''}::${completion.className || ''}`;

          if (!completionsByKey.has(key)) {
            completionsByKey.set(key, completion);
          }
        }

        graphqlKeywords.forEach((keyword) => {
          pushCompletion(createCompletion(keyword, 'keyword', keyword, 'keyword'));
        });

        if (!schema || !Array.isArray(schema.types)) {
          return Array.from(completionsByKey.values());
        }

        schema.types.forEach((type) => {
          if (!type || !type.name || type.name.startsWith('__')) {
            return;
          }

          pushCompletion(createCompletion(type.name, type.kind ? type.kind.toLowerCase() : 'type', `${type.name} (${type.kind})`, 'type'));

          if (Array.isArray(type.fields)) {
            type.fields.forEach((field) => {
              if (!field || !field.name) {
                return;
              }

              const insertion = buildFieldInsertion(field);
              const namedType = getNamedType(field.type);
              const renderText = namedType ? `${field.name} : ${namedType.name}` : field.name;
              const completion = createCompletion(insertion.text, 'field', renderText, 'field');
              completion.cursorOffset = insertion.cursorOffset;

              if (type.name === rootQueryTypeName || type.name === rootMutationTypeName || type.name === rootSubscriptionTypeName) {
                completion.apply = buildFieldApply(field);
                completion.wrapInOperation = true;
                completion.operation = type.name === rootMutationTypeName
                  ? 'mutation'
                  : type.name === rootSubscriptionTypeName
                    ? 'subscription'
                    : 'query';
              }

              pushCompletion(completion);

              if (Array.isArray(field.args)) {
                field.args.forEach((arg) => {
                  if (!arg || !arg.name) {
                    return;
                  }

                  const argInsertion = buildArgInsertion(arg);
                  const argType = getNamedType(arg.type);
                  const argRenderText = argType ? `${arg.name}: ${argType.name}` : `${arg.name}:`;
                  const argCompletion = createCompletion(argInsertion.text, 'argument', argRenderText, 'argument');
                  argCompletion.cursorOffset = argInsertion.cursorOffset;
                  pushCompletion(argCompletion);
                });
              }
            });
          }

          if (Array.isArray(type.inputFields)) {
            type.inputFields.forEach((field) => {
              if (!field || !field.name) {
                return;
              }

              const insertion = buildArgInsertion(field);
              const namedType = getNamedType(field.type);
              const renderText = namedType ? `${field.name}: ${namedType.name}` : `${field.name}:`;
              const completion = createCompletion(insertion.text, 'input', renderText, 'argument');
              completion.cursorOffset = insertion.cursorOffset;
              pushCompletion(completion);
            });
          }

          if (Array.isArray(type.enumValues)) {
            type.enumValues.forEach((value) => {
              if (!value || !value.name) {
                return;
              }

              pushCompletion(createCompletion(value.name, 'enum', `${value.name} (enum)`, 'enum'));
            });
          }
        });

        return Array.from(completionsByKey.values());
      }

      function getFieldCompletionsForType(schema, typeName, options) {
        const typeMap = getTypeMap(schema);
        const typeRef = typeMap.get(typeName);

        if (!typeRef || !Array.isArray(typeRef.fields)) {
          return [];
        }

        return typeRef.fields
          .filter((field) => field && field.name)
          .flatMap((field) => {
            const insertion = buildFieldInsertion(field);
            const namedType = getNamedType(field.type);
            const renderText = namedType ? `${field.name} : ${namedType.name}` : field.name;
            const completion = createCompletion(insertion.text, 'field', renderText, 'field');
            completion.cursorOffset = insertion.cursorOffset;
            completion.apply = buildFieldApply(field);
            completion.wrapInOperation = Boolean(options && options.wrapInOperation);
            completion.bindOperationVariables = Boolean(options && options.bindOperationVariables);
            completion.operation = options && options.operation ? options.operation : 'query';
            const completions = [completion];

            if (supportsSelectionSet(field)) {
              const includeAllCompletion = createCompletion(insertion.text, 'field', `* ${renderText} (add all fields)`, 'field');
              includeAllCompletion.cursorOffset = insertion.cursorOffset;
              includeAllCompletion.apply = buildFieldApply(field);
              includeAllCompletion.wrapInOperation = Boolean(options && options.wrapInOperation);
              includeAllCompletion.bindOperationVariables = Boolean(options && options.bindOperationVariables);
              includeAllCompletion.operation = options && options.operation ? options.operation : 'query';
              includeAllCompletion.includeAllFields = true;
              completions.push(includeAllCompletion);
            }

            return completions;
          });
      }

      function getArgumentCompletions(fieldRef) {
        if (!fieldRef || !Array.isArray(fieldRef.args)) {
          return [];
        }

        return fieldRef.args
          .filter((arg) => arg && arg.name)
          .map((arg) => {
            const insertion = buildArgInsertion(arg);
            const argType = getNamedType(arg.type);
            const renderText = argType ? `${arg.name}: ${argType.name}` : `${arg.name}:`;
            const completion = createCompletion(insertion.text, 'argument', renderText, 'argument');
            completion.cursorOffset = insertion.cursorOffset;
            return completion;
          });
      }

      function getContextualCompletions(schema, queryText, cursorIndex) {
        if (!schema) {
          return getSchemaCompletions(schema);
        }

        const context = resolveQueryContext(schema, queryText.slice(0, cursorIndex));
        const rootTypeName = getRootTypeName(schema, context.operation);
        const queryPrefix = queryText.slice(0, cursorIndex);
        const querySuffix = queryText.slice(cursorIndex);
        const cleanedPrefix = queryPrefix.replace(/\/\*[\s\S]*?\*\//g, '').replace(/#.*/g, '');
        const cleanedSuffix = querySuffix.replace(/\/\*[\s\S]*?\*\//g, '').replace(/#.*/g, '');
        const normalizedPrefix = cleanedPrefix.trim();
        const normalizedSuffix = cleanedSuffix.trim();
        const isOperationNameContext = !context.inArguments
          && !context.inSelectionSet
          && Boolean(rootTypeName)
          && /\b(query|mutation|subscription)\s+[A-Za-z_]*$/i.test(cleanedPrefix)
          && /^\s*(\([^{}]*\))?\s*\{/.test(cleanedSuffix);
        const isTopLevelRootSelection = !context.inArguments
          && !context.inSelectionSet
          && context.parentTypeName
          && context.parentTypeName === rootTypeName
          && normalizedSuffix === ''
          && (normalizedPrefix === '' || /^[A-Za-z_][A-Za-z0-9_]*$/.test(normalizedPrefix));

        if (context.inArguments && context.currentArgumentField) {
          return getArgumentCompletions(context.currentArgumentField);
        }

        if (context.inSelectionSet && context.parentTypeName) {
          return getFieldCompletionsForType(schema, context.parentTypeName, {
            bindOperationVariables: context.parentTypeName === rootTypeName,
            operation: context.operation
          });
        }

        if (isOperationNameContext && rootTypeName) {
          return getFieldCompletionsForType(schema, rootTypeName, {
            operation: context.operation
          }).filter((completion) => !completion.includeAllFields).map((completion) => {
            const operationName = completion.text.replace(/\(.*/, '');
            const operationNameCompletion = { ...completion };
            operationNameCompletion.text = operationName;
            operationNameCompletion.displayText = operationName;
            operationNameCompletion.apply = buildOperationNameApply({
              name: operationName
            });
            delete operationNameCompletion.wrapInOperation;
            delete operationNameCompletion.bindOperationVariables;
            delete operationNameCompletion.includeAllFields;
            delete operationNameCompletion.cursorOffset;
            return operationNameCompletion;
          });
        }

        if (isTopLevelRootSelection && rootTypeName) {
          const keywordCompletions = graphqlKeywords
            .filter((keyword) => ['query', 'mutation', 'subscription'].includes(keyword))
            .map((keyword) => createCompletion(keyword, 'keyword', keyword, 'keyword'));
          return [
            ...getFieldCompletionsForType(schema, rootTypeName, {
              wrapInOperation: true,
              operation: context.operation
            }),
            ...keywordCompletions
          ];
        }

        return getSchemaCompletions(schema);
      }

      function getHints(cm) {
        const cursor = cm.getCursor();
        const token = cm.getTokenAt(cursor);
        const tokenStart = (token && typeof token.start === 'number') ? token.start : cursor.ch;
        const tokenEnd = (token && typeof token.end === 'number') ? token.end : cursor.ch;
        const rawToken = token && typeof token.string === 'string' ? token.string : '';
        const normalizedToken = /^[\w_]+$/.test(rawToken) ? rawToken : '';
        const prefix = normalizedToken.slice(0, Math.max(0, cursor.ch - tokenStart));
        const from = { line: cursor.line, ch: prefix ? tokenStart : cursor.ch };
        const to = { line: cursor.line, ch: prefix ? tokenEnd : cursor.ch };
        const cursorIndex = cm.indexFromPos(cursor);
        const allCompletions = getContextualCompletions($ctrl.schema, cm.getValue(), cursorIndex);
        const filtered = allCompletions.filter((completion) => {
          if (!prefix) {
            return true;
          }

          return completion.text.toLowerCase().startsWith(prefix.toLowerCase());
        });

        return {
          list: filtered.slice(0, 200),
          from,
          to
        };
      }

      function triggerAutocomplete(cm) {
        if (typeof cm.showHint !== 'function') {
          return;
        }

        cm.showHint({
          completeSingle: false,
          hint: getHints
        });
      }

      function resetToOperation(operationName) {
        if (!editor) {
          return;
        }

        const normalizedOperation = operationName === 'mutation' ? 'mutation' : 'query';
        const nextValue = `${normalizedOperation} {\n  \n}`;

        editor.setValue(nextValue);
        editor.setCursor({ line: 1, ch: 2 });
        $ctrl.query = nextValue;
        $ctrl._lastAppliedQuery = nextValue;
        $ctrl._lastEditorValue = nextValue;

        if ($ctrl.onChange) {
          $ctrl.onChange();
        }

        $ctrl._syncParent();
      }

      function createEditor() {
        const textarea = $element[0].querySelector('textarea');

        if (!textarea || typeof window.CodeMirror === 'undefined') {
          return;
        }

        ensureGraphqlMode();

        editor = window.CodeMirror.fromTextArea(textarea, {
          mode: 'graphql-playground',
          lineNumbers: true,
          lineWrapping: true,
          matchBrackets: true,
          indentUnit: 2,
          tabSize: 2,
          viewportMargin: Infinity,
          extraKeys: {
            Tab(cm) {
              if (cm.state.completionActive) {
                cm.execCommand('pick');
                return;
              }

              if (cm.somethingSelected()) {
                cm.indentSelection('add');
                return;
              }

              cm.replaceSelection('  ', 'end');
            },
            'Shift-Tab'(cm) {
              cm.indentSelection('subtract');
            },
            'Ctrl-Space'(cm) {
              triggerAutocomplete(cm);
            }
          }
        });

        editor.setValue($ctrl.query || '');

        editor.on('change', (instance) => {
          const nextValue = instance.getValue();

          if ($ctrl.query === nextValue) {
            return;
          }

          $ctrl.query = nextValue;
          $ctrl._lastEditorValue = nextValue;
          $ctrl._lastAppliedQuery = nextValue;
          if ($ctrl.onChange) {
            $ctrl.onChange();
          }
          $ctrl._syncParent();
        });

        editor.on('inputRead', (cm, change) => {
          if (!change || change.origin === 'setValue' || typeof cm.showHint !== 'function') {
            return;
          }

          const insertedText = Array.isArray(change.text) ? change.text.join('') : '';

          if (/^[A-Za-z_]$/.test(insertedText)) {
            triggerAutocomplete(cm);
          }
        });

        bindHoverHandlers(editor);
        $ctrl._lastEditorValue = editor.getValue();
        $ctrl._lastAppliedQuery = editor.getValue();
        scheduleRefresh();
      }

      function scheduleRefresh() {
        if (!editor) {
          return;
        }

        window.requestAnimationFrame(() => {
          if (editor) {
            editor.refresh();
          }
        });
      }

      $ctrl._syncParent = function () {
        const rootScope = $element.scope();

        if (!rootScope) {
          return;
        }

        if (rootScope.$$phase) {
          return;
        }

        rootScope.$applyAsync();
      };

      $ctrl.$postLink = function () {
        $ctrl.api = $ctrl.api || {};
        $ctrl.api.resetToOperation = resetToOperation;
        $ctrl.api.refresh = scheduleRefresh;
        createEditor();
        resizeHandler = () => scheduleRefresh();
        window.addEventListener('resize', resizeHandler);
        window.setTimeout(scheduleRefresh, 0);
        window.setTimeout(scheduleRefresh, 120);
      };

      $ctrl.$onChanges = function (changes) {
        if (!editor || !changes.query) {
          return;
        }

        const nextValue = changes.query.currentValue || '';

        if (nextValue === $ctrl._lastAppliedQuery || nextValue === editor.getValue()) {
          return;
        }

        const cursor = editor.getCursor();
        editor.setValue(nextValue);
        editor.setCursor(cursor);
        $ctrl._lastAppliedQuery = nextValue;
        $ctrl._lastEditorValue = nextValue;
      };

      $ctrl.$doCheck = function () {
        if (!editor) {
          return;
        }

        const nextValue = typeof $ctrl.query === 'string' ? $ctrl.query : '';

        if (nextValue === editor.getValue() || nextValue === $ctrl._lastAppliedQuery) {
          return;
        }

        const cursor = editor.getCursor();
        editor.setValue(nextValue);
        editor.setCursor(cursor);
        $ctrl._lastAppliedQuery = nextValue;
        $ctrl._lastEditorValue = nextValue;
      };

      $ctrl.$onDestroy = function () {
        if (resizeHandler) {
          window.removeEventListener('resize', resizeHandler);
          resizeHandler = null;
        }

        if (editor) {
          hideTooltip();
          editor.toTextArea();
          editor = null;
        }

        if (tooltipElement && tooltipElement.parentNode) {
          if (hideTooltipTimeout) {
            window.clearTimeout(hideTooltipTimeout);
            hideTooltipTimeout = null;
          }
          tooltipElement.parentNode.removeChild(tooltipElement);
          tooltipElement = null;
        }
      };
    }]
  });
})(angular.module('app'));
