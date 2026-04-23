'use strict';

class DungeonGame {
  static ROWS = 7;
  static COLS = 7;

  /**
   * Generate a random 7×7 dungeon grid.
   * @param {string} difficulty  'easy' | 'medium' | 'hard'
   * @returns {number[][]}
   */
  static generate(difficulty = 'medium') {
    const settings = {
      easy:   { range: 15, healChance: 60 },
      medium: { range: 18, healChance: 42 },
      hard:   { range: 20, healChance: 28 },
    };
    const { range, healChance } = settings[difficulty] || settings.medium;
    const R = DungeonGame.ROWS, C = DungeonGame.COLS;
    const grid = [];

    for (let r = 0; r < R; r++) {
      grid.push([]);
      for (let c = 0; c < C; c++) {
        if (Math.random() * 100 < healChance) {
          grid[r].push(DungeonGame._rand(1, range));
        } else {
          grid[r].push(DungeonGame._rand(-range, range));
        }
      }
    }

    // Princess room is always positive (reward)
    grid[R - 1][C - 1] = DungeonGame._rand(1, 8);
    // Start room: avoid extreme penalty
    if (grid[0][0] < -5) grid[0][0] = DungeonGame._rand(-5, 5);

    return grid;
  }

  /**
   * Bottom-up DP to compute minimum initial health needed.
   *
   * Formula: dp[i][j] = max(1, min(dp[i+1][j], dp[i][j+1]) - dungeon[i][j])
   * Base:    dp[R-1][C-1] = max(1, 1 - dungeon[R-1][C-1])
   *
   * dp[i][j] = the minimum health the knight must have ON ENTERING cell (i,j)
   * to survive all the way to the princess from there.
   *
   * @param {number[][]} grid
   * @returns {number[][]} dp table
   */
  static computeDP(grid) {
    const R = DungeonGame.ROWS, C = DungeonGame.COLS;
    // Build dp table filled with Infinity as sentinel
    const dp = Array.from({ length: R + 1 }, () => Array(C + 1).fill(Infinity));

    // Base case: princess room
    dp[R - 1][C - 1] = Math.max(1, 1 - grid[R - 1][C - 1]);

    // Fill last row (can only move right)
    for (let c = C - 2; c >= 0; c--) {
      dp[R - 1][c] = Math.max(1, dp[R - 1][c + 1] - grid[R - 1][c]);
    }

    // Fill last column (can only move down)
    for (let r = R - 2; r >= 0; r--) {
      dp[r][C - 1] = Math.max(1, dp[r + 1][C - 1] - grid[r][C - 1]);
    }

    // Fill remaining cells (bottom-right to top-left)
    for (let r = R - 2; r >= 0; r--) {
      for (let c = C - 2; c >= 0; c--) {
        const best = Math.min(dp[r + 1][c], dp[r][c + 1]);
        dp[r][c] = Math.max(1, best - grid[r][c]);
      }
    }

    return dp;
  }

  /**
   * Trace the optimal path the DP found (greedy: always pick neighbor with lower dp value).
   * @param {number[][]} dp
   * @returns {Set<string>} set of "r,c" strings on optimal path
   */
  static optimalPath(dp) {
    const R = DungeonGame.ROWS, C = DungeonGame.COLS;
    const path = new Set();
    let r = 0, c = 0;
    path.add(`${r},${c}`);
    while (r < R - 1 || c < C - 1) {
      const canDown  = r < R - 1;
      const canRight = c < C - 1;
      if (canDown && canRight) {
        if (dp[r + 1][c] <= dp[r][c + 1]) r++;
        else c++;
      } else if (canDown) {
        r++;
      } else {
        c++;
      }
      path.add(`${r},${c}`);
    }
    return path;
  }

  static _rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}


/* ═══════════════════════════════════════════════════
   2. PLAYER
═══════════════════════════════════════════════════ */

class Player {
  constructor(health) {
    this.row = 0;
    this.col = 0;
    this.health = health;
  }

  get pos() { return `${this.row},${this.col}`; }

  applyRoom(value) {
    this.health += value;
  }

  isAlive() { return this.health > 0; }

  isAt(r, c) { return this.row === r && this.col === c; }
}


