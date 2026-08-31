import React, { useState } from 'react';
import { Brand, User, UserRole } from '../types';
import { db } from '../dbStore';
import { Shield, ShieldAlert, Plus, CheckCircle, ShieldCheck, Mail, LogIn, Sparkles, X, Database, Activity, RefreshCw, Eye, EyeOff, Key, Pencil } from 'lucide-react';

interface SettingsModuleProps {
  brand: Brand;
  user: User;
}

export default function SettingsModule({ brand, user }: SettingsModuleProps) {
  const [usersList, setUsersList] = useState<User[]>(() => db.getUsers());
  
  // Password edit and view states
  const [editingUserForPassword, setEditingUserForPassword] = useState<User | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  
  // Create state
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formUserId, setFormUserId] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('Manager');
  const [toastMessageLocal, setToastMessageLocal] = useState<string | null>(null);

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const runDiagnostics = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const { testSupabaseConnection } = await import('../lib/supabaseClient');
      const res = await testSupabaseConnection(brand);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        connected: false,
        message: "Failed to load test runner.",
        error: err.message
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const refreshComponentData = async () => {
    try {
      if (db.isSupabaseConfigured()) {
        const latest = await db.fetchUsers();
        setUsersList(latest);
      } else {
        setUsersList(db.getUsers());
      }
    } catch (err) {
      setUsersList(db.getUsers());
    }
  };

  React.useEffect(() => {
    refreshComponentData();
    return db.subscribe(() => {
      setUsersList(db.getUsers());
    });
  }, []);

  const triggerToast = (msg: string) => {
    setToastMessageLocal(msg);
    setTimeout(() => setToastMessageLocal(null), 3000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formUserId || !formPassword || !formEmail) {
      alert("Please provide the staff member name, user ID, password, and email address.");
      return;
    }

    if (usersList.some(u => u.id.trim().toLowerCase() === formUserId.trim().toLowerCase())) {
      alert("A user with this custom User ID already exists. Choose a unique User ID.");
      return;
    }

    if (usersList.some(u => u.email.trim().toLowerCase() === formEmail.trim().toLowerCase())) {
      alert("A user with this email address already holds credentials.");
      return;
    }

    try {
      await db.addUser(formName, formEmail, formRole, user, formUserId, formPassword);
      
      // Clean form fields
      setFormName('');
      setFormEmail('');
      setFormUserId('');
      setFormPassword('');
      setFormRole('Manager');
      setIsNewUserModalOpen(false);

      await refreshComponentData();
      triggerToast(`Account created for ${formName} successfully registered!`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleUserStatus = async (uId: string) => {
    try {
      await db.toggleUserStatus(uId, user);
      await refreshComponentData();
      triggerToast("Changed account login accessibility.");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateRole = async (uId: string, role: UserRole) => {
    try {
      await db.updateUserRole(uId, role, user);
      await refreshComponentData();
      triggerToast(`Updated operator credentials level to ${role}`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdatePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserForPassword) return;
    setPasswordError(null);
    if (!newPasswordValue.trim()) {
      setPasswordError("Password cannot be blank.");
      return;
    }
    if (newPasswordValue.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    try {
      await db.updateUserPassword(editingUserForPassword.id, newPasswordValue, user);
      setEditingUserForPassword(null);
      setNewPasswordValue('');
      await refreshComponentData();
      triggerToast(`Successfully updated password for ${editingUserForPassword.name}.`);
    } catch (err: any) {
      setPasswordError(err.message || "Failed to update password.");
    }
  };

  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  return (
    <div className="space-y-6">

      {/* Local Toast alerts */}
      {toastMessageLocal && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-bounce mt-25">
          <CheckCircle className="w-4.5 h-4.5 text-emerald-400" />
          {toastMessageLocal}
        </div>
      )}

      {/* Head */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-909 tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-650" />
            MIS System Settings &amp; Authorized User Registry
          </h2>
          <p className="text-sm text-slate-500">
            Define system credentials, disable inactive managers, alter roles, and review RLS configurations.
          </p>
        </div>

        {user.role === 'Owner' && (
          <button
            onClick={() => setIsNewUserModalOpen(true)}
            className="bg-indigo-650 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md transition self-start cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Staff Member
          </button>
        )}
      </div>

      {/* MANAGER VIEW RESTRICTION NOTE */}
      {user.role !== 'Owner' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl flex items-start gap-2.5 max-w-3xl text-xs font-semibold">
          <ShieldAlert className="w-4.5 h-4.5 text-amber-650 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-950">Manager Limitations Dashboard Active</p>
            <p className="font-normal text-slate-700 mt-1">
              As a **Manager**, your permissions are safety-capped under owner regulations. You have read access across general catalogs of active parts, customer/bill listings, and manual invoice imports under the brand schema, but you cannot delete logs, change other accounts, or see raw audit streams.
            </p>
          </div>
        </div>
      )}

      {/* List Box Users */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Users list box - spans 2 columns */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden lg:col-span-2">
          <div className="p-4 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-800 text-xs uppercase tracking-wider">
            Staff Members Login Ledger
          </div>

          <div className="overflow-x-auto text-xs font-semibold text-slate-650">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-100/50 text-slate-500 uppercase text-[9px] tracking-wider">
                <tr>
                  <th className="p-3">Staff Operator</th>
                  <th className="p-3">Email Address</th>
                  <th className="p-3">System Role</th>
                  <th className="p-3">Login status</th>
                  {user.role === 'Owner' && <th className="p-3">Sign-In Password</th>}
                  {user.role === 'Owner' && <th className="p-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-705">
                {usersList.map((usr) => (
                  <tr key={usr.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-slate-900 flex items-center gap-1.5">
                      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-black text-xs uppercase">
                        {usr.name[0]}
                      </div>
                      <div>
                        <p>{usr.name}</p>
                        <span className="text-[9px] text-slate-400 font-normal">ID: {usr.id}</span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-500 font-mono font-normal">{usr.email}</td>
                    <td className="p-3">
                      {user.role === 'Owner' && usr.id !== user.id ? (
                        <select
                          className="bg-slate-50 p-1 rounded-lg border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-650 cursor-pointer"
                          value={usr.role}
                          onChange={(e) => handleUpdateRole(usr.id, e.target.value as UserRole)}
                        >
                          <option value="Owner">Owner</option>
                          <option value="Manager">Manager</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center gap-1 font-bold ${
                          usr.role === 'Owner' ? 'text-indigo-605' : 'text-slate-600'
                        }`}>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {usr.role}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        usr.status === 'Active' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-red-50 text-red-700 border border-red-150'
                      }`}>
                        {usr.status}
                      </span>
                    </td>
                    
                    {user.role === 'Owner' && (
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-850">
                            {visiblePasswords[usr.id] ? (usr.password || '••••••••') : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(usr.id)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer flex items-center justify-center"
                            title={visiblePasswords[usr.id] ? "Hide Password" : "Show Password"}
                          >
                            {visiblePasswords[usr.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUserForPassword(usr);
                              setNewPasswordValue(usr.password || '');
                              setPasswordError(null);
                            }}
                            className="p-1 hover:bg-indigo-50 rounded text-indigo-600 cursor-pointer flex items-center justify-center"
                            title="Change Password"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                    
                    {user.role === 'Owner' && (
                      <td className="p-3 text-right">
                        {usr.id !== user.id ? (
                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(usr.id)}
                            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition ${
                              usr.status === 'Active' 
                                ? 'bg-red-50 text-red-700 border-red-150 hover:bg-red-600 hover:text-white' 
                                : 'bg-emerald-50 text-emerald-700 border-emerald-150 hover:bg-emerald-600 hover:text-white'
                            }`}
                          >
                            {usr.status === 'Active' ? 'Disable Account' : 'Re-Enable'}
                          </button>
                        ) : (
                          <span className="text-slate-400 italic text-[10px] pr-2">Your Profile</span>
                        )}
                      </td>
                    )}

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info card row level policies security panel */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs font-semibold text-slate-705">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Active Supabase Row Level Security (RLS)
          </h3>
          
          <div className="space-y-3 font-normal text-slate-600 leading-relaxed text-[11px]">
            <p>
              Supabase enforces cryptographic server-side limits on all schema actions. Each query is checked under JWT authentication before executing.
            </p>
            
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-1 bg-white p-1 rounded border border-slate-200">
                <span className="text-[10px] uppercase font-black text-indigo-700 shrink-0">Policy 1:</span>
                <span className="font-mono text-[9px] text-slate-800 font-bold overflow-hidden">owner_full_control_users</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">
                Enables complete READ, INSERT, UPDATE, and DELETE power on users table with Owner credentials.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-1 bg-white p-1 rounded border border-slate-200">
                <span className="text-[10px] uppercase font-black text-indigo-700 shrink-0">Policy 2:</span>
                <span className="font-mono text-[9px] text-slate-800 font-bold overflow-hidden">manager_select_users</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">
                Restricts standard Managers to READ-ONLY select privileges on active user tables.
              </p>
            </div>
          </div>
        </div>

        {/* Supabase Connection test card */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xl space-y-4 text-xs font-semibold border border-slate-800">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <h3 className="font-bold text-indigo-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
              Live Database Integration Diagnostics
            </h3>
            <button
              onClick={async () => {
                setTestingConnection(true);
                try {
                  await db.loadBrandData(brand);
                  setToastMessageLocal("Diagnostics re-run successfully!");
                } catch (e) {
                  // error logged automatically
                } finally {
                  setTestingConnection(false);
                }
              }}
              disabled={testingConnection}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 bg-slate-800 hover:bg-slate-750 px-2.5 py-1 rounded-lg transition disabled:opacity-40 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
              Re-run Tests
            </button>
          </div>

          <div className="space-y-4 font-normal text-slate-300 leading-relaxed text-[11px]">
            {/* 1. Authenticated User & Active Schema Info Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5">
                <p className="text-[9px] uppercase font-black text-indigo-400 tracking-wider">Authenticated User</p>
                <p className="font-mono text-[10px] font-bold text-white truncate mt-1">
                  {db.getDiagnostics().activeUserEmail || user.email || 'Anonymous / Off-session user'}
                </p>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5">
                <p className="text-[9px] uppercase font-black text-indigo-400 tracking-wider">Active Schema Isolation</p>
                <div className="flex items-center gap-1 mt-1 font-bold text-white uppercase text-[10px]">
                  <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{brand}</span>
                </div>
              </div>
            </div>

            {/* Health Status Card Grid (Requirement 10) */}
            <div className="bg-slate-950/80 rounded-2xl p-4 border border-indigo-500/20 space-y-3 shadow-inner">
              <h4 className="text-[10px] uppercase font-black text-indigo-300 tracking-wider flex items-center gap-1.5 leading-none">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                Integration Health Status
              </h4>
              <div className="grid grid-cols-2 gap-3 mt-1 text-[10px]">
                {/* Auth Status */}
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 flex items-center justify-between gap-1">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-black">Auth Status</span>
                    <span className="font-mono text-white truncate max-w-[90px] block mt-0.5 font-bold">
                      {db.getDiagnostics().activeUserEmail || user.email ? 'Connected' : 'No Session'}
                    </span>
                  </div>
                  {(db.getDiagnostics().activeUserEmail || user.email) ? (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/30">
                      ACTIVE
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-slate-800 text-slate-400 text-slate-101 border border-slate-700/20">
                      DISABLED
                    </span>
                  )}
                </div>

                {/* Database Status */}
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 flex items-center justify-between gap-1">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-black">Database Status</span>
                    <span className="font-mono text-white block mt-0.5 capitalize font-bold">
                      {(!db.isSupabaseConfigured() ? 'Disabled' : db.getConnectionStatus())}
                    </span>
                  </div>
                  {!db.isSupabaseConfigured() ? (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-slate-800 text-slate-400 text-slate-101 border border-slate-700/20">
                      DISABLED
                    </span>
                  ) : db.getConnectionStatus() === 'connected' ? (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/30">
                      CONNECTED
                    </span>
                  ) : db.getConnectionStatus() === 'checking' ? (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-amber-950/80 text-amber-400 border border-amber-900/30 animate-pulse">
                      CHECKING
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-rose-950/80 text-rose-400 border border-rose-900/30">
                      FAILED
                    </span>
                  )}
                </div>

                {/* Schema Status */}
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 flex items-center justify-between gap-1">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-black">Schema Status</span>
                    <span className="font-mono text-white block mt-0.5 font-bold">
                      {db.isInventoryAccessSuccessful(brand) ? 'Exposed' : 'Failed'}
                    </span>
                  </div>
                  {db.isInventoryAccessSuccessful(brand) ? (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/30">
                      SYNCED
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-rose-950/80 text-rose-400 border border-rose-900/30">
                      RESTRICTED
                    </span>
                  )}
                </div>

                {/* Realtime Status */}
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 flex items-center justify-between gap-1">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-black">Realtime Status</span>
                    <span className="font-mono text-white block mt-0.5 font-bold">
                      {db.getDiagnostics().realtimeStatus || 'Disabled'}
                    </span>
                  </div>
                  {db.getDiagnostics().realtimeStatus === 'Connected' ? (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/30">
                      CONNECTED
                    </span>
                  ) : db.getDiagnostics().realtimeStatus === 'Checking' ? (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-amber-950/80 text-amber-400 border border-amber-900/30 animate-pulse">
                      CHECKING
                    </span>
                  ) : db.getDiagnostics().realtimeStatus === 'Failed' ? (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-rose-950/80 text-rose-400 border border-rose-900/30">
                      FAILED
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded font-black text-[8px] bg-slate-800 text-slate-400 text-slate-101 border border-slate-700/20">
                      DISABLED
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Test status checklist explicitly requested by Requirement 5 */}
            <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-white">
              <p className="text-[10px] uppercase font-black text-indigo-300 tracking-wider">Endpoint Verification Checklist</p>

              {/* Startup schema select() diagnostic */}
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded-xl">
                <span>1. Schema Discovery (SELECT current_schema()):</span>
                {db.getDiagnostics().currentSchemaError ? (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-amber-950/80 text-amber-400 border border-amber-900/30">
                    FAILED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/30">
                    {db.getDiagnostics().currentSchemaResult ? `OK (${db.getDiagnostics().currentSchemaResult})` : 'PASSED'}
                  </span>
                )}
              </div>
              {db.getDiagnostics().currentSchemaError && (
                <p className="text-[9px] text-rose-300 pl-3 leading-snug font-mono select-text bg-black/40 p-1.5 rounded">
                  Reason: {db.getDiagnostics().currentSchemaError}
                </p>
              )}

              {/* Inventory Access Test */}
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded-xl">
                <span>2. Inventory Access Test:</span>
                {db.getDiagnostics().inventoryTest.success === null ? (
                  <span className="text-slate-550 text-[10px] italic">No active pull</span>
                ) : db.getDiagnostics().inventoryTest.success ? (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/30">
                    PASSED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-rose-950/80 text-rose-400 border border-rose-900/30">
                    FAILED
                  </span>
                )}
              </div>
              {db.getDiagnostics().inventoryTest.success === false && db.getDiagnostics().inventoryTest.error && (
                <p className="text-[9px] text-rose-300 pl-3 leading-snug font-mono select-text bg-black/40 p-1.5 rounded">
                  Reason: {db.getDiagnostics().inventoryTest.error}
                </p>
              )}

              {/* Sales Access Test */}
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded-xl">
                <span>3. Sales Access Test:</span>
                {db.getDiagnostics().salesTest.success === null ? (
                  <span className="text-slate-555 text-[10px] italic">No active pull</span>
                ) : db.getDiagnostics().salesTest.success ? (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/30">
                    PASSED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-rose-950/80 text-rose-400 border border-rose-900/30">
                    FAILED
                  </span>
                )}
              </div>
              {db.getDiagnostics().salesTest.success === false && db.getDiagnostics().salesTest.error && (
                <p className="text-[9px] text-rose-300 pl-3 leading-snug font-mono select-text bg-black/40 p-1.5 rounded">
                  Reason: {db.getDiagnostics().salesTest.error}
                </p>
              )}

              {/* Purchase Access Test */}
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded-xl">
                <span>4. Purchase Access Test:</span>
                {db.getDiagnostics().purchaseTest.success === null ? (
                  <span className="text-slate-555 text-[10px] italic">No active pull</span>
                ) : db.getDiagnostics().purchaseTest.success ? (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/30">
                    PASSED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-rose-950/80 text-rose-400 border border-rose-900/30">
                    FAILED
                  </span>
                )}
              </div>
              {db.getDiagnostics().purchaseTest.success === false && db.getDiagnostics().purchaseTest.error && (
                <p className="text-[9px] text-rose-300 pl-3 leading-snug font-mono select-text bg-black/40 p-1.5 rounded">
                  Reason: {db.getDiagnostics().purchaseTest.error}
                </p>
              )}

              {/* MRP History Access Test */}
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded-xl">
                <span>5. MRP History Access Test:</span>
                {db.getDiagnostics().mrpHistoryTest.success === null ? (
                  <span className="text-slate-555 text-[10px] italic">No active pull</span>
                ) : db.getDiagnostics().mrpHistoryTest.success ? (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/30">
                    PASSED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-rose-950/80 text-rose-400 border border-rose-900/30">
                    FAILED
                  </span>
                )}
              </div>
              {db.getDiagnostics().mrpHistoryTest.success === false && db.getDiagnostics().mrpHistoryTest.error && (
                <p className="text-[9px] text-rose-300 pl-3 leading-snug font-mono select-text bg-black/40 p-1.5 rounded">
                  Reason: {db.getDiagnostics().mrpHistoryTest.error}
                </p>
              )}

               {/* Bulk Update History Access Test */}
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded-xl">
                <span>6. Bulk Update History Access Test:</span>
                {db.getDiagnostics().bulkUpdateHistoryTest.success === null ? (
                  <span className="text-slate-555 text-[10px] italic">No active pull</span>
                ) : db.getDiagnostics().bulkUpdateHistoryTest.success ? (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/30">
                    PASSED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-rose-950/80 text-rose-400 border border-rose-900/30">
                    FAILED
                  </span>
                )}
              </div>
              {db.getDiagnostics().bulkUpdateHistoryTest.success === false && db.getDiagnostics().bulkUpdateHistoryTest.error && (
                <p className="text-[9px] text-rose-300 pl-3 leading-snug font-mono select-text bg-black/40 p-1.5 rounded">
                  Reason: {db.getDiagnostics().bulkUpdateHistoryTest.error}
                </p>
              )}

              {/* Returns Access Test */}
              <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded-xl">
                <span>7. Returns Access Test:</span>
                {db.getDiagnostics().returnsTest.success === null ? (
                  <span className="text-slate-555 text-[10px] italic">No active pull</span>
                ) : db.getDiagnostics().returnsTest.success ? (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/30">
                    PASSED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded font-black text-[9px] bg-rose-950/80 text-rose-400 border border-rose-900/30">
                    FAILED
                  </span>
                )}
              </div>
              {db.getDiagnostics().returnsTest.success === false && db.getDiagnostics().returnsTest.error && (
                <p className="text-[9px] text-rose-300 pl-3 leading-snug font-mono select-text bg-black/40 p-1.5 rounded">
                  Reason: {db.getDiagnostics().returnsTest.error}
                </p>
              )}
            </div>

            {/* Helper steps if any test fails */}
            {(!db.isInventoryAccessSuccessful(brand) || !db.isInventoryAccessSuccessful(brand === 'Hyundai' ? 'Mahindra' : 'Hyundai')) && (
              <div className="bg-slate-950/85 p-4 rounded-xl text-[10px] leading-relaxed text-indigo-300 border border-indigo-900/40 mt-3 space-y-2 font-normal">
                <p className="font-black text-indigo-200 uppercase tracking-wide flex items-center gap-1 text-[10px]">
                  🔧 Active Solution: Expose Schemas &amp; Grant Access
                </p>
                <p>
                  Sparezy accesses brand isolation states on separate postgres dynamic schemas. If the tests above display permission or schema failures:
                </p>
                <ol className="list-decimal pl-4 space-y-1.5 text-slate-350 text-[10px]">
                  <li>Go to your <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-indigo-455 hover:underline font-bold">Supabase Project Settings</a> &amp; select the <strong className="text-white">API</strong> page.</li>
                  <li>In <strong className="text-white">Exposed schemas</strong> settings, add <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded font-mono font-bold">hyundai</code> and <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded font-mono font-bold">mahindra</code> alongside <code className="text-slate-400">public</code>.</li>
                  <li>Execute the schema permissions script: <code className="text-indigo-300 font-mono">/supabase_schema_permissions.sql</code> in your Supabase SQL Editor.</li>
                </ol>
              </div>
            )}
            
          </div>
        </div>
      </div>

      {/* NEW USER MODAL PANEL */}
      {isNewUserModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden text-xs">
            
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Add Staff Member Credentials</h3>
              <button 
                onClick={() => setIsNewUserModalOpen(false)}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4 font-semibold text-slate-700">
              
              <div>
                <label className="block text-slate-500 mb-1">Staff Member Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Joginder Pal Singh"
                  className="w-full p-2.5 border border-slate-200 rounded-xl"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Custom User ID (Login Alphanumeric ID)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. joginder_pal"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-xs"
                  value={formUserId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormUserId(val);
                    // Helpfully auto-default email syntax
                    setFormEmail(`${val.trim().toLowerCase().replace(/\s+/g, '')}@sparezy.com`);
                  }}
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Secure Sign-In Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full p-2.5 border border-slate-200 rounded-xl"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Email Address (Sign-In Identity)
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. joginder.manager@sparezy.com"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-xs"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Select Access Permission Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Owner', 'Manager'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setFormRole(r)}
                      className={`p-2 rounded-xl text-center border transition ${
                        formRole === r
                          ? 'border-indigo-650 bg-indigo-50/50 text-indigo-900 font-bold'
                          : 'border-slate-200 text-slate-600 bg-white hover:border-slate-350'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsNewUserModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow cursor-pointer text-center"
                >
                  Create login
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Password Edit Modal */}
      {editingUserForPassword && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-slate-200 overflow-hidden text-xs">
            
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-indigo-600" />
                <span>Change Operator Password</span>
              </h3>
              <button 
                onClick={() => setEditingUserForPassword(null)}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdatePasswordSubmit} className="p-5 space-y-4 font-semibold text-slate-700">
              <div>
                <p className="text-slate-500 mb-1">Operator Name:</p>
                <p className="text-slate-900 font-bold mb-3">{editingUserForPassword.name} ({editingUserForPassword.role})</p>
                <p className="text-[10px] text-slate-400 font-normal">System ID: {editingUserForPassword.id}</p>
              </div>

              {passwordError && (
                <div className="p-3 bg-red-50 border border-red-250 text-red-700 rounded-xl text-[11px] font-semibold leading-relaxed">
                  {passwordError}
                </div>
              )}

              <div>
                <label className="block text-slate-500 mb-1">Enter New Password</label>
                <input
                  type="text"
                  required
                  placeholder="At least 6 characters"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-xs focus:ring-1 focus:ring-indigo-600 focus:outline-none"
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                />
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingUserForPassword(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow cursor-pointer text-center font-bold"
                >
                  Update Password
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
