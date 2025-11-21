import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function App() {
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
        setGroupStatus('✓ You are in the group');
      } else {
        setGroupStatus('✗ ' + d.error);
      }
    } catch (e) {
      setGroupStatus('✗ Error checking group');
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">MaxBuy</h1>
          <p className="text-gray-600 text-lg">${p.toFixed(2)} per 1,000 Robux</p>
          <p className="text-sm text-gray-500 mt-1">Minimum: 1,000 Robux</p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Roblox Username
            </label>
            <input
              type="text"
              value={u}
              onChange={(e) => {
                setU(e.target.value);
                setGroupStatus('');
              }}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              placeholder="Enter your username"
            />
            <button
              onClick={checkGroupStatus}
              disabled={checking || !u}
              className="mt-2 w-full bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 font-medium py-2 rounded-lg transition flex items-center justify-center gap-2"
            >
              {checking ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Checking...
                </>
              ) : (
                'Check Group Status'
              )}
            </button>
            {groupStatus && (
              <p className={`mt-2 text-sm ${groupStatus.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>
                {groupStatus}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Robux Amount
            </label>
            <input
              type="number"
              value={a}
              onChange={(e) => setA(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              placeholder="1000"
              min="1000"
              step="100"
            />
            {a && !validAmount && (
              <p className="mt-2 text-sm text-red-600">Minimum 1,000 Robux required</p>
            )}
          </div>

          {t > 0 && validAmount && (
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-4">
              <p className="text-2xl font-bold text-purple-900">
                Total: ${t.toFixed(2)}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-2">
            <button
              onClick={() => h('stripe')}
              disabled={s === 'loading' || !u || !validAmount}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition shadow-lg hover:shadow-xl"
            >
              {s === 'loading' ? 'Processing...' : 'Card'}
            </button>
            
            <button
              onClick={() => h('paypal')}
              disabled={s === 'loading' || !u || !validAmount}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition shadow-lg hover:shadow-xl"
            >
              {s === 'loading' ? 'Processing...' : 'PayPal'}
            </button>
          </div>

          {m && (
            <div className={`flex items-center gap-3 p-4 rounded-xl ${
              s === 'success' ? 'bg-green-50 text-green-800 border-2 border-green-200' : 'bg-red-50 text-red-800 border-2 border-red-200'
            }`}>
              {s === 'success' ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
              <p className="font-medium">{m}</p>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500 text-center">
            Fast delivery • No tax fees • Group payout
          </p>
        </div>
      </div>
    </div>
  );
}