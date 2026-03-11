/**
 * Pac-Man Implementation
 * Built with vanilla JavaScript and HTML5 Canvas.
 */

// Game constants
const COLS = 19;
const ROWS = 21;
const TILE = 32;
const BOARD_W = COLS * TILE; // 608
const BOARD_H = ROWS * TILE; // 672
const SPEED = TILE / 4; // 8 px per tick
const GHOST_SPEED = TILE / 4;
const FPS = 20; // 50 ms per frame
const SCARED_TIME = 7000; // ms ghosts stay scared

// Color palette
const CLR_WALL = '#1919a6';
const CLR_WALL_EDGE = '#3333cc';
const CLR_FOOD = '#ffcc66';
const CLR_POWER = '#ffcc66';
const CLR_PACMAN = '#ffdd00';
const CLR_PACMAN_EYE = '#111';
const CLR_BG = '#000000';
const GHOST_COLORS = ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852']; // red, pink, cyan, orange
const CLR_SCARED = '#2222ff';
const CLR_SCARED_END = '#ffffff';

// Tile map representation
// X = wall, ' ' = food dot, O = empty (no food),
// P = pacman, G = ghost, W = power pellet
// T = tunnel (passable, no food)
const MAP = [
    "XXXXXXXXXXXXXXXXXXX",
    "X    X   X   X    X",
    "XWXX X X X X X XXWX",
    "X                 X",
    "X XX X XXXXX X XX X",
    "X    X   X   X    X",
    "XXXX XXX X XXX XXXX",
    "OOOX X GG GG X XOOO",
    "XXXX X XXXXX X XXXX",
    "T                 T",
    "XXXX X XXXXX X XXXX",
    "OOOX X       X XOOO",
    "XXXX X XXXXX X XXXX",
    "X        X        X",
    "X XX XXX X XXX XX X",
    "X  X     P     X  X",
    "XX X X XXXXX X X XX",
    "X    X   X   X    X",
    "X XXXXXX X XXXXXX X",
    "XW               WX",
    "XXXXXXXXXXXXXXXXXXX"
];

// Core game state
let canvas, ctx;
let score = 0;
let lives = 3;
let level = 1;
let gameOver = false;
let gameStarted = false;
let paused = false;

let pacman = null;
let walls = [];
let foods = [];
let powers = [];
let ghosts = [];
let tunnels = []; 

let nextDir = null; 
let scaredTimer = null;
let ghostsScared = false;

// DOM element selectors
const scoreEl = () => document.getElementById('score');
const livesEl = () => document.getElementById('lives-icons');
const levelEl = () => document.getElementById('level');
const overlayEl = () => document.getElementById('message-overlay');
const msgTextEl = () => document.getElementById('message-text');
const msgSubEl = () => document.getElementById('message-sub');

class Entity {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.startX = x;
        this.startY = y;
        this.vx = 0;
        this.vy = 0;
        this.dir = 'R';
    }

    reset() {
        this.x = this.startX;
        this.y = this.startY;
        this.vx = 0;
        this.vy = 0;
    }

    setDir(d) {
        this.dir = d;
        if (d === 'U') { this.vx = 0; this.vy = -SPEED; }
        if (d === 'D') { this.vx = 0; this.vy = SPEED; }
        if (d === 'L') { this.vx = -SPEED; this.vy = 0; }
        if (d === 'R') { this.vx = SPEED; this.vy = 0; }
    }
}

// Initialization
window.onload = function () {
    canvas = document.getElementById('board');
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;
    ctx = canvas.getContext('2d');

    loadMap();
    updateHUD();
    showMessage('PAC-MAN', 'Press any key to start');
    draw();

    document.addEventListener('keydown', onKey);
};

