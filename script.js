const colors = ['red', 'blue', 'green', 'yellow'];
let deck = [], discardPile = [];
let playerHand = [], aiHand = [], playerBody = [], aiBody = [];
let selectedForDiscard = new Set(); 
let multiDiscardMode = false; 

// --- VARIABLES DE ESTADO ---
let isMultiplayer = false;
let isHost = false;
let peer = null;
let conn = null;
let myTurn = true; 

// Identidad
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

// --- MENÚ Y ARRANQUE ---
function startLocalGame() {
    // 1. Limpieza TOTAL de red
    isMultiplayer = false;
    isHost = true;
    if(peer) { peer.destroy(); peer = null; }
    conn = null;
    
    // 2. Configuración Jugador
    opponentName = "JULIO"; 
    myPlayerName = document.getElementById('username').value || "Jugador"; 
    
    // 3. UI Local
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-container').classList.remove('blurred');
    document.getElementById('rival-name').innerText = opponentName;
    document.getElementById('rival-area-title').innerText = "🤖 La salud de " + opponentName;
    document.getElementById('target-wins').disabled = false;
    document.getElementById('restart-btn').style.display = 'block';
    
    // 4. Iniciar
    loadScores();
    initGame(); // Arranca directo
}

function showMultiplayerOptions() {
    myPlayerName = document.getElementById('username').value;
    if(!myPlayerName) { alert("¡Por favor, escribe tu nombre primero!"); return; }
    document.getElementById('mp-options').style.display = 'block';
}

