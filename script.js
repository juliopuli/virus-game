const colors = ['red', 'blue', 'green', 'yellow'];
let deck = [], discardPile = [];
let players = []; 
let myPlayerIndex = -1; 
let selectedForDiscard = new Set(); 
let multiDiscardMode = false; 

// --- VARIABLES DE ESTADO ---
let isMultiplayer = false;
let isHost = false;
let mqttClient = null;
let roomCode = null;
let turnIndex = 0; 
let lastActionLog = "Esperando inicio...";
let chatMessages = [];
let isChatOpen = false;
let pendingAction = null; 
let transplantSource = null;
let visualDeckCount = 0;
let joinInterval = null;
let hostBeaconInterval = null;
let targetWins = 3; 

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'virusgame/v3_6/'; // Canal nuevo V3.6

const icons = {
    organ: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M462.3 62.6C407.5 15.9 326 24.3 275.7 76.2L256 96.5l-19.7-20.3C186.1 24.3 104.5 15.9 49.7 62.6c-62.8 53.6-66.1 149.8-9.9 207.9l193.5 199.8c12.5 12.9 32.8 12.9 45.3 0l193.5-199.8c56.3-58.1 53-154.3-9.8-207.9z"/></svg>`,
    virus: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M256 0c141.4 0 256 114.6 256 256S397.4 512 256 512 0 397.4 0 256 114.6 0 256 0zM176 256c0-44.2 35.8-80 80-80s80 35.8 80 80-35.8 80-80 80-80-35.8-80-80z"/></svg>`,
    medicine: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M174.7 96.6L10.2 446.5c-13.6 31.2 9.3 65.5 43.4 65.5h316.8c34.1 0 56.9-34.3 43.4-65.5L251.3 96.6c-17-39.1-73.2-39.1-90.2 0z"/></svg>`,
    treatment: `<svg viewBox="0 0 512 512"><path fill="white" d="M256 0L32 96l32 320 192 96 192-96 32-320L256 0z"/></svg>`
};

// --- MENÚ ---
function startLocalGame() {
    stopNetwork();
    isMultiplayer = false; isHost = true;
    let name = document.getElementById('username').value || "Jugador";
    name = name.substring(0, 10);
    
    players = [
        { name: name, hand: [], body: [], wins: 0, isBot: false },
        { name: "JULIO", hand: [], body: [], wins: 0, isBot: true }
    ];
    myPlayerIndex = 0;
    
    startGameUI(); 
    initGame();
}

function showMultiplayerOptions() {
    let name = document.getElementById('username').value;
    if(!name) return alert("¡Escribe tu nombre!");
    document.getElementById('mp-options').style.display = 'block';
}

function joinRoomUI() {
    document.querySelectorAll('.mp-action-btn').forEach(b => b.style.display = 'none');
    document.getElementById('join-input-area').style.display = 'block';
}

function startGameUI() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-container').classList.remove('blurred');
    document.getElementById('chat-btn').style.display = isMultiplayer ? 'flex' : 'none';
    document.getElementById('restart-btn').style.display = 'block';
    
    // Chat Enter Fix
    const chatIn = document.getElementById('chat-input');
    const newChatIn = chatIn.cloneNode(true);
    chatIn.parentNode.replaceChild(newChatIn, chatIn);
    newChatIn.addEventListener("keypress", function(event) {
        if (event.key === "Enter") { event.preventDefault(); sendChatMessage(); }
    });
}

function stopNetwork() {
    if(joinInterval) clearInterval(joinInterval);
    if(hostBeaconInterval) clearInterval(hostBeaconInterval);
    if(mqttClient) { mqttClient.end(); mqttClient = null; }
}

// --- RED (MQTT) ---
function createRoom() {
    roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('my-code').innerText = roomCode;
    document.getElementById('room-code-display').style.display = 'block';
    document.querySelectorAll('.mp-action-btn').forEach(b => b.style.display = 'none');
    
    isHost = true; isMultiplayer = true;
    let name = document.getElementById('username').value;
    name = name.substring(0,10);
    players = [{ name: name, hand: [], body: [], wins: 0, isBot: false }];
    myPlayerIndex = 0;
    
    updateLobbyUI();
    connectMqtt();
}

