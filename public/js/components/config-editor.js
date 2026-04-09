((app) => {
  const TEMPLATE_VERSION = '20260409c';

  app.component('configEditor', {
    templateUrl: `components/config-editor.html?v=${TEMPLATE_VERSION}`,
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

      scope.$watch(() => $ctrl.headers, (newHeaders) => {
        AppState.saveKey('sharedHeaders', newHeaders);
      }, true);
    }]
  });
})(angular.module('app'));
