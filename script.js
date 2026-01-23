const colors = ['red', 'blue', 'green', 'yellow'];
let deck = [], discardPile = [];
let playerHand = [], aiHand = [], playerBody = [], aiBody = [];
let selectedForDiscard = new Set(); 
let multiDiscardMode = false; 

// --- VARIABLES MULTIJUGADOR ---
let isMultiplayer = false;
let isHost = false;
let peer = null;
let conn = null;
let myTurn = true; 
let gameActive = false;

// Variables de Nombre
let myPlayerName = "Jugador";
let opponentName = "Rival";

// Puntuación
let playerWins = 0;
let aiWins = 0;

const translations = { 'organ': 'ÓRGANO', 'virus': 'VIRUS', 'medicine': 'MEDICINA', 'treatment': 'TRATAMIENTO', 'multicolor': 'MULTICOLOR' };
const icons = {
    organ: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M462.3 62.6C407.5 15.9 326 24.3 275.7 76.2L256 96.5l-19.7-20.3C186.1 24.3 104.5 15.9 49.7 62.6c-62.8 53.6-66.1 149.8-9.9 207.9l193.5 199.8c12.5 12.9 32.8 12.9 45.3 0l193.5-199.8c56.3-58.1 53-154.3-9.8-207.9z"/></svg>`,
    virus: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M256 0c141.4 0 256 114.6 256 256S397.4 512 256 512 0 397.4 0 256 114.6 0 256 0zM176 256c0-44.2 35.8-80 80-80s80 35.8 80 80-35.8 80-80 80-80-35.8-80-80z"/></svg>`,
    medicine: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M174.7 96.6L10.2 446.5c-13.6 31.2 9.3 65.5 43.4 65.5h316.8c34.1 0 56.9-34.3 43.4-65.5L251.3 96.6c-17-39.1-73.2-39.1-90.2 0z"/></svg>`,
    shield: `<svg viewBox="0 0 512 512"><path fill="#2980b9" d="M466.5 83.7l-192-80a48.15 48.15 0 0 0-36.9 0l-192 80C27.7 91.1 16 108.6 16 128c0 198.3 114.5 335.7 221.5 380.3 11.8 4.9 25.1 4.9 36.9 0C381.5 463.7 496 326.3 496 128c0-19.4-11.7-36.9-29.5-44.3z"/></svg>`,
    treatment: `<svg viewBox="0 0 512 512"><path fill="white" d="M256 0L32 96l32 320 192 96 192-96 32-320L256 0z"/></svg>`
};

// --- MENÚ Y CONFIGURACIÓN ---
function startLocalGame() {
    isMultiplayer = false;
    isHost = true;
    opponentName = "JULIO"; 
    myPlayerName = document.getElementById('username').value || "Jugador"; 
    
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-container').classList.remove('blurred');
    document.getElementById('rival-name').innerText = opponentName;
    document.getElementById('rival-area-title').innerText = "🤖 La salud de " + opponentName;
    loadScores();
    initGame();
}

function showMultiplayerOptions() {
    myPlayerName = document.getElementById('username').value;
    if(!myPlayerName) { alert("¡Por favor, escribe tu nombre primero!"); return; }
    document.getElementById('mp-options').style.display = 'block';
}

// --- ESTA ERA LA FUNCIÓN QUE FALTABA ---
function joinRoomUI() {
    // Ocultar botones iniciales para limpiar pantalla
    document.querySelector('.mp-action-btn.host').style.display = 'none';
    document.querySelector('.mp-action-btn.join').style.display = 'none';
    // Mostrar input
    document.getElementById('join-input-area').style.display = 'block';
}
// ----------------------------------------

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// --- LÓGICA RED ---
function createRoom() {
    // Ocultar botones iniciales
    document.querySelector('.mp-action-btn.host').style.display = 'none';
    document.querySelector('.mp-action-btn.join').style.display = 'none';

    const code = generateRoomCode();
    document.getElementById('my-code').innerText = code;
    document.getElementById('room-code-display').style.display = 'block';
    
    peer = new Peer('virus_game_' + code);
    
    peer.on('connection', (connection) => {
        conn = connection;
        setupConnection();
    });
}

