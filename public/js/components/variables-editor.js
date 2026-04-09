((app) => {
  const TEMPLATE_VERSION = '20260409i';

  app.component('variablesEditor', {
    templateUrl: `components/variables-editor.html?v=${TEMPLATE_VERSION}`,
    bindings: {
      variables: '=',
      query: '<',
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

      function ensureVariablesMode() {
        if (typeof window.CodeMirror === 'undefined') {
          return;
        }

        if (window.CodeMirror.modes && window.CodeMirror.modes['graphql-variables']) {
          return;
        }

        window.CodeMirror.defineMode('graphql-variables', function () {
          return {
            startState() {
              return {
                inString: false,
                escaped: false
              };
            },
            token(stream, state) {
              if (state.inString) {
                let next;

                while ((next = stream.next()) != null) {
                  if (next === '"' && !state.escaped) {
                    state.inString = false;
                    break;
                  }

                  state.escaped = !state.escaped && next === '\\';
                }

                return 'string';
              }

              if (stream.eatSpace()) {
                return null;
              }

              if (stream.peek() === '"') {
                stream.next();
                state.inString = true;
                state.escaped = false;
                return 'string';
              }

              if (stream.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)) {
                return 'number';
              }

              if (stream.match(/^(?:true|false|null)\b/)) {
                return 'atom';
              }

              if (stream.match(/^[{}\[\],:]/)) {
                return 'bracket';
              }

              stream.next();
              return null;
            }
          };
        });
      }

      function stripComments(query) {
        return (query || '').replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '');
      }

      function extractVariableDefinitions(query) {
        const cleanQuery = stripComments(query);
        const operationMatch = /(query|mutation|subscription)\b/.exec(cleanQuery);

        if (!operationMatch) {
          return [];
        }

        const operationIndex = operationMatch.index;
        const openParenIndex = cleanQuery.indexOf('(', operationIndex);

        if (openParenIndex === -1) {
          return [];
        }

        let depth = 0;
        let closeParenIndex = -1;

        for (let index = openParenIndex; index < cleanQuery.length; index += 1) {
          const char = cleanQuery[index];

          if (char === '(') {
            depth += 1;
          } else if (char === ')') {
            depth -= 1;

            if (depth === 0) {
              closeParenIndex = index;
              break;
            }
          }
        }

        if (closeParenIndex === -1) {
          return [];
        }

        const definitionsText = cleanQuery.slice(openParenIndex + 1, closeParenIndex);
        const parts = [];
        let current = '';
        let bracketDepth = 0;

        for (let index = 0; index < definitionsText.length; index += 1) {
          const char = definitionsText[index];

          if (char === '[') {
            bracketDepth += 1;
          } else if (char === ']') {
            bracketDepth = Math.max(0, bracketDepth - 1);
          }

          if (char === ',' && bracketDepth === 0) {
            if (current.trim()) {
              parts.push(current.trim());
            }
            current = '';
            continue;
          }

          current += char;
        }

        if (current.trim()) {
          parts.push(current.trim());
        }

        return parts.map((part) => {
          const match = /^\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=]+?)(?:\s*=\s*.+)?\s*$/.exec(part);

          if (!match) {
            return null;
          }

          return {
            name: match[1],
            typeString: match[2].trim()
          };
        }).filter(Boolean);
      }

      function parseTypeString(typeString) {
        let index = 0;

        function parseTypeRef() {
          if (typeString[index] === '[') {
            index += 1;
            const innerType = parseTypeRef();

            if (typeString[index] === ']') {
              index += 1;
            }

            let typeRef = {
              kind: 'LIST',
              ofType: innerType
            };

            if (typeString[index] === '!') {
              index += 1;
              typeRef = {
                kind: 'NON_NULL',
                ofType: typeRef
              };
            }

            return typeRef;
          }

          const nameMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(typeString.slice(index));

          if (!nameMatch) {
            return null;
          }

          index += nameMatch[0].length;

          let typeRef = {
            kind: 'NAMED',
            name: nameMatch[0]
          };

          if (typeString[index] === '!') {
            index += 1;
            typeRef = {
              kind: 'NON_NULL',
              ofType: typeRef
            };
          }

          return typeRef;
        }

        return parseTypeRef();
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
        const nameClass = payload.labelClass || 'argument';

        tooltip.innerHTML = `
          <div class="schema-tooltip-signature">
            <span class="schema-tooltip-name schema-tooltip-name-${nameClass}"></span>
            ${typeTokens.length ? '<span>:</span><span class="schema-tooltip-type-tokens"></span>' : ''}
          </div>
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

      function typeToDisplayString(typeRef) {
        if (!typeRef) {
          return '';
        }

        if (typeRef.kind === 'LIST') {
          return `[${typeToDisplayString(typeRef.ofType)}]`;
        }

        if (typeRef.kind === 'NON_NULL') {
          return `${typeToDisplayString(typeRef.ofType)}!`;
        }

        return typeRef.name || '';
      }

      function buildDefaultValue(typeRef, schema, includeOptionalFields) {
        if (!typeRef) {
          return null;
        }

        if (typeRef.kind === 'NON_NULL') {
          return buildDefaultValue(typeRef.ofType, schema, includeOptionalFields);
        }

        if (typeRef.kind === 'LIST') {
          return [];
        }

        const namedType = getNamedType(typeRef);
        const typeMap = getTypeMap(schema);
        const schemaType = namedType ? typeMap.get(namedType.name) : null;

        if (!schemaType) {
          return null;
        }

        if (schemaType.kind === 'INPUT_OBJECT') {
          const result = {};

          (schemaType.inputFields || []).forEach((field) => {
            if (field && field.type && (includeOptionalFields || field.type.kind === 'NON_NULL')) {
              result[field.name] = buildDefaultValue(field.type, schema, includeOptionalFields);
            }
          });

          return result;
        }

        if (schemaType.kind === 'ENUM') {
          return schemaType.enumValues && schemaType.enumValues.length ? schemaType.enumValues[0].name : null;
        }

        switch (namedType.name) {
          case 'Int':
          case 'Float':
            return 0;
          case 'Boolean':
            return false;
          case 'String':
          case 'ID':
            return '';
          default:
            return null;
        }
      }

      function getVariableSuggestions(query, schema) {
        const typeMap = getTypeMap(schema);

        return extractVariableDefinitions(query).map((definition) => {
          const typeRef = parseTypeString(definition.typeString);
          const defaultValue = buildDefaultValue(typeRef, schema, false);
          const defaultValueWithOptionalFields = buildDefaultValue(typeRef, schema, true);
          const namedType = getNamedType(typeRef);
          const schemaType = namedType ? typeMap.get(namedType.name) : null;

          return {
            name: definition.name,
            typeRef,
            typeString: typeToDisplayString(typeRef),
            defaultValue,
            defaultValueWithOptionalFields,
            supportsOptionalFieldExpansion: !!(schemaType && schemaType.kind === 'INPUT_OBJECT')
          };
        });
      }

      function getVariableDefinitionMap(query, schema) {
        return new Map(getVariableSuggestions(query, schema).map((suggestion) => [suggestion.name, suggestion]));
      }

      function unwrapTypeRef(typeRef) {
        if (!typeRef) {
          return null;
        }

        if (typeRef.kind === 'NON_NULL') {
          return unwrapTypeRef(typeRef.ofType);
        }

        return typeRef;
      }

      function resolveInputField(typeRef, key, schema) {
        const namedType = getNamedType(typeRef);
        const typeMap = getTypeMap(schema);
        const schemaType = namedType ? typeMap.get(namedType.name) : null;

        if (!schemaType || schemaType.kind !== 'INPUT_OBJECT' || !Array.isArray(schemaType.inputFields)) {
          return null;
        }

        return schemaType.inputFields.find((field) => field && field.name === key) || null;
      }

      function collectVariableHoverTargets(text, query, schema) {
        const targets = [];
        const rootVariables = getVariableDefinitionMap(query, schema);

        function skipWhitespace(index) {
          while (index < text.length && /\s/.test(text[index])) {
            index += 1;
          }

          return index;
        }

        function parseString(index) {
          const start = index;
          index += 1;
          let escaped = false;

          while (index < text.length) {
            const char = text[index];

            if (char === '"' && !escaped) {
              return {
                value: text.slice(start + 1, index),
                start,
                end: index + 1,
                nextIndex: index + 1
              };
            }

            escaped = !escaped && char === '\\';
            index += 1;
          }

          return null;
        }

        function parsePrimitive(index, expectedTypeRef, label, description) {
          const start = index;

          while (index < text.length && !/[,\]\}\s]/.test(text[index])) {
            index += 1;
          }

          targets.push({
            start,
            end: index,
            payload: {
              label,
              labelClass: 'argument',
              typeRef: expectedTypeRef,
              description: description || ''
            }
          });

          return index;
        }

        function parseValue(index, expectedTypeRef, label, description) {
          index = skipWhitespace(index);

          if (index >= text.length) {
            return index;
          }

          if (text[index] === '{') {
            const objectStart = index;
            const nextIndex = parseObject(index, expectedTypeRef, label);
            targets.push({
              start: objectStart,
              end: objectStart + 1,
              payload: {
                label,
                labelClass: 'argument',
                typeRef: expectedTypeRef,
                description: description || ''
              }
            });
            return nextIndex;
          }

          if (text[index] === '[') {
            const arrayStart = index;
            index += 1;
            const listType = unwrapTypeRef(expectedTypeRef);
            const itemType = listType && listType.kind === 'LIST' ? listType.ofType : null;

            targets.push({
              start: arrayStart,
              end: arrayStart + 1,
              payload: {
                label,
                labelClass: 'argument',
                typeRef: expectedTypeRef,
                description: description || ''
              }
            });

            while (index < text.length && text[index] !== ']') {
              index = parseValue(index, itemType, label, description);
              index = skipWhitespace(index);

              if (text[index] === ',') {
                index += 1;
              }
            }

            return text[index] === ']' ? index + 1 : index;
          }

          if (text[index] === '"') {
            const stringToken = parseString(index);

            if (stringToken) {
              targets.push({
                start: stringToken.start,
                end: stringToken.end,
                payload: {
                  label,
                  labelClass: 'argument',
                  typeRef: expectedTypeRef,
                  description: description || ''
                }
              });

              return stringToken.nextIndex;
            }
          }

          return parsePrimitive(index, expectedTypeRef, label, description);
        }

        function parseObject(index, expectedTypeRef, labelPrefix) {
          if (text[index] !== '{') {
            return index;
          }

          index += 1;

          while (index < text.length) {
            index = skipWhitespace(index);

            if (text[index] === '}') {
              return index + 1;
            }

            if (text[index] !== '"') {
              index += 1;
              continue;
            }

            const keyToken = parseString(index);

            if (!keyToken) {
              return index;
            }

            const fieldRef = labelPrefix
              ? resolveInputField(expectedTypeRef, keyToken.value, schema)
              : (rootVariables.get(keyToken.value) || null);
            const keyLabel = keyToken.value;
            const keyTypeRef = fieldRef ? (fieldRef.type || fieldRef.typeRef) : null;
            const keyDescription = fieldRef ? (fieldRef.description || '') : '';

            targets.push({
              start: keyToken.start,
              end: keyToken.end,
              payload: {
                label: keyLabel,
                labelClass: 'argument',
                typeRef: keyTypeRef,
                description: keyDescription
              }
            });

            index = skipWhitespace(keyToken.nextIndex);

            if (text[index] === ':') {
              index += 1;
            }

            index = parseValue(index, keyTypeRef, keyLabel, keyDescription);
            index = skipWhitespace(index);

            if (text[index] === ',') {
              index += 1;
            }
          }

          return index;
        }

        parseObject(skipWhitespace(0), null, '');
        return targets;
      }

      function resolveVariablesHoverPayload(cm, position) {
        const text = cm.getValue();
        const index = cm.indexFromPos(position);
        const targets = collectVariableHoverTargets(text, $ctrl.query, $ctrl.schema);

        for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
          const target = targets[targetIndex];

          if (index >= target.start && index <= target.end) {
            return target.payload;
          }
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
          const payload = resolveVariablesHoverPayload(cm, position);

          if (!payload || !payload.typeRef) {
            clearHoverTimer();
            hideTooltip();
            lastTooltipKey = '';
            return;
          }

          const nextKey = `${payload.label}|${payload.description}|${typeToDisplayString(payload.typeRef)}`;

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

      function getExistingRootKeys(text) {
        const keys = new Set();
        let depth = 0;
        let inString = false;
        let escaped = false;
        let pendingKey = null;

        for (let index = 0; index < text.length; index += 1) {
          const char = text[index];

          if (inString) {
            if (char === '"' && !escaped) {
              inString = false;
            }

            escaped = !escaped && char === '\\';
            continue;
          }

          if (char === '"') {
            inString = true;
            escaped = false;

            let end = index + 1;
            let key = '';
            let localEscaped = false;

            while (end < text.length) {
              const next = text[end];

              if (next === '"' && !localEscaped) {
                break;
              }

              key += next;
              localEscaped = !localEscaped && next === '\\';
              end += 1;
            }

            pendingKey = {
              value: key,
              end
            };

            continue;
          }

          if (char === '{') {
            depth += 1;
          } else if (char === '}') {
            depth = Math.max(0, depth - 1);
          } else if (char === ':' && depth === 1 && pendingKey) {
            keys.add(pendingKey.value);
            pendingKey = null;
          } else if (!/\s/.test(char)) {
            pendingKey = null;
          }
        }

        return keys;
      }

      function getRootInsertionContext(text, cursorIndex) {
        const openBraceIndex = text.indexOf('{');
        const closeBraceIndex = text.lastIndexOf('}');

        if (openBraceIndex === -1 || closeBraceIndex === -1 || cursorIndex < openBraceIndex || cursorIndex > closeBraceIndex) {
          return null;
        }

        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let index = 0; index < cursorIndex; index += 1) {
          const char = text[index];

          if (inString) {
            if (char === '"' && !escaped) {
              inString = false;
            }

            escaped = !escaped && char === '\\';
            continue;
          }

          if (char === '"') {
            inString = true;
            escaped = false;
            continue;
          }

          if (char === '{') {
            depth += 1;
          } else if (char === '}') {
            depth = Math.max(0, depth - 1);
          }
        }

        if (depth !== 1) {
          return null;
        }

        let from = cursorIndex;
        while (from > openBraceIndex && /[A-Za-z0-9_"]/.test(text[from - 1])) {
          from -= 1;
        }

        let to = cursorIndex;
        while (to < closeBraceIndex && /[A-Za-z0-9_"]/.test(text[to])) {
          to += 1;
        }

        return {
          from,
          to,
          openBraceIndex,
          closeBraceIndex
        };
      }

      function buildValueSnippet(value, baseIndent) {
        if (typeof value === 'string') {
          return {
            text: '""',
            cursorOffset: 1
          };
        }

        if (typeof value === 'number') {
          const text = String(value);
          return {
            text,
            cursorOffset: 0,
            selectionLength: text.length
          };
        }

        if (typeof value === 'boolean') {
          const text = value ? 'true' : 'false';
          return {
            text,
            cursorOffset: 0
          };
        }

        if (value === null) {
          return {
            text: 'null',
            cursorOffset: 0
          };
        }

        if (Array.isArray(value)) {
          return {
            text: '[]',
            cursorOffset: 1
          };
        }

        if (value && typeof value === 'object') {
          const entries = Object.entries(value);

          if (!entries.length) {
            return {
              text: '{}',
              cursorOffset: 1
            };
          }

          const childIndent = `${baseIndent}  `;
          const childSnippets = entries.map(([key, childValue], index) => {
            const childSnippet = buildPropertySnippet(key, childValue, childIndent);
            return {
              ...childSnippet,
              text: `${childIndent}${childSnippet.text}${index < entries.length - 1 ? ',' : ''}`
            };
          });
          const firstChild = childSnippets[0];

          return {
            text: `{\n${childSnippets.map((snippet) => snippet.text).join('\n')}\n${baseIndent}}`,
            cursorOffset: `{\n`.length + firstChild.cursorOffset
          };
        }

        return {
          text: 'null',
          cursorOffset: 0
        };
      }

      function buildPropertySnippet(name, defaultValue, baseIndent) {
        const keyText = `"${name}": `;
        const valueSnippet = buildValueSnippet(defaultValue, baseIndent);

        return {
          text: `${keyText}${valueSnippet.text}`,
          cursorOffset: keyText.length + valueSnippet.cursorOffset,
          selectionLength: valueSnippet.selectionLength || 0
        };
      }

      function applyVariableCompletion(cm, data, completion) {
        const text = cm.getValue();
        const cursor = cm.getCursor();
        const cursorIndex = cm.indexFromPos(cursor);
        const context = getRootInsertionContext(text, cursorIndex);

        if (!context) {
          cm.replaceRange(`"${completion.variableName}": ${JSON.stringify(completion.defaultValue)}`, data.from, data.to);
          return;
        }

        const baseIndent = '  ';
        const snippet = buildPropertySnippet(completion.variableName, completion.defaultValue, baseIndent);
        const before = text.slice(context.openBraceIndex + 1, context.from);
        const after = text.slice(context.to, context.closeBraceIndex);
        const needsCommaBefore = /[}\]"0-9a-zA-Z]/.test(before.trim().slice(-1)) && !before.trim().endsWith(',');
        const needsCommaAfter = after.trim() && !after.trim().startsWith('}') && !after.trim().startsWith(',');
        const lineStartIndex = text.lastIndexOf('\n', Math.max(0, context.from - 1)) + 1;
        const currentLineText = text.slice(lineStartIndex, context.from);
        const shouldReuseCurrentLine = currentLineText.trim() === '';
        const prefix = before.trim() ? `\n${baseIndent}` : '\n  ';
        let commaAttachIndex = context.from;

        if (needsCommaBefore) {
          let previousValueIndex = context.from - 1;

          while (previousValueIndex > context.openBraceIndex && /\s/.test(text[previousValueIndex])) {
            previousValueIndex -= 1;
          }

          commaAttachIndex = previousValueIndex + 1;
        }

        if (shouldReuseCurrentLine) {
          let insertionShift = 0;

          if (needsCommaBefore) {
            cm.replaceRange(',', cm.posFromIndex(commaAttachIndex), cm.posFromIndex(commaAttachIndex));
            if (commaAttachIndex < lineStartIndex) {
              insertionShift = 1;
            }
          }

          const lineInsertion = `${baseIndent}${snippet.text}${needsCommaAfter ? ',' : ''}`;
          const adjustedLineStartIndex = lineStartIndex + insertionShift;
          const adjustedContextTo = context.to + insertionShift;
          const lineEndIndex = text.indexOf('\n', adjustedLineStartIndex);
          const replaceToIndex = lineEndIndex === -1 ? adjustedContextTo : Math.min(adjustedContextTo, lineEndIndex);

          cm.replaceRange(lineInsertion, cm.posFromIndex(adjustedLineStartIndex), cm.posFromIndex(replaceToIndex));

          const startIndex = adjustedLineStartIndex + lineInsertion.indexOf(snippet.text) + snippet.cursorOffset;

          if (snippet.selectionLength) {
            cm.setSelection(
              cm.posFromIndex(startIndex),
              cm.posFromIndex(startIndex + snippet.selectionLength)
            );
            return;
          }

          cm.setCursor(cm.posFromIndex(startIndex));
          return;
        }

        const insertLeadingCommaInline = needsCommaBefore && !shouldReuseCurrentLine;
        const insertionPrefix = `${insertLeadingCommaInline ? ',' : ''}${prefix}`;
        const insertion = `${insertionPrefix}${snippet.text}${needsCommaAfter ? ',' : ''}`;
        const replaceFromIndex = commaAttachIndex;

        cm.replaceRange(insertion, cm.posFromIndex(replaceFromIndex), cm.posFromIndex(context.to));

        const startIndex = replaceFromIndex + insertion.indexOf(snippet.text) + snippet.cursorOffset;

        if (snippet.selectionLength) {
          cm.setSelection(
            cm.posFromIndex(startIndex),
            cm.posFromIndex(startIndex + snippet.selectionLength)
          );
          return;
        }

        cm.setCursor(cm.posFromIndex(startIndex));
      }

      function buildVariableCompletions(query, schema, currentText) {
        const existingKeys = getExistingRootKeys(currentText);

        return getVariableSuggestions(query, schema)
          .filter((suggestion) => !existingKeys.has(suggestion.name))
          .flatMap((suggestion) => {
            const completions = [{
              text: suggestion.name,
              displayText: `${suggestion.name}: ${suggestion.typeString}`,
              className: 'cm-hint-argument',
              variableName: suggestion.name,
              defaultValue: suggestion.defaultValue,
              hint(cm, data, completion) {
                applyVariableCompletion(cm, data, completion);
              }
            }];

            if (suggestion.supportsOptionalFieldExpansion) {
              completions.push({
                text: suggestion.name,
                displayText: `* ${suggestion.name}: ${suggestion.typeString} (add optional fields too)`,
                className: 'cm-hint-field',
                variableName: suggestion.name,
                defaultValue: suggestion.defaultValueWithOptionalFields,
                hint(cm, data, completion) {
                  applyVariableCompletion(cm, data, completion);
                }
              });
            }

            return completions;
          });
      }

      function getVariableHints(cm) {
        const cursor = cm.getCursor();
        const cursorIndex = cm.indexFromPos(cursor);
        const text = cm.getValue();
        const context = getRootInsertionContext(text, cursorIndex);
        const token = cm.getTokenAt(cursor);
        const rawToken = token && typeof token.string === 'string' ? token.string.replace(/"/g, '') : '';
        const prefix = /^[A-Za-z_][A-Za-z0-9_]*$/.test(rawToken) ? rawToken.slice(0, Math.max(0, cursor.ch - token.start)) : '';
        const suggestions = buildVariableCompletions($ctrl.query, $ctrl.schema, text).filter((completion) => {
          if (!prefix) {
            return true;
          }

          return completion.variableName.toLowerCase().startsWith(prefix.toLowerCase());
        });

        return {
          list: suggestions,
          from: context ? cm.posFromIndex(context.from) : cursor,
          to: context ? cm.posFromIndex(context.to) : cursor
        };
      }

      function triggerAutocomplete(cm) {
        if (typeof cm.showHint !== 'function') {
          return;
        }

        cm.showHint({
          completeSingle: false,
          hint: getVariableHints
        });
      }

      function formatEditor() {
        if (!editor) {
          return false;
        }

        try {
          const parsed = JSON.parse(editor.getValue() || '{}');
          const formatted = JSON.stringify(parsed, null, 2);

          if (editor.getValue() !== formatted) {
            editor.setValue(formatted);
          }

          return true;
        } catch (error) {
          return false;
        }
      }

      function createEditor() {
        const textarea = $element[0].querySelector('textarea');

        if (!textarea || typeof window.CodeMirror === 'undefined') {
          return;
        }

        ensureVariablesMode();

        editor = window.CodeMirror.fromTextArea(textarea, {
          mode: 'graphql-variables',
          lineNumbers: true,
          lineWrapping: true,
          matchBrackets: true,
          indentUnit: 2,
          tabSize: 2,
          extraKeys: {
            Tab(cm) {
              if (cm.state.completionActive) {
                cm.execCommand('pick');
                return;
              }

              cm.replaceSelection('  ', 'end');
            },
            'Ctrl-Space'(cm) {
              triggerAutocomplete(cm);
            }
          }
        });

        editor.setValue($ctrl.variables || '{}');

        editor.on('change', (instance) => {
          const nextValue = instance.getValue();

          if ($ctrl.variables === nextValue) {
            return;
          }

          $ctrl.variables = nextValue;

          if ($ctrl.onChange) {
            $ctrl.onChange();
          }

          const rootScope = $element.scope();
          if (rootScope && !rootScope.$$phase) {
            rootScope.$applyAsync();
          }
        });

        editor.on('inputRead', (cm, change) => {
          if (!change || change.origin === 'setValue' || typeof cm.showHint !== 'function') {
            return;
          }

          const insertedText = Array.isArray(change.text) ? change.text.join('') : '';

          if (/^[A-Za-z_"]$/.test(insertedText)) {
            triggerAutocomplete(cm);
          }
        });

        bindHoverHandlers(editor);
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

      $ctrl.$postLink = function () {
        $ctrl.api = $ctrl.api || {};
        $ctrl.api.format = formatEditor;
        $ctrl.api.refresh = scheduleRefresh;
        createEditor();
        resizeHandler = () => scheduleRefresh();
        window.addEventListener('resize', resizeHandler);
        window.setTimeout(scheduleRefresh, 0);
        window.setTimeout(scheduleRefresh, 120);
      };

      $ctrl.$onChanges = function (changes) {
        if (!editor || !changes.variables) {
          return;
        }

        const nextValue = changes.variables.currentValue || '{}';

        if (editor.getValue() !== nextValue) {
          const cursor = editor.getCursor();
          editor.setValue(nextValue);
          editor.setCursor(cursor);
        }
      };

      $ctrl.$doCheck = function () {
        if (!editor) {
          return;
        }

        const nextValue = typeof $ctrl.variables === 'string' ? $ctrl.variables : '{}';

        if (editor.getValue() === nextValue) {
          return;
        }

        const cursor = editor.getCursor();
        editor.setValue(nextValue);
        editor.setCursor(cursor);
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