function connectToPeer() {
    const code = document.getElementById('remote-code-input').value;
    if (!code) return alert("Falta código");
    isHost = false; isMultiplayer = true;
    roomCode = code;
    connectMqtt();
}

function connectMqtt() {
    stopNetwork();
    const clientId = 'v36_' + Math.random().toString(16).substr(2, 8);
    mqttClient = mqtt.connect(BROKER_URL, { clean: true, clientId: clientId });

    mqttClient.on('connect', () => {
        mqttClient.subscribe(`${TOPIC_PREFIX}${roomCode}`, { qos: 1 }, (err) => {
            if (!err) {
                if (isHost) {
                    // Host Beacon
                    hostBeaconInterval = setInterval(() => {
                        sendData('LOBBY_UPDATE', { names: players.map(p => p.name) });
                    }, 2000);
                } else {
                    // Client Join Loop
                    startJoinLoop();
                }
            } else alert("Error conexión servidor");
        });
    });

    mqttClient.on('message', (topic, message) => {
        try {
            const data = JSON.parse(message.toString());
            handleNetworkData(data);
        } catch (e) {}
    });
}

function startJoinLoop() {
    let name = document.getElementById('username').value;
    name = name.substring(0,10);
    document.getElementById('connection-status').innerText = "Conectando...";
    sendData('JOIN', { name: name });
    joinInterval = setInterval(() => { sendData('JOIN', { name: name }); }, 2500);
}

function sendData(type, content) {
    if (mqttClient) {
        let senderName = document.getElementById('username').value.substring(0,10);
        if (isMultiplayer && myPlayerIndex !== -1 && players[myPlayerIndex]) senderName = players[myPlayerIndex].name;
        
        const payload = JSON.stringify({ type: type, content: content, senderIdx: myPlayerIndex, senderName: senderName });
        mqttClient.publish(`${TOPIC_PREFIX}${roomCode}`, payload);
    }
}

function handleNetworkData(data) {
    // 1. JOIN (Host)
    if (isHost && data.type === 'JOIN') {
        const exists = players.find(p => p.name === data.content.name);
        if (!exists && players.length < 4) {
            players.push({ name: data.content.name, hand: [], body: [], wins: 0, isBot: false });
            updateLobbyUI();
            sendData('LOBBY_UPDATE', { names: players.map(p => p.name) });
        } else if (exists) {
            // Re-confirmar para desbloquear cliente
            sendData('LOBBY_UPDATE', { names: players.map(p => p.name) });
        }
    }

    // 2. LOBBY (Cliente)
    if (data.type === 'LOBBY_UPDATE') {
        let myName = document.getElementById('username').value.substring(0,10);
        if (data.content.names.includes(myName)) {
            if (joinInterval) clearInterval(joinInterval); // Stop Join Loop
            
            if (!isHost) {
                document.getElementById('join-input-area').style.display = 'none';
                document.getElementById('room-code-display').style.display = 'block';
                document.getElementById('my-code').innerText = roomCode;
                document.getElementById('start-game-btn').style.display = 'none';
                document.getElementById('lobby-list').innerHTML = data.content.names.map(n => `✅ ${n}`).join('<br>');
                document.getElementById('connection-status').innerText = "¡Dentro! Esperando al Host...";
            } else {
                document.getElementById('lobby-list').innerHTML = data.content.names.map(n => `✅ ${n}`).join('<br>');
            }
        }
    }

    // 3. START GAME
    if (data.type === 'GAME_START') {
        // Stop Lobby Beacon (Clients only, Host stops manually)
        if (!isHost && joinInterval) clearInterval(joinInterval); 
        
        applyGameState(data.content);
        let myName = document.getElementById('username').value.substring(0,10);
        myPlayerIndex = players.findIndex(p => p.name === myName);
        
        startGameUI();
        render();
    }

    if (data.type === 'STATE_UPDATE') applyGameState(data.content);

    if (isHost && (data.type === 'MOVE' || data.type === 'DISCARD' || data.type === 'MULTI_DISCARD')) {
        processPlayerAction(data);
    }

    if (data.type === 'CHAT' && data.content.senderIdx !== myPlayerIndex) {
        addChatMessage(data.content.name, data.content.msg);
    }
}

