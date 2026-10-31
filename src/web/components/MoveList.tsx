import { useEffect, useRef } from 'react';
import type { MoveRecord } from '../../shared/engine/types.js';
import { groupHistory, moveText } from '../format.js';

interface MoveListProps {
  history: MoveRecord[];
}

function MoveCell({ record, isLast }: { record?: MoveRecord; isLast: boolean }) {
  return (
    <span
      className={`move-cell ${record ? `move-${record.color}` : 'move-empty'} ${isLast ? 'is-last' : ''}`}
    >
      {record ? moveText(record) : '—'}
    </span>
  );
}

export default function MoveList({ history }: MoveListProps) {
  const rows = groupHistory(history);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastRecord = history.at(-1);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [history.length]);

  return (
    <section className="move-panel">
      <header className="move-panel-head">
        <h3>棋谱</h3>
        <span>{history.length ? `${Math.ceil(history.length / 2)} 回合` : '未落子'}</span>
      </header>
      <div className="move-table-head">
        <span>回合</span>
        <span>红方</span>
        <span>黑方</span>
      </div>
      <div className="move-scroll" ref={scrollRef}>
        {rows.length === 0 ? (
          <p className="move-empty-hint">棋谱静候第一手。</p>
        ) : (
          rows.map((row) => (
            <div className="move-row" key={row.turn}>
              <span className="move-number">{String(row.turn).padStart(2, '0')}</span>
              <MoveCell record={row.red} isLast={row.red === lastRecord} />
              <MoveCell record={row.black} isLast={row.black === lastRecord} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
