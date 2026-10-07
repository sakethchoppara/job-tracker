import { ImportForm } from './ResumeModal.jsx';
import Logo from './Logo.jsx';

export default function OnboardingResume({ username, onDone, onSkip }) {
  return (
    <div className="auth-screen">
      <div className="auth-card glass onboarding">
        <div className="brand"><Logo /><span>Job Tracker</span></div>
        <ol className="steps" aria-label="Setup progress">
          <li className="done">Account</li>
          <li className="current" aria-current="step">Your resume</li>
        </ol>
        <h1>Welcome, {username}. Add your resume.</h1>
        <p className="lede">
          Every job you add is checked against it: a match score, missing keywords and red flags, then a tailored version
          you approve. You can replace it any time from My resume.
        </p>
        <ImportForm onImported={onDone} />
        <button type="button" className="link skip" onClick={onSkip}>Skip for now</button>
      </div>
    </div>
  );
}
