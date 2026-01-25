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
// PendingAction ahora guarda la carta que estás "sosteniendo"
let pendingAction = null; // { cardIndex: 0, card: {...} } 
let visualDeckCount = 0;

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'virusgame/v3_2/'; 

const icons = {
    organ: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M462.3 62.6C407.5 15.9 326 24.3 275.7 76.2L256 96.5l-19.7-20.3C186.1 24.3 104.5 15.9 49.7 62.6c-62.8 53.6-66.1 149.8-9.9 207.9l193.5 199.8c12.5 12.9 32.8 12.9 45.3 0l193.5-199.8c56.3-58.1 53-154.3-9.8-207.9z"/></svg>`,
    virus: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M256 0c141.4 0 256 114.6 256 256S397.4 512 256 512 0 397.4 0 256 114.6 0 256 0zM176 256c0-44.2 35.8-80 80-80s80 35.8 80 80-35.8 80-80 80-80-35.8-80-80z"/></svg>`,
    medicine: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M174.7 96.6L10.2 446.5c-13.6 31.2 9.3 65.5 43.4 65.5h316.8c34.1 0 56.9-34.3 43.4-65.5L251.3 96.6c-17-39.1-73.2-39.1-90.2 0z"/></svg>`,
    treatment: `<svg viewBox="0 0 512 512"><path fill="white" d="M256 0L32 96l32 320 192 96 192-96 32-320L256 0z"/></svg>`
};

// --- MENÚ ---
function startLocalGame() {
    if(mqttClient) { mqttClient.end(); mqttClient = null; }
    isMultiplayer = false; isHost = true;
    const name = document.getElementById('username').value || "Jugador";
    
    players = [
        { name: name, hand: [], body: [], wins: 0, isBot: false },
        { name: "JULIO", hand: [], body: [], wins: 0, isBot: true }
    ];
    myPlayerIndex = 0;
    
    startGameUI(); 
    initGame();
}

function showMultiplayerOptions() {
    if(!document.getElementById('username').value) return alert("¡Escribe tu nombre!");
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
    
    const chatIn = document.getElementById('chat-input');
    const newChatIn = chatIn.cloneNode(true);
    chatIn.parentNode.replaceChild(newChatIn, chatIn);
    newChatIn.addEventListener("keypress", function(event) {
        if (event.key === "Enter") { event.preventDefault(); sendChatMessage(); }
    });
}

// --- RED ---
function createRoom() {
    roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('my-code').innerText = roomCode;
    document.getElementById('room-code-display').style.display = 'block';
    document.querySelectorAll('.mp-action-btn').forEach(b => b.style.display = 'none');
    isHost = true; isMultiplayer = true;
    const name = document.getElementById('username').value;
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
    const clientId = 'v3_' + Math.random().toString(16).substr(2, 8);
    mqttClient = mqtt.connect(BROKER_URL, { clean: true, clientId: clientId });

    mqttClient.on('connect', () => {
        mqttClient.subscribe(`${TOPIC_PREFIX}${roomCode}`, { qos: 1 }, (err) => {
            if (!err && !isHost) {
                const name = document.getElementById('username').value;
                sendData('JOIN', { name: name });
                document.getElementById('connection-status').innerText = "Conectado. Esperando al Host...";
            }
        });
    });

    mqttClient.on('message', (topic, message) => {
        try {
            const data = JSON.parse(message.toString());
            handleNetworkData(data);
        } catch (e) {}
    });
}

function sendData(type, content) {
    if (mqttClient) {
        const senderName = (isMultiplayer && myPlayerIndex !== -1 && players[myPlayerIndex]) ? players[myPlayerIndex].name : document.getElementById('username').value;
        const payload = JSON.stringify({ type: type, content: content, senderIdx: myPlayerIndex, senderName: senderName });
        mqttClient.publish(`${TOPIC_PREFIX}${roomCode}`, payload);
    }
}

