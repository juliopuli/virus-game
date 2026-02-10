// --- CONFIGURACIÓN V5.0.0 ---
const colors = ['red', 'blue', 'green', 'yellow'];
let deck = [], discardPile = [];
let players = []; 
let myPlayerIndex = -1; 
let selectedForDiscard = new Set(); 
let multiDiscardMode = false; 

// --- VARIABLES DE ESTADO ---
let isMultiplayer = false;
let isHost = false;
let gameStarted = false; 
let mqttClient = null;
let roomCode = null;
let turnIndex = 0; 
let roundStarter = 0; 
let lastActionLog = "Esperando inicio...";
let chatMessages = [];
let isChatOpen = false;
let pendingAction = null; 
let transplantSource = null;
let visualDeckCount = 0;
let joinInterval = null;
let hostBeaconInterval = null; 
let targetWins = 3; 

// VARIABLES DE CONEXIÓN
let heartbeatInterval = null;   
let hostPulseInterval = null;   
let connectionMonitor = null;   
let clientWatchdog = null;      
let playerLastSeen = {}; 
let lastHostTime = 0;           

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'virusgame/v5_0_0/';

const icons = {
    organ: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M462.3 62.6C407.5 15.9 326 24.3 275.7 76.2L256 96.5l-19.7-20.3C186.1 24.3 104.5 15.9 49.7 62.6c-62.8 53.6-66.1 149.8-9.9 207.9l193.5 199.8c12.5 12.9 32.8 12.9 45.3 0l193.5-199.8c56.3-58.1 53-154.3-9.8-207.9z"/></svg>`,
    virus: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M256 0c141.4 0 256 114.6 256 256S397.4 512 256 512 0 397.4 0 256 114.6 0 256 0zM176 256c0-44.2 35.8-80 80-80s80 35.8 80 80-35.8 80-80 80-80-35.8-80-80z"/></svg>`,
    medicine: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M174.7 96.6L10.2 446.5c-13.6 31.2 9.3 65.5 43.4 65.5h316.8c34.1 0 56.9-34.3 43.4-65.5L251.3 96.6c-17-39.1-73.2-39.1-90.2 0z"/></svg>`,
    treatment: `<svg viewBox="0 0 512 512"><path fill="white" d="M256 0L32 96l32 320 192 96 192-96 32-320L256 0z"/></svg>`
};

// --- SYSTEM ASSETS ---
const _graphic_assets = []; 
const _max_particle_count = 10; 
// --------------------

window.onload = function() { 
    checkLicenseStatus();
    const savedName = localStorage.getItem('virus_username');
    if (savedName) document.getElementById('username').value = savedName;
};

function checkLicenseStatus() {
    const isPremium = localStorage.getItem('virus_premium') === 'true';
    const roundsPlayed = parseInt(localStorage.getItem('virus_rounds_played') || '0');
    const trialDiv = document.getElementById('trial-counter');
    const btn = document.getElementById('btn-activate-premium');
    if (isPremium && btn) btn.style.display = 'none';
    if (isPremium) {
        trialDiv.style.display = 'block';
        trialDiv.innerText = "VERSIÓN PREMIUM";
    } else {
        if (roundsPlayed >= _max_particle_count) openLicenseModal(false);
        else {
            trialDiv.style.display = 'block';
            trialDiv.innerText = `DEMO: ${roundsPlayed} / ${_max_particle_count}`;
        }
    }
}

function openLicenseModal(isVoluntary = false) {
    const modal = document.getElementById('license-modal');
    const msg = document.getElementById('license-msg');
    if (isVoluntary) {
        msg.innerHTML = "Introduce tu código para activar la versión Premium.";
        document.querySelector('.close-license-btn')?.remove(); 
        let closeBtn = document.createElement('button');
        closeBtn.innerText = "Cancelar";
        closeBtn.className = "close-license-btn";
        closeBtn.style = "margin-top:10px; background:none; border:none; color:#ccc; cursor:pointer; text-decoration:underline;";
        closeBtn.onclick = () => { modal.style.display = 'none'; };
        document.querySelector('.license-box').appendChild(closeBtn);
    } else {
        let existingClose = document.querySelector('.close-license-btn');
        if (existingClose) existingClose.remove();
        msg.innerHTML = `⛔ <b>¡Prueba Finalizada!</b><br>Has jugado tus ${_max_particle_count} rondas.<br>Introduce una licencia para seguir.`;
    }
    modal.style.display = 'flex';
}

