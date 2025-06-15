import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

// Professional Mines Game Multiplier Calculator (like 1xBet)
function getMultiplier(b, x) {
  // Input validation
  if (!Number.isInteger(b) || !Number.isInteger(x)) {
    throw new Error('Both mines (b) and safe tiles (x) must be integers');
  }
  
  if (b < 1 || b > 24) {
    throw new Error('Number of mines must be between 1 and 24');
  }
  
  if (x < 0 || x > (25 - b)) {
    throw new Error(`Number of safe tiles must be between 0 and ${25 - b} (total safe tiles)`);
  }
  
  // Edge cases
  if (x === 0) {
    return 1.0000; // No tiles revealed = 1x multiplier
  }
  
  if (b === 24 && x > 1) {
    return Infinity; // Impossible scenario - only 1 safe tile exists
  }
  
  // Calculate probability using the formula:
  // multiplier = 1 / [ product from n = 0 to x-1 of (25 - b - n) / (25 - n) ]
  let probability = 1.0;
  
  for (let n = 0; n < x; n++) {
    const safeTilesRemaining = 25 - b - n; // Safe tiles at step n
    const totalTilesRemaining = 25 - n;     // Total tiles at step n
    
    probability *= safeTilesRemaining / totalTilesRemaining;
  }
  
  // Multiplier is the inverse of probability
  const multiplier = 1 / probability;
  
  // Round to 4 decimal places for display
  return Math.round(multiplier * 10000) / 10000;
}

