const colors = ['red', 'blue', 'green', 'yellow'];
let deck = [], discardPile = [];
// AHORA USAMOS UN ARRAY DE JUGADORES
let players = []; // { id: 'p1', name: 'Pablo', hand: [], body: [], wins: 0, isBot: false }
let myPlayerIndex = 0; // 0 para Host, 1, 2, 3 para clientes
let totalPlayers = 2; // Configurable
let selectedForDiscard = new Set(); 
let multiDiscardMode = false; 

// --- RED ---
let isMultiplayer = false;
let isHost = false;
let mqttClient = null;
let roomCode = null;
let turnIndex = 0; // De quién es el turno (0 a totalPlayers-1)
let lastActionLog = "Esperando jugadores...";
let chatMessages = [];
let isChatOpen = false;

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';

const icons = {
    organ: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M462.3 62.6C407.5 15.9 326 24.3 275.7 76.2L256 96.5l-19.7-20.3C186.1 24.3 104.5 15.9 49.7 62.6c-62.8 53.6-66.1 149.8-9.9 207.9l193.5 199.8c12.5 12.9 32.8 12.9 45.3 0l193.5-199.8c56.3-58.1 53-154.3-9.8-207.9z"/></svg>`,
    virus: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M256 0c141.4 0 256 114.6 256 256S397.4 512 256 512 0 397.4 0 256 114.6 0 256 0zM176 256c0-44.2 35.8-80 80-80s80 35.8 80 80-35.8 80-80 80-80-35.8-80-80z"/></svg>`,
    medicine: `<svg viewBox="0 0 512 512"><path fill="currentColor" d="M174.7 96.6L10.2 446.5c-13.6 31.2 9.3 65.5 43.4 65.5h316.8c34.1 0 56.9-34.3 43.4-65.5L251.3 96.6c-17-39.1-73.2-39.1-90.2 0z"/></svg>`,
    shield: `<svg viewBox="0 0 512 512"><path fill="#2980b9" d="M466.5 83.7l-192-80a48.15 48.15 0 0 0-36.9 0l-192 80C27.7 91.1 16 108.6 16 128c0 198.3 114.5 335.7 221.5 380.3 11.8 4.9 25.1 4.9 36.9 0C381.5 463.7 496 326.3 496 128c0-19.4-11.7-36.9-29.5-44.3z"/></svg>`,
    treatment: `<svg viewBox="0 0 512 512"><path fill="white" d="M256 0L32 96l32 320 192 96 192-96 32-320L256 0z"/></svg>`
};

// --- MENÚ ---
function startLocalGame() {
    if(mqttClient) { mqttClient.end(); mqttClient = null; }
    isMultiplayer = false; isHost = true;
    const name = document.getElementById('username').value || "Jugador";
    
    // Configurar Local 1v1
    totalPlayers = 2;
    players = [
        { id: 'p1', name: name, hand: [], body: [], wins: 0, isBot: false },
        { id: 'p2', name: "JULIO", hand: [], body: [], wins: 0, isBot: true }
    ];
    myPlayerIndex = 0;
    
    startGameUI();
    initGame();
}

function showMultiplayerOptions() {
    if(!document.getElementById('username').value) return alert("Pon tu nombre");
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
    renderScoreboard();
}