function loadMap() {
    walls = [];
    foods = [];
    powers = [];
    ghosts = [];
    tunnels = [];
    pacman = null;

    let ghostIdx = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const ch = MAP[r][c];
            const x = c * TILE;
            const y = r * TILE;

            if (ch === 'X') {
                walls.push({ x, y, w: TILE, h: TILE });
            } else if (ch === ' ') {
                foods.push({ x: x + TILE/2 - 2, y: y + TILE/2 - 2, w: 4, h: 4 });
            } else if (ch === 'W') {
                powers.push({ x: x + TILE/2 - 6, y: y + TILE/2 - 6, w: 12, h: 12 });
            } else if (ch === 'P') {
                pacman = new Entity(x, y, TILE, TILE);
                pacman.dir = 'R';
            } else if (ch === 'G') {
                const g = new Entity(x, y, TILE, TILE);
                g.colorIdx = ghostIdx % 4;
                g.scared = false;
                g.eaten = false;
                
                // Assign a random starting direction
                const dirs = ['U', 'D', 'L', 'R'];
                g.setDir(dirs[Math.floor(Math.random() * 4)]);
                ghosts.push(g);
                ghostIdx++;
            } else if (ch === 'T') {
                tunnels.push({ x, y, r, c });
            }
        }
    }
}

// Axis-Aligned Bounding Box (AABB) collision detection
function collides(a, b) {
    return a.x < b.x + b.w &&
           a.x + a.w > b.x &&
           a.y < b.y + b.h &&
           a.y + a.h > b.y;
}

function collidesWall(entity) {
    for (const w of walls) {
        if (collides(entity, w)) return true;
    }
    return false;
}

function onKey(e) {
    // Handle game start/restart
    if (!gameStarted || gameOver) {
        if (gameOver) {
            resetGame();
        }
        gameStarted = true;
        hideMessage();
        gameLoop();
        return;
    }

    const key = e.code;
    if (key === 'ArrowUp' || key === 'KeyW') { e.preventDefault(); nextDir = 'U'; }
    if (key === 'ArrowDown' || key === 'KeyS') { e.preventDefault(); nextDir = 'D'; }
    if (key === 'ArrowLeft' || key === 'KeyA') { e.preventDefault(); nextDir = 'L'; }
    if (key === 'ArrowRight' || key === 'KeyD') { e.preventDefault(); nextDir = 'R'; }
}

function gameLoop() {
    if (gameOver) return;
    move();
    draw();
    setTimeout(gameLoop, 1000 / FPS);
}

function move() {
    // Attempt queued direction for Pac-Man
    if (nextDir) {
        const prevVx = pacman.vx;
        const prevVy = pacman.vy;
        const prevDir = pacman.dir;

        pacman.setDir(nextDir);
        pacman.x += pacman.vx;
        pacman.y += pacman.vy;

        if (collidesWall(pacman)) {
            // Revert if blocked
            pacman.x -= pacman.vx;
            pacman.y -= pacman.vy;
            pacman.vx = prevVx;
            pacman.vy = prevVy;
            pacman.dir = prevDir;
        } else {
            // Direction accepted, revert test step
            pacman.x -= pacman.vx;
            pacman.y -= pacman.vy;
            nextDir = null;
        }
    }

    // Move Pac-Man independently on X and Y to slide along walls
    pacman.x += pacman.vx;
    if (collidesWall(pacman)) {
        pacman.x -= pacman.vx;
    }
    
    pacman.y += pacman.vy;
    if (collidesWall(pacman)) {
        pacman.y -= pacman.vy;
    }

    // Tunnel wrapping logic
    if (pacman.x + pacman.w <= 0) {
        pacman.x = BOARD_W - TILE;
    } else if (pacman.x >= BOARD_W) {
        pacman.x = 0;
    }

    // Process food collisions
    for (let i = foods.length - 1; i >= 0; i--) {
        if (collides(pacman, foods[i])) {
            foods.splice(i, 1);
            score += 10;
            updateHUD();
        }
    }

    // Process power pellet collisions
    for (let i = powers.length - 1; i >= 0; i--) {
        if (collides(pacman, powers[i])) {
            powers.splice(i, 1);
            score += 50;
            activateScaredMode();
            updateHUD();
        }
    }

    // Process ghost movement
    for (const g of ghosts) {
        g.x += g.vx;
        g.y += g.vy;

        let hitWall = collidesWall(g) || g.x <= 0 || g.x + g.w >= BOARD_W;
        if (hitWall) {
            g.x -= g.vx;
            g.y -= g.vy;
            pickGhostDir(g);
        }

        // Add slight randomness to make ghosts less predictable
        if (Math.random() < 0.02) {
            pickGhostDir(g);
        }

        if (g.x + g.w <= 0) g.x = BOARD_W - TILE;
        else if (g.x >= BOARD_W) g.x = 0;
    }

    // Check entity interactions (Pac-Man vs Ghosts)
    for (const g of ghosts) {
        if (collides(pacman, g)) {
            if (g.scared) {
                g.reset();
                pickGhostDir(g);
                g.scared = false;
                score += 200;
                updateHUD();
            } else {
                lives--;
                updateHUD();
                if (lives <= 0) {
                    gameOver = true;
                    showMessage('GAME OVER', 'Press any key to restart', true);
                    return;
                }
                resetPositions();
                return;
            }
        }
    }

    // Handle level completion
    if (foods.length === 0 && powers.length === 0) {
        level++;
        loadMap();
        resetPositions();
        updateHUD();
    }
}

