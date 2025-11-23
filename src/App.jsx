import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, ExternalLink, ArrowRight } from 'lucide-react';

export default function App() {
  const [u, setU] = useState('');
  const [itemUrl, setItemUrl] = useState('');
  const [a, setA] = useState('');
  const [s, setS] = useState('idle');
  const [m, setM] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState('');
  const [userVerified, setUserVerified] = useState(false);
  const [userAvatar, setUserAvatar] = useState('');
  const [verifyingUser, setVerifyingUser] = useState(false);
  const p = 7.39;

  const verifyUser = async () => {
    if (!u) return;
    
    setVerifyingUser(true);
    setUserVerified(false);
    setUserAvatar('');
    
    try {
      const r = await fetch(`/api/verify-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u })
      });
      
      const d = await r.json();
      
      if (d.success) {
        setUserVerified(true);
        setUserAvatar(d.avatar);
      } else {
        setUserVerified(false);
      }
    } catch (e) {
      setUserVerified(false);
    }
    
    setVerifyingUser(false);
  };

  const verifyItem = async () => {
    if (!u || !itemUrl) {
      setVerified('Enter username and item link first');
      return;
    }
    
    setVerifying(true);
    setVerified('');
    
    try {
      const r = await fetch(`/api/verify-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, itemUrl })
      });
      
      const d = await r.json();
      
      if (d.success) {
        setVerified(`✓ ${d.itemType} verified! Price: ${d.price} Robux`);
      } else {
        setVerified('✗ ' + d.error);
      }
    } catch (e) {
      setVerified('✗ Error verifying item');
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
        body: JSON.stringify({ username: u, amount: parseInt(a), itemUrl, method })
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
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-10">
          <img 
            src="https://i.imgur.com/98ZB5IL.png" 
            alt="MaxBuy" 
            className="w-12 h-12"
            style={{ filter: 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.3))' }}
          />
          <h1 className="text-4xl font-bold text-white">MaxBuy</h1>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 mb-6" style={{ boxShadow: '0 0 40px rgba(0, 0, 0, 0.5)' }}>
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-zinc-800">
            <div>
              <p className="text-sm text-zinc-500 mb-1">Price per 1,000 R$</p>
              <p className="text-3xl font-bold text-white">${p.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-500 mb-1">Minimum</p>
              <p className="text-lg font-semibold text-zinc-300">1,000 R$</p>
            </div>
          </div>

          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 mb-8">
            <p className="text-sm font-semibold text-red-400 mb-3">How it works</p>
            <div className="space-y-2 text-sm text-zinc-400">
              <div className="flex items-start gap-2">
                <span className="text-red-500">•</span>
                <span>Create a Game Pass or T-Shirt on Roblox</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-500">•</span>
                <span>Set the price to the amount shown below</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-500">•</span>
                <span>Paste item link and complete payment</span>
              </div>
            </div>
            <a 
              href="https://www.roblox.com/develop" 
              target="_blank"
              className="inline-flex items-center gap-1 text-sm text-red-400 hover:text-red-300 mt-3 transition"
            >
              Create on Roblox <ExternalLink size={14} />
            </a>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Roblox Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={u}
                  onChange={(e) => {
                    setU(e.target.value);
                    setVerified('');
                    setUserVerified(false);
                    setUserAvatar('');
                  }}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition placeholder-zinc-600 pr-24"
                  placeholder="Enter your username"
                />
                <button
                  onClick={verifyUser}
                  disabled={verifyingUser || !u || userVerified}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded transition"
                >
                  {verifyingUser ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : userVerified ? (
                    <CheckCircle size={14} />
                  ) : (
                    'Verify'
                  )}
                </button>
              </div>
              {userVerified && userAvatar && (
                <div className="mt-3 flex items-center gap-3 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
                  <img 
                    src={userAvatar} 
                    alt={u} 
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="text-sm text-green-400">✓ User verified</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Robux Amount
              </label>
              <input
                type="number"
                value={a}
                onChange={(e) => setA(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition placeholder-zinc-600"
                placeholder="1000"
                min="1000"
                step="100"
              />
              {a && validAmount && (
                <div className="mt-3 flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3">
                  <span className="text-sm text-zinc-500">Set item price to:</span>
                  <span className="text-lg font-bold text-red-500">{Math.ceil(parseInt(a) / 0.7)} R$</span>
                </div>
              )}
              {a && !validAmount && (
                <p className="mt-2 text-sm text-red-400">Minimum 1,000 Robux required</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Item Link
              </label>
              <input
                type="text"
                value={itemUrl}
                onChange={(e) => {
                  setItemUrl(e.target.value);
                  setVerified('');
                }}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition placeholder-zinc-600"
                placeholder="https://www.roblox.com/..."
              />
              <button
                onClick={verifyItem}
                disabled={verifying || !u || !itemUrl}
                className="mt-3 w-full bg-zinc-800 hover:bg-zinc-750 disabled:opacity-50 text-zinc-300 font-medium py-3 rounded-lg transition flex items-center justify-center gap-2 border border-zinc-700"
              >
                {verifying ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify Item
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
              {verified && (
                <p className={`mt-3 text-sm ${verified.includes('✓') ? 'text-green-400' : 'text-red-400'}`}>
                  {verified}
                </p>
              )}
            </div>

            {t > 0 && validAmount && (
              <div className="bg-gradient-to-r from-red-600 to-red-500 rounded-lg p-5" style={{ boxShadow: '0 4px 20px rgba(239, 68, 68, 0.25)' }}>
                <p className="text-red-100 text-sm mb-1">Total Payment</p>
                <p className="text-white text-3xl font-bold">${t.toFixed(2)}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => h('stripe')}
                disabled={s === 'loading' || !u || !validAmount || !itemUrl}
                className="bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:opacity-50 text-white font-semibold py-4 rounded-lg transition"
                style={{ boxShadow: s === 'loading' || !u || !validAmount || !itemUrl ? 'none' : '0 4px 16px rgba(239, 68, 68, 0.3)' }}
              >
                {s === 'loading' ? 'Processing...' : 'Pay with Card'}
              </button>
              
              <button
                onClick={() => h('paypal')}
                disabled={s === 'loading' || !u || !validAmount || !itemUrl}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:opacity-50 text-white font-semibold py-4 rounded-lg transition"
              >
                {s === 'loading' ? 'Processing...' : 'PayPal'}
              </button>
            </div>

            {m && (
              <div className={`flex items-center gap-3 p-4 rounded-lg ${
                s === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}>
                {s === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                <p className="text-sm">{m}</p>
              </div>
            )}
          </div>
        </div>

        <div className="text-center text-sm text-zinc-600">
          Secure • Instant • Automated
        </div>
      </div>
    </div>
  );
}