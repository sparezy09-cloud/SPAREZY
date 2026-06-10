import { useState, useMemo, useEffect, Fragment } from 'react';
import { Brand, User, TransactionLog } from '../types';
import { db } from '../dbStore';
import { Terminal, ShieldAlert, Eye, EyeOff, Search } from 'lucide-react';

interface TransactionsModuleProps {
  brand: Brand;
  user: User;
}

export default function TransactionsModule({ brand, user }: TransactionsModuleProps) {
  const [search, setSearch] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Fetch audit logs dynamically and reactively
  const [logsList, setLogsList] = useState<TransactionLog[]>(() => db.getLogs());

  useEffect(() => {
    setLogsList(db.getLogs());
    return db.subscribe(() => {
      setLogsList(db.getLogs());
    });
  }, []);

  const filteredLogs = useMemo(() => {
    return logsList.filter(log => {
      const matSearch = log.user_name.toLowerCase().includes(search.toLowerCase()) ||
                        log.module_name.toLowerCase().includes(search.toLowerCase()) ||
                        log.action_type.toLowerCase().includes(search.toLowerCase()) ||
                        log.description.toLowerCase().includes(search.toLowerCase());
      return matSearch;
    });
  }, [logsList, search]);

  const toggleExpandLog = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  // Role Protection
  if (user.role !== 'Owner') {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-2xl max-w-2xl mx-auto space-y-3.5 mt-8 text-xs font-semibold">
        <h3 className="font-extrabold text-base flex items-center gap-2 text-red-950 leading-none">
          <ShieldAlert className="w-5.5 h-5.5" />
          Access Denied &mdash; Owner Credentials Required
        </h3>
        <p className="font-normal text-slate-700 leading-relaxed">
          The global Activity Audit Trails are highly confidential ledger registers. Under Sparezy security Row Level policies, only the supreme **Business Owner** role has access parameters to query these tables.
        </p>
        <p className="text-[10px] text-red-650 uppercase font-black tracking-widest leading-none pt-2">
          Row Level Security: Enforced by public.transaction_logs policy
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-909 tracking-tight flex items-center gap-2">
          <Terminal className="w-5 h-5 text-indigo-650" />
          Global MIS System Audit Trail &amp; Transaction Logs
        </h2>
        <p className="text-sm text-slate-500">
          Trace operational actions, edits on MRP limits, items unarchiving, invoices deleted, and ledger records changes in real-time.
        </p>
      </div>

      {/* Filters Search bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search logs by staff name, target module, description details..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 text-xs font-semibold rounded-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Major table list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        
        <div className="overflow-x-auto text-xs font-semibold text-slate-650">
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider">
              <tr>
                <th className="p-3">Logged Date</th>
                <th className="p-3">Staff Operator</th>
                <th className="p-3">Module Affected</th>
                <th className="p-3">Action Class</th>
                <th className="p-3">Event Detail description</th>
                <th className="p-3 text-right">Data Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-705">
              {filteredLogs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                const hasDataDiff = log.old_data || log.new_data;

                return (
                  <Fragment key={log.id}>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 text-slate-450 font-normal">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="p-3 text-slate-900 font-bold">{log.user_name}</td>
                      <td className="p-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
                          {log.module_name}
                        </span>
                      </td>
                      <td className="p-3 text-indigo-700 font-bold">{log.action_type}</td>
                      <td className="p-3 font-normal text-slate-600 max-w-[280px]">{log.description}</td>
                      <td className="p-3 text-right">
                        {hasDataDiff ? (
                          <button
                            onClick={() => toggleExpandLog(log.id)}
                            className="p-1 px-2 border border-slate-200 hover:border-indigo-400 text-slate-600 hover:text-indigo-700 rounded-lg text-[9px] font-bold cursor-pointer inline-flex items-center gap-1 leading-none"
                          >
                            {isExpanded ? <EyeOff className="w-3" /> : <Eye className="w-3" />}
                            {isExpanded ? 'Hide Data' : 'View Data'}
                          </button>
                        ) : (
                          <span className="text-slate-400 italic text-[10px] pr-2">Static event</span>
                        )}
                      </td>
                    </tr>

                    {/* Expandable JSON Row */}
                    {isExpanded && hasDataDiff && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50 p-4 font-mono text-[10px] leading-relaxed text-slate-700 border-b border-dashed border-slate-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {log.old_data && (
                              <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                                <p className="font-bold text-red-700 uppercase tracking-wide text-[9px]">&larr; DB Record State PRIOR to Event</p>
                                <pre className="whitespace-pre-wrap overflow-x-auto select-all max-h-[180px]">
                                  {JSON.stringify(JSON.parse(log.old_data), null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.new_data && (
                              <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                                <p className="font-bold text-emerald-700 uppercase tracking-wide text-[9px]">&rarr; New DB Record State AFTER Event</p>
                                <pre className="whitespace-pre-wrap overflow-x-auto select-all max-h-[180px]">
                                  {JSON.stringify(JSON.parse(log.new_data), null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 font-normal">
                    No matching activity recorded in security audit pools.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
