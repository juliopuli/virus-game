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

// Configuración MQTT
const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'virusgame/v4/'; // Prefijo para evitar colisiones

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
    
    // Configurar Local 1v1
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
}

// --- RED (MQTT) ---
function createRoom() {
    roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('my-code').innerText = roomCode;
    document.getElementById('room-code-display').style.display = 'block';
    // Ocultar botones
    document.querySelectorAll('.mp-action-btn').forEach(b => b.style.display = 'none');
    
    isHost = true;
    isMultiplayer = true;
    
    const name = document.getElementById('username').value;
    players = [{ name: name, hand: [], body: [], wins: 0, isBot: false }];
    myPlayerIndex = 0;
    
    updateLobbyUI();
    connectMqtt();
}

function connectToPeer() {
    const code = document.getElementById('remote-code-input').value;
    if (!code) return alert("Falta código");
    
    isHost = false; 
    isMultiplayer = true;
    roomCode = code;
    connectMqtt();
}

function connectMqtt() {
    const clientId = 'virus_' + Math.random().toString(16).substr(2, 8);
    mqttClient = mqtt.connect(BROKER_URL, { clean: true, clientId: clientId });

    mqttClient.on('connect', () => {
        // Todos se suscriben al MISMO canal de la sala
        mqttClient.subscribe(`${TOPIC_PREFIX}${roomCode}`, { qos: 1 }, (err) => {
            if (!err) {
                if (!isHost) {
                    const name = document.getElementById('username').value;
                    sendData('JOIN', { name: name });
                    document.getElementById('connection-status').innerText = "Conectado. Esperando al Host...";
                }
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
        const payload = JSON.stringify({ type: type, content: content, senderIdx: myPlayerIndex });
        mqttClient.publish(`${TOPIC_PREFIX}${roomCode}`, payload);
    }
}

function handleNetworkData(data) {
    // 1. GESTIÓN DE SALA (JOIN)
    if (isHost && data.type === 'JOIN') {
        // Añadir jugador si no existe
        const exists = players.find(p => p.name === data.content.name);
        if (!exists && players.length < 4) {
            players.push({ name: data.content.name, hand: [], body: [], wins: 0, isBot: false });
            updateLobbyUI();
            // Enviar lista actualizada a todos para que sepan que han entrado
            sendData('LOBBY_UPDATE', { names: players.map(p => p.name) });
        }
    }

    // 2. ACTUALIZACIÓN DE LOBBY (Para clientes)
    if (data.type === 'LOBBY_UPDATE' && !isHost) {
        const myName = document.getElementById('username').value;
        // Comprobar si estoy en la lista
        const amIIn = data.content.names.includes(myName);
        if (amIIn) {
            document.getElementById('connection-status').innerText = `En sala: ${data.content.names.join(', ')}`;
        }
    }

    // 3. INICIO DE JUEGO (GAME_START)
    if (data.type === 'GAME_START') {
        // Recibir estado inicial
        applyGameState(data.content);
        // Descubrir mi índice
        const myName = document.getElementById('username').value;
        myPlayerIndex = players.findIndex(p => p.name === myName);
        startGameUI();
        render();
    }

    // 4. ACTUALIZACIÓN DE ESTADO (Durante el juego)
    if (data.type === 'STATE_UPDATE') {
        applyGameState(data.content);
    }

    // 5. MOVIMIENTOS (Solo Host procesa)
    if (isHost && (data.type === 'MOVE' || data.type === 'DISCARD' || data.type === 'MULTI_DISCARD')) {
        processPlayerAction(data);
    }

    // 6. CHAT
    if (data.type === 'CHAT') {
        addChatMessage(data.content.name, data.content.msg);
    }
}

// --- FUNCIONES DEL HOST ---
function updateLobbyUI() {
    const list = document.getElementById('lobby-list');
    list.innerHTML = players.map(p => `✅ ${p.name}`).join('<br>');
    
    // Mostrar botón de empezar si hay al menos 2 jugadores
    if (players.length >= 2) {
        document.getElementById('start-game-btn').style.display = 'block';
    }
}

function hostStartGame() {
    initGame(); // Baraja y reparte
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

    // Repartir
    players.forEach(p => {
        p.hand = []; p.body = [];
        for(let i=0; i<3; i++) p.hand.push(deck.pop());
    });

    turnIndex = 0;
    lastActionLog = "¡Empieza la partida!";
    
    if (isHost) {
        broadcastState('GAME_START'); // Envía todo el estado inicial
        checkAiTurn();
    }
}

function broadcastState(type = 'STATE_UPDATE') {
    if (!isHost) return;
    const state = {
        players: players,
        deckSize: deck.length, // Solo enviamos número
        discard: discardPile,
        turnIndex: turnIndex,
        lastLog: lastActionLog
    };
    sendData(type, state);
}

function applyGameState(content) {
    players = content.players;
    // Deck es solo visual en cliente
    document.getElementById('deck-count').innerText = content.deckSize; 
    discardPile = content.discard;
    turnIndex = content.turnIndex;
    lastActionLog = content.lastLog;
    
    render();
}

// --- ACCIONES DEL JUGADOR ---

function playCard(cardIndex) {
    if (turnIndex !== myPlayerIndex) { notify("⛔ No es tu turno"); return; }
    
    const card = players[myPlayerIndex].hand[cardIndex];
    let targetIndex = myPlayerIndex; // Por defecto yo

    // Selección de objetivo para cartas ofensivas
    if (card.type === 'virus' || card.name === 'Ladrón') {
        const rivals = players.map((p, i) => ({idx: i, name: p.name})).filter(x => x.idx !== myPlayerIndex);
        
        if (rivals.length > 0) {
            let msg = "Elige jugador:\n";
            rivals.forEach((r, i) => msg += `${i+1}: ${r.name}\n`);
            let choice = prompt(msg, "1");
            if (!choice) return;
            let sel = parseInt(choice) - 1;
            if (sel >= 0 && sel < rivals.length) targetIndex = rivals[sel].idx;
            else return;
        }
    }

    if (isMultiplayer && !isHost) {
        sendData('MOVE', { playerIndex: myPlayerIndex, cardIndex: cardIndex, targetIndex: targetIndex });
    } else {
        executeMove(myPlayerIndex, cardIndex, targetIndex);
    }
}

function processPlayerAction(data) {
    if (data.type === 'MOVE') executeMove(data.content.playerIndex, data.content.cardIndex, data.content.targetIndex);
    if (data.type === 'DISCARD') executeDiscard(data.content.playerIndex, data.content.cardIndex);
    if (data.type === 'MULTI_DISCARD') {
        // Multi discard logic
        const actor = players[data.content.playerIndex];
        let indices = data.content.indices.sort((a,b)=>b-a);
        indices.forEach(i => { discardPile.push(actor.hand[i]); actor.hand.splice(i,1); });
        refillHand(actor);
        nextTurn(`${actor.name} descartó ${indices.length}`);
    }
}

function executeMove(pIdx, cIdx, tIdx) {
    const actor = players[pIdx];
    const target = players[tIdx];
    const card = actor.hand[cIdx];
    let success = false;
    let log = "";

    // Lógica básica
    if (card.type === 'organ') {
        if (!target.body.find(o => o.color === card.color)) {
            target.body.push({color: card.color, vaccines: 0, infected: false});
            success = true; log = `${actor.name} sacó ${card.color}`;
        }
    } 
    else if (card.type === 'medicine') {
        let o = target.body.find(x => (x.color === card.color || card.color === 'multicolor') && (x.infected || x.vaccines < 2));
        if (o) {
            if (o.infected) { o.infected = false; log = `${actor.name} curó a ${target.name}`; }
            else { o.vaccines++; log = `${actor.name} vacunó a ${target.name}`; }
            success = true;
        }
    }
    else if (card.type === 'virus') {
        let o = target.body.find(x => (x.color === card.color || card.color === 'multicolor') && x.vaccines < 2);
        if (o) {
            if (o.vaccines > 0) { o.vaccines--; log = `${actor.name} rompió vacuna de ${target.name}`; }
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
            let stealable = target.body.find(o => o.vaccines < 2 && !actor.body.some(m => m.color === o.color));
            if (stealable) {
                target.body = target.body.filter(x => x !== stealable);
                actor.body.push(stealable);
                success = true; log = `${actor.name} robó órgano a ${target.name}`;
            }
        }
        // Simplificación: otros tratamientos descartan mano rival o cambian cuerpos
        if (card.name === 'Guante de Látex') {
            // Todos descartan mano menos actor
            players.forEach(p => { 
                if(p !== actor) { 
                    p.hand.forEach(c => discardPile.push(c)); 
                    p.hand = []; 
                    refillHand(p);
                } 
            });
            success = true; log = `${actor.name} usó Guante de Látex`;
        }
    }

    if (success) {
        discardPile.push(card);
        actor.hand.splice(cIdx, 1);
        refillHand(actor);
        nextTurn(log);
    } else {
        // Si falló y soy yo, avisar
        if (pIdx === myPlayerIndex) alert("Jugada no válida");
    }
}

function executeDiscard(pIdx, cIdx) {
    const actor = players[pIdx];
    discardPile.push(actor.hand[cIdx]);
    actor.hand.splice(cIdx, 1);
    refillHand(actor);
    nextTurn(`${actor.name} descartó`);
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
}

function nextTurn(log) {
    lastActionLog = log;
    turnIndex = (turnIndex + 1) % players.length;
    
    // Check Win
    let winner = null;
    players.forEach(p => {
        let score = 0;
        p.body.forEach(o => {
            if (!o.infected && (o.vaccines === 2 || !p.body.find(x => x !== o && x.color === o.color && x.infected))) score++;
        });
        // Simplificación conteo victoria: 4 órganos sanos dif colores
        let healthy = p.body.filter(o => !o.infected).length;
        if (healthy >= 4) winner = p;
    });

    if (winner) {
        winner.wins++;
        alert(`🏆 ¡${winner.name} GANA LA RONDA!`);
        initGame(); // Nueva ronda
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
    // Intenta jugar órgano
    for(let i=0; i<bot.hand.length; i++) {
        if(bot.hand[i].type === 'organ') {
            executeMove(turnIndex, i, turnIndex);
            return;
        }
    }
    // Si no, descarta
    executeDiscard(turnIndex, 0);
}

// --- RENDER ---
function render() {
    notify(lastActionLog);
    
    // 1. Rivales
    const container = document.getElementById('rivals-container');
    container.innerHTML = '';
    // Ajustar grid
    const rivals = players.filter((p, i) => i !== myPlayerIndex);
    if (rivals.length === 1) container.style.gridTemplateColumns = "1fr";
    else container.style.gridTemplateColumns = "1fr 1fr";
    
    rivals.forEach(p => {
        const div = document.createElement('div');
        const isActive = (players.indexOf(p) === turnIndex);
        div.className = `board-section ${isActive ? 'active-turn' : ''}`;
        div.innerHTML = `<h3>${p.name} (${p.wins}🏆)</h3><div class="body-slots"></div>`;
        renderBody(p.body, div.querySelector('.body-slots'));
        container.appendChild(div);
    });

    // 2. Yo
    if (myPlayerIndex !== -1 && players[myPlayerIndex]) {
        const me = players[myPlayerIndex];
        const mySection = document.querySelector('.board-section:last-of-type');
        if (turnIndex === myPlayerIndex) mySection.classList.add('active-turn');
        else mySection.classList.remove('active-turn');
        
        document.getElementById('turn-indicator').innerHTML = 
            `Turno de: <span style="color:${turnIndex===myPlayerIndex?'#2ecc71':'#e74c3c'}">${players[turnIndex].name}</span>`;
            
        renderBody(me.body, document.getElementById('player-body'));
        renderHand(me.hand);
    }
}

function renderBody(body, container) {
    container.innerHTML = '';
    body.forEach(o => {
        const d = document.createElement('div');
        d.className = `card ${o.color} ${o.infected?'virus-effect':''}`;
        d.innerHTML = icons.organ;
        if(o.vaccines > 0) d.innerHTML += `<div class="status-row">${'🛡️'.repeat(o.vaccines)}</div>`;
        if(o.infected) d.innerHTML += `<div class="status-row">🦠</div>`;
        container.appendChild(d);
    });
}

function renderHand(hand) {
    const c = document.getElementById('player-hand');
    c.innerHTML = '';
    hand.forEach((card, i) => {
        const d = document.createElement('div');
        d.className = 'card-container';
        d.innerHTML = `<div class="card ${card.color||'treatment'}" onclick="playCard(${i})">
            ${icons[card.type]||icons.treatment}<b>${card.name||card.type}</b>
        </div>
        <button class="discard-btn" onclick="discardCard(${i})">🗑️</button>`;
        c.appendChild(d);
    });
}

function discardCard(i) {
    if(multiDiscardMode) { toggleSelection(i); return; }
    if(turnIndex !== myPlayerIndex) return;
    if(isMultiplayer && !isHost) sendData('DISCARD', {playerIndex: myPlayerIndex, cardIndex: i});
    else executeDiscard(myPlayerIndex, i);
}

// Chat y Helpers
function notify(msg) { document.getElementById('notification-bar').innerText = msg; }
function toggleChat() { 
    const m = document.getElementById('chat-modal');
    m.style.display = m.style.display === 'none' ? 'flex' : 'none';
    if(m.style.display==='flex') renderChat();
}
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value;
    if(msg) {
        sendData('CHAT', {name: players[myPlayerIndex].name, msg: msg});
        // Si soy host, lo añado directo, si soy cliente, el host me lo devolverá (o lo añado ya)
        // Mejor añadirlo ya para feedback instantáneo
        addChatMessage(players[myPlayerIndex].name, msg);
        input.value = '';
    }
}
function addChatMessage(name, msg) {
    chatMessages.push({name, msg});
    if(chatMessages.length>5) chatMessages.shift();
    renderChat();
    if(document.getElementById('chat-modal').style.display === 'none') {
        document.getElementById('chat-badge').style.display = 'inline';
    }
}
function renderChat() {
    const h = document.getElementById('chat-history');
    h.innerHTML = chatMessages.map(m => `<div class="chat-msg"><b>${m.name}:</b> ${m.msg}</div>`).join('');
    document.getElementById('chat-badge').style.display = 'none';
}
