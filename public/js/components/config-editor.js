((app) => {
  const TEMPLATE_VERSION = '20260409e';

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
        const showImportErrorToast = function () {
          if (typeof window !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function') {
            window.Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'error',
              title: $ctrl.getWorkspaceLabel('importError'),
              showConfirmButton: false,
              timer: 3500,
              timerProgressBar: true
            });
            return;
          }

          window.alert($ctrl.getWorkspaceLabel('importError'));
        };

        reader.onload = function (loadEvent) {
          try {
            const parsed = JSON.parse(loadEvent.target.result);
            if ($ctrl.importWorkspace) {
              $ctrl.importWorkspace({ workspace: parsed });
            }
          } catch (error) {
            showImportErrorToast();
          } finally {
            if (input) {
              input.value = '';
            }
          }
        };
        reader.onerror = function () {
          showImportErrorToast();
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