// Mines Game Component
const MinesGame = ({ currentUser, onBalanceUpdate, onClose }) => {
  // Game state
  const [gameState, setGameState] = useState('waiting'); // 'waiting', 'playing', 'won', 'lost'
  const [board, setBoard] = useState(Array(25).fill({ revealed: false, isMine: false, isExploded: false }));
  const [selectedTiles, setSelectedTiles] = useState(new Set());
  const [gameProgress, setGameProgress] = useState(0);
  const [animatingTiles, setAnimatingTiles] = useState(new Set());
  
  // Game settings
  const [betAmount, setBetAmount] = useState(100);
  const [mineCount, setMineCount] = useState(5);
  
  // Game stats
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [potentialWin, setPotentialWin] = useState(0);
  const [safeRevealed, setSafeRevealed] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);

  // Timer effect
  useEffect(() => {
    let interval;
    if (gameState === 'playing') {
      interval = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
        setGameProgress(prev => Math.min(prev + 0.5, 100));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState]);

  // Calculate multiplier based on revealed safe tiles - UPDATED WITH PROFESSIONAL FORMULA
  useEffect(() => {
    if (safeRevealed > 0) {
      try {
        const multiplier = getMultiplier(mineCount, safeRevealed);
        setCurrentMultiplier(multiplier);
        setPotentialWin(betAmount * multiplier);
      } catch (error) {
        console.error('Multiplier calculation error:', error);
        // Fallback to basic multiplier if calculation fails
        setCurrentMultiplier(1.0);
        setPotentialWin(betAmount);
      }
    } else {
      setCurrentMultiplier(1.0);
      setPotentialWin(betAmount);
    }
  }, [safeRevealed, mineCount, betAmount]);

  const startGame = useCallback(async () => {
    if (betAmount > currentUser.balance) return;
    
    try {
      // Deduct bet amount from balance
      await axios.post(`${API_BASE_URL}/balance/deduct-coins`, {
        nickname: currentUser.nickname,
        amount: betAmount
      });
      
      setGameState('playing');
      setBoard(Array(25).fill({ revealed: false, isMine: false, isExploded: false }));
      setSelectedTiles(new Set());
      setSafeRevealed(0);
      setTimeElapsed(0);
      setGameProgress(0);
      setCurrentMultiplier(1.0);
      setPotentialWin(betAmount);
      
      // Generate mines randomly
      const mines = new Set();
      while (mines.size < mineCount) {
        mines.add(Math.floor(Math.random() * 25));
      }
      
      const newBoard = Array(25).fill(null).map((_, index) => ({
        revealed: false,
        isMine: mines.has(index),
        isExploded: false
      }));
      
      setBoard(newBoard);
      
      // Update user balance in parent component
      onBalanceUpdate();
      
    } catch (error) {
      console.error('Error starting game:', error);
      alert('Failed to start game: ' + (error.response?.data?.message || 'Unknown error'));
    }
  }, [betAmount, currentUser, mineCount, onBalanceUpdate]);

  const revealTile = useCallback((index) => {
    if (gameState !== 'playing' || board[index].revealed || animatingTiles.has(index)) return;

    setAnimatingTiles(prev => new Set([...prev, index]));
    
    setTimeout(() => {
      setBoard(prev => {
        const newBoard = [...prev];
        newBoard[index] = { ...newBoard[index], revealed: true };
        
        if (newBoard[index].isMine) {
          newBoard[index].isExploded = true;
          setGameState('lost');
          // Update game stats for loss
          updateGameStats(-betAmount, 'You lost!');
        } else {
          setSafeRevealed(prevSafe => prevSafe + 1);
          setSelectedTiles(prev => new Set([...prev, index]));
        }
        
        return newBoard;
      });
      
      setAnimatingTiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }, 300);
  }, [gameState, board, animatingTiles, betAmount]);

  const cashOut = useCallback(async () => {
    if (gameState === 'playing' && safeRevealed > 0) {
      try {
        // Add winnings to balance and update game stats
        const winAmount = Math.round(potentialWin);
        const profit = winAmount - betAmount;
        
        await axios.post(`${API_BASE_URL}/balance/add-coins`, {
          nickname: currentUser.nickname,
          amount: winAmount
        });
        
        // Update game stats for win
        await updateGameStats(profit, `You won ${profit.toLocaleString()} coins!`);
        
        setGameState('won');
        onBalanceUpdate();
        
      } catch (error) {
        console.error('Error cashing out:', error);
        alert('Failed to cash out: ' + (error.response?.data?.message || 'Unknown error'));
      }
    }
  }, [gameState, safeRevealed, potentialWin, currentUser, onBalanceUpdate, betAmount]);

  // Update game statistics (win/loss tracking)
  const updateGameStats = async (balanceChange, gameResult) => {
    try {
      await axios.put(`${API_BASE_URL}/update-balance`, {
        nickname: currentUser.nickname,
        balanceChange: 0, // Balance already updated by add/deduct coins
        gameResult: `Mines Game: ${gameResult}`
      });
    } catch (error) {
      console.error('Error updating game stats:', error);
    }
  };

  const resetGame = useCallback(() => {
    setGameState('waiting');
    setBoard(Array(25).fill({ revealed: false, isMine: false, isExploded: false }));
    setSelectedTiles(new Set());
    setSafeRevealed(0);
    setTimeElapsed(0);
    setGameProgress(0);
    setCurrentMultiplier(1.0);
    setAnimatingTiles(new Set());
  }, []);

  const Tile = ({ index, tile }) => {
    const isAnimating = animatingTiles.has(index);
    
    return (
      <div
        className={`mines-tile ${isAnimating ? 'animating' : ''} ${tile.isExploded ? 'exploding' : ''}`}
        onClick={() => revealTile(index)}
      >
        <div className={`mines-tile-face ${!tile.revealed ? 'unrevealed' : tile.isMine ? 'mine' : 'safe'}`}>
          <div className={`mines-tile-content ${!tile.revealed ? 'unrevealed' : ''}`}>
            {tile.revealed ? (
              tile.isMine ? (
                <span className="animate-bounce">💣</span>
              ) : (
                <span className="animate-pulse">💎</span>
              )
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mines-modal">
      <div className="mines-container">
        <div className="mines-header">
          <h2 className="mines-title">💎 MINES GAME 💎</h2>
          <button onClick={onClose} className="mines-close">✕</button>
        </div>

        <div className="mines-content">
          <div className="mines-controls">
            <div className="mines-control-card">
              <h3 className="mines-control-title">Player: {currentUser.nickname}</h3>
              <div className="mines-input-group">
                <label className="mines-label">Bet Amount</label>
                <input
                  type="number"
                  min="1"
                  max={currentUser.balance}
                  value={betAmount}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  disabled={gameState === 'playing'}
                  className="mines-input"
                />
              </div>
              
              <div className="mines-input-group">
                <label className="mines-label">Mines ({mineCount})</label>
                <input
                  type="range"
                  min="1"
                  max="24"
                  value={mineCount}
                  onChange={(e) => setMineCount(Number(e.target.value))}
                  disabled={gameState === 'playing'}
                  className="mines-range"
                />
              </div>

              <div className="mines-balance">
                <p className="mines-balance-text">Balance: {currentUser.balance.toLocaleString()} coins</p>
              </div>
            </div>

            {gameState !== 'waiting' && (
              <div className="mines-control-card">
                <h3 className="mines-control-title">Game Stats</h3>
                <div className="mines-stats">
                  <div className="mines-stat-row">
                    <span className="mines-stat-label">Multiplier:</span>
                    <span className="mines-stat-value green">{currentMultiplier.toFixed(4)}x</span>
                  </div>
                  <div className="mines-stat-row">
                    <span className="mines-stat-label">Potential Win:</span>
                    <span className="mines-stat-value yellow">{Math.round(potentialWin).toLocaleString()} coins</span>
                  </div>
                  <div className="mines-stat-row">
                    <span className="mines-stat-label">Safe Tiles:</span>
                    <span className="mines-stat-value blue">{safeRevealed}</span>
                  </div>
                  <div className="mines-stat-row">
                    <span className="mines-stat-label">Time:</span>
                    <span className="mines-stat-value purple">{timeElapsed}s</span>
                  </div>
                  <div className="mines-stat-row">
                    <span className="mines-stat-label">Risk Level:</span>
                    <span className="mines-stat-value red">{mineCount} mines</span>
                  </div>
                </div>

                {gameState === 'playing' && safeRevealed > 0 && (
                  <button onClick={cashOut} className="mines-button success" style={{marginTop: '0.75rem'}}>
                    💰 Cash Out: {Math.round(potentialWin).toLocaleString()} coins
                  </button>
                )}
              </div>
            )}

            <div>
              {gameState === 'waiting' && (
                <button
                  onClick={startGame}
                  disabled={betAmount > currentUser.balance || betAmount < 1}
                  className="mines-button primary"
                >
                  🚀 Start Game ({betAmount.toLocaleString()} coins)
                </button>
              )}
              
              {(gameState === 'won' || gameState === 'lost') && (
                <button onClick={resetGame} className="mines-button secondary">
                  🔄 Play Again
                </button>
              )}
            </div>
          </div>

          <div className="mines-board-container">
            <div className="mines-board">
              {board.map((tile, index) => (
                <Tile key={index} index={index} tile={tile} />
              ))}
              
              {(gameState === 'won' || gameState === 'lost') && (
                <div className="mines-overlay">
                  <div className="mines-overlay-content">
                    <div className={`mines-overlay-icon ${gameState === 'won' ? 'win' : 'lose'}`}>
                      {gameState === 'won' ? '🎉' : '💥'}
                    </div>
                    <h3 className={`mines-overlay-title ${gameState === 'won' ? 'win' : 'lose'}`}>
                      {gameState === 'won' ? 'YOU WON!' : 'GAME OVER!'}
                    </h3>
                    <p className="mines-overlay-amount">
                      {gameState === 'won' 
                        ? `+${Math.round(potentialWin - betAmount).toLocaleString()} coins` 
                        : `-${betAmount.toLocaleString()} coins`
                      }
                    </p>
                    {gameState === 'won' && (
                      <p style={{color: '#10b981', marginTop: '0.5rem'}}>
                        Multiplier: {currentMultiplier.toFixed(4)}x
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Casino App Component
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [casinoStats, setCasinoStats] = useState(null);
  const [activeSection, setActiveSection] = useState('dashboard'); // 'dashboard', 'games'
  const [activeGame, setActiveGame] = useState(null); // 'mines', etc.

  // Fetch leaderboard and casino stats on component mount
  useEffect(() => {
    fetchLeaderboard();
    fetchCasinoStats();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/leaderboard`);
      setLeaderboard(response.data.leaderboard);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    }
  };

  const fetchCasinoStats = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/casino-stats`);
      setCasinoStats(response.data.stats);
    } catch (err) {
      console.error('Error fetching casino stats:', err);
    }
  };

  const fetchCurrentUser = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/get-user/${currentUser.nickname}`);
      setCurrentUser(response.data.user);
    } catch (err) {
      console.error('Error fetching user data:', err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const response = await axios.post(`${API_BASE_URL}/login`, {
        nickname: nickname.trim()
      });

      setCurrentUser(response.data.user);
      setNickname('');
      
      if (response.data.isNewUser) {
        alert('🎉 Welcome to the casino! You start with 1000 coins!');
      } else {
        alert(`🎰 Welcome back, ${response.data.user.nickname}!`);
      }

      fetchLeaderboard();
      fetchCasinoStats();

    } catch (err) {
      setError(err.response?.data?.message || 'Failed to login');
      console.error('Error during login:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setNickname('');
    setError('');
    setActiveSection('dashboard');
    setActiveGame(null);
  };

  const openGame = (gameType) => {
    setActiveGame(gameType);
  };

  const closeGame = () => {
    setActiveGame(null);
  };

  if (!currentUser) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1 className="login-title">SATTA ADDA HAI KTAHO</h1>
          
          {error && <div className="error-message">{error}</div>}
          
          <form onSubmit={handleLogin} className="login-form">
            <input
              type="text"
              placeholder="Enter your nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={loading}
              className="login-input"
              maxLength="20"
              required
            />
            <button type="submit" disabled={loading} className="login-button">
              {loading ? 'Entering...' : 'Enter Casino'}
            </button>
          </form>
          
          <p className="login-info">New players start with 1000 coins! 🪙</p>
        </div>
      </div>
    );
  }

  return (
    <div className="casino-app">
      <div className="app-container">
        <header className="app-header">
          <div className="header-content">
            <div>
              <h1 className="header-title">🎰 Demo Casino</h1>
              <p className="header-subtitle">Welcome, {currentUser.nickname}!</p>
            </div>
            
            <div className="header-actions">
              <div className="balance-display">
                <p className="balance-amount">{currentUser.balance.toLocaleString()} coins</p>
                <p className="balance-label">Your Balance</p>
              </div>
              <button onClick={handleLogout} className="logout-button">Logout</button>
            </div>
          </div>
        </header>

        <nav className="nav-container">
          <div className="nav-buttons">
            <button
              onClick={() => setActiveSection('dashboard')}
              className={`nav-button ${activeSection === 'dashboard' ? 'active' : 'inactive'}`}
            >
              🏠 Dashboard
            </button>
            <button
              onClick={() => setActiveSection('games')}
              className={`nav-button ${activeSection === 'games' ? 'active' : 'inactive'}`}
            >
              🎮 Games
            </button>
          </div>
        </nav>

        {activeSection === 'dashboard' && (
          <div className="grid-1">
            <div className="card">
              <h2 className="card-title">Your Statistics</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <p className="stat-value blue">{currentUser.gamesPlayed}</p>
                  <p className="stat-label">Mines Games Played</p>
                </div>
                <div className="stat-card">
                  <p className="stat-value green">{currentUser.winRate}%</p>
                  <p className="stat-label">Win Rate</p>
                </div>
                <div className="stat-card">
                  <p className="stat-value yellow">{currentUser.totalWinnings.toLocaleString()}</p>
                  <p className="stat-label">Total Winnings</p>
                </div>
                <div className="stat-card">
                  <p className="stat-value red">{currentUser.totalLosses.toLocaleString()}</p>
                  <p className="stat-label">Total Losses</p>
                </div>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title">🏆 Leaderboard</h2>
              {leaderboard.length === 0 ? (
                <p style={{color: '#9ca3af'}}>No players yet. Be the first!</p>
              ) : (
                <div className="leaderboard">
                  {leaderboard.map((player) => (
                    <div key={player.nickname} className="leaderboard-item">
                      <div className="leaderboard-left">
                        <span className="leaderboard-rank">#{player.rank}</span>
                        <span className="leaderboard-name">{player.nickname}</span>
                      </div>
                      <div className="leaderboard-right">
                        <p className="leaderboard-balance">{player.balance.toLocaleString()} coins</p>
                        <p className="leaderboard-games">{player.gamesPlayed} games</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'games' && (
          <div className="grid-3">
            <div className="games-card" onClick={() => openGame('mines')}>
              <div className="game-icon">💎</div>
              <h3 className="game-title">Mines</h3>
              <p className="game-description">Professional multiplier system - like 1xBet!</p>
              <div className="game-play-button">Play Now</div>
            </div>

            <div className="games-card disabled">
              <div className="game-icon">🎰</div>
              <h3 className="game-title">Advanced Slots</h3>
              <p className="game-description">Multi-line slot machine</p>
              <div className="game-coming-soon">Coming Soon</div>
            </div>

            <div className="games-card disabled">
              <div className="game-icon">🎲</div>
              <h3 className="game-title">Crash</h3>
              <p className="game-description">Watch the multiplier grow!</p>
              <div className="game-coming-soon">Coming Soon</div>
            </div>

            <div className="games-card disabled">
              <div className="game-icon">🃏</div>
              <h3 className="game-title">Poker</h3>
              <p className="game-description">Texas Hold'em Poker</p>
              <div className="game-coming-soon">Coming Soon</div>
            </div>

            <div className="games-card disabled">
              <div className="game-icon">🎡</div>
              <h3 className="game-title">Wheel of Fortune</h3>
              <p className="game-description">Spin to win big!</p>
              <div className="game-coming-soon">Coming Soon</div>
            </div>

            <div className="games-card disabled">
              <div className="game-icon">🎯</div>
              <h3 className="game-title">Plinko</h3>
              <p className="game-description">Drop the ball, win coins!</p>
              <div className="game-coming-soon">Coming Soon</div>
            </div>
          </div>
        )}

        {casinoStats && (
          <div className="card" style={{marginTop: '1.5rem'}}>
            <h2 className="card-title" style={{textAlign: 'center'}}>📊 Casino Statistics</h2>
            <div className="grid-4">
              <div className="stat-card">
                <p className="stat-value blue">{casinoStats.totalPlayers}</p>
                <p className="stat-label">Total Players</p>
              </div>
              <div className="stat-card">
                <p className="stat-value green">{casinoStats.totalGamesPlayed}</p>
                <p className="stat-label">Games Played</p>
              </div>
              <div className="stat-card">
                <p className="stat-value yellow">{casinoStats.totalCoinsInCirculation.toLocaleString()}</p>
                <p className="stat-label">Coins in Play</p>
              </div>
              <div className="stat-card">
                <p className="stat-value purple">{casinoStats.averageBalance}</p>
                <p className="stat-label">Avg Balance</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {activeGame === 'mines' && (
        <MinesGame 
          currentUser={currentUser}
          onBalanceUpdate={fetchCurrentUser}
          onClose={closeGame}
        />
      )}
    </div>
  );
}

export default App;