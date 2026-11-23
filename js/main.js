import { h, render } from '../vendor/preact.module.js';
import { App } from './ui.js';
import { startUpdates } from './update.js';

render(h(App), document.getElementById('app'));
startUpdates(() => dispatchEvent(new Event('commoner-update')));