function pickGhostDir(g) {
    // Shuffle directions using Fisher-Yates
    const dirs = ['U', 'D', 'L', 'R'];
    for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    
    const oldVx = g.vx, oldVy = g.vy, oldDir = g.dir;
    
    for (const d of dirs) {
        g.setDir(d);
        g.x += g.vx;
        g.y += g.vy;
        if (!collidesWall(g) && g.x >= 0 && g.x + g.w <= BOARD_W) {
            g.x -= g.vx;
            g.y -= g.vy;
            return;
        }
        g.x -= g.vx;
        g.y -= g.vy;
    }
    
    // Fallback if no valid direction is found
    g.vx = 0;
    g.vy = 0;
    g.dir = oldDir;
}

function activateScaredMode() {
    ghostsScared = true;
    for (const g of ghosts) g.scared = true;
    
    if (scaredTimer) clearTimeout(scaredTimer);
    
    scaredTimer = setTimeout(() => {
        ghostsScared = false;
        for (const g of ghosts) g.scared = false;
        scaredTimer = null;
    }, SCARED_TIME);
}

function resetPositions() {
    pacman.reset();
    pacman.vx = 0;
    pacman.vy = 0;
    pacman.dir = 'R';
    nextDir = null;
    
    for (const g of ghosts) {
        g.reset();
        pickGhostDir(g);
    }
}

function resetGame() {
    score = 0;
    lives = 3;
    level = 1;
    gameOver = false;
    ghostsScared = false;
    
    if (scaredTimer) clearTimeout(scaredTimer);
    scaredTimer = null;
    
    loadMap();
    resetPositions();
    updateHUD();
}

