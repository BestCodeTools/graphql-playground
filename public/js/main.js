var app = angular.module('app', []);

app.factory('AppState', function () {
  const tryParse = (value) => {
    if(value === null) return null;
    try { return JSON.parse(value); } 
    catch (e) { return value; }
  };
  return {
    saveKey: function (key, value) {
      sessionStorage.setItem(key, angular.$$stringify(value));
    },
    getKey: function (key) {
      const value = sessionStorage.getItem(key);
      return tryParse(value);
    }
  };
});

app.factory('I18nService', ['AppState', function (AppState) {
  const STORAGE_KEY = 'locale';
  const dictionaries = {
    en: {
      'app.name': 'GraphQL Playground',
      'app.developed_by': 'Developed by BestCodeTools',
      'nav.settings': 'Settings',
      'nav.language': 'Language',
      'language.en': 'English',
      'language.pt-BR': 'Portuguese (Brazil)',
      'actions.send': 'Send',
      'actions.close': 'Close',
      'actions.format': 'Format',
      'actions.import_curl': 'Import cURL',
      'actions.new_query': 'New Query',
      'actions.new_mutation': 'New Mutation',
      'modal.settings': 'Settings',
      'tabs.default': 'Tab',
      'editor.query': 'Query Editor',
      'editor.response': 'Response Body',
      'editor.variables': 'Variables Payload',
      'editor.headers': 'Request Headers',
      'schema.title': 'Schema Viewer',
      'schema.search_placeholder': 'Search types or first-level fields',
      'schema.note': 'Ctrl+Click a root query, mutation, or subscription field to add it to the active payload with operation variables.',
      'schema.error': 'An error occurred while loading the schema',
      'schema.retry': 'Retry to load schema',
      'config.shared_headers': 'Shared Headers',
      'config.other': 'Other',
      'config.property': 'Property',
      'config.value': 'Value',
      'config.key_placeholder': 'Key',
      'config.value_placeholder': 'Value',
      'config.add_header': '+ Add Header',
      'config.other_placeholder': 'Other',
      'workspace.export': 'Export Workspace',
      'workspace.import': 'Import Workspace',
      'workspace.note': 'Export and import your full workspace, including tabs and settings.',
      'workspace.import_error': 'Could not import this workspace file.',
      'curl.import_title': 'Import cURL',
      'curl.import_placeholder': 'Paste a cURL command copied from your browser or terminal',
      'curl.import_confirm': 'Import',
      'curl.import_error': 'Could not import this cURL command.',
      'workspace.token_placeholder': '[your token here]',
      'workspace.key_placeholder': '[your key here]',
      'query.placeholder': '/* Type your query here */'
    },
    'pt-BR': {
      'app.name': 'GraphQL Playground',
      'app.developed_by': 'Desenvolvido por BestCodeTools',
      'nav.settings': 'Configurações',
      'nav.language': 'Idioma',
      'language.en': 'English',
      'language.pt-BR': 'Português (Brasil)',
      'actions.send': 'Enviar',
      'actions.close': 'Fechar',
      'actions.format': 'Formatar',
      'actions.import_curl': 'Importar cURL',
      'actions.new_query': 'Nova Query',
      'actions.new_mutation': 'Nova Mutation',
      'modal.settings': 'Configurações',
      'tabs.default': 'Aba',
      'editor.query': 'Editor de Query',
      'editor.response': 'Response Body',
      'editor.variables': 'Payload de Variables',
      'editor.headers': 'Request Headers',
      'schema.title': 'Schema Viewer',
      'schema.search_placeholder': 'Buscar types ou fields de primeiro nível',
      'schema.note': 'Ctrl+Click em um field raiz de query, mutation ou subscription para adicionar ao payload ativo com operation variables.',
      'schema.error': 'Ocorreu um erro ao carregar o schema',
      'schema.retry': 'Tentar carregar o schema novamente',
      'config.shared_headers': 'Shared Headers',
      'config.other': 'Outros',
      'config.property': 'Propriedade',
      'config.value': 'Valor',
      'config.key_placeholder': 'Chave',
      'config.value_placeholder': 'Valor',
      'config.add_header': '+ Adicionar Header',
      'config.other_placeholder': 'Outras Configurações (placeholder)',
      'curl.import_title': 'Importar cURL',
      'curl.import_placeholder': 'Cole um comando cURL copiado do navegador ou terminal',
      'curl.import_confirm': 'Importar',
      'curl.import_error': 'Não foi possível importar este comando cURL.',
      'query.placeholder': '/* Digite sua query aqui */'
    }
  };

  let locale = AppState.getKey(STORAGE_KEY) || 'pt-BR';
  if (!dictionaries[locale]) {
    locale = 'pt-BR';
  }

  return {
    getLocale: function () {
      return locale;
    },
    setLocale: function (nextLocale) {
      if (!dictionaries[nextLocale]) {
        return locale;
      }

      locale = nextLocale;
      AppState.saveKey(STORAGE_KEY, locale);
      return locale;
    },
    getLocales: function () {
      return [
        { code: 'en', labelKey: 'language.en' },
        { code: 'pt-BR', labelKey: 'language.pt-BR' }
      ];
    },
    t: function (key) {
      return (dictionaries[locale] && dictionaries[locale][key])
        || (dictionaries.en && dictionaries.en[key])
        || key;
    }
  };
}]);
// Serviços da aplicação
app.factory('CurlImportService', function () {
  const HEADER_OPTIONS = new Set(['-H', '--header']);
  const DATA_OPTIONS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode']);
  const METHOD_OPTIONS = new Set(['-X', '--request']);
  const URL_OPTIONS = new Set(['--url']);
  const VALUE_OPTIONS = new Set([
    ...HEADER_OPTIONS,
    ...DATA_OPTIONS,
    ...METHOD_OPTIONS,
    ...URL_OPTIONS,
    '-A',
    '--user-agent',
    '-b',
    '--cookie',
    '-u',
    '--user',
    '--connect-timeout',
    '--max-time',
    '--proxy',
    '--referer'
  ]);

  function normalizeShellLines(input) {
    const text = String(input || '').replace(/\r\n?/g, '\n');
    let normalized = '';
    let quote = null;
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        normalized += char;
        escaped = false;
        continue;
      }

      if (char === '\\' && quote !== "'") {
        if (!quote && text[index + 1] === '\n') {
          normalized += ' ';
          index += 1;
          continue;
        }

        escaped = true;
        normalized += char;
        continue;
      }

      if ((char === '"' || char === "'") && !quote) {
        quote = char;
      } else if (char === quote) {
        quote = null;
      }

      normalized += char === '\n' && !quote ? ' ' : char;
    }

    return normalized;
  }

  function tokenizeShell(input) {
    const text = normalizeShellLines(input);
    const tokens = [];
    let current = '';
    let quote = null;
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\' && quote !== "'") {
        escaped = true;
        continue;
      }

      if (quote) {
        if (char === quote) {
          quote = null;
        } else {
          current += char;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (/\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (escaped) {
      current += '\\';
    }

    if (quote) {
      throw new Error('Unclosed quote in cURL command.');
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  function readOptionValue(tokens, index, option) {
    const token = tokens[index];
    const inlinePrefix = `${option}=`;

    if (token.startsWith(inlinePrefix)) {
      return {
        value: token.slice(inlinePrefix.length),
        nextIndex: index
      };
    }

    if (tokens[index + 1] == null || tokens[index + 1].startsWith('-')) {
      return {
        value: '',
        nextIndex: index
      };
    }

    return {
      value: tokens[index + 1],
      nextIndex: index + 1
    };
  }

  function splitHeader(headerText) {
    const separatorIndex = String(headerText || '').indexOf(':');

    if (separatorIndex === -1) {
      return null;
    }

    const name = headerText.slice(0, separatorIndex).trim();
    const value = headerText.slice(separatorIndex + 1).trim();

    return name ? { name, value } : null;
  }

  function isUrlToken(token) {
    return /^https?:\/\//i.test(String(token || ''));
  }

  function parseBody(dataParts) {
    const bodyText = dataParts.join('&').trim();

    if (!bodyText) {
      return {
        query: '',
        variables: '{}'
      };
    }

    try {
      const parsed = JSON.parse(bodyText);

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {
          query: typeof parsed.query === 'string' ? parsed.query : '',
          variables: JSON.stringify(parsed.variables && typeof parsed.variables === 'object' ? parsed.variables : {}, null, 2)
        };
      }
    } catch (error) {
      // Non-JSON bodies are still useful as a paste source for the query editor.
    }

    return {
      query: bodyText,
      variables: '{}'
    };
  }

  function parse(input) {
    const tokens = tokenizeShell(input);

    if (!tokens.length || tokens[0].toLowerCase() !== 'curl') {
      throw new Error('Expected a cURL command.');
    }

    const headers = {};
    const dataParts = [];
    let url = '';
    let method = '';

    for (let index = 1; index < tokens.length; index += 1) {
      const token = tokens[index];
      const optionName = token.includes('=') ? token.slice(0, token.indexOf('=')) : token;

      if (HEADER_OPTIONS.has(optionName)) {
        const option = readOptionValue(tokens, index, optionName);
        const header = splitHeader(option.value);

        if (header) {
          headers[header.name] = header.value;
        }

        index = option.nextIndex;
        continue;
      }

      if (DATA_OPTIONS.has(optionName)) {
        const option = readOptionValue(tokens, index, optionName);

        if (option.value) {
          dataParts.push(option.value);
        }

        index = option.nextIndex;
        continue;
      }

      if (METHOD_OPTIONS.has(optionName)) {
        const option = readOptionValue(tokens, index, optionName);
        method = option.value.toUpperCase();
        index = option.nextIndex;
        continue;
      }

      if (URL_OPTIONS.has(optionName)) {
        const option = readOptionValue(tokens, index, optionName);
        url = option.value;
        index = option.nextIndex;
        continue;
      }

      if (VALUE_OPTIONS.has(optionName)) {
        const option = readOptionValue(tokens, index, optionName);
        index = option.nextIndex;
        continue;
      }

      if (isUrlToken(token)) {
        url = token;
      }
    }

    if (!url) {
      throw new Error('Could not find a URL in the cURL command.');
    }

    const body = parseBody(dataParts);

    return {
      url,
      method: method || (dataParts.length ? 'POST' : 'GET'),
      headers: JSON.stringify(headers, null, 2),
      query: body.query,
      variables: body.variables
    };
  }

  return {
    parse,
    tokenizeShell
  };
});

// Serviço para gerenciar o estado das abas
app.factory('TabService', ['AppState', function (state) {
  const STORAGE_KEY = 'tabs';

  return {
    getTabs: function () {
      const tabs = state.getKey(STORAGE_KEY);
      return tabs ? tabs : [];
    },
    saveTabs: function (tabs) {
      state.saveKey(STORAGE_KEY, tabs);
    },
    generateTabId: function () {
      return Date.now() + Math.random().toString(36).substr(2, 5);
    }
  };
}]);

app.controller('MainController', ['$scope', '$timeout', 'AppState', 'TabService', 'I18nService', 'CurlImportService', function ($scope, $timeout, AppState, TabService, I18nService, CurlImportService) {
  const $ctrl = this;
  const ACTIVE_TAB_STORAGE_KEY = 'activeTab';
  const SHARED_HEADERS_STORAGE_KEY = 'sharedHeaders';
  $scope.$ctrl = $ctrl;
  // Estado inicial
  $ctrl.title = 'AngularJS Tutorial Example';
  $ctrl.message = 'Hello World!';
  $ctrl.ready = true;
  $ctrl.appVersion = 'v1.1.1';
  $ctrl.locales = I18nService.getLocales();
  $ctrl.locale = I18nService.getLocale();
  $ctrl.t = function (key) {
    return I18nService.t(key);
  };
  $ctrl.tabs = [];
  $ctrl.activeTab = 0;
  $ctrl.schema = null;
  $ctrl.loadSchemaError = null;
  function getDefaultGraphqlUrl() {
    if (typeof window === 'undefined' || !window.location) {
      return 'http://localhost:4000/graphql';
    }

    const { protocol, hostname, host } = window.location;
    const normalizedHost = String(hostname || '').toLowerCase();
    const isLoopbackHost = normalizedHost === 'localhost'
      || normalizedHost === '127.0.0.1'
      || normalizedHost === '::1'
      || normalizedHost === '[::1]';

    if (isLoopbackHost) {
      return 'http://localhost:4000/graphql';
    }

    return `${protocol}//${host}/graphql`;
  }

  $ctrl.url = sessionStorage.getItem('url') || getDefaultGraphqlUrl();
  // Estado inicial
  $ctrl.showConfig = false;

  // Abrir e fechar modal
  $ctrl.openConfig = function () {
    $ctrl.showConfig = true;
  };

  $ctrl.closeConfig = function () {
    $ctrl.showConfig = false;
  };
  $ctrl.setLocale = function (locale) {
    $ctrl.locale = I18nService.setLocale(locale);
  };
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
  const persistTabsDebounced = debounce(() => {
    TabService.saveTabs($ctrl.tabs);
  }, 250);
  $ctrl.persistTabs = function () {
    persistTabsDebounced();
    sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, String($ctrl.activeTab || 0));
  };
  $ctrl.saveTabsToSessionStorage = function () {
    $ctrl.persistTabs();
  };

  function getTabTitleFromQuery(queryText, tabIndex) {
    const safeQuery = typeof queryText === 'string' ? queryText : '';
    const queryWithoutComments = safeQuery
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/([^:]|^)\/\/.*$/gm, '$1')
      .replace(/#.*/g, '');

    const namedOperationMatch = /\b(query|mutation|subscription)\s+([^\(\{\}\)\s]+)/.exec(queryWithoutComments);
    if (namedOperationMatch) {
      return `${namedOperationMatch[1]} ${namedOperationMatch[2]}`;
    }

    const anonymousOperationMatch = /\b(query|mutation|subscription)\b\s*(\([^)]*\))?\s*\{([\s\S]*)\}/.exec(queryWithoutComments);
    if (anonymousOperationMatch) {
      const selectionBody = anonymousOperationMatch[3] || '';
      const firstRootFieldMatch = /(^|[\s{])([A-Za-z_][A-Za-z0-9_]*)(?=\s*(\(|\{|@|$|\n))/m.exec(selectionBody);

      if (firstRootFieldMatch && firstRootFieldMatch[2]) {
        return firstRootFieldMatch[2];
      }
    }

    return `${$ctrl.t('tabs.default')} ${tabIndex}`;
  }

  function getWorkspaceLabel(key) {
    const isPtBr = I18nService.getLocale() === 'pt-BR';

    const labels = {
      export: isPtBr ? 'Exportar Workspace' : 'Export Workspace',
      import: isPtBr ? 'Importar Workspace' : 'Import Workspace',
      note: isPtBr
        ? 'Exporte e importe seu workspace completo, incluindo abas e configurações.'
        : 'Export and import your full workspace, including tabs and settings.',
      importError: isPtBr
        ? 'Não foi possível importar este arquivo de workspace.'
        : 'Could not import this workspace file.',
      tokenPlaceholder: isPtBr ? '[seu token aqui]' : '[your token here]',
      keyPlaceholder: isPtBr ? '[sua chave aqui]' : '[your key here]'
    };

    return labels[key] || '';
  }

  function isSensitiveHeaderName(headerName) {
    const normalizedName = String(headerName || '').trim().toLowerCase();
    return normalizedName === 'authorization' || normalizedName.includes('token') || normalizedName.includes('key');
  }

  function getHeaderExportPlaceholder(headerName) {
    const normalizedName = String(headerName || '').trim().toLowerCase();
    return normalizedName.includes('key')
      ? getWorkspaceLabel('keyPlaceholder')
      : getWorkspaceLabel('tokenPlaceholder');
  }

  function sanitizeHeadersTextForExport(headersText) {
    const safeText = typeof headersText === 'string' ? headersText : '{}';

    try {
      const parsed = JSON.parse(safeText);

      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        return safeText;
      }

      const sanitized = Object.keys(parsed).reduce((acc, key) => {
        acc[key] = isSensitiveHeaderName(key)
          ? getHeaderExportPlaceholder(key)
          : parsed[key];
        return acc;
      }, {});

      return JSON.stringify(sanitized, null, 2);
    } catch (error) {
      return safeText.replace(/"([^"]+)"\s*:\s*"([^"]*)"/g, (match, key) => {
        if (!isSensitiveHeaderName(key)) {
          return match;
        }

        return `"${key}": "${getHeaderExportPlaceholder(key)}"`;
      });
    }
  }

  function sanitizeSharedHeadersForExport(headers) {
    if (!Array.isArray(headers)) {
      return [];
    }

    return headers.map((header) => {
      const key = header && typeof header.key === 'string' ? header.key : '';
      const value = header && typeof header.value === 'string' ? header.value : '';

      return {
        key,
        value: isSensitiveHeaderName(key) ? getHeaderExportPlaceholder(key) : value
      };
    });
  }

  function parseJsonObject(text, fallbackValue) {
    const safeText = typeof text === 'string' ? text.trim() : '';

    if (!safeText) {
      return fallbackValue;
    }

    const parsed = JSON.parse(safeText);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('Expected a JSON object.');
    }

    return parsed;
  }

  function getSharedHeadersMap() {
    const sharedHeaders = AppState.getKey(SHARED_HEADERS_STORAGE_KEY) || [];

    if (!Array.isArray(sharedHeaders)) {
      return {};
    }

    return sharedHeaders.reduce((acc, header) => {
      const key = header && typeof header.key === 'string' ? header.key.trim() : '';
      const value = header && typeof header.value === 'string' ? header.value : '';

      if (!key) {
        return acc;
      }

      acc[key] = value;
      return acc;
    }, {});
  }

  function formatResponseBody(response, payload) {
    const contentType = response.headers.get('content-type') || '';
    const isJsonResponse = contentType.toLowerCase().includes('application/json');

    return Promise.resolve().then(() => {
      if (isJsonResponse) {
        return response.json().then((data) => JSON.stringify(data, null, 2));
      }

      return response.text().then((text) => {
        if (!text) {
          return JSON.stringify(payload, null, 2);
        }

        try {
          return JSON.stringify(JSON.parse(text), null, 2);
        } catch (error) {
          return text;
        }
      });
    });
  }

  function applyAutomaticTabTitle(tab, tabIndex) {
    if (!tab) {
      return;
    }

    const manualTitle = typeof tab.userDefinedLabel === 'string' ? tab.userDefinedLabel.trim() : '';
    tab.title = manualTitle || getTabTitleFromQuery(tab.query, tabIndex);
  }

  function normalizeTab(tab, index) {
    const normalizedTab = {
      id: tab && tab.id ? tab.id : TabService.generateTabId(),
      title: tab && typeof tab.title === 'string' ? tab.title : `${$ctrl.t('tabs.default')} ${index}`,
      userDefinedLabel: tab && typeof tab.userDefinedLabel === 'string'
        ? tab.userDefinedLabel
        : (tab && tab.hasManualTitle ? (tab.title || '') : ''),
      query: tab && typeof tab.query === 'string' ? tab.query : $ctrl.t('query.placeholder'),
      variables: tab && typeof tab.variables === 'string' ? tab.variables : '{}',
      headers: tab && typeof tab.headers === 'string' ? tab.headers : '{}',
      result: tab && typeof tab.result === 'string' ? tab.result : '',
      isEditingTitle: false
    };

    applyAutomaticTabTitle(normalizedTab, index);
    delete normalizedTab.hasManualTitle;
    return normalizedTab;
  }

  function setTabs(nextTabs) {
    const normalizedTabs = Array.isArray(nextTabs) && nextTabs.length
      ? nextTabs.map((tab, index) => normalizeTab(tab, index))
      : [normalizeTab({}, 0)];

    $ctrl.tabs = normalizedTabs;
    TabService.saveTabs($ctrl.tabs);
  }

  function refreshActiveTabEditors() {
    const activeTab = $ctrl.tabs[$ctrl.activeTab];

    if (!activeTab) {
      return;
    }

    $timeout(() => {
      if (activeTab.queryEditorApi && activeTab.queryEditorApi.refresh) {
        activeTab.queryEditorApi.refresh();
      }

      if (activeTab.variablesEditorApi && activeTab.variablesEditorApi.refresh) {
        activeTab.variablesEditorApi.refresh();
      }

      if (activeTab.headersEditorApi && activeTab.headersEditorApi.refresh) {
        activeTab.headersEditorApi.refresh();
      }

      if (activeTab.responseViewerApi && activeTab.responseViewerApi.refresh) {
        activeTab.responseViewerApi.refresh();
      }
    }, 0);

    $timeout(() => {
      if (activeTab.queryEditorApi && activeTab.queryEditorApi.refresh) {
        activeTab.queryEditorApi.refresh();
      }

      if (activeTab.variablesEditorApi && activeTab.variablesEditorApi.refresh) {
        activeTab.variablesEditorApi.refresh();
      }

      if (activeTab.headersEditorApi && activeTab.headersEditorApi.refresh) {
        activeTab.headersEditorApi.refresh();
      }

      if (activeTab.responseViewerApi && activeTab.responseViewerApi.refresh) {
        activeTab.responseViewerApi.refresh();
      }
    }, 120);
  }

  $ctrl.beginTabTitleEdit = function (tabIndex, $event) {
    const tab = $ctrl.tabs[tabIndex];

    if (!tab) {
      return;
    }

    if ($event) {
      $event.preventDefault();
      $event.stopPropagation();
    }

    $ctrl.activeTab = tabIndex;
    tab.isEditingTitle = true;
    tab.titleDraft = (typeof tab.userDefinedLabel === 'string' && tab.userDefinedLabel.trim())
      ? tab.userDefinedLabel
      : (tab.title || '');

    $timeout(() => {
      const input = document.getElementById(`tab-title-editor-${tab.id}`);
      if (!input) {
        return;
      }

      input.focus();
      input.select();
    }, 0);
  };

  $ctrl.commitTabTitleEdit = function (tabIndex) {
    const tab = $ctrl.tabs[tabIndex];

    if (!tab) {
      return;
    }

    const nextTitle = (tab.titleDraft || '').trim();
    tab.isEditingTitle = false;

    tab.userDefinedLabel = nextTitle || '';
    applyAutomaticTabTitle(tab, tabIndex);

    delete tab.titleDraft;
    $ctrl.persistTabs();
  };

  $ctrl.cancelTabTitleEdit = function (tabIndex) {
    const tab = $ctrl.tabs[tabIndex];

    if (!tab) {
      return;
    }

    tab.isEditingTitle = false;
    delete tab.titleDraft;
  };

  $ctrl.handleTabTitleKeydown = function ($event, tabIndex) {
    if ($event.key === 'Enter') {
      $event.preventDefault();
      $ctrl.commitTabTitleEdit(tabIndex);
      return;
    }

    if ($event.key === 'Escape') {
      $event.preventDefault();
      $ctrl.cancelTabTitleEdit(tabIndex);
    }
  };

  $ctrl.handleTabMouseDown = function ($event, tabIndex) {
    if (!$event || $event.button !== 1 || $ctrl.tabs.length <= 1) {
      return;
    }

    $event.preventDefault();
    $event.stopPropagation();
    $ctrl.closeTab(tabIndex);
  };

  $scope.$watch('$ctrl.tabs[$ctrl.activeTab].query', (newQuery) => {
    const activeTab = $ctrl.tabs[$ctrl.activeTab];

    if (!activeTab) {
      return;
    }

    applyAutomaticTabTitle(activeTab, $ctrl.activeTab);

    $ctrl.persistTabs();
  });
  $scope.$watch('$ctrl.url', (newUrl) => {
    debounce(() => {
      loadSchema(newUrl);
      sessionStorage.setItem('url', newUrl);
      $scope.$apply();
    }, 500)();
  });
  // Carrega as abas do sessionStorage
  function loadTabs() {
    const storedTabs = TabService.getTabs();

    // Garante que cada aba tenha um ID único (evita duplicatas no ngRepeat)
    setTabs(storedTabs);

    const storedActiveTab = parseInt(sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY), 10);
    if (Number.isInteger(storedActiveTab) && storedActiveTab >= 0) {
      $ctrl.activeTab = Math.min(storedActiveTab, Math.max($ctrl.tabs.length - 1, 0));
    }
  }
  function loadSchema(newUrl) {
    console.log('Loading schema from', newUrl);
    $ctrl.loadingSchema = true;
    $ctrl.loadSchemaError = null;
    const typeRefFragment = `
      name
      kind
      ofType {
        name
        kind
        ofType {
          name
          kind
          ofType {
            name
            kind
            ofType {
              name
              kind
              ofType {
                name
                kind
                ofType {
                  name
                  kind
                }
              }
            }
          }
        }
      }
    `;

    fetch(newUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
{
  __schema {
    description
    queryType { name }
    mutationType { name }
    subscriptionType { name }

    types {
      name
      description
      kind
      enumValues {
        name
        description
      }
      possibleTypes {
        name
        kind
      }
      inputFields {
        name
        description
        defaultValue
        type { ${typeRefFragment} }
      }
      fields {
        name description
        args {
          name
          description
          defaultValue
          type { ${typeRefFragment} }
        }
        type { ${typeRefFragment} }
      }
    }
  }
}
        ` })
    })
    .then(res => res.json())
    .then(result => {
      $ctrl.schema = result.data.__schema;
      $ctrl.loadSchemaError = null;
      console.log('Schema loaded:', $ctrl.schema);
      $timeout(() => {
        $scope.$apply();
      }, 0);
    })
    .catch(err => {
      console.error('Error loading schema:', err);
      $ctrl.schema = null;
      $ctrl.loadSchemaError = 'Failed to load schema: ' + err.message;
      $timeout(() => {
        $scope.$apply();
      }, 0);
    })
      .finally(() => {
        $ctrl.loadingSchema = false;
      });
  }
  $ctrl.loadSchema = function () {
    loadSchema($ctrl.url);
  };

  function parseOperationSnippet(queryText) {
    const text = queryText || '';
    const operationMatch = /^(query|mutation|subscription)\b\s*(\([^)]*\))?\s*\{/.exec(text.trim());

    if (!operationMatch) {
      return null;
    }

    const operation = operationMatch[1];
    const variableBlock = operationMatch[2] || '';
    const bodyStart = text.indexOf('{');
    const bodyEnd = text.lastIndexOf('}');

    if (bodyStart === -1 || bodyEnd === -1 || bodyEnd <= bodyStart) {
      return null;
    }

    const body = text.slice(bodyStart + 1, bodyEnd).trim();
    const fieldMatch = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(body);

    return {
      operation,
      variableBlock,
      body,
      fieldName: fieldMatch ? fieldMatch[1] : null
    };
  }

  function mergeOperationIntoQuery(existingQuery, snippetQuery) {
    const currentQuery = existingQuery || '';
    const snippetInfo = parseOperationSnippet(snippetQuery);

    if (!snippetInfo) {
      return currentQuery ? `${currentQuery.replace(/\s+$/, '')}\n\n${snippetQuery}` : snippetQuery;
    }

    const operationRegex = new RegExp(`(^|\\n)\\s*${snippetInfo.operation}\\b([\\s\\S]*?)\\{`, 'm');
    const operationMatch = operationRegex.exec(currentQuery);

    if (!operationMatch) {
      return currentQuery ? `${currentQuery.replace(/\s+$/, '')}\n\n${snippetQuery}` : snippetQuery;
    }

    const operationStart = operationMatch.index + operationMatch[1].length;
    const headerStart = currentQuery.indexOf(snippetInfo.operation, operationStart);
    const openBraceIndex = currentQuery.indexOf('{', headerStart);

    if (openBraceIndex === -1) {
      return currentQuery ? `${currentQuery.replace(/\s+$/, '')}\n\n${snippetQuery}` : snippetQuery;
    }

    let depth = 0;
    let closeBraceIndex = -1;

    for (let index = openBraceIndex; index < currentQuery.length; index += 1) {
      const char = currentQuery[index];

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;

        if (depth === 0) {
          closeBraceIndex = index;
          break;
        }
      }
    }

    if (closeBraceIndex === -1) {
      return currentQuery ? `${currentQuery.replace(/\s+$/, '')}\n\n${snippetQuery}` : snippetQuery;
    }

    const operationBlock = currentQuery.slice(headerStart, closeBraceIndex + 1);

    if (snippetInfo.fieldName && new RegExp(`\\b${snippetInfo.fieldName}\\b`).test(operationBlock)) {
      return currentQuery;
    }

    let updatedHeader = currentQuery.slice(headerStart, openBraceIndex);
    const snippetVariables = (snippetInfo.variableBlock || '').trim();

    if (snippetVariables) {
      const existingVariableMatch = /\(([^)]*)\)\s*$/.exec(updatedHeader);

      if (existingVariableMatch) {
        const existingVariables = existingVariableMatch[1].trim();
        const snippetVariablesContent = snippetVariables.slice(1, -1).trim();
        const existingDefinitions = existingVariables ? existingVariables.split(/\s*,\s*/) : [];
        const nextDefinitions = [...existingDefinitions];

        snippetVariablesContent.split(/\s*,\s*/).filter(Boolean).forEach((definition) => {
          if (!nextDefinitions.includes(definition)) {
            nextDefinitions.push(definition);
          }
        });

        updatedHeader = updatedHeader.replace(/\(([^)]*)\)\s*$/, `(${nextDefinitions.join(', ')}) `);
      } else {
        updatedHeader = `${updatedHeader.trimEnd()} ${snippetVariables} `;
      }
    }

    const operationBody = currentQuery.slice(openBraceIndex + 1, closeBraceIndex).replace(/\s+$/, '');
    const nextBody = operationBody
      ? `${operationBody}\n  ${snippetInfo.body}`
      : `\n  ${snippetInfo.body}`;

    return `${currentQuery.slice(0, headerStart)}${updatedHeader}{${nextBody}\n}${currentQuery.slice(closeBraceIndex + 1)}`;
  }

  function mergeVariablesJson(existingVariablesText, snippetVariablesText) {
    try {
      const existing = JSON.parse(existingVariablesText || '{}');
      const incoming = JSON.parse(snippetVariablesText || '{}');

      if (!existing || Array.isArray(existing) || typeof existing !== 'object') {
        return snippetVariablesText;
      }

      if (!incoming || Array.isArray(incoming) || typeof incoming !== 'object') {
        return existingVariablesText;
      }

      return JSON.stringify({ ...incoming, ...existing }, null, 2);
    } catch (error) {
      return existingVariablesText || snippetVariablesText;
    }
  }

  $ctrl.insertSchemaOperation = function (snippet) {
    const activeTab = $ctrl.tabs[$ctrl.activeTab];

    if (!activeTab || !snippet || !snippet.query) {
      return;
    }

    const currentQuery = (activeTab.query || '').trim();
    const isPlaceholderQuery = !currentQuery || currentQuery === $ctrl.t('query.placeholder');

    const nextQuery = isPlaceholderQuery
      ? snippet.query
      : mergeOperationIntoQuery(activeTab.query, snippet.query);
    const nextVariables = snippet.variables
      ? mergeVariablesJson(activeTab.variables, snippet.variables)
      : activeTab.variables;

    $ctrl.tabs[$ctrl.activeTab] = {
      ...activeTab,
      query: nextQuery,
      variables: nextVariables
    };

    $ctrl.persistTabs();

    $timeout(() => {
      $scope.$applyAsync();
    }, 0);
  };

  function showCurlImportError() {
    if (typeof window !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function') {
      window.Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'error',
        title: $ctrl.t('curl.import_error'),
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: true
      });
      return;
    }

    window.alert($ctrl.t('curl.import_error'));
  }

  function applyCurlImport(curlText) {
    const parsed = CurlImportService.parse(curlText);
    const activeTab = $ctrl.tabs[$ctrl.activeTab];

    if (!activeTab) {
      return;
    }

    $ctrl.url = parsed.url;
    activeTab.headers = parsed.headers;
    activeTab.variables = parsed.variables;

    if (parsed.query) {
      activeTab.query = parsed.query;
    }

    applyAutomaticTabTitle(activeTab, $ctrl.activeTab);
    sessionStorage.setItem('url', $ctrl.url);
    TabService.saveTabs($ctrl.tabs);
    loadSchema($ctrl.url);
    $ctrl.persistTabs();

    $timeout(() => {
      $scope.$applyAsync();
      refreshActiveTabEditors();
    }, 0);
  }

  $ctrl.importCurlText = function (curlText) {
    try {
      applyCurlImport(curlText);
      return true;
    } catch (error) {
      showCurlImportError();
      return false;
    }
  };

  $ctrl.openCurlImport = function () {
    if (typeof window !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function') {
      window.Swal.fire({
        title: $ctrl.t('curl.import_title'),
        input: 'textarea',
        inputPlaceholder: $ctrl.t('curl.import_placeholder'),
        inputAttributes: {
          autocapitalize: 'off',
          spellcheck: 'false'
        },
        showCancelButton: true,
        confirmButtonText: $ctrl.t('curl.import_confirm'),
        preConfirm: (value) => {
          if (!$ctrl.importCurlText(value || '')) {
            return false;
          }

          return true;
        }
      });
      return;
    }

    const curlText = window.prompt($ctrl.t('curl.import_placeholder'));
    if (curlText) {
      $ctrl.importCurlText(curlText);
    }
  };

  $ctrl.send = async function () {
    const activeTab = $ctrl.tabs[$ctrl.activeTab];

    if (!activeTab) {
      return;
    }

    const rawQuery = typeof activeTab.query === 'string' ? activeTab.query.trim() : '';
    if (!rawQuery || rawQuery === $ctrl.t('query.placeholder')) {
      activeTab.result = JSON.stringify({ error: 'Query is empty.' }, null, 2);
      $ctrl.persistTabs();
      return;
    }

    activeTab.result = 'Loading...';
    $ctrl.persistTabs();

    try {
      const variables = parseJsonObject(activeTab.variables, {});
      const requestHeaders = parseJsonObject(activeTab.headers, {});
      const mergedHeaders = {
        'Content-Type': 'application/json',
        ...getSharedHeadersMap(),
        ...requestHeaders
      };

      const response = await fetch($ctrl.url, {
        method: 'POST',
        headers: mergedHeaders,
        body: JSON.stringify({
          query: activeTab.query,
          variables
        })
      });

      const formattedBody = await formatResponseBody(response, {
        status: response.status,
        statusText: response.statusText
      });

      activeTab.result = formattedBody;
    } catch (error) {
      activeTab.result = JSON.stringify({
        error: error && error.message ? error.message : 'Request failed.'
      }, null, 2);
    }

    $ctrl.persistTabs();
    $timeout(() => {
      $scope.$applyAsync();
    }, 0);
  };

  $ctrl.downloadWorkspace = function () {
    const exportPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      locale: I18nService.getLocale(),
      url: $ctrl.url,
      activeTab: $ctrl.activeTab,
      sharedHeaders: sanitizeSharedHeadersForExport(AppState.getKey(SHARED_HEADERS_STORAGE_KEY) || []),
      tabs: ($ctrl.tabs || []).map((tab) => ({
        id: tab.id,
        title: tab.title,
        userDefinedLabel: tab.userDefinedLabel || '',
        query: tab.query || '',
        variables: tab.variables || '{}',
        headers: sanitizeHeadersTextForExport(tab.headers),
        result: tab.result || ''
      }))
    };

    const json = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = objectUrl;
    link.download = 'graphql-playground-workspace.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  $ctrl.importWorkspace = function (workspace) {
    if (!workspace || typeof workspace !== 'object') {
      throw new Error(getWorkspaceLabel('importError'));
    }

    const nextLocale = typeof workspace.locale === 'string' ? workspace.locale : I18nService.getLocale();
    $ctrl.locale = I18nService.setLocale(nextLocale);

    if (Array.isArray(workspace.sharedHeaders)) {
      AppState.saveKey(SHARED_HEADERS_STORAGE_KEY, workspace.sharedHeaders.map((header) => ({
        key: header && typeof header.key === 'string' ? header.key : '',
        value: header && typeof header.value === 'string' ? header.value : ''
      })));
    }

    setTabs(Array.isArray(workspace.tabs) ? workspace.tabs : []);
    $ctrl.activeTab = Number.isInteger(workspace.activeTab)
      ? Math.min(Math.max(workspace.activeTab, 0), Math.max($ctrl.tabs.length - 1, 0))
      : 0;
    $ctrl.url = typeof workspace.url === 'string' && workspace.url.trim()
      ? workspace.url
      : $ctrl.url;

    sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, String($ctrl.activeTab || 0));
    sessionStorage.setItem('url', $ctrl.url);
    TabService.saveTabs($ctrl.tabs);
    $ctrl.showConfig = false;
    loadSchema($ctrl.url);
    $ctrl.persistTabs();

    $timeout(() => {
      $scope.$applyAsync();
    }, 0);
  };

  // Adiciona uma nova aba
  $ctrl.addTab = function () {
    const newTab = {
      id: TabService.generateTabId(),
      title: `${$ctrl.t('tabs.default')} ${$ctrl.tabs.length}`,
      userDefinedLabel: '',
      query: $ctrl.t('query.placeholder'),
      variables: '{}',
      headers: '{}',
    };

    $ctrl.tabs.push(newTab);
    TabService.saveTabs($ctrl.tabs);
  };
  
  // Fecha uma aba
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  $ctrl.closeTab = function (index) {
    if ($ctrl.tabs.length <= 1) {
      return;
    }

    $ctrl.tabs.splice(index, 1);
    $ctrl.activeTab = clamp($ctrl.activeTab, 0, $ctrl.tabs.length - 1);
    sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, String($ctrl.activeTab || 0));
    TabService.saveTabs($ctrl.tabs);
  };

  // Inicializa abas carregadas do sessionStorage
  loadTabs();
  if ($ctrl.tabs.length === 0) {
    $ctrl.addTab();
  }

  $scope.$watch('$ctrl.activeTab', (newActiveTab) => {
    if (!Number.isInteger(newActiveTab) || newActiveTab < 0) {
      return;
    }

    sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, String(newActiveTab));
    refreshActiveTabEditors();
  });

  // Funções auxiliares para atalhos de teclado
  const handleKeyHelpers = {
    isCtrlSpace: (event) => event.which === 32 && event.ctrlKey,
  };

  // Manipuladores de eventos de teclado
  function handleKeyEvent(event, type) {
    if (handleKeyHelpers.isCtrlSpace(event)) {
      console.log('ctrl+space (autocomplete for)', type);
      // TODO: Implement autocomplete
    } else {
      // console.log(`${type} keydown:`, event.key, event.keyCode, event.keyChar, event);
    }
  }

  $ctrl.handleQueryKeydown = (event) => handleKeyEvent(event, 'Query');
  $ctrl.handleVariablesKeydown = (event) => handleKeyEvent(event, 'Variables');
  $ctrl.handleHeadersKeydown = (event) => handleKeyEvent(event, 'Headers');

  // Garante a sincronização do estado com o AngularJS caso necessário
  $timeout(() => {
    $scope.$apply();
  }, 0);
}]);
