import { Outlet, useNavigation } from 'react-router-dom';
import Navigation from './navigation';

export default function App() {
  const navigation = useNavigation();

  return (
    <div className="min-h-screen bg-base-200 flex flex-col">
      <Navigation />
      <main className="flex-1 container mx-auto px-4 py-6" aria-busy={navigation.state !== 'idle'}><Outlet /></main>
      <footer className="footer footer-center p-6 bg-base-300">
        <aside className="flex gap-4">
          <a className="link" href="https://github.com/sirrobot01/decypharr">GitHub</a>
          <a className="link" href="https://docs.decypharr.com/">Documentation</a>
          <a className="link" href="https://sponsor.decypharr.com">Sponsor</a>
        </aside>
      </footer>
    </div>
  );
}
