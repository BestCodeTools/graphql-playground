((app) => {
  const TEMPLATE_VERSION = '20260409g';
  const CUSTOM_HEADERS_COOKIE = 'custom_request_headers';
  const COMMON_HEADERS = [
    { key: 'Authorization', value: '', display: 'Authorization' },
    { key: 'Authorization', value: 'Bearer ', display: 'Authorization: Bearer Token' },
    { key: 'Authorization', value: 'Basic ', display: 'Authorization: Basic Auth' },
    { key: 'Accept', value: 'application/json', display: 'Accept' },
    { key: 'Content-Type', value: 'application/json', display: 'Content-Type' },
    { key: 'X-App-Token', value: '', display: 'X-App-Token' },
    { key: 'X-App-Key', value: '', display: 'X-App-Key' },
    { key: 'X-API-Token', value: '', display: 'X-API-Token' },
    { key: 'X-API-Key', value: '', display: 'X-API-Key' },
    { key: 'X-Request-Id', value: '', display: 'X-Request-Id' },
    { key: 'X-Correlation-Id', value: '', display: 'X-Correlation-Id' },
    { key: 'X-Tenant-Id', value: '', display: 'X-Tenant-Id' },
    { key: 'X-User-Id', value: '', display: 'X-User-Id' },
    { key: 'X-Client-Id', value: '', display: 'X-Client-Id' },
    { key: 'Api-Key', value: '', display: 'Api-Key' },
    { key: 'apikey', value: '', display: 'apikey' }
  ];

  app.component('headersEditor', {
    templateUrl: `components/headers-editor.html?v=${TEMPLATE_VERSION}`,
    bindings: {
      headers: '=',
      api: '=?',
      onChange: '&?'
    },
    controller: ['$element', function ($element) {
      const $ctrl = this;
      let editor = null;
      let resizeHandler = null;

      function readCustomHeadersFromCookie() {
        if (typeof document === 'undefined' || !document.cookie) {
          return [];
        }

        const cookieEntry = document.cookie
          .split('; ')
          .find((entry) => entry.startsWith(`${CUSTOM_HEADERS_COOKIE}=`));

        if (!cookieEntry) {
          return [];
        }

        const rawValue = cookieEntry.substring(CUSTOM_HEADERS_COOKIE.length + 1);

        try {
          const parsed = JSON.parse(decodeURIComponent(rawValue));
          return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()) : [];
        } catch (error) {
          return [];
        }
      }

      function writeCustomHeadersToCookie(headerNames) {
        if (typeof document === 'undefined') {
          return;
        }

        const normalized = Array.from(new Set(headerNames.map((name) => name.trim()).filter(Boolean))).slice(0, 50);
        const encoded = encodeURIComponent(JSON.stringify(normalized));
        const maxAge = 60 * 60 * 24 * 365;

        document.cookie = `${CUSTOM_HEADERS_COOKIE}=${encoded}; path=/; max-age=${maxAge}; SameSite=Lax`;
      }

      function getCustomHeaderSuggestions() {
        return readCustomHeadersFromCookie().map((headerName) => ({
          key: headerName,
          value: '',
          display: `${headerName} (custom)`
        }));
      }

      function saveCustomHeadersFromText(text) {
        try {
          const parsed = JSON.parse(text || '{}');

          if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
            return;
          }

          const knownHeaderNames = new Set(COMMON_HEADERS.map((header) => header.key.toLowerCase()));
          const existingCustom = readCustomHeadersFromCookie();
          const nextCustom = [
            ...existingCustom,
            ...Object.keys(parsed).filter((key) => !knownHeaderNames.has(key.toLowerCase()))
          ];

          writeCustomHeadersToCookie(nextCustom);
        } catch (error) {
          // Ignore invalid JSON while the user is editing.
        }
      }

      function ensureHeadersMode() {
        if (typeof window.CodeMirror === 'undefined') {
          return;
        }

        if (window.CodeMirror.modes && window.CodeMirror.modes['request-headers']) {
          return;
        }

        window.CodeMirror.defineMode('request-headers', function () {
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

              if (stream.match(/^(?:true|false|null)\b/)) {
                return 'atom';
              }

              if (stream.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)) {
                return 'number';
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

            pendingKey = key;
            continue;
          }

          if (char === '{') {
            depth += 1;
          } else if (char === '}') {
            depth = Math.max(0, depth - 1);
          } else if (char === ':' && depth === 1 && pendingKey) {
            keys.add(pendingKey);
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
        while (from > openBraceIndex && /[A-Za-z0-9_\-"]/.test(text[from - 1])) {
          from -= 1;
        }

        let to = cursorIndex;
        while (to < closeBraceIndex && /[A-Za-z0-9_\-"]/.test(text[to])) {
          to += 1;
        }

        return {
          from,
          to,
          openBraceIndex,
          closeBraceIndex
        };
      }

      function buildHeaderSnippet(header) {
        const keyText = `"${header.key}": `;
        const valueText = JSON.stringify(header.value);
        const cursorOffset = header.value ? keyText.length + 1 + header.value.length : keyText.length + 1;

        return {
          text: `${keyText}${valueText}`,
          cursorOffset
        };
      }

      function applyHeaderCompletion(cm, data, completion) {
        const text = cm.getValue();
        const cursor = cm.getCursor();
        const cursorIndex = cm.indexFromPos(cursor);
        const context = getRootInsertionContext(text, cursorIndex);

        if (!context) {
          const fallback = `"${completion.header.key}": ${JSON.stringify(completion.header.value)}`;
          cm.replaceRange(fallback, data.from, data.to);
          return;
        }

        const baseIndent = '  ';
        const snippet = buildHeaderSnippet(completion.header);
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
          cm.setCursor(cm.posFromIndex(startIndex));
          return;
        }

        const insertLeadingCommaInline = needsCommaBefore && !shouldReuseCurrentLine;
        const insertionPrefix = `${insertLeadingCommaInline ? ',' : ''}${prefix}`;
        const insertion = `${insertionPrefix}${snippet.text}${needsCommaAfter ? ',' : ''}`;
        const replaceFromIndex = commaAttachIndex;

        cm.replaceRange(insertion, cm.posFromIndex(replaceFromIndex), cm.posFromIndex(context.to));

        const startIndex = replaceFromIndex + insertion.indexOf(snippet.text) + snippet.cursorOffset;
        cm.setCursor(cm.posFromIndex(startIndex));
      }

      function buildHeaderCompletions(currentText) {
        const existingKeys = getExistingRootKeys(currentText);
        const allHeaders = [...COMMON_HEADERS, ...getCustomHeaderSuggestions()];

        return allHeaders
          .filter((header) => !existingKeys.has(header.key) || header.key === 'Authorization')
          .map((header) => ({
            text: header.key,
            displayText: header.display,
            className: 'cm-hint-field',
            header,
            hint(cm, data, completion) {
              applyHeaderCompletion(cm, data, completion);
            }
          }));
      }

      function getHeaderHints(cm) {
        const cursor = cm.getCursor();
        const cursorIndex = cm.indexFromPos(cursor);
        const text = cm.getValue();
        const context = getRootInsertionContext(text, cursorIndex);
        const token = cm.getTokenAt(cursor);
        const rawToken = token && typeof token.string === 'string' ? token.string.replace(/"/g, '') : '';
        const prefix = /^[A-Za-z_\-][A-Za-z0-9_\-]*$/.test(rawToken) ? rawToken.slice(0, Math.max(0, cursor.ch - token.start)) : '';
        const suggestions = buildHeaderCompletions(text).filter((completion) => {
          if (!prefix) {
            return true;
          }

          return completion.header.key.toLowerCase().startsWith(prefix.toLowerCase())
            || completion.displayText.toLowerCase().startsWith(prefix.toLowerCase());
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
          hint: getHeaderHints
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

        ensureHeadersMode();

        editor = window.CodeMirror.fromTextArea(textarea, {
          mode: 'request-headers',
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

        editor.setValue($ctrl.headers || '{}');

        editor.on('change', (instance) => {
          const nextValue = instance.getValue();

          if ($ctrl.headers === nextValue) {
            return;
          }

          $ctrl.headers = nextValue;
          saveCustomHeadersFromText(nextValue);

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

          if (/^[A-Za-z_\-"]$/.test(insertedText)) {
            triggerAutocomplete(cm);
          }
        });

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
        createEditor();
        resizeHandler = () => scheduleRefresh();
        window.addEventListener('resize', resizeHandler);
        window.setTimeout(scheduleRefresh, 0);
        window.setTimeout(scheduleRefresh, 120);
      };

      $ctrl.$onChanges = function (changes) {
        if (!editor || !changes.headers) {
          return;
        }

        const nextValue = changes.headers.currentValue || '{}';

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

        const nextValue = typeof $ctrl.headers === 'string' ? $ctrl.headers : '{}';

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
          editor.toTextArea();
          editor = null;
        }
      };
    }]
  });
})(angular.module('app'));
