import React, { useState, useEffect, useMemo } from 'react';
import { User, StaffAttendance, isOwnerOrAdmin } from '../types';
import { db } from '../dbStore';
import { 
  CalendarCheck, Clock, UserCheck, Calendar, DollarSign, 
  CheckCircle2, XCircle, AlertCircle, Edit3, ChevronLeft, 
  ChevronRight, Printer, Download, Users, Plus, Award
} from 'lucide-react';

interface AttendanceModuleProps {
  user: User;
}

export default function AttendanceModule({ user }: AttendanceModuleProps) {
  const [usersList, setUsersList] = useState<User[]>(() => db.getUsers());
  const [attendanceList, setAttendanceList] = useState<StaffAttendance[]>(() => db.getAttendance());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Month navigation (YYYY-MM)
  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const todayDateStr = today.toISOString().split('T')[0];

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedDate, setSelectedDate] = useState<string>(todayDateStr);

  // Salary editing modal
  const [editingStaffSalary, setEditingStaffSalary] = useState<User | null>(null);
  const [newSalaryRate, setNewSalaryRate] = useState<number>(600);

  // Notes modal for attendance
  const [markingStaff, setMarkingStaff] = useState<User | null>(null);
  const [markingStatus, setMarkingStatus] = useState<StaffAttendance['status']>('Present');
  const [markingNotes, setMarkingNotes] = useState<string>('');

  const isOwner = isOwnerOrAdmin(user.role);

  const refreshData = () => {
    setUsersList(db.getUsers());
    setAttendanceList(db.getAttendance());
  };

  useEffect(() => {
    refreshData();
    return db.subscribe(refreshData);
  }, []);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Filter staff members (Managers and staff users)
  const staffMembers = useMemo(() => {
    return usersList.filter(u => u.status === 'Active' && (u.role === 'Manager' || !isOwnerOrAdmin(u.role)));
  }, [usersList]);

  // Fast attendance record lookup: key = `${userId}_${date}`
  const attendanceMap = useMemo(() => {
    const map = new Map<string, StaffAttendance>();
    attendanceList.forEach(att => {
      map.set(`${att.user_id}_${att.date}`, att);
    });
    return map;
  }, [attendanceList]);

  // Handle fast status change for a staff member on selectedDate
  const handleQuickMark = async (staff: User, status: StaffAttendance['status']) => {
    const rate = staff.per_day_salary || 600;
    try {
      await db.markAttendance({
        user_id: staff.id,
        user_name: staff.name,
        date: selectedDate,
        status,
        per_day_salary: rate,
        salary_earned: 0,
        notes: '',
        marked_by: user.name
      }, user);
      triggerToast(`Marked ${staff.name} as ${status} for ${selectedDate}`);
      refreshData();
    } catch (err: any) {
      alert(err.message || "Failed to record attendance");
    }
  };

  const handleSaveSalaryRate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaffSalary) return;
    if (newSalaryRate < 0) {
      alert("Please enter a valid salary rate.");
      return;
    }
    try {
      db.updateStaffSalary(editingStaffSalary.id, newSalaryRate, user);
      triggerToast(`Updated per-day salary for ${editingStaffSalary.name} to ₹${newSalaryRate.toLocaleString('en-IN')}/day`);
      setEditingStaffSalary(null);
      refreshData();
    } catch (err: any) {
      alert(err.message || "Failed to update salary rate");
    }
  };

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  // Get all days of selectedMonth
  const daysInSelectedMonth = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const days: string[] = [];
    for (let i = 1; i <= lastDay; i++) {
      days.push(`${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    }
    return days;
  }, [selectedMonth]);

  // Compute monthly totals per staff member
  const monthlyStaffStats = useMemo(() => {
    return staffMembers.map(staff => {
      const staffMonthRecords = attendanceList.filter(
        att => att.user_id === staff.id && att.date.startsWith(selectedMonth)
      );

      let presentDays = 0;
      let halfDays = 0;
      let absentDays = 0;
      let paidLeaveDays = 0;
      let totalEarnedSalary = 0;

      const rate = staff.per_day_salary || 600;

      staffMonthRecords.forEach(r => {
        if (r.status === 'Present') {
          presentDays += 1;
          totalEarnedSalary += r.salary_earned || rate;
        } else if (r.status === 'Half Day') {
          halfDays += 1;
          totalEarnedSalary += r.salary_earned || (rate * 0.5);
        } else if (r.status === 'Absent') {
          absentDays += 1;
        } else if (r.status === 'Paid Leave') {
          paidLeaveDays += 1;
          totalEarnedSalary += r.salary_earned || rate;
        }
      });

      const effectiveWorkDays = presentDays + (halfDays * 0.5) + paidLeaveDays;

      return {
        staff,
        rate,
        presentDays,
        halfDays,
        absentDays,
        paidLeaveDays,
        effectiveWorkDays,
        totalEarnedSalary,
        recordsCount: staffMonthRecords.length
      };
    });
  }, [staffMembers, attendanceList, selectedMonth]);

  const monthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  const statusBadge = (status?: StaffAttendance['status']) => {
    if (!status) return <span className="text-[10px] text-slate-300 font-bold">&ndash;</span>;
    switch (status) {
      case 'Present':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Present</span>;
      case 'Half Day':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Half Day (0.5)</span>;
      case 'Absent':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Absent</span>;
      case 'Paid Leave':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Paid Leave</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl border border-slate-800 flex items-center gap-3 text-xs font-medium animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 tracking-wider uppercase border border-indigo-100">
              Staff HR & Wages
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
              {monthLabel}
            </span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight mt-2 flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-indigo-600" />
            Manager & Staff Daily Attendance
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Track daily presence, half days, and absences. Fixed per-day wages are automatically computed into the monthly salary breakdown.
          </p>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 hover:bg-white rounded-xl text-slate-600 transition cursor-pointer border border-transparent hover:border-slate-200"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-black text-slate-800 px-3 min-w-[130px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-1.5 hover:bg-white rounded-xl text-slate-600 transition cursor-pointer border border-transparent hover:border-slate-200"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Today's Quick Marking Section */}
      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-indigo-800/60">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Daily Roster Punch</span>
            <h2 className="text-base font-black tracking-tight mt-0.5 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Mark Attendance for Date:
            </h2>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 bg-indigo-950/80 border border-indigo-700/80 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staffMembers.map(staff => {
            const currentAtt = attendanceMap.get(`${staff.id}_${selectedDate}`);
            const rate = staff.per_day_salary || 600;

            return (
              <div key={staff.id} className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/15 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-white">{staff.name}</h3>
                    <p className="text-[10px] text-indigo-200">{staff.role} &bull; ₹{rate.toLocaleString('en-IN')}/day</p>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => {
                        setEditingStaffSalary(staff);
                        setNewSalaryRate(rate);
                      }}
                      className="text-[10px] font-bold text-indigo-300 hover:text-white flex items-center gap-1 hover:underline cursor-pointer"
                      title="Update per-day rate"
                    >
                      <Edit3 className="w-3 h-3" /> Edit Rate
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[11px]">
                  <span className="text-indigo-200">Selected Day Status:</span>
                  {currentAtt ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      currentAtt.status === 'Present' ? 'bg-emerald-400 text-emerald-950' :
                      currentAtt.status === 'Half Day' ? 'bg-amber-300 text-amber-950' :
                      currentAtt.status === 'Absent' ? 'bg-rose-400 text-rose-950' :
                      'bg-blue-300 text-blue-950'
                    }`}>
                      {currentAtt.status}
                    </span>
                  ) : (
                    <span className="text-amber-300 text-[10px] font-bold">Not Marked Yet</span>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  <button
                    onClick={() => handleQuickMark(staff, 'Present')}
                    className={`py-1.5 rounded-lg text-[10px] font-black transition cursor-pointer text-center ${
                      currentAtt?.status === 'Present'
                        ? 'bg-emerald-500 text-white shadow-md'
                        : 'bg-white/15 hover:bg-emerald-500/80 text-white'
                    }`}
                  >
                    Present
                  </button>
                  <button
                    onClick={() => handleQuickMark(staff, 'Half Day')}
                    className={`py-1.5 rounded-lg text-[10px] font-black transition cursor-pointer text-center ${
                      currentAtt?.status === 'Half Day'
                        ? 'bg-amber-500 text-white shadow-md'
                        : 'bg-white/15 hover:bg-amber-500/80 text-white'
                    }`}
                  >
                    Half Day
                  </button>
                  <button
                    onClick={() => handleQuickMark(staff, 'Absent')}
                    className={`py-1.5 rounded-lg text-[10px] font-black transition cursor-pointer text-center ${
                      currentAtt?.status === 'Absent'
                        ? 'bg-rose-500 text-white shadow-md'
                        : 'bg-white/15 hover:bg-rose-500/80 text-white'
                    }`}
                  >
                    Absent
                  </button>
                  <button
                    onClick={() => handleQuickMark(staff, 'Paid Leave')}
                    className={`py-1.5 rounded-lg text-[10px] font-black transition cursor-pointer text-center ${
                      currentAtt?.status === 'Paid Leave'
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-white/15 hover:bg-blue-500/80 text-white'
                    }`}
                  >
                    Paid Leave
                  </button>
                </div>
              </div>
            );
          })}

          {staffMembers.length === 0 && (
            <div className="col-span-full py-8 text-center text-indigo-300 text-xs">
              No staff or manager accounts configured. Create staff accounts in Settings / User Management.
            </div>
          )}
        </div>
      </div>

      {/* Monthly Staff Wage & Attendance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Monthly Attendance & Wage Summary &mdash; {monthLabel}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Accumulated earnings calculated from marked attendance. Owner can adjust daily wage rates at any time.
            </p>
          </div>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shrink-0"
          >
            <Printer className="w-3.5 h-3.5" /> Print Wage Sheet
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5 px-4">Staff Member</th>
                <th className="p-3.5">Daily Rate</th>
                <th className="p-3.5 text-center">Present</th>
                <th className="p-3.5 text-center">Half Day</th>
                <th className="p-3.5 text-center">Absent</th>
                <th className="p-3.5 text-center">Paid Leave</th>
                <th className="p-3.5 text-center">Effective Days</th>
                <th className="p-3.5 text-right pr-4">Total Earned Wage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {monthlyStaffStats.map(({ staff, rate, presentDays, halfDays, absentDays, paidLeaveDays, effectiveWorkDays, totalEarnedSalary }) => (
                <tr key={staff.id} className="hover:bg-slate-50/70 transition">
                  <td className="p-3.5 px-4">
                    <p className="font-bold text-slate-900 text-xs">{staff.name}</p>
                    <p className="text-[10px] text-slate-400">{staff.email} &bull; {staff.role}</p>
                  </td>

                  <td className="p-3.5 font-mono font-bold text-slate-800">
                    ₹{rate.toLocaleString('en-IN')}/day
                  </td>

                  <td className="p-3.5 text-center">
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] border border-emerald-100">
                      {presentDays}
                    </span>
                  </td>

                  <td className="p-3.5 text-center">
                    <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[11px] border border-amber-100">
                      {halfDays}
                    </span>
                  </td>

                  <td className="p-3.5 text-center">
                    <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full text-[11px] border border-rose-100">
                      {absentDays}
                    </span>
                  </td>

                  <td className="p-3.5 text-center">
                    <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-[11px] border border-blue-100">
                      {paidLeaveDays}
                    </span>
                  </td>

                  <td className="p-3.5 text-center font-bold font-mono text-slate-900">
                    {effectiveWorkDays.toFixed(1)} days
                  </td>

                  <td className="p-3.5 text-right pr-4">
                    <span className="font-black text-sm text-emerald-600 font-mono">
                      ₹{totalEarnedSalary.toLocaleString('en-IN')}
                    </span>
                  </td>
                </tr>
              ))}

              {monthlyStaffStats.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No active staff found for this period.
                  </td>
                </tr>
              )}
            </tbody>
            {monthlyStaffStats.length > 0 && (
              <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                <tr>
                  <td colSpan={7} className="p-3.5 px-4 text-slate-700 uppercase tracking-wider text-[11px]">
                    Total Month Wage Liability ({monthLabel})
                  </td>
                  <td className="p-3.5 text-right pr-4 text-emerald-700 font-mono text-base font-black">
                    ₹{monthlyStaffStats.reduce((acc, curr) => acc + curr.totalEarnedSalary, 0).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Edit Salary Modal */}
      {editingStaffSalary && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-indigo-600" />
              Change Per-Day Salary Rate
            </h3>
            <p className="text-xs text-slate-600">
              Set fixed daily wage for <span className="font-bold">{editingStaffSalary.name}</span> ({editingStaffSalary.role}).
            </p>

            <form onSubmit={handleSaveSalaryRate} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Per-Day Salary (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    required
                    value={newSalaryRate}
                    onChange={(e) => setNewSalaryRate(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 text-sm"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Example: 600 means ₹600 for Present day, ₹300 for Half Day.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStaffSalary(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition cursor-pointer shadow-sm"
                >
                  Save Salary Rate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
