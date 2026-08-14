// games.jsx — Life OS multiplayer game night

const {
  useState: useGamesState,
  useEffect: useGamesEffect,
} = React;

const GAME_CARD_ART = {
  sun: '☀',
  shell: '◒',
  coffee: '☕',
  camera: '◉',
  palm: '♧',
  star: '✦',
};

const GAME_ACCENTS = {
  'connect-four': { className: 'is-connect', eyebrow: 'QUICK RIVALRY', flourish: '● ● ● ●' },
  'noughts-crosses': { className: 'is-noughts', eyebrow: 'TINY CLASSIC', flourish: '○  ×  ○' },
  'memory-match': { className: 'is-memory', eyebrow: 'GROUP FAVOURITE', flourish: '✦  ◒  ☀' },
  'draw-poker': { className: 'is-poker', eyebrow: 'FIVE-CARD CLASSIC', flourish: '♠  ♥  ♦  ♣' },
  blackjack: { className: 'is-blackjack', eyebrow: 'BEAT THE HOUSE', flourish: 'A  +  K  =  21' },
  war: { className: 'is-war', eyebrow: 'FLIP TOGETHER', flourish: 'A  ⚔  K' },
  'crazy-eights': { className: 'is-crazy', eyebrow: 'WILD-CARD NIGHT', flourish: '8  ✦  8' },
  'go-fish': { className: 'is-fish', eyebrow: 'GENTLE BLUFF', flourish: '≈  Q?  ≈' },
};

const CARD_GAME_TYPES = new Set(['draw-poker', 'blackjack', 'war', 'crazy-eights', 'go-fish']);
const DEMO_HANDS = {
  'draw-poker': ['AS', 'AH', 'KD', '9C', '5S'],
  blackjack: ['AS', 'KH'],
  war: ['AS', '7H', 'QD'],
  'crazy-eights': ['8S', 'QH', '4D', 'KC', '2S', '9H', 'JD'],
  'go-fish': ['QS', 'QH', '4D', 'KC', '2S', '9H', 'JD'],
};

function makeDemoGameBundle(gameType, profile) {
  const currentId = profile?.user_id || 'visual-preview';
  const userName = profile?.display_name || 'You';
  const state = window.__lifeos.games.createInitialGameState(gameType, () => 0.42);
  if (CARD_GAME_TYPES.has(gameType)) {
    Object.assign(state, {
      stage: gameType === 'draw-poker' ? 'draw' : gameType === 'go-fish' ? 'ask' : gameType === 'war' ? 'battle' : 'play',
      handCounts: [DEMO_HANDS[gameType]?.length || 0, 5, 0, 0, 0, 0],
      deckCount: 35,
    });
    if (gameType === 'blackjack') Object.assign(state, { stage: 'players', dealerCards: ['9D'], dealerCount: 2, dealerHidden: true });
    if (gameType === 'crazy-eights') Object.assign(state, { topCard: 'QH', currentSuit: 'H' });
  }
  return {
    room: {
      id: -1,
      code: 'SUNFUN',
      game_type: gameType,
      status: 'playing',
      state,
      version: 0,
      max_players: window.__lifeos.games.maxPlayersForGame(gameType),
      owner_id: currentId,
      winner_id: null,
      updated_at: new Date().toISOString(),
    },
    players: [
      { user_id: currentId, display_name: userName, seat: 0, joined_at: new Date().toISOString() },
      { user_id: 'demo-friend', display_name: 'Maya', seat: 1, joined_at: new Date().toISOString() },
    ],
    hand: CARD_GAME_TYPES.has(gameType)
      ? { cards: DEMO_HANDS[gameType] || [], points: 0, stood: false, meta: {} }
      : null,
  };
}

function GamePlayerAvatar({ player, active, current, winner, compact = false }) {
  const palette = ['is-yellow', 'is-blue', 'is-cream', 'is-mint', 'is-coral', 'is-lilac'];
  const initial = (player?.display_name || '?').trim().charAt(0).toUpperCase();
  return (
    <div className={`games-player${active ? ' is-turn' : ''}${winner ? ' is-winner' : ''}${compact ? ' is-compact' : ''}`}>
      <span className={`games-player-avatar ${palette[player?.seat || 0]}`}>{initial}</span>
      <span className="games-player-copy">
        <strong>{player?.display_name || 'Open seat'}{current ? ' · You' : ''}</strong>
        <small>{winner ? 'Winner!' : active ? 'Playing now' : player ? 'In the room' : 'Waiting'}</small>
      </span>
    </div>
  );
}

