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
      'config.other_placeholder': 'Other Settings (placeholder)',
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

app.controller('MainController', ['$scope', '$timeout', 'TabService', 'I18nService', function ($scope, $timeout, TabService, I18nService) {
  const $ctrl = this;
  const ACTIVE_TAB_STORAGE_KEY = 'activeTab';
  $scope.$ctrl = $ctrl;
  // Estado inicial
  $ctrl.title = 'AngularJS Tutorial Example';
  $ctrl.message = 'Hello World!';
  $ctrl.ready = true;
  $ctrl.appVersion = 'v1.0.0';
  $ctrl.locales = I18nService.getLocales();
  $ctrl.locale = I18nService.getLocale();
  $ctrl.t = function (key) {
    return I18nService.t(key);
  };
  $ctrl.tabs = [];
  $ctrl.activeTab = 0;
  $ctrl.schema = null;
  $ctrl.loadSchemaError = null;
  $ctrl.url = sessionStorage.getItem('url') || 'http://localhost:4000/graphql';
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

  function applyAutomaticTabTitle(tab, tabIndex) {
    if (!tab || tab.hasManualTitle) {
      return;
    }

    tab.title = getTabTitleFromQuery(tab.query, tabIndex);
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
    tab.titleDraft = tab.title || '';

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

    if (nextTitle) {
      tab.title = nextTitle;
      tab.hasManualTitle = true;
    } else {
      tab.hasManualTitle = false;
      tab.title = getTabTitleFromQuery(tab.query, tabIndex);
    }

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
    let storedTabs = TabService.getTabs();

    // Garante que cada aba tenha um ID único (evita duplicatas no ngRepeat)
    storedTabs = storedTabs.map(tab => ({
      ...tab,
      id: tab.id || TabService.generateTabId(),
      isEditingTitle: false
    }));

    storedTabs.forEach((tab, index) => {
      applyAutomaticTabTitle(tab, index);
    });

    $ctrl.tabs = storedTabs;
    TabService.saveTabs($ctrl.tabs);

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

  // Adiciona uma nova aba
  $ctrl.addTab = function () {
    const newTab = {
      id: TabService.generateTabId(),
      title: `${$ctrl.t('tabs.default')} ${$ctrl.tabs.length}`,
      hasManualTitle: false,
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
    $ctrl.tabs.splice(index, 1);
    $ctrl.activeTab = clamp($ctrl.activeTab, 0, $ctrl.tabs.length - 1);
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
