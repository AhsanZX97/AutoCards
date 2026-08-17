const { withAppBuildGradle } = require('expo/config-plugins');

const PROPERTY = 'REACT_NATIVE_NODE_MODULES_DIR';

// react-native-screens finds react-native by probing `apps/mobile/node_modules`, but
// npm workspaces hoist react-native to the repo root while leaving react-native-screens
// nested — so both of its fallbacks miss and it throws while Gradle is still configuring.
// It reads this property off whichever project applies com.android.application, so we set
// it on `:app`. Walking up from android/ rather than hardcoding a depth keeps this correct
// whether the installer hoists react-native or not.
const SNIPPET = `ext.${PROPERTY} = {
    def dir = rootDir
    while (dir != null) {
        def candidate = new File(dir, "node_modules/react-native")
        if (candidate.exists()) {
            return candidate.absolutePath
        }
        dir = dir.parentFile
    }
    return null
}()

`;

module.exports = function withMonorepoReactNativeDir(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        `withMonorepoReactNativeDir expected a groovy build.gradle, got ${cfg.modResults.language}`
      );
    }
    if (cfg.modResults.contents.includes(PROPERTY)) {
      return cfg;
    }
    cfg.modResults.contents = SNIPPET + cfg.modResults.contents;
    return cfg;
  });
};
