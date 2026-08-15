// community.jsx — shared South African expat community for Abu Dhabi.

const COMMUNITY_TABS = [
  ['home', 'Home'], ['events', 'Events'], ['questions', 'Q&A'], ['feed', 'Feed'],
  ['classifieds', 'Classifieds'], ['directory', 'People'], ['polls', 'Polls'],
];

const EMPTY_COMMUNITY = {
  memberCount: 0, me: null, profiles: [], events: [], questions: [], classifieds: [], polls: [], places: [],
};

function CommunityAvatar({ name, small = false }) {
  const initial = (name || 'M').trim().charAt(0).toUpperCase();
  return <span className={`community-avatar${small ? ' is-small' : ''}`} aria-hidden="true">{initial}</span>;
}

function CommunityEmpty({ icon, title, copy }) {
  return (
    <div className="community-empty">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function CommunityFormActions({ busy, onCancel, label = 'Post' }) {
  return (
    <div className="community-form-actions">
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : label}</Button>
    </div>
  );
}

function CommunityScreen({ onBack }) {
  const api = window.__lifeos.community;
  const [tab, setTab] = React.useState('home');
  const [snapshot, setSnapshot] = React.useState(EMPTY_COMMUNITY);
  const [status, setStatus] = React.useState('loading');
  const [message, setMessage] = React.useState('');
  const [composer, setComposer] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [replyingTo, setReplyingTo] = React.useState(null);
  const [reply, setReply] = React.useState('');
  const [photo, setPhoto] = React.useState(null);
  const [welcomeDraft, setWelcomeDraft] = React.useState(null);
  const [automationPreferences, setAutomationPreferences] = React.useState(null);
  const [buddyMatch, setBuddyMatch] = React.useState(null);
  const myId = api ? window.__lifeos.spaces.currentUserId() : null;

  const reload = React.useCallback(async (quiet = false) => {
    if (!quiet) setStatus('loading');
    try {
      setSnapshot(await api.loadCommunity());
      setStatus('ready');
    } catch (error) {
      setMessage(error?.message || 'Community could not load.');
      setStatus('error');
    }
  }, [api]);

  React.useEffect(() => {
    void reload();
    return api.subscribeCommunity(() => { void reload(true); });
  }, [api, reload]);

  React.useEffect(() => {
    let active = true;
    void Promise.all([
      window.__lifeos.automations.loadWelcomeDraft(),
      window.__lifeos.automations.loadAutomationPreferences(),
    ]).then(([draft, preferences]) => {
      if (!active) return;
      setWelcomeDraft(draft);
      setAutomationPreferences(preferences);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const nameFor = React.useCallback((userId) => api.displayCommunityName(snapshot.profiles, userId), [api, snapshot.profiles]);
  const nextEvent = snapshot.events.find(event => Date.parse(event.startsAt) >= Date.now()) || null;
  const feed = React.useMemo(() => api.buildCommunityFeed(snapshot), [api, snapshot]);

  async function act(work, success) {
    setBusy(true);
    setMessage('');
    try {
      await work();
      setComposer(null);
      setReplyingTo(null);
      setReply('');
      setPhoto(null);
      setMessage(success);
      await reload(true);
    } catch (error) {
      setMessage(error?.message || 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function report(table, id) {
    const reason = window.prompt('What should a moderator review?');
    if (!reason?.trim()) return;
    await act(() => api.reportCommunityContent(table, id, reason), 'Thanks — a moderator can now review it.');
  }

  function selectTab(next) {
    setTab(next);
    setComposer(null);
    setMessage('');
  }

  async function toggleBuddy(enabled) {
    try {
      await window.__lifeos.automations.saveAutomationPreferences({ newcomerBuddy: enabled });
      setAutomationPreferences(current => current ? { ...current, newcomerBuddy: enabled } : current);
      setBuddyMatch(null);
      setMessage(enabled ? 'Buddy matching is on. Only opted-in directory members can match.' : 'Buddy matching is off.');
    } catch (error) {
      setMessage(error?.message || 'Buddy matching could not be changed.');
    }
  }

  async function findBuddy() {
    setBusy(true);
    setMessage('');
    try {
      const match = await window.__lifeos.automations.findBuddy();
      setBuddyMatch(match);
      setMessage(match ? `A same-home-town buddy is ready: ${match.displayName}.` : 'No settled, opted-in match is available yet. We will keep the preference ready.');
    } catch (error) {
      setMessage(error?.message || 'Buddy matching is unavailable right now.');
    } finally {
      setBusy(false);
    }
  }

  function renderHome() {
    return (
      <div className="community-stack">
        <section className="community-hero">
          <div className="community-hero-copy">
            <span className="community-eyebrow">SOUTH AFRICANS IN ABU DHABI</span>
            <h2>A familiar corner, far from home.</h2>
            <p>Trade useful local knowledge, find your people and make settling in feel lighter.</p>
            <div className="community-hero-actions">
              <Button onClick={() => selectTab('feed')}>See what’s happening</Button>
              <Button variant="glass" onClick={() => setComposer('question')}>Ask the community</Button>
            </div>
          </div>
          <div className="community-orbit" aria-hidden="true">
            <span>🇿🇦</span><i>☀</i><b>🇦🇪</b>
          </div>
        </section>

        {(welcomeDraft && !welcomeDraft.publishedAt) || automationPreferences ? <div className="community-welcome-grid">
          {welcomeDraft && !welcomeDraft.publishedAt && <article className="community-welcome-draft">
            <span>YOUR WELCOME IS PRIVATE UNTIL YOU SHARE IT</span>
            <h3>Say hello when you’re ready.</h3>
            <p>Life OS prepared a short introduction without your home town or private details. Review every word before it enters the feed.</p>
            <Button size="sm" onClick={() => setComposer('welcome')}>Review welcome post</Button>
          </article>}
          {automationPreferences && <article className="community-buddy-card">
            <span>NEWCOMER BUDDY</span><h3>A familiar home-town connection.</h3>
            <p>Matching only considers people who opted into both the directory and buddy programme and have been here at least 12 months.</p>
            <div><Button size="sm" variant={automationPreferences.newcomerBuddy ? 'primary' : 'ghost'} onClick={() => toggleBuddy(!automationPreferences.newcomerBuddy)}>{automationPreferences.newcomerBuddy ? 'Matching on ✓' : 'Opt in'}</Button>{automationPreferences.newcomerBuddy && <Button size="sm" variant="ghost" disabled={busy} onClick={findBuddy}>Find a buddy</Button>}</div>
            {buddyMatch && <button type="button" className="community-buddy-match" onClick={() => selectTab('directory')}><CommunityAvatar name={buddyMatch.displayName} small /><span><strong>{buddyMatch.displayName}</strong><small>{buddyMatch.homeTown} · {buddyMatch.emirate}</small></span><b>Meet in directory →</b></button>}
          </article>}
        </div> : null}

        <div className="community-stat-grid">
          <button type="button" onClick={() => selectTab('directory')}>
            <span>Community</span><strong>{snapshot.memberCount}</strong><small>{snapshot.memberCount === 1 ? 'member' : 'members'} signed up</small>
          </button>
          <button type="button" onClick={() => selectTab('directory')}>
            <span>Your area</span><strong>{snapshot.me?.emirate || 'Abu Dhabi'}</strong><small>{snapshot.me?.homeTown ? `From ${snapshot.me.homeTown}` : 'Add your SA home town in Me'}</small>
          </button>
          <button type="button" onClick={() => selectTab('events')}>
            <span>Next get-together</span><strong>{nextEvent ? new Intl.DateTimeFormat('en-AE', { day: 'numeric', month: 'short' }).format(new Date(nextEvent.startsAt)) : 'Open'}</strong>
            <small>{nextEvent?.title || 'Create the first event'}</small>
          </button>
        </div>

        <div className="community-launch-grid">
          {[
            ['events', 'CalendarDays', 'Meet up', 'Braais, watch parties and weekends out'],
            ['questions', 'MessageCircleQuestion', 'Ask locals', 'Get answers from people who have done it'],
            ['classifieds', 'Armchair', 'Pass it on', 'Furniture and useful finds in AED'],
            ['polls', 'ChartNoAxesColumn', 'Quick vote', 'Make plans without a long group chat'],
          ].map(([id, icon, title, copy]) => (
            <button type="button" key={id} onClick={() => selectTab(id)} className="community-launch-card">
              <AnimatedIcon name={icon} size={27} />
              <strong>{title}</strong><span>{copy}</span><b>→</b>
            </button>
          ))}
        </div>

        <section className="community-panel">
          <div className="community-panel-heading">
            <div><span className="community-eyebrow">LOCAL PINS</span><h3>Places members recommend</h3></div>
            <Button size="sm" variant="ghost" onClick={() => setComposer('place')}>+ Add place</Button>
          </div>
          {snapshot.places.length ? (
            <div className="community-place-strip">
              {snapshot.places.slice(0, 6).map(place => (
                <article key={place.id}>
                  <span>{place.category === 'food' ? '🍽️' : place.category === 'shopping' ? '🛍️' : '📍'}</span>
                  <div><strong>{place.name}</strong><small>{place.area || place.emirate}</small></div>
                  {place.status === 'pending' && <em>Pending review</em>}
                </article>
              ))}
            </div>
          ) : <CommunityEmpty icon="📍" title="Share the first useful place" copy="A grocer, mechanic, salon or spot that made Abu Dhabi easier." />}
        </section>
      </div>
    );
  }

  function renderEvents() {
    return (
      <section className="community-panel community-section-panel">
        <div className="community-panel-heading">
          <div><span className="community-eyebrow">GET TOGETHER</span><h2>Events</h2></div>
          <Button onClick={() => setComposer('event')}>+ Create event</Button>
        </div>
        {snapshot.events.length ? <div className="community-event-list">
          {snapshot.events.map(event => {
            const mine = event.attendees.find(attendee => attendee.userId === myId)?.response || null;
            const full = event.capacity && event.attendees.filter(attendee => attendee.response === 'going').length >= event.capacity;
            return <article className="community-event-card" key={event.id}>
              <time><strong>{new Intl.DateTimeFormat('en-AE', { day: '2-digit' }).format(new Date(event.startsAt))}</strong><span>{new Intl.DateTimeFormat('en-AE', { month: 'short' }).format(new Date(event.startsAt))}</span></time>
              <div className="community-event-main">
                <div className="community-card-meta"><span>{event.area || 'Abu Dhabi'}</span>{event.hidden && <b>Hidden pending review</b>}</div>
                <h3>{event.title}</h3><p>{event.description}</p>
                <small>{new Intl.DateTimeFormat('en-AE', { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(event.startsAt))} · {event.location || 'Location to follow'}</small>
                <div className="community-attendees">
                  <div>{event.attendees.slice(0, 5).map(attendee => <CommunityAvatar key={attendee.userId} name={nameFor(attendee.userId)} small />)}</div>
                  <span>{event.attendees.length} interested{event.capacity ? ` · ${event.capacity} spots` : ''}</span>
                </div>
              </div>
              <div className="community-card-actions">
                <Button size="sm" variant={mine === 'going' ? 'primary' : 'ghost'} disabled={!mine && full} onClick={() => act(() => api.setEventRsvp(event.id, mine === 'going' ? null : 'going'), mine === 'going' ? 'RSVP removed.' : 'You’re going!')}>{mine === 'going' ? 'Going ✓' : full ? 'Full' : 'I’m going'}</Button>
                {event.authorId !== myId && <button type="button" className="community-report" onClick={() => report('events', event.id)}>Report</button>}
              </div>
            </article>;
          })}
        </div> : <CommunityEmpty icon="📅" title="Nothing planned yet" copy="Create a braai, coffee, match day or family outing." />}
      </section>
    );
  }

  function renderQuestions() {
    return (
      <section className="community-panel community-section-panel">
        <div className="community-panel-heading">
          <div><span className="community-eyebrow">LOCAL KNOW-HOW</span><h2>Questions & answers</h2></div>
          <Button onClick={() => setComposer('question')}>+ Ask</Button>
        </div>
        {snapshot.questions.length ? <div className="community-question-list">
          {snapshot.questions.map(question => <article className="community-question" key={question.id}>
            <div className="community-author-line"><CommunityAvatar name={nameFor(question.authorId)} small /><span>{nameFor(question.authorId)}</span><time>{api ? window.__lifeos.prices.ageLabel(question.createdAt) : ''}</time>{question.hidden && <b>Hidden pending review</b>}</div>
            <h3>{question.title}</h3>{question.body && <p>{question.body}</p>}
            <div className="community-answer-list">
              {question.answers.map(answer => <div className={`community-answer${answer.accepted ? ' is-accepted' : ''}`} key={answer.id}>
                <div><strong>{nameFor(answer.authorId)}</strong>{answer.accepted && <span>✓ Accepted answer</span>}</div>
                <p>{answer.body}</p>
                {question.authorId === myId && !answer.accepted && <button type="button" onClick={() => act(() => api.acceptAnswer(question.id, answer.id), 'Answer accepted.')}>Accept this answer</button>}
              </div>)}
            </div>
            {replyingTo === question.id ? <form className="community-inline-reply" onSubmit={event => { event.preventDefault(); void act(() => api.answerQuestion(question.id, reply), 'Your answer is live.'); }}>
              <textarea autoFocus required value={reply} onChange={event => setReply(event.target.value)} placeholder="Share what you know…" />
              <Button size="sm" type="submit" disabled={busy}>Reply</Button>
            </form> : <div className="community-card-actions"><Button size="sm" variant="ghost" onClick={() => setReplyingTo(question.id)}>Answer</Button>{question.authorId !== myId && <button type="button" className="community-report" onClick={() => report('questions', question.id)}>Report</button>}</div>}
          </article>)}
        </div> : <CommunityEmpty icon="💬" title="No questions yet" copy="Ask about paperwork, neighbourhoods, schools or where to find a taste of home." />}
      </section>
    );
  }

  function renderFeed() {
    const labels = { event: 'EVENT', question: 'QUESTION', classified: 'FOR SALE', place: 'LOCAL PLACE' };
    return <section className="community-panel community-section-panel"><div className="community-panel-heading"><div><span className="community-eyebrow">NEWEST FIRST</span><h2>Community feed</h2></div></div>
      {feed.length ? <div className="community-feed">{feed.map(item => <button type="button" key={`${item.kind}-${item.id}`} onClick={() => selectTab(item.kind === 'event' ? 'events' : item.kind === 'question' ? 'questions' : item.kind === 'classified' ? 'classifieds' : 'home')}>
        <span className={`community-feed-icon is-${item.kind}`}>{item.kind === 'event' ? '📅' : item.kind === 'question' ? '?' : item.kind === 'classified' ? '🏷' : '📍'}</span>
        <div><small>{labels[item.kind]} · {nameFor(item.authorId)}</small><strong>{item.title}</strong><p>{item.detail}</p></div><time>{window.__lifeos.prices.ageLabel(item.createdAt)}</time>
      </button>)}</div> : <CommunityEmpty icon="🌱" title="A fresh start" copy="New events, questions, places and listings will appear here." />}
    </section>;
  }

  function renderClassifieds() {
    return <section className="community-panel community-section-panel"><div className="community-panel-heading"><div><span className="community-eyebrow">PASS IT ON</span><h2>Classifieds</h2></div><Button onClick={() => setComposer('classified')}>+ List an item</Button></div>
      {snapshot.classifieds.length ? <div className="community-classified-grid">{snapshot.classifieds.map(item => <article key={item.id} className={item.soldAt ? 'is-sold' : ''}>
        <div className="community-classified-photo">{item.photoUrl ? <img src={item.photoUrl} alt="" /> : <span>{item.category === 'Furniture' ? '🪑' : '📦'}</span>}{item.soldAt && <b>Sold</b>}</div>
        <div className="community-classified-copy"><small>{item.category} · {item.area || 'Abu Dhabi'}</small><h3>{item.title}</h3><strong>AED {item.price.toLocaleString('en-AE', { maximumFractionDigits: 2 })}</strong><p>{item.description}</p><span>Listed by {nameFor(item.authorId)}</span>
          <div className="community-card-actions">{item.authorId === myId ? <Button size="sm" variant="ghost" onClick={() => act(() => api.markClassifiedSold(item.id, !item.soldAt), item.soldAt ? 'Listing reopened.' : 'Marked as sold.')}>{item.soldAt ? 'Reopen' : 'Mark sold'}</Button> : <button type="button" className="community-report" onClick={() => report('classifieds', item.id)}>Report</button>}</div>
        </div>
      </article>)}</div> : <CommunityEmpty icon="🛋️" title="No listings yet" copy="Give useful furniture and household items a second home." />}
    </section>;
  }

  function renderDirectory() {
    return <section className="community-panel community-section-panel"><div className="community-panel-heading"><div><span className="community-eyebrow">OPT-IN DIRECTORY</span><h2>Meet the community</h2><p>Only members who choose to be listed appear here.</p></div></div>
      {snapshot.profiles.length ? <div className="community-directory-grid">{snapshot.profiles.map(profile => <article key={profile.userId}><CommunityAvatar name={profile.displayName} /><div><h3>{profile.displayName}</h3><p>{profile.homeTown ? `${profile.homeTown}, South Africa` : 'South African in the UAE'}</p><small>{profile.emirate || 'Abu Dhabi'} · {(profile.status || 'settled').replace('_', ' ')}</small></div>{profile.interests.length > 0 && <div className="community-interests">{profile.interests.slice(0, 3).map(interest => <span key={interest}>{interest}</span>)}</div>}</article>)}</div> : <CommunityEmpty icon="👋" title="The directory is private by default" copy="Opt in from Me when you’re ready to be discoverable." />}
    </section>;
  }

  function renderPolls() {
    return <section className="community-panel community-section-panel"><div className="community-panel-heading"><div><span className="community-eyebrow">ONE TAP PLANS</span><h2>Community polls</h2></div><Button onClick={() => setComposer('poll')}>+ New poll</Button></div>
      {snapshot.polls.length ? <div className="community-poll-grid">{snapshot.polls.map(poll => <article key={poll.id}><small>{nameFor(poll.authorId)} asks</small><h3>{poll.question}</h3><div className="community-poll-options">{poll.options.map(option => { const pct = api.pollPercentage(option.votes, poll.totalVotes); return <button type="button" key={option.id} className={poll.myVote === option.id ? 'is-selected' : ''} onClick={() => act(() => api.voteInPoll(poll.id, option.id), 'Vote counted.')}><i style={{ width: `${pct}%` }} /><span>{option.label}</span><b>{poll.myVote ? `${pct}%` : 'Vote'}</b></button>; })}</div><p>{poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}</p></article>)}</div> : <CommunityEmpty icon="📊" title="No polls yet" copy="Choose a braai date, match venue or the next place to explore." />}
    </section>;
  }

  function renderComposer() {
    if (!composer) return null;
    if (composer === 'event') return <Modal open onClose={() => setComposer(null)} title="Create an event"><form className="community-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act(() => api.createCommunityEvent({ title: form.get('title'), description: form.get('description'), startsAt: form.get('startsAt'), location: form.get('location'), area: form.get('area'), capacity: Number(form.get('capacity')) || null }), 'Event published.'); }}><label>Event name<input required name="title" placeholder="Springbok watch party" /></label><label>When<input required name="startsAt" type="datetime-local" /></label><div className="community-form-row"><label>Venue<input name="location" placeholder="Venue or meeting point" /></label><label>Area<input name="area" placeholder="Khalifa City" /></label></div><label>Details<textarea name="description" placeholder="What should people know?" /></label><label>Capacity (optional)<input name="capacity" min="1" inputMode="numeric" type="number" /></label><CommunityFormActions busy={busy} onCancel={() => setComposer(null)} label="Publish event" /></form></Modal>;
    if (composer === 'question') return <Modal open onClose={() => setComposer(null)} title="Ask the community"><form className="community-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act(() => api.askCommunity(form.get('title'), form.get('body')), 'Question posted.'); }}><label>Your question<input required name="title" placeholder="Where can I find good biltong?" /></label><label>Helpful detail<textarea name="body" placeholder="Area, timing, or what you’ve tried…" /></label><CommunityFormActions busy={busy} onCancel={() => setComposer(null)} label="Ask everyone" /></form></Modal>;
    if (composer === 'welcome') return <Modal open onClose={() => setComposer(null)} title="Review your welcome post"><form className="community-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act(async () => { await window.__lifeos.automations.updateWelcomeDraft(form.get('title'), form.get('body')); await window.__lifeos.automations.publishWelcomeDraft(); setWelcomeDraft(current => current ? { ...current, publishedAt: new Date().toISOString() } : current); }, 'Welcome post published.'); }}><div className="community-consent-note">Nothing is public until you press “Share introduction”. Your profile stays private unless you separately opt into the directory.</div><label>Title<input required name="title" defaultValue={welcomeDraft?.title || ''} maxLength="220" /></label><label>Introduction<textarea required name="body" defaultValue={welcomeDraft?.body || ''} maxLength="4000" /></label><CommunityFormActions busy={busy} onCancel={() => setComposer(null)} label="Share introduction" /></form></Modal>;
    if (composer === 'classified') return <Modal open onClose={() => setComposer(null)} title="List an item"><form className="community-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act(async () => { const photoPath = photo ? await api.uploadCommunityPhoto(photo) : null; await api.createClassified({ title: form.get('title'), description: form.get('description'), category: form.get('category'), price: Number(form.get('price')), area: form.get('area'), photoPath }); }, 'Listing published.'); }}><label>What are you selling?<input required name="title" placeholder="Solid wood dining table" /></label><div className="community-form-row"><label>Price (AED)<input required name="price" type="number" inputMode="decimal" min="0" step="0.01" /></label><label>Category<select name="category"><option>Furniture</option><option>Home</option><option>Electronics</option><option>Kids</option><option>Other</option></select></label></div><label>Area<input name="area" placeholder="Khalifa City" /></label><label>Details<textarea name="description" placeholder="Condition, dimensions, collection…" /></label><label className="community-file-button"><span>{photo ? `✓ ${photo.name}` : 'Add a clear photo'}</span><input type="file" accept="image/*" onChange={event => setPhoto(event.target.files?.[0] || null)} /></label><CommunityFormActions busy={busy} onCancel={() => setComposer(null)} label="Publish listing" /></form></Modal>;
    if (composer === 'poll') return <Modal open onClose={() => setComposer(null)} title="Start a poll"><form className="community-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act(() => api.createPoll(form.get('question'), String(form.get('options')).split(',')), 'Poll is live.'); }}><label>Question<input required name="question" placeholder="Where should we meet on Saturday?" /></label><label>Choices, separated by commas<textarea required name="options" placeholder="Corniche, Yas Bay, Al Qana" /></label><CommunityFormActions busy={busy} onCancel={() => setComposer(null)} label="Start poll" /></form></Modal>;
    return <Modal open onClose={() => setComposer(null)} title="Recommend a place"><form className="community-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act(() => api.createCommunityPlace({ name: form.get('name'), category: form.get('category'), description: form.get('description'), area: form.get('area'), address: form.get('address') }), 'Place sent for review.'); }}><label>Place name<input required name="name" placeholder="Your favourite local find" /></label><div className="community-form-row"><label>Type<select name="category"><option value="food">Food</option><option value="shopping">Shopping</option><option value="services">Services</option><option value="community">Community</option></select></label><label>Area<input name="area" placeholder="Khalifa City" /></label></div><label>Address<input name="address" placeholder="Street or mall" /></label><label>Why recommend it?<textarea name="description" /></label><CommunityFormActions busy={busy} onCancel={() => setComposer(null)} label="Share place" /></form></Modal>;
  }

  const sections = { home: renderHome, events: renderEvents, questions: renderQuestions, feed: renderFeed, classifieds: renderClassifieds, directory: renderDirectory, polls: renderPolls };

  return (
    <ModulePage title="Community" subtitle="South African know-how for life in Abu Dhabi" icon="UsersRound" onBack={onBack} action={<Button size="sm" variant="ghost" onClick={() => reload()}>↻ Refresh</Button>}>
      <div className="community-screen">
        <nav className="community-tabs" aria-label="Community sections">{COMMUNITY_TABS.map(([id, label]) => <button type="button" key={id} onClick={() => selectTab(id)} className={tab === id ? 'is-active' : ''}>{label}</button>)}</nav>
        {message && <div className={`community-message${status === 'error' ? ' is-error' : ''}`} role="status">{message}</div>}
        {status === 'loading' ? <div className="community-loading"><i /><strong>Gathering the community…</strong></div> : sections[tab]()}
        {renderComposer()}
      </div>
    </ModulePage>
  );
}

window.CommunityScreen = CommunityScreen;
