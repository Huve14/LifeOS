import { describe, expect, it } from 'vitest';
import {
  blackjackValue,
  canPlayCrazyEight,
  cardLabel,
  createInitialGameState,
  pokerHandName,
  pokerHandScore,
  playConnectFour,
  playMemoryMatch,
  playNoughtsCrosses,
  ranksInHand,
  type ConnectFourState,
  type MemoryMatchState,
} from './games';

describe('Life OS games', () => {
  it('drops Connect Four pieces to the lowest free space and rotates turns', () => {
    const initial = createInitialGameState('connect-four') as ConnectFourState;
    const first = playConnectFour(initial, 3, 0);
    const second = playConnectFour(first.state, 3, 1);

    expect(first.state.board[38]).toBe(0);
    expect(second.state.board[31]).toBe(1);
    expect(second.state.turnSeat).toBe(0);
  });

  it('detects horizontal Connect Four wins', () => {
    const state: ConnectFourState = {
      board: Array(42).fill(null),
      turnSeat: 0,
      winnerSeat: null,
      moveCount: 6,
    };
    state.board.splice(35, 3, 0, 0, 0);

    const result = playConnectFour(state, 3, 0);
    expect(result.status).toBe('finished');
    expect(result.winnerSeat).toBe(0);
  });

  it('detects Noughts & Crosses wins and rejects occupied squares', () => {
    const state: ConnectFourState = {
      board: [0, 0, null, 1, 1, null, null, null, null],
      turnSeat: 0,
      winnerSeat: null,
      moveCount: 4,
    };
    const result = playNoughtsCrosses(state, 2, 0);
    expect(result.status).toBe('finished');
    expect(result.winnerSeat).toBe(0);
    expect(() => playNoughtsCrosses(state, 0, 0)).toThrow('already taken');
  });

  it('scores Memory matches and lets the same player continue', () => {
    const state: MemoryMatchState = {
      deck: ['sun', 'sun', 'star', 'star'],
      revealed: [0],
      matched: [],
      scores: [0, 0, 0, 0, 0, 0],
      turnSeat: 0,
      winnerSeat: null,
      moveCount: 1,
    };

    const result = playMemoryMatch(state, 1, 0, [0, 1]);
    expect(result.state.matched).toEqual([0, 1]);
    expect(result.state.scores[0]).toBe(1);
    expect(result.state.turnSeat).toBe(0);
  });

  it('keeps a Memory mismatch visible and advances to the next active seat', () => {
    const state: MemoryMatchState = {
      deck: ['sun', 'star', 'sun', 'star'],
      revealed: [0],
      matched: [],
      scores: [0, 0, 0, 0, 0, 0],
      turnSeat: 0,
      winnerSeat: null,
      moveCount: 1,
    };

    const mismatch = playMemoryMatch(state, 1, 0, [0, 2]);
    expect(mismatch.state.revealed).toEqual([0, 1]);
    expect(mismatch.state.turnSeat).toBe(2);

    const next = playMemoryMatch(mismatch.state, 2, 2, [0, 2]);
    expect(next.state.revealed).toEqual([2]);
  });

  it('values blackjack aces as 11 or 1 without busting unnecessarily', () => {
    expect(blackjackValue(['AS', 'KH'])).toBe(21);
    expect(blackjackValue(['AS', 'AH', '9D'])).toBe(21);
    expect(blackjackValue(['AS', '9H', '5C'])).toBe(15);
  });

  it('ranks standard five-card poker hands and handles the wheel straight', () => {
    expect(pokerHandName(['TS', 'JS', 'QS', 'KS', 'AS'])).toBe('Straight flush');
    expect(pokerHandName(['9S', '9H', '9D', '9C', '2S'])).toBe('Four of a kind');
    expect(pokerHandName(['AS', '2H', '3D', '4C', '5S'])).toBe('Straight');
    expect(pokerHandScore(['2S', '2H', 'KD', '9C', '5S'])[0]).toBe(1);
  });

  it('recognizes legal Crazy Eights plays and formats cards accessibly', () => {
    expect(canPlayCrazyEight('8C', 'QH', 'H')).toBe(true);
    expect(canPlayCrazyEight('4H', 'QH', 'H')).toBe(true);
    expect(canPlayCrazyEight('QS', 'QH', 'H')).toBe(true);
    expect(canPlayCrazyEight('4S', 'QH', 'H')).toBe(false);
    expect(cardLabel('TH')).toBe('10♥');
  });

  it('returns each rank once for Go Fish controls', () => {
    expect(ranksInHand(['2S', '2H', 'AD', 'KC'])).toEqual(['A', 'K', '2']);
  });
});