function connectToPeer() {
    const code = document.getElementById('remote-code-input').value.toUpperCase();
    if (!code) return alert("Introduce un código");
    
    peer = new Peer();
    peer.on('open', () => {
        conn = peer.connect('virus_game_' + code);
        setupConnection();
    });
}

function setupConnection() {
    conn.on('open', () => {
        // Al conectar, enviamos nuestro nombre (HANDSHAKE)
        sendData('HANDSHAKE', { name: myPlayerName });
    });

    conn.on('data', (data) => {
        handleNetworkData(data);
    });
}

function sendData(type, content) {
    if (conn && conn.open) {
        conn.send({ type: type, content: content });
    }
}

function handleNetworkData(data) {
    if (data.type === 'HANDSHAKE') {
        // RECIBIMOS EL NOMBRE DEL RIVAL
        opponentName = data.content.name.toUpperCase();
        
        // Configurar UI
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('game-container').classList.remove('blurred');
        document.getElementById('connection-status').innerText = "Conectado con " + opponentName;
        document.getElementById('rival-name').innerText = opponentName;
        document.getElementById('rival-area-title').innerText = "👤 Salud de " + opponentName;
        
        // Si soy el Host, ahora que tengo el nombre, inicio la partida
        if (isHost) {
            isMultiplayer = true;
            myTurn = true;
            document.getElementById('restart-btn').style.display = 'none';
            resetSeries(); 
        } else {
            isMultiplayer = true;
            isHost = false;
        }
    }

    if (data.type === 'STATE_UPDATE') {
        const state = data.content;
        playerHand = state.p2Hand; 
        aiHand = state.p1Hand;     
        playerBody = state.p2Body;
        aiBody = state.p1Body;
        deck = state.deck;
        discardPile = state.discard;
        myTurn = state.turn === 'p2'; 
        playerWins = state.wins.p2;
        aiWins = state.wins.p1;
        
        updateScoreboard();
        render();
        // MENSAJES PERSONALIZADOS
        notify(myTurn ? "¡Tu turno, " + myPlayerName + "!" : "Turno de " + opponentName + "...");
        
        if (checkWinCondition(playerBody)) alert("¡GANASTE LA RONDA!");
        if (checkWinCondition(aiBody)) alert(opponentName + " GANA LA RONDA");
    }
    
    if (data.type === 'MOVE' && isHost) {
        executeRemoteMove(data.content);
    }
}

// --- JUEGO CORE ---

function initGame() {
    deck = []; discardPile = []; playerHand = []; aiHand = []; playerBody = []; aiBody = []; 
    selectedForDiscard.clear(); multiDiscardMode = false;
    
    colors.forEach(c => {
        for(let i=0; i<4; i++) deck.push({color: c, type: 'organ'});
        for(let i=0; i<4; i++) deck.push({color: c, type: 'virus'});
        for(let i=0; i<4; i++) deck.push({color: c, type: 'medicine'});
    });
    ['organ', 'virus', 'medicine'].forEach(t => deck.push({color: 'multicolor', type: t}));
    ['Ladrón', 'Trasplante', 'Contagio', 'Guante de Látex', 'Error Médico'].forEach(t => deck.push({type: 'treatment', name: t}));

    deck = deck.sort(() => Math.random() - 0.5);
    
    for(let i=0; i<3; i++) { 
        if(deck.length) playerHand.push(deck.pop()); 
        if(deck.length) aiHand.push(deck.pop()); 
    }
    
    updateScoreboard();
    notify(isMultiplayer ? (isHost ? "Tu turno, " + myPlayerName : "Esperando a " + opponentName) : "¡A jugar! Derrota a " + opponentName);
    
    if (isMultiplayer && isHost) {
        broadcastState();
    }
    
    render();
}

function broadcastState() {
    if (!isMultiplayer || !isHost) return;
    
    const gameState = {
        p1Hand: playerHand,
        p2Hand: aiHand, 
        p1Body: playerBody,
        p2Body: aiBody,
        deck: deck, 
        discard: discardPile,
        turn: myTurn ? 'p1' : 'p2',
        wins: { p1: playerWins, p2: aiWins }
    };
    sendData('STATE_UPDATE', gameState);
}

