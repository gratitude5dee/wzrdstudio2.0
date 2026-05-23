import path from 'node:path';
import { Config } from '@remotion/cli/config';

Config.overrideWebpackConfig((currentConfiguration) => {
  const existingAlias = currentConfiguration.resolve?.alias;
  const aliasObject = Array.isArray(existingAlias) ? {} : existingAlias ?? {};

  return {
    ...currentConfiguration,
    resolve: {
      ...currentConfiguration.resolve,
      alias: {
        ...aliasObject,
        '@': path.resolve(process.cwd(), 'src'),
      },
    },
  };
});