/* ═══════════════════════════════════════════════════
   3. UI
═══════════════════════════════════════════════════ */

class UI {
  constructor() {
    this.$grid      = document.getElementById('grid');
    this.$health    = document.getElementById('health-val');
    this.$minHealth = document.getElementById('min-val');
    this.$moves     = document.getElementById('moves-val');
    this.$rescues   = document.getElementById('rescues-val');
    this.$toast     = document.getElementById('toast');
    this.$overlay   = document.getElementById('overlay');
    this.$ovIcon    = document.getElementById('overlay-icon');
    this.$ovTitle   = document.getElementById('overlay-title');
    this.$ovSub     = document.getElementById('overlay-sub');
    this.$ovBar     = document.getElementById('overlay-bar');
    this.$logList   = document.getElementById('log-list');
    this._toastTimer = null;
  }

  /** Render the full 7×7 grid */
  renderGrid(grid, player, visited, showPath, optPath) {
    const R = DungeonGame.ROWS, C = DungeonGame.COLS;
    const frag = document.createDocumentFragment();

    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const v = grid[r][c];
        const isPlayer  = player.isAt(r, c);
        const isGoal    = r === R - 1 && c === C - 1;
        const isVisited = visited.has(`${r},${c}`) && !isPlayer;
        const onPath    = showPath && optPath.has(`${r},${c}`);

        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', `Row ${r+1} Col ${c+1}: ${v > 0 ? '+' : ''}${v}`);

        // State classes
        if (isPlayer) {
          cell.classList.add('player');
        } else if (isGoal) {
          cell.classList.add('goal');
        } else if (v < 0) {
          cell.classList.add('damage');
        } else if (v > 0) {
          cell.classList.add('heal');
        } else {
          cell.classList.add('neutral');
        }

        if (isVisited && !isGoal) cell.classList.add('visited');
        if (onPath && !isPlayer) cell.classList.add('path-show');

        // Icon + value
        if (isPlayer) {
          cell.innerHTML = `<div class="cell-icon">⚔</div><div class="cell-val">${v > 0 ? '+' : ''}${v}</div>`;
        } else if (isGoal) {
          cell.innerHTML = `<div class="cell-icon">👑</div><div class="cell-val">${v > 0 ? '+' : ''}${v}</div>`;
        } else {
          const sign = v > 0 ? '+' : '';
          cell.innerHTML = `<div class="cell-val" style="font-size: clamp(10px, 1.5vw, 15px)">${sign}${v}</div>`;
        }

        frag.appendChild(cell);
      }
    }

    this.$grid.innerHTML = '';
    this.$grid.appendChild(frag);
  }

  /** Animate the player cell (called after move) */
  animatePlayer() {
    const cells = this.$grid.querySelectorAll('.cell.player');
    cells.forEach(c => {
      c.classList.remove('entering');
      // Force reflow to restart animation
      void c.offsetWidth;
      c.classList.add('entering');
    });
  }

  updateHUD(player, minHealth, moves, rescues) {
    this.$health.textContent = player.health;
    this.$minHealth.textContent = minHealth;
    this.$moves.textContent = moves;
    this.$rescues.textContent = rescues;

    // Health color coding
    this.$health.className = 'stat-value';
    const ratio = player.health / minHealth;
    if (player.health <= 2)      this.$health.classList.add('health-low');
    else if (ratio <= 1.3)       this.$health.classList.add('health-warn');
    else                         this.$health.classList.add('health-ok');
  }

  toast(msg, type = 'neutral') {
    const t = this.$toast;
    t.textContent = msg;
    t.className = `toast ${type} show`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.classList.remove('show'); }, 2200);
  }

  showOverlay(icon, title, sub, duration) {
    this.$ovIcon.textContent = icon;
    this.$ovTitle.textContent = title;
    this.$ovSub.textContent = sub;
    this.$overlay.classList.remove('hidden');
    this.$ovBar.className = 'overlay-progress-bar';
    void this.$ovBar.offsetWidth;
    this.$ovBar.style.setProperty('--duration', `${duration}ms`);
    this.$ovBar.classList.add('run');
  }

  hideOverlay() {
    this.$overlay.classList.add('hidden');
  }

  addLog(msg, type = '') {
    const el = document.createElement('div');
    el.className = `log-entry ${type}`;
    el.textContent = msg;
    this.$logList.prepend(el);
    // Keep only last 30 entries
    while (this.$logList.children.length > 30) {
      this.$logList.removeChild(this.$logList.lastChild);
    }
  }

  clearLog() {
    this.$logList.innerHTML = '';
  }
}