function updateLobbyUI() {
    const list = document.getElementById('lobby-list');
    list.innerHTML = players.map(p => `✅ ${p.name}`).join('<br>');
    if (players.length >= 2) document.getElementById('start-game-btn').style.display = 'block';
}

function hostStartGame() {
    // IMPORTANTE: NO DETENER LA RED AQUÍ PARA QUE GAME_START LLEGUE
    if (hostBeaconInterval) clearInterval(hostBeaconInterval); // Parar solo la baliza del lobby
    
    // Enviar señal de inicio repetida para asegurar recepción
    let attempts = 0;
    let burst = setInterval(() => {
        initGame(); // Inicia localmente para el Host
        broadcastState('GAME_START'); // Envía señal
        attempts++;
        if(attempts >= 3) clearInterval(burst); // Enviar 3 veces
    }, 500);
    
    startGameUI(); 
}

// --- JUEGO ---
function initGame() {
    // Si ya hay cartas, no reiniciamos mazo si solo estamos refrescando UI
    if(deck.length === 0) {
        deck = []; discardPile = [];
        colors.forEach(c => {
            for(let i=0; i<4; i++) deck.push({color: c, type: 'organ'});
            for(let i=0; i<4; i++) deck.push({color: c, type: 'virus'});
            for(let i=0; i<4; i++) deck.push({color: c, type: 'medicine'});
        });
        ['organ', 'virus', 'medicine'].forEach(t => deck.push({color: 'multicolor', type: t}));
        ['Ladrón', 'Trasplante', 'Contagio', 'Guante de Látex', 'Error Médico'].forEach(t => deck.push({type: 'treatment', name: t}));
        deck = deck.sort(() => Math.random() - 0.5);

        players.forEach(p => {
            p.hand = []; p.body = [];
            for(let i=0; i<3; i++) p.hand.push(deck.pop());
        });

        turnIndex = 0;
        lastActionLog = "¡Empieza la partida!";
        visualDeckCount = deck.length; 
        
        if(isHost) {
            checkAiTurn();
        }
    }
    render();
}

function broadcastState(type = 'STATE_UPDATE') {
    if (!isHost) return;
    const state = {
        players: players,
        deckSize: deck.length, 
        discard: discardPile,
        turnIndex: turnIndex,
        lastLog: lastActionLog,
        meta: targetWins
    };
    sendData(type, state);
}

function applyGameState(content) {
    players = content.players;
    visualDeckCount = content.deckSize;
    discardPile = content.discard;
    turnIndex = content.turnIndex;
    lastActionLog = content.lastLog;
    targetWins = content.meta || 3;
    render();
}

function refillHand(player) {
    while (player.hand.length < 3) {
        if (deck.length === 0) {
            if (discardPile.length === 0) break;
            deck = discardPile.sort(() => Math.random() - 0.5);
            discardPile = [];
        }
        player.hand.push(deck.pop());
    }
    visualDeckCount = deck.length;
}

