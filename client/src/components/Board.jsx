import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import { STATUSES, api } from '../api.js';
import JobCard from './JobCard.jsx';

const byPosition = (a, b) => a.position - b.position || a.id - b.id;

export default function Board({ jobs, allJobs, setJobs, onOpen, onError, reload, onNew, filtered }) {
  const columns = Object.fromEntries(STATUSES.map((s) => [s.id, jobs.filter((j) => j.status === s.id).sort(byPosition)]));

  const onDragEnd = async ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const id = Number(draggableId);
    // Work on the full (unfiltered) column lists so hidden cards keep their place.
    const full = Object.fromEntries(STATUSES.map((s) => [s.id, allJobs.filter((j) => j.status === s.id).sort(byPosition)]));
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
      <main className="board">
        {STATUSES.map((status) => (
          <section className="lane" key={status.id} style={{ '--lane': status.color }} aria-label={status.label}>
            <header className="lane-head">
              <span className="lane-dot" aria-hidden="true" />
              <h2>{status.label}</h2>
              <span className="count">{columns[status.id].length}</span>
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
      </main>
    </DragDropContext>
  );
}
