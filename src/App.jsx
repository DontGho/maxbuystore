import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Loader2, Home, Sparkles } from 'lucide-react';

function SuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl p-12 max-w-md w-full text-center border border-emerald-100/50">
        <div className="mb-6 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-400 rounded-full blur-xl opacity-50 animate-pulse"></div>
            <div className="relative bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full p-5">
              <CheckCircle size={72} className="text-white" strokeWidth={2.5} />
            </div>
          </div>
        </div>
        
        <h1 className="text-4xl font-bold text-slate-800 mb-3">Payment Complete!</h1>
        <p className="text-slate-600 text-lg mb-2">Thank you for your purchase</p>
        <p className="text-slate-500 mb-8">Your Robux will be delivered within 24 hours</p>
        
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-6 mb-8 border border-emerald-200/50 shadow-sm">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Sparkles size={20} className="text-emerald-500" />
            <p className="text-sm font-semibold text-slate-700">What's Next?</p>
          </div>
          <p className="text-sm text-slate-600 mb-2">Check your email for receipt</p>
          <p className="text-sm text-slate-600">Delivery within 24 hours</p>
        </div>
        
        <a 
          href="/"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-emerald-200/50 hover:shadow-xl hover:shadow-emerald-300/50 hover:-translate-y-0.5"
        >
          <Home size={20} />
          Back to Home
        </a>
      </div>
    </div>
  );
}

function CancelPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl p-12 max-w-md w-full text-center border border-orange-100/50">
        <div className="mb-6 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-orange-400 rounded-full blur-xl opacity-40"></div>
            <div className="relative bg-gradient-to-br from-orange-400 to-amber-500 rounded-full p-5">
              <AlertCircle size={72} className="text-white" strokeWidth={2.5} />
            </div>
          </div>
        </div>
        
        <h1 className="text-4xl font-bold text-slate-800 mb-3">Payment Cancelled</h1>
        <p className="text-slate-600 text-lg mb-2">No charges were made</p>
        <p className="text-slate-500 mb-8">Feel free to try again anytime</p>
        
        <a 
          href="/"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-orange-200/50 hover:shadow-xl hover:shadow-orange-300/50 hover:-translate-y-0.5"
        >
          <Home size={20} />
          Return Home
        </a>
      </div>
    </div>
  );
}

function HomePage() {
  const [u, setU] = useState('');
  const [a, setA] = useState('');
  const [s, setS] = useState('idle');
  const [m, setM] = useState('');
  const [checking, setChecking] = useState(false);
  const [groupStatus, setGroupStatus] = useState('');
  const p = 5.50;

  const checkGroupStatus = async () => {
    if (!u) {
      setGroupStatus('Enter username first');
      return;
    }
    
    setChecking(true);
    setGroupStatus('');
    
    try {
      const r = await fetch(`/api/check-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u })
      });
      
      const d = await r.json();
      
      if (d.success) {
        setGroupStatus('✓ Username verified');
      } else {
        setGroupStatus('✗ ' + d.error);
      }
    } catch (e) {
      setGroupStatus('✗ Error checking username');
    }
    
    setChecking(false);
  };

  const h = async (method) => {
    setS('loading');
    setM('');

    try {
      const r = await fetch(`/api/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, amount: parseInt(a), method })
      });

      const d = await r.json();
      
      if (d.success) {
        window.location.href = d.url;
      } else {
        setS('error');
        setM(d.error);
      }
    } catch (e) {
      setS('error');
      setM('Connection error - try again');
    }
  };

  const t = (parseInt(a) || 0) / 1000 * p;
  const validAmount = parseInt(a) >= 1000;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl p-10 max-w-lg w-full border border-indigo-100/50">
        <div className="text-center mb-10">
          <div className="inline-block mb-4">
            <h1 className="text-6xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent relative">
              MaxBuy
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 blur-2xl opacity-20 -z-10"></div>
            </h1>
          </div>
          <p className="text-slate-700 text-xl font-semibold">${p.toFixed(2)} per 1,000 Robux</p>
          <p className="text-sm text-slate-500 mt-2">Minimum purchase: 1,000 Robux</p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3">
              Roblox Username
            </label>
            <input
              type="text"
              value={u}
              onChange={(e) => {
                setU(e.target.value);
                setGroupStatus('');
              }}
              className="w-full px-5 py-4 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-200 focus:border-indigo-400 transition-all bg-white/80 text-slate-800 placeholder:text-slate-400 shadow-sm"
              placeholder="Enter your username"
            />
            <button
              onClick={checkGroupStatus}
              disabled={checking || !u}
              className="mt-3 w-full bg-gradient-to-r from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 disabled:from-slate-50 disabled:to-slate-100 text-slate-700 font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm border border-slate-200/50"
            >
              {checking ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Verifying...
                </>
              ) : (
                'Verify Username'
              )}
            </button>
            {groupStatus && (
              <p className={`mt-3 text-sm font-semibold ${groupStatus.includes('✓') ? 'text-emerald-600' : 'text-rose-600'}`}>
                {groupStatus}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3">
              Robux Amount
            </label>
            <input
              type="number"
              value={a}
              onChange={(e) => setA(e.target.value)}
              className="w-full px-5 py-4 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-200 focus:border-indigo-400 transition-all bg-white/80 text-slate-800 placeholder:text-slate-400 shadow-sm"
              placeholder="1000"
              min="1000"
              step="100"
            />
            {a && !validAmount && (
              <p className="mt-3 text-sm text-rose-600 font-semibold">Minimum 1,000 Robux required</p>
            )}
          </div>

          {t > 0 && validAmount && (
            <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-200/50 rounded-2xl p-6 shadow-md">
              <p className="text-sm text-slate-600 font-medium mb-1">Total Amount</p>
              <p className="text-4xl font-black text-slate-800">
                ${t.toFixed(2)}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-4">
            <button
              onClick={() => h('stripe')}
              disabled={s === 'loading' || !u || !validAmount}
              className="bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed text-white font-bold py-5 rounded-2xl transition-all shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:shadow-indigo-300/60 hover:-translate-y-1"
            >
              {s === 'loading' ? 'Processing...' : 'Card'}
            </button>
            
            <button
              onClick={() => h('paypal')}
              disabled={s === 'loading' || !u || !validAmount}
              className="bg-gradient-to-br from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed text-white font-bold py-5 rounded-2xl transition-all shadow-lg shadow-blue-200/50 hover:shadow-xl hover:shadow-blue-300/60 hover:-translate-y-1"
            >
              {s === 'loading' ? 'Processing...' : 'PayPal'}
            </button>
          </div>

          {m && (
            <div className={`flex items-center gap-3 p-5 rounded-2xl border-2 shadow-md ${
              s === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}>
              {s === 'success' ? <CheckCircle size={26} /> : <AlertCircle size={26} />}
              <p className="font-semibold">{m}</p>
            </div>
          )}
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200">
          <p className="text-sm text-slate-500 text-center font-medium">
            Instant delivery • Secure payment • 24/7 support
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState('home');

  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/success') {
      setPage('success');
    } else if (path === '/cancel') {
      setPage('cancel');
    } else {
      setPage('home');
    }
  }, []);

  if (page === 'success') return <SuccessPage />;
  if (page === 'cancel') return <CancelPage />;
  return <HomePage />;
}