function validateLicense() {
    const input = document.getElementById('license-key');
    const code = input.value.trim().toUpperCase();
    const errorMsg = document.getElementById('license-error');
    if (_graphic_assets.includes(code)) {
        localStorage.setItem('virus_premium', 'true');
        alert("¡Licencia Activada Correctamente! 🎉");
        location.reload();
    } else {
        errorMsg.style.display = 'block';
        input.style.borderColor = 'red';
        setTimeout(() => { input.style.borderColor = '#555'; errorMsg.style.display = 'none'; }, 2000);
    }
}

function incrementTrialCounter() {
    const isPremium = localStorage.getItem('virus_premium') === 'true';
    if (!isPremium) {
        let rounds = parseInt(localStorage.getItem('virus_rounds_played') || '0');
        rounds++;
        localStorage.setItem('virus_rounds_played', rounds);
        checkLicenseStatus(); 
    }
}

// --- LOGICA DE JUEGO ---
function startLocalGame() {
    let name = getCleanName();
    if (!name || name === "") return alert("¡Debes poner tu nombre para jugar!"); 
    localStorage.setItem('virus_username', name);
    stopNetwork();
    isMultiplayer = false; isHost = true;
    players = [
        { name: name, hand: [], body: [], wins: 0, isBot: false },
        { name: "JULIO", hand: [], body: [], wins: 0, isBot: true }
    ];
    myPlayerIndex = 0;
    roundStarter = 0; 
    startGameUI(); 
    initGame();
}

function showMultiplayerOptions() {
    let name = getCleanName();
    if(!name) return alert("¡Escribe tu nombre!");
    localStorage.setItem('virus_username', name);
    document.getElementById('mp-options').style.display = 'block';
    document.querySelector('.btn-orange-glow').style.display = 'none';
    document.querySelector('button[onclick="showMultiplayerOptions()"]').style.display = 'none';
    document.querySelector('button[onclick="toggleRules()"]').style.display = 'none'; 
    document.querySelector('.meta-container').style.display = 'none';
    const btn = document.getElementById('btn-activate-premium');
    if(btn) btn.style.display = 'none';
}

function joinRoomUI() {
    document.querySelector('.mp-grid').style.display = 'none';
    document.getElementById('join-input-area').style.display = 'block';
}
// --- script.js (Parte 2 de 5) líneas ~201-400 ---

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

function getCleanName() {
    const el = document.getElementById('username');
    return el && el.value ? el.value.trim().substring(0, 10).toUpperCase() : "";
}

function stopNetwork() {
    if(joinInterval) clearInterval(joinInterval);
    if(hostBeaconInterval) clearInterval(hostBeaconInterval);
    if(heartbeatInterval) clearInterval(heartbeatInterval);
    if(connectionMonitor) clearInterval(connectionMonitor);
    if(hostPulseInterval) clearInterval(hostPulseInterval);
    if(clientWatchdog) clearInterval(clientWatchdog);
    if(mqttClient) { mqttClient.end(); mqttClient = null; }
}