// --- RED MQTT (4 JUGADORES) ---
function createRoom() {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    roomCode = code;
    document.getElementById('my-code').innerText = code;
    document.getElementById('room-code-display').style.display = 'block';
    
    // Leer número de jugadores del select (necesitas añadir esto al HTML si quieres elegir, por defecto 2)
    // Para simplificar, asumiremos que el Host espera conexiones hasta llenar.
    // Vamos a preguntar cuántos jugadores:
    let num = prompt("¿Número de jugadores? (2, 3 o 4)", "2");
    totalPlayers = parseInt(num) || 2;
    if(totalPlayers < 2) totalPlayers = 2;
    if(totalPlayers > 4) totalPlayers = 4;

    isHost = true;
    isMultiplayer = true;
    const name = document.getElementById('username').value;
    
    // Inicializar Host
    players = [{ id: 'p1', name: name, hand: [], body: [], wins: 0, isBot: false }];
    myPlayerIndex = 0;
    
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
        // Suscribirse al canal de la sala
        mqttClient.subscribe(`virusgame/${roomCode}/#`, { qos: 1 }, (err) => {
            if (!err) {
                if (!isHost) {
                    // Cliente saluda
                    const name = document.getElementById('username').value;
                    sendData('JOIN_REQUEST', { name: name });
                    notify("Conectando...");
                } else {
                    notify(`Esperando jugadores (1/${totalPlayers})...`);
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
        const payload = JSON.stringify({ type: type, content: content, sender: myPlayerIndex });
        // Host publica en 'server', Clientes en 'client' (simplificado: todos al canal común, filtramos por tipo)
        mqttClient.publish(`virusgame/${roomCode}/comm`, payload);
    }
}

function handleNetworkData(data) {
    // HOST: Gestionar entradas
    if (isHost && data.type === 'JOIN_REQUEST') {
        if (players.length < totalPlayers) {
            const newId = players.length;
            players.push({ id: 'p' + (newId+1), name: data.content.name, hand: [], body: [], wins: 0, isBot: false });
            
            // Avisar a todos de la actualización de lista
            broadcastState();
            notify(`Jugadores: ${players.length}/${totalPlayers}`);
            
            if (players.length === totalPlayers) {
                setTimeout(() => initGame(), 1000);
            }
        }
    }

    // CLIENTE: Recibir estado
    if (data.type === 'STATE_UPDATE') {
        // Si soy cliente y aún no sé mi índice, busco mi nombre (protocolo simple)
        if (!isHost && myPlayerIndex === undefined) {
            // El Host envía la lista completa.
            // Para simplificar, en el STATE_UPDATE inicial el Host asigna IDs.
            // Aquí asumimos que el cliente sabe quién es por el orden o nombre.
            // MEJORA: El Host debería responder al JOIN_REQUEST con un "JOIN_ACCEPT" y el ID.
        }
        
        // Sincronizar estado completo
        players = data.content.players;
        deck = data.content.deck;
        discardPile = data.content.discard;
        turnIndex = data.content.turnIndex;
        lastActionLog = data.content.lastLog;
        
        // Identificarme (si acabo de entrar, el host me habrá añadido)
        const myName = document.getElementById('username').value;
        const me = players.findIndex(p => p.name === myName);
        if (me !== -1) myPlayerIndex = me;

        if (document.getElementById('main-menu').style.display !== 'none') {
            startGameUI();
        }
        
        render();
    }
    
    // HOST: Gestionar jugadas
    if (isHost && data.type === 'MOVE') {
        executeMove(data.content.playerIndex, data.content.cardIndex, data.content.targetIndex);
    }
    
    if (isHost && data.type === 'DISCARD') {
        executeDiscard(data.content.playerIndex, data.content.cardIndex);
    }
    
    if (data.type === 'CHAT') {
        addChatMessage(data.content.name, data.content.msg);
    }
}

// --- LÓGICA DE JUEGO MULTIJUGADOR ---

function initGame() {
    // Generar Mazo
    deck = []; discardPile = [];
    colors.forEach(c => {
        for(let i=0; i<4; i++) deck.push({color: c, type: 'organ'});
        for(let i=0; i<4; i++) deck.push({color: c, type: 'virus'});
        for(let i=0; i<4; i++) deck.push({color: c, type: 'medicine'});
    });
    ['organ', 'virus', 'medicine'].forEach(t => deck.push({color: 'multicolor', type: t}));
    ['Ladrón', 'Trasplante', 'Contagio', 'Guante de Látex', 'Error Médico'].forEach(t => deck.push({type: 'treatment', name: t}));
    deck = deck.sort(() => Math.random() - 0.5);

    // Repartir y limpiar cuerpos
    players.forEach(p => {
        p.hand = [];
        p.body = [];
        for(let i=0; i<3; i++) p.hand.push(deck.pop());
    });

    turnIndex = 0; // Empieza P1
    lastActionLog = "¡Empieza la partida!";
    
    broadcastState();
    render();
    
    // Si P1 es local y hay bots (caso local), o si es mi turno
    checkAiTurn();
}

function broadcastState() {
    if (!isHost) return;
    const cleanPlayers = JSON.parse(JSON.stringify(players)); // Copia profunda
    // Ocultar manos de otros (opcional, por ahora enviamos todo para simplificar render)
    
    sendData('STATE_UPDATE', {
        players: cleanPlayers,
        deck: deck, // Solo enviamos length visualmente
        discard: discardPile,
        turnIndex: turnIndex,
        lastLog: lastActionLog
    });
}

function checkAiTurn() {
    // Si es turno de un BOT (solo en modo local realmente)
    if (!isMultiplayer && players[turnIndex].isBot) {
        setTimeout(aiPlay, 1500);
    }
}

// --- ACCIONES LOCALES (Yo juego) ---
function playCard(cardIndex) {
    if (turnIndex !== myPlayerIndex) { notify("⛔ No es tu turno"); return; }
    
    const card = players[myPlayerIndex].hand[cardIndex];
    let targetIndex = myPlayerIndex; // Por defecto a mí mismo

    // LÓGICA DE SELECCIÓN DE OBJETIVO (2-4 Jugadores)
    
    // Medicinas: A mí mismo o a otros (raro pero posible) -> Por defecto a mí.
    // Virus: A rivales.
    if (card.type === 'virus' || card.name === 'Ladrón') {
        // Preguntar a quién atacar
        const rivals = players.map((p, i) => ({idx: i, name: p.name})).filter(x => x.idx !== myPlayerIndex);
        
        if (rivals.length === 1) {
            targetIndex = rivals[0].idx; // Solo hay un rival
        } else {
            // Menú cutre pero funcional para elegir rival
            let msg = "Elige víctima:\n";
            rivals.forEach((r, i) => msg += `${i+1}: ${r.name}\n`);
            let choice = prompt(msg, "1");
            let selection = parseInt(choice) - 1;
            if (selection >= 0 && selection < rivals.length) {
                targetIndex = rivals[selection].idx;
            } else return; // Cancelar
        }
    }

    if (isMultiplayer && !isHost) {
        sendData('MOVE', { playerIndex: myPlayerIndex, cardIndex: cardIndex, targetIndex: targetIndex });
    } else {
        executeMove(myPlayerIndex, cardIndex, targetIndex);
    }
}

function discardCard(cardIndex) {
    if (turnIndex !== myPlayerIndex) return;
    
    if (isMultiplayer && !isHost) {
        sendData('DISCARD', { playerIndex: myPlayerIndex, cardIndex: cardIndex });
    } else {
        executeDiscard(myPlayerIndex, cardIndex);
    }
}

// --- EJECUCIÓN (Host / Local) ---
function executeMove(pIdx, cIdx, tIdx) {
    const actor = players[pIdx];
    const target = players[tIdx];
    const card = actor.hand[cIdx];
    let success = false;
    let log = "";

    // LÓGICA SIMPLIFICADA PARA 4 JUGADORES
    if (card.type === 'organ') {
        if (!target.body.find(o => o.color === card.color)) {
            target.body.push({color: card.color, vaccines: 0, infected: false});
            success = true;
            log = `${actor.name} sacó ${card.color}`;
        }
    } else if (card.type === 'medicine') {
        // Buscar órgano válido en el target
        let organ = target.body.find(o => (o.color === card.color || card.color === 'multicolor') && (o.infected || o.vaccines < 2));
        if (organ) {
            if (organ.infected) { organ.infected = false; log = `${actor.name} curó a ${target.name}`; }
            else { organ.vaccines++; log = `${actor.name} vacunó a ${target.name}`; }
            success = true;
        }
    } else if (card.type === 'virus') {
        let organ = target.body.find(o => (o.color === card.color || card.color === 'multicolor') && o.vaccines < 2);
        if (organ) {
            if (organ.vaccines > 0) { organ.vaccines--; log = `${actor.name} destruyó vacuna de ${target.name}`; }
            else if (!organ.infected) { organ.infected = true; log = `${actor.name} infectó a ${target.name}`; }
            else {
                target.body = target.body.filter(o => o !== organ);
                discardPile.push({color: organ.color, type: 'organ'});
                log = `${actor.name} extirpó órgano a ${target.name}`;
            }
            success = true;
        }
    } else if (card.type === 'treatment') {
        success = applyTreatment(card.name, actor, target);
        if(success) log = `${actor.name} usó ${card.name}`;
    }

    if (success) {
        discardPile.push(card);
        actor.hand.splice(cIdx, 1);
        drawCards(actor);
        nextTurn(log);
    } else if (pIdx === myPlayerIndex) {
        alert("Jugada no válida");
    }
}

function executeDiscard(pIdx, cIdx) {
    const actor = players[pIdx];
    discardPile.push(actor.hand[cIdx]);
    actor.hand.splice(cIdx, 1);
    drawCards(actor);
    nextTurn(`${actor.name} descartó`);
}

function applyTreatment(name, actor, target) {
    if (name === 'Ladrón') {
        // Robar un órgano no vacunado ni infectado (simplificado) de un rival
        // En 4 jugadores, robamos al 'target' elegido
        if (actor === target) return false; // No robarse a sí mismo
        let stealable = target.body.find(o => o.vaccines < 2 && !actor.body.some(my => my.color === o.color));
        if (stealable) {
            target.body = target.body.filter(o => o !== stealable);
            actor.body.push(stealable);
            return true;
        }
    }
    // Implementar otros tratamientos (Trasplante, etc) es complejo en 4 players en un solo paso
    // Por ahora simplificamos: Trasplante cambia cuerpos con target
    if (name === 'Error Médico') {
        let temp = actor.body;
        actor.body = target.body;
        target.body = temp;
        return true;
    }
    return false;
}

function drawCards(player) {
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
    turnIndex = (turnIndex + 1) % totalPlayers;
    
    // Check Win
    let winner = null;
    players.forEach(p => {
        let healthy = p.body.filter(o => !o.infected && o.vaccines < 2).length;
        let immunized = p.body.filter(o => o.vaccines === 2).length;
        if ((healthy + immunized) >= 4) winner = p;
    });

    if (winner) {
        winner.wins++;
        alert(`¡${winner.name} GANA LA RONDA!`);
        initGame(); // Reiniciar
    } else {
        broadcastState();
        render();
        checkAiTurn();
    }
}

function aiPlay() {
    // IA muy tonta: Juega la primera carta que pueda o descarta
    const bot = players[turnIndex];
    let done = false;
    
    // 1. Intentar jugar órgano
    for (let i=0; i<bot.hand.length; i++) {
        let c = bot.hand[i];
        if (c.type === 'organ' && !bot.body.find(o=>o.color === c.color)) {
            executeMove(turnIndex, i, turnIndex);
            done = true; break;
        }
    }
    
    // 2. Si no, descartar
    if (!done) executeDiscard(turnIndex, 0);
}

// --- RENDER ---
function render() {
    document.getElementById('deck-count').innerText = deck.length;
    notify(lastActionLog);
    
    // 1. Renderizar Rivales
    const rivalContainer = document.getElementById('rivals-container');
    rivalContainer.innerHTML = '';
    
    // Configurar GRID según número de rivales
    const rivals = players.filter((p, i) => i !== myPlayerIndex);
    if (rivals.length === 1) rivalContainer.style.gridTemplateColumns = "1fr"; // 1 rival (1vs1)
    else rivalContainer.style.gridTemplateColumns = "1fr 1fr"; // 2 o 3 rivales
    
    rivals.forEach(p => {
        const div = document.createElement('div');
        div.className = `board-section ${turnIndex === players.indexOf(p) ? 'active-turn' : ''}`;
        div.innerHTML = `<h3>${p.name} (${p.wins}🏆)</h3><div class="body-slots" id="body-${p.id}"></div>`;
        rivalContainer.appendChild(div);
        renderBody(p.body, div.querySelector('.body-slots'));
    });

    // 2. Renderizar Mi Tablero
    const myPlayer = players[myPlayerIndex];
    if (myPlayer) {
        renderBody(myPlayer.body, document.getElementById('player-body'));
        renderHand(myPlayer.hand);
        
        const mySection = document.querySelector('.board-section:last-of-type');
        if (turnIndex === myPlayerIndex) mySection.classList.add('active-turn');
        else mySection.classList.remove('active-turn');
        
        document.querySelector('#scoreboard-area').innerHTML = 
            `<b>TURNO:</b> ${players[turnIndex].name}`;
    }
}

function renderBody(body, container) {
    container.innerHTML = '';
    body.forEach(o => {
        const card = document.createElement('div');
        card.className = `card ${o.color} ${o.infected?'virus-effect':''}`;
        card.innerHTML = `${icons.organ}<b>ÓRGANO</b>`;
        if(o.vaccines > 0) card.innerHTML += `<div class="status-row">${icons.shield.repeat(o.vaccines)}</div>`;
        if(o.infected) card.innerHTML += `<div class="status-row" style="color:red">⚠️</div>`;
        container.appendChild(card);
    });
}

function renderHand(hand) {
    const container = document.getElementById('player-hand');
    container.innerHTML = '';
    hand.forEach((c, i) => {
        const div = document.createElement('div');
        div.className = 'card-container';
        div.innerHTML = `<div class="card ${c.color||'treatment'}" onclick="playCard(${i})">
            ${icons[c.type] || icons.treatment}<b>${c.name||translations[c.type]}</b>
        </div>
        <button class="discard-btn" onclick="discardCard(${i})">🗑️</button>`;
        container.appendChild(div);
    });
}

function renderScoreboard() {
    // Simplificado en render()
}

function notify(msg) { document.getElementById('notification-bar').innerText = msg; }

// Chat (Simple)
function toggleChat() { 
    document.getElementById('chat-modal').style.display = isChatOpen ? 'none' : 'flex'; 
    isChatOpen = !isChatOpen; 
}
function sendChatMessage() {
    let input = document.getElementById('chat-input');
    let msg = input.value;
    if(msg) {
        sendData('CHAT', {name: myPlayerName, msg: msg});
        addChatMessage(myPlayerName, msg);
        input.value = '';
    }
}
function addChatMessage(name, msg) {
    let d = document.getElementById('chat-history');
    d.innerHTML += `<p><b>${name}:</b> ${msg}</p>`;
}