// --- RENDERIZADO Y MARCADOR PRO ---
function render() {
    document.getElementById('deck-count').innerText = visualDeckCount;
    notify(lastActionLog);
    
    // RENDERIZAR MARCADOR
    renderScoreboard();

    // RENDERIZAR RIVALES
    const rivalContainer = document.getElementById('rivals-container');
    rivalContainer.innerHTML = '';
    const rivals = players.filter((p, i) => i !== myPlayerIndex);
    
    if (rivals.length > 0) {
        rivalContainer.style.gridTemplateColumns = rivals.length === 1 ? "1fr" : "1fr 1fr";
        rivals.forEach(p => {
            const pIndex = players.indexOf(p);
            const div = document.createElement('div');
            let classes = `board-section`;
            if (turnIndex === pIndex) classes += ' active-turn';
            div.className = classes;
            div.innerHTML = `<h3>${p.name}</h3><div class="body-slots"></div>`;
            renderBody(p.body, div.querySelector('.body-slots'), pIndex);
            rivalContainer.appendChild(div);
        });
    }

    // RENDERIZAR YO
    if (myPlayerIndex !== -1 && players[myPlayerIndex]) {
        const me = players[myPlayerIndex];
        const myBodyDiv = document.getElementById('player-body');
        renderBody(me.body, myBodyDiv, myPlayerIndex);
        
        const handDiv = document.getElementById('player-hand');
        handDiv.innerHTML = '';
        me.hand.forEach((c, i) => {
            const container = document.createElement('div');
            container.className = 'card-container';
            const cardDiv = document.createElement('div');
            let isSelected = selectedForDiscard.has(i);
            let isPending = (pendingAction && pendingAction.cardIndex === i);
            
            cardDiv.className = `card ${c.color||'treatment'} ${isSelected?'selected-discard':''} ${isPending?'active-turn':''}`;
            cardDiv.onclick = () => playCard(i);
            cardDiv.innerHTML = `${icons[c.type]||icons.treatment}<b>${c.name||c.type}</b>`;
            
            const btn = document.createElement('button');
            if (multiDiscardMode) {
                btn.className = isSelected ? 'discard-btn active' : 'discard-btn';
                btn.innerText = isSelected ? '❌' : '✅';
                btn.onclick = (e) => { e.stopPropagation(); toggleSelection(i); };
            } else {
                btn.className = 'discard-btn'; btn.innerText = '🗑️';
                btn.onclick = (e) => { e.stopPropagation(); discardCard(i); };
            }
            container.appendChild(cardDiv); container.appendChild(btn); handDiv.appendChild(container);
        });

        const mySection = document.getElementById('my-board-section');
        if(mySection) mySection.className = (turnIndex === myPlayerIndex) ? 'board-section active-turn' : 'board-section waiting-turn';
        
        const controls = document.getElementById('dynamic-controls');
        controls.innerHTML = '';
        if (!multiDiscardMode) {
            const btn = document.createElement('button');
            btn.className = 'toggle-mode-btn'; btn.innerHTML = '⚙️ Selección';
            btn.onclick = toggleMultiDiscardMode; controls.appendChild(btn);
        } else {
            const confirm = document.createElement('button');
            confirm.className = 'main-action-btn'; confirm.innerHTML = `Borrar (${selectedForDiscard.size})`;
            confirm.onclick = confirmMultiDiscard;
            const cancel = document.createElement('button');
            cancel.className = 'cancel-btn'; cancel.innerText = 'Cancelar';
            cancel.onclick = toggleMultiDiscardMode; controls.appendChild(confirm); controls.appendChild(cancel);
        }
    }
}

function renderScoreboard() {
    const sb = document.getElementById('scoreboard-area');
    sb.innerHTML = ''; // Limpiar
    
    players.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = `score-card p${i+1}-color ${turnIndex === i ? 'active' : ''}`;
        div.innerHTML = `<div class="name">${p.name}</div><div class="wins">${p.wins} 🏆</div>`;
        sb.appendChild(div);
    });
}

// ... (Resto de funciones: playCard, executeMove, chat... SIN CAMBIOS IMPORTANTES, mantener lógica anterior)
// Para ahorrar espacio aquí, asume que las funciones de lógica de juego (playCard, executeMove, etc.)
// son idénticas a la V.3.4. Si necesitas que las repita todas, dímelo.
// Asegúrate de copiar las funciones de lógica de juego de la versión anterior si copias y pegas este bloque.
// Añado las funciones auxiliares necesarias para que funcione completo:

