import { useEffect, useMemo, useState } from 'react';
import { FILES, PIECE_LABELS, parseSquare } from '../../shared/engine/notation.js';
import type { Color, PieceType, Square } from '../../shared/engine/types.js';
import type { GameSnapshot } from '../../shared/protocol.js';

const PAD = 50;
const STEP = 100;
const WIDTH = 900;
const HEIGHT = 1000;
const EMPTY_TARGETS = new Set<string>();

interface BoardProps {
  game: GameSnapshot;
  orientation: Color;
  myColor: Color | null;
  busy: boolean;
  onMove: (from: string, to: string) => void;
}

function screenPosition(row: number, col: number, orientation: Color) {
  const screenCol = orientation === 'red' ? col : 8 - col;
  const screenRow = orientation === 'red' ? 9 - row : row;
  const x = PAD + screenCol * STEP;
  const y = PAD + screenRow * STEP;
  return { x, y, cx: x, cy: y };
}

function squareName(row: number, col: number): string {
  return `${FILES[col]}${row}`;
}

function pieceInfo(code: string): { label: string; color: Color; type: PieceType } {
  const color: Color = code === code.toUpperCase() ? 'red' : 'black';
  const type = code.toUpperCase() as PieceType;
  return { label: PIECE_LABELS[color][type], color, type };
}

const PALACE_DIAGONALS: Array<[Square, Square]> = [
  [{ row: 0, col: 3 }, { row: 2, col: 5 }],
  [{ row: 0, col: 5 }, { row: 2, col: 3 }],
  [{ row: 7, col: 3 }, { row: 9, col: 5 }],
  [{ row: 7, col: 5 }, { row: 9, col: 3 }],
];

