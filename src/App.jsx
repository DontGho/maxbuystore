import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, ExternalLink } from 'lucide-react';

export default function App() {
  const [u, setU] = useState('');
  const [shirt, setShirt] = useState('');
  const [a, setA] = useState('');
  const [s, setS] = useState('idle');
  const [m, setM] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState('');
  const p = 5.50;

  const verifyShirt = async () => {
    if (!u || !shirt) {
      setVerified('Enter username and shirt link first');
      return;
    }
    
    setVerifying(true);
    setVerified('');
    
    try {
      const r = await fetch(`/api/verify-shirt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, shirtUrl: shirt })
      });
      
      const d = await r.json();
      
      if (d.success) {
        setVerified('✓ Shirt verified! Price: ' + d.price + ' Robux');
      } else {
        setVerified('✗ ' + d.error);
      }
    } catch (e) {
      setVerified('✗ Error verifying shirt');
    }
    
    setVerifying(false);
  };

  const h = async (method) => {
    setS('loading');
    setM('');

    try {
      const r = await fetch(`/api/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, amount: parseInt(a), shirtUrl: shirt, method })
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
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20"></div>
      
      <div className="relative bg-gradient-to-br from-gray-900 to-black border border-gray-800 rounded-3xl shadow-2xl p-8 md:p-12 max-w-2xl w-full backdrop-blur-xl">
        <div className="mb-10">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-3 tracking-tight">MaxBuy</h1>
          <p className="text-gray-400 text-lg">${p.toFixed(2)} per 1,000 Robux</p>
          <p className="text-gray-500 text-sm mt-2">Minimum order: 1,000 Robux</p>
        </div>

        <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-2xl p-6 mb-8">
          <h3 className="font-semibold text-white mb-3 text-lg">How it works</h3>
          <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
            <li>Create a shirt on Roblox with any design</li>
            <li>Set the price to match your Robux amount</li>
            <li>Enter your details and shirt link below</li>
            <li>Complete payment via card or PayPal</li>
            <li>We purchase your shirt (you receive Robux)</li>
          </ol>
          <a 
            href="https://www.roblox.com/develop" 
            target="_blank"
            className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm font-medium mt-4 transition"
          >
            Create shirt on Roblox <ExternalLink size={16} />
          </a>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Roblox Username
            </label>
            <input
              type="text"
              value={u}
              onChange={(e) => {
                setU(e.target.value);
                setVerified('');
              }}
              className="w-full px-5 py-4 bg-gray-900/50 border border-gray-700 text-white rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition placeholder-gray-500"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Robux Amount <span className="text-gray-500">(You receive 70% after tax)</span>
            </label>
            <input
              type="number"
              value={a}
              onChange={(e) => setA(e.target.value)}
              className="w-full px-5 py-4 bg-gray-900/50 border border-gray-700 text-white rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition placeholder-gray-500"
              placeholder="1000"
              min="1000"
              step="100"
            />
            {a && validAmount && (
              <p className="mt-3 text-sm text-gray-400">
                Set your shirt price to: <span className="font-bold text-purple-400">{Math.ceil(parseInt(a) / 0.7)} Robux</span>
              </p>
            )}
            {a && !validAmount && (
              <p className="mt-3 text-sm text-red-400">Minimum 1,000 Robux required</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Shirt Link
            </label>
            <input
              type="text"
              value={shirt}
              onChange={(e) => {
                setShirt(e.target.value);
                setVerified('');
              }}
              className="w-full px-5 py-4 bg-gray-900/50 border border-gray-700 text-white rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition placeholder-gray-500"
              placeholder="https://www.roblox.com/catalog/..."
            />
            <button
              onClick={verifyShirt}
              disabled={verifying || !u || !shirt}
              className="mt-3 w-full bg-gray-800 hover:bg-gray-750 disabled:bg-gray-900 disabled:opacity-50 text-gray-300 font-medium py-3 rounded-xl transition flex items-center justify-center gap-2 border border-gray-700"
            >
              {verifying ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Verifying...
                </>
              ) : (
                'Verify Shirt Ownership'
              )}
            </button>
            {verified && (
              <p className={`mt-3 text-sm ${verified.includes('✓') ? 'text-green-400' : 'text-red-400'}`}>
                {verified}
              </p>
            )}
          </div>

          {t > 0 && validAmount && (
            <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 rounded-2xl p-6">
              <p className="text-3xl font-bold text-white">
                ${t.toFixed(2)}
              </p>
              <p className="text-gray-400 text-sm mt-1">Total amount</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-4">
            <button
              onClick={() => h('stripe')}
              disabled={s === 'loading' || !u || !validAmount || !shirt}
              className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 disabled:from-gray-800 disabled:to-gray-800 disabled:cursor-not-allowed text-white font-semibold py-5 rounded-xl transition shadow-lg hover:shadow-purple-500/50"
            >
              {s === 'loading' ? 'Processing...' : 'Pay with Card'}
            </button>
            
            <button
              onClick={() => h('paypal')}
              disabled={s === 'loading' || !u || !validAmount || !shirt}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-gray-800 disabled:to-gray-800 disabled:cursor-not-allowed text-white font-semibold py-5 rounded-xl transition shadow-lg hover:shadow-blue-500/50"
            >
              {s === 'loading' ? 'Processing...' : 'Pay with PayPal'}
            </button>
          </div>

          {m && (
            <div className={`flex items-center gap-3 p-5 rounded-xl border ${
              s === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'
            }`}>
              {s === 'success' ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
              <p className="font-medium">{m}</p>
            </div>
          )}
        </div>

        <div className="mt-10 pt-8 border-t border-gray-800">
          <p className="text-sm text-gray-500 text-center">
            Fast delivery • Automated process • Secure payments
          </p>
        </div>
      </div>
    </div>
  );
}