function updateScoreboard() {
    document.getElementById('p-score').innerText = playerWins;
    document.getElementById('a-score').innerText = aiWins;
}

function loadScores() {
    if(!isMultiplayer && localStorage.getItem('virus_playerWins')) {
        playerWins = parseInt(localStorage.getItem('virus_playerWins'));
        aiWins = parseInt(localStorage.getItem('virus_aiWins'));
    }
}

function resetSeries() {
    playerWins = 0; aiWins = 0;
    if (!isMultiplayer) {
        localStorage.setItem('virus_playerWins', 0);
        localStorage.setItem('virus_aiWins', 0);
    }
    initGame();
}

function confirmRestartSeries() {
    if(isMultiplayer && !isHost) return;
    setTimeout(() => { if(confirm("¿Reiniciar partida?")) resetSeries(); }, 50);
}

function notify(msg) {
    document.getElementById('notification-bar').innerText = msg;
}

function drawCard() {
    if (deck.length === 0) {
        if (discardPile.length > 0) {
            deck = discardPile.sort(() => Math.random() - 0.5);
            discardPile = [];
        } else return null;
    }
    return deck.pop();
}

// --- ACCIONES ---

function playCard(index) {
    if (isMultiplayer && !myTurn) {
        notify("⛔ Es el turno de " + opponentName);
        return;
    }

    if (multiDiscardMode) { toggleSelection(index); return; }

    if (isMultiplayer && !isHost) {
        sendData('MOVE', { action: 'play', index: index });
        return; 
    }

    executeMove(index, true);
}

function executeMove(index, isPlayerMove) {
    let currentHand = isPlayerMove ? playerHand : aiHand;
    let currentBody = isPlayerMove ? playerBody : aiBody;
    let rivalBody = isPlayerMove ? aiBody : playerBody;
    
    const card = currentHand[index];
    let actionSuccess = false;
    let keepCard = false;

    if (card.type === 'treatment') {
        actionSuccess = applyTreatment(card.name, isPlayerMove);
    } 
    else if (card.type === 'organ') {
        if (!currentBody.find(o => o.color === card.color)) { 
            currentBody.push({color: card.color, vaccines: 0, infected: false}); 
            actionSuccess = true; keepCard = true; 
        } else if(isPlayerMove) notify("⚠️ Ya tienes ese color");
    } 
    else if (card.type === 'medicine') {
        let target = currentBody.find(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2));
        if (target) {
            if(isPlayerMove && confirmApply(target, currentBody, card)) {
                 if (target.infected) target.infected = false; else target.vaccines++; actionSuccess = true;
            } else if (!isPlayerMove) { 
                 if (target.infected) target.infected = false; else target.vaccines++; actionSuccess = true;
            }
        } else if(isPlayerMove) notify("⚠️ No hay objetivo válido");
    } 
    else if (card.type === 'virus') {
        let target = rivalBody.find(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2);
        if (target) {
             if(isPlayerMove && confirmInfect(target, rivalBody, card)) {
                if (target.vaccines > 0) target.vaccines--; 
                else if (!target.infected) target.infected = true; 
                else { 
                    if (isPlayerMove) aiBody = aiBody.filter(o => o !== target);
                    else playerBody = playerBody.filter(o => o !== target);
                    discardPile.push({color: target.color, type: 'organ'}); 
                }
                actionSuccess = true;
             } else if (!isPlayerMove) {
                if (target.vaccines > 0) target.vaccines--; 
                else if (!target.infected) target.infected = true; 
                else { 
                    if (isPlayerMove) aiBody = aiBody.filter(o => o !== target);
                    else playerBody = playerBody.filter(o => o !== target);
                    discardPile.push({color: target.color, type: 'organ'}); 
                }
                actionSuccess = true;
             }
        } else if(isPlayerMove) notify("⚠️ No puedes infectar nada");
    }

    if (actionSuccess) {
        if (!keepCard) discardPile.push(card);
        currentHand.splice(index, 1);
        
        while (currentHand.length < 3) { let c = drawCard(); if(c) currentHand.push(c); else break; }

        if (isMultiplayer) {
            myTurn = !myTurn; 
            broadcastState();
        } else {
            render();
            if (!checkWin()) setTimeout(aiTurn, 1000);
            return;
        }
    }
    
    render();
    checkWin();
}

