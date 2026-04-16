import Chat from './components/Chat';
import Documents from './components/Documents';
import './App.css';

function App() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Documents />
      </aside>
      <main className="main-area">
        <Chat />
      </main>
    </div>
  );
}

export default App;
