import { useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import AuthPage from './components/AuthPage.jsx';
import Dashboard from './components/Dashboard.jsx';
import OnboardingResume from './components/OnboardingResume.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking the session
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api.me().then((p) => setUser(p.user)).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="auth-screen" aria-busy="true" />;

  if (!user) {
    return (
      <>
        <ThemeToggle className="corner" />
        <AuthPage
        onAuthed={(profile, { registered }) => {
          setUser(profile.user);
          setOnboarding(registered && !profile.hasResume);
        }}
        />
      </>
    );
  }

  if (onboarding) {
    return (
      <>
        <ThemeToggle className="corner" />
        <OnboardingResume username={user.username} onDone={() => setOnboarding(false)} onSkip={() => setOnboarding(false)} />
      </>
    );
  }

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  return <Dashboard key={user.id} user={user} onLogout={logout} />;
}
