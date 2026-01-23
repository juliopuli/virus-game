const colors = ['red', 'blue', 'green', 'yellow'];
let deck = [], discardPile = [];
let playerHand = [], aiHand = [], playerBody = [], aiBody = [];
let selectedForDiscard = new Set(); 
let multiDiscardMode = false; 

// --- VARIABLES DE ESTADO ---
let isMultiplayer = false;
let isHost = false;
// let peer = null; // YA NO USAMOS PEER
let mqttClient = null; // NUEVO CLIENTE
let myTopic = null;    // Donde yo escucho
let rivalTopic = null; // Donde yo envío
let currentRoomCode = null;

let myTurn = true; 
let lastActionLog = "Bienvenido";
let roundStarter = 'p1';

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

// --- MENÚ Y ARRANQUE LOCAL ---
function startLocalGame() {
    isMultiplayer = false; isHost = true;
    if(mqttClient) { mqttClient.end(); mqttClient = null; }
    
    opponentName = "JULIO"; 
    myPlayerName = document.getElementById('username').value || "Jugador"; 
    
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-container').classList.remove('blurred');
    document.getElementById('rival-name').innerText = opponentName;
    document.getElementById('rival-area-title').innerText = "🤖 La salud de " + opponentName;
    document.getElementById('target-wins').disabled = false;
    document.getElementById('restart-btn').style.display = 'block';
    
    loadScores();
    roundStarter = 'p1'; 
    initGame(); 
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

function generateRoomCode() { return Math.random().toString(36).substring(2, 6).toUpperCase(); }

// --- NUEVA LÓGICA DE RED (MQTT / WEBSOCKETS) ---
// Usamos un broker público gratuito pero robusto (EMQX)
const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt'; 

function createRoom() {
    let btns = document.querySelectorAll('.mp-action-btn');
    btns.forEach(b => b.style.display = 'none');

    const code = generateRoomCode();
    currentRoomCode = code;
    document.getElementById('my-code').innerText = code;
    document.getElementById('room-code-display').style.display = 'block';
    
    isHost = true;
    setupMqttConnection();
}

function connectToPeer() {
    const code = document.getElementById('remote-code-input').value.toUpperCase();
    if (!code) return alert("Introduce un código");
    
    isHost = false; 
    currentRoomCode = code;
    setupMqttConnection();
}

function setupMqttConnection() {
    if(mqttClient) mqttClient.end();
    
    // Conexión al servidor público
    mqttClient = mqtt.connect(BROKER_URL);

    mqttClient.on('connect', () => {
        console.log("Conectado al servidor MQTT");
        
        // Definir buzones (Topics)
        // Estructura: virusgame/CODIGO/host (Host escucha aquí)
        // Estructura: virusgame/CODIGO/client (Cliente escucha aquí)
        
        if (isHost) {
            myTopic = `virusgame/${currentRoomCode}/host`;
            rivalTopic = `virusgame/${currentRoomCode}/client`;
        } else {
            myTopic = `virusgame/${currentRoomCode}/client`;
            rivalTopic = `virusgame/${currentRoomCode}/host`;
        }

        // Suscribirse a mi buzón
        mqttClient.subscribe(myTopic, (err) => {
            if (!err) {
                if (!isHost) {
                    // Si soy cliente, al conectar envío saludo
                    sendData('HANDSHAKE', { name: myPlayerName });
                }
            }
        });
    });

    mqttClient.on('message', (topic, message) => {
        try {
            const data = JSON.parse(message.toString());
            handleNetworkData(data);
        } catch (e) { console.error("Error mensaje", e); }
    });
    
    mqttClient.on('error', (err) => {
        console.error(err);
        alert("Error de conexión (MQTT). Revisa internet.");
    });
}

function sendData(type, content) {
    if (mqttClient && mqttClient.connected) {
        const payload = JSON.stringify({ type: type, content: content });
        mqttClient.publish(rivalTopic, payload);
    }
}

// --- GESTIÓN DE DATOS ---
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
            sendData('HANDSHAKE_REPLY', { name: myPlayerName });
            document.getElementById('restart-btn').style.display = 'none';
            document.getElementById('target-wins').disabled = false; 
            
            playerWins = 0; aiWins = 0;
            updateScoreboard();
            roundStarter = 'p1';
            
            notify("Rival conectado. Iniciando...");
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

    if (data.type === 'STATE_UPDATE') { applyGameState(data.content); }
    
    if (data.type === 'ROUND_OVER') {
        const info = data.content;
        if (info.winner === 'client') alert("¡GANASTE LA RONDA!");
        else alert("¡" + opponentName + " GANA LA RONDA!");
        
        if (info.tournamentOver) {
            setTimeout(() => {
                if (info.winner === 'client') alert("🏆 ¡CAMPEÓN DEL TORNEO!");
                else alert("💀 " + opponentName + " GANA EL TORNEO");
            }, 500);
        }
    }
    
    if (data.type === 'MOVE' && isHost) {
        if (data.content.action === 'multi_discard') {
            let indices = data.content.indices.sort((a,b)=>b-a);
            indices.forEach(i => { discardPile.push(aiHand[i]); aiHand.splice(i,1); });
            while (aiHand.length < 3) { let c = drawCard(); if(c) aiHand.push(c); else break; }
            myTurn = !myTurn;
            lastActionLog = opponentName + " descartó " + indices.length;
            broadcastState();
            render();
        } else {
            executeRemoteMove(data.content);
        }
    }
}

