import './style.css';
import { App } from './ui/app';

const app = new App(document.getElementById('app')!);
// Handy for checking reproducibility from the devtools console.
(window as unknown as { ecosim: App }).ecosim = app;
