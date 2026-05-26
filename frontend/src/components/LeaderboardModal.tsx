import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { LeaderboardEntry } from '../types';

interface Props {
  accessCode: string;
  onClose: () => void;
}

export function LeaderboardModal({ accessCode, onClose }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchLeaderboard = async () => {
    try {
      const data = await api.getLeaderboard(accessCode);
      setEntries(data.entries);
      setLastUpdate(new Date());
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 5000);
    return () => clearInterval(interval);
  }, [accessCode]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden animate-scale-in">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-bold">🏆 Таблица лидеров</h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl"
          >
            ✕
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {loading && entries.length === 0 ? (
            <div className="text-center text-slate-500 py-8">Загрузка...</div>
          ) : entries.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              Пока нет результатов
            </div>
          ) : (
            <ol className="space-y-2">
              {entries.map((entry) => (
                <li 
                  key={entry.student_name} 
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                      entry.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                      entry.rank === 2 ? 'bg-gray-300 text-gray-700' :
                      entry.rank === 3 ? 'bg-orange-300 text-orange-800' :
                      'bg-slate-200 text-slate-600'
                    }`}>
                      {entry.rank}
                    </span>
                    <span className="font-medium">{entry.student_name}</span>
                    {entry.completed_at && (
                      <span className="text-xs text-slate-400">
                        {new Date(entry.completed_at).toLocaleTimeString('ru', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-brand-600">
                      {Math.round(entry.score * 100)}%
                    </span>
                    <div className="text-xs text-slate-400">
                      из {entry.total_questions}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        
        <div className="p-3 border-t bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
          <span>Обновляется каждые 5 сек</span>
          {lastUpdate && (
            <span>Обновлено: {lastUpdate.toLocaleTimeString('ru')}</span>
          )}
        </div>
      </div>
    </div>
  );
}