function joinRoomUI() {
    let btns = document.querySelectorAll('.mp-action-btn');
    btns.forEach(b => b.style.display = 'none');
    document.getElementById('join-input-area').style.display = 'block';
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// --- RED (PEERJS) ---
function createRoom() {
    let btns = document.querySelectorAll('.mp-action-btn');
    btns.forEach(b => b.style.display = 'none');

    const code = generateRoomCode();
    document.getElementById('my-code').innerText = code;
    document.getElementById('room-code-display').style.display = 'block';
    
    if(peer) peer.destroy();
    peer = new Peer('virus_game_' + code);
    
    peer.on('open', (id) => { isHost = true; });
    peer.on('connection', (connection) => { 
        conn = connection; 
        setupConnection(); 
    });
    peer.on('error', (err) => alert("Error de red: " + err));
}

function connectToPeer() {
    const code = document.getElementById('remote-code-input').value.toUpperCase();
    if (!code) return alert("Introduce un código");
    
    isHost = false; 
    if(peer) peer.destroy();
    
    try {
        peer = new Peer();
        peer.on('open', () => { 
            conn = peer.connect('virus_game_' + code); 
            if(!conn) { alert("Error al conectar. Revisa el código."); return; }
            setupConnection(); 
        });
        peer.on('error', (err) => alert("Error al conectar: " + err));
    } catch(e) {
        alert("Error crítico: " + e);
    }
}

function setupConnection() {
    conn.on('open', () => { 
        // Enviar saludo inicial
        sendData('HANDSHAKE', { name: myPlayerName }); 
    });
    conn.on('data', (data) => { handleNetworkData(data); });
    conn.on('close', () => { alert("Conexión perdida"); location.reload(); });
}

function sendData(type, content) {
    if (conn && conn.open) { 
        try { conn.send({ type: type, content: content }); } 
        catch(e) { console.error(e); }
    }
}

function handleNetworkData(data) {
    if (data.type === 'HANDSHAKE') {
        opponentName = data.content.name.toUpperCase();
        
        // UI
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('game-container').classList.remove('blurred');
        document.getElementById('rival-name').innerText = opponentName;
        document.getElementById('rival-area-title').innerText = "👤 Salud de " + opponentName;
        document.getElementById('connection-status').innerText = "";
        
        isMultiplayer = true;

        if (isHost) {
            // El Host responde y ARRANCA
            sendData('HANDSHAKE_REPLY', { name: myPlayerName });
            document.getElementById('restart-btn').style.display = 'none';
            document.getElementById('target-wins').disabled = false; 
            
            playerWins = 0; aiWins = 0;
            updateScoreboard();
            setTimeout(() => initGame(), 500); 
        } 
    }

    if (data.type === 'HANDSHAKE_REPLY') {
        opponentName = data.content.name.toUpperCase();
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('game-container').classList.remove('blurred');
        document.getElementById('rival-name').innerText = opponentName;
        document.getElementById('rival-area-title').innerText = "👤 Salud de " + opponentName;
        
        isMultiplayer = true;
        document.getElementById('target-wins').disabled = true; 
        document.getElementById('restart-btn').style.display = 'none';
        notify("Conectado. Esperando reparto...");
    }

    if (data.type === 'STATE_UPDATE') {
        applyGameState(data.content);
    }
    
    if (data.type === 'MOVE' && isHost) {
        if (data.content.action === 'multi_discard') {
            let indices = data.content.indices.sort((a,b)=>b-a);
            indices.forEach(i => { discardPile.push(aiHand[i]); aiHand.splice(i,1); });
            while (aiHand.length < 3) { let c = drawCard(); if(c) aiHand.push(c); else break; }
            myTurn = !myTurn;
            broadcastState();
            render();
        } else {
            executeRemoteMove(data.content);
        }
    }
}

function applyGameState(state) {
    playerHand = state.p2Hand || []; 
    aiHand = state.p1Hand || [];     
    playerBody = state.p2Body || []; 
    aiBody = state.p1Body || [];
    deck = state.deck || []; 
    discardPile = state.discard || [];
    
    myTurn = (state.turn === 'p2'); 
    playerWins = state.wins.p2;
    aiWins = state.wins.p1;
    
    updateScoreboard();
    render(); 
    
    if (myTurn) notify("¡Tu turno, " + myPlayerName + "!");
    else notify("Turno de " + opponentName + "...");
    
    if (checkWinCondition(playerBody)) alert("¡GANASTE LA RONDA!");
    if (checkWinCondition(aiBody)) alert(opponentName + " GANA LA RONDA");
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
    
    if (isHost || !isMultiplayer) myTurn = true; 
    else myTurn = false;

    updateScoreboard();
    render(); // Importante: Dibuja inmediatamente
    
    if (isMultiplayer && isHost) {
        notify("Tu turno, " + myPlayerName); 
        setTimeout(broadcastState, 300); 
    } else if (!isMultiplayer) { 
        notify("¡A jugar! Derrota a " + opponentName); 
    }
}

function broadcastState() {
    if (!isMultiplayer || !isHost) return;
    const gameState = {
        p1Hand: playerHand, p2Hand: aiHand, 
        p1Body: playerBody, p2Body: aiBody,
        deck: deck, discard: discardPile,
        turn: myTurn ? 'p1' : 'p2',
        wins: { p1: playerWins, p2: aiWins }
    };
    sendData('STATE_UPDATE', gameState);
}

function updateScoreboard() {
    const pScore = document.getElementById('p-score');
    const aScore = document.getElementById('a-score');
    if(pScore) pScore.innerText = playerWins;
    if(aScore) aScore.innerText = aiWins;
}

function loadScores() {
    if(!isMultiplayer && localStorage.getItem('virus_playerWins')) {
        playerWins = parseInt(localStorage.getItem('virus_playerWins')) || 0;
        aiWins = parseInt(localStorage.getItem('virus_aiWins')) || 0;
    }
}

function resetSeries() {
    if (isMultiplayer && !isHost) return;
    playerWins = 0; aiWins = 0;
    if (!isMultiplayer) { localStorage.setItem('virus_playerWins', 0); localStorage.setItem('virus_aiWins', 0); }
    initGame();
}

function confirmRestartSeries() {
    if(isMultiplayer && !isHost) return;
    setTimeout(() => { if(confirm("¿Reiniciar partida?")) resetSeries(); }, 50);
}

function notify(msg) { 
    const el = document.getElementById('notification-bar');
    if(el) el.innerText = msg; 
}

function drawCard() {
    if (deck.length === 0) {
        if (discardPile.length > 0) { deck = discardPile.sort(() => Math.random() - 0.5); discardPile = []; } else return null;
    } return deck.pop();
}

// --- LOGICA JUEGO (RESTAURADA: Preguntas + Ladrón) ---
function playCard(index) {
    if (isMultiplayer && !myTurn) { notify("⛔ Es el turno de " + opponentName); return; }
    if (multiDiscardMode) { toggleSelection(index); return; }

    const card = playerHand[index];
    let selectedColor = null;

    // 1. MEDICINA (Elección manual si hay duda)
    if (card.type === 'medicine') {
        let candidates = playerBody.filter(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2));
        if (candidates.length > 1) {
            for (let target of candidates) {
                if (confirm(`¿Aplicar a Órgano ${target.color.toUpperCase()}?`)) { selectedColor = target.color; break; }
            }
            if (!selectedColor) return;
        }
    }
    // 2. VIRUS (Elección manual si hay duda)
    if (card.type === 'virus') {
        let candidates = aiBody.filter(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2);
        if (candidates.length > 1) {
            for (let target of candidates) {
                if (confirm(`¿Infectar Órgano ${target.color.toUpperCase()}?`)) { selectedColor = target.color; break; }
            }
            if (!selectedColor) return;
        }
    }
    // 3. LADRÓN (Elección manual)
    if (card.name === 'Ladrón') {
        let stealable = aiBody.filter(o => o.vaccines < 2 && !playerBody.some(m => m.color === o.color));
        if (stealable.length > 1) {
            for (let target of stealable) {
                if (confirm(`¿Robar Órgano ${target.color.toUpperCase()}?`)) { selectedColor = target.color; break; }
            }
            if (!selectedColor) return;
        } else if (stealable.length === 0) {
            notify("⚠️ No hay órganos para robar"); return;
        }
    }

    if (isMultiplayer && !isHost) {
        sendData('MOVE', { action: 'play', index: index, targetColor: selectedColor });
        return; 
    }

    executeMove(index, true, selectedColor);
}

