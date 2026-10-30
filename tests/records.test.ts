import { describe, expect, it } from 'vitest';
import { addRecord, LEADERBOARD_SIZE, placeOf, rankRuns, readRecords, type RunRecord, scoreRun } from '../src/meta/records';

function run(distance: number, score = distance * 10, date = 0): RunRecord {
  return { distance, kills: 0, seconds: 30, score, seed: 1, cause: 'tide', date };
}

describe('leaderboard', () => {
  it('ranks by distance, then by score', () => {
    const board = rankRuns([run(100, 1000), run(150, 1500), run(100, 1200)]);
    expect(board.map((record) => record.distance)).toEqual([150, 100, 100]);
    expect(board[1]?.score).toBe(1200);
  });

  it('keeps only the top runs', () => {
    let board: RunRecord[] = [];
    for (let i = 1; i <= LEADERBOARD_SIZE + 5; i++) board = addRecord(board, run(i * 10));
    expect(board).toHaveLength(LEADERBOARD_SIZE);
    expect(board[0]?.distance).toBe((LEADERBOARD_SIZE + 5) * 10);
    expect(board[board.length - 1]?.distance).toBe(60);
  });

  it('reports the place of a run that made the board, and none for one that did not', () => {
    const weak = run(5);
    let board: RunRecord[] = [];
    for (let i = 1; i <= LEADERBOARD_SIZE; i++) board = addRecord(board, run(i * 100));
    expect(placeOf(board, weak)).toBeUndefined();
    const strong = run(10_000);
    board = addRecord(board, strong);
    expect(placeOf(board, strong)).toBe(1);
  });

  it('breaks distance ties with kills and time survived', () => {
    expect(scoreRun(100, 3, 60)).toBeGreaterThan(scoreRun(100, 0, 60));
    expect(scoreRun(100, 0, 90)).toBeGreaterThan(scoreRun(100, 0, 30));
  });

  it('reads nothing from something that is not a list', () => {
    expect(readRecords('leaderboard')).toEqual([]);
    expect(readRecords(undefined)).toEqual([]);
  });
});
