import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import { language } from './i18n';

document.documentElement.lang = language;
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