function handleNetworkData(data) {
    if (isHost && data.type === 'JOIN') {
        const exists = players.find(p => p.name === data.content.name);
        if (!exists && players.length < 4) {
            players.push({ name: data.content.name, hand: [], body: [], wins: 0, isBot: false });
            updateLobbyUI();
            sendData('LOBBY_UPDATE', { names: players.map(p => p.name) });
        }
    }

    if (data.type === 'LOBBY_UPDATE' && !isHost) {
        const myName = document.getElementById('username').value;
        if (data.content.names.includes(myName)) {
            document.getElementById('connection-status').innerText = `En sala: ${data.content.names.join(', ')}`;
        }
    }

    if (data.type === 'GAME_START') {
        applyGameState(data.content);
        const myName = document.getElementById('username').value;
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
    startGameUI(); 
    initGame(); 
}

// --- MOTOR DEL JUEGO ---
function initGame() {
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

    if (isHost) {
        broadcastState('GAME_START');
        checkAiTurn();
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
        lastLog: lastActionLog
    };
    sendData(type, state);
}

function applyGameState(content) {
    players = content.players;
    visualDeckCount = content.deckSize;
    discardPile = content.discard;
    turnIndex = content.turnIndex;
    lastActionLog = content.lastLog;
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

// --- ACCIONES ---
function playCard(cardIndex) {
    if (multiDiscardMode) { toggleSelection(cardIndex); return; }
    if (turnIndex !== myPlayerIndex) { notify("⛔ No es tu turno"); return; }
    
    // Si toco la misma carta para cancelar
    if (pendingAction && pendingAction.cardIndex === cardIndex) {
        cancelSelectionMode();
        return;
    }

    const card = players[myPlayerIndex].hand[cardIndex];

    // 1. Jugar Órgano (Automático)
    if (card.type === 'organ') {
        submitMove(cardIndex, myPlayerIndex, card.color); // Color para identificar que jugamos organo
        return;
    }
    
    // 2. Jugar Globales (Automático)
    if (card.name === 'Guante de Látex' || card.name === 'Error Médico' || card.name === 'Trasplante' || card.name === 'Contagio') {
        submitMove(cardIndex, myPlayerIndex, null); // Target da igual
        return;
    }

    // 3. Virus, Medicinas o Ladrón -> MODO SELECCIÓN DE ÓRGANO ESPECÍFICO
    enterSelectionMode(cardIndex, card);
}

function enterSelectionMode(cardIndex, card) {
    pendingAction = { cardIndex: cardIndex, card: card };
    notify("TOCA UN ÓRGANO PARA APLICAR");
    render(); 
}

function cancelSelectionMode() {
    pendingAction = null;
    notify("Selección cancelada");
    render();
}

// Esta función se llama al hacer clic en un ÓRGANO (carta pequeña en mesa)
function handleOrganClick(targetPlayerIndex, organColor) {
    if (!pendingAction) return;
    
    // Ladrón no se puede robar a sí mismo
    if (targetPlayerIndex === myPlayerIndex && pendingAction.card.name === 'Ladrón') {
        notify("❌ No puedes robarte a ti mismo");
        return;
    }

    submitMove(pendingAction.cardIndex, targetPlayerIndex, organColor);
    pendingAction = null; 
    render(); 
}

function submitMove(cardIndex, targetIndex, targetColor) {
    if (isMultiplayer && !isHost) {
        sendData('MOVE', { playerIndex: myPlayerIndex, cardIndex: cardIndex, targetIndex: targetIndex, targetColor: targetColor });
    } else {
        executeMove(myPlayerIndex, cardIndex, targetIndex, targetColor);
    }
}

function discardCard(cardIndex) {
    if (multiDiscardMode) { toggleSelection(cardIndex); return; }
    if (turnIndex !== myPlayerIndex) return;
    
    if (isMultiplayer && !isHost) {
        sendData('DISCARD', { playerIndex: myPlayerIndex, cardIndex: cardIndex });
    } else {
        executeDiscard(myPlayerIndex, cardIndex);
    }
}

function processPlayerAction(data) {
    if (data.type === 'MOVE') executeMove(data.content.playerIndex, data.content.cardIndex, data.content.targetIndex, data.content.targetColor);
    if (data.type === 'DISCARD') executeDiscard(data.content.playerIndex, data.content.cardIndex);
    if (data.type === 'MULTI_DISCARD') {
        const actor = players[data.content.playerIndex];
        let indices = data.content.indices.sort((a,b)=>b-a);
        indices.forEach(i => { discardPile.push(actor.hand[i]); actor.hand.splice(i,1); });
        refillHand(actor);
        nextTurn(`${actor.name} descartó ${indices.length} cartas`);
    }
}

// --- EJECUCIÓN ---
function executeMove(pIdx, cIdx, tIdx, tColor) {
    const actor = players[pIdx];
    const target = players[tIdx];
    const card = actor.hand[cIdx];
    let success = false;
    let log = "";

    if (card.type === 'organ') {
        if (!target.body.find(o => o.color === card.color)) {
            target.body.push({color: card.color, vaccines: 0, infected: false});
            success = true; log = `${actor.name} sacó ${card.color}`;
        }
    } 
    else if (card.type === 'medicine') {
        // Busca el órgano exacto que clicamos (por color)
        let o = target.body.find(x => x.color === tColor);
        // Valida si se puede aplicar medicina
        if (o && (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2)) {
            if (o.infected) { o.infected = false; log = `${actor.name} curó a ${target.name}`; }
            else { o.vaccines++; log = `${actor.name} vacunó a ${target.name}`; }
            success = true;
        }
    } 
    else if (card.type === 'virus') {
        let o = target.body.find(x => x.color === tColor);
        // Valida si se puede aplicar virus
        if (o && (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2) {
            if (o.vaccines > 0) { o.vaccines--; log = `${actor.name} infectó vacuna de ${target.name}`; }
            else if (!o.infected) { o.infected = true; log = `${actor.name} infectó a ${target.name}`; }
            else {
                target.body = target.body.filter(x => x !== o);
                discardPile.push({color: o.color, type: 'organ'});
                log = `${actor.name} eliminó órgano de ${target.name}`;
            }
            success = true;
        }
    } 
    else if (card.type === 'treatment') {
        if (card.name === 'Ladrón') {
            let stealable = target.body.find(x => x.color === tColor);
            // Comprobar que no tengo ese color y que no está vacunado
            if (stealable && stealable.vaccines < 2 && !actor.body.some(m => m.color === stealable.color)) {
                target.body = target.body.filter(x => x !== stealable);
                actor.body.push(stealable);
                success = true; log = `${actor.name} robó órgano a ${target.name}`;
            }
        }
        if (card.name === 'Guante de Látex') {
            players.forEach(p => { 
                if(p !== actor) { 
                    p.hand.forEach(c => discardPile.push(c)); 
                    p.hand = []; 
                    refillHand(p); 
                } 
            });
            success = true; log = `${actor.name} usó Guante de Látex`;
        }
        if (card.name === 'Trasplante' || card.name === 'Contagio' || card.name === 'Error Médico') {
             discardPile.push(card); 
             success = true; log = `${actor.name} usó ${card.name} (Visual)`;
        }
    }

    if (success) {
        discardPile.push(card);
        actor.hand.splice(cIdx, 1);
        refillHand(actor); 
        nextTurn(log);
    } else if (pIdx === myPlayerIndex) {
        notify("⚠️ Jugada no válida en ese objetivo");
    }
}

function executeDiscard(pIdx, cIdx) {
    const actor = players[pIdx];
    discardPile.push(actor.hand[cIdx]);
    actor.hand.splice(cIdx, 1);
    refillHand(actor);
    nextTurn(`${actor.name} descartó`);
}

function nextTurn(log) {
    lastActionLog = log;
    turnIndex = (turnIndex + 1) % players.length;
    
    let winner = null;
    players.forEach(p => {
        let healthy = p.body.filter(o => !o.infected).length;
        if (healthy >= 4) winner = p;
    });

    if (winner) {
        winner.wins++;
        lastActionLog = `🏆 ¡${winner.name} GANA LA RONDA!`;
        broadcastState(); 
        setTimeout(() => initGame(), 3000); 
    } else {
        broadcastState();
        render();
        checkAiTurn();
    }
}

function checkAiTurn() {
    if (!isMultiplayer && players[turnIndex].isBot) {
        setTimeout(aiPlay, 1000);
    }
}

function aiPlay() {
    const bot = players[turnIndex];
    for (let i=0; i<bot.hand.length; i++) {
        if (bot.hand[i].type === 'organ' && !bot.body.find(o=>o.color===bot.hand[i].color)) {
            // IA simple para órganos (tIdx es bot index)
            executeMove(turnIndex, i, turnIndex, bot.hand[i].color);
            return;
        }
    }
    executeDiscard(turnIndex, 0);
}

// --- RENDER ---
function render() {
    document.getElementById('deck-count').innerText = visualDeckCount;
    const turnName = players[turnIndex] ? players[turnIndex].name : "...";
    document.getElementById('turn-indicator').innerHTML = `Turno: <span style="color:${turnIndex===myPlayerIndex?'#2ecc71':'#e74c3c'}">${turnName}</span>`;
    notify(lastActionLog);
    
    // 1. RENDERIZAR RIVALES
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
            div.innerHTML = `<h3>${p.name} (${p.wins}🏆)</h3><div class="body-slots"></div>`;
            
            // Renderizar cuerpo del rival (pasamos pIndex para los clics)
            renderBody(p.body, div.querySelector('.body-slots'), pIndex);
            rivalContainer.appendChild(div);
        });
    }

    // 2. RENDERIZAR YO
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
        
        // Controles
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

// --- RENDERIZADO DE ÓRGANOS CLICABLES ---
function renderBody(body, container, ownerIndex) {
    container.innerHTML = '';
    body.forEach(o => {
        const d = document.createElement('div');
        let classes = `card ${o.color} ${o.infected?'virus-effect':''}`;
        
        // Comprobar si este órgano es un objetivo válido para la carta seleccionada
        if (pendingAction) {
            const card = pendingAction.card;
            let isValid = false;
            
            if (card.type === 'medicine') {
                // Medicina: Coincide color o es multi, y necesita cura o vacuna
                if ((o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2)) isValid = true;
            } else if (card.type === 'virus') {
                // Virus: Coincide color o es multi, y no está inmunizado
                if ((o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2) isValid = true;
            } else if (card.name === 'Ladrón') {
                // Ladrón: No soy yo, no está inmunizado, no tengo ese color
                if (ownerIndex !== myPlayerIndex && o.vaccines < 2) {
                    const me = players[myPlayerIndex];
                    if (!me.body.some(myOrg => myOrg.color === o.color)) isValid = true;
                }
            }

            if (isValid) {
                classes += ' selectable-organ';
                d.onclick = (e) => { e.stopPropagation(); handleOrganClick(ownerIndex, o.color); };
            }
        }

        d.className = classes;
        d.innerHTML = icons.organ;
        if(o.vaccines > 0) d.innerHTML += `<div class="status-row">${'🛡️'.repeat(o.vaccines)}</div>`;
        if(o.infected) d.innerHTML += `<div class="status-row">🦠</div>`;
        container.appendChild(d);
    });
}

function notify(msg) { document.getElementById('notification-bar').innerText = msg; }

// CHAT
function toggleChat() { 
    const m = document.getElementById('chat-modal');
    isChatOpen = !isChatOpen;
    m.style.display = isChatOpen ? 'flex' : 'none';
    if(isChatOpen) document.getElementById('chat-badge').style.display = 'none';
}
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if(msg) {
        addChatMessage(players[myPlayerIndex].name, msg);
        if(isMultiplayer) sendData('CHAT', { name: players[myPlayerIndex].name, msg: msg });
        input.value = '';
    }
}
function addChatMessage(name, msg) {
    chatMessages.push({name, msg});
    if(chatMessages.length>5) chatMessages.shift();
    const h = document.getElementById('chat-history');
    h.innerHTML = chatMessages.map(m => `<div class="chat-msg ${m.name===players[myPlayerIndex].name?'me':''}"><b>${m.name}:</b> ${m.msg}</div>`).join('');
    if(!isChatOpen) document.getElementById('chat-badge').style.display = 'inline';
}

function toggleMultiDiscardMode() { multiDiscardMode = !multiDiscardMode; selectedForDiscard.clear(); render(); }
function toggleSelection(i) { if (selectedForDiscard.has(i)) selectedForDiscard.delete(i); else selectedForDiscard.add(i); render(); }
function confirmMultiDiscard() {
    if (selectedForDiscard.size === 0) { toggleMultiDiscardMode(); return; }
    let indices = Array.from(selectedForDiscard).sort((a,b)=>b-a);
    if(isMultiplayer && !isHost) sendData('MULTI_DISCARD', {playerIndex: myPlayerIndex, indices: indices});
    else {
        const actor = players[myPlayerIndex];
        indices.forEach(i => { discardPile.push(actor.hand[i]); actor.hand.splice(i,1); });
        refillHand(actor);
        nextTurn(`${actor.name} descartó ${indices.length} cartas`);
    }
    multiDiscardMode = false; selectedForDiscard.clear();
}