function GameHub({ initialCode, onBack, onCreate, onJoin, busy, error }) {
  const definitions = window.__lifeos.games.GAME_DEFINITIONS;
  const [joinCode, setJoinCode] = useGamesState(initialCode || '');
  const [surprise, setSurprise] = useGamesState(null);
  const [filter, setFilter] = useGamesState('cards');
  const games = Object.entries(definitions);
  const visibleGames = games.filter(([, game]) => filter === 'all' || game.family === filter);

  function pickForUs() {
    const next = games[Math.floor(Math.random() * games.length)][0];
    setSurprise(next);
    void window.__lifeos?.native.tap('light');
    window.setTimeout(() => onCreate(next), 420);
  }

  return (
    <main className="games-screen games-hub fade-in">
      <header className="games-page-header">
        <button type="button" className="games-back-button" onClick={onBack} aria-label="Back home">‹</button>
        <div>
          <span className="games-page-kicker">LIFE OS PLAY</span>
          <h1>Game night</h1>
          <p>Same room, different screens.</p>
        </div>
        <div className="games-header-dice" aria-hidden="true"><span>●</span><span>✦</span></div>
      </header>

      <section className="games-hero-card">
        <div className="games-hero-orbit orbit-one" />
        <div className="games-hero-orbit orbit-two" />
        <div className="games-hero-copy">
          <span className="games-eyebrow">A LITTLE TOGETHER TIME</span>
          <h2>Turn any call into<br /> a game night.</h2>
          <p>Create a room, share one cheerful little code, and play live with friends or family anywhere.</p>
          <button type="button" className="games-surprise-button" onClick={pickForUs} disabled={busy}>
            <span className={surprise ? 'is-shuffling' : ''}>✦</span>
            Pick a game for us
          </button>
          <div className="games-hero-promises" aria-label="Game night features">
            <span>♠ Private hands</span><span>● Live rooms</span><span>✦ No ads</span>
          </div>
        </div>
        <div className="games-hero-board" aria-hidden="true">
          <div className="games-floating-piece piece-one">○</div>
          <div className="games-floating-piece piece-two">×</div>
          <div className="games-floating-piece piece-three">✦</div>
          <div className="games-mini-grid">
            {Array.from({ length: 16 }).map((_, index) => <span key={index} className={index % 5 === 0 || index === 7 ? 'is-lit' : ''} />)}
          </div>
        </div>
      </section>

      <section className="games-section">
        <div className="games-section-heading">
          <div><span>CHOOSE A TABLE</span><h2>Your nostalgia deck</h2></div>
          <small>{games.length} games · private · live</small>
        </div>
        <div className="games-filter" role="group" aria-label="Filter games">
          {[['cards', 'Card classics'], ['board', 'Quick boards'], ['all', 'Show all']].map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="games-picker-grid">
          {visibleGames.map(([id, game], index) => {
            const accent = GAME_ACCENTS[id];
            return (
              <button
                key={id}
                type="button"
                className={`games-picker-card ${accent.className}${surprise === id ? ' is-picked' : ''}`}
                onClick={() => onCreate(id)}
                disabled={busy}
              >
                <span className="games-picker-number">0{index + 1}</span>
                <span className="games-picker-art" aria-hidden="true">{accent.flourish}</span>
                <span className="games-picker-eyebrow">{accent.eyebrow}</span>
                <strong>{game.title}</strong>
                <span className="games-picker-description">{game.description}</span>
                <span className="games-picker-meta"><b>{game.players}</b><b>{game.duration}</b></span>
                <span className="games-picker-cta">Create room <i>→</i></span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="games-join-card">
        <div className="games-join-icon" aria-hidden="true">⌁</div>
        <div className="games-join-copy">
          <span className="games-eyebrow">ALREADY INVITED?</span>
          <h2>Join their table</h2>
          <p>Enter the six-character code from your friend.</p>
        </div>
        <form onSubmit={event => { event.preventDefault(); onJoin(joinCode); }} className="games-join-form">
          <label htmlFor="games-room-code">Room code</label>
          <div>
            <input
              id="games-room-code"
              value={joinCode}
              onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="SUNFUN"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength="6"
              aria-describedby={error ? 'games-hub-error' : undefined}
            />
            <button type="submit" disabled={busy || joinCode.length !== 6}>{busy ? 'Joining…' : 'Join room'}</button>
          </div>
        </form>
      </section>

      {error && <div id="games-hub-error" className="games-error" role="alert">{error}</div>}

      <section className="games-how-it-works" aria-label="How game rooms work">
        <div><span>1</span><strong>Pick a game</strong><small>Start in one tap.</small></div>
        <i />
        <div><span>2</span><strong>Share the code</strong><small>Send it anywhere.</small></div>
        <i />
        <div><span>3</span><strong>Play together</strong><small>Moves sync live.</small></div>
      </section>
    </main>
  );
}

function ConnectFourBoard({ state, disabled, onMove }) {
  return (
    <div className="games-connect-board" role="grid" aria-label="Connect Four board">
      {Array.from({ length: 7 }).map((_, column) => (
        <button
          key={column}
          type="button"
          className="games-connect-column"
          onClick={() => onMove(column)}
          disabled={disabled || state.board[column] != null}
          aria-label={`Drop a piece in column ${column + 1}`}
        >
          {Array.from({ length: 6 }).map((__, row) => {
            const seat = state.board[row * 7 + column];
            return <span key={row} className={`games-connect-slot${seat != null ? ` is-seat-${seat}` : ''}`} />;
          })}
        </button>
      ))}
    </div>
  );
}

function NoughtsCrossesBoard({ state, disabled, onMove }) {
  return (
    <div className="games-noughts-board" role="grid" aria-label="Noughts and Crosses board">
      {state.board.map((seat, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onMove(index)}
          disabled={disabled || seat != null}
          aria-label={seat == null ? `Play square ${index + 1}` : `Square ${index + 1}, player ${seat + 1}`}
          className={seat != null ? `is-seat-${seat}` : ''}
        >
          {seat == null ? <span /> : seat % 2 === 0 ? '○' : '×'}
        </button>
      ))}
    </div>
  );
}

function MemoryBoard({ state, disabled, onMove }) {
  return (
    <div className="games-memory-board" role="grid" aria-label="Memory Match board">
      {state.deck.map((card, index) => {
        const visible = state.revealed.includes(index) || state.matched.includes(index);
        const matched = state.matched.includes(index);
        return (
          <button
            key={index}
            type="button"
            className={`${visible ? 'is-visible' : ''}${matched ? ' is-matched' : ''}`}
            onClick={() => onMove(index)}
            disabled={disabled || matched || state.revealed.includes(index)}
            aria-label={visible ? `${card}${matched ? ', matched' : ''}` : `Hidden card ${index + 1}`}
          >
            <span className="games-memory-card-inner">
              <span className="games-memory-card-back">✦</span>
              <span className="games-memory-card-front">{GAME_CARD_ART[card] || '◆'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlayingCardView({ card, hidden = false, selected = false, disabled = false, onClick, label }) {
  if (hidden || !card) {
    return <span className="games-playing-card is-back" aria-label={label || 'Face-down card'}><i>✦</i></span>;
  }
  const rank = window.__lifeos.games.cardRankLabel(window.__lifeos.games.cardRank(card));
  const suit = window.__lifeos.games.cardSuitSymbol(window.__lifeos.games.cardSuit(card));
  const color = window.__lifeos.games.cardColor(card);
  const content = <><b>{rank}</b><strong>{suit}</strong><small>{rank}</small></>;
  return onClick ? (
    <button
      type="button"
      className={`games-playing-card is-${color}${selected ? ' is-selected' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label || window.__lifeos.games.cardLabel(card)}
    >{content}</button>
  ) : <span className={`games-playing-card is-${color}${selected ? ' is-selected' : ''}`} aria-label={label || window.__lifeos.games.cardLabel(card)}>{content}</span>;
}

function CardFan({ cards = [], selected = [], onToggle, disabled = false, label = 'Your hand' }) {
  return (
    <div className="games-card-fan" role="group" aria-label={label}>
      {cards.map((card, index) => (
        <PlayingCardView
          key={card}
          card={card}
          selected={selected.includes(card)}
          disabled={disabled}
          onClick={onToggle ? () => onToggle(card) : undefined}
          label={`${window.__lifeos.games.cardLabel(card)}${onToggle ? ', choose card' : ''}`}
        />
      ))}
      {cards.length === 0 && <span className="games-empty-hand">No cards in your hand</span>}
    </div>
  );
}

function CardOpponents({ players, me, state }) {
  return (
    <div className="games-card-opponents">
      {players.filter(player => player.user_id !== me?.user_id).map(player => (
        <div key={player.user_id} className={state.turnSeat === player.seat ? 'is-turn' : ''}>
          <span className="games-mini-card-stack"><i /><i /><i /></span>
          <strong>{player.display_name}</strong>
          <small>{state.handCounts?.[player.seat] || 0} cards</small>
        </div>
      ))}
    </div>
  );
}

function PokerTable({ hand, state, players, me, disabled, onAction }) {
  const [selected, setSelected] = useGamesState([]);
  useGamesEffect(() => setSelected([]), [hand?.cards?.join('|'), state.turnSeat]);

  function toggle(card) {
    setSelected(current => current.includes(card)
      ? current.filter(value => value !== card)
      : current.length < 3 ? [...current, card] : current);
  }

  const revealed = state.revealedHands || {};
  const finished = state.stage === 'showdown';
  return (
    <div className="games-card-table games-poker-table">
      <CardOpponents players={players} me={me} state={state} />
      <div className="games-table-center">
        <span className="games-table-mark">♠</span>
        <strong>{finished ? 'Showdown' : 'One draw each'}</strong>
        <small>{finished ? 'Best five-card hand takes the table' : 'Choose up to three cards to replace'}</small>
      </div>
      {finished && (
        <div className="games-showdown-hands">
          {players.map(player => <div key={player.user_id}><strong>{player.display_name}</strong><CardFan cards={revealed[player.seat] || []} /><small>{window.__lifeos.games.pokerHandName(revealed[player.seat] || [])}</small></div>)}
        </div>
      )}
      <div className="games-my-hand">
        <div><span>YOUR HAND</span><strong>{window.__lifeos.games.pokerHandName(hand?.cards || [])}</strong></div>
        <CardFan cards={hand?.cards || []} selected={selected} onToggle={!finished ? toggle : undefined} disabled={disabled} />
      </div>
      {!finished && (
        <button type="button" className="games-card-action" disabled={disabled} onClick={() => onAction({ type: 'draw', cards: selected })}>
          {selected.length ? `Draw ${selected.length} new card${selected.length > 1 ? 's' : ''}` : 'Keep this hand'}
        </button>
      )}
    </div>
  );
}

function BlackjackTable({ hand, state, players, me, disabled, onAction }) {
  const dealerCards = state.dealerCards || [];
  const dealerCount = state.dealerCount || dealerCards.length;
  const total = window.__lifeos.games.blackjackValue(hand?.cards || []);
  const result = state.results?.[me?.seat];
  return (
    <div className="games-card-table games-blackjack-table">
      <div className="games-dealer-zone">
        <span>THE HOUSE</span>
        <div className="games-inline-cards">
          {dealerCards.map(card => <PlayingCardView key={card} card={card} />)}
          {state.dealerHidden && Array.from({ length: Math.max(1, dealerCount - dealerCards.length) }).map((_, index) => <PlayingCardView key={`dealer-${index}`} hidden />)}
        </div>
        <strong>{state.dealerHidden ? 'One card hidden' : `Dealer has ${state.dealerTotal}`}</strong>
      </div>
      <CardOpponents players={players} me={me} state={state} />
      <div className="games-my-hand">
        <div><span>YOUR HAND</span><strong className={total > 21 ? 'is-bust' : ''}>{total > 21 ? `${total} · Bust` : `${total} points`}</strong></div>
        <CardFan cards={hand?.cards || []} />
      </div>
      {result ? <div className={`games-result-pill is-${result}`}>{result === 'push' ? 'Push · same as dealer' : result === 'win' ? 'You beat the house!' : result === 'bust' ? 'Bust · next round?' : 'The house takes this one'}</div> : (
        <div className="games-card-actions">
          <button type="button" className="games-card-action" disabled={disabled || hand?.stood} onClick={() => onAction({ type: 'hit' })}>Hit me</button>
          <button type="button" className="games-card-action is-quiet" disabled={disabled || hand?.stood} onClick={() => onAction({ type: 'stand' })}>Stand</button>
        </div>
      )}
    </div>
  );
}

function WarTable({ hand, state, players, me, disabled, onAction }) {
  const ready = state.readySeats?.includes(me?.seat);
  const battle = state.lastBattle || {};
  return (
    <div className="games-card-table games-war-table">
      <div className="games-war-scoreboard">
        {players.map(player => <span key={player.user_id}><small>{player.display_name}</small><strong>{state.scores?.[player.seat] || 0}</strong></span>)}
      </div>
      <div className="games-war-battle">
        {players.map(player => <div key={player.user_id}><PlayingCardView card={battle[player.seat]} hidden={!battle[player.seat]} /><strong>{player.display_name}</strong></div>)}
        <span className="games-war-vs">VS</span>
      </div>
      <div className="games-war-deck"><PlayingCardView hidden /><span><strong>{hand?.cards?.length || 0}</strong><small>cards left</small></span></div>
      <button type="button" className="games-card-action" disabled={disabled || ready || state.stage === 'showdown'} onClick={() => onAction({ type: 'flip' })}>
        {ready ? 'Card ready · waiting…' : state.warPot > 1 ? `War! Flip for ${state.warPot} points` : 'Flip my card'}
      </button>
    </div>
  );
}

function CrazyEightsTable({ hand, state, players, me, disabled, onAction }) {
  const [wildCard, setWildCard] = useGamesState(null);
  const topCard = state.topCard;
  const currentSuit = state.currentSuit;
  const finished = state.stage === 'showdown';

  function chooseCard(card) {
    if (window.__lifeos.games.cardRank(card) === '8') setWildCard(card);
    else onAction({ type: 'play', card });
  }

  return (
    <div className="games-card-table games-crazy-table">
      <CardOpponents players={players} me={me} state={state} />
      <div className="games-crazy-center">
        <div><PlayingCardView card={topCard} /><span className="games-suit-badge">Play {window.__lifeos.games.cardSuitSymbol(currentSuit)}</span></div>
        <span className="games-draw-pile"><PlayingCardView hidden /><small>{state.deckCount || 0} left</small></span>
      </div>
      {wildCard && (
        <div className="games-suit-chooser" role="dialog" aria-label="Choose the next suit">
          <strong>Make your eight wild</strong>
          <div>{['S', 'H', 'D', 'C'].map(suit => <button key={suit} type="button" onClick={() => { onAction({ type: 'play', card: wildCard, suit }); setWildCard(null); }}>{window.__lifeos.games.cardSuitSymbol(suit)}</button>)}</div>
          <button type="button" onClick={() => setWildCard(null)}>Cancel</button>
        </div>
      )}
      <div className="games-my-hand">
        <div><span>YOUR HAND</span><strong>{hand?.cards?.length || 0} cards</strong></div>
        <CardFan
          cards={hand?.cards || []}
          onToggle={!finished ? chooseCard : undefined}
          disabled={disabled}
          label="Your Crazy Eights hand"
        />
      </div>
      {!finished && <button type="button" className="games-card-action is-quiet" disabled={disabled} onClick={() => onAction({ type: 'draw' })}>Draw a card</button>}
    </div>
  );
}

function GoFishTable({ hand, state, players, me, disabled, onAction }) {
  const opponents = players.filter(player => player.user_id !== me?.user_id);
  const ranks = window.__lifeos.games.ranksInHand(hand?.cards || []);
  const [targetSeat, setTargetSeat] = useGamesState(opponents[0]?.seat ?? null);
  const [rank, setRank] = useGamesState(ranks[0] || '');
  useGamesEffect(() => {
    if (!opponents.some(player => player.seat === targetSeat)) setTargetSeat(opponents[0]?.seat ?? null);
    if (!ranks.includes(rank)) setRank(ranks[0] || '');
  }, [hand?.cards?.join('|'), players.length]);
  const last = state.lastAction;

  return (
    <div className="games-card-table games-fish-table">
      <div className="games-fish-pond">
        <span>≈</span><strong>{state.deckCount || 0}</strong><small>cards in the pond</small><i>◡</i><i>◠</i>
      </div>
      {last && <p className="games-last-action">{players.find(player => player.seat === last.seat)?.display_name || 'Someone'} asked for {last.rank === 'T' ? '10s' : `${last.rank}s`} · {last.type === 'go-fish' ? 'Go fish!' : `${last.count} card${last.count === 1 ? '' : 's'} handed over`}</p>}
      <div className="games-fish-ask">
        <span>ASK</span>
        <div className="games-target-picker">
          {opponents.map(player => <button key={player.user_id} type="button" className={targetSeat === player.seat ? 'is-active' : ''} onClick={() => setTargetSeat(player.seat)}>{player.display_name}</button>)}
        </div>
        <span>FOR</span>
        <div className="games-rank-picker">
          {ranks.map(value => <button key={value} type="button" className={rank === value ? 'is-active' : ''} onClick={() => setRank(value)}>{value === 'T' ? '10' : value}</button>)}
        </div>
      </div>
      <div className="games-books-row"><span>Your books</span><strong>{hand?.points || 0}</strong><small>of 13</small></div>
      <div className="games-my-hand"><div><span>YOUR HAND</span><strong>{hand?.cards?.length || 0} cards</strong></div><CardFan cards={hand?.cards || []} /></div>
      <button type="button" className="games-card-action" disabled={disabled || targetSeat == null || !rank || state.stage === 'showdown'} onClick={() => onAction({ type: 'ask', targetSeat, rank })}>
        Ask for {rank === 'T' ? '10s' : `${rank}s`}
      </button>
    </div>
  );
}

function CardGameBoard({ type, bundle, me, disabled, onAction }) {
  const props = { hand: bundle.hand, state: bundle.room.state, players: bundle.players, me, disabled, onAction };
  if (type === 'draw-poker') return <PokerTable {...props} />;
  if (type === 'blackjack') return <BlackjackTable {...props} />;
  if (type === 'war') return <WarTable {...props} />;
  if (type === 'crazy-eights') return <CrazyEightsTable {...props} />;
  return <GoFishTable {...props} />;
}

function GameRoom({ bundle, profile, busy, error, message, onMove, onCardAction, onStart, onRestart, onShare, onLeave, onHub }) {
  const { room, players } = bundle;
  const definition = window.__lifeos.games.GAME_DEFINITIONS[room.game_type];
  const isCardGame = CARD_GAME_TYPES.has(room.game_type);
  const currentUserId = profile?.user_id || window.__suvedaUser?.id || 'visual-preview';
  const me = players.find(player => player.user_id === currentUserId) || players[0] || null;
  const turnPlayer = window.__lifeos.games.playerForSeat(players, room.state.turnSeat);
  const winner = room.winner_id
    ? players.find(player => player.user_id === room.winner_id)
    : window.__lifeos.games.playerForSeat(players, room.state.winnerSeat);
  const myTurn = room.status === 'playing' && (room.game_type === 'war' || me?.seat === room.state.turnSeat);
  const isHost = room.owner_id === currentUserId;
  const seats = Array.from({ length: room.max_players }, (_, seat) => players.find(player => player.seat === seat)).filter(Boolean);

  let headline = 'Invite someone to play';
  let subline = 'The board wakes up when a second player joins.';
  if (room.status === 'playing') {
    headline = room.game_type === 'war'
      ? 'Ready, set, flip'
      : myTurn ? 'Your move' : `${turnPlayer?.display_name || 'Your friend'} is thinking`;
    subline = room.game_type === 'war'
      ? 'Turn over your next card when you are ready.'
      : myTurn ? 'The table is yours.' : 'You’ll be up next.';
  } else if (room.status === 'finished') {
    const winners = room.state.winnerSeats || [];
    headline = winner ? `${winner.display_name} wins!` : winners.length > 1 ? 'Shared victory!' : 'Round complete';
    subline = 'Same people, one more round?';
  }

  return (
    <main className={`games-screen games-room games-room-${room.game_type} fade-in`}>
      <header className="games-room-header">
        <button type="button" className="games-back-button" onClick={onHub} aria-label="Back to game night">‹</button>
        <div className="games-room-title">
          <span className="games-page-kicker">LIVE GAME</span>
          <h1>{definition.title}</h1>
        </div>
        <button type="button" className="games-room-code-button" onClick={onShare} aria-label={`Share room ${room.code}`}>
          <small>ROOM</small><strong>{room.code}</strong><span>↗</span>
        </button>
      </header>

      <section className="games-room-stage">
        <div className="games-room-status">
          <div>
            <span className={`games-live-dot${room.status === 'playing' ? ' is-live' : ''}`} />
            <small>{room.status === 'waiting' ? 'WAITING ROOM' : room.status === 'finished' ? 'ROUND COMPLETE' : 'PLAYING LIVE'}</small>
          </div>
          <h2>{headline}</h2>
          <p>{subline}</p>
        </div>

        <div className="games-player-strip">
          {seats.map(player => (
            <GamePlayerAvatar
              key={player.user_id}
              player={player}
              active={room.status === 'playing' && player.seat === room.state.turnSeat}
              current={player.user_id === currentUserId}
              winner={winner?.user_id === player.user_id}
              compact
            />
          ))}
          {players.length < room.max_players && (room.status === 'waiting' || room.game_type === 'memory-match') && (
            <button type="button" className="games-open-seat" onClick={onShare}><span>＋</span><small>Invite</small></button>
          )}
        </div>

        <div className="games-board-wrap">
          {room.status === 'waiting' ? (
            <div className="games-waiting-board">
              <div className="games-waiting-sun"><span>✦</span></div>
              <span className="games-eyebrow">YOUR TABLE IS READY</span>
              <h3>Bring someone in</h3>
              <p>Share <strong>{room.code}</strong> or send the invite link. They’ll appear here as soon as they join.</p>
              <div className="games-waiting-actions">
                <button type="button" onClick={onShare}>Share invite <span>↗</span></button>
                {isCardGame && isHost && players.length >= 2 && (
                  <button type="button" className="is-start" onClick={onStart} disabled={busy}>Deal the cards <span>→</span></button>
                )}
              </div>
              {isCardGame && players.length >= 2 && !isHost && <small className="games-host-note">Waiting for the host to deal.</small>}
            </div>
          ) : room.game_type === 'connect-four' ? (
            <ConnectFourBoard state={room.state} disabled={!myTurn || busy || room.status === 'finished'} onMove={onMove} />
          ) : room.game_type === 'noughts-crosses' ? (
            <NoughtsCrossesBoard state={room.state} disabled={!myTurn || busy || room.status === 'finished'} onMove={onMove} />
          ) : room.game_type === 'memory-match' ? (
            <MemoryBoard state={room.state} disabled={!myTurn || busy || room.status === 'finished'} onMove={onMove} />
          ) : (
            <CardGameBoard type={room.game_type} bundle={bundle} me={me} disabled={!myTurn || busy || room.status === 'finished'} onAction={onCardAction} />
          )}
        </div>

        {room.game_type === 'memory-match' && room.status !== 'waiting' && (
          <div className="games-score-row">
            {players.map(player => <span key={player.user_id}><b>{player.display_name}</b><strong>{room.state.scores?.[player.seat] || 0}</strong></span>)}
          </div>
        )}

        <div className="games-room-actions">
          {room.status === 'finished' ? (
            <button type="button" className="games-primary-action" onClick={onRestart} disabled={busy}>↻ Play again</button>
          ) : (!isCardGame || room.status === 'waiting') && (
            <button type="button" className="games-primary-action" onClick={onShare}>＋ Invite players</button>
          )}
          <details className="games-rules">
            <summary>How to play</summary>
            <p>{definition.rules}</p>
          </details>
          <button type="button" className="games-leave-action" onClick={onLeave} disabled={busy}>Leave room</button>
        </div>

        {(error || message) && <div className={`games-room-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}</div>}
      </section>
    </main>
  );
}

function GamesScreen({ profile, initialCode = '', onBack, demo = false }) {
  const api = window.__suvedaGames;
  const [bundle, setBundle] = useGamesState(null);
  const [busy, setBusy] = useGamesState(false);
  const [error, setError] = useGamesState('');
  const [message, setMessage] = useGamesState('');
  const currentUserId = profile?.user_id || window.__suvedaUser?.id || 'visual-preview';

  useGamesEffect(() => {
    if (!bundle?.room?.id || bundle.room.id < 0 || demo || !api?.subscribe) return undefined;
    return api.subscribe(bundle.room.id, setBundle, nextError => setError(nextError.message));
  }, [api, bundle?.room?.id, demo]);

  useGamesEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.getElementById('root')?.scrollTo({ top: 0, behavior: 'auto' });
  }, [bundle?.room?.id]);

  useGamesEffect(() => {
    if (!initialCode || initialCode.length !== 6 || bundle || demo) return;
    void joinRoom(initialCode);
    // Join links should only run once for this screen mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createRoom(gameType) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = demo ? makeDemoGameBundle(gameType, profile) : await api?.create(gameType);
      if (!next) throw new Error('The room could not be created.');
      setBundle(next);
      void window.__lifeos?.native.notifyHaptic('success');
    } catch (nextError) {
      setError(nextError?.message || 'The room could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(code) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = demo
        ? makeDemoGameBundle('connect-four', profile)
        : await api?.join(code);
      if (!next) throw new Error('That room could not be found.');
      setBundle(next);
      void window.__lifeos?.native.notifyHaptic('success');
    } catch (nextError) {
      setError(nextError?.message || 'That room could not be joined.');
    } finally {
      setBusy(false);
    }
  }

  async function move(value) {
    if (!bundle || busy) return;
    const { room, players } = bundle;
    const me = players.find(player => player.user_id === currentUserId) || players[0];
    if (!me) return;
    const seats = players.map(player => player.seat);

    setBusy(true);
    setError('');
    try {
      const result = room.game_type === 'connect-four'
        ? window.__lifeos.games.playConnectFour(room.state, value, me.seat, seats)
        : room.game_type === 'noughts-crosses'
          ? window.__lifeos.games.playNoughtsCrosses(room.state, value, me.seat, seats)
          : window.__lifeos.games.playMemoryMatch(room.state, value, me.seat, seats);
      const winnerId = result.winnerSeat == null
        ? null
        : players.find(player => player.seat === result.winnerSeat)?.user_id || null;

      if (demo || room.id < 0) {
        setBundle(current => ({
          ...current,
          room: {
            ...current.room,
            state: result.state,
            status: result.status,
            winner_id: winnerId,
            version: current.room.version + 1,
          },
        }));
      } else {
        const next = await api.move({
          roomId: room.id,
          expectedVersion: room.version,
          state: result.state,
          status: result.status,
          winnerId,
        });
        setBundle(next);
      }
      void window.__lifeos?.native.tap('medium');
    } catch (nextError) {
      setError(nextError?.message || 'That move did not land.');
      if (!demo && room.id > 0) {
        try { setBundle(await api.load(room.id)); } catch { /* realtime will retry */ }
      }
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!bundle || busy) return;
    setBusy(true);
    setError('');
    try {
      if (demo || bundle.room.id < 0) {
        setBundle(makeDemoGameBundle(bundle.room.game_type, profile));
      } else {
        setBundle(await api.start(bundle.room.id, bundle.room.version));
      }
      void window.__lifeos?.native.notifyHaptic('success');
    } catch (nextError) {
      setError(nextError?.message || 'The cards could not be dealt.');
    } finally {
      setBusy(false);
    }
  }

  async function cardAction(action) {
    if (!bundle || busy) return;
    setBusy(true);
    setError('');
    try {
      if (demo || bundle.room.id < 0) {
        setMessage('Preview move played · live rooms sync this instantly.');
        setBundle(current => ({
          ...current,
          room: {
            ...current.room,
            version: current.room.version + 1,
            state: {
              ...current.room.state,
              lastAction: action,
              moveCount: (current.room.state.moveCount || 0) + 1,
            },
          },
        }));
      } else {
        setBundle(await api.cardAction({ roomId: bundle.room.id, expectedVersion: bundle.room.version, action }));
      }
      void window.__lifeos?.native.tap('medium');
    } catch (nextError) {
      setError(nextError?.message || 'That card move did not land.');
      if (!demo && bundle.room.id > 0) {
        try { setBundle(await api.load(bundle.room.id)); } catch { /* realtime will retry */ }
      }
    } finally {
      setBusy(false);
    }
  }

  async function restart() {
    if (!bundle || busy) return;
    setBusy(true);
    setError('');
    try {
      if (demo || bundle.room.id < 0) {
        setBundle(makeDemoGameBundle(bundle.room.game_type, profile));
      } else {
        setBundle(await api.restart(bundle.room.id, bundle.room.version));
      }
    } catch (nextError) {
      setError(nextError?.message || 'The rematch could not start.');
    } finally {
      setBusy(false);
    }
  }

  async function shareRoom() {
    if (!bundle) return;
    const url = `${window.location.origin}${window.location.pathname}?game=${bundle.room.code}`;
    const text = `Join my ${window.__lifeos.games.GAME_DEFINITIONS[bundle.room.game_type].title} room in Life OS. Code: ${bundle.room.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Life OS game night', text, url });
        setMessage('Invite shared.');
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setMessage('Invite link copied.');
      }
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(`${text}\n${url}`);
          setMessage('Invite link copied.');
        } catch {
          setError('Copy this room code: ' + bundle.room.code);
        }
      }
    }
  }

  async function leaveRoom() {
    if (!bundle) return;
    setBusy(true);
    try {
      if (!demo && bundle.room.id > 0) await api.leave(bundle.room.id);
      setBundle(null);
      setError('');
      setMessage('');
    } catch (nextError) {
      setError(nextError?.message || 'The room could not be left.');
    } finally {
      setBusy(false);
    }
  }

  const hub = !bundle;
  if (hub) {
    return (
      <GameHub
        initialCode={initialCode}
        onBack={onBack}
        onCreate={createRoom}
        onJoin={joinRoom}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <GameRoom
      bundle={bundle}
      profile={profile}
      busy={busy}
      error={error}
      message={message}
      onMove={move}
      onCardAction={cardAction}
      onStart={start}
      onRestart={restart}
      onShare={shareRoom}
      onLeave={leaveRoom}
      onHub={() => { setBundle(null); setError(''); setMessage(''); }}
    />
  );
}

window.GamesScreen = GamesScreen;

export { GamesScreen };
