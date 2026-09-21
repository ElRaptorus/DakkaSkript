import type typescriptModule from 'typescript';
import * as typescriptRuntime from 'typescript';
import { decorateLanguageService, patchLanguageServiceHost } from './languageServicePlugin.ts';

type TsserverPluginCreateInfo = {
  languageService: typescriptModule.LanguageService;
  languageServiceHost: typescriptModule.LanguageServiceHost;
  project: unknown;
};

type TsserverPluginModule = {
  create(info: TsserverPluginCreateInfo): typescriptModule.LanguageService;
};

function hasClassicQuickInfo(
  languageService: typescriptModule.LanguageService,
): languageService is typescriptModule.LanguageService {
  return typeof (languageService as Partial<typescriptModule.LanguageService>).getQuickInfoAtPosition === 'function';
}

function init({
  typescript = typescriptRuntime as unknown as typeof typescriptModule,
}: {
  typescript?: typeof typescriptModule;
}): TsserverPluginModule {
  return {
    create(info: TsserverPluginCreateInfo): typescriptModule.LanguageService {
      if (!hasClassicQuickInfo(info.languageService)) {
        return info.languageService;
      }
      const host = patchLanguageServiceHost(info.languageServiceHost, typescript);
      return decorateLanguageService(info.languageService, host, typescript);
    },
  };
}

// paintDaBrains emits CommonJS and then assigns module.exports to this default,
// because tsserver require()s the plugin and must receive init itself.
export default init;
