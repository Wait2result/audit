module.exports = function (api) {
  api.cache(true);

  return {
    // babel-preset-expo сам подключает всё нужное для Expo Router,
    // Reanimated и React Native Web — отдельные плагины не требуются.
    presets: ['babel-preset-expo'],
  };
};