function confirmApply(target, body, card) {
    let candidates = body.filter(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2));
    if (candidates.length <= 1) return true;
    return confirm(`¿Aplicar a Órgano ${target.color.toUpperCase()}?`);
}

function confirmInfect(target, body, card) {
    let candidates = body.filter(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2);
    if (candidates.length <= 1) return true;
    return confirm(`¿Infectar Órgano ${target.color.toUpperCase()}?`);
}

function executeRemoteMove(moveData) {
    if (moveData.action === 'play') {
        executeMove(moveData.index, false); 
    }
    if (moveData.action === 'discard') {
         let card = aiHand[moveData.index];
         discardPile.push(card);
         aiHand.splice(moveData.index, 1);
         while (aiHand.length < 3) { let c = drawCard(); if(c) aiHand.push(c); else break; }
         myTurn = !myTurn;
         broadcastState();
         render();
    }
}

function applyTreatment(name, isPlayer) {
    let myBody = isPlayer ? playerBody : aiBody; 
    let enemyBody = isPlayer ? aiBody : playerBody; 
    let success = false;
    
    switch(name) {
        case 'Ladrón': let stealable = enemyBody.find(o => o.vaccines < 2 && !myBody.some(m => m.color === o.color)); 
            if (stealable) { 
                if (isPlayer) { playerBody.push(stealable); aiBody = aiBody.filter(o => o !== stealable); } 
                else { aiBody.push(stealable); playerBody = playerBody.filter(o => o !== stealable); } 
                success = true; 
            } break;
        case 'Trasplante': 
             // ARREGLADO: Lógica de trasplante para multiplayer
             let myCandidates = myBody.filter(o => o.vaccines < 2);
             let enCandidates = enemyBody.filter(o => o.vaccines < 2);
             let swapFound = false;

             for (let m of myCandidates) {
                for (let e of enCandidates) {
                    let myDupe = myBody.some(curr => curr !== m && curr.color === e.color);
                    let enDupe = enemyBody.some(curr => curr !== e && curr.color === m.color);
                    if (!myDupe && !enDupe) {
                        if (isPlayer) {
                            playerBody = playerBody.filter(o => o !== m); aiBody = aiBody.filter(o => o !== e);
                            playerBody.push(e); aiBody.push(m);
                        } else {
                            aiBody = aiBody.filter(o => o !== m); playerBody = playerBody.filter(o => o !== e);
                            aiBody.push(e); playerBody.push(m);
                        }
                        swapFound = true;
                        break; 
                    }
                }
                if (swapFound) break;
             }
             if (swapFound) success = true;
             else if (isPlayer) notify("⚠️ No hay cambio válido");
             break;
        case 'Contagio': 
            let myV = myBody.filter(o => o.infected); 
            if(myV.length > 0) { myV.forEach(o => { let t = enemyBody.find(e => !e.infected && e.vaccines === 0 && e.color === o.color); if (t) { o.infected = false; t.infected = true; } }); success = true; } break;
        case 'Guante de Látex': 
            if (isPlayer) { discardPile.push(...aiHand); aiHand = []; for(let i=0; i<3; i++) { let c = drawCard(); if(c) aiHand.push(c); } } 
            else { discardPile.push(...playerHand); playerHand = []; for(let i=0; i<3; i++) { let c = drawCard(); if(c) playerHand.push(c); } } 
            success = true; break;
        case 'Error Médico': 
            let temp = playerBody; playerBody = aiBody; aiBody = temp; success = true; break;
    }
    return success;
}

