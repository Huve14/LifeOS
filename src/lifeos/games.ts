export type BoardGameType = 'connect-four' | 'noughts-crosses' | 'memory-match';
export type CardGameType = 'draw-poker' | 'blackjack' | 'war' | 'crazy-eights' | 'go-fish';
export type GameType = BoardGameType | CardGameType;
export type GameStatus = 'waiting' | 'playing' | 'finished';
export type PlayingCard = string;

export type ConnectFourState = {
  board: Array<number | null>;
  turnSeat: number;
  winnerSeat: number | null;
  moveCount: number;
};

export type NoughtsCrossesState = ConnectFourState;

export type MemoryMatchState = {
  deck: string[];
  revealed: number[];
  matched: number[];
  scores: number[];
  turnSeat: number;
  winnerSeat: number | null;
  moveCount: number;
};

export type CardGameState = {
  turnSeat: number | null;
  winnerSeat: number | null;
  winnerSeats?: number[];
  stage: string;
  moveCount: number;
  handCounts?: number[];
  scores?: number[];
  deckCount?: number;
  dealerCards?: PlayingCard[];
  dealerHidden?: boolean;
  topCard?: PlayingCard | null;
  currentSuit?: CardSuit | null;
  lastAction?: Record<string, unknown> | null;
  lastBattle?: Record<string, PlayingCard> | null;
  readySeats?: number[];
  revealedHands?: Record<string, PlayingCard[]>;
  results?: Record<string, string>;
};

export type GameState = ConnectFourState | MemoryMatchState | CardGameState;

export type MoveResult<TState extends GameState> = {
  state: TState;
  status: Extract<GameStatus, 'playing' | 'finished'>;
  winnerSeat: number | null;
};

export const GAME_DEFINITIONS = {
  'connect-four': {
    title: 'Connect Four',
    shortTitle: 'Four',
    description: 'Drop sunshine into the grid and connect four before your friend.',
    players: '2 players',
    duration: '5–10 min',
    icon: '●',
    family: 'board',
    maxPlayers: 2,
    rules: 'Take turns dropping a piece into a column. Connect four horizontally, vertically, or diagonally to win.',
  },
  'noughts-crosses': {
    title: 'Noughts & Crosses',
    shortTitle: 'Noughts',
    description: 'The fastest little duel in the room. Three in a row wins.',
    players: '2 players',
    duration: '2–5 min',
    icon: '✕',
    family: 'board',
    maxPlayers: 2,
    rules: 'Take turns claiming a square. The first person with three in a row wins.',
  },
  'memory-match': {
    title: 'Memory Match',
    shortTitle: 'Memory',
    description: 'Flip UAE-inspired pairs, remember the board, and collect the most.',
    players: '2–6 players',
    duration: '5–12 min',
    icon: '✦',
    family: 'board',
    maxPlayers: 6,
    rules: 'Flip two cards on your turn. A matching pair scores a point and earns another turn. Most pairs wins.',
  },
  'draw-poker': {
    title: 'Five-card Poker',
    shortTitle: 'Poker',
    description: 'A friendly five-card draw table with one secret swap and a proper showdown.',
    players: '2–6 players',
    duration: '8–15 min',
    icon: '♠',
    family: 'cards',
    maxPlayers: 6,
    rules: 'Each player gets five private cards. On your turn, replace up to three cards or keep your hand. Best poker hand wins at the showdown.',
  },
  blackjack: {
    title: 'Blackjack',
    shortTitle: 'Blackjack',
    description: 'Take on the house together. Get closer to 21 than the dealer without going over.',
    players: '2–6 players',
    duration: '5–10 min',
    icon: '21',
    family: 'cards',
    maxPlayers: 6,
    rules: 'Hit to take another card or stand to hold. Aces count as 1 or 11. Beat the dealer without going over 21.',
  },
  war: {
    title: 'War',
    shortTitle: 'War',
    description: 'Flip together, compare ranks, and collect the most victories across the deck.',
    players: '2 players',
    duration: '5–8 min',
    icon: '⚔',
    family: 'cards',
    maxPlayers: 2,
    rules: 'Both players tap Flip. The higher card wins the round and scores a point. Most points after the deck is finished wins.',
  },
  'crazy-eights': {
    title: 'Crazy Eights',
    shortTitle: 'Crazy 8s',
    description: 'Match the suit or rank, turn an eight wild, and race to empty your hand.',
    players: '2–4 players',
    duration: '10–20 min',
    icon: '8',
    family: 'cards',
    maxPlayers: 4,
    rules: 'Play a card matching the top card’s suit or rank. Eights are wild and choose the next suit. First empty hand wins.',
  },
  'go-fish': {
    title: 'Go Fish',
    shortTitle: 'Go Fish',
    description: 'Ask for a rank, make books of four, and enjoy the gentlest bluff at the table.',
    players: '2–4 players',
    duration: '10–20 min',
    icon: '≈',
    family: 'cards',
    maxPlayers: 4,
    rules: 'Ask another player for a rank already in your hand. Collect all four suits to score a book. Most books wins.',
  },
} as const;

