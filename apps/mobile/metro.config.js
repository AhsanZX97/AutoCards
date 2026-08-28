const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// npm workspaces hoist shared deps (and @autocards/core itself) to the repo root.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// The web app pins React 18 at the repo root while mobile needs React 19, so npm
// keeps mobile's copy unhoisted in apps/mobile/node_modules. Metro's normal
// directory walk would still let react-native's own internals (which live in the
// hoisted root) find the root's React 18, putting two React instances in one
// bundle. Redirect only React itself to mobile's copy; everything else keeps
// standard resolution, which nested installs like react-native's own scheduler
// 0.26 and whatwg-url-without-unicode's webidl-conversions depend on.
const mobileReact = path.resolve(projectRoot, 'node_modules/react');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    const target =
      moduleName === 'react'
        ? mobileReact
        : path.join(mobileReact, moduleName.slice('react/'.length));
    return context.resolveRequest(context, target, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