function aiTurn() {
    if (isMultiplayer) return; 
    
    // IA "Julio" mejorada
    let played = false;
    for (let i = 0; i < aiHand.length; i++) {
        let card = aiHand[i];
        if (card.type === 'treatment') { played = applyTreatment(card.name, false); }
        else if (card.type === 'organ' && !aiBody.find(o => o.color === card.color)) {
            aiBody.push({color: card.color, vaccines: 0, infected: false}); played = true;
        } else if (card.type === 'virus') {
            let t = playerBody.find(o => (o.color === card.color || card.color === 'multicolor') && o.vaccines < 2);
            if(t) { 
                if(t.vaccines > 0) t.vaccines--; else if(!t.infected) t.infected = true; 
                else { playerBody = playerBody.filter(o => o !== t); discardPile.push({color: t.color, type: 'organ'}); }
                played = true; discardPile.push(card);
            }
        } else if (card.type === 'medicine') {
            let t = aiBody.find(o => (o.color === card.color || card.color === 'multicolor') && (o.infected || o.vaccines < 2));
            if(t) { if(t.infected) t.infected = false; else t.vaccines++; played = true; discardPile.push(card); }
        }
        if (played) { aiHand.splice(i, 1); break; }
    }
    
    if (!played) { 
        discardPile.push(aiHand[0]); aiHand.splice(0, 1); 
        notify("🤖 Julio pasó turno"); 
    }
    while (aiHand.length < 3) { let c = drawCard(); if(c) aiHand.push(c); }
    render(); checkWin();
}

function quickDiscard(index) {
    if(isMultiplayer && !myTurn) return;
    if(isMultiplayer && !isHost) {
        sendData('MOVE', {action: 'discard', index: index});
        return;
    }
    
    discardPile.push(playerHand[index]);
    playerHand.splice(index, 1);
    
    while (playerHand.length < 3) { let c = drawCard(); if(c) playerHand.push(c); else break; }
    
    if(isMultiplayer) { myTurn = !myTurn; broadcastState(); }
    else { render(); setTimeout(aiTurn, 1000); }
    
    render();
}

function render() {
    document.getElementById('deck-count').innerText = deck.length;
    const pHandDiv = document.getElementById('player-hand');
    if(pHandDiv) {
        pHandDiv.innerHTML = ''; 
        playerHand.forEach((c, i) => {
            const container = document.createElement('div'); container.className = 'card-container';
            const cardDiv = document.createElement('div');
            cardDiv.className = `card ${c.color || 'treatment'}`;
            cardDiv.onclick = function() { playCard(i); }; 
            let icon = icons[c.type] || icons.treatment; let label = c.name || translations[c.type];
            cardDiv.innerHTML = `${icon}<b>${label}</b>`;
            const actionBtn = document.createElement('button');
            actionBtn.className = 'discard-btn'; actionBtn.innerText = '🗑️'; actionBtn.onclick = function(e) { e.stopPropagation(); quickDiscard(i); };
            container.appendChild(cardDiv); container.appendChild(actionBtn); pHandDiv.appendChild(container);
        });
    }
    
    const drawBody = (body, id) => {
        const div = document.getElementById(id); if(div) { div.innerHTML = ''; body.forEach(o => { const card = document.createElement('div'); card.className = `card ${o.color} ${o.infected ? 'virus-effect' : ''} ${o.vaccines === 2 ? 'immune' : ''}`; card.innerHTML = `${icons.organ}<b>ÓRGANO</b>`; if(o.vaccines > 0) { let s = ''; for(let k=0; k<o.vaccines; k++) s += icons.shield; card.innerHTML += `<div class="status-row">${s}</div>`; } if(o.infected) card.innerHTML += `<div class="status-row" style="color:#c0392b">⚠️</div>`; div.appendChild(card); }); }
    };
    drawBody(playerBody, 'player-body'); drawBody(aiBody, 'ai-body');
}

function checkWinCondition(body) { return body.filter(o => !o.infected).length >= 4; }
function checkWin() {
    if (checkWinCondition(playerBody)) {
        setTimeout(() => { alert("¡" + myPlayerName + " GANASTE!"); resetSeries(); }, 100);
    }
    if (checkWinCondition(aiBody)) {
        setTimeout(() => { alert("¡" + opponentName + " GANA!"); resetSeries(); }, 100);
    }
}