function renderBody(body, container, ownerIndex) {
    container.innerHTML = '';
    body.forEach(o => {
        const d = document.createElement('div');
        let classes = `card ${o.color} ${o.infected?'virus-effect':''}`;
        
        if (pendingAction) {
            const card = pendingAction.card;
            let isValid = false;
            if (card.type === 'medicine' || card.type === 'virus') {
                if ((o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor')) isValid = true;
            } else if (card.name === 'Ladrón') {
                if (ownerIndex !== myPlayerIndex && o.vaccines < 2) isValid = true;
            } else if (card.name === 'Contagio') {
                if (ownerIndex !== myPlayerIndex && !o.infected && o.vaccines === 0) {
                    const me = players[myPlayerIndex];
                    if (me.body.some(my => (my.color === o.color || my.color === 'multicolor' || o.color === 'multicolor') && my.infected)) isValid = true;
                }
            } else if (card.name === 'Trasplante') {
                if (!transplantSource) {
                    if (ownerIndex === myPlayerIndex && o.vaccines < 2) isValid = true; 
                } else {
                    if (ownerIndex !== myPlayerIndex && o.vaccines < 2) isValid = true; 
                }
            } else if (card.name === 'Error Médico') {
                if (ownerIndex !== myPlayerIndex) isValid = true;
            }
            if (isValid) {
                classes += ' selectable-organ';
                d.onclick = (e) => { e.stopPropagation(); handleOrganClick(ownerIndex, o.color); };
            }
        }
        if (transplantSource && ownerIndex === transplantSource.pIdx && o.color === transplantSource.color) classes += ' selected-source';
        d.className = classes;
        d.innerHTML = icons.organ;
        if(o.vaccines > 0) d.innerHTML += `<div class="status-row">${'🛡️'.repeat(o.vaccines)}</div>`;
        if(o.infected) d.innerHTML += `<div class="status-row">🦠</div>`;
        container.appendChild(d);
    });
}

function notify(msg) { document.getElementById('notification-bar').innerText = msg; }
function toggleChat() { const m = document.getElementById('chat-modal'); isChatOpen = !isChatOpen; m.style.display = isChatOpen ? 'flex' : 'none'; if(isChatOpen) document.getElementById('chat-badge').style.display = 'none'; }
function sendChatMessage() { const input = document.getElementById('chat-input'); const msg = input.value.trim(); if(msg) { addChatMessage(players[myPlayerIndex].name, msg); if(isMultiplayer) sendData('CHAT', { name: players[myPlayerIndex].name, msg: msg }); input.value = ''; } }
function addChatMessage(name, msg) { chatMessages.push({name, msg}); if(chatMessages.length>5) chatMessages.shift(); const h = document.getElementById('chat-history'); h.innerHTML = chatMessages.map(m => `<div class="chat-msg ${m.name===players[myPlayerIndex].name?'me':''}"><b>${m.name}:</b> ${m.msg}</div>`).join(''); if(!isChatOpen) document.getElementById('chat-badge').style.display = 'inline'; }
function toggleMultiDiscardMode() { multiDiscardMode = !multiDiscardMode; selectedForDiscard.clear(); render(); }
function toggleSelection(i) { if (selectedForDiscard.has(i)) selectedForDiscard.delete(i); else selectedForDiscard.add(i); render(); }
function confirmMultiDiscard() { if (selectedForDiscard.size === 0) { toggleMultiDiscardMode(); return; } let indices = Array.from(selectedForDiscard).sort((a,b)=>b-a); if(isMultiplayer && !isHost) sendData('MULTI_DISCARD', {playerIndex: myPlayerIndex, indices: indices}); else { const actor = players[myPlayerIndex]; indices.forEach(i => { discardPile.push(actor.hand[i]); actor.hand.splice(i,1); }); refillHand(actor); nextTurn(`${actor.name} descartó ${indices.length} cartas`); } multiDiscardMode = false; selectedForDiscard.clear(); }
// ... Resto de funciones de lógica (playCard, executeMove...) mantener las de V3.4 ...
function playCard(cardIndex) { if (multiDiscardMode) { toggleSelection(cardIndex); return; } if (turnIndex !== myPlayerIndex) { notify("⛔ No es tu turno"); return; } if (pendingAction && pendingAction.cardIndex === cardIndex) { cancelSelectionMode(); return; } const card = players[myPlayerIndex].hand[cardIndex]; let targetIndex = myPlayerIndex; if (card.type === 'organ') { submitMove(cardIndex, myPlayerIndex, card.color, null); return; } if (card.name === 'Guante de Látex' || card.name === 'Error Médico') { submitMove(cardIndex, myPlayerIndex, null, null); return; } enterSelectionMode(cardIndex, card); }
function enterSelectionMode(cardIndex, card) { pendingAction = { cardIndex: cardIndex, card: card }; transplantSource = null; if (card.name === 'Trasplante') notify("PASO 1: Toca TU órgano a cambiar"); else notify("Toca un ÓRGANO objetivo"); render(); }
function cancelSelectionMode() { pendingAction = null; transplantSource = null; notify("Selección cancelada"); render(); }
function handleOrganClick(targetPlayerIndex, organColor) { if (!pendingAction) return; const card = pendingAction.card; if (card.name === 'Ladrón' && targetPlayerIndex === myPlayerIndex) { notify("❌ No puedes robarte a ti mismo"); return; } if (card.name === 'Trasplante') { if (!transplantSource) { if (targetPlayerIndex !== myPlayerIndex) { notify("Primero toca TU órgano"); return; } transplantSource = { pIdx: targetPlayerIndex, color: organColor }; notify("PASO 2: Toca órgano del RIVAL"); render(); return; } else { if (targetPlayerIndex === myPlayerIndex) { notify("El segundo debe ser del RIVAL"); return; } submitMove(pendingAction.cardIndex, targetPlayerIndex, organColor, transplantSource.color); pendingAction = null; transplantSource = null; render(); return; } } submitMove(pendingAction.cardIndex, targetPlayerIndex, organColor, null); pendingAction = null; render(); }
function submitMove(cardIndex, targetIndex, targetColor, extraData) { if (isMultiplayer && !isHost) { sendData('MOVE', { playerIndex: myPlayerIndex, cardIndex: cardIndex, targetIndex: targetIndex, targetColor: targetColor, extra: extraData }); } else { executeMove(myPlayerIndex, cardIndex, targetIndex, targetColor, extraData); } }
function discardCard(cardIndex) { if (multiDiscardMode) { toggleSelection(cardIndex); return; } if (turnIndex !== myPlayerIndex) return; if (isMultiplayer && !isHost) { sendData('DISCARD', { playerIndex: myPlayerIndex, cardIndex: cardIndex }); } else { executeDiscard(myPlayerIndex, cardIndex); } }
function processPlayerAction(data) { if (data.type === 'MOVE') executeMove(data.content.playerIndex, data.content.cardIndex, data.content.targetIndex, data.content.targetColor, data.content.extra); if (data.type === 'DISCARD') executeDiscard(data.content.playerIndex, data.content.cardIndex); if (data.type === 'MULTI_DISCARD') { const actor = players[data.content.playerIndex]; let indices = data.content.indices.sort((a,b)=>b-a); indices.forEach(i => { discardPile.push(actor.hand[i]); actor.hand.splice(i,1); }); refillHand(actor); nextTurn(`${actor.name} descartó ${indices.length} cartas`); } }
function executeMove(pIdx, cIdx, tIdx, tColor, extra) { const actor = players[pIdx]; const target = players[tIdx]; const card = actor.hand[cIdx]; let success = false; let log = ""; if (card.type === 'organ') { if (!target.body.find(o => o.color === card.color)) { target.body.push({color: card.color, vaccines: 0, infected: false}); success = true; log = `${actor.name} sacó ${card.color}`; } } else if (card.type === 'medicine') { let o = target.body.find(x => x.color === tColor); if (o && (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2)) { if (o.infected) { o.infected = false; log = `${actor.name} curó a ${target.name}`; } else { o.vaccines++; log = `${actor.name} vacunó a ${target.name}`; } success = true; } } else if (card.type === 'virus') { let o = target.body.find(x => x.color === tColor); if (o && (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2) { if (o.vaccines > 0) { o.vaccines--; log = `${actor.name} infectó vacuna de ${target.name}`; } else if (!o.infected) { o.infected = true; log = `${actor.name} infectó a ${target.name}`; } else { target.body = target.body.filter(x => x !== o); discardPile.push({color: o.color, type: 'organ'}); log = `${actor.name} eliminó órgano de ${target.name}`; } success = true; } } else if (card.type === 'treatment') { if (card.name === 'Ladrón') { let stealable = target.body.find(x => x.color === tColor); if (stealable && stealable.vaccines < 2 && !actor.body.some(m => m.color === stealable.color)) { target.body = target.body.filter(x => x !== stealable); actor.body.push(stealable); success = true; log = `${actor.name} robó órgano a ${target.name}`; } } if (card.name === 'Contagio') { let dest = target.body.find(x => x.color === tColor); let source = actor.body.find(x => (x.color === tColor || x.color === 'multicolor' || dest.color === 'multicolor') && x.infected); if (dest && source && !dest.infected && dest.vaccines === 0) { source.infected = false; dest.infected = true; success = true; log = `${actor.name} contagió a ${target.name}`; } } if (card.name === 'Trasplante') { let myOrgan = actor.body.find(x => x.color === extra); let theirOrgan = target.body.find(x => x.color === tColor); if (myOrgan && theirOrgan && myOrgan.vaccines < 2 && theirOrgan.vaccines < 2) { actor.body = actor.body.filter(x => x !== myOrgan); target.body = target.body.filter(x => x !== theirOrgan); actor.body.push(theirOrgan); target.body.push(myOrgan); success = true; log = `${actor.name} hizo un trasplante con ${target.name}`; } } if (card.name === 'Guante de Látex') { players.forEach(p => { if(p !== actor) { p.hand.forEach(c => discardPile.push(c)); p.hand = []; refillHand(p); } }); success = true; log = `${actor.name} usó Guante de Látex`; } if (card.name === 'Error Médico') { let temp = actor.body; actor.body = target.body; target.body = temp; success = true; log = `${actor.name} usó Error Médico`; } } if (success) { discardPile.push(card); actor.hand.splice(cIdx, 1); refillHand(actor); nextTurn(log); } else if (pIdx === myPlayerIndex) { notify("⚠️ Jugada no válida en ese objetivo"); } }
function executeDiscard(pIdx, cIdx) { const actor = players[pIdx]; discardPile.push(actor.hand[cIdx]); actor.hand.splice(cIdx, 1); refillHand(actor); nextTurn(`${actor.name} descartó`); }
function nextTurn(log) { lastActionLog = log; turnIndex = (turnIndex + 1) % players.length; let winner = null; players.forEach(p => { let healthy = p.body.filter(o => !o.infected).length; if (healthy >= 4) winner = p; }); if (winner) { winner.wins++; lastActionLog = `🏆 ¡${winner.name} GANA!`; broadcastState(); setTimeout(() => initGame(), 3000); } else { broadcastState(); render(); checkAiTurn(); } }
function checkAiTurn() { if (!isMultiplayer && players[turnIndex].isBot) { setTimeout(aiPlay, 1000); } }
function aiPlay() { const bot = players[turnIndex]; for (let i=0; i<bot.hand.length; i++) { if (bot.hand[i].type === 'organ' && !bot.body.find(o=>o.color===bot.hand[i].color)) { executeMove(turnIndex, i, turnIndex, bot.hand[i].color, null); return; } } executeDiscard(turnIndex, 0); }
