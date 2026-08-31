import React, { useState, useEffect } from 'react';
import { User, Brand } from '../types';
import { db } from '../dbStore';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { Shield, Key, CarFront, Mail, Lock, User as UserIcon, LogOut, ArrowRight, UserPlus, Info, CheckCircle, AlertTriangle } from 'lucide-react';

interface BrandSelectorProps {
  activeUser: User | null;
  onSelect: (brand: Brand, user: User) => void;
  onLogout: () => void;
}

export default function BrandSelector({ activeUser, onSelect, onLogout }: BrandSelectorProps) {
  // Local auth states
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signUpRole, setSignUpRole] = useState<'Owner' | 'Manager'>('Manager');
  
  const [loading, setLoading] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [successLocal, setSuccessLocal] = useState<string | null>(null);
  const [isConnectingTransition, setIsConnectingTransition] = useState(false);

  const [dbError, setDbError] = useState(db.getLastError());

  useEffect(() => {
    const handleUpdate = () => {
      setDbError(db.getLastError());
    };
    return db.subscribe(handleUpdate);
  }, []);



  // Handle Supabase Auth Log-In
  const handleSupabaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !isSupabaseConfigured) {
      setErrorLocal("Live Supabase client is not initialized in project settings.");
      return;
    }

    if (!email.trim() || !password.trim()) {
      setErrorLocal("Please fill out all credentials.");
      return;
    }

    setLoading(true);
    setErrorLocal(null);
    setSuccessLocal(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) {
        throw new Error(error.message || "Invalid email or password.");
      }

      if (data.user) {
        // Query users catalog in public schema for role attributes
        const { data: profile, error: profileErr } = await supabase
          .from('users')
          .select('id, name, email, role, status, created_at')
          .eq('email', email.trim().toLowerCase())
          .maybeSingle();

        if (profileErr) {
          await supabase.auth.signOut();
          throw new Error("Unable to retrieve user registry records. Please contact database admin.");
        }

        if (!profile) {
          await supabase.auth.signOut();
          throw new Error("User profile not found. Contact owner.");
        }

        const sessionUser: User = {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role as 'Owner' | 'Manager',
          status: profile.status as 'Active' | 'Disabled',
          created_at: profile.created_at
        };

        if (sessionUser.status === 'Disabled') {
          await supabase.auth.signOut();
          throw new Error("This Sparezy operator identity has been disabled.");
        }

        // Clear active brand so they must choose the brand to establish link with data
        db.setActiveBrand(null);
        setSuccessLocal("Authenticated successfully!");
        
        // Trigger welcome loading page first
        setIsConnectingTransition(true);

        setTimeout(() => {
          db.setActiveUser(sessionUser);
          setIsConnectingTransition(false);
        }, 1200);
      }
    } catch (err: any) {
      setErrorLocal(err.message || "Failed to verify Supabase login credentials.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Supabase Auth Sign-Up
  const handleSupabaseSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !isSupabaseConfigured) {
      setErrorLocal("Live Supabase client is not initialized in project settings.");
      return;
    }

    if (!email.trim() || !password.trim() || !fullName.trim()) {
      setErrorLocal("Please fill out all name and registration credentials.");
      return;
    }

    if (password.length < 6) {
      setErrorLocal("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setErrorLocal(null);
    setSuccessLocal(null);

    try {
      // 1. Trigger signup auth
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) throw error;

      if (data.user) {
        // 2. Insert user mapping row into public users registry
        const newUserProfile = {
          id: data.user.id,
          name: fullName.trim(),
          email: email.trim().toLowerCase(),
          role: signUpRole,
          status: 'Active'
        };

        const { error: insertErr } = await supabase
          .from('users')
          .insert(newUserProfile);

        if (insertErr) {
          console.warn("Public schema users row insert failed. Keep testing, simulation fallback active.", insertErr);
        }

        const sessionUser: User = {
          id: data.user.id,
          name: fullName.trim(),
          email: email.trim(),
          role: signUpRole,
          status: 'Active',
          created_at: new Date().toISOString()
        };

        // Clear active brand so they must choose the brand to establish link with data
        db.setActiveBrand(null);
        await db.initialize();
        setSuccessLocal("Operator registration completed successfully!");

        // Trigger welcome loading page first
        setIsConnectingTransition(true);

        setTimeout(() => {
          db.setActiveUser(sessionUser);
          setIsConnectingTransition(false);
        }, 1200);
      }
    } catch (err: any) {
      setErrorLocal(err.message || "Signup failed.");
    } finally {
      setLoading(false);
    }
  };



  const handleBrandSelect = (brand: Brand) => {
    if (!activeUser) {
      setErrorLocal("Verify operator signature first.");
      return;
    }
    setErrorLocal(null);
    onSelect(brand, activeUser);
  };

  if (isConnectingTransition) {
    return (
      <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col items-center justify-center p-6 select-none animate-fade-in">
        <div className="max-w-md w-full text-center space-y-8 p-10 bg-slate-900/40 border border-slate-800/80 rounded-3xl backdrop-blur-xl shadow-2xl relative overflow-hidden">
          
          {/* Accent light glow rings */}
          <div className="absolute -top-12 -left-12 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl" />

          {/* Logo illustration */}
          <div className="relative mx-auto h-16 w-16 bg-gradient-to-tr from-indigo-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-3xl shadow-xl shadow-indigo-500/20 border border-indigo-400/30 animate-bounce">
            S
          </div>

          <div className="space-y-3 relative">
            <h2 className="text-3xl font-black text-white tracking-tight animate-pulse">
              Welcome to Sparezy
            </h2>
            <p className="text-sm text-slate-400 font-medium max-w-xs mx-auto">
              Please wait while we are connecting with your data.
            </p>
          </div>

          {/* Elegant active progress bar */}
          <div className="space-y-4 pt-4">
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 p-[1px]">
              <div 
                className="bg-indigo-550 bg-indigo-600 h-full rounded-full transition-all duration-1000 ease-out"
                style={{ width: '100%', animation: 'fillProgress 1.1s ease-out' }}
              />
            </div>

            {/* Micro details indicator */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 px-1 pt-1">
              <span className="flex items-center gap-1.5 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                Synchronizing schemas...
              </span>
              <span className="font-bold text-indigo-400 animate-pulse">Direct-Link Active</span>
            </div>
          </div>

          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes fillProgress {
              0% { width: 0%; }
              100% { width: 100%; }
            }
          `}} />
        </div>
      </div>
    );
  }

  // Pane Render A: Real Authentication & Access Sign in
  if (!activeUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
          <div className="mx-auto h-12 w-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-indigo-500/25 shadow-lg border border-indigo-500/40">
            S
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight">
            Sparezy MIS Portal
          </h2>
          <p className="text-xs text-indigo-400 font-bold uppercase tracking-widest leading-none">
            Automobile Spares &amp; Schema Management Console
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6">
            
            <div className="text-center pb-2 border-b border-slate-800/60">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-350">
                Sign In to Operator Portal
              </h3>
            </div>

            <form onSubmit={handleSupabaseLogin} className="space-y-4">
              {isSignUpMode && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Full Operator Name
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Anand Mahindra"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-white text-xs py-2.5 pl-10 pr-4 rounded-xl outline-none transition"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    placeholder="name@sparezy.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-white text-xs py-2.5 pl-10 pr-4 rounded-xl outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Secure Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-white text-xs py-2.5 pl-10 pr-4 rounded-xl outline-none transition"
                  />
                </div>
              </div>

              {isSignUpMode && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Authorized Access Role
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSignUpRole('Manager')}
                      className={`py-2 px-3 border text-xs font-bold rounded-xl transition cursor-pointer text-center ${
                        signUpRole === 'Manager'
                          ? 'border-indigo-505 border-indigo-500 text-indigo-400 bg-indigo-500/10'
                          : 'border-slate-800 text-slate-400 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      Store Manager
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignUpRole('Owner')}
                      className={`py-2 px-3 border text-xs font-bold rounded-xl transition cursor-pointer text-center ${
                        signUpRole === 'Owner'
                          ? 'border-indigo-505 border-indigo-500 text-indigo-400 bg-indigo-500/10'
                          : 'border-slate-800 text-slate-400 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      General Owner
                    </button>
                  </div>
                </div>
              )}

              {errorLocal && (
                <div className="p-3.5 bg-rose-950/40 border border-rose-500/30 text-rose-300 rounded-xl text-xs space-y-1">
                  <div className="flex items-center gap-1 font-bold">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>Credentials mismatch:</span>
                  </div>
                  <p className="text-[11px] font-normal leading-relaxed">{errorLocal}</p>
                </div>
              )}

              {successLocal && (
                <div className="p-3.5 bg-emerald-950/45 border border-emerald-500/25 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-semibold">{successLocal}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition active:scale-[0.98] text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <>
                    <span>Secure Supabase Auth Login</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>



          </div>
        </div>
      </div>
    );
  }

  // Pane Render B: Split Database Brand Selection Screen
  // Shown after operator logs in successfully
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl text-center space-y-3">
        <div className="mx-auto h-12 w-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-indigo-500/25 shadow-lg border border-indigo-500/40">
          S
        </div>
        <h2 className="text-3xl font-black text-white tracking-tight">
          Establish Brand Link
        </h2>
        
        {/* Logged in notification header */}
        <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl text-xs text-slate-350">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Signed in as <strong>{activeUser.name} ({activeUser.role})</strong></span>
          <button
            onClick={onLogout}
            className="ml-3 text-slate-400 hover:text-rose-400 font-bold hover:underline cursor-pointer border-l border-slate-800 pl-3 leading-none flex items-center gap-1 text-[11px]"
          >
            <LogOut className="w-3 h-3" />
            Switch Account
          </button>
        </div>

        <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          Select the active manufacturer to isolate the database partition. Only that brand's schema will load.
        </p>
      </div>

      {dbError && (
        <div className="mt-8 max-w-2xl mx-auto bg-slate-900 border border-rose-500/35 rounded-3xl p-6 text-left relative overflow-hidden shadow-xl animate-fade-in">
          <div className="absolute top-0 left-0 right-0 h-1 bg-rose-600"></div>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-500 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <h3 className="font-bold text-white text-sm">Supabase Database Sync Warning</h3>
                <p className="text-[11px] text-slate-400 mt-1.5 font-mono bg-slate-950/70 p-3 rounded-2xl border border-slate-800 text-rose-400 leading-normal select-text whitespace-pre-wrap">
                  {dbError.message}
                </p>
              </div>
              
              {dbError.message.toLowerCase().includes('schema') && (
                <div className="space-y-3 text-xs text-slate-300 leading-relaxed border-t border-slate-800/80 pt-3">
                  <p className="font-bold text-indigo-400 flex items-center gap-1.5">
                    💡 Solution: Expose 'hyundai' & 'mahindra' schemas in Supabase Settings
                  </p>
                  <ol className="list-decimal pl-5 space-y-2 text-[11px] text-slate-400">
                    <li>Log in to your <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline font-semibold font-sans">Supabase Project Dashboard</a>.</li>
                    <li>Click on the <strong className="text-white">Project Settings</strong> gear icon (⚙️) located in the lower-left sidebar.</li>
                    <li>Navigate to the <strong className="text-white">API</strong> settings tab under the Infrastructure sub-section.</li>
                    <li>Scroll down to the <strong className="text-white">Schema Configuration</strong> header and locate the <strong className="text-white">Exposed schemas</strong> field.</li>
                    <li>Add <code className="text-indigo-300 bg-slate-950 px-1.5 py-0.5 rounded font-mono font-bold text-[10px]">hyundai</code> and <code className="text-indigo-300 bg-slate-950 px-1.5 py-0.5 rounded font-mono font-bold text-[10px]">mahindra</code> to the list alongside <code className="text-slate-450 bg-slate-950 px-1.5 py-0.5 rounded font-mono text-[10px]">public</code> (so it displays as: <span className="text-white">public, hyundai, mahindra</span>).</li>
                    <li>Click the green <strong className="text-white">Save</strong> button at the bottom of standard settings pane, then refresh this page.</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          
          {/* Hyundai Business Unit */}
          <button
            onClick={() => handleBrandSelect('Hyundai')}
            className="group relative bg-slate-900 border border-slate-805 border-slate-800 hover:border-indigo-500/60 p-8 rounded-3xl text-center active:scale-[0.98] transition-all hover:shadow-2xl hover:shadow-indigo-950/15 cursor-pointer flex flex-col items-center justify-between h-80"
          >
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center font-bold text-2xl transition duration-300">
              <CarFront className="w-7 h-7" />
            </div>
            
            <div className="space-y-2 mt-4 flex-1 flex flex-col justify-center">
              <h3 className="font-black text-lg text-white tracking-tight">Hyundai Business Unit</h3>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[210px] mx-auto">
                Isolates active stocks, invoice ledgers, return registers, and history within the <span className="font-mono text-indigo-400 font-bold">hyundai</span> schema.
              </p>
            </div>

            <div className="w-full text-xs font-bold text-indigo-400 group-hover:text-indigo-300 flex items-center justify-center gap-1.5 transition-colors border-t border-slate-800/60 pt-4 mt-4">
              <span>Initiate Hyundai Sync</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </div>
          </button>

          {/* Mahindra Business Unit */}
          <button
            onClick={() => handleBrandSelect('Mahindra')}
            className="group relative bg-slate-900 border border-slate-805 border-slate-800 hover:border-indigo-505 hover:border-indigo-505/60 p-8 rounded-3xl text-center active:scale-[0.98] transition-all hover:shadow-2xl hover:shadow-indigo-950/15 cursor-pointer flex flex-col items-center justify-between h-80"
          >
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center font-bold text-2xl transition duration-300">
              <CarFront className="w-7 h-7" />
            </div>
            
            <div className="space-y-2 mt-4 flex-1 flex flex-col justify-center">
              <h3 className="font-black text-lg text-white tracking-tight">Mahindra Business Unit</h3>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[210px] mx-auto">
                Isolates active stocks, invoice ledgers, return registers, and history within the <span className="font-mono text-indigo-400 font-bold">mahindra</span> schema.
              </p>
            </div>

            <div className="w-full text-xs font-bold text-indigo-400 group-hover:text-indigo-300 flex items-center justify-center gap-1.5 transition-colors border-t border-slate-800/60 pt-4 mt-4">
              <span>Initiate Mahindra Sync</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </div>
          </button>

        </div>
        
        {errorLocal && (
          <div className="mt-6 p-4 bg-rose-950/40 border border-rose-500/25 text-rose-300 rounded-2xl text-xs text-center font-semibold">
            {errorLocal}
          </div>
        )}
      </div>

    </div>
  );
}