function executeMove(index, isPlayerMove, forcedTargetColor = null) {
    let currentHand = isPlayerMove ? playerHand : aiHand;
    let currentBody = isPlayerMove ? playerBody : aiBody;
    let rivalBody = isPlayerMove ? aiBody : playerBody;
    
    const card = currentHand[index];
    if(!card) return;

    let actionSuccess = false;
    let keepCard = false;

    if (card.type === 'treatment') {
        actionSuccess = applyTreatment(card.name, isPlayerMove, forcedTargetColor);
    } 
    else if (card.type === 'organ') {
        // REGLA: No repetir colores
        if (!currentBody.find(o => o.color === card.color)) { 
            currentBody.push({color: card.color, vaccines: 0, infected: false}); 
            actionSuccess = true; keepCard = true; 
        } else if(isPlayerMove && !isMultiplayer) notify("⚠️ Ya tienes ese color");
    } 
    else if (card.type === 'medicine') {
        let candidates = currentBody.filter(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2));
        let target = null;
        if (forcedTargetColor) target = candidates.find(o => o.color === forcedTargetColor);
        else if (candidates.length > 0) target = candidates[0];

        if (target) {
             if (target.infected) target.infected = false; else target.vaccines++; 
             actionSuccess = true;
        } else if(isPlayerMove && !isMultiplayer) notify("⚠️ No hay objetivo válido");
    } 
    else if (card.type === 'virus') {
        let candidates = rivalBody.filter(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2);
        let target = null;
        if (forcedTargetColor) target = candidates.find(o => o.color === forcedTargetColor);
        else if (candidates.length > 0) target = candidates[0];

        if (target) {
            if (target.vaccines > 0) target.vaccines--; 
            else if (!target.infected) target.infected = true; 
            else { 
                if (isPlayerMove) aiBody = aiBody.filter(o => o !== target);
                else playerBody = playerBody.filter(o => o !== target);
                discardPile.push({color: target.color, type: 'organ'}); 
            }
            actionSuccess = true;
        } else if(isPlayerMove && !isMultiplayer) notify("⚠️ No puedes infectar nada");
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

function executeRemoteMove(moveData) {
    if (moveData.action === 'play') executeMove(moveData.index, false, moveData.targetColor); 
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

function applyTreatment(name, isPlayer, forcedTargetColor = null) {
    let myBody = isPlayer ? playerBody : aiBody; 
    let enemyBody = isPlayer ? aiBody : playerBody; 
    let success = false;
    
    switch(name) {
        case 'Ladrón': 
            let stealable = enemyBody.filter(o => o.vaccines < 2 && !myBody.some(m => m.color === o.color));
            let targetToSteal = null;
            if (forcedTargetColor) targetToSteal = stealable.find(o => o.color === forcedTargetColor);
            else if (stealable.length > 0) targetToSteal = stealable[0];

            if (targetToSteal) { 
                if (isPlayer) { playerBody.push(targetToSteal); aiBody = aiBody.filter(o => o !== targetToSteal); } 
                else { aiBody.push(targetToSteal); playerBody = playerBody.filter(o => o !== targetToSteal); } 
                success = true; 
            } else if (isPlayer && !isMultiplayer) notify("⚠️ No puedes robar nada válido");
            break;

        case 'Trasplante': 
             let myC = myBody.filter(o => o.vaccines < 2);
             let enC = enemyBody.filter(o => o.vaccines < 2);
             let swapFound = false;
             for (let m of myC) {
                for (let e of enC) {
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
                        swapFound = true; break; 
                    }
                }
                if (swapFound) break;
             }
             if (swapFound) success = true;
             else if (isPlayer && !isMultiplayer) notify("⚠️ Trasplante imposible");
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

function quickDiscard(index) {
    if(isMultiplayer && !myTurn) return;
    if(multiDiscardMode) { toggleSelection(index); return; }

    if(isMultiplayer && !isHost) { sendData('MOVE', {action: 'discard', index: index}); return; }
    
    discardPile.push(playerHand[index]);
    playerHand.splice(index, 1);
    while (playerHand.length < 3) { let c = drawCard(); if(c) playerHand.push(c); else break; }
    
    if(isMultiplayer) { myTurn = !myTurn; broadcastState(); }
    else { render(); setTimeout(aiTurn, 1000); }
    render();
}

function aiTurn() {
    if (isMultiplayer) return; 
    let played = false;
    for(let i=0; i<aiHand.length; i++) {
        let c = aiHand[i];
        // IA simple: jugar órganos
        if(c.type === 'organ' && !aiBody.find(o=>o.color === c.color)) {
            aiBody.push({color: c.color, vaccines:0, infected:false});
            aiHand.splice(i,1); played = true; break;
        }
    }
    if(!played) { discardPile.push(aiHand[0]); aiHand.splice(0,1); }
    while (aiHand.length < 3) { let c = drawCard(); if(c) aiHand.push(c); }
    render(); checkWin();
}

function render() {
    document.getElementById('deck-count').innerText = deck.length;
    
    const playerSection = document.querySelector('.board-section:last-of-type'); 
    const rivalSection = document.querySelector('.board-section:first-of-type'); 
    
    if (myTurn) {
        if(playerSection) { playerSection.classList.add('active-turn'); playerSection.classList.remove('waiting-turn'); }
        if(rivalSection) { rivalSection.classList.add('active-turn'); rivalSection.classList.remove('waiting-turn'); }
    } else {
        if(playerSection) { playerSection.classList.add('waiting-turn'); playerSection.classList.remove('active-turn'); }
        if(rivalSection) { rivalSection.classList.add('waiting-turn'); rivalSection.classList.remove('active-turn'); }
    }

    const pHandDiv = document.getElementById('player-hand');
    if(pHandDiv) {
        pHandDiv.innerHTML = ''; 
        playerHand.forEach((c, i) => {
            const container = document.createElement('div'); container.className = 'card-container';
            const cardDiv = document.createElement('div');
            let isSelected = selectedForDiscard.has(i);
            cardDiv.className = `card ${c.color || 'treatment'} ${isSelected ? 'selected-discard' : ''}`;
            cardDiv.onclick = function() { playCard(i); }; 
            let icon = icons[c.type] || icons.treatment; let label = c.name || translations[c.type];
            cardDiv.innerHTML = `${icon}<b>${label}</b>`;
            const actionBtn = document.createElement('button');
            if (multiDiscardMode) {
                actionBtn.className = isSelected ? 'discard-btn active' : 'discard-btn';
                actionBtn.innerText = isSelected ? '❌' : '✅';
                actionBtn.onclick = function(e) { e.stopPropagation(); toggleSelection(i); };
            } else {
                actionBtn.className = 'discard-btn'; actionBtn.innerText = '🗑️'; 
                actionBtn.onclick = function(e) { e.stopPropagation(); quickDiscard(i); };
            }
            container.appendChild(cardDiv); container.appendChild(actionBtn); pHandDiv.appendChild(container);
        });
    }
    
    const drawBody = (body, id) => {
        const div = document.getElementById(id); if(div) { div.innerHTML = ''; body.forEach(o => { const card = document.createElement('div'); card.className = `card ${o.color} ${o.infected ? 'virus-effect' : ''} ${o.vaccines === 2 ? 'immune' : ''}`; card.innerHTML = `${icons.organ}<b>ÓRGANO</b>`; if(o.vaccines > 0) { let s = ''; for(let k=0; k<o.vaccines; k++) s += icons.shield; card.innerHTML += `<div class="status-row">${s}</div>`; } if(o.infected) card.innerHTML += `<div class="status-row" style="color:#c0392b">⚠️</div>`; div.appendChild(card); }); }
    };
    drawBody(playerBody, 'player-body'); drawBody(aiBody, 'ai-body');
    
    const controlsArea = document.getElementById('dynamic-controls');
    if(controlsArea) {
        controlsArea.innerHTML = ''; 
        if (!multiDiscardMode) {
            const toggleBtn = document.createElement('button');
            toggleBtn.innerHTML = '⚙️ Selección';
            toggleBtn.className = 'toggle-mode-btn';
            toggleBtn.onclick = toggleMultiDiscardMode;
            controlsArea.appendChild(toggleBtn);
        } else {
            const confirmBtn = document.createElement('button');
            confirmBtn.innerHTML = `🗑️ Borrar (${selectedForDiscard.size})`;
            confirmBtn.className = 'main-action-btn';
            confirmBtn.onclick = confirmMultiDiscard;
            const cancelBtn = document.createElement('button');
            cancelBtn.innerText = 'Cancelar';
            cancelBtn.className = 'cancel-btn';
            cancelBtn.onclick = toggleMultiDiscardMode;
            controlsArea.appendChild(confirmBtn); controlsArea.appendChild(cancelBtn);
        }
    }
}

function checkWinCondition(body) { return body.filter(o => !o.infected).length >= 4; }
function checkWin() {
    if (checkWinCondition(playerBody)) { setTimeout(() => { alert("¡" + myPlayerName + " GANASTE!"); resetSeries(); }, 100); }
    if (checkWinCondition(aiBody)) { setTimeout(() => { alert("¡" + opponentName + " GANA!"); resetSeries(); }, 100); }
}

function toggleMultiDiscardMode() { multiDiscardMode = !multiDiscardMode; selectedForDiscard.clear(); render(); }
function toggleSelection(index) { if (selectedForDiscard.has(index)) selectedForDiscard.delete(index); else selectedForDiscard.add(index); render(); }
function confirmMultiDiscard() { 
    if (selectedForDiscard.size === 0) { toggleMultiDiscardMode(); return; } 
    let indices = Array.from(selectedForDiscard).sort((a, b) => b - a);
    
    if(isMultiplayer && !isHost) {
        sendData('MOVE', {action: 'multi_discard', indices: indices});
    } else {
        indices.forEach(i => { discardPile.push(playerHand[i]); playerHand.splice(i, 1); });
        while (playerHand.length < 3) { let c = drawCard(); if(c) playerHand.push(c); else break; }
        if(isMultiplayer) { myTurn = !myTurn; broadcastState(); }
        else { render(); setTimeout(aiTurn, 1000); }
    }
    
    multiDiscardMode = false; selectedForDiscard.clear(); render();
}