/* ═══════════════════════════════════════════════════
   4. GAME ENGINE
═══════════════════════════════════════════════════ */

class GameEngine {
  constructor() {
    this.difficulty = 'medium';
    this.dungeon    = null;
    this.dp         = null;
    this.optPath    = null;
    this.player     = null;
    this.minHealth  = 0;
    this.moves      = 0;
    this.rescues    = 0;
    this.visited    = new Set();
    this.showPath   = false;
    this.locked     = false;   // prevents input during transition animations
    this.ui         = new UI();

    this._bindInputs();
    this._initSplash();
  }

  /* ── INIT ─────────────────────────────────────── */

  _initSplash() {
    // Splash difficulty buttons
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.difficulty = btn.dataset.diff;
        // Mirror to in-game pills
        document.querySelectorAll('.diff-pill').forEach(p => {
          p.classList.toggle('active', p.dataset.diff === this.difficulty);
        });
      });
    });

    document.getElementById('startBtn').addEventListener('click', () => {
      const splash = document.getElementById('splash');
      splash.classList.add('fade-out');
      setTimeout(() => {
        splash.classList.add('hidden');
        document.getElementById('game').classList.remove('hidden');
        this._newDungeon();
      }, 600);
    });
  }

  /* ── NEW DUNGEON ──────────────────────────────── */

  _newDungeon() {
    this.dungeon   = DungeonGame.generate(this.difficulty);
    this.dp        = DungeonGame.computeDP(this.dungeon);
    this.optPath   = DungeonGame.optimalPath(this.dp);
    this.minHealth = this.dp[0][0];

    // Player starts with exactly minHealth, then immediately applies the start room
    this.player  = new Player(this.minHealth);
    const startVal = this.dungeon[0][0];
    this.player.applyRoom(startVal);

    this.moves   = 0;
    this.visited = new Set(['0,0']);
    this.showPath = false;
    document.getElementById('pathToggleBtn').textContent = 'Show Optimal Path';
    this.ui.clearLog();
    this.ui.addLog(`New dungeon — min health: ${this.minHealth}`, '');
    this.ui.addLog(`Start cell (0,0): ${startVal > 0 ? '+' : ''}${startVal}`, startVal < 0 ? 'dmg' : startVal > 0 ? 'hlg' : '');

    this._render();
    this.ui.toast(`Min health required: ${this.minHealth}. You start with ${this.player.health} HP.`, 'info');
  }

  /* ── MOVE ─────────────────────────────────────── */

  move(dr, dc) {
    if (this.locked) return;

    const nr = this.player.row + dr;
    const nc = this.player.col + dc;
    const R  = DungeonGame.ROWS, C = DungeonGame.COLS;

    // Block invalid directions (only right & down)
    if (dr < 0 || dc < 0) {
      this.ui.toast('Only right (→) and down (↓) moves allowed!', 'neutral');
      return;
    }

    // Boundary check
    if (nr >= R || nc >= C) return;

    // Move player
    this.player.row = nr;
    this.player.col = nc;
    this.moves++;
    this.visited.add(`${nr},${nc}`);

    // Apply room effect
    const cellVal = this.dungeon[nr][nc];
    this.player.applyRoom(cellVal);

    // Render immediately
    this._render();
    this.ui.animatePlayer();

    // Log
    const sign = cellVal > 0 ? '+' : '';
    const pos  = `(${nr},${nc})`;
    const type = cellVal < 0 ? 'dmg' : cellVal > 0 ? 'hlg' : '';
    this.ui.addLog(`${pos}: ${sign}${cellVal} → HP ${this.player.health}`, type);

    // Check outcomes
    if (nr === R - 1 && nc === C - 1) {
      this._onWin();
      return;
    }

    if (!this.player.isAlive()) {
      this._onDeath();
      return;
    }

    // Toast for room effect
    if (cellVal < 0) {
      this.ui.toast(`⚠ Took ${cellVal} damage! HP: ${this.player.health}`, 'damage');
    } else if (cellVal > 0) {
      this.ui.toast(`✦ Healed +${cellVal}! HP: ${this.player.health}`, 'heal');
    } else {
      this.ui.toast(`Empty chamber. HP: ${this.player.health}`, 'neutral');
    }
  }

  _onDeath() {
    this.locked = true;
    const DELAY = 1800;
    this.ui.addLog(`☠ Died! HP dropped to ${this.player.health}`, 'dmg');
    this.ui.showOverlay(
      '💀',
      'YOU DIED',
      `Your health fell to ${this.player.health}. Restarting...`,
      DELAY
    );
    setTimeout(() => {
      this.ui.hideOverlay();
      this.locked = false;
      this._resetRun();
    }, DELAY);
  }

  _onWin() {
    this.rescues++;
    this.locked = true;
    const DELAY = 2000;
    this.ui.addLog(`♛ Princess rescued in ${this.moves} moves!`, 'win');
    this.ui.showOverlay(
      '👑',
      'PRINCESS RESCUED!',
      `She is saved! Generating new dungeon... (${this.rescues} rescue${this.rescues > 1 ? 's' : ''})`,
      DELAY
    );
    this._render(); // show player on princess cell
    setTimeout(() => {
      this.ui.hideOverlay();
      this.locked = false;
      this._newDungeon();
    }, DELAY);
  }

  _resetRun() {
    this.player  = new Player(this.minHealth);
    const startVal = this.dungeon[0][0];
    this.player.applyRoom(startVal);
    this.moves   = 0;
    this.visited = new Set(['0,0']);
    this.ui.clearLog();
    this.ui.addLog(`Restarted — min health: ${this.minHealth}`, '');
    this._render();
    this.ui.toast(`Restarted with ${this.player.health} HP. Min required: ${this.minHealth}.`, 'info');
  }

  /* ── RENDER ───────────────────────────────────── */

  _render() {
    this.ui.renderGrid(this.dungeon, this.player, this.visited, this.showPath, this.optPath);
    this.ui.updateHUD(this.player, this.minHealth, this.moves, this.rescues);
  }

  /* ── INPUT BINDING ────────────────────────────── */

  _bindInputs() {
    // Keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); this.move(0, 1); }
      else if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') { e.preventDefault(); this.move(1, 0); }
      else if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp') { e.preventDefault(); this.move(-1, -1); }
      else if (e.key === 'p' || e.key === 'P') { this._togglePath(); }
      else if (e.key === 'r' || e.key === 'R') { if (!this.locked) this._newDungeon(); }
    });

    // Mobile buttons
    document.getElementById('mRightBtn').addEventListener('click', () => this.move(0, 1));
    document.getElementById('mDownBtn').addEventListener('click',  () => this.move(1, 0));
    document.getElementById('mUpBtn').addEventListener('click',    () => this.move(-1, 0));
    document.getElementById('mLeftBtn').addEventListener('click',  () => this.move(0, -1));

    // Side panel buttons
    document.getElementById('pathToggleBtn').addEventListener('click', () => this._togglePath());
    document.getElementById('newGameBtn').addEventListener('click', () => { if (!this.locked) this._newDungeon(); });
    document.getElementById('backBtn').addEventListener('click', () => {
      document.getElementById('game').classList.add('hidden');
      const splash = document.getElementById('splash');
      splash.classList.remove('hidden', 'fade-out');
    });

    // In-game difficulty pills
    document.querySelectorAll('.diff-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-pill').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.difficulty = btn.dataset.diff;
        // Mirror to splash
        document.querySelectorAll('.diff-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.diff === this.difficulty);
        });
        if (!this.locked) this._newDungeon();
      });
    });
  }

  _togglePath() {
    this.showPath = !this.showPath;
    document.getElementById('pathToggleBtn').textContent =
      this.showPath ? 'Hide Optimal Path' : 'Show Optimal Path';
    document.getElementById('pathToggleBtn').classList.toggle('active-path', this.showPath);
    this._render();
  }
}


/* ═══════════════════════════════════════════════════
   5. BOOTSTRAP
═══════════════════════════════════════════════════ */

window.addEventListener('DOMContentLoaded', () => {
  window._game = new GameEngine();
});
