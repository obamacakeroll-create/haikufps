import './ui/style.css';
import { Game } from './game/game';

const root = document.getElementById('app');
if (root === null) throw new Error('Missing #app root element');

new Game(root).start();