export default function Board({ game, orientation, myColor, busy, onMove }: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const isMyTurn = Boolean(myColor && !game.result && game.turn === myColor);

  const legalByFrom = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const ucci of game.legalMoves) {
      const from = ucci.slice(0, 2);
      const to = ucci.slice(2, 4);
      const targets = map.get(from) ?? new Set<string>();
      targets.add(to);
      map.set(from, targets);
    }
    return map;
  }, [game.legalMoves]);

  const targets = selected ? (legalByFrom.get(selected) ?? EMPTY_TARGETS) : EMPTY_TARGETS;

  useEffect(() => {
    setSelected(null);
  }, [game.fen, game.turn, game.history.length, game.result]);

  const checkKing = useMemo(() => {
    if (!game.inCheck) return null;
    const kingCode = game.turn === 'red' ? 'K' : 'k';
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        if (game.board[row][col] === kingCode) return { row, col };
      }
    }
    return null;
  }, [game.inCheck, game.board, game.turn]);

  const lastFrom = game.lastMove ? parseSquare(game.lastMove.from) : null;
  const lastTo = game.lastMove ? parseSquare(game.lastMove.to) : null;

  const handleSquare = (row: number, col: number) => {
    if (!isMyTurn || busy) return;
    const name = squareName(row, col);

    if (selected && targets.has(name)) {
      setSelected(null);
      onMove(selected, name);
      return;
    }

    const code = game.board[row][col];
    if (code && pieceInfo(code).color === myColor) {
      setSelected((previous) => (previous === name ? null : name));
      return;
    }

    setSelected(null);
  };

  return (
    <div className="board-wrap">
      <svg
        className="board-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="group"
        aria-label={`中国象棋棋盘，${orientation === 'red' ? '红方' : '黑方'}视角`}
      >
        <defs>
          <linearGradient id="boardWood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ead0a2" />
            <stop offset="0.5" stopColor="#dfbf8b" />
            <stop offset="1" stopColor="#d1ac73" />
          </linearGradient>
          <radialGradient id="pieceFace" cx="38%" cy="30%" r="80%">
            <stop offset="0" stopColor="#fffaf0" />
            <stop offset="0.66" stopColor="#f2dfbd" />
            <stop offset="1" stopColor="#dec094" />
          </radialGradient>
          <filter id="pieceShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#4c2f13" floodOpacity="0.26" />
          </filter>
          <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={WIDTH} height={HEIGHT} rx="18" fill="url(#boardWood)" />
        <rect
          x="26"
          y="26"
          width={WIDTH - 52}
          height={HEIGHT - 52}
          rx="10"
          fill="none"
          stroke="rgba(83, 55, 27, 0.45)"
          strokeWidth="2"
          pointerEvents="none"
        />
        <rect
          x="36"
          y="36"
          width={WIDTH - 72}
          height={HEIGHT - 72}
          rx="6"
          fill="none"
          stroke="rgba(255, 249, 232, 0.3)"
          strokeWidth="1"
          pointerEvents="none"
        />

        <g className="board-grid" pointerEvents="none">
          <rect
            x={PAD}
            y={PAD}
            width={WIDTH - PAD * 2}
            height={HEIGHT - PAD * 2}
            fill="none"
            stroke="rgba(67, 43, 22, 0.7)"
            strokeWidth="3"
          />
          {Array.from({ length: 10 }, (_, screenRow) => (
            <line
              key={`h-${screenRow}`}
              x1={PAD}
              y1={PAD + screenRow * STEP}
              x2={WIDTH - PAD}
              y2={PAD + screenRow * STEP}
            />
          ))}
          <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} />
          <line x1={WIDTH - PAD} y1={PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} />
          {Array.from({ length: 7 }, (_, index) => {
            const x = PAD + (index + 1) * STEP;
            return (
              <g key={`v-${index}`}>
                <line x1={x} y1={PAD} x2={x} y2={HEIGHT / 2 - PAD} />
                <line x1={x} y1={HEIGHT / 2 + PAD} x2={x} y2={HEIGHT - PAD} />
              </g>
            );
          })}
          {PALACE_DIAGONALS.map(([from, to], index) => {
            const a = screenPosition(from.row, from.col, orientation);
            const b = screenPosition(to.row, to.col, orientation);
            return (
              <line key={`palace-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            );
          })}
        </g>

        <g className="board-river" pointerEvents="none">
          <text x="300" y="518">楚河</text>
          <text x="600" y="518">汉界</text>
        </g>

        <g className="board-coords" pointerEvents="none">
          {Array.from({ length: 9 }, (_, screenCol) => {
            const col = orientation === 'red' ? screenCol : 8 - screenCol;
            return (
              <text key={`file-${screenCol}`} x={PAD + screenCol * STEP} y={982}>
                {FILES[col]}
              </text>
            );
          })}
          {Array.from({ length: 10 }, (_, screenRow) => {
            const row = orientation === 'red' ? 9 - screenRow : screenRow;
            return (
              <text key={`rank-${screenRow}`} x="24" y={PAD + screenRow * STEP + 5}>
                {row}
              </text>
            );
          })}
        </g>

        <g className="board-highlights" pointerEvents="none">
          {lastFrom && (
            <circle
              {...screenPosition(lastFrom.row, lastFrom.col, orientation)}
              r="45"
              className="last-move-ring"
            />
          )}
          {lastTo && (
            <circle
              {...screenPosition(lastTo.row, lastTo.col, orientation)}
              r="45"
              className="last-move-ring last-move-to"
            />
          )}
          {selected && (() => {
            const square = parseSquare(selected);
            if (!square) return null;
            const point = screenPosition(square.row, square.col, orientation);
            return <circle {...point} r="47" className="selected-ring" />;
          })()}
        </g>

        <g className="board-pieces" pointerEvents="none">
          {game.board.map((row, rowIndex) =>
            row.map((code, colIndex) => {
              if (!code) return null;
              const point = screenPosition(rowIndex, colIndex, orientation);
              const piece = pieceInfo(code);
              return (
                <g
                  key={`piece-${rowIndex}-${colIndex}`}
                  className={`piece piece-${piece.color}`}
                  transform={`translate(${point.x} ${point.y})`}
                  filter="url(#pieceShadow)"
                >
                  <circle r="41" className="piece-disc" />
                  <circle r="34" className="piece-inner" />
                  <text className="piece-text" textAnchor="middle" dominantBaseline="central">
                    {piece.label}
                  </text>
                </g>
              );
            }),
          )}
        </g>

        {checkKing && (() => {
          const point = screenPosition(checkKing.row, checkKing.col, orientation);
          return <circle {...point} r="46" className="check-ring" pointerEvents="none" />;
        })()}

        <g className="legal-markers" pointerEvents="none">
          {[...targets].map((target) => {
            const square = parseSquare(target);
            if (!square) return null;
            const point = screenPosition(square.row, square.col, orientation);
            const occupied = Boolean(game.board[square.row][square.col]);
            return occupied ? (
              <circle
                key={`legal-${target}`}
                {...point}
                r="44"
                className="legal-capture"
              />
            ) : (
              <circle key={`legal-${target}`} {...point} r="11" className="legal-dot" />
            );
          })}
        </g>

        <g className="board-hits">
          {Array.from({ length: 10 }, (_, row) =>
            Array.from({ length: 9 }, (_, col) => {
              const point = screenPosition(row, col, orientation);
              const name = squareName(row, col);
              const code = game.board[row][col];
              const ownPiece = Boolean(code && pieceInfo(code).color === myColor);
              const canSelect = Boolean(isMyTurn && !busy && ownPiece);
              const canDrop = Boolean(isMyTurn && !busy && targets.has(name));
              const interactive = canSelect || canDrop;
              return (
                <circle
                  key={`hit-${row}-${col}`}
                  {...point}
                  r="46"
                  fill="transparent"
                  pointerEvents="all"
                  style={{ cursor: interactive ? 'pointer' : 'default' }}
                  onClick={() => handleSquare(row, col)}
                >
                  <title>
                    {name}
                    {code ? ` ${pieceInfo(code).label}` : ' 空位'}
                  </title>
                </circle>
              );
            }),
          )}
        </g>
      </svg>
    </div>
  );
}
