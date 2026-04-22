((app) => {
  const TEMPLATE_VERSION = '20260409c';

  app.component('responseViewer', {
    templateUrl: `components/response-viewer.html?v=${TEMPLATE_VERSION}`,
    bindings: {
      result: '<',
      api: '=?'
    },
    controller: ['$element', function ($element) {
      const $ctrl = this;
      let editor = null;
      let folding = null;
      let resizeHandler = null;

      function ensureResponseMode() {
        if (typeof window.CodeMirror === 'undefined') {
          return;
        }

        if (window.CodeMirror.modes && window.CodeMirror.modes['graphql-response-json']) {
          return;
        }

        window.CodeMirror.defineMode('graphql-response-json', function () {
          return {
            startState() {
              return {
                inString: false,
                escaped: false,
                stringTokenType: 'string',
                contextStack: []
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

                return state.stringTokenType || 'string';
              }

              if (stream.eatSpace()) {
                return null;
              }

              if (stream.peek() === '"') {
                const currentContext = state.contextStack[state.contextStack.length - 1];
                stream.next();
                state.inString = true;
                state.escaped = false;
                state.stringTokenType = currentContext && currentContext.type === 'object' && currentContext.expectKey
                  ? 'property'
                  : 'string';
                return state.stringTokenType;
              }

              if (stream.match(/^(?:true|false|null)\b/)) {
                const currentContext = state.contextStack[state.contextStack.length - 1];
                if (currentContext && currentContext.type === 'object' && !currentContext.expectKey) {
                  currentContext.expectKey = false;
                }
                return 'atom';
              }

              if (stream.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)) {
                const currentContext = state.contextStack[state.contextStack.length - 1];
                if (currentContext && currentContext.type === 'object' && !currentContext.expectKey) {
                  currentContext.expectKey = false;
                }
                return 'number';
              }

              if (stream.match(/^[{}\[\],:]/)) {
                const token = stream.current();
                const currentContext = state.contextStack[state.contextStack.length - 1];

                if (token === '{') {
                  state.contextStack.push({ type: 'object', expectKey: true });
                } else if (token === '[') {
                  state.contextStack.push({ type: 'array', expectKey: false });
                } else if (token === '}') {
                  state.contextStack.pop();
                } else if (token === ']') {
                  state.contextStack.pop();
                } else if (token === ':') {
                  if (currentContext && currentContext.type === 'object') {
                    currentContext.expectKey = false;
                  }
                } else if (token === ',') {
                  if (currentContext && currentContext.type === 'object') {
                    currentContext.expectKey = true;
                  }
                }

                return 'bracket';
              }

              stream.next();
              return null;
            }
          };
        });
      }

      function scheduleRefresh() {
        if (!editor) {
          return;
        }

        window.requestAnimationFrame(() => {
          if (editor) {
            editor.setSize('100%', '100%');
            const wrapper = editor.getWrapperElement();
            const scroller = editor.getScrollerElement();

            if (wrapper) {
              wrapper.style.width = '100%';
              wrapper.style.height = '100%';
              wrapper.style.flex = '1 1 auto';
            }

            if (scroller) {
              scroller.style.width = '100%';
              scroller.style.height = '100%';
            }

            editor.refresh();
            if (folding) {
              folding.refresh();
            }
          }
        });
      }

      function createEditor() {
        const textarea = $element[0].querySelector('textarea');

        if (!textarea || typeof window.CodeMirror === 'undefined') {
          return;
        }

        ensureResponseMode();

        editor = window.CodeMirror.fromTextArea(textarea, {
          mode: 'graphql-response-json',
          lineNumbers: true,
          lineWrapping: true,
          readOnly: true,
          gutters: ['CodeMirror-linenumbers', window.GraphqlPlaygroundEditorFolding.FOLD_GUTTER],
          extraKeys: {
            'Ctrl-Q'() {
              if (folding) {
                folding.toggleAtCursor();
              }
            }
          },
          viewportMargin: Infinity
        });

        editor.setValue($ctrl.result || '');
        editor.setSize('100%', '100%');
        folding = window.GraphqlPlaygroundEditorFolding.createBlockFolding(editor);
        scheduleRefresh();
      }

      $ctrl.$postLink = function () {
        $ctrl.api = $ctrl.api || {};
        $ctrl.api.refresh = scheduleRefresh;
        createEditor();
        resizeHandler = () => scheduleRefresh();
        window.addEventListener('resize', resizeHandler);
        window.setTimeout(scheduleRefresh, 0);
        window.setTimeout(scheduleRefresh, 120);
      };

      $ctrl.$onChanges = function (changes) {
        if (!editor || !changes.result) {
          return;
        }

        const nextValue = typeof changes.result.currentValue === 'string' ? changes.result.currentValue : '';
        if (editor.getValue() === nextValue) {
          return;
        }

        const scrollInfo = editor.getScrollInfo();
        if (folding) {
          folding.clear();
        }
        editor.setValue(nextValue);
        editor.scrollTo(scrollInfo.left, scrollInfo.top);
        if (folding) {
          folding.scheduleRefresh();
        }
        scheduleRefresh();
      };

      $ctrl.$onDestroy = function () {
        if (resizeHandler) {
          window.removeEventListener('resize', resizeHandler);
          resizeHandler = null;
        }

        if (editor) {
          if (folding) {
            folding.destroy();
            folding = null;
          }
          editor.toTextArea();
          editor = null;
        }
      };
    }]
  });
})(angular.module('app'));
