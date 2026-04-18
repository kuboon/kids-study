import { useState } from 'preact/hooks';
import './components/WritingCanvas.css';
import './styles/pages.css';
import { getActiveAccount, loadStore } from './lib/storage';
import { matchRoute, navigate, useHashRoute } from './lib/router';
import { HomePage } from './pages/HomePage';
import { AccountNewPage } from './pages/AccountNewPage';
import { GradeHomePage } from './pages/GradeHomePage';
import { PlayPage } from './pages/PlayPage';
import { StampsPage } from './pages/StampsPage';

export function App() {
  const [store, setStore] = useState(() => loadStore());
  const [nonce, setNonce] = useState(0);
  const hash = useHashRoute();

  function refresh() {
    setStore(loadStore());
    setNonce((n) => n + 1);
  }

  const account = getActiveAccount(store);

  if (hash === '/' || hash === '') {
    return <HomePage store={store} onChange={refresh} />;
  }
  if (hash === '/account/new') {
    return <AccountNewPage store={store} onChange={refresh} />;
  }
  if (hash === '/g1') {
    if (!account) {
      navigate('/');
      return null;
    }
    return <GradeHomePage key={nonce} account={account} grade={1} />;
  }
  if (hash === '/g4') {
    if (!account) {
      navigate('/');
      return null;
    }
    return <GradeHomePage key={nonce} account={account} grade={4} />;
  }
  if (hash === '/stamps') {
    if (!account) {
      navigate('/');
      return null;
    }
    return <StampsPage key={nonce} account={account} />;
  }
  const playMatch = matchRoute(hash, '/play/:deckId');
  if (playMatch) {
    if (!account) {
      navigate('/');
      return null;
    }
    return (
      <PlayPage
        key={`${playMatch.deckId}-${nonce}`}
        store={store}
        account={account}
        deckId={playMatch.deckId}
        onChange={refresh}
      />
    );
  }

  return (
    <div class="app-page">
      <div class="card">
        ページが見つかりません。
        <button class="btn" onClick={() => navigate('/')}>
          おうちへ
        </button>
      </div>
    </div>
  );
}
