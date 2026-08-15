// Offline-first arrival toolkit. The essential copy is bundled locally; the
// database can update it when online without making the emergency view depend
// on a connection.

function ToolkitScreen({ onBack }) {
  const api = window.__lifeos.automations;
  const [items, setItems] = React.useState(api.OFFLINE_TOOLKIT);
  const [tasks, setTasks] = React.useState([]);
  const [message, setMessage] = React.useState('Available offline');

  const reload = React.useCallback(async () => {
    const [nextItems, nextTasks] = await Promise.all([
      api.loadToolkit().catch(() => api.OFFLINE_TOOLKIT),
      api.loadArrivalTasks().catch(() => []),
    ]);
    setItems(nextItems);
    setTasks(nextTasks);
  }, [api]);

  React.useEffect(() => { void reload(); }, [reload]);

  async function setTask(task, status) {
    try {
      await api.setArrivalTaskStatus(task.id, status);
      setTasks(current => current.map(item => item.id === task.id ? { ...item, status } : item));
      setMessage(status === 'done' ? 'Marked complete.' : 'Task updated.');
    } catch (error) {
      setMessage(error?.message || 'That change will need a connection.');
    }
  }

  return (
    <ModulePage title="Arrival toolkit" subtitle="Visa, emergency and embassy essentials" icon="ShieldCheck" onBack={onBack}>
      <div className="toolkit-screen">
        <section className="toolkit-hero">
          <div><span>READY WHEN SIGNAL ISN'T</span><h2>Your practical Abu Dhabi safety net.</h2><p>Essential numbers and checklists stay on this device. Official links open when you are online.</p></div>
          <strong><i /> {message}</strong>
        </section>

        {tasks.length > 0 && (
          <section className="toolkit-panel">
            <div className="toolkit-heading"><div><span>SETTLING-IN AUTOPILOT</span><h2>Your next deadlines</h2></div><small>Dates follow the arrival date in Me</small></div>
            <div className="toolkit-task-list">
              {tasks.map(task => <article key={task.id} className={task.status === 'done' ? 'is-done' : ''}>
                <button type="button" onClick={() => setTask(task, task.status === 'done' ? 'pending' : 'done')} aria-label={`${task.status === 'done' ? 'Reopen' : 'Complete'} ${task.title}`}>{task.status === 'done' ? '✓' : ''}</button>
                <div><strong>{task.title}</strong><p>{task.detail}</p></div>
                <time>{task.dueOn ? new Intl.DateTimeFormat('en-AE', { day: 'numeric', month: 'short' }).format(new Date(`${task.dueOn}T12:00:00`)) : 'No date'}</time>
              </article>)}
            </div>
          </section>
        )}

        <section className="toolkit-grid" aria-label="Offline essentials">
          {items.map(item => <article key={item.slug} className={`toolkit-card is-${item.category}`}>
            <div className="toolkit-card-top"><span>{item.category === 'emergency' ? 'SOS' : item.category === 'embassy' ? 'ZA' : item.category === 'visa' ? 'ID' : '48h'}</span><small>{item.category}</small></div>
            <h2>{item.title}</h2><p>{item.summary}</p>
            <ul>{item.steps.map(step => <li key={step}>{step}</li>)}</ul>
            <div className="toolkit-actions">
              {item.phone && <a href={`tel:${item.phone}`}>Call {item.phone}</a>}
              {item.url && <a href={item.url} target="_blank" rel="noreferrer">Official source ↗</a>}
            </div>
          </article>)}
        </section>
        <p className="toolkit-disclaimer">Requirements can change. Use the linked UAE and South African government pages for the current legal or consular process.</p>
      </div>
    </ModulePage>
  );
}

window.ToolkitScreen = ToolkitScreen;

