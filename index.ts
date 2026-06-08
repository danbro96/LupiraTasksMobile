// Must be first: polyfills global `crypto` (for uuid) before any module that mints an id loads.
import './src/polyfills/crypto';

// gesture-handler must be imported once, before any react-native rendering, in the entry file.
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
registerRootComponent(App);
