import React, { useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function App() {
  const [u, setU] = useState('');
  const [a, setA] = useState('');
  const [s, setS] = useState('idle');
  const [m, setM] = useState('');
  const p = 5.50;

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
      setM('Request failed');
    }
  };

  const t = (parseInt(a) || 0) / 1000 * p;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">MaxBuy Robux</h1>
        <p className="text-gray-600 mb-6">${p.toFixed(2)} per 1,000 Robux</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Roblox Username</label>
            <input type="text" value={u} onChange={(e) => setU(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="Enter username" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Robux Amount</label>
            <input type="number" value={a} onChange={(e) => setA(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="1000" min="1000" step="100" />
          </div>

          {t > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-lg font-semibold text-blue-900">Total: ${t.toFixed(2)}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => h('stripe')} disabled={s === 'loading' || !u || !a} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg">Pay with Card</button>
            <button onClick={() => h('paypal')} disabled={s === 'loading' || !u || !a} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg">Pay with PayPal</button>
          </div>

          {m && (
            <div className={`flex items-center gap-2 p-4 rounded-lg ${s === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {s === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              <p>{m}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}