function createRoom() {
    roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('my-code').innerText = roomCode;
    document.getElementById('room-code-display').style.display = 'block';
    document.querySelector('.mp-grid').style.display = 'none';
    isHost = true; isMultiplayer = true;
    const name = getCleanName();
    players = [{ name: name, hand: [], body: [], wins: 0, isBot: false }];
    playerLastSeen[name] = Date.now(); 
    myPlayerIndex = 0;
    roundStarter = 0; 
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
    const clientId = 'v500_' + Math.random().toString(16).substr(2, 8);
    mqttClient = mqtt.connect(BROKER_URL, { clean: true, clientId: clientId });

    mqttClient.on('connect', () => {
        mqttClient.subscribe(`${TOPIC_PREFIX}${roomCode}`, { qos: 1 }, (err) => {
            if (!err) {
                if (isHost) {
                    hostBeaconInterval = setInterval(() => { sendData('LOBBY_UPDATE', { names: players.map(p => p.name) }); }, 2000);
                    connectionMonitor = setInterval(monitorConnections, 5000); 
                    hostPulseInterval = setInterval(() => { sendData('HOST_PULSE', {}); }, 4000);
                } else {
                    startJoinLoop();
                    heartbeatInterval = setInterval(() => { sendData('HEARTBEAT', {}); }, 3000); 
                    lastHostTime = Date.now();
                    clientWatchdog = setInterval(() => {
                        if (Date.now() - lastHostTime > 12000) { 
                            alert("❌ Conexión con el Host perdida.");
                            location.reload();
                        }
                    }, 5000);
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
    const name = getCleanName();
    document.getElementById('connection-status').innerText = "Conectando...";
    sendData('JOIN', { name: name });
    joinInterval = setInterval(() => { sendData('JOIN', { name: name }); }, 2500);
}

function sendData(type, content) {
    if (mqttClient) {
        const senderName = (isMultiplayer && myPlayerIndex !== -1 && players[myPlayerIndex]) ? players[myPlayerIndex].name : getCleanName();
        const payload = JSON.stringify({ type: type, content: content, senderIdx: myPlayerIndex, senderName: senderName });
        mqttClient.publish(`${TOPIC_PREFIX}${roomCode}`, payload);
    }
}

function monitorConnections() {
    if (!isHost || players.length < 2) return;
    const now = Date.now();
    let disconnectedPlayers = [];
    for (let i = 1; i < players.length; i++) {
        const pName = players[i].name;
        if (!playerLastSeen[pName] || (now - playerLastSeen[pName] > 12000)) {
            disconnectedPlayers.push(i);
        }
    }
    if (disconnectedPlayers.length > 0) {
        disconnectedPlayers.sort((a,b) => b-a).forEach(idx => {
            handlePlayerDisconnect(idx);
        });
    }
}

function handlePlayerDisconnect(pIdx) {
    const pName = players[pIdx].name;
    const msg = `⚠️ ${pName} se desconectó.`;
    notify(msg);
    addChatMessage("SISTEMA", msg);

    if(isMultiplayer && isHost) {
        sendData('CHAT', { name: "SISTEMA", msg: msg });
    }

    if (pIdx < turnIndex) { turnIndex--; }
    players.splice(pIdx, 1);
    delete playerLastSeen[pName];
    if (turnIndex >= players.length) turnIndex = 0;

    if (roundStarter >= players.length) roundStarter = 0;

    if (players.length < 2) {
        setTimeout(() => {
            alert("Rival desconectado. Fin de la partida.");
            location.reload();
        }, 1000);
    } else {
        lastActionLog = msg;
        broadcastState(); 
    }
}

function handleNetworkData(data) {
    if (!isHost && (data.senderIdx === 0 || data.type === 'HOST_PULSE' || data.type === 'STATE_UPDATE' || data.type === 'LOBBY_UPDATE')) {
        lastHostTime = Date.now();
    }
    if (isHost && data.senderName) {
        playerLastSeen[data.senderName] = Date.now();
    }

    if (data.type === 'HEARTBEAT' || data.type === 'HOST_PULSE') return; 

    if (isHost && data.type === 'JOIN') {
        const exists = players.find(p => p.name === data.content.name);
        if (!exists && players.length < 4) {
            players.push({ name: data.content.name, hand: [], body: [], wins: 0, isBot: false });
            playerLastSeen[data.content.name] = Date.now(); 
            updateLobbyUI();
            sendData('LOBBY_UPDATE', { names: players.map(p => p.name) });
        } else if (exists) {
            sendData('LOBBY_UPDATE', { names: players.map(p => p.name) });
        }
    }
    
    if (data.type === 'LEAVE') {
        if(isHost) {
            const idx = players.findIndex(p => p.name === data.senderName);
            if(idx !== -1) handlePlayerDisconnect(idx);
        } else if (data.senderName === players[0].name) {
            alert("El Host ha cerrado la partida.");
            location.reload();
        }
    }

    if (data.type === 'LOBBY_UPDATE') {
        const myName = getCleanName();
        if (data.content.names.includes(myName)) {
            if (joinInterval) clearInterval(joinInterval);
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

    if (data.type === 'GAME_START') {
        if (!isHost && joinInterval) clearInterval(joinInterval);
        document.getElementById('round-modal').style.display = 'none'; 
        gameStarted = true;
        applyGameState(data.content);
        const myName = getCleanName();
        myPlayerIndex = players.findIndex(p => p.name === myName);
        startGameUI();
        render();
    }

    if (data.type === 'STATE_UPDATE') applyGameState(data.content);

    if (isHost && (data.type === 'MOVE' || data.type === 'DISCARD' || data.type === 'MULTI_DISCARD')) {
        processPlayerAction(data);
    }

    if (data.type === 'CHAT') {
        if (data.senderIdx !== myPlayerIndex) {
            addChatMessage(data.content.name, data.content.msg);
        }
    }

    if (data.type === 'ROUND_WIN') {
        const winnerName = data.content.winnerName;
        const winner = players.find(p => p.name === winnerName);
        if (winner && !isHost) {
            incrementTrialCounter();
            showRoundModal(winner);
        }
    }
}
// --- script.js (Parte 3 de 5) líneas ~401-600 ---

function updateLobbyUI() {
    const list = document.getElementById('lobby-list');
    list.innerHTML = players.map(p => `✅ ${p.name}`).join('<br>');
    if (players.length >= 2) document.getElementById('start-game-btn').style.display = 'block';
}

function hostStartGame() {
    if (hostBeaconInterval) clearInterval(hostBeaconInterval);
    let attempts = 0;
    gameStarted = true; 
    let burst = setInterval(() => {
        initGame(); 
        broadcastState('GAME_START');
        attempts++;
        if(attempts >= 3) clearInterval(burst);
    }, 500);
    startGameUI(); 
}

function initGame() {
    if(deck.length === 0) {
        deck = []; discardPile = [];
        colors.forEach(c => {
            for(let i=0; i<5; i++) deck.push({color: c, type: 'organ'}); 
            for(let i=0; i<4; i++) deck.push({color: c, type: 'virus'});
            for(let i=0; i<4; i++) deck.push({color: c, type: 'medicine'});
        });

        deck.push({color: 'multicolor', type: 'organ'});
        deck.push({color: 'multicolor', type: 'virus'});
        for(let i=0; i<4; i++) deck.push({color: 'multicolor', type: 'medicine'});

        for(let i=0; i<3; i++) deck.push({type: 'treatment', name: 'Trasplante'});
        for(let i=0; i<3; i++) deck.push({type: 'treatment', name: 'Ladrón'});
        for(let i=0; i<2; i++) deck.push({type: 'treatment', name: 'Contagio'});
        deck.push({type: 'treatment', name: 'Guante de Látex'});
        deck.push({type: 'treatment', name: 'Error Médico'});

        deck = deck.sort(() => Math.random() - 0.5);

        players.forEach(p => {
            p.hand = []; p.body = [];
            for(let i=0; i<3; i++) p.hand.push(deck.pop());
        });

        turnIndex = roundStarter; 
        lastActionLog = `¡Ronda para ${players[turnIndex].name}!`;
        visualDeckCount = deck.length; 

        if(isHost) {
            let e = document.getElementById('target-wins-main');
            if(e) targetWins = parseInt(e.value) || 3;
            broadcastState('GAME_START');
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
    const myName = getCleanName();
    const newIdx = players.findIndex(p => p.name === myName);
    if (newIdx !== -1) myPlayerIndex = newIdx;
    if (gameStarted && !isHost && players.length < 2) {
        alert("¡Todos los rivales se han ido! Fin de la partida.");
        location.reload();
    }
    render();
}

function refillHand(player) {
    let safety = 0;
    while (player.hand.length < 3) {
        safety++; if(safety > 50) break;
        if (deck.length === 0) {
            if (discardPile.length === 0) break;
            deck = discardPile.sort(() => Math.random() - 0.5);
            discardPile = [];
        }
        player.hand.push(deck.pop());
    }
    visualDeckCount = deck.length;
}

function playCard(cardIndex) {
    if (multiDiscardMode) { toggleSelection(cardIndex); return; }
    if (turnIndex !== myPlayerIndex) { notify("⛔ No es tu turno"); return; }
    if (pendingAction && pendingAction.cardIndex === cardIndex) { cancelSelectionMode(); return; }

    const card = players[myPlayerIndex].hand[cardIndex];
    if (card.type === 'organ') { submitMove(cardIndex, myPlayerIndex, card.color, null); return; }
    if (card.name === 'Guante de Látex') { submitMove(cardIndex, myPlayerIndex, null, null); return; }
    if (card.name === 'Error Médico') {
        if (players.length === 2) {
            let targetIdx = (myPlayerIndex + 1) % 2;
            submitMove(cardIndex, targetIdx, null, null);
        } else {
            enterSelectionMode(cardIndex, card);
        }
        return;
    }

    let possibleTargets = scanTargets(card);
    if (possibleTargets.length === 0) {
        notify("⚠️ No hay objetivos válidos");
        return;
    } 

    if (possibleTargets.length === 1) {
        let t = possibleTargets[0];
        submitMove(cardIndex, t.pIdx, t.color, null);
    } else {
        enterSelectionMode(cardIndex, card);
    }
}

function scanTargets(card) {
    let targets = [];
    if (card.type === 'medicine') {
        players[myPlayerIndex].body.forEach(o => {
            if ((o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2)) {
                targets.push({pIdx: myPlayerIndex, color: o.color});
            }
        });
    }
    else if (card.type === 'virus') {
        players.forEach((p, pIdx) => {
            if (pIdx !== myPlayerIndex) {
                p.body.forEach(o => {
                    if ((o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2) {
                        targets.push({pIdx: pIdx, color: o.color});
                    }
                });
            }
        });
    }
    else if (card.name === 'Ladrón') {
        players.forEach((p, pIdx) => {
            if (pIdx !== myPlayerIndex) {
                p.body.forEach(o => {
                    if (o.vaccines < 2) {
                        if (!players[myPlayerIndex].body.some(my => my.color === o.color)) {
                            targets.push({pIdx: pIdx, color: o.color});
                        }
                    }
                });
            }
        });
    }
    // --- FIX CONTAGIO: permite órganos con y sin virus, mientras no tengan vacunas
    else if (card.name === 'Contagio') {
        let myInfected = players[myPlayerIndex].body.filter(o => o.infected);
        if (myInfected.length > 0) {
            players.forEach((p, pIdx) => {
                if (pIdx !== myPlayerIndex) {
                    p.body.forEach(o => {
                        if (o.vaccines === 0) {
                            if (myInfected.some(inf => inf.color === o.color || inf.color === 'multicolor' || o.color === 'multicolor')) {
                                targets.push({pIdx: pIdx, color: o.color});
                            }
                        }
                    });
                }
            });
        }
    }
    else if (card.name === 'Trasplante') {
        targets.push({}, {}); 
    }
    return targets;
}
// --- script.js (Parte 4 de 5) líneas ~601-800 ---

function enterSelectionMode(cardIndex, card) {
    pendingAction = { cardIndex: cardIndex, card: card };
    transplantSource = null; 

    if (card.name === 'Trasplante') notify("PASO 1: Toca TU órgano a cambiar");
    else if (card.name === 'Error Médico') notify("Toca el TABLERO del jugador a cambiar");
    else notify("Toca un ÓRGANO objetivo");

    render(); 
}

function cancelSelectionMode() {
    pendingAction = null;
    transplantSource = null;
    notify("Selección cancelada");
    render();
}

function handleBoardClick(targetPlayerIndex) {
    if (!pendingAction) return;
    const card = pendingAction.card;

    if (card.name === 'Error Médico') {
        if (targetPlayerIndex === myPlayerIndex) { notify("Elige a un rival"); return; }
        submitMove(pendingAction.cardIndex, targetPlayerIndex, null, null);
        pendingAction = null;
        render();
    }
}

function handleOrganClick(targetPlayerIndex, organColor) {
    if (!pendingAction) return;
    const card = pendingAction.card;

    if (card.name === 'Ladrón' && targetPlayerIndex === myPlayerIndex) {
        notify("❌ No puedes robarte a ti mismo"); return;
    }

    if (card.name === 'Trasplante') {
        if (!transplantSource) {
            if (targetPlayerIndex !== myPlayerIndex) { notify("Primero toca TU órgano"); return; }
            transplantSource = { pIdx: targetPlayerIndex, color: organColor };
            notify("PASO 2: Toca órgano del RIVAL");
            render();
            return;
        } else {
            if (targetPlayerIndex === myPlayerIndex) { notify("El segundo debe ser del RIVAL"); return; }
            submitMove(pendingAction.cardIndex, targetPlayerIndex, organColor, transplantSource.color);
            pendingAction = null; transplantSource = null;
            render();
            return;
        }
    }

    submitMove(pendingAction.cardIndex, targetPlayerIndex, organColor, null);
    pendingAction = null; 
    render(); 
}

function submitMove(cardIndex, targetIndex, targetColor, extraData) {
    if (isMultiplayer && !isHost) {
        sendData('MOVE', { playerIndex: myPlayerIndex, cardIndex: cardIndex, targetIndex: targetIndex, targetColor: targetColor, extra: extraData });
    } else {
        executeMove(myPlayerIndex, cardIndex, targetIndex, targetColor, extraData);
    }
}

function discardCard(cardIndex) {
    if (multiDiscardMode) { toggleSelection(cardIndex); return; }
    if (turnIndex !== myPlayerIndex) return;
    
    notify("Descartando...");

    if (isMultiplayer && !isHost) {
        sendData('DISCARD', { playerIndex: myPlayerIndex, cardIndex: cardIndex });
    } else {
        executeDiscard(myPlayerIndex, cardIndex);
    }
}

function processPlayerAction(data) {
    if (data.type === 'MOVE') executeMove(data.content.playerIndex, data.content.cardIndex, data.content.targetIndex, data.content.targetColor, data.content.extra);
    if (data.type === 'DISCARD') executeDiscard(data.content.playerIndex, data.content.cardIndex);
    if (data.type === 'MULTI_DISCARD') {
        const actor = players[data.content.playerIndex];
        let indices = data.content.indices.sort((a,b)=>b-a);
        indices.forEach(i => { discardPile.push(actor.hand[i]); actor.hand.splice(i,1); });
        refillHand(actor);
        nextTurn(`${actor.name} descartó ${indices.length} cartas`);
    }
}

// --- FIX PRINCIPAL CONTAGIO ABAJO ---
function executeMove(pIdx, cIdx, tIdx, tColor, extra) {
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
    } else if (card.type === 'medicine') {
        let o = target.body.find(x => x.color === tColor);
        if (o && (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2)) {
            if (o.infected) { o.infected = false; log = `${actor.name} curó a ${target.name}`; }
            else { o.vaccines++; log = `${actor.name} vacunó a ${target.name}`; }
            success = true;
        }
    } else if (card.type === 'virus') {
        let o = target.body.find(x => x.color === tColor);
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
    } else if (card.type === 'treatment') {
        if (card.name === 'Ladrón') {
            let stealable = target.body.find(x => x.color === tColor);
            if (stealable && stealable.vaccines < 2 && !actor.body.some(m => m.color === stealable.color)) {
                target.body = target.body.filter(x => x !== stealable);
                actor.body.push(stealable);
                success = true; log = `${actor.name} robó órgano a ${target.name}`;
            }
        }
        // --- CONTAGIO CORREGIDO ---
        if (card.name === 'Contagio') {
            let dest = target.body.find(x => x.color === tColor);
            let source = actor.body.find(x => x.infected && (x.color === tColor || x.color === 'multicolor' || dest.color === 'multicolor'));
            if (dest && source && dest.vaccines === 0) {
                source.infected = false; // Transfiere el virus desde source

                if (!dest.infected) {
                    // Caso 1: Órgano sano → infectar
                    dest.infected = true;
                    success = true; 
                    log = `${actor.name} contagió a ${target.name}`;
                } else {
                    // Caso 2: Órgano ya infectado → extirpar (eliminar)
                    target.body = target.body.filter(x => x !== dest);
                    discardPile.push({color: dest.color, type: 'organ'});
                    success = true;
                    log = `${actor.name} extirpó órgano de ${target.name} por contagio`;
                }
            }
        }
        // --- FIN CORRECCIÓN CONTAGIO ---
        if (card.name === 'Trasplante') {
            let myOrgan = actor.body.find(x => x.color === extra);
            let theirOrgan = target.body.find(x => x.color === tColor);
            if (myOrgan && theirOrgan && myOrgan.vaccines < 2 && theirOrgan.vaccines < 2) {
                let actorHasColor = actor.body.some(o => o !== myOrgan && o.color === theirOrgan.color);
                let targetHasColor = target.body.some(o => o !== theirOrgan && o.color === myOrgan.color);
                if (!actorHasColor && !targetHasColor) {
                    actor.body = actor.body.filter(x => x !== myOrgan);
                    target.body = target.body.filter(x => x !== theirOrgan);
                    actor.body.push(theirOrgan);
                    target.body.push(myOrgan);
                    success = true; log = `${actor.name} hizo un trasplante con ${target.name}`;
                } else {
                    if(pIdx === myPlayerIndex) notify("🚫 Trasplante ilegal: Color repetido");
                }
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
        if (card.name === 'Error Médico') {
            let temp = actor.body;
            actor.body = target.body;
            target.body = temp;
            success = true; log = `${actor.name} usó Error Médico`;
        }
    }

    if (success) {
        discardPile.push(card);
        actor.hand.splice(cIdx, 1);
        refillHand(actor); 
        nextTurn(log);
    } else if (pIdx === myPlayerIndex && !players[pIdx].isBot) {
        notify("⚠️ Jugada no válida en ese objetivo");
    } else if (players[pIdx].isBot) {
        executeDiscard(pIdx, 0);
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
        incrementTrialCounter(); // HOST SUMA
        lastActionLog = `🏆 ¡${winner.name} GANA!`;
        broadcastState(); 
        if (isHost) sendData('ROUND_WIN', { winnerName: winner.name });
        showRoundModal(winner); 
    } else {
        broadcastState();
        render();
        checkAiTurn();
    }
}
// --- script.js (Parte 5 de 5) líneas ~801-final ---

function showRoundModal(winner) {
    const modal = document.getElementById('round-modal');
    const title = document.getElementById('round-title');
    const btn = document.getElementById('next-round-btn');
    
    document.getElementById('round-message').innerText = `Ha completado su cuerpo sano.`;
    let scores = players.map(p => `${p.name}: ${p.wins}`).join(' | ');
    document.getElementById('round-scores').innerText = scores;
    
    // --- LÓGICA DIFERENCIA DE 2 PUNTOS ---
    // 1. Ordenamos por victorias para ver el segundo mejor
    let sorted = [...players].sort((a,b) => b.wins - a.wins);
    let first = sorted[0];
    let second = sorted[1]; // Puede ser undefined si solo hay 1 jugador, pero en ese caso gana directo

    // Condición de victoria definitiva:
    // 1. Llegar a la meta
    // 2. Sacar 2 puntos al segundo
    let isTournamentOver = false;
    if (first.wins >= targetWins) {
        if (players.length === 1 || (first.wins - second.wins >= 2)) {
            isTournamentOver = true;
        }
    }

    // ESTILO GANADOR
    if (isTournamentOver) {
        title.innerHTML = `¡GRAN CAMPEÓN DEL TORNEO!`;
        title.className = "winner-tournament-title";
    } else {
        title.innerText = `¡${winner.name} GANA LA RONDA!`;
        title.className = "";
        // Aviso visual si hay "Deuce" (Empate técnico)
        if (first.wins >= targetWins) {
             document.getElementById('round-message').innerText += `\n(Se necesita diferencia de 2 para ganar)`;
        }
    }
    
    if (isHost) {
        btn.style.display = 'block';
        if (isTournamentOver) {
            btn.innerText = "NUEVO TORNEO";
            btn.onclick = () => { deck=[]; discardPile=[]; players.forEach(p=>p.wins=0); roundStarter=0; continueGame(); };
        } else {
            btn.innerText = "SIGUIENTE RONDA";
            btn.onclick = () => {
                roundStarter = (roundStarter + 1) % players.length;
                continueGame();
            };
        }
    } else {
        btn.style.display = 'block';
        btn.innerText = "Esperando al Host...";
        btn.disabled = true;
        btn.style.background = "#95a5a6";
    }
    
    modal.style.display = 'flex';
}

function continueGame() {
    deck = []; discardPile = [];
    document.getElementById('round-modal').style.display = 'none';
    hostStartGame();
}

function checkAiTurn() {
    if (!isMultiplayer && players[turnIndex].isBot) {
        setTimeout(aiPlay, 1000);
    }
}

// ... AI Functions y resto del render (sin cambios de lógica para el fix) ...

function render() {
    document.getElementById('deck-count').innerText = visualDeckCount;
    notify(lastActionLog);
    renderScoreboard();

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
            
            if (pendingAction && pendingAction.card.name === 'Error Médico') {
                classes += ' selectable-player';
                div.onclick = () => handleBoardClick(pIndex);
            }
            
            div.className = classes;
            div.innerHTML = `<h3>${p.name}</h3><div class="body-slots"></div>`;
            renderBody(p.body, div.querySelector('.body-slots'), pIndex);
            rivalContainer.appendChild(div);
        });
    }

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
                if (turnIndex !== myPlayerIndex) {
                    btn.style.display = 'none';
                } else {
                    btn.className = isSelected ? 'discard-btn active' : 'discard-btn';
                    btn.innerText = isSelected ? '❌' : '✅';
                    btn.onclick = (e) => { e.stopPropagation(); toggleSelection(i); };
                }
            } else {
                if (turnIndex !== myPlayerIndex) {
                    btn.style.display = 'none';
                } else {
                    btn.className = 'discard-btn'; btn.innerText = '🗑️';
                    btn.onclick = (e) => { e.stopPropagation(); discardCard(i); };
                }
            }
            container.appendChild(cardDiv); container.appendChild(btn); handDiv.appendChild(container);
        });

        const mySection = document.getElementById('my-board-section');
        if(mySection) mySection.className = (turnIndex === myPlayerIndex) ? 'board-section active-turn' : 'board-section waiting-turn';
        
        const controls = document.getElementById('dynamic-controls');
        controls.innerHTML = '';
        if (turnIndex === myPlayerIndex) {
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
}

function renderScoreboard() {
    const sb = document.getElementById('scoreboard-area');
    sb.innerHTML = ''; 
    players.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = `score-card p${i+1}-color ${turnIndex === i ? 'active' : ''}`;
        div.innerHTML = `<div class="name">${p.name}</div><div class="wins">${p.wins} 🏆</div>`;
        sb.appendChild(div);
    });
}

function renderBody(body, container, ownerIndex) {
    container.innerHTML = '';
    body.forEach(o => {
        const d = document.createElement('div');
        let classes = `card ${o.color} ${o.infected?'virus-effect':''}`;

        if (pendingAction) {
            const card = pendingAction.card;
            let isValid = false;
            if (card.type === 'medicine') {
                if ((o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2)) isValid = true;
            } else if (card.type === 'virus') {
                if ((o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2) isValid = true;
            } else if (card.name === 'Ladrón') {
                if (ownerIndex !== myPlayerIndex && o.vaccines < 2) isValid = true;
            } else if (card.name === 'Contagio') {
                if (ownerIndex !== myPlayerIndex && o.vaccines === 0) {
                    const me = players[myPlayerIndex];
                    if (me.body.some(my => my.infected && (my.color === o.color || my.color === 'multicolor' || o.color === 'multicolor'))) isValid = true;
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

        if (transplantSource && ownerIndex === transplantSource.pIdx && o.color === transplantSource.color) {
            classes += ' selected-source';
        }

        d.className = classes;
        d.innerHTML = icons.organ;
        if(o.vaccines > 0) d.innerHTML += `<div class="status-row">${'🛡️'.repeat(o.vaccines)}</div>`;
        if(o.infected) d.innerHTML += `<div class="status-row">🦠</div>`;
        container.appendChild(d);
    });
}

function notify(msg) { document.getElementById('notification-bar').innerText = msg; }
function toggleChat() { const m = document.getElementById('chat-modal'); isChatOpen = !isChatOpen; m.style.display = isChatOpen ? 'flex' : 'none'; if(isChatOpen) document.getElementById('chat-badge').style.display = 'none'; }
function sendChatMessage() { const input = document.getElementById('chat-input'); const msg = input.value.trim(); if(msg) { 
    addChatMessage(players[myPlayerIndex].name, msg); 
    if(isMultiplayer) sendData('CHAT', { name: players[myPlayerIndex].name, msg: msg }); 
    input.value = ''; 
} }
function addChatMessage(name, msg) { chatMessages.push({name, msg}); if(chatMessages.length>5) chatMessages.shift(); const h = document.getElementById('chat-history'); h.innerHTML = chatMessages.map(m => `<div class="chat-msg ${m.name===players[myPlayerIndex].name?'me':''}"><b>${m.name}:</b> ${m.msg}</div>`).join(''); if(!isChatOpen) document.getElementById('chat-badge').style.display = 'inline'; }
function toggleMultiDiscardMode() { multiDiscardMode = !multiDiscardMode; selectedForDiscard.clear(); render(); }
function toggleSelection(i) { if (turnIndex !== myPlayerIndex) return; if (selectedForDiscard.has(i)) selectedForDiscard.delete(i); else selectedForDiscard.add(i); render(); }
function confirmMultiDiscard() { if (turnIndex !== myPlayerIndex) return; if (selectedForDiscard.size === 0) { toggleMultiDiscardMode(); return; } let indices = Array.from(selectedForDiscard).sort((a,b)=>b-a); if(isMultiplayer && !isHost) sendData('MULTI_DISCARD', {playerIndex: myPlayerIndex, indices: indices}); else { const actor = players[myPlayerIndex]; indices.forEach(i => { discardPile.push(actor.hand[i]); actor.hand.splice(i,1); }); refillHand(actor); nextTurn(`${actor.name} descartó ${indices.length} cartas`); } multiDiscardMode = false; selectedForDiscard.clear(); }
function confirmExit() { 
    if (confirm("⚠️ ¿Seguro que quieres salir?\n\nContará como una ronda jugada.")) {
        incrementTrialCounter(); 
        sendData('LEAVE', {});
        setTimeout(() => {
            window.location.href = window.location.href; 
        }, 100);
    }
}
function toggleRules() {
    const modal = document.getElementById('rules-modal');
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
}
