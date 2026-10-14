import { CircleAlert, FileDown } from 'lucide-react';
import { PROJECT_ACTIVE, api, uncoveredKeywords } from '../api.js';

export function ScoreBadge({ analysis }) {
  if (analysis?.score == null) return null;
  return (
    <span className="score" title="Recruiter match score for your base resume" aria-label={`Match score ${analysis.score} of 100`}>
      {analysis.score}
    </span>
  );
}

const PROJECT_LABELS = { building: 'Building project', verifying: 'Testing project', publishing: 'Publishing to GitHub', updating_resume: 'Adding to resume' };
const STAGE_LABELS = { analyze: 'Analyzing', rewrite: 'Rewriting', skim: 'ATS pass', check: 'Checking keywords' };

// One line of state per card: only what needs the user, in the accent; everything else stays quiet.
export function AiStatus({ job }) {
  if (job.ai_status === 'processing') {
    return <span className="ai-state working"><span className="pulse" aria-hidden="true" />{STAGE_LABELS[job.ai_stage] || 'Working'}</span>;
  }
  const project = job.project;
  if (project && PROJECT_ACTIVE.includes(project.status)) {
    return <span className="ai-state working"><span className="pulse" aria-hidden="true" />{PROJECT_LABELS[project.status]}</span>;
  }
  if (project?.status === 'failed') return <span className="ai-state error"><CircleAlert size={12} strokeWidth={2} />Project build failed</span>;
  if (job.ai_status === 'analyzed') return <span className="ai-state action">Review analysis</span>;
  if (job.ai_status === 'done' && job.tailoring?.placeholders?.length) {
    return <span className="ai-state action" title={job.tailoring.placeholders.join(', ')}>{job.tailoring.placeholders.length} to fill</span>;
  }
  const missing = !project ? uncoveredKeywords(job).length : 0;
  if (job.ai_status === 'done' && missing) return <span className="ai-state action" title="Build a portfolio project for the skills your resume doesn't cover">{missing} skill{missing === 1 ? '' : 's'} missing: build project</span>;
  if (job.ai_status === 'done') return <span className="ai-state quiet">Resume ready</span>;
  if (job.ai_status === 'error') return <span className="ai-state error" title={job.ai_error}><CircleAlert size={12} strokeWidth={2} />AI step failed</span>;
  if (job.ai_status === 'no_resume') return <span className="ai-state quiet">Needs your resume</span>;
  return null;
}

export default function JobCard({ job, dragging, onOpen }) {
  const canDownload = job.tailored_markdown && job.ai_status !== 'processing';
  return (
    <article className={`card${dragging ? ' dragging' : ''}`} onClick={onOpen}>
      <h3>{job.title}</h3>
      <p className="company">{job.company}</p>
      <div className="card-foot">
        <ScoreBadge analysis={job.analysis} />
        <AiStatus job={job} />
        {canDownload && (
          <a
            className="icon-btn sm"
            href={api.jobResumeUrl(job.id, 'pdf')}
            download
            aria-label="Download tailored resume (PDF)"
            title="Download tailored resume (PDF)"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <FileDown size={14} strokeWidth={1.75} />
          </a>
        )}
      </div>
    </article>
  );
}