// Rendering
function draw() {
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);

    for (const w of walls) {
        drawWall(w.x, w.y);
    }

    ctx.fillStyle = CLR_FOOD;
    ctx.shadowColor = CLR_FOOD;
    ctx.shadowBlur = 4;
    for (const f of foods) {
        ctx.beginPath();
        ctx.arc(f.x + f.w/2, f.y + f.h/2, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 200);
    ctx.fillStyle = CLR_POWER;
    ctx.shadowColor = CLR_POWER;
    ctx.shadowBlur = 10 * pulse;
    for (const p of powers) {
        ctx.beginPath();
        ctx.arc(p.x + p.w/2, p.y + p.h/2, 6 * pulse, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    for (const g of ghosts) {
        drawGhost(g);
    }

    drawPacman();
}

function drawWall(x, y) {
    const inset = 1;
    const r = 4;
    const wx = x + inset;
    const wy = y + inset;
    const ww = TILE - inset * 2;
    const wh = TILE - inset * 2;

    ctx.fillStyle = CLR_WALL;
    ctx.shadowColor = CLR_WALL_EDGE;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, r);
    ctx.fill();

    ctx.strokeStyle = CLR_WALL_EDGE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function drawPacman() {
    const cx = pacman.x + TILE / 2;
    const cy = pacman.y + TILE / 2;
    const radius = TILE / 2 - 2;

    let startAngle, endAngle;
    const mouthOpen = 0.25 * Math.PI;
    const chop = Math.abs(Math.sin(Date.now() / 80)) * mouthOpen;

    if (pacman.dir === 'R') {
        startAngle = chop;
        endAngle = Math.PI * 2 - chop;
    } else if (pacman.dir === 'L') {
        startAngle = Math.PI + chop;
        endAngle = Math.PI - chop;
    } else if (pacman.dir === 'U') {
        startAngle = Math.PI * 1.5 + chop;
        endAngle = Math.PI * 1.5 - chop;
    } else {
        startAngle = Math.PI * 0.5 + chop;
        endAngle = Math.PI * 0.5 - chop;
    }

    ctx.shadowColor = CLR_PACMAN;
    ctx.shadowBlur = 12;

    ctx.fillStyle = CLR_PACMAN;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
}

function drawGhost(g) {
    const cx = g.x + TILE / 2;
    const cy = g.y + TILE / 2;
    const r = TILE / 2 - 2;

    let bodyColor;
    if (g.scared) {
        const elapsed = scaredTimer ? SCARED_TIME - SCARED_TIME : 0;
        bodyColor = CLR_SCARED;
    } else {
        bodyColor = GHOST_COLORS[g.colorIdx];
    }

    ctx.fillStyle = bodyColor;
    ctx.shadowColor = bodyColor;
    ctx.shadowBlur = 8;

    // Draw dome top and wavy bottom
    ctx.beginPath();
    ctx.arc(cx, cy - 2, r, Math.PI, 0);
    ctx.lineTo(cx + r, cy + r - 2);

    const waves = 3;
    const waveW = (r * 2) / waves;
    for (let i = 0; i < waves; i++) {
        const wx = cx + r - waveW * i;
        ctx.quadraticCurveTo(
            wx - waveW * 0.25, cy + r + 4,
            wx - waveW * 0.5, cy + r - 2
        );
        ctx.quadraticCurveTo(
            wx - waveW * 0.75, cy + r - 8,
            wx - waveW, cy + r - 2
        );
    }

    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw eyes
    const eyeR = 3.5;
    const eyeOffX = 4;
    const eyeOffY = -4;

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - eyeOffX, cy + eyeOffY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + eyeOffX, cy + eyeOffY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Draw pupils
    let px = 0, py = 0;
    if (g.dir === 'L') px = -1.5;
    if (g.dir === 'R') px = 1.5;
    if (g.dir === 'U') py = -1.5;
    if (g.dir === 'D') py = 1.5;

    ctx.fillStyle = g.scared ? '#fff' : '#111';

    ctx.beginPath();
    ctx.arc(cx - eyeOffX + px, cy + eyeOffY + py, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + eyeOffX + px, cy + eyeOffY + py, 1.8, 0, Math.PI * 2);
    ctx.fill();
}

function updateHUD() {
    scoreEl().textContent = score;
    levelEl().textContent = level;

    const container = livesEl();
    container.innerHTML = '';
    for (let i = 0; i < lives; i++) {
        const dot = document.createElement('span');
        dot.className = 'life-dot';
        container.appendChild(dot);
    }
}

function showMessage(title, sub, isGameOver = false) {
    overlayEl().classList.remove('hidden');
    const textEl = msgTextEl();
    textEl.textContent = title;
    msgSubEl().textContent = sub || '';
    
    if (isGameOver) {
        textEl.classList.add('game-over');
    } else {
        textEl.classList.remove('game-over');
    }
}

function hideMessage() {
    overlayEl().classList.add('hidden');
}