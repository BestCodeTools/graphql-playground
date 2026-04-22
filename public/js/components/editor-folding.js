((window) => {
  const FOLD_GUTTER = 'graphql-fold-gutter';

  function createBlockFolding(editor) {
    let previewElement = null;
    let hidePreviewTimeout = null;
    let gutterRefreshTimeout = null;

    function findMatchingClose(text, openIndex, openChar, closeChar) {
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let index = openIndex; index < text.length; index += 1) {
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

        if (char === openChar) {
          depth += 1;
          continue;
        }

        if (char === closeChar) {
          depth -= 1;

          if (depth === 0) {
            return index;
          }
        }
      }

      return -1;
    }

    function getFoldRangeAtLine(line) {
      const lineText = editor.getLine(line) || '';
      const candidates = [
        { open: '{', close: '}', label: '{ ... }' },
        { open: '[', close: ']', label: '[ ... ]' }
      ];

      for (let index = 0; index < lineText.length; index += 1) {
        const candidate = candidates.find((item) => item.open === lineText[index]);

        if (!candidate) {
          continue;
        }

        const tokenType = editor.getTokenTypeAt({ line, ch: index + 1 }) || '';

        if (/string/.test(tokenType)) {
          continue;
        }

        const openIndex = editor.indexFromPos({ line, ch: index });
        const closeIndex = findMatchingClose(editor.getValue(), openIndex, candidate.open, candidate.close);

        if (closeIndex <= openIndex) {
          continue;
        }

        const closePos = editor.posFromIndex(closeIndex);

        if (closePos.line > line || closePos.ch - index > 6) {
          return {
            from: { line, ch: index },
            to: closePos,
            label: candidate.label
          };
        }
      }

      return null;
    }

    function getFoldMarksAtLine(line) {
      const lineLength = (editor.getLine(line) || '').length;

      return editor.findMarks({ line, ch: 0 }, { line, ch: lineLength + 1 })
        .filter((mark) => mark && mark.__graphqlPlaygroundFold);
    }

    function getPreviewText(range) {
      const content = editor.getRange(
        { line: range.from.line, ch: range.from.ch + 1 },
        range.to
      ).trim();

      if (!content) {
        return '';
      }

      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.trim())
        .slice(0, 12);
      const preview = lines.join('\n');

      return preview.length > 520 ? `${preview.slice(0, 520)}...` : preview;
    }

    function ensurePreviewElement() {
      if (previewElement || typeof document === 'undefined') {
        return previewElement;
      }

      previewElement = document.createElement('pre');
      previewElement.className = 'graphql-fold-preview';
      previewElement.style.display = 'none';
      document.body.appendChild(previewElement);
      return previewElement;
    }

    function positionPreview(event) {
      if (!previewElement || !event) {
        return;
      }

      const gap = 10;
      const maxLeft = Math.max(gap, window.innerWidth - 440 - gap);
      const maxTop = Math.max(gap, window.innerHeight - 220 - gap);

      previewElement.style.left = `${Math.min(event.clientX + gap, maxLeft)}px`;
      previewElement.style.top = `${Math.min(event.clientY + gap, maxTop)}px`;
    }

    function showPreview(previewText, event) {
      const preview = ensurePreviewElement();

      if (!preview || !previewText) {
        return;
      }

      if (hidePreviewTimeout) {
        window.clearTimeout(hidePreviewTimeout);
        hidePreviewTimeout = null;
      }

      preview.textContent = previewText;
      preview.style.display = 'block';
      preview.classList.remove('is-visible');
      positionPreview(event);

      window.requestAnimationFrame(() => {
        if (preview) {
          preview.classList.add('is-visible');
        }
      });
    }

    function hidePreview() {
      if (!previewElement) {
        return;
      }

      previewElement.classList.remove('is-visible');

      if (hidePreviewTimeout) {
        window.clearTimeout(hidePreviewTimeout);
      }

      hidePreviewTimeout = window.setTimeout(() => {
        if (previewElement) {
          previewElement.style.display = 'none';
        }
        hidePreviewTimeout = null;
      }, 160);
    }

    function makeGutterMarker(isFolded) {
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'graphql-fold-gutter-marker';
      marker.textContent = isFolded ? '▸' : '▾';
      marker.title = isFolded ? 'Expand block' : 'Collapse block';
      return marker;
    }

    function refresh() {
      editor.clearGutter(FOLD_GUTTER);

      for (let line = 0; line < editor.lineCount(); line += 1) {
        const hasRange = getFoldRangeAtLine(line);
        const folded = getFoldMarksAtLine(line).length > 0;

        if (hasRange || folded) {
          editor.setGutterMarker(line, FOLD_GUTTER, makeGutterMarker(folded));
        }
      }
    }

    function scheduleRefresh() {
      if (gutterRefreshTimeout) {
        window.clearTimeout(gutterRefreshTimeout);
      }

      gutterRefreshTimeout = window.setTimeout(() => {
        refresh();
        gutterRefreshTimeout = null;
      }, 60);
    }

    function clear(line) {
      const marks = typeof line === 'number'
        ? getFoldMarksAtLine(line)
        : editor.getAllMarks().filter((mark) => mark && mark.__graphqlPlaygroundFold);

      marks.forEach((mark) => mark.clear());
      hidePreview();
      refresh();
    }

    function fold(range) {
      const previewText = getPreviewText(range);
      const widget = document.createElement('span');
      let marker = null;

      widget.className = 'graphql-fold-widget';
      widget.textContent = range.label;
      widget.title = 'Expand block';
      widget.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (marker) {
          marker.clear();
        }

        hidePreview();
        refresh();
        editor.focus();
      });
      widget.addEventListener('mouseenter', (event) => showPreview(previewText, event));
      widget.addEventListener('mousemove', positionPreview);
      widget.addEventListener('mouseleave', hidePreview);

      marker = editor.markText(
        range.from,
        { line: range.to.line, ch: range.to.ch + 1 },
        {
          replacedWith: widget,
          clearOnEnter: false,
          atomic: true
        }
      );
      marker.__graphqlPlaygroundFold = true;
      refresh();
    }

    function toggleAtLine(line) {
      const existingMarks = getFoldMarksAtLine(line);

      if (existingMarks.length) {
        clear(line);
        return;
      }

      const range = getFoldRangeAtLine(line);

      if (range) {
        fold(range);
      }
    }

    function toggleAtCursor() {
      toggleAtLine(editor.getCursor().line);
    }

    function destroy() {
      if (gutterRefreshTimeout) {
        window.clearTimeout(gutterRefreshTimeout);
        gutterRefreshTimeout = null;
      }

      clear();

      if (previewElement && previewElement.parentNode) {
        if (hidePreviewTimeout) {
          window.clearTimeout(hidePreviewTimeout);
          hidePreviewTimeout = null;
        }
        previewElement.parentNode.removeChild(previewElement);
        previewElement = null;
      }
    }

    editor.on('gutterClick', (cm, line, gutter) => {
      if (gutter === FOLD_GUTTER) {
        toggleAtLine(line);
      }
    });

    refresh();

    return {
      clear,
      destroy,
      refresh,
      scheduleRefresh,
      toggleAtCursor
    };
  }

  window.GraphqlPlaygroundEditorFolding = {
    FOLD_GUTTER,
    createBlockFolding
  };
})(window);
