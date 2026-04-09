((app) => {
  const TEMPLATE_VERSION = '20260409d';

  app.component('configEditor', {
    templateUrl: `components/config-editor.html?v=${TEMPLATE_VERSION}`,
    bindings: {
      exportWorkspace: '&?',
      importWorkspace: '&?'
    },
    controller: ['AppState', 'I18nService', '$scope', function (AppState, I18nService, scope) {
      const $ctrl = this;

      $ctrl.t = function (key) {
        return I18nService.t(key);
      };

      $ctrl.tabs = [
        { id: 'headers', titleKey: 'config.shared_headers' },
        { id: 'other', titleKey: 'config.other' }
      ];
      $ctrl.activeTab = 'headers';
      $ctrl.headers = AppState.getKey('sharedHeaders') || [];

      $ctrl.setActiveTab = function (tabId) {
        $ctrl.activeTab = tabId;
      };

      $ctrl.addHeader = function () {
        $ctrl.headers.push({ key: '', value: '' });
        AppState.saveKey('sharedHeaders', $ctrl.headers);
      };

      $ctrl.removeHeader = function (index) {
        $ctrl.headers.splice(index, 1);
        AppState.saveKey('sharedHeaders', $ctrl.headers);
      };

      $ctrl.getWorkspaceLabel = function (key) {
        const isPtBr = I18nService.getLocale() === 'pt-BR';
        const labels = {
          export: isPtBr ? 'Exportar Workspace' : 'Export Workspace',
          import: isPtBr ? 'Importar Workspace' : 'Import Workspace',
          note: isPtBr
            ? 'Exporte e importe seu workspace completo, incluindo abas e configurações.'
            : 'Export and import your full workspace, including tabs and settings.',
          importError: isPtBr
            ? 'Não foi possível importar este arquivo de workspace.'
            : 'Could not import this workspace file.'
        };

        return labels[key] || '';
      };

      $ctrl.handleExportWorkspace = function () {
        if ($ctrl.exportWorkspace) {
          $ctrl.exportWorkspace();
        }
      };

      $ctrl.triggerImportWorkspace = function () {
        const input = document.getElementById('workspace-import-input');
        if (input) {
          input.value = '';
          input.click();
        }
      };

      $ctrl.handleImportWorkspaceFile = function (event) {
        const input = event && event.target;
        const file = input && input.files && input.files[0];

        if (!file) {
          return;
        }

        const reader = new FileReader();
        reader.onload = function (loadEvent) {
          try {
            const parsed = JSON.parse(loadEvent.target.result);
            if ($ctrl.importWorkspace) {
              $ctrl.importWorkspace({ workspace: parsed });
            }
          } catch (error) {
            window.alert($ctrl.getWorkspaceLabel('importError'));
          } finally {
            if (input) {
              input.value = '';
            }
          }
        };
        reader.onerror = function () {
          window.alert($ctrl.getWorkspaceLabel('importError'));
          if (input) {
            input.value = '';
          }
        };
        reader.readAsText(file);
      };

      scope.$watch(() => $ctrl.headers, (newHeaders) => {
        AppState.saveKey('sharedHeaders', newHeaders);
      }, true);
    }]
  });
})(angular.module('app'));
