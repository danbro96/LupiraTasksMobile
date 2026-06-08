module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4's worklet transform (must be the LAST plugin). In v4 this moved from
    // 'react-native-reanimated/plugin' to the react-native-worklets package.
    plugins: ['react-native-worklets/plugin'],
  };
};