export const CARD_GAME_TYPES: CardGameType[] = ['draw-poker', 'blackjack', 'war', 'crazy-eights', 'go-fish'];

export function isCardGameType(type: GameType): type is CardGameType {
  return CARD_GAME_TYPES.includes(type as CardGameType);
}

export function maxPlayersForGame(type: GameType): number {
  return GAME_DEFINITIONS[type].maxPlayers;
}

const MEMORY_CARDS = ['sun', 'shell', 'coffee', 'camera', 'palm', 'star'];

function shuffled<T>(values: T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function createInitialGameState(type: GameType, random = Math.random): GameState {
  if (type === 'memory-match') {
    return {
      deck: shuffled([...MEMORY_CARDS, ...MEMORY_CARDS], random),
      revealed: [],
      matched: [],
      scores: [0, 0, 0, 0, 0, 0],
      turnSeat: 0,
      winnerSeat: null,
      moveCount: 0,
    } satisfies MemoryMatchState;
  }

  if (isCardGameType(type)) {
    const state: CardGameState = {
      stage: 'waiting',
      turnSeat: 0,
      winnerSeat: null,
      moveCount: 0,
      handCounts: Array(6).fill(0),
      scores: Array(6).fill(0),
      deckCount: 0,
    };
    if (type === 'blackjack') {
      state.dealerCards = [];
      state.dealerHidden = true;
    }
    if (type === 'crazy-eights') {
      state.topCard = null;
      state.currentSuit = null;
    }
    if (type === 'war') state.readySeats = [];
    return state;
  }

  return {
    board: Array(type === 'connect-four' ? 42 : 9).fill(null),
    turnSeat: 0,
    winnerSeat: null,
    moveCount: 0,
  } satisfies ConnectFourState;
}

export const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const CARD_SUITS = ['S', 'H', 'D', 'C'] as const;
export type CardRank = typeof CARD_RANKS[number];
export type CardSuit = typeof CARD_SUITS[number];

export function cardRank(card: PlayingCard): CardRank {
  return card.slice(0, -1) as CardRank;
}

export function cardSuit(card: PlayingCard): CardSuit {
  return card.slice(-1) as CardSuit;
}

export function cardSuitSymbol(suit: CardSuit): string {
  return ({ S: '♠', H: '♥', D: '♦', C: '♣' } as const)[suit];
}

export function cardRankLabel(rank: CardRank): string {
  return rank === 'T' ? '10' : rank;
}

export function cardLabel(card: PlayingCard): string {
  return `${cardRankLabel(cardRank(card))}${cardSuitSymbol(cardSuit(card))}`;
}

export function cardColor(card: PlayingCard): 'red' | 'black' {
  const suit = cardSuit(card);
  return suit === 'H' || suit === 'D' ? 'red' : 'black';
}

export function blackjackValue(cards: PlayingCard[]): number {
  let total = 0;
  let aces = 0;
  cards.forEach((card) => {
    const rank = cardRank(card);
    if (rank === 'A') {
      total += 11;
      aces += 1;
    } else if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') {
      total += 10;
    } else {
      total += Number(rank);
    }
  });
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function rankValue(rank: CardRank): number {
  return CARD_RANKS.indexOf(rank) + 2;
}

export function pokerHandScore(cards: PlayingCard[]): number[] {
  if (cards.length !== 5) return [-1];
  const values = cards.map(card => rankValue(cardRank(card))).toSorted((a, b) => b - a);
  const counts = new Map<number, number>();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  const groups = [...counts.entries()].toSorted((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = new Set(cards.map(cardSuit)).size === 1;
  const unique = [...new Set(values)];
  const wheel = unique.join(',') === '14,5,4,3,2';
  const straight = unique.length === 5 && (values[0] - values[4] === 4 || wheel);
  const straightHigh = wheel ? 5 : values[0];

  if (straight && flush) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...values];
  if (straight) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map(([value]) => value).toSorted((a, b) => b - a)];
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].toSorted((a, b) => b - a);
    return [2, ...pairs, groups[2][0]];
  }
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map(([value]) => value).toSorted((a, b) => b - a)];
  return [0, ...values];
}

export function pokerHandName(cards: PlayingCard[]): string {
  return ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'][pokerHandScore(cards)[0]] || 'Five cards';
}

export function canPlayCrazyEight(card: PlayingCard, topCard: PlayingCard, currentSuit: CardSuit): boolean {
  return cardRank(card) === '8' || cardRank(card) === cardRank(topCard) || cardSuit(card) === currentSuit;
}

export function ranksInHand(cards: PlayingCard[]): CardRank[] {
  return [...new Set(cards.map(cardRank))].toSorted((a, b) => rankValue(b) - rankValue(a));
}

function normalizedSeats(seats: number[]): number[] {
  const available = Array.from(new Set(seats.filter(seat => Number.isInteger(seat) && seat >= 0 && seat <= 5)));
  return available.length > 0 ? available.toSorted((a, b) => a - b) : [0, 1];
}

