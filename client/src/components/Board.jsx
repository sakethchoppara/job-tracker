import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { STATUS_COLORS, api } from '../api.js';
import JobCard from './JobCard.jsx';

const byPosition = (a, b) => a.position - b.position || a.id - b.id;

function AddStatus({ statuses, onAdded, onError }) {
  const unused = STATUS_COLORS.find((c) => !statuses.some((s) => s.color === c)) || STATUS_COLORS[0];
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(unused);
  const [after, setAfter] = useState('');
  const [busy, setBusy] = useState(false);

  // New lanes default to just before Rejected, the usual end of the line.
  const defaultAfter = statuses.at(-1)?.id === 'rejected' && statuses.length > 1 ? statuses.at(-2).id : statuses.at(-1)?.id;
  const start = () => { setLabel(''); setColor(unused); setAfter(defaultAfter || ''); setOpen(true); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onAdded(await api.addStatus(label, color, after));
      setOpen(false);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="lane-add" onClick={start} aria-label="Add status" title="Add status">
        <Plus size={16} strokeWidth={1.75} />
      </button>
    );
  }
  return (
    <form className="lane lane-add-form form" onSubmit={submit}>
      <label>Status name
        <input autoFocus value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Phone screen" required />
      </label>
      <fieldset className="swatches">
        <legend>Colour</legend>
        {STATUS_COLORS.map((c) => (
          <label key={c} className="swatch" style={{ '--swatch': c }}>
            <input type="radio" name="status-color" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={c} />
          </label>
        ))}
      </fieldset>
      <label>Place after
        <select value={after} onChange={(e) => setAfter(e.target.value)}>
          {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <div className="actions-row">
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn primary" disabled={busy || !label.trim()}>{busy ? 'Adding…' : 'Add status'}</button>
      </div>
    </form>
  );
}

export default function Board({ statuses, setStatuses, jobs, allJobs, setJobs, onOpen, onError, reload, onNew, filtered }) {
  const columns = Object.fromEntries(statuses.map((s) => [s.id, jobs.filter((j) => j.status === s.id).sort(byPosition)]));
  const totals = Object.fromEntries(statuses.map((s) => [s.id, allJobs.filter((j) => j.status === s.id).length]));

  const remove = async (status) => {
    if (!window.confirm(`Remove the “${status.label}” status?`)) return;
    try {
      setStatuses(await api.removeStatus(status.id));
    } catch (err) {
      onError(err.message);
    }
  };

  const onDragEnd = async ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const id = Number(draggableId);
    // Work on the full (unfiltered) column lists so hidden cards keep their place.
    const full = Object.fromEntries(statuses.map((s) => [s.id, allJobs.filter((j) => j.status === s.id).sort(byPosition)]));
    const moved = full[source.droppableId].find((j) => j.id === id);
    full[source.droppableId] = full[source.droppableId].filter((j) => j.id !== id);

    const visibleDest = columns[destination.droppableId].filter((j) => j.id !== id);
    const anchor = visibleDest[destination.index];
    const dest = full[destination.droppableId];
    const insertAt = anchor ? dest.findIndex((j) => j.id === anchor.id) : dest.length;
    dest.splice(insertAt, 0, { ...moved, status: destination.droppableId });

    const touched = [...new Set([source.droppableId, destination.droppableId])];
    const updates = new Map();
    for (const status of touched) full[status].forEach((j, i) => updates.set(j.id, { ...j, status, position: i }));
    setJobs((prev) => prev.map((j) => updates.get(j.id) || j));

    try {
      await api.reorder(Object.fromEntries(touched.map((s) => [s, full[s].map((j) => j.id)])));
    } catch (e) {
      onError(e.message);
      reload();
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <main className="board" style={{ '--lanes': statuses.length }}>
        {statuses.map((status) => (
          <section className="lane" key={status.id} style={{ '--lane': status.color }} aria-label={status.label}>
            <header className="lane-head">
              <span className="lane-dot" aria-hidden="true" />
              <h2>{status.label}</h2>
              <span className="count">{columns[status.id].length}</span>
              {totals[status.id] === 0 && statuses.length > 1 && (
                <button className="icon-btn sm lane-remove" onClick={() => remove(status)} aria-label={`Remove the ${status.label} status`} title="Remove status">
                  <X size={14} strokeWidth={1.75} />
                </button>
              )}
            </header>
            <Droppable droppableId={status.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`lane-body${snapshot.isDraggingOver ? ' over' : ''}`}
                >
                  {columns[status.id].map((job, index) => (
                    <Draggable draggableId={String(job.id)} index={index} key={job.id}>
                      {(p, snap) => (
                        <div
                          ref={p.innerRef}
                          {...p.draggableProps}
                          {...p.dragHandleProps}
                          aria-label={`${job.title} at ${job.company}. Press Enter to open, Space to move.`}
                          onKeyDown={(e) => {
                            p.dragHandleProps?.onKeyDown?.(e);
                            if (e.key === 'Enter' && !snap.isDragging) onOpen(job);
                          }}
                        >
                          <JobCard job={job} dragging={snap.isDragging} onOpen={() => onOpen(job)} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {!columns[status.id].length && !snapshot.isDraggingOver && (
                    status.id === 'saved' && !filtered && !allJobs.length ? (
                      <button className="lane-empty first" onClick={onNew}>
                        <Plus size={18} strokeWidth={1.75} />
                        <strong>Add your first application</strong>
                        <span>Paste a job description and get a recruiter-style read on your resume.</span>
                      </button>
                    ) : (
                      <div className="lane-empty">{filtered ? 'No matches' : allJobs.length ? 'Drag a card here' : 'Nothing here yet'}</div>
                    )
                  )}
                </div>
              )}
            </Droppable>
          </section>
        ))}
        <AddStatus statuses={statuses} onAdded={setStatuses} onError={onError} />
      </main>
    </DragDropContext>
  );
}
