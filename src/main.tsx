import { render } from 'preact';
import './styles/global.css';
import { App } from './App';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');
render(<App />, root);