function nextSeat(current: number, seats: number[]): number {
  const order = normalizedSeats(seats);
  const currentIndex = order.indexOf(current);
  return order[(currentIndex + 1 + order.length) % order.length];
}

function assertTurn(turnSeat: number, seat: number) {
  if (turnSeat !== seat) throw new Error('Wait for your turn.');
}

function hasLine(board: Array<number | null>, seat: number, rows: number, columns: number, target: number): boolean {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (board[row * columns + column] !== seat) continue;
      for (const [rowStep, columnStep] of directions) {
        let matches = 1;
        for (let offset = 1; offset < target; offset += 1) {
          const nextRow = row + rowStep * offset;
          const nextColumn = column + columnStep * offset;
          if (
            nextRow < 0 || nextRow >= rows || nextColumn < 0 || nextColumn >= columns ||
            board[nextRow * columns + nextColumn] !== seat
          ) break;
          matches += 1;
        }
        if (matches === target) return true;
      }
    }
  }
  return false;
}

export function playConnectFour(
  current: ConnectFourState,
  column: number,
  seat: number,
  seats: number[] = [0, 1],
): MoveResult<ConnectFourState> {
  assertTurn(current.turnSeat, seat);
  if (!Number.isInteger(column) || column < 0 || column > 6) throw new Error('Choose a column on the board.');

  const board = [...current.board];
  let destination = -1;
  for (let row = 5; row >= 0; row -= 1) {
    const index = row * 7 + column;
    if (board[index] == null) {
      destination = index;
      break;
    }
  }
  if (destination < 0) throw new Error('That column is full.');

  board[destination] = seat;
  const moveCount = current.moveCount + 1;
  const winnerSeat = hasLine(board, seat, 6, 7, 4) ? seat : null;
  const finished = winnerSeat != null || moveCount >= 42;

  return {
    state: {
      board,
      moveCount,
      winnerSeat,
      turnSeat: finished ? seat : nextSeat(seat, seats),
    },
    status: finished ? 'finished' : 'playing',
    winnerSeat,
  };
}

export function playNoughtsCrosses(
  current: NoughtsCrossesState,
  index: number,
  seat: number,
  seats: number[] = [0, 1],
): MoveResult<NoughtsCrossesState> {
  assertTurn(current.turnSeat, seat);
  if (!Number.isInteger(index) || index < 0 || index > 8) throw new Error('Choose a square on the board.');
  if (current.board[index] != null) throw new Error('That square is already taken.');

  const board = [...current.board];
  board[index] = seat;
  const moveCount = current.moveCount + 1;
  const winnerSeat = hasLine(board, seat, 3, 3, 3) ? seat : null;
  const finished = winnerSeat != null || moveCount >= 9;

  return {
    state: {
      board,
      moveCount,
      winnerSeat,
      turnSeat: finished ? seat : nextSeat(seat, seats),
    },
    status: finished ? 'finished' : 'playing',
    winnerSeat,
  };
}

export function playMemoryMatch(
  current: MemoryMatchState,
  cardIndex: number,
  seat: number,
  seats: number[] = [0, 1],
): MoveResult<MemoryMatchState> {
  assertTurn(current.turnSeat, seat);
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= current.deck.length) {
    throw new Error('Choose a card on the board.');
  }
  if (current.matched.includes(cardIndex)) throw new Error('That pair is already yours.');

  // A mismatched pair stays visible until the next player chooses a card, so
  // everyone online gets time to see and remember it.
  const visible = current.revealed.length >= 2 ? [] : [...current.revealed];
  if (visible.includes(cardIndex)) throw new Error('Choose a different card.');
  visible.push(cardIndex);

  let revealed = visible;
  let matched = [...current.matched];
  const scores = [...current.scores];
  let turnSeat = seat;

  if (visible.length === 2) {
    const [first, second] = visible;
    if (current.deck[first] === current.deck[second]) {
      matched = [...matched, first, second].toSorted((a, b) => a - b);
      scores[seat] = (scores[seat] || 0) + 1;
      revealed = [];
    } else {
      turnSeat = nextSeat(seat, seats);
    }
  }

  const finished = matched.length === current.deck.length;
  const activeScores = normalizedSeats(seats).map(activeSeat => ({ seat: activeSeat, score: scores[activeSeat] || 0 }));
  const bestScore = Math.max(...activeScores.map(entry => entry.score));
  const leaders = activeScores.filter(entry => entry.score === bestScore);
  const winnerSeat = finished && leaders.length === 1 ? leaders[0].seat : null;

  return {
    state: {
      ...current,
      revealed,
      matched,
      scores,
      turnSeat,
      winnerSeat,
      moveCount: current.moveCount + 1,
    },
    status: finished ? 'finished' : 'playing',
    winnerSeat,
  };
}

export function playerForSeat<T extends { seat: number }>(players: T[], seat: number | null): T | null {
  if (seat == null) return null;
  return players.find(player => player.seat === seat) ?? null;
}
