((app) => {
  const TEMPLATE_VERSION = '20260409g';

  app.component('fieldType', {
    templateUrl: `components/field-type.html?v=${TEMPLATE_VERSION}`,
    bindings: {
      fieldRef: '<',
      onShowTooltip: '&?',
      onHideTooltip: '&?'
    },
    controller: [function () {
      const $ctrl = this;
      $ctrl.onTypeAnchorClick = function ($event) {
        $event.preventDefault();
        const anchorElement = $event.currentTarget;
        const targetId = anchorElement.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };

      $ctrl.getTypeRef = function () {
        return $ctrl.fieldRef && $ctrl.fieldRef.type ? $ctrl.fieldRef.type : $ctrl.fieldRef;
      };

      $ctrl.isListType = function (typeRef) {
        return typeRef && typeRef.kind === 'LIST';
      };

      $ctrl.isNonNullType = function (typeRef) {
        return typeRef && typeRef.kind === 'NON_NULL';
      };

      $ctrl.getTypeLabel = function (typeRef) {
        if (!typeRef) {
          return '';
        }

        if ($ctrl.isNonNullType(typeRef) || $ctrl.isListType(typeRef)) {
          return $ctrl.getTypeLabel(typeRef.ofType);
        }

        return typeRef.name || (typeRef.ofType && $ctrl.getTypeLabel(typeRef.ofType)) || '';
      };

      $ctrl.getNamedType = function (typeRef) {
        if (!typeRef) {
          return null;
        }

        if (typeRef.name) {
          return typeRef;
        }

        return typeRef.ofType ? $ctrl.getNamedType(typeRef.ofType) : null;
      };

      $ctrl.hasNavigableType = function (typeRef) {
        const namedType = $ctrl.getNamedType(typeRef);

        return Boolean(namedType && ['OBJECT', 'ENUM', 'INTERFACE', 'UNION', 'INPUT_OBJECT', 'SCALAR'].includes(namedType.kind));
      };

      $ctrl.getTypeAnchor = function (typeRef) {
        const namedType = $ctrl.getNamedType(typeRef);

        if (!namedType) {
          return '';
        }

        return `${namedType.kind}_${namedType.name}`;
      };

      $ctrl.showTooltip = function ($event) {
        if (!$ctrl.onShowTooltip) {
          return;
        }

        $ctrl.onShowTooltip({
          $event,
          payload: {
            label: $ctrl.getTypeLabel($ctrl.getTypeRef()),
            labelClass: 'type',
            typeRef: $ctrl.getTypeRef(),
            description: ($ctrl.fieldRef && $ctrl.fieldRef.description) || ''
          }
        });
      };

      $ctrl.hideTooltip = function () {
        if ($ctrl.onHideTooltip) {
          $ctrl.onHideTooltip();
        }
      };

      $ctrl.forwardShowTooltip = function ($event, payload) {
        if ($ctrl.onShowTooltip) {
          $ctrl.onShowTooltip({ $event, payload });
        }
      };

      $ctrl.forwardHideTooltip = function () {
        if ($ctrl.onHideTooltip) {
          $ctrl.onHideTooltip();
        }
      };
    }]
  });

  app.component('fieldArgs', {
    templateUrl: `components/field-args.html?v=${TEMPLATE_VERSION}`,
    bindings: {
      fieldArgs: '<',
      onShowTooltip: '&?',
      onHideTooltip: '&?'
    },
    controller: [function () {
      const $ctrl = this;

      $ctrl.hasArgs = function () {
        return Array.isArray($ctrl.fieldArgs) && $ctrl.fieldArgs.length > 0;
      };

      $ctrl.showArgTooltip = function ($event, arg) {
        if (!$ctrl.onShowTooltip) {
          return;
        }

        $ctrl.onShowTooltip({
          $event,
          payload: {
            label: arg.name,
            labelClass: 'argument',
            typeRef: arg.type,
            description: arg.description || ''
          }
        });
      };

      $ctrl.forwardShowTooltip = function ($event, payload) {
        if ($ctrl.onShowTooltip) {
          $ctrl.onShowTooltip({ $event, payload });
        }
      };

      $ctrl.hideTooltip = function () {
        if ($ctrl.onHideTooltip) {
          $ctrl.onHideTooltip();
        }
      };
    }]
  });
  app.component('schemaViewer', {
    templateUrl: `components/schema-viewer.html?v=${TEMPLATE_VERSION}`,
    bindings: {
      schema: '<',
      loadError: '<',
      retryLoadSchema: '&',
      insertSchemaOperation: '&?'
    },
    controller:['$scope', 'I18nService', function (scope, I18nService) {
      const $ctrl = this;
      scope.$ctrl = $ctrl;
      $ctrl.t = function (key) {
        return I18nService.t(key);
      };
      $ctrl.tooltip = {
        visible: false,
        top: 0,
        left: 0,
        label: '',
        labelClass: 'field',
        typeTokens: [],
        description: ''
      };
      $ctrl.searchTerm = '';
      $ctrl.open = sessionStorage.getItem('schemaViewerOpen') === 'true';

      $ctrl.toggleSchemaViewer = function () {
        $ctrl.open = !$ctrl.open;
        sessionStorage.setItem('schemaViewerOpen', `${$ctrl.open}`);
      };

      $ctrl.onTypeAnchorClick = function ($event) {
        $event.preventDefault();
        const anchorElement = $event.currentTarget;
        const targetId = anchorElement.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };

      $ctrl.buildTypeTokens = function (typeRef) {
        if (!typeRef) {
          return [];
        }

        if (typeRef.kind === 'LIST') {
          return [
            { text: '[', className: 'field-type-prefix' },
            ...$ctrl.buildTypeTokens(typeRef.ofType),
            { text: ']', className: 'field-type-suffix' }
          ];
        }

        if (typeRef.kind === 'NON_NULL') {
          return [
            ...$ctrl.buildTypeTokens(typeRef.ofType),
            { text: '!', className: 'field-type-non-null' }
          ];
        }

        return [{
          text: typeRef.name || '',
          className: 'field-type'
        }];
      };

      $ctrl.getNamedType = function (typeRef) {
        if (!typeRef) {
          return null;
        }

        if (typeRef.name) {
          return typeRef;
        }

        return typeRef.ofType ? $ctrl.getNamedType(typeRef.ofType) : null;
      };

      $ctrl.typeRefToString = function (typeRef) {
        if (!typeRef) {
          return '';
        }

        if (typeRef.kind === 'NON_NULL') {
          return `${$ctrl.typeRefToString(typeRef.ofType)}!`;
        }

        if (typeRef.kind === 'LIST') {
          return `[${$ctrl.typeRefToString(typeRef.ofType)}]`;
        }

        return typeRef.name || '';
      };

      $ctrl.getTypeMap = function () {
        if (!$ctrl.schema || !Array.isArray($ctrl.schema.types)) {
          return new Map();
        }

        return new Map($ctrl.schema.types.filter((type) => type && type.name).map((type) => [type.name, type]));
      };

      $ctrl.getOperationForType = function (typeName) {
        if (!$ctrl.schema || !typeName) {
          return null;
        }

        if ($ctrl.schema.queryType && $ctrl.schema.queryType.name === typeName) {
          return 'query';
        }

        if ($ctrl.schema.mutationType && $ctrl.schema.mutationType.name === typeName) {
          return 'mutation';
        }

        if ($ctrl.schema.subscriptionType && $ctrl.schema.subscriptionType.name === typeName) {
          return 'subscription';
        }

        return null;
      };

      $ctrl.hasRequiredArguments = function (field) {
        return Boolean(field && Array.isArray(field.args) && field.args.some((arg) => arg && arg.type && arg.type.kind === 'NON_NULL'));
      };

      $ctrl.supportsSelectionSet = function (field) {
        const namedType = $ctrl.getNamedType(field && field.type);
        return Boolean(namedType && ['OBJECT', 'INTERFACE'].includes(namedType.kind));
      };

      $ctrl.toVariableNameSuffix = function (typeRef) {
        const typeText = $ctrl.typeRefToString(typeRef);

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
      };

      $ctrl.buildOperationArgumentBindings = function (args) {
        const variableRegistry = new Map();
        const bindings = [];

        (args || []).forEach((arg) => {
          if (!arg || !arg.name) {
            return;
          }

          const typeString = $ctrl.typeRefToString(arg.type);
          const baseVariableName = arg.name;
          const existingType = variableRegistry.get(baseVariableName);
          let variableName = baseVariableName;

          if (existingType && existingType !== typeString) {
            variableName = `${baseVariableName}${$ctrl.toVariableNameSuffix(arg.type)}`;

            let duplicateIndex = 2;
            while (variableRegistry.has(variableName) && variableRegistry.get(variableName) !== typeString) {
              variableName = `${baseVariableName}${$ctrl.toVariableNameSuffix(arg.type)}${duplicateIndex}`;
              duplicateIndex += 1;
            }
          }

          if (!variableRegistry.has(variableName)) {
            variableRegistry.set(variableName, typeString);
          }

          bindings.push({
            argumentName: arg.name,
            variableName,
            typeString,
            typeRef: arg.type
          });
        });

        return bindings;
      };

      $ctrl.buildDefaultValue = function (typeRef) {
        if (!typeRef) {
          return null;
        }

        if (typeRef.kind === 'NON_NULL') {
          return $ctrl.buildDefaultValue(typeRef.ofType);
        }

        if (typeRef.kind === 'LIST') {
          return [];
        }

        const namedType = $ctrl.getNamedType(typeRef);
        const schemaType = namedType ? $ctrl.getTypeMap().get(namedType.name) : null;

        if (!schemaType) {
          return null;
        }

        if (schemaType.kind === 'INPUT_OBJECT') {
          const result = {};

          (schemaType.inputFields || []).forEach((field) => {
            if (field && field.type && field.type.kind === 'NON_NULL') {
              result[field.name] = $ctrl.buildDefaultValue(field.type);
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
      };

      $ctrl.buildExpandedSelectionSet = function (typeRef, indentLevel, visitedTypes) {
        const namedType = $ctrl.getNamedType(typeRef);
        const schemaType = namedType ? $ctrl.getTypeMap().get(namedType.name) : null;

        if (!schemaType || !Array.isArray(schemaType.fields) || !schemaType.fields.length) {
          return [];
        }

        const nextVisited = new Set(visitedTypes || []);
        if (namedType && namedType.name) {
          nextVisited.add(namedType.name);
        }

        return schemaType.fields
          .filter((childField) => childField && childField.name && !$ctrl.hasRequiredArguments(childField))
          .flatMap((childField) => {
            if (!$ctrl.supportsSelectionSet(childField)) {
              return [`${indentLevel}${childField.name}`];
            }

            const childNamedType = $ctrl.getNamedType(childField.type);
            if (!childNamedType || nextVisited.has(childNamedType.name)) {
              return [];
            }

            const nestedLines = $ctrl.buildExpandedSelectionSet(childField.type, `${indentLevel}  `, nextVisited);

            if (!nestedLines.length) {
              return [];
            }

            return [
              `${indentLevel}${childField.name} {`,
              ...nestedLines,
              `${indentLevel}}`
            ];
          });
      };

      $ctrl.buildOperationSnippet = function (field, parentTypeName) {
        const operation = $ctrl.getOperationForType(parentTypeName);

        if (!operation || !field) {
          return null;
        }

        const fieldIndent = '  ';
        const childIndent = '    ';
        const argumentBindings = $ctrl.buildOperationArgumentBindings(field.args);
        const variableDefinitions = argumentBindings.length
          ? ` (${argumentBindings.map((binding) => `$${binding.variableName}: ${binding.typeString}`).join(', ')})`
          : '';
        const fieldArguments = argumentBindings.length
          ? `(${argumentBindings.map((binding) => `${binding.argumentName}: $${binding.variableName}`).join(', ')})`
          : '';
        const fieldCall = `${field.name}${fieldArguments}`;
        const expandedLines = $ctrl.supportsSelectionSet(field)
          ? $ctrl.buildExpandedSelectionSet(field.type, childIndent, new Set())
          : [];
        const query = $ctrl.supportsSelectionSet(field)
          ? `${operation}${variableDefinitions} {\n${fieldIndent}${fieldCall} {\n${expandedLines.length ? `${expandedLines.join('\n')}\n` : `${childIndent}\n`}${fieldIndent}}\n}`
          : `${operation}${variableDefinitions} {\n${fieldIndent}${fieldCall}\n}`;
        const variablesObject = {};

        argumentBindings.forEach((binding) => {
          variablesObject[binding.variableName] = $ctrl.buildDefaultValue(binding.typeRef);
        });

        return {
          query,
          variables: JSON.stringify(variablesObject, null, 2)
        };
      };

      $ctrl.tryInsertFieldOperation = function ($event, parentType, field) {
        if (!$event || (!$event.ctrlKey && !$event.metaKey)) {
          return;
        }

        const snippet = $ctrl.buildOperationSnippet(field, parentType && parentType.name);

        if (!snippet || !$ctrl.insertSchemaOperation) {
          return;
        }

        $event.preventDefault();
        $event.stopPropagation();
        $ctrl.insertSchemaOperation({ snippet });
      };

      $ctrl.onFieldMouseDown = function ($event, parentType, field) {
        $ctrl.tryInsertFieldOperation($event, parentType, field);
      };


      $ctrl.getTypeChildren = function (type) {
        if (!type) {
          return [];
        }

        if (Array.isArray(type.fields)) {
          return type.fields.map((field) => field && field.name).filter(Boolean);
        }

        if (Array.isArray(type.inputFields)) {
          return type.inputFields.map((field) => field && field.name).filter(Boolean);
        }

        if (Array.isArray(type.enumValues)) {
          return type.enumValues.map((value) => value && value.name).filter(Boolean);
        }

        if (Array.isArray(type.possibleTypes)) {
          return type.possibleTypes.map((value) => value && value.name).filter(Boolean);
        }

        return [];
      };

      $ctrl.matchesSearch = function (type) {
        const term = ($ctrl.searchTerm || '').trim().toLowerCase();

        if (!term) {
          return true;
        }

        if ((type.name || '').toLowerCase().includes(term)) {
          return true;
        }

        return $ctrl.getTypeChildren(type).some((childName) => childName.toLowerCase().includes(term));
      };

      $ctrl.typeMatchesSearch = function (type) {
        const term = ($ctrl.searchTerm || '').trim().toLowerCase();

        if (!term) {
          return true;
        }

        return (type && type.name ? type.name.toLowerCase().includes(term) : false);
      };

      $ctrl.fieldMatchesSearch = function (field) {
        const term = ($ctrl.searchTerm || '').trim().toLowerCase();

        if (!term) {
          return true;
        }

        return Boolean(field && field.name && field.name.toLowerCase().includes(term));
      };

      $ctrl.shouldShowField = function (type, field) {
        const term = ($ctrl.searchTerm || '').trim();

        if (!term) {
          return true;
        }

        if ($ctrl.typeMatchesSearch(type)) {
          return true;
        }

        return $ctrl.fieldMatchesSearch(field);
      };

      $ctrl.getFilteredTypes = function () {
        if (!$ctrl.schema || !Array.isArray($ctrl.schema.types)) {
          return [];
        }

        return $ctrl.schema.types.filter((type) => type && $ctrl.matchesSearch(type));
      };

      $ctrl.showTooltip = function ($event, payload) {
        if (!payload) {
          return;
        }

        const eventTarget = ($event && ($event.currentTarget || $event.target)) || null;

        if (!eventTarget || typeof eventTarget.getBoundingClientRect !== 'function') {
          return;
        }

        const rect = eventTarget.getBoundingClientRect();
        const tooltipWidth = 320;
        const gap = 12;
        const maxLeft = Math.max(gap, window.innerWidth - tooltipWidth - gap);
        const top = Math.min(window.innerHeight - 120, rect.bottom + gap);
        const left = Math.min(rect.left, maxLeft);

        $ctrl.tooltip.visible = true;
        $ctrl.tooltip.top = Math.max(gap, top);
        $ctrl.tooltip.left = Math.max(gap, left);
        $ctrl.tooltip.label = payload.label || '';
        $ctrl.tooltip.labelClass = payload.labelClass || 'field';
        $ctrl.tooltip.typeTokens = $ctrl.buildTypeTokens(payload.typeRef);
        $ctrl.tooltip.description = payload.description || '';

        if (!scope.$$phase) {
          scope.$applyAsync();
        }
      };

      $ctrl.hideTooltip = function () {
        $ctrl.tooltip.visible = false;

        if (!scope.$$phase) {
          scope.$applyAsync();
        }
      };

      $ctrl.forwardTooltip = function ($event, payload) {
        $ctrl.showTooltip($event, payload);
      };

      $ctrl.showFieldTooltip = function ($event, field) {
        $ctrl.showTooltip($event, {
          label: field.name,
          labelClass: 'field',
          typeRef: field.type,
          description: field.description || ''
        });
      };

      $ctrl.showInputFieldTooltip = function ($event, inputField) {
        $ctrl.showTooltip($event, {
          label: inputField.name,
          labelClass: 'argument',
          typeRef: inputField.type,
          description: inputField.description || ''
        });
      };

      $ctrl.showEnumTooltip = function ($event, value) {
        $ctrl.showTooltip($event, {
          label: value.name,
          labelClass: 'enum',
          description: value.description || ''
        });
      };

      $ctrl.showPossibleTypeTooltip = function ($event, possibleType) {
        $ctrl.showTooltip($event, {
          label: possibleType.name,
          labelClass: 'type',
          description: ''
        });
      };
    }]
  });
}) (angular.module('app'));