function applyGameState(state) {
    playerHand = state.p2Hand || []; aiHand = state.p1Hand || [];     
    playerBody = state.p2Body || []; aiBody = state.p1Body || [];
    deck = state.deck || []; discardPile = state.discard || [];
    myTurn = (state.turn === 'p2'); 
    playerWins = state.wins.p2; aiWins = state.wins.p1;
    lastActionLog = state.lastLog || "";
    
    updateScoreboard();
    render(); 
}

// --- JUEGO CORE ---
function initGame() {
    deck = []; discardPile = []; playerHand = []; aiHand = []; playerBody = []; aiBody = []; 
    selectedForDiscard.clear(); multiDiscardMode = false;
    lastActionLog = "Nueva Ronda";
    
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
    
    myTurn = (roundStarter === 'p1');

    updateScoreboard();
    render(); 
    
    if (isMultiplayer && isHost) {
        setTimeout(broadcastState, 300); 
    } 
    else if (!isMultiplayer) { 
        if(myTurn) notify("¡A jugar! Tu turno.");
        else {
            notify("Turno de " + opponentName);
            setTimeout(aiTurn, 1500); 
        }
    }
}

function broadcastState() {
    if (!isMultiplayer || !isHost) return;
    const gameState = {
        p1Hand: playerHand, p2Hand: aiHand, 
        p1Body: playerBody, p2Body: aiBody,
        deck: deck, discard: discardPile,
        turn: myTurn ? 'p1' : 'p2',
        wins: { p1: playerWins, p2: aiWins },
        lastLog: lastActionLog
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

function checkWin() {
    if (isMultiplayer && !isHost) return; 
    let roundWinner = null;
    if (checkWinCondition(playerBody)) roundWinner = 'player';
    else if (checkWinCondition(aiBody)) roundWinner = 'ai';
    if (roundWinner) handleRoundEnd(roundWinner);
}

function handleRoundEnd(winner) {
    const target = parseInt(document.getElementById('target-wins').value) || 5;
    let tournamentOver = false;

    if (winner === 'player') { playerWins++; alert("¡GANASTE LA RONDA!"); } 
    else { aiWins++; alert("¡" + opponentName + " GANA LA RONDA!"); }

    if (!isMultiplayer) {
        localStorage.setItem('virus_playerWins', playerWins);
        localStorage.setItem('virus_aiWins', aiWins);
    }
    updateScoreboard();

    if (playerWins >= target) {
        tournamentOver = true;
        setTimeout(() => { alert("🏆 ¡CAMPEÓN DEL TORNEO!"); resetSeries(); }, 500);
    } else if (aiWins >= target) {
        tournamentOver = true;
        setTimeout(() => { alert("💀 " + opponentName + " GANA EL TORNEO"); resetSeries(); }, 500);
    } else {
        roundStarter = (roundStarter === 'p1') ? 'p2' : 'p1';
        setTimeout(() => initGame(), 500);
    }

    if (isMultiplayer && isHost) {
        let clientResult = (winner === 'ai') ? 'client' : 'host';
        sendData('ROUND_OVER', { winner: clientResult, tournamentOver: tournamentOver });
        broadcastState();
    }
}

function checkWinCondition(body) { return body.filter(o => !o.infected).length >= 4; }

function resetSeries() {
    playerWins = 0; aiWins = 0;
    roundStarter = 'p1';
    if (!isMultiplayer) { localStorage.setItem('virus_playerWins', 0); localStorage.setItem('virus_aiWins', 0); }
    initGame();
}

function confirmRestartSeries() {
    if(isMultiplayer && !isHost) return;
    setTimeout(() => { if(confirm("¿Reiniciar torneo?")) resetSeries(); }, 50);
}

function notify(msg) { 
    const el = document.getElementById('notification-bar');
    if(!el) return;
    if (deck.length > 0) {
        let turnMsg = myTurn ? `Tu Turno (${myPlayerName})` : `Turno de ${opponentName}`;
        el.innerHTML = `<span>${turnMsg}</span> <span style="opacity:0.6">|</span> <span style="font-weight:400; font-style:italic; font-size: 0.8rem">${lastActionLog}</span>`;
    } else { el.innerText = msg; }
}

function drawCard() {
    if (deck.length === 0) {
        if (discardPile.length > 0) { deck = discardPile.sort(() => Math.random() - 0.5); discardPile = []; } else return null;
    } return deck.pop();
}

// --- LOGICA JUEGO ---
function playCard(index) {
    if (isMultiplayer && !myTurn) { notify("⛔ Es el turno de " + opponentName); return; }
    if (multiDiscardMode) { toggleSelection(index); return; }

    const card = playerHand[index];
    let selectedColor = null;

    if (card.type === 'medicine') {
        let candidates = playerBody.filter(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2));
        if (candidates.length > 1) {
            for (let target of candidates) {
                if (confirm(`¿Aplicar a Órgano ${target.color.toUpperCase()}?`)) { selectedColor = target.color; break; }
            }
            if (!selectedColor) return;
        }
    }
    if (card.type === 'virus') {
        let candidates = aiBody.filter(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2);
        if (candidates.length > 1) {
            for (let target of candidates) {
                if (confirm(`¿Infectar Órgano ${target.color.toUpperCase()}?`)) { selectedColor = target.color; break; }
            }
            if (!selectedColor) return;
        }
    }
    if (card.name === 'Ladrón') {
        let stealable = aiBody.filter(o => o.vaccines < 2 && !playerBody.some(m => m.color === o.color));
        if (stealable.length > 1) {
            for (let target of stealable) {
                if (confirm(`¿Robar Órgano ${target.color.toUpperCase()}?`)) { selectedColor = target.color; break; }
            }
            if (!selectedColor) return;
        } else if (stealable.length === 0) {
            alert("⚠️ No hay órganos para robar"); return;
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
    let actorName = isPlayerMove ? (isHost ? myPlayerName : opponentName) : (isHost ? opponentName : myPlayerName);
    if (!isMultiplayer && !isPlayerMove) actorName = opponentName;
    if (!isMultiplayer && isPlayerMove) actorName = "Tú";

    const card = currentHand[index];
    if(!card) return;

    let actionSuccess = false;
    let keepCard = false;
    let actionDesc = "";

    if (card.type === 'treatment') {
        actionSuccess = applyTreatment(card.name, isPlayerMove, forcedTargetColor);
        if(actionSuccess) actionDesc = `Usó ${card.name}`;
    } 
    else if (card.type === 'organ') {
        if (!currentBody.find(o => o.color === card.color)) { 
            currentBody.push({color: card.color, vaccines: 0, infected: false}); 
            actionSuccess = true; keepCard = true; 
            actionDesc = `Sacó Órgano ${card.color.toUpperCase()}`;
        } else if(isPlayerMove && !isMultiplayer) alert("⚠️ Ya tienes ese color");
    } 
    else if (card.type === 'medicine') {
        let candidates = currentBody.filter(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && (o.infected || o.vaccines < 2));
        let target = null;
        if (forcedTargetColor) target = candidates.find(o => o.color === forcedTargetColor);
        else if (candidates.length > 0) target = candidates[0];

        if (target) {
             if (target.infected) { target.infected = false; actionDesc = `Curó Órgano ${target.color}`; }
             else { target.vaccines++; actionDesc = `Vacunó Órgano ${target.color}`; }
             actionSuccess = true;
        } else if(isPlayerMove && !isMultiplayer) alert("⚠️ No hay objetivo válido");
    } 
    else if (card.type === 'virus') {
        let candidates = rivalBody.filter(o => (o.color === card.color || card.color === 'multicolor' || o.color === 'multicolor') && o.vaccines < 2);
        let target = null;
        if (forcedTargetColor) target = candidates.find(o => o.color === forcedTargetColor);
        else if (candidates.length > 0) target = candidates[0];

        if (target) {
            if (target.vaccines > 0) { target.vaccines--; actionDesc = `Destruyó vacuna en ${target.color}`; }
            else if (!target.infected) { target.infected = true; actionDesc = `Infectó Órgano ${target.color}`; }
            else { 
                if (isPlayerMove) aiBody = aiBody.filter(o => o !== target);
                else playerBody = playerBody.filter(o => o !== target);
                discardPile.push({color: target.color, type: 'organ'}); 
                actionDesc = `Extirpó Órgano ${target.color}`;
            }
            actionSuccess = true;
        } else if(isPlayerMove && !isMultiplayer) alert("⚠️ No puedes infectar nada");
    }

    if (actionSuccess) {
        if (!keepCard) discardPile.push(card);
        currentHand.splice(index, 1);
        while (currentHand.length < 3) { let c = drawCard(); if(c) currentHand.push(c); else break; }

        lastActionLog = `${actorName}: ${actionDesc}`;

        if (isMultiplayer) {
            myTurn = !myTurn; 
            broadcastState();
        } else {
            render();
            if (!checkWinCondition(playerBody) && !checkWinCondition(aiBody)) {
                if (!myTurn) setTimeout(aiTurn, 1000); 
            }
            else checkWin(); 
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
         lastActionLog = `${opponentName}: Descartó carta`;
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
            } else if (isPlayer && !isMultiplayer) alert("⚠️ No puedes robar nada válido");
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
             else if (isPlayer && !isMultiplayer) alert("⚠️ Trasplante imposible");
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
    
    lastActionLog = (isHost ? myPlayerName : opponentName) + ": Descartó carta";

    if(isMultiplayer) { myTurn = !myTurn; broadcastState(); }
    else { 
        render(); 
        myTurn = false;
        render();
        setTimeout(aiTurn, 1000); 
    }
}

function aiTurn() {
    if (isMultiplayer) return; 
    let played = false;
    for(let i=0; i<aiHand.length; i++) {
        let c = aiHand[i];
        if(c.type === 'organ' && !aiBody.find(o=>o.color === c.color)) {
            aiBody.push({color: c.color, vaccines:0, infected:false});
            aiHand.splice(i,1); played = true; 
            lastActionLog = `Julio: Sacó Órgano ${c.color}`;
            break;
        }
        if(c.type === 'virus') {
             let t = playerBody.find(o => (o.color === c.color || c.color === 'multicolor') && o.vaccines < 2);
             if(t) { 
                 if(t.vaccines > 0) { t.vaccines--; lastActionLog = `Julio: Quitó vacuna a ${t.color}`; }
                 else if(!t.infected) { t.infected = true; lastActionLog = `Julio: Infectó ${t.color}`; }
                 else { 
                     playerBody = playerBody.filter(o=>o!==t); discardPile.push(t);
                     lastActionLog = `Julio: Extirpó ${t.color}`;
                 }
                 aiHand.splice(i,1); played = true; discardPile.push(c);
                 break; 
             }
        }
    }
    if(!played) { 
        discardPile.push(aiHand[0]); aiHand.splice(0,1); 
        lastActionLog = "Julio: Pasó turno";
    }
    while (aiHand.length < 3) { let c = drawCard(); if(c) aiHand.push(c); }
    myTurn = true;
    render(); 
    checkWin();
}

function render() {
    document.getElementById('deck-count').innerText = deck.length;
    notify(""); 

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
        
        lastActionLog = (isHost ? myPlayerName : opponentName) + " descartó " + indices.length;

        if(isMultiplayer) { myTurn = !myTurn; broadcastState(); }
        else { 
            render(); 
            myTurn = false;
            render();
            setTimeout(aiTurn, 1000); 
        }
    }
    multiDiscardMode = false; selectedForDiscard.clear(); render